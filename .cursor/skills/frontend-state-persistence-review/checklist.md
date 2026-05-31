# State Persistence Review — Investigation Checklist

Use while executing Steps 2–8 of [SKILL.md](SKILL.md). Skip irrelevant rows and note why.
Grep examples assume `cd frontend`. Prefer workspace search tools when available.

## Map the boundaries

```bash
rg "JSON.stringify|JSON.parse|localStorage|setItem|getItem|structuredClone" src/services/configurationService.ts src/contexts/SheetContext.tsx src/contexts/UndoRedoContext.tsx -n
rg "exportConfiguration|importConfiguration|validateConfiguration|saveConfigFile|downloadConfigFile" src -n
rg "snapshotApi" src -l
```

## Secret safety (HIGHEST PRIORITY — expect zero leaks)

- [ ] `sanitizeConnectionDetails` whitelists fields; never spreads raw `ConnectionDetails`
- [ ] No `password`, `kaggle_api_key`, `api_key`, `token`, `secret` in any serialized payload
- [ ] `config.connection` built only from sanitized output
- [ ] localStorage blob (`{ sheets }`) carries no connection secrets
- [ ] Snapshot POST body carries no secrets

```bash
rg "password|api_key|apiKey|kaggle_api_key|token|secret|credential" src/services/configurationService.ts src/types/savedConfig.ts -n
rg "sanitizeConnectionDetails|\.\.\.connectionDetails|\.\.\.details|\.\.\.connection" src/services/configurationService.ts -n
# Confirm the sanitizer builds a fresh object, field by field
sed -n '1,110p' src/services/configurationService.ts
```

## Export round-trip fidelity

- [ ] Conditional inclusion preserves empty-but-meaningful arrays (`customRelationships: []` manual mode)
- [ ] No field relies on a live `Date`/`Map`/`Set`/function surviving `JSON.stringify`
- [ ] `globalChartType → selectedChartType` rewrite is reversed on import
- [ ] Per-sheet `measureGroupFields` (inside `visualizationState`) round-trips

```bash
rg "config.dataSource\.|!== undefined|!== null|&& .*\.length > 0|normalizedSheets|selectedChartType|globalChartType" src/services/configurationService.ts -n
rg "measureGroupFields" src/services/configurationService.ts src/types/savedConfig.ts -n
```

## Versioning & migration

- [ ] `CURRENT_VERSION` major == 1; gate `versionMatch[1] !== '1'` intent matches schema compat
- [ ] Backward-compat shims inventoried (e.g. regenerate `fullTableName` when missing)
- [ ] Each schema-added field defaults safely when absent in an old file

```bash
rg "CURRENT_VERSION|version|versionMatch|Incompatible|fullTableName|backward" src/services/configurationService.ts -n
```

## Import validation (untrusted JSON)

- [ ] Validation depth matches what consumers dereference (sheets → visualizationState → fields)
- [ ] `config as SavedConfiguration` cast not outrunning the actual checks
- [ ] No `__proto__`/prototype-pollution sink from parsed JSON spread into live state

```bash
rg "validateConfiguration|throw new Error|Array.isArray|typeof|config as SavedConfiguration|forEach" src/services/configurationService.ts -n
rg "\.\.\.parsed|\.\.\.config|\.\.\.imported|Object.assign" src -n
```

## Undo/redo integrity (UndoRedoContext.tsx)

- [ ] Clone via `JSON.parse(JSON.stringify())` — snapshot is JSON-primitive only (no Date/Map/Set/function)
- [ ] `.slice(-MAX_HISTORY_SIZE)` capped on BOTH record and completeRedo growth paths
- [ ] Every `undo()`/`redo()` has a matching `completeUndo`/`completeRedo` (flag never stuck true)
- [ ] `recordAction` clears `redoStack`; `isPerformingUndoRedo` guard prevents self-record
- [ ] Per-`sheetId` scoping; `clearHistory` deletes key; sheet delete/rename doesn't strand stacks

```bash
rg "JSON.parse\(JSON.stringify|MAX_HISTORY_SIZE|isPerformingUndoRedo|undoStack|redoStack|slice\(-|sheetId" src/contexts/UndoRedoContext.tsx -n
# Who calls undo/redo — confirm complete* always follows
rg "\.undo\(\)|\.redo\(\)|completeUndo|completeRedo|recordAction" src -n
```

## localStorage lifecycle (SheetContext.tsx)

- [ ] Debounced persist (500ms) AND flushed on unload/cleanup (no lost edit-then-reload)
- [ ] Only `{ sheets }` persisted; missing `activeSheetId`/`nextSheetNumber` on reload handled
- [ ] `setItem` wrapped in try/catch for `QuotaExceededError`; degrades, doesn't crash
- [ ] Load-on-mount parse of (untrusted/old) blob can't crash mount

```bash
rg "STORAGE_KEY|setTimeout|persist|beforeunload|setItem|getItem|QuotaExceeded|try|catch" src/contexts/SheetContext.tsx -n
```

## Tests & verification gaps

- [ ] Existing tests for `configurationService` / `SheetContext` / `UndoRedoContext`
- [ ] GAP: secret-redaction test (export/localStorage contains no password/api key)
- [ ] GAP: round-trip property test (export→import == original for all optional fields)
- [ ] GAP: old-version fixture still loads
- [ ] GAP: undo/redo two-phase invariant (flag never stuck) test
- [ ] GAP: localStorage QuotaExceededError handling test

```bash
ls src/services/*.test.ts src/contexts/*.test.tsx 2>/dev/null
rg "configurationService|UndoRedo|SheetContext" src -g '*.test.*' -l
```
