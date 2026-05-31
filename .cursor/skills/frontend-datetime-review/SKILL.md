---
name: frontend-datetime-review
description: >-
  Review the frontend temporal/datetime subsystem (frontend/src/datetime/) for
  CORRECTNESS of date part extraction, timeline binning, the UTC contract,
  ISO-weekday normalization, sub-second handling, derived-alias naming, chart
  tick formatting, and filter presets — and for PARITY with the backend datetime
  semantics. Use when changing anything under src/datetime/, src/components/DateTime/,
  the backend datetime_semantics/datetime_service, or when investigating wrong/shifted
  dates, off-by-one weekdays, timezone drift, or distinct-vs-timeline grouping bugs.
---

# Frontend DateTime / Temporal Semantics Review

A correctness-first review of the datetime subsystem. Temporal bugs are silent: a
chart still renders, but the values are shifted by a timezone, the weekday is off by
one, or a "distinct hour" silently bins as a timeline. This skill exists to catch
those before they ship.

Focus areas, in priority order:

1. **UTC contract** — derived parts/bins are UTC; only *display* may be local, and only intentionally.
2. **Frontend↔backend parity** — `datetimeSemantics.ts` must agree with `datetime_semantics.py` / `datetime_service.py`.
3. **Part extraction & weekday** — DISTINCT EXTRACT + ISO weekday normalization `((dow + 6) % 7) + 1`.
4. **Timeline binning** — `date_trunc` units and bucket boundaries.
5. **Sub-second parts** — modulo handling for milli/micro/nanosecond.
6. **Derived alias naming** — `<field>_<part>_<mode>` produced identically everywhere.
7. **Chart normalization & ticks** — band-scale date detection and tick formatting without drift.
8. **Filter presets & parsing** — preset boundaries and parse/format round-trips.

## Scope

In scope:
- `frontend/src/datetime/` — all modules and their tests.
- `frontend/src/components/DateTime/` — filter/part-menu UI that consumes the semantics.
- The local SQL path that materializes parts: `buildDuckDbDateTimePartSelectItem` in [localSqlBuilder.ts](../../frontend/src/services/localSqlBuilder.ts).
- The backend parity counterparts: [datetime_semantics.py](../../backend/services/datetime_semantics.py), [datetime_service.py](../../backend/services/datetime_service.py).

Out of scope (defer to the named skill):
- Routing/cache/Arrow plumbing → **frontend-query-pipeline-review**.
- General architecture / module boundaries → **frontend-architecture-review**.
- Backend dialect internals beyond datetime parity → **backend-python-review**.

This skill pairs with **backend-python-review**: the two semantics files are a mirror,
and the most valuable findings come from diffing them.

## Workflow

Track progress with this checklist; mark each step as you complete it.

- [ ] 1. Map the datetime module and its consumers
- [ ] 2. Audit the UTC contract (derive in UTC, display optionally local)
- [ ] 3. Diff frontend vs backend semantics tables
- [ ] 4. Verify distinct-part extraction + ISO weekday normalization
- [ ] 5. Verify timeline `date_trunc` units and boundaries
- [ ] 6. Verify sub-second modulo handling
- [ ] 7. Verify derived alias `<field>_<part>_<mode>` consistency
- [ ] 8. Audit chart band normalization & tick formatting for drift
- [ ] 9. Audit filter presets and parse/format round-trips
- [ ] 10. Check tests + verification gaps
- [ ] 11. Synthesize and deliver the report

Use [checklist.md](checklist.md) for the concrete grep commands per step.

### Step 1 — Map the module and consumers

Read [DATETIME.md](../../frontend/src/datetime/DATETIME.md) and [index.ts](../../frontend/src/datetime/index.ts),
then enumerate who imports from `../datetime`. Distinguish three planes:
- **Semantics** (`datetimeSemantics.ts`) — the source of truth used by SQL builders.
- **Display** (`datetimeUtils`, `datetimeFormatUtils`, `dateTimeValueModel`, `chartDateTimeNormalizer`) — user-facing strings/ticks.
- **Detection** (`utcWarnings`) — non-UTC warnings.

