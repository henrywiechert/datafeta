# Frontend DateTime Review — Investigation Checklist

Use while executing Steps 2–10 of [SKILL.md](SKILL.md). Skip irrelevant rows and note why.
Grep examples assume `cd frontend` unless a `../backend` path is shown. Prefer workspace search tools when available.

## Map the module & consumers

```bash
rg "from '\.\./datetime'|from '\./datetime'|src/datetime" src --glob '*.{ts,tsx}' -l
rg "import .* from '.*datetime" src/components/DateTime -n
```

## UTC contract audit

- [ ] Every local-timezone API use is display-only, not feeding grouping/filtering
- [ ] Presets emit boundaries in the agreed (UTC/DB) frame, not user wall-clock
- [ ] `new Date(value)` parse drift (bare datetime = local, date-only = UTC) does not shift bins

```bash
rg "toLocaleDateString|toLocaleString|getStartOf|new Date\(|parseUTCToLocal|getCurrentDateTime" src/datetime -n
rg "Date\.now|new Date\(\)" src/datetime -n
# Who consumes preset start/end — is it sent to backend as-is?
rg "getValue|FULL_DATETIME_PRESETS|getPresetsForField" src -n
```

## Frontend ↔ backend parity (diff these)

- [ ] `DATETIME_PARTS` identical on both sides
- [ ] `TIMELINE_UNITS` identical (esp. weekday→day)
- [ ] `DISTINCT_EXTRACT_PART` identical (esp. weekday→DOW)
- [ ] `SUBSECOND_MODULO` identical (milli/micro/nano)
- [ ] alias format `<field>_<part>_<mode>` identical

```bash
rg "DATETIME_PARTS|TIMELINE_UNITS|DISTINCT_EXTRACT_PART|SUBSECOND_MODULO|buildDateTimeAlias" src/datetime/datetimeSemantics.ts -n
rg "DATETIME_PARTS|TIMELINE_UNITS|DISTINCT_EXTRACT_PART|SUBSECOND_MODULO|build_datetime_alias" ../backend/services/datetime_semantics.py -n
# Side-by-side the two source-of-truth files
sed -n '1,140p' src/datetime/datetimeSemantics.ts
sed -n '1,140p' ../backend/services/datetime_semantics.py
```

## Distinct extraction & ISO weekday

- [ ] `((dow + 6) % 7) + 1` ISO normalization applied at EVERY call site (local + backend), not just commented
- [ ] DuckDB vs ClickHouse native weekday numbering reconciled to same ISO output
- [ ] Display weekday maps 1–7 → labels with Mon=1 (not 0-indexed)

```bash
rg "DOW|dow|isodow|dayofweek|toDayOfWeek|weekday|% 7|%7" src/services/localSqlBuilder.ts src/datetime -n
rg "DOW|isodow|toDayOfWeek|weekday|% 7" ../backend/services/datetime_service.py ../backend/services/datetime_semantics.py -n
```

## Timeline binning

- [ ] `date_trunc` unit per part matches between engines
- [ ] week/month start + truncation direction agree
- [ ] timeline mode never falls through to distinct EXTRACT

```bash
rg "date_trunc|getTimelineUnit|TIMELINE_UNITS|timeline" src/services/localSqlBuilder.ts src/datetime/datetimeSemantics.ts -n
rg "date_trunc|get_timeline_unit|timeline" ../backend/services/datetime_service.py -n
```

## Sub-second modulo

- [ ] Modulo applied in distinct mode to strip seconds; not double-applied with EXTRACT
- [ ] Engine actually needs modulo (some return the part natively)

```bash
rg "SUBSECOND_MODULO|getModuloForPart|isSubSecondPart|% 1000|%1000|millisecond|microsecond|nanosecond" src/datetime src/services/localSqlBuilder.ts -n
rg "SUBSECOND_MODULO|get_modulo|millisecond|microsecond|nanosecond" ../backend/services/datetime_service.py -n
```

## Derived alias consistency

- [ ] `buildDateTimeAlias`, `getResultColumnNameForDateTime`, backend `build_datetime_alias` all emit `<field>_<part>_<mode>`
- [ ] `getResultColumnNameForDateTime` measure branch (`AGG(col)`) cannot collide with part branch
- [ ] Alias used for result-column lookup matches what the builder emits

```bash
rg "buildDateTimeAlias|getResultColumnNameForDateTime|_\$\{.*part.*\}_|_part_|_mode" src/datetime -n
rg "build_datetime_alias" ../backend/services/datetime_semantics.py -n
rg "_getDimOutputName|date_part|date_mode" src/services/queryExecutionOrchestrator.ts -n
```

## Chart band normalization & ticks

- [ ] `ISO_DATE_TIME_RE` handles date-only / offsetful strings as intended
- [ ] `toBandLabel`/`formatDateTick` tick labels free of local-vs-UTC drift
- [ ] Normalization does not mutate source rows (copy-on-write only)

```bash
rg "ISO_DATE_TIME_RE|isDateLike|toBandLabel|formatDateTick|normalizeDateTimeForBand|normalizeCategoryForChart" src/datetime -n
rg "normalizeCategoryForChart|normalizeDateTimeForBand" src -n
```

## Filter presets & parsing

- [ ] Preset `start`/`end` use DB format and intended inclusive/exclusive end
- [ ] `parseISODateTime` (no TZ convert) vs `parseUTCToLocal` (converts) used correctly by callers
- [ ] parse → format → parse stable at ms precision; `padEnd(3).substring(0,3)` no precision loss

```bash
rg "parseISODateTime|parseUTCToLocal|formatISODateTime|adjustDateTime|getStartOf|padEnd|substring" src/datetime -n
rg "parseISODateTime|parseUTCToLocal" src --glob '*.{ts,tsx}' -l
```

## Tests & verification gaps

- [ ] Existing: `dateTimeValueModel.test.ts`, `utcWarnings.test.ts`, `localSqlBuilder.test.ts`
- [ ] GAP: automated parity test (frontend `datetimeSemantics` == backend `datetime_semantics`)
- [ ] GAP: weekday-ISO test across DuckDB + backend engines
- [ ] GAP: preset boundary frame test (This Week/Month, inclusive end)
- [ ] GAP: timeline-vs-distinct selection test for each part

```bash
rg "describe|it\(|test\(" src/datetime/*.test.ts -n
ls src/datetime/*.test.ts
```
