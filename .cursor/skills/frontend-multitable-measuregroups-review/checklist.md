# Multi-table + Measure Groups + Virtual Columns — Review Checklist

Concrete commands per workflow step. Run from repo root (`/Users/henry/projects/datafeta`).
Tag every finding with its pillar: **join | union | measureGroup | virtualColumn**.

## Step 1 — Map the pillars & FE/BE twins
- [ ] `rg -n "VirtualTableDefinition|TableJoinDefinition|UnionTableDefinition|ForeignKeyRelationship" frontend/src/types/multiTable.ts`
- [ ] `rg -n "VirtualColumnDefinition|BinnedFieldDefinition|output_type|binConfig" frontend/src/types/virtualColumn.ts`
- [ ] `rg -n "UnionQueryBuilder|VirtualColumnExpressionBuilder|virtual_table|virtual_columns" backend/services/query_service.py`

## Step 2 — Virtual columns: injection surface (HIGHEST PRIORITY)
- [ ] BE enforcing denylist: `rg -n "forbidden_keywords|_validate_expression|raise ValueError|--|/\*" backend/services/query_components/virtual_column_builder.py`
- [ ] FE client denylist (UX only): `rg -n "dangerous|forbidden|keyword|toUpperCase|validateForm" frontend/src/components/VirtualColumns/VirtualColumnEditor.tsx`
- [ ] Parser rejects statements not just keywords: `rg -n "_parse_expression|get_sql|Term" backend/services/query_components/virtual_column_builder.py`
- [ ] Confirm expression is only a projection term: `rg -n "register_virtual_column|expression" backend/services/query_service.py`
- [ ] **Verify the BE is the boundary** — is there any path that trusts the FE validation and skips `_validate_expression`?

## Step 3 — Virtual columns: FE↔BE parity + type/cast
- [ ] Local DuckDB eval path: `rg -n "virtualColumn|expression" frontend/src/contexts/VisualizationContext/reducers/virtualColumnReducer.ts`
- [ ] Cast per output_type: `rg -n "output_type|CAST|NUMERIC|BIGINT|cast" backend/services/query_components/virtual_column_builder.py`
- [ ] Dialect-specific fns (e.g. splitByString) have a DuckDB twin: `rg -n "splitByString|db_type" backend/services/query_components/virtual_column_builder.py`
- [ ] No vc-references-vc: `rg -n "references to virtual columns|not allowed" backend/services/query_components/virtual_column_builder.py`

## Step 4 — JOIN correctness (fan-out!)
- [ ] `rg -n "enforce_unique_keys|dedup_key_columns|join_type|on_conditions|relationship_type" frontend/src/types/multiTable.ts`
- [ ] BE join + dedup: `rg -n "enforce_unique|dedup|INNER|LEFT|RIGHT|FULL|join" backend/services/query_components/`
- [ ] Aggregate over join — is dedup applied before SUM/COUNT? Trace from query_service join branch.
- [ ] Dotted column names quoted in on_conditions both sides.

## Step 5 — UNION correctness
- [ ] `rg -n "UnionTableDefinition|MergedColumnsResponse|database|filter_condition|schema_hash" frontend/src/types/multiTable.ts`
- [ ] BE union builder: `rg -n "UNION|merge|NULL|cast|_source" backend/services/query_components/union/union_query_builder.py`
- [ ] Builtin source cols guarded: `rg -n "BUILTIN_UNION_VIRTUALS|_source_database|_source_table|is_union_mode" backend/services/filter_conversion_service.py`

## Step 6 — Virtual-table identity in cache key
- [ ] `rg -n "baseFilterHash|stableStringify|virtualTable|cacheKey" frontend/src/services/ frontend/src/contexts/`
- [ ] Confirm join/union/virtual-column composition feeds the hash → changing it invalidates cache. Cross-link **frontend-query-pipeline-review** Step 3.

## Step 7 — Measure Groups: compatibility + pivot
- [ ] `rg -n "getMeasureValuesAxis|measure_values_missing|onX === onY" frontend/src/viewPlanner/buildViewSpec.ts`
- [ ] `rg -n "non_measure_member|non_continuous_member|unsupported_mark_type|SUPPORTED_MEASURE_GROUP_MARK_TYPES" frontend/src/viewPlanner/buildViewSpec.ts`
- [ ] `rg -n "usesSyntheticMeasureValues|measureGroupLongForm|isMeasureValuesField|isMeasureNamesField" frontend/src/viewPlanner/`

## Step 8 — Measure Groups: domain policy + grain
- [ ] `rg -n "deriveDomainPolicy|measureGroupShared|independentDomains|independent_comparison_domain" frontend/src/viewPlanner/buildViewSpec.ts`
- [ ] `rg -n "valueAxis|comparisonAxis|comparisonFields|domainPolicy" frontend/src/viewPlanner/types.ts`
- [ ] `rg -n "queryModeForGrain|aggregated|rawRows" frontend/src/viewPlanner/buildViewSpec.ts`

## Step 9 — Tests & gaps
- [ ] `frontend/src/viewPlanner/__tests__/buildViewSpec.test.ts` — measure-group spec coverage
- [ ] `frontend/src/viewPlanner/__tests__/goldenSemantics.test.ts` — golden semantics
- [ ] Gaps to flag: VC injection-bypass test, FE↔BE VC value-parity test, JOIN fan-out/dedup aggregate test, UNION column-misalignment test, virtual-table cache-isolation test.

## Step 10 — Synthesize
- [ ] Lead with any injection finding.
- [ ] Fill the FE↔BE parity matrix.
- [ ] Tag every finding with pillar + file:line.

## Quick triage (pre-seeded leads)
- **virtualColumn**: validation is a **denylist** on both sides — denylists are bypassable; confirm BE (not FE) is enforcing and the PyPika parser rejects full statements. (OWASP A03)
- **join**: `one_to_many`/`many_to_many` without `enforce_unique_keys`/`dedup_key_columns` → aggregate inflation.
- **union**: `_source_database`/`_source_table` valid only in union mode (BUILTIN_UNION_VIRTUALS guard); column misalignment across schemas → shifted columns.
- **measureGroup**: MeasureValues must be on exactly one axis (`onX === onY` → null → error); members must be measure + continuous; never fall through to `rawRows`.
- **cache**: virtual-table composition must be part of the cache key, else wrong-shape `cache_hit`.
