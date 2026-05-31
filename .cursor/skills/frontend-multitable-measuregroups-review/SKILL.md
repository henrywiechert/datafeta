---
name: frontend-multitable-measuregroups-review
description: >-
  Review the three "compound data shape" features for CORRECTNESS, SAFETY, and
  frontend↔backend PARITY: multi-table JOIN/UNION (multiTable.ts, virtual tables,
  dedup keys, FK relationships), Measure Groups / MeasureValues long-form
  (viewPlanner/buildViewSpec.ts, mark-family compatibility, shared domains), and
  virtual/calculated columns (user-supplied SQL expressions, forbidden-keyword
  validation). Use when changing join/union definitions, the view planner's measure
  group logic, virtual column expressions/validation, or when investigating fan-out
  row inflation, wrong shared-axis domains, union column mismatches, dotted-name
  breakage, or SQL injection via calculated columns.
---

# Multi-table + Measure Groups + Virtual Columns Review

A correctness-, safety-, and parity-focused review of the three features that change the
*shape* of the data before it ever reaches a chart. They are grouped because they share a
failure mode: each one constructs a derived table/column on BOTH the frontend (for cache
keying, local DuckDB execution, and UI) and the backend (PyPika SQL), and any divergence
silently produces wrong numbers.

The three pillars:

1. **Multi-table (JOIN/UNION)** — a `VirtualTableDefinition` composes a primary table with
   joined/union tables. Risks: JOIN fan-out inflating aggregates, dedup-key correctness,
   UNION column alignment, cross-database unions, and the union-only builtin columns
   (`_source_database`/`_source_table`).
2. **Measure Groups / MeasureValues** — `buildViewSpec` folds several measures into one
   long-form "mark family" sharing a value axis. Risks: shared-vs-independent domain
   policy, mark-family compatibility gating, the synthetic MeasureValues/MeasureNames
   pivot, and the `measureGroupLongForm` grain → aggregated query.
3. **Virtual columns** — user-authored SQL expressions compiled to PyPika. Risks: **SQL
   injection** (the validation is a forbidden-keyword *denylist*), expression parity
   between DuckDB and the backend dialects, type/cast handling, and no-virtual-column-
   references-virtual-column.

The unifying risk: a derived shape computed two ways (FE/BE) that disagrees, or a
user-supplied expression that escapes its denylist.

## Scope

In scope:
- [multiTable.ts](../../frontend/src/types/multiTable.ts) — join/union/FK/virtual-table types.
- [virtualColumn.ts](../../frontend/src/types/virtualColumn.ts), [virtualColumnReducer.ts](../../frontend/src/contexts/VisualizationContext/reducers/virtualColumnReducer.ts), [VirtualColumnEditor.tsx](../../frontend/src/components/VirtualColumns/VirtualColumnEditor.tsx).
- [buildViewSpec.ts](../../frontend/src/viewPlanner/buildViewSpec.ts) + [viewPlanner/types.ts](../../frontend/src/viewPlanner/types.ts) — measure-group spec, compatibility, domain policy, grain.
- Backend parity counterparts: [virtual_column_builder.py](../../backend/services/query_components/virtual_column_builder.py), [union_query_builder.py](../../backend/services/query_components/union/union_query_builder.py), join builders, [filter_conversion_service.py](../../backend/services/filter_conversion_service.py) (union builtins).
- Design docs: [doc/design/table-join-union-architecture.html](../../doc/design/table-join-union-architecture.html) and siblings.

Out of scope (defer to the named skill):
- How the composed query is routed/cached/decoded → **frontend-query-pipeline-review** (but the virtual-table identity in the cache key IS in scope here).
- Datetime-part semantics on derived columns → **frontend-datetime-review**.
- General backend dialect internals → **backend-python-review** (parity is in scope here).

Pairs with **backend-python-review**: every pillar has a backend twin, and the highest-value
findings come from diffing FE intent against BE SQL.

## Workflow

Track progress with this checklist; mark each step as you complete it.

- [ ] 1. Map the three pillars and their FE/BE twins
- [ ] 2. Virtual columns: injection surface (denylist robustness)
- [ ] 3. Virtual columns: FE↔BE expression parity + type/cast
- [ ] 4. JOIN: fan-out, dedup keys, FK relationship correctness
- [ ] 5. UNION: column alignment, cross-db, builtin source columns
- [ ] 6. Virtual-table identity in cache key & filter scoping
- [ ] 7. Measure Groups: compatibility gating + MeasureValues pivot
- [ ] 8. Measure Groups: domain policy (shared vs independent) + grain
- [ ] 9. Check tests + verification gaps
- [ ] 10. Synthesize and deliver the report

Use [checklist.md](checklist.md) for concrete grep commands per step.

### Step 1 — Map the pillars

For each pillar, identify the **definition type** (FE), the **builder** (BE), and the
**serialization** that carries it (it round-trips through `SavedConfiguration` — see
**frontend-state-persistence-review**). Note where the same construct is built twice:
virtual columns (`VirtualColumnDefinition` → `VirtualColumnExpressionBuilder`), unions
(`UnionTableDefinition` → `UnionQueryBuilder`), joins (`TableJoinDefinition` → join builder).

