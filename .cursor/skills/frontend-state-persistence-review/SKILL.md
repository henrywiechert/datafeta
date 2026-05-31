---
name: frontend-state-persistence-review
description: >-
  Review the frontend state persistence & serialization layer for CORRECTNESS and
  SAFETY: saved-configuration export/validate/import (configurationService.ts,
  savedConfig.ts), localStorage persistence (SheetContext), undo/redo snapshot
  cloning (UndoRedoContext), and server snapshots (snapshotApi). Use when changing
  the saved-config schema, version/migration logic, the undo/redo stacks, localStorage
  read/write, or when investigating lost state on reload, broken undo, leaked
  credentials in exports, or "can't load old config" errors.
---

# Frontend State Persistence & Serialization Review

A correctness- and safety-focused review of every place application state crosses a
serialization boundary: a JSON file the user downloads, a `localStorage` blob, an
undo/redo snapshot, or a server-stored snapshot. Bugs here are durable and
user-visible — a dropped field on reload, an undo that resurrects stale state, a
schema bump that bricks old files, or — worst — a password serialized into an exported
config. The unifying risk is that `JSON.stringify`/`JSON.parse` is **lossy and
unvalidated**: it silently drops `undefined`/functions/`Date`/`Map`/`Set`, and parsing
untrusted input yields `any`.

Focus areas, in priority order:

1. **Secret safety** — no credentials (password, API key, token) ever serialized into exports/snapshots.
2. **Round-trip fidelity** — export → import and state → snapshot → restore preserve every field, type-faithfully.
3. **Versioning & migration** — old configs load or fail cleanly; the version gate is correct.
4. **Validation of untrusted input** — imported JSON is validated at the boundary, never trusted as the typed shape.
5. **Undo/redo integrity** — clone isolation, stack bounds, two-phase commit correctness, per-sheet scoping.
6. **localStorage lifecycle** — debounce/flush, quota failures, partial-state persistence.

## Scope

In scope:
- [configurationService.ts](../../frontend/src/services/configurationService.ts) — export/validate/import/save/download.
- [savedConfig.ts](../../frontend/src/types/savedConfig.ts) — `SavedConfiguration`, `SavedConnectionMetadata`, `SnapshotMetadata`.
- [SheetContext.tsx](../../frontend/src/contexts/SheetContext.tsx) — localStorage persistence + sheet state.
- [UndoRedoContext.tsx](../../frontend/src/contexts/UndoRedoContext.tsx) — per-sheet undo/redo snapshot stacks.
- [snapshotApi.ts](../../frontend/src/services/api/snapshotApi.ts) — server snapshot CRUD.

Out of scope (defer to the named skill):
- How sheet state is consumed to run queries → **frontend-query-pipeline-review**.
- Datetime field serialization semantics (the UTC contract) → **frontend-datetime-review**.
- Backend snapshot storage/auth internals → **backend-python-review**.

## Workflow

Track progress with this checklist; mark each step as you complete it.

- [ ] 1. Map every serialization boundary and the shapes that cross it
- [ ] 2. Audit secret safety (no credentials in any serialized payload)
- [ ] 3. Audit export round-trip fidelity (every field captured, no lossy types)
- [ ] 4. Audit versioning & migration (gate + backward-compat shims)
- [ ] 5. Audit import validation (untrusted JSON validated at boundary)
- [ ] 6. Audit undo/redo clone isolation, bounds, two-phase commit, scoping
- [ ] 7. Audit localStorage lifecycle (debounce/flush, quota, partial state)
- [ ] 8. Check tests + verification gaps
- [ ] 9. Synthesize and deliver the report

Use [checklist.md](checklist.md) for concrete grep commands per step.

### Step 1 — Map the boundaries

Four boundaries, each a lossy `JSON` hop — enumerate the shape crossing each:
- **File export** — `exportConfiguration` → `SavedConfiguration` → `JSON.stringify` (`saveConfigFile`/`downloadConfigFile`).
- **File import** — `importConfiguration` → `JSON.parse` → `validateConfiguration` → `SavedConfiguration`.
- **localStorage** — `SheetContext` persists `{ sheets }` under `STORAGE_KEY`, debounced 500ms, flushed on unload.
- **Undo/redo** — `UndoRedoContext` clones `VisualizationStateSnapshot` via `JSON.parse(JSON.stringify(...))`.
- **Server snapshot** — `snapshotApi` POSTs the config body to the backend.