A finding template: any module on the *semantics/SQL* plane that reaches for a
local-timezone API is suspect.

### Step 2 — UTC contract

The contract (`UTC_SEMANTICS_NOTE`): all parts are derived in UTC; weekday is ISO.
Reconcile that against the local-timezone APIs that legitimately exist for display:
- `formatDateForDisplay` uses `toLocaleDateString()` — local, display-only. OK *iff* never fed back into grouping/filtering.
- `parseUTCToLocal` appends `Z` then converts to browser TZ — display-only by name.
- `datetimePresets` build boundaries from local `new Date()` / `getStartOf` — confirm the produced strings are sent to the backend in the agreed (UTC) frame, not the user's local wall-clock.
- `dateTimeValueModel` parses with `new Date(value)` — for a bare `YYYY-MM-DD HH:mm` string (no `Z`), JS parses *local*; for date-only it parses *UTC*. This inconsistency can shift tick labels by the local offset.

For each, classify: **intended display localization** vs **accidental drift that changes a value/bin/boundary**. Only the latter is a finding.

### Step 3 — Frontend ↔ backend parity

Diff these tables/functions field-by-field:

| Concept | Frontend (`datetimeSemantics.ts`) | Backend (`datetime_semantics.py`) |
| --- | --- | --- |
| Parts list | `DATETIME_PARTS` | `DATETIME_PARTS` |
| Modes | `DATETIME_MODES` | (modes) |
| Timeline units | `TIMELINE_UNITS` | `TIMELINE_UNITS` |
| Distinct extract | `DISTINCT_EXTRACT_PART` | `DISTINCT_EXTRACT_PART` |
| Sub-second modulo | `SUBSECOND_MODULO` | `SUBSECOND_MODULO` |
| Alias format | `buildDateTimeAlias` | `build_datetime_alias` |

Any divergence (a part present on one side, a different `date_trunc` unit, a different
modulo, a different alias separator) is **Critical** — it makes a `cache_hit` or a
local-vs-backend result silently disagree.

### Step 4 — Distinct extraction & ISO weekday

`DISTINCT_EXTRACT_PART.weekday = 'DOW'` with the documented caller normalization
`((dow + 6) % 7) + 1` to ISO (Mon=1..Sun=7). Verify:
- The normalization is actually applied at every call site (local DuckDB builder AND backend), not just documented in a comment.
- ClickHouse vs DuckDB native weekday numbering is reconciled to the same ISO output (e.g. DuckDB `dayofweek` Sun=0 vs ISO).
- `display weekday` (`'dddd'`) maps the 1–7 value to the correct label (Mon=1), not 0-indexed.

### Step 5 — Timeline binning

`TIMELINE_UNITS` maps each part to a `date_trunc` unit; `weekday → 'day'` (bins at day
resolution). Verify bucket boundaries match between engines (week/month start, truncation
direction) and that timeline mode never falls through to a distinct EXTRACT.

### Step 6 — Sub-second modulo

`SUBSECOND_MODULO` = {milli:1000, micro:1e6, nano:1e9}, `isSubSecondPart`,
`getModuloForPart`. Verify the modulo is applied in *distinct* mode to strip the seconds
component, that it isn't double-applied with EXTRACT, and that the engine's native
sub-second extraction semantics actually need it (some engines already return the part).

### Step 7 — Derived alias consistency

Three producers must agree on `<field>_<part>_<mode>`:
- `buildDateTimeAlias(field, part, mode)` (semantics).
- `getResultColumnNameForDateTime(field)` (utils) — note it has a *measure* branch returning `AGG(col)`; confirm it doesn't collide with the part branch.
- backend `build_datetime_alias`.
A mismatch here breaks result-column lookup and the pipeline's `cache_hit` keying.

### Step 8 — Chart band normalization & ticks

