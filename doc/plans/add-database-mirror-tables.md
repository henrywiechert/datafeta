# Prompt: Explicit DB-row actions — switch to / add a database (ClickHouse)

**Type:** implementation prompt (hand this file to an implementing agent/session)
**Status:** implemented (2026-09-22)
**Scope:** ClickHouse only — it is the only connector whose `list_databases()` returns
real databases (file/sqlite/kaggle/hf/hive all return `[]`).
**Backend:** no changes. `GET /tables?database=…` already exists
([`backend/routers/metadata.py:45`](../../backend/routers/metadata.py)).

> ⚠️ **This changes shipped behaviour**, it is not purely additive. The
> keep-tables DB-switch **mode toggle is removed** and replaced by an explicit
> action button. [`docs/saving-sharing/database-switch-spec.md`](../../docs/saving-sharing/database-switch-spec.md)
> §B documents the toggle and must be rewritten as part of this change, and the
> existing toggle tests must be **rewritten, not patched**. See Step 6.

> **Standing assumption — databases are stable.** In the target deployments the set
> of databases and the table list inside each database do not change during a
> session. So: once `dataSource.tablesCache[db]` is populated it is trusted for
> the rest of the session; there is no invalidation, no re-validation before
> applying, and no staleness handling anywhere in this feature. The existing
> Refresh-metadata button remains the only way to re-read table lists, and that is
> enough. **This assumption is what makes both buttons resolvable before the
> click** — see Step 3.

---

## Problem

### 1. Adding tables from another database is a per-table chore

In UNION mode the Data Source card adds **one table at a time**: pick DB, pick
table, press `+` ([`TableAddPicker.tsx`](../../frontend/src/components/Visualization/FieldsPanel/TableAddPicker.tsx)).
The common ClickHouse layout here is *many databases with identical schemas*
(per-tenant / per-release / per-day). A user with `prod_us.orders` +
`prod_us.events` selected who wants the same two tables from `prod_eu` must repeat
the DB→table→`+` dance once per table, and must remember what is in the current
set.

### 2. The DB row is modal, and the dropdown has two different meanings

Today the DB row carries a `⇄` **mode toggle** (`dbSwitchEnabled`). The dropdown's
meaning depends on it:

| Toggle | Selecting a database in the dropdown |
|---|---|
| off | stages the DB for add/UNION; nothing else happens |
| on | **immediately performs** a keep-tables switch ([`TableAddPicker.tsx:92-100`](../../frontend/src/components/Visualization/FieldsPanel/TableAddPicker.tsx)) |

That is the only place in the panel where changing a dropdown commits an action,
and it is inconsistent with the Table row one line below, where you stage a value
and then press a button. It also means the destructive-ish operation (rewriting
the primary DB and every union ref) is triggered by a selection rather than by a
deliberate press.

## Goal

**One consistent rule for the whole picker: dropdowns stage, buttons act.**

The DB dropdown becomes pure staging. The DB row gets two explicit action
buttons, both operating on the staged database:

- `⇄` **switch** — keep the current tables, repoint them at the staged DB
  (the existing `switchDatabasePreserveTables` behaviour, now on a button).
- `⊞` **add** — additively mirror the currently selected tables *from* the staged
  DB as UNION secondaries (new).

```
  Selected:                  After ⊞ with prod_eu staged:
    prod_us.orders  (P)        prod_us.orders    (P)
    prod_us.events  (U)        prod_us.events    (U)
                               prod_eu.orders    (U)  ← added
                               prod_eu.events    (U)  ← added

  Added 2 tables from prod_eu · 1 skipped (audit_log not in prod_eu)   [Undo]

  After ⇄ with prod_eu staged instead:
    prod_eu.orders  (P)        ← same tables, different database
    prod_eu.events  (U)
```

**Deliberateness is preserved, not reduced.** The old flow was two acts (arm the
toggle, then select); the new flow is also two acts (select, then press). No
confirmation dialog is needed for the switch.