### Step 2 — Virtual columns: injection surface (highest priority)

User free-text SQL is the only place in the app where a user authors an expression that
becomes SQL. Both sides validate with a **forbidden-keyword denylist** ([VirtualColumnEditor.tsx](../../frontend/src/components/VirtualColumns/VirtualColumnEditor.tsx) client-side; `_validate_expression` / `forbidden_keywords` in [virtual_column_builder.py](../../backend/services/query_components/virtual_column_builder.py) server-side, blocking DDL/DML + `--`,`/*`,`*/`).
- **Denylists are bypassable by design** — confirm the *backend* is the enforcing boundary (client validation is UX only; a crafted API request bypasses the editor). A frontend-only check would be **Critical**.
- Probe the denylist for gaps: stacked queries via something other than `;`, subqueries/`SELECT`, function-based exfiltration, comment variants, unicode/whitespace evasion. Note that PyPika parsing constrains the surface — confirm the parser (`_parse_expression`) rejects statements, not just keywords.
- Confirm the expression is only ever used as a *projection term*, never interpolated into identifiers, table names, or executed standalone.
Treat any path where an unvalidated/denylist-only expression reaches `get_sql()` execution
as the top finding. (OWASP A03 — Injection.)

### Step 3 — Virtual columns: FE↔BE expression parity + type

