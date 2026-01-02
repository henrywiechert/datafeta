# DateTime Refactor Plan

## Goal
Unify DateTime handling (UTC semantics, distinct vs timeline, display formatting) across backend SQL, local DuckDB, ingestion, filters, and charting to reduce drift and avoid recent axis/format bugs.

## Scope & Sequencing
1) Backend + Local SQL alignment (shared semantics, one map → dialect emit).  
2) Chart normalization/axes (typed DateTime values, band-safe normalization, tick formatting).  
3) Filter/ingestion UTC checks (warnings, not hard errors).  
4) Tests (dialect goldens, chart cases, filter round-trips).

_No opt-in flag; we migrate directly. UTC enforcement emits warnings (not failures)._ 

## Current Touchpoints (for reference)
- Backend: backend/services/datetime_service.py; backend/services/optimization/strategies/datetime_binning.py.
- Frontend SQL: frontend/src/services/localSqlBuilder.ts (+ tests localSqlBuilder.test.ts). 
- Ingestion: frontend/src/services/duckdbService.ts (Arrow → Date), arrowResultAdapter.ts. 
- Chart utils: frontend/src/observable-plot-generator/utils/dateFormatUtils.ts; axes X/Y components; bar/facet generators. 
- Field/datetime metadata: frontend/src/utils/datetimeUtils.ts; frontend/datetime-parts.md. 
- Filters/facets: filterTierManager.ts (hashing), facetUtils.ts (Date equality), datetime filter components (frontend/src/components/DateTime/*).

## Work Packages

### 1) Shared DateTime Semantics Module (frontend)
- Define: supported parts/modes, UTC contract, ISO weekday rule, sub-second modulo policy, derived alias naming (<field>_<part>_<mode>), display formats per resolution. 
- Provide helpers to select resolution → display format → tickFormat.
- Consumers: SQL builders (backend/local), chart normalization, filters.

### 2) Unified SQL Part Builder (backend + frontend)
- Create declarative map; emit expressions per dialect (ClickHouse, generic SQL, DuckDB WASM). 
- Replace duplicated logic in datetime_service.py and localSqlBuilder.ts. 
- Tests: golden SQL per part/mode/dialect; include sub-second modulo and ISO weekday.

### 3) Typed DateTime Value Model
- Represent timeline vs categorical values explicitly (e.g., timeline Date vs categorical string). 
- Helpers to: keep Dates for continuous scales; normalize to strings for band scales; supply tickFormat without heuristics. 
- Apply in axes (XAxes/YAxes), bar/facet generators, domain builders.

### 4) Centralized Chart Normalization/Formatting
- Single entry that, given a DateTime field/mode, returns: normalized domain, normalized data column, tickFormat, and label format. 
- Remove scattered normalization in dateFormatUtils and band fixes; reuse across chart types. 
- Ensure 2-value domains respect explicit band type.

### 5) UTC Enforcement with Warnings
- At ingestion and filter serialization, detect non-UTC or offsetful strings; emit warnings (log/DevConsole) but do not block. 
- Ensure Arrow parsing and filter hashing/serialization use the shared UTC contract.

### 6) Tests
- Dialect SQL goldens for parts/modes/dialects (backend + local). 
- Frontend render/unit tests: band Date categories, 2-value domains, sub-second parts, timeline vs distinct paths. 
- Filter serialize/hash round-trips with Date values. 
- Optimization/binning tests ensuring date_trunc usage and base-column requirements.

## Next Actions
- Stand up the shared semantics module (WP1) and wire localSqlBuilder to it (start WP2) with initial golden tests.
- Add typed value helpers and plug into axes/generators (WP3/4) once semantics is in place.
- Layer in UTC warning hooks during ingestion/filter serialization (WP5).
- Fill out test suites (WP6) as each layer lands.