**Decided semantics for add — mirror, not "all tables".** Adding *every* table of
a database would UNION unrelated schemas; mirroring keeps the union
schema-coherent and bounds the number of added tables by the current selection
size.

**Decided UX for add — one click, no dialog.** It applies immediately and reports
what it did inline, with an Undo that removes exactly what was just added. The
bulk-with-preview path already exists as *Add by pattern*
([`ClickHousePatternDialog.tsx`](../../frontend/src/components/Visualization/FieldsPanel/ClickHousePatternDialog.tsx));
this feature's value is that it is one click.

## Non-goals

- Adding all tables of a database regardless of current selection.
- Fuzzy / prefix table-name matching. Names must match exactly.
- Changing the **load-time** keep-tables entry point (the
  `ConnectionRestoreDialog` "Same schema — swap database only" checkbox,
  spec §A). That is a separate entry point and stays exactly as it is.
- Changing what `switchDatabasePreserveTables` *does* — only how it is invoked.
- Column-level schema validation of mirrored tables (the merged-columns request
  already surfaces schema conflicts; do not pre-validate).
- Extending this to non-ClickHouse connectors.
- Touching the backend, or adding any cache-invalidation machinery.

---

## Affected modules

| File | Change |
|---|---|
| `frontend/src/contexts/DataSourceContext/types.ts` | new `ADD_UNION_TABLES` / `REMOVE_UNION_TABLES` actions |
| `frontend/src/contexts/DataSourceContext/reducer.ts` | implement both, batched + identity-stable |
| `frontend/src/contexts/DataSourceContext/DataSourceProvider.tsx` | `addUnionTables` / `removeUnionTables` callbacks, expose on context |
| `frontend/src/contexts/DataSourceContext/hooks.ts` | expose both on `useDataSourceMultiTable` |
| `frontend/src/utils/schemaValidation.ts` | new pure `planDatabaseMirror()` + `planDatabaseSwitch()` next to `rewriteUnionTablesForDatabase` |
| `frontend/src/components/Visualization/FieldsPanel/TableAddPicker.tsx` | dropdown becomes staging-only; two action buttons; toggle removed |
| `frontend/src/components/Visualization/FieldsPanel/CompactMetadataSelector.tsx` | apply handler, inline result strip + Undo; prop rename |
| `frontend/src/pages/VisualizationPage.tsx` | drop `dbSwitchEnabled` state + its reset effect; pass `onAddUnionTables` |
| `frontend/src/components/Visualization/FieldsPanel/TableAddPicker.test.tsx` | rewrite the three toggle tests |
| `frontend/src/components/Visualization/FieldsPanel/FieldsPanel.md` | update ASCII layout + UNION-mode flow |
| `docs/saving-sharing/database-switch-spec.md` | rewrite §B (in-app entry point) |
| `docs/advanced/joins.md` | user-facing description of both buttons |

No new service module and no `useMetadataOperations` handler — see Step 3.

---

## Step 1 — Batched union-table actions (do this first)

`ADD_UNION_TABLE` is single-ref today ([`reducer.ts:117`](../../frontend/src/contexts/DataSourceContext/reducer.ts)).
Adding N tables via N dispatches is **not acceptable**: the merged-columns effect
keys on `dataSource.unionTables` identity
([`useMetadataOperations.ts:577-585`](../../frontend/src/hooks/useMetadataOperations.ts)),
so N dispatches mean N `getMergedColumns` round trips and N re-renders of the
whole Fields well.

Add:

```ts
| { type: 'ADD_UNION_TABLES'; payload: { tables: Array<{ database: string; table_name: string }> } }
| { type: 'REMOVE_UNION_TABLES'; payload: { tables: Array<{ database: string; table_name: string }> } }
```

Reducer requirements:

- Dedupe on `(database, table_name)` — same key semantics as the singular actions,
  including `database: ''` (file-style refs).