- A virtual column may be evaluated **locally in DuckDB** (refinement/cache path) AND on the **backend** (PyPika → ClickHouse/DuckDB dialect). Confirm the *same expression string* yields the same value on both — division/integer-vs-float, NULL propagation, string functions (`splitByString` is ClickHouse-specific — what's the DuckDB equivalent?).
- `output_type` (`numeric`/`text`/`datetime`) drives casts; the backend notes DuckDB's bare `NUMERIC` cast can truncate precision (BIGINT promotion). Confirm the FE and BE agree on the cast applied for each `output_type`.
- **No virtual-column-references-virtual-column** — the backend raises on this. Confirm the FE prevents authoring such a reference (or that the BE error surfaces cleanly, not as a 500).
- Binned virtual columns (`binConfig`) — confirm bin width/edges match between FE preview and BE.

### Step 4 — JOIN correctness

In `TableJoinDefinition`:
- **Fan-out:** a `one_to_many`/`many_to_many` join multiplies rows, inflating SUM/COUNT/AVG. Confirm `enforce_unique_keys`/`dedup_key_columns` are applied where needed, and that an aggregate over a fanned-out join is either deduped or documented. This is the classic "revenue doubled after adding a join" bug.
- **`on_conditions`** are strings — confirm they're built from trusted schema metadata (column identities), not user free-text, and that dotted ClickHouse column names are quoted correctly on both sides.
- **`join_type`** (INNER/LEFT/RIGHT/FULL) — confirm NULL semantics of an outer join are handled in downstream aggregation (a LEFT join introducing NULLs must not be silently dropped or counted).
- **FK relationships** (`ForeignKeyRelationship`) drive suggested joins — confirm `relationship_type` correctly informs the fan-out/dedup decision.

### Step 5 — UNION correctness

In `UnionTableDefinition` / `UnionQueryBuilder`:
- **Column alignment:** UNION ALL requires position/type-aligned columns. Confirm the merged column set ([MergedColumnsResponse](../../frontend/src/types/multiTable.ts)) reconciles schemas (missing column → NULL? type mismatch → cast?) consistently FE and BE.
- **Builtin source columns:** `_source_database` / `_source_table` (`BUILTIN_UNION_VIRTUALS` in filter_conversion_service.py) exist only in union mode — confirm they're injected on the BE, recognized by the FE, and **filtered/skipped when not in union mode** (the guard exists; verify it).
- **Cross-database union:** `UnionTableDefinition.database` enables cross-db — confirm qualified names are built correctly and don't collide with the dotted-column convention.

### Step 6 — Virtual-table identity in cache key

A `VirtualTableDefinition` (its joins/unions/virtual columns) defines the *effective table*.
The query-pipeline cache keys on `(database, table, baseFilterHash)` — confirm the
virtual-table composition is part of that identity, so changing a join/union/virtual-column
**invalidates** the cache. If two different virtual tables can collide on the same cache key,
a `cache_hit` serves the wrong shape's data — **Critical**, and a cross-link to
**frontend-query-pipeline-review** Step 3.

### Step 7 — Measure Groups: compatibility + pivot

In `buildViewSpec` (`buildMeasureGroupCompatibility`, `getMeasureValuesAxis`):
- **MeasureValues placement:** must be on **exactly one** positional axis (`getMeasureValuesAxis` returns null if `onX === onY`) → `measure_values_missing` error. Confirm both "neither" and "both" are rejected.
- **Member validity:** every member must be `type === 'measure'` AND `flavour === 'continuous'`; mark type must be in `SUPPORTED_MEASURE_GROUP_MARK_TYPES` (bar/line/scatter/tick). Confirm a violating member produces the right `issues` code and the chart degrades rather than rendering garbage.
- **Synthetic pivot:** `usesSyntheticMeasureValues` long-form melts N measures into (MeasureNames, MeasureValues) rows → `measureGroupLongForm` grain → `aggregated` query. Confirm the melt is consistent FE (spec) and BE (the query that actually produces long-form rows), and that aggregation happens at the right grain (per measure-name group).

### Step 8 — Measure Groups: domain policy + grain

- `deriveDomainPolicy`: with a measure group, axes default to `measureGroupShared` (all members share one extent) unless `independentDomains[axis]`. Confirm "shared" actually computes one extent across all members (ties to **frontend-plot-generator-review** Step 4 measure domains) and that `independent_comparison_domain` issues are surfaced.
- `comparisonAxis` vs `valueAxis` — confirm the non-value (category/comparison) axis is derived correctly and that `comparisonFields`/`comparisonAxis` aren't swapped.
- Grain: `measureGroupLongForm` → `queryModeForGrain` → `aggregated`. Confirm a measure group never falls through to `rawRows` (which would skip aggregation and over-plot).

### Step 9 — Tests & gaps

Existing: [buildViewSpec.test.ts](../../frontend/src/viewPlanner/__tests__/buildViewSpec.test.ts),
[goldenSemantics.test.ts](../../frontend/src/viewPlanner/__tests__/goldenSemantics.test.ts)
(strong on measure-group spec). Note gaps: a virtual-column **injection** test (denylist
bypass attempt rejected by BE)? a FE↔BE virtual-column **value parity** test? a JOIN
**fan-out/dedup** aggregate test? a UNION column-misalignment test? a virtual-table
cache-key-isolation test?

### Step 10 — Synthesize & deliver

Produce the report below. Ground every claim in file+line. Lead with any injection finding;
keep parity (FE/BE disagreement) findings in their own matrix; tag every finding with its
pillar (join | union | measureGroup | virtualColumn).

## Output template

```markdown
# Multi-table + Measure Groups + Virtual Columns Review

## Summary
<2–4 sentences: injection posture, FE/BE parity status, fan-out/domain correctness, biggest risk.>

## FE↔BE parity matrix
| Pillar | Construct | Frontend | Backend | Agree? | Evidence |
| --- | --- | --- | --- | --- | --- |
| virtualColumn | expr validation | denylist (UX) | denylist (enforcing) | … | file:line |
| union | source builtins | … | … | … | … |
| measureGroup | long-form melt | … | … | … | … |

## Findings
### [Critical|High|Medium|Low] <title> (pillar: join|union|measureGroup|virtualColumn)
- **Where:** file:line
- **What:** <the bug>
- **Why it matters:** <injection / wrong numbers / fan-out>
- **Fix:** <concrete change>

## Verification gaps
<missing injection / parity / fan-out / cache-isolation tests.>
```

## Severity guide

- **Critical** — virtual-column injection (denylist-only or frontend-only enforcement; a bypass reaches `get_sql()`); a virtual-table composition not in the cache key (wrong-shape `cache_hit`); JOIN fan-out silently inflating an aggregate.
- **High** — FE↔BE expression/value divergence for a virtual column; UNION column misalignment producing wrong/shifted columns; measure-group falling through to `rawRows` (no aggregation); shared-domain policy not actually shared.
- **Medium** — outer-join NULL mishandling in aggregation; union builtin columns leaking outside union mode; compatibility issue rendering garbage instead of degrading.
- **Low** — dotted-name quoting cosmetics; doc/code drift in the design HTML; naming.

## Review principles

- **The backend is the security boundary.** Client-side expression validation is UX; a crafted API call bypasses it. Denylists are bypassable — verify the *parser* rejects statements, not just keywords.
- **Two builders, one shape.** Every join/union/virtual-column is constructed FE and BE; if they disagree, the chart is wrong. Diff intent against SQL.
- **Joins multiply; aggregates lie.** A one-to-many join without dedup inflates SUM/COUNT. Always check fan-out before trusting an aggregate over a join.
- **The virtual table IS the table.** Its composition must be part of the cache identity, or a `cache_hit` serves another shape's rows.
- **MeasureValues is a pivot, not a field.** It melts N measures into long form; the grain must aggregate per measure-name, and the shared domain must span all members.
- **Tag the pillar in every finding** so join/union/measureGroup/virtualColumn issues never blur together.

## Additional resources

- [multiTable.ts](../../frontend/src/types/multiTable.ts), [virtualColumn.ts](../../frontend/src/types/virtualColumn.ts), [buildViewSpec.ts](../../frontend/src/viewPlanner/buildViewSpec.ts).
- [doc/design/table-join-union-architecture.html](../../doc/design/table-join-union-architecture.html) + detail pages (join/union/execution/api/ui).
- [checklist.md](checklist.md) — concrete grep commands per step.
- Pairs with **backend-python-review** (FE/BE parity), **frontend-query-pipeline-review** (virtual-table cache identity), **frontend-plot-generator-review** (measure-group shared domains), **frontend-state-persistence-review** (these all serialize into SavedConfiguration).
