# Database Switch — Implementation Spec

**Status:** Implemented  
**Scope:** ClickHouse (primary); CSV file swap uses the same validation pattern where applicable  
**Assumption:** New data source has the **same schema** (same table and column names). Mismatches are the user's responsibility; the app validates and reports, but does not remap.

---

## Problem

Users save sheet/visualization configurations and later want to swap only the data layer (different ClickHouse database, or different CSV file) while keeping all chart setup.

Today, changing the database **clears table selection** (`handleDatabaseSelect` in `useFieldOperations.ts`), forcing manual re-selection. At load time, `ConnectionRestoreDialog` allows a database override, but restore still applies the saved `selectedDatabase` from the config, which can conflict with the override.

---

## Goal

Provide an explicit **“DB switch (keep tables)”** mode at two entry points:

1. **Load time** — when restoring a saved config / snapshot  
2. **In-app** — when changing database in the metadata picker

In this mode: update the database (or CSV file), preserve table bindings and all sheet visualization state, refetch metadata, re-run queries, and show a one-shot validation summary.

---

## Non-goals

- Column or table name mapping / fuzzy matching  
- Cross-source migration (ClickHouse template → CSV template)  
- Per-sheet independent table bindings  
- Saving connection passwords  
- Auto-fixing missing columns or broken sheets  

---

## UX

### A. Load time — `ConnectionRestoreDialog`

Add a checkbox below the ClickHouse database field:

| Property | Value |
|----------|-------|
| **Label** | `Same schema — swap database only` |
| **Default** | unchecked |
| **Help text** | `Keep saved table selections and sheet layouts. Tables and columns must exist in the new database.` |

**When unchecked (default):** current restore behavior.

**When checked:**

1. Connect using user-provided credentials and **new** database (override saved `connection.database` and `dataSource.selectedDatabase`).
2. Restore sheets, session filters, virtual columns, join/union definitions, and field aliases unchanged.
3. Run `switchDatabasePreserveTables(newDatabase)` (see Core behavior).
4. Show validation summary dialog (see Validation).

For **CSV**, equivalent checkbox on the file picker step:

| Label | `Same schema — swap file only` |
| Help | `Keep saved sheet layouts. Column headers must match.` |

Behavior: connect with new file; preserve viz state; validate columns against new file schema.

### B. In-app — `CompactMetadataSelector`

Add a toggle icon on the Database dropdown row (ClickHouse only), in the action slot aligned with the Table `+` button:

| Property | Value |
|----------|-------|
| **Control** | Icon button (`SwapHoriz`), pressed when on |
| **Accessible name** | `Keep tables when changing database` |
| **Tooltip (off)** | `Keep current tables when changing database (same table names required).` |
| **Tooltip (on)** | `On: changing the database keeps current tables. Requires identical table names.` |
| **Default** | off |
| **Persistence** | session only (not saved in config); resets on disconnect |

**When off:** changing the database dropdown stages a DB for adding / UNION (does not clear the primary).

**When on:** call `switchDatabasePreserveTables(newDatabase)` instead; table add / pattern add are disabled.

**Visual feedback while switching:** spinner in the DB-row action slot; disable database/table dropdowns until refetch completes.

---

## Core behavior — `switchDatabasePreserveTables`

Single shared function used by load-time restore and in-app picker.

### Inputs

- `newDatabase: string`
- Current state: `selectedTable`, `joinedTables`, `unionTables`, `virtualTable`, `customRelationships`, all sheets

### Steps

1. **Guard:** if `selectedTable` is empty, fall back to normal database-select behavior (nothing to preserve).

2. **Update database references:**
   - Set `selectedDatabase` → `newDatabase`
   - If `connectionDetails.database` exists (ClickHouse), update it to match
   - Rewrite `unionTables[].database` → `newDatabase` for entries whose database equals the **old** `selectedDatabase`
   - Update `virtualTable` union entries similarly
   - Do **not** clear `joinedTables` (table names only; assumed same in new DB)

3. **Refetch metadata:**
   - Clear `tables` and `availableFields` caches (not selection)
   - Fetch tables for `newDatabase`
   - **Hard fail** if `selectedTable` not in table list → show error, revert database change or leave user on error state with clear message:
     > `Table "orders" not found in database "analytics_prod".`
   - For each joined table name: warn (non-blocking) if missing from new DB table list
   - Fetch columns (single table or merged columns if joins/unions active)