- **Return `state` unchanged (same object) when the action is a no-op.** A new
  `unionTables` array with identical contents would retrigger the merged-columns
  fetch. This also makes a double-click on either button harmless.
- Keep the singular `ADD_UNION_TABLE` / `REMOVE_UNION_TABLE` actions; do not
  rewrite their call sites in this change.

Provider: `addUnionTables(tables)` / `removeUnionTables(tables)` as `useCallback`s
with `[]` deps, added to the context value object **and** to the
`useDataSourceMultiTable` selector in `hooks.ts`.

## Step 2 — Two pure planners (unit-tested)

Both go in `frontend/src/utils/schemaValidation.ts`, directly below
`rewriteUnionTablesForDatabase` — the existing home for union-ref logic. Keep them
pure and I/O-free; they run on every render.

### `planDatabaseMirror` — what ⊞ would do

```ts
export interface DatabaseMirrorPlan {
  toAdd: UnionTableRef[];       // in source-selection order
  missing: string[];            // table names absent from the target database
  alreadyPresent: UnionTableRef[];
  droppedOverLimit: UnionTableRef[];
}

export function planDatabaseMirror(params: {
  targetDatabase: string;
  primaryDatabase: string;
  primaryTable: string;
  unionTables: UnionTableRef[];
  targetTableNames: string[];
  maxUnionTables?: number;      // default 100
}): DatabaseMirrorPlan
```

Rules, in order:

1. Source names = `[primaryTable, ...unionTables.map(t => t.table_name)]`, empties
   dropped, deduped, original order preserved.
2. A candidate `{ database: targetDatabase, table_name: name }` is
   **alreadyPresent** if it equals the primary (`targetDatabase === primaryDatabase
   && name === primaryTable`) or is already in `unionTables`. This makes
   "add the database I'm already on" a clean no-op.
3. Otherwise, if `name` is not in `targetTableNames` → **missing**.
4. Otherwise → **toAdd**, until `unionTables.length + toAdd.length` reaches
   `maxUnionTables`; the remainder goes to **droppedOverLimit**.

The limit mirrors the backend's `TableMergeService.MAX_UNION_TABLES = 100`
([`backend/services/table_merge_service.py:22`](../../backend/services/table_merge_service.py)).
Import/duplicate it as a named frontend constant with a comment pointing at the
backend value — do not inline a bare `100`.

### `planDatabaseSwitch` — whether ⇄ can succeed

```ts
export type SwitchBlocker =
  | 'no-primary-table'
  | 'same-database'
  | 'primary-table-missing'
  | 'cross-database-union';

export function planDatabaseSwitch(params: {
  targetDatabase: string;
  primaryDatabase: string;
  primaryTable: string;
  joinedTables: string[];
  unionTables: UnionTableRef[];
  targetTableNames: string[];
}): { blocker?: SwitchBlocker; missingJoinedTables: string[] }
```

- `cross-database-union` reuses the existing `hasCrossDatabaseUnion(primaryDatabase,
  unionTables)` predicate already in this file — do not reimplement it.
- `primary-table-missing` mirrors the hard failure
  `switchDatabasePreserveTables` throws *after* fetching
  (`Table "x" not found in database "y"`). Because the staged DB's table list is
  already cached and stable, we can now catch this **before** the click.
- `missingJoinedTables` is advisory only (spec §B step 3 says joined-table gaps
  warn, non-blocking). Surface it in the tooltip; do not block on it.
- The service keeps its own guard and rollback path as defence in depth — this
  planner is a UX affordance, not the safety net. Do not delete the service-side
  validation.

## Step 3 — Resolve both plans in `TableAddPicker`, synchronously

Because table lists are stable, both plans are **pure derivations of props the
picker already has** — `tablesCache`, `primaryDatabase`, `primaryTable`,
`unionTables` (add `joinedTables` as a new prop for the switch planner) — plus its
own `stagedDatabase`. No fetch-on-click, no async orchestration, no in-flight
guard:

```ts
const targetTableNames = React.useMemo(
  () => (tablesCache[stagedDatabase] ?? []).map(t => t.name),
  [tablesCache, stagedDatabase],
);
const mirrorPlan = React.useMemo(() => planDatabaseMirror({ ... }), [...]);
const switchPlan = React.useMemo(() => planDatabaseSwitch({ ... }), [...]);
```

The staged DB's table list is already fetched on DB change — `handleDatabaseChange`
calls `onLoadTablesForDatabase(nextDb)` ([`TableAddPicker.tsx:103`](../../frontend/src/components/Visualization/FieldsPanel/TableAddPicker.tsx)) —
and `isLoadingTables` ([`TableAddPicker.tsx:67-68`](../../frontend/src/components/Visualization/FieldsPanel/TableAddPicker.tsx))
already tells you when it is still in flight. Reuse both; add neither.

`handleDatabaseChange` loses its switch branch entirely and becomes staging only:
set `stagedDatabase`, clear `stagedTable`, call `onLoadTablesForDatabase`.

Consequences — all of them downstream of the stability assumption:

- Each button knows its exact outcome **before** the click, so tooltips can state
  it and each button can be precisely disabled with a specific reason.
- Both click handlers are synchronous at the picker boundary: hand the resolved
  plan upward.
- Nothing can change between resolve and apply, so the add path needs no
  re-validation and no rollback.

New / changed props:

```ts
joinedTables: string[];                                          // new (switch planner)
onAddDatabase?: (database: string, plan: DatabaseMirrorPlan) => void;   // new
onDatabaseSwitch?: (database: string) => void;                   // kept, now button-driven
isSwitchingDatabase?: boolean;                                   // kept
switchBlockedByCrossDatabaseUnion?: boolean;                     // replaces dbSwitchDisabled/Reason
// REMOVED: dbSwitchEnabled, onDbSwitchEnabledChange, dbSwitchDisabled, dbSwitchDisabledReason
```

The picker composes every disabled reason itself, so the parent passes facts, not
message strings.

## Step 4 — Layout of the two DB-row buttons

### Placement (decided — implement exactly this)

Every row in the picker is `label (44px, right-aligned, flexShrink 0)` + `gap 0.5`
+ `Autocomplete (flex: 1, minWidth: 0)` + `gap 0.5` + one 32px `actionColumnSx`
box. That shared structure is why the two dropdowns are currently the same width
and their buttons line up; **preserve it**.

The DB row needs two action slots, so the Table row gets a matching empty one:

```
        44px        flex: 1          32px  32px
       ┌────┐ ┌───────────────────┐ ┌────┐┌────┐
  DB   │ DB │ │ prod_eu         ▼ │ │ ⇄  ││ ⊞  │   ← switch / add-database
       └────┘ └───────────────────┘ └────┘└────┘
  Table│Table│ │ orders          ▼ │ │    ││ +  │   ← add-table (existing)
       └────┘ └───────────────────┘ └────┘└────┘
                                      ▲      ▲
                              switch is       rightmost column is
                              its own         consistently "add":
                              action now      ⊞ database, + table
```

- `⊞` takes the **rightmost** slot, directly above the Table row's `+`, so both
  add affordances read as one column.
- `⇄` keeps its icon and its position on the DB row but moves one slot left, into
  the inner column — and stops being a toggle. It is now a plain action button:
  no `aria-pressed`, no pressed/primary-filled styling, no persistent "mode".
- The Table row's inner slot is an empty 32px spacer (reuse `actionColumnSx` with
  no child). Do **not** widen one row's action area without the other: unequal
  action widths would make the two dropdowns different widths.
- JSX/tab order follows visual order: `⇄` then `⊞`.

### Button spec