For each, note what the *source of truth* type is and whether the serialized form is a
strict subset (intended) or accidentally lossy.

### Step 2 — Secret safety (highest priority)

`SavedConnectionMetadata` is documented to exclude secrets ("NO password", "NO API
key"). Verify the *implementation* enforces it, not just the type:
- `sanitizeConnectionDetails` must whitelist fields, never spread the raw `ConnectionDetails` (a spread would carry `password`/`kaggle_api_key`/token through).
- Confirm no path writes the full connection object into `config.connection`, localStorage, or the snapshot body.
- Confirm Kaggle API key, ClickHouse password, and any bearer token are absent from the exported JSON and the localStorage blob.
A credential reaching any serialized payload is **Critical** (OWASP A02 — cryptographic
failure / sensitive data exposure). This is the finding the whole skill exists to catch.

### Step 3 — Export round-trip fidelity

`exportConfiguration` builds `SavedConfiguration` field-by-field with conditional
inclusion (`if (x && x.length) config.dataSource.x = x`). Risks:
- A field that is legitimately empty (`customRelationships: []` in manual mode) must be distinguishable from "absent" — confirm the `!== undefined && !== null` guard preserves empty arrays where it matters.
- `JSON.stringify` drops `undefined`, functions, and turns `Date` into an ISO string (not a `Date` on import) — confirm no field relies on a live `Date`/`Map`/`Set` surviving.
- `normalizedSheets` rewrites `globalChartType → selectedChartType` for export; confirm import reverses it (or both are read), so a saved chart type isn't lost.
- Per-sheet `measureGroupFields` (moved out of top-level) is actually inside each sheet's `visualizationState` — confirm it round-trips.

### Step 4 — Versioning & migration

`validateConfiguration` accepts any `1.x.x` (`versionMatch[1] !== '1'` rejects).
- Confirm `CURRENT_VERSION` is `1.x` and the gate's intent (accept all minor/patch within major 1) matches the schema's actual backward compatibility.
- Backward-compat shims (e.g. regenerating `fullTableName` when missing) belong here — inventory them and confirm each handles the oldest still-supported shape.
- A schema addition that an old file lacks must default safely on import, and a new file opened by old code must degrade, not crash. Flag any field added without a migration/default.

### Step 5 — Import validation of untrusted input

`importConfiguration` parses arbitrary JSON — treat it as hostile (a user could hand-edit
or paste any file).
- `validateConfiguration` checks `appName`, `version`, `sheets` array + per-sheet required keys, and `connection.type` enum. Confirm the validation depth matches what the consumers dereference: if downstream code reads `sheet.visualizationState.xFields[0].columnName`, shallow validation leaves a crash/`undefined` path.
- The function returns `config as SavedConfiguration` — a cast, not a proof. Note every place the cast outruns the actual checks.
- No prototype-pollution sink: parsed keys like `__proto__` should not be merged into live objects (check any `{...parsed}` spread into shared state).

### Step 6 — Undo/redo integrity

In `UndoRedoContext` (per-sheet stacks keyed by `sheetId`):
- **Clone isolation:** `recordAction`/`undo`/`completeUndo`/`redo` all `JSON.parse(JSON.stringify(...))`. This is correct for isolation but lossy — confirm `VisualizationStateSnapshot` holds only JSON-safe values (no `Date`/`Map`/`Set`/function); if it gains one, undo silently corrupts it.
- **Bounds:** `.slice(-MAX_HISTORY_SIZE)` (50) applied on push to both record and completeRedo — confirm both growth paths are capped.
- **Two-phase commit:** `undo()` returns a clone and sets `isPerformingUndoRedo.current = true`; `completeUndo()` mutates the stacks and resets the flag. Confirm there is no path where `undo` is called without a matching `complete*` (flag stuck true → `recordAction` no-ops forever), and that `recordAction` correctly clears `redoStack`.
- **Scoping:** stacks are per `sheetId`; `clearHistory` deletes the key. Confirm deleting/renaming a sheet doesn't strand or cross-wire stacks.

### Step 7 — localStorage lifecycle

In `SheetContext`:
- Persistence is debounced (`setTimeout(persist, 500)`) and flushed on `beforeunload`/cleanup — confirm a rapid edit-then-reload within 500ms still flushes (cleanup path runs `persist()`), so no lost state.
- Only `{ sheets }` is persisted — confirm `activeSheetId`/`nextSheetNumber` absence on reload is intentional and handled.
- `JSON.stringify` into `setItem` can throw (`QuotaExceededError`) for large sheets — confirm the try/catch degrades gracefully (logs, doesn't crash the app) and consider whether silent loss needs surfacing.
- Load-on-mount parses `localStorage` (untrusted across versions) — same Step 5 validation concern applies; confirm a corrupt/old blob doesn't crash mount.

### Step 8 — Tests & gaps

Inventory tests around `configurationService`, `UndoRedoContext`, `SheetContext`. Note
gaps: a secret-redaction test (export contains no password/api key)? a round-trip
property test (export→import equals original for all optional fields)? an old-version
fixture that must still load? an undo/redo two-phase invariant test (flag never stuck)?
a localStorage-quota-failure test?

### Step 9 — Synthesize & deliver

Produce the report below. Ground every claim in file+line. Lead with any secret-safety
finding; keep data-loss (fidelity/migration) findings separate from robustness
(validation/quota) findings.

## Output template

```markdown
# State Persistence & Serialization Review

## Summary
<2–4 sentences: secret-safety status, round-trip fidelity, biggest risk.>

## Boundary map
| Boundary | Source type | Serialized form | Lossy? | Validated on read? |
| --- | --- | --- | --- | --- |
| File export | SavedConfiguration | JSON | … | n/a |
| File import | JSON | SavedConfiguration | … | … |
| localStorage | { sheets } | JSON | … | … |
| Undo/redo | VisualizationStateSnapshot | JSON clone | … | n/a |
| Server snapshot | … | … | … | … |

## Findings
### [Critical|High|Medium|Low] <title>
- **Where:** file:line
- **What:** <the bug>
- **Why it matters:** <data loss / exposure / crash>
- **Fix:** <concrete change>

## Secret-safety audit
<every field of SavedConnectionMetadata + sanitize path, confirmed secret-free.>

## Verification gaps
<missing redaction / round-trip / old-version / undo-invariant tests.>
```

## Severity guide

- **Critical** — any credential (password, API key, token) reaches an exported file, localStorage, or snapshot body; or prototype pollution from imported JSON into live state.
- **High** — silent data loss on round-trip (a field dropped on export/import or by the lossy JSON clone); a version gate that bricks a still-supported config; an undo two-phase path that strands the `isPerformingUndoRedo` flag.
- **Medium** — shallow import validation that lets a malformed config crash a consumer; unhandled `QuotaExceededError`; empty-vs-absent ambiguity changing behavior.
- **Low** — missing backward-compat default for a cosmetic field; naming/doc drift in the schema.

## Review principles

- **Secrets never serialize.** Whitelist fields into the persisted shape; never spread a raw connection/credential object. This is the first thing to check and the costliest to miss.
- **`JSON.parse(JSON.stringify(x))` is lossy.** It drops `undefined`/functions and flattens `Date`/`Map`/`Set`. Any state that crosses it must be JSON-primitive, or the loss is the bug.
- **Imported JSON is untrusted.** A cast (`as SavedConfiguration`) is a promise, not a proof; validation must reach as deep as the consumers dereference.
- **Empty is not absent.** `[]` in manual mode carries meaning; conditional inclusion must not erase intentional emptiness.
- **Old files must load or fail loudly — never silently wrong.** Every schema change needs a default or migration.
- **Two-phase undo must always complete.** A returned clone without its matching commit leaves the flag stuck and disables history.

## Additional resources

- [configurationService.ts](../../frontend/src/services/configurationService.ts), [savedConfig.ts](../../frontend/src/types/savedConfig.ts).
- [SheetContext.tsx](../../frontend/src/contexts/SheetContext.tsx), [UndoRedoContext.tsx](../../frontend/src/contexts/UndoRedoContext.tsx).
- [checklist.md](checklist.md) — concrete grep commands per step.
- Pairs with **frontend-query-pipeline-review** (consumes the restored state) and **backend-python-review** (snapshot storage/auth).