4. **Re-run queries:** dispatch `FORCE_QUERY_REFRESH` (or equivalent) after columns load.

5. **Validation:** run all-sheets column check (see below); show summary.

### What is preserved

| Preserved | Updated / refetched |
|-----------|---------------------|
| `selectedTable` | `selectedDatabase` |
| `joinedTables` (names) | `unionTables[].database` |
| All sheet `visualizationState` | `tables`, `availableFields` |
| Virtual columns & aliases | Join/union suggestions (background) |
| Session filters | Queries |

### Edge cases

| Case | Behavior |
|------|----------|
| Primary table missing in new DB | **Block** — error dialog, do not proceed |
| Joined table missing | **Warn** in validation summary; joins may fail at query time |
| Cross-database union (tables from multiple DBs) | **Disable** keep-tables toggle; show tooltip: `Not supported for cross-database unions` |
| User toggles keep-tables mid-switch | Ignore until current operation completes |
| Disconnect / reconnect | Toggle resets; normal restore flow |

---

## Validation — all sheets

Run once after a successful DB switch (load or in-app).

### Collect referenced column names

Union of `columnName` from all sheets' `visualizationState`:

- `xAxisFields`, `yAxisFields`
- `filterFields` (+ session filter fields if in scope)
- `colorField`, `sizeField`, `shapeField`, `labelFields`, `tooltipFields`
- `measureGroupFields`
- `facetBackgroundField`
- Virtual column **names** (not expression bodies)
- Filter configs keyed by field id → resolve to `columnName`
- Overlay configs that reference fields (if any)

Also collect table names from `joinedTables` for the join-missing check.

### Compare against

- `availableFields` after refetch (merged columns if multi-table)
- Table list for join table presence

### Summary dialog

Shown only when the check finds missing columns or joined tables. A successful check is silent.

**Title:** `Schema check`

**Issues found:**

> **2 columns missing:** `revenue_usd`, `region_code`  
> **1 joined table missing:** `dim_regions`  
> Charts using these fields may be empty. Table and column names must match in the new database.

Buttons: **OK** (dismiss; workspace stays open)

Severity: **informational only** — never block opening the workspace after a successful primary-table bind.

---

## Load / restore sequence (ClickHouse + checkbox)

```
User imports config
  → ConnectionRestoreDialog opens
  → User checks "Same schema — swap database only"
  → User changes database, enters password, Connect
  → reconnect with new connection.database
  → restore sheets + dataSource (table names, joins, unions)
  → switchDatabasePreserveTables(newDatabase)  // overrides saved selectedDatabase
  → validation summary
  → navigate to /visualize
```

When checkbox is **unchecked**, keep current `restoreConfigurationState` path (restore saved `selectedDatabase` as today).

---

## Files likely touched

| Area | File(s) |
|------|---------|
| Core switch logic | new `switchDatabasePreserveTables.ts` (or `useMetadataOperations`) |
| In-app picker | `useFieldOperations.ts`, `CompactMetadataSelector.tsx` |
| Load restore | `ConnectionRestoreDialog.tsx`, `App.tsx` (`handleConnectionRestore`, `restoreConfigurationState`) |
| Validation | new `validateSheetSchema.ts` + small dialog component |
| Connection sync | `ConnectionContext.tsx` (update `connectionDetails.database`) |

No change to `SavedConfiguration` schema required for v1.

---

## Implementation phases

| Phase | Deliverable |
|-------|-------------|
| **1** | `switchDatabasePreserveTables` + in-app keep-tables toggle |
| **2** | Load-time checkbox in `ConnectionRestoreDialog` |
| **3** | All-sheets validation summary dialog |
| **4** | Cross-DB union detection (disable keep-tables toggle) + user docs update |

---

## Future (out of scope)

- Saved “environment profiles” (dev/staging/prod)  
- Per-sheet table bindings  
- Optional column mapping UI for non-identical schemas  
- Extend same pattern to Kaggle / Hive with source-specific rules  

---

## User docs (when shipped)

Add a section to [export-import.md](./export-import.md) and [snapshots.md](./snapshots.md) describing the checkbox and same-schema assumption.