| | `⇄` switch | `⊞` add |
|---|---|---|
| Icon | `SwapHorizIcon` (unchanged — keep the familiar glyph) | `LibraryAddIcon` (distinct from the Table row's plain `AddIcon`) |
| `aria-label` | `Switch to this database, keeping current tables` | `Add matching tables from database` |
| Size | 26×26 `IconButton`, matching both rows | same |
| Busy state | `CircularProgress size={14}` in place of the icon while `isSwitchingDatabase` | same while `isLoadingTables` |
| Enabled tooltip | `Switch to prod_eu — keeps orders, events` (+ `· events is not in prod_eu` when `missingJoinedTables` is non-empty) | `Add 2 tables from prod_eu` (pluralise; + `· 1 not in prod_eu` when skips exist) |

Disabled conditions, with the reason as the tooltip:

| Condition | `⇄` reason | `⊞` reason |
|---|---|---|
| no `stagedDatabase` | `Select a database` | `Select a database` |
| `isLoadingTables` | `Loading tables…` | `Loading tables…` |
| `isSwitchingDatabase` | (spinner) | `Database switch in progress` |
| `blocker: 'no-primary-table'` | `Select a table first` | `Select a table first` |
| `blocker: 'same-database'` | `Already using this database` | — (covered by the row below) |
| `blocker: 'primary-table-missing'` | `orders is not in prod_eu` | — |
| `blocker: 'cross-database-union'` | `Not supported for cross-database unions` | — |
| `mirrorPlan.toAdd.length === 0` | — | `prod_eu adds nothing — already selected` / `…has none of the selected tables` (pick by whether `alreadyPresent` or `missing` dominates) |

The zero-outcome disables are only correct because both plans are known and stable
before the click; do not soften them back into optimistic enabled buttons.

### The two buttons are sequenced, and that is expected

`⇄` is blocked whenever a cross-database union exists
([`VisualizationPage.tsx:338`](../../frontend/src/pages/VisualizationPage.tsx)) —
and `⊞` *creates* one. So the normal lifecycle is: switch freely while the
selection is single-database, then once you add a second database, `⇄` greys out
with `Not supported for cross-database unions` until those unions are removed.

This is pre-existing behaviour, not something this change introduces, but the old
toggle hid it (the parent silently flipped `dbSwitchEnabled` back off via an
effect). As a plain disabled button with a reason tooltip it becomes visible —
which is the point. Do not attempt to make switching work under cross-database
unions; that is out of scope.

## Step 5 — Apply, report and undo in `CompactMetadataSelector`

The add handler belongs next to `handleAddTable` and `handleApplyPatternSelection`
([`CompactMetadataSelector.tsx:215-231`](../../frontend/src/components/Visualization/FieldsPanel/CompactMetadataSelector.tsx)) —
the established home for "resolved refs → selection" logic. It is small:

```ts
const handleAddDatabase = React.useCallback((database, plan) => {
  if (plan.toAdd.length === 0) return;
  onAddUnionTables?.(plan.toAdd);          // ONE dispatch
  setLastMirror({ database, plan });        // for the strip + Undo
}, [onAddUnionTables]);
```

Add an `onAddUnionTables?: (tables: UnionTableRef[]) => void` prop and thread
`addUnionTables` / `removeUnionTables` from `VisualizationPage` (alongside the
existing `onAddUnionTable`). Mirroring never creates the primary — `⊞` is disabled
without one — so there is no first-add-becomes-primary branch here.

The switch path keeps its existing plumbing: `onDatabaseSwitch` →
`handleDatabaseSwitch` → `switchDatabasePreserveTables` → `showSchemaCheck`. Only
the trigger moves from the dropdown to the button.

**There is no app-wide toast host** — see the comment at
[`App.tsx:127`](../../frontend/src/App.tsx). Render the add summary inside the Data
Source card, between the picker and `SelectedTablesList`, styled like the existing
hive "Uploading partition files…" box in the same file (bordered `action.hover`
strip with a `caption`), or a compact `<Alert severity="info" variant="outlined">`.

- `Added 2 tables from prod_eu`.
- Append, when non-empty: `· 1 not in prod_eu (audit_log)` and
  `· 3 skipped (100-table union limit)`. Truncate long name lists and put the full
  list in a `title`/Tooltip.
- `Undo` → `removeUnionTables(lastMirror.plan.toAdd)`, one dispatch, then clear the
  strip. **Undo/redo does not cover DataSourceContext** — the reducers under
  `contexts/VisualizationContext/reducers/` never touch `unionTables`, so this
  button is the only bulk-undo path. Without it the user removes rows one at a time
  from `SelectedTablesList`.
- Clear the strip when the staged DB changes, on the next add/undo, and on unmount.
  No auto-hide timer (the card is collapsible; a timer would hide the message while
  collapsed).
- The switch keeps reporting through the existing `SchemaCheckDialog`; do not route
  it into this strip.

A "nothing to add" strip is not needed — that state is a disabled button with an
explanatory tooltip (Step 4).

## Step 6 — Retire the toggle

In `VisualizationPage`:

- Delete the `dbSwitchEnabled` / `setDbSwitchEnabled` state
  ([`:327`](../../frontend/src/pages/VisualizationPage.tsx)) and the
  `React.useEffect` at `:343-347` that force-disabled the mode when
  `dbSwitchDisabled` became true — a disabled button needs no auto-reset.
- Replace the `dbSwitchDisabled` / `dbSwitchDisabledReason` pair with a single
  `switchBlockedByCrossDatabaseUnion={hasCrossDatabaseUnion(selectedDatabase, unionTables)}`
  prop. Keep `isSwitchingDatabase`, `handleDatabaseSwitch` and the schema-check
  flow untouched.
- Stop passing `dbSwitchEnabled` / `onDbSwitchEnabledChange` through
  `CompactMetadataSelector`. Note that `CompactMetadataSelector` also uses
  `dbSwitchEnabled` to disable the **"Add by pattern"** button
  ([`:366`](../../frontend/src/components/Visualization/FieldsPanel/CompactMetadataSelector.tsx)) —
  that gate exists only because the mode made pattern-add meaningless. With the
  mode gone, **remove the gate**; pattern-add is always available.
- The Table row's `+` loses `dbSwitchEnabled` from its disabled condition and its
  mode-specific tooltip text ([`TableAddPicker.tsx:219-224`](../../frontend/src/components/Visualization/FieldsPanel/TableAddPicker.tsx)).

Grep for `dbSwitchEnabled` and `onDbSwitchEnabledChange` afterwards; there should
be zero hits outside the rewritten tests.

## Step 7 — Optional but recommended cleanup

`handleApplyPatternSelection` calls `onAddUnionTable` once per resolved table — the
same N-fetch problem Step 1 fixes. Migrate it to `onAddUnionTables` in a
**separate commit-sized edit** after the main feature is green, so a regression
there is easy to bisect. Say so explicitly in your summary if you skip it.

---

## Edge cases to get right

- **Staged DB === primary DB** → `⇄` disabled (`Already using this database`), `⊞`
  disabled (`adds nothing — already selected`). Both reasons are distinct; don't
  collapse them into one generic string.
- **Staged DB lacks the primary table** → `⇄` disabled with the name in the
  message; `⊞` may still be enabled if *other* selected tables exist there. These
  two buttons disable independently — do not gate them on a shared boolean.
- **Cross-database union present** → `⇄` disabled, `⊞` still available. Expected;
  see Step 4.
- **`listTables` failed for the staged DB** → the existing loader caches `[]` and
  sets `metadataError`, which the card's error caption already renders. Both
  planners then see an empty table list and both buttons disable with their own
  reasons. Do not add a retry path; Refresh metadata covers it.
- **The `stagedDatabase` sync effect** ([`TableAddPicker.tsx:60-63`](../../frontend/src/components/Visualization/FieldsPanel/TableAddPicker.tsx))
  resets staging to `primaryDatabase` when the primary changes. After a *switch*
  that is correct (the primary DB is now the staged one). After an *add* the
  primary does not change, so staging stays put and `⊞` correctly reports "already
  selected". Keep the effect; just verify both paths.
- **Union refs with `database: ''`** (file-style) can't occur on ClickHouse, but
  `planDatabaseMirror` is pure and should still handle them by name.
- **Row/column-count burst**: `SelectedTablesList` fires one `getRowCount` **and**
  one `listColumns` per selected table, unbounded and in parallel
  ([`SelectedTablesList.tsx:84-118`](../../frontend/src/components/Visualization/FieldsPanel/SelectedTablesList.tsx)).
  Mirroring at most doubles the selection, which is acceptable — but this is
  exactly why "add all tables in the DB" was rejected. Don't raise the cap.
- **Snapshot persistence** needs no change — `unionTables` is already saved
  (`configurationService.ts:205`). Verify a save/load round-trip keeps the mirrored
  refs rather than adding new code for it.

## Tests

Frontend only. Run just the touched suites with react-scripts (a bare
`npx jest` bypasses the CRA babel config and cannot parse the TS test files):
`cd frontend && CI=true npx react-scripts test --watchAll=false --testPathPattern=<pattern>`.
If you end up touching backend files,
run `cd backend && python -m pytest tests/ -q` with the project venv (see
`Makefile`) — do not use a system `pytest`.

- `schemaValidation.test.ts` (or new `planDatabase*.test.ts`):
  - `planDatabaseMirror`: dedupe of primary+union names; `missing`;
    `alreadyPresent` incl. the same-database no-op; limit clamp into
    `droppedOverLimit`; empty `primaryTable`; `database: ''` refs; order
    preservation.
  - `planDatabaseSwitch`: one case per `SwitchBlocker`; `missingJoinedTables`
    populated but **not** blocking; no blocker on the happy path.
- `DataSourceContext/reducer` test: `ADD_UNION_TABLES` dedupes, appends in order,
  and **returns the identical state object** for a full no-op;
  `REMOVE_UNION_TABLES` removes exactly the given refs and leaves others alone.
- `TableAddPicker.test.tsx` — **rewrite, don't patch.** The three existing tests
  assert toggle semantics (`aria-pressed`, `onDbSwitchEnabledChange`, pressed
  styling) for a control that no longer exists; delete them and replace with:
  - selecting a database does **not** call `onDatabaseSwitch` (the regression this
    whole change is about);
  - `⇄` calls `onDatabaseSwitch(stagedDatabase)` on click;
  - `⇄` disabled per blocker — one test per `SwitchBlocker`, asserting the reason
    text;
  - `⊞` calls `onAddDatabase` with the staged DB and a plan whose `toAdd` matches
    the cache;
  - `⊞` disabled with no primary table, while the staged DB's cache entry is
    missing (loading), and when the plan is empty;
  - the Table row `+` is enabled regardless of any switch state.
- `CompactMetadataSelector.test.tsx` (extend): result strip shows the added count
  and the skipped reason; `Undo` calls `removeUnionTables` with exactly the added
  refs; **one** `onAddUnionTables` call for a multi-table mirror, never N
  `onAddUnionTable` calls; "Add by pattern" is no longer gated.

## Manual verification

The backend does not hot-reload — restart it after any backend edit, and don't
trust a stale process when something "doesn't work".

1. Connect to ClickHouse, select `db_a.some_table`, add a second table from `db_a`.
2. Stage `db_b` in the DB dropdown. **Nothing should happen** — no switch, no
   refetch of columns, primary unchanged. Both buttons resolve (brief spinner) and
   their tooltips state what they would do.
3. Click `⊞`. Expect: both tables appear as `[U] db_b.…` rows; the strip reports
   `Added 2 tables from db_b`; the network tab shows **one** `merged-columns`
   request, not two.
4. `⇄` is now disabled with `Not supported for cross-database unions`.
5. Click `Undo` → the added rows disappear, one more `merged-columns` request,
   charts return to the pre-add state, and `⇄` becomes available again.
6. With a single-database selection, stage `db_b` and click `⇄` → primary and
   unions repoint to `db_b`, spinner in the inner slot during the switch, schema
   check dialog appears if anything doesn't line up.
7. Re-stage `db_a` (the primary's own DB) → both buttons disabled, each with its
   own reason.
8. Stage a DB that lacks one of the selected names → `⊞` names the skipped table
   and adds the rest; `⇄` is disabled if the *primary* table is the missing one.
9. Save a snapshot with mirrored tables, reload it, confirm the union list.

## Definition of done

- Selecting a database in the dropdown never commits anything.
- `⇄` and `⊞` each act on the staged database, and each button's
  enabled/disabled state and tooltip always match what its click would do.
- Mirror-add is one click with exactly one merged-columns refetch per add and per
  undo; Undo restores the prior selection.
- The `dbSwitchEnabled` mode is gone everywhere (grep clean), including its gate on
  "Add by pattern" and on the Table row `+`.
- No new async orchestration, service module, cache invalidation or in-flight guard
  was introduced.
- `switchDatabasePreserveTables` is unchanged, including its own validation and
  rollback.
- The rewritten `TableAddPicker` tests plus the new planner/reducer/selector tests
  pass; the rest of the `CompactMetadataSelector` and DataSourceContext suites
  still pass; `npm run lint` clean.
- Docs updated: `database-switch-spec.md` §B rewritten for the button UX (§A,
  load-time, untouched); `FieldsPanel.md` ASCII layout and UNION-mode flow;
  `docs/advanced/joins.md` describes both buttons.
- Work is left in the working tree — **do not commit**.

---

## Implementation notes (filled in after the fact)

- **`switchBlockedByCrossDatabaseUnion` was never added.** The plan had the
  parent pass that fact down, but `planDatabaseSwitch` derives it from
  `hasCrossDatabaseUnion(primaryDatabase, unionTables)` — both of which the
  picker already has. So the prop, and `VisualizationPage`'s `dbSwitchDisabled`
  computation with it, were deleted outright rather than renamed.
- **Step 7 was done**, not skipped: `handleApplyPatternSelection` now uses the
  batched `onAddUnionTables` (falling back to per-table dispatch if the batched
  setter is absent).
- `MAX_UNION_TABLES` and `UnionTableRef` are exported from `schemaValidation.ts`.
- Test totals: 24 in `schemaValidation.test.ts` (14 new), 7 new in
  `DataSourceContext/reducer.test.ts`, 17 in `TableAddPicker.test.tsx`
  (fully rewritten), 15 in `CompactMetadataSelector.test.tsx` (6 new).
  Full suite: 129 files / 1168 tests pass; `npm run lint` clean; `tsc --noEmit`
  reports no errors under `src/`.
- Not manually verified against a live ClickHouse server — see the caveat in the
  handover.

### Follow-up: removing a whole database

Added after the fact, on request — the mirror's Undo strip is transient, so there
was no way to drop a database once the strip had gone.

- `SelectedTablesList` rows gained a second remove icon (`DeleteSweep`) that
  drops every selected table of that row's database via one batched
  `REMOVE_UNION_TABLES`, behind a confirm dialog listing the tables.
- Deliberately **not** offered for the primary's own database (clearing the
  primary resets joins/unions/relationships) nor for a database contributing a
  single table (the row's own remove already does that, without a confirm).
- `CompactMetadataSelector.handleRemoveDatabase` also clears the mirror summary
  strip, since it may describe tables that just went away.
- Per-row remove `aria-label`s are now database-qualified
  (`Remove prod_eu.orders`). The bare table name stopped being unique the moment
  mirroring put the same name on several rows — a latent labelling bug this
  feature turned into the common case.
- 8 new tests in `SelectedTablesList.test.tsx` (the file did not exist before).
  Note `react-scripts` enables jest `resetMocks`, so module-mock implementations
  must be installed in `beforeEach`, not in the `jest.mock` factory.