In `dateTimeValueModel` / `chartDateTimeNormalizer`:
- `ISO_DATE_TIME_RE` only matches `T`/space-separated datetimes — confirm date-only and offsetful strings are handled as intended.
- `toBandLabel` → `formatDateTick(new Date(value))`: re-examine the local-vs-UTC parse drift from Step 2 for tick labels.
- Normalization copies rows only when needed — confirm it doesn't mutate source rows.

### Step 9 — Filter presets & parsing

- Presets (`FULL_DATETIME_PRESETS`, part-aware presets) produce `start`/`end` in DB format `"YYYY-MM-DD HH:mm:ss.SSS"`; confirm inclusive/exclusive end and that "This Week/Month" boundaries use the intended frame.
- `parseISODateTime` strips `Z`/offset WITHOUT converting (documented) — ensure callers that need conversion use `parseUTCToLocal` instead.
- Round-trip: parse → format → parse is stable at millisecond precision; sub-second padding/truncation (`padEnd(3).substring(0,3)`) doesn't lose precision the rest of the system relies on.

### Step 10 — Tests & gaps

Existing tests: [dateTimeValueModel.test.ts](../../frontend/src/datetime/dateTimeValueModel.test.ts),
[utcWarnings.test.ts](../../frontend/src/datetime/utcWarnings.test.ts),
[localSqlBuilder.test.ts](../../frontend/src/services/localSqlBuilder.test.ts).
Note gaps: is there an automated test asserting frontend `datetimeSemantics` equals
backend `datetime_semantics` (parity)? A weekday-ISO test across both engines? A
preset-boundary test?

### Step 11 — Synthesize & deliver

Produce the report below. Ground every claim in a file+line. Separate confirmed bugs
from "intended display localization" so the user can trust the severities.

## Output template

```markdown
# DateTime / Temporal Review

## Summary
<2–4 sentences: overall correctness posture, biggest risk, parity status.>

## Parity matrix (frontend vs backend)
| Concept | Frontend | Backend | Agree? | Evidence |
| --- | --- | --- | --- | --- |
| Parts | … | … | ✅/❌ | file:line |
| Timeline units | … | … | … | … |
| Distinct extract | … | … | … | … |
| Sub-second modulo | … | … | … | … |
| Alias format | … | … | … | … |

## Findings
### [Critical|High|Medium|Low] <title>
- **Where:** file:line
- **What:** <the incorrect behavior>
- **Why it matters:** <user-visible/data impact>
- **Fix:** <concrete change>

## UTC contract audit
<table of local-timezone API uses, each classified: intended display vs drift bug.>

## Verification gaps
<missing parity/weekday/preset tests.>
```

## Severity guide

- **Critical** — frontend/backend semantics disagree (different unit/modulo/alias/part), or a derived **bin/part** is computed in local time → wrong aggregation buckets, wrong `cache_hit`.
- **High** — weekday off-by-one (ISO normalization missing at a call site); timeline mode falling through to distinct (or vice-versa); preset boundary in the wrong frame.
- **Medium** — tick-label timezone drift on display; precision loss in sub-second round-trip; row mutation during normalization.
- **Low** — display-string inconsistencies, naming, doc/code drift in DATETIME.md.

## Review principles

- **Derive in UTC, display however — but never the reverse.** A local-time value that re-enters grouping or filtering is a bug, not a preference.
- **Trust the mirror, then diff it.** The two semantics files are meant to be identical; treat any divergence as the prime suspect.
- **A comment is not an implementation.** "caller applies ISO normalization" must be verified at each call site, not assumed.
- **Off-by-one is the default failure mode.** Weekday indexing, week start, inclusive/exclusive end — check the boundary, not the middle.
- **Ground every claim in file+line, and separate intent from accident** so the severities are trustworthy.

## Additional resources

- [DATETIME.md](../../frontend/src/datetime/DATETIME.md) — module overview (verify against code).
- [datetime-parts.md](../../frontend/datetime-parts.md) — parts/modes design notes.
- [checklist.md](checklist.md) — concrete grep commands per step.
- Pairs with **backend-python-review** (parity) and **frontend-query-pipeline-review** (alias/cache keying).
