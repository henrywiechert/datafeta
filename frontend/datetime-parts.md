# DateTime parts (distinct vs timeline)

Data Slicer supports deriving **DateTime parts** (year/month/day/hour/minute/…) from a datetime column in two different modes.

## Goals

- Keep the **full datetime** as a continuous timestamp for time-series/scatter use.
- Provide **bounded-cardinality parts** for categorical/grouped views (e.g. minute 0–59).
- Provide **timeline bins** for time bucketing (e.g. one value per minute across the dataset range).
- All part computations are interpreted in **UTC**.
- **Weekday** is normalized to **ISO** (Mon=1 … Sun=7).

## Terminology

- **Base datetime**: the original datetime column, e.g. `timestamp`.
- **Part**: one of `year`, `month`, `day`, `weekday`, `hour`, `minute`, `second`, `millisecond`, `microsecond`, `nanosecond`.
- **Mode**: `distinct` or `timeline`.
- **Result column naming**: derived parts are aliased as:
  - `<field>_<date_part>_<date_mode>` (example: `timestamp_minute_timeline`)

## Distinct mode

Distinct mode extracts *only the part value* and collapses across the timeline.

- Example (minute): values are in the bounded domain `0..59`.
- Example (weekday): values are `1..7` (Mon..Sun).

Conceptually:

```sql
EXTRACT(MINUTE FROM timestamp_utc)         -- 0..59
((EXTRACT(DOW FROM timestamp_utc) + 6) % 7) + 1  -- ISO weekday 1..7
```

Use this when you want categorical groupings like “hour of day” or “weekday”.

## Timeline mode

Timeline mode produces a **binned timestamp** (a real datetime) at the selected resolution.

- Example (minute): each row maps to the start of its minute bucket; the same minute-of-hour (e.g. “:23”) can occur many times across different hours/days.
- Example (day): start-of-day bins.

Conceptually:

```sql
date_trunc('minute', timestamp_utc)  -- binned timestamps across the dataset range
```

Use this when you want time bucketing like “per-minute” / “per-hour” series.

## Local vs remote execution

- **Remote** (backend SQL) and **local** (DuckDB WASM) both follow the same semantics above.
- For local execution, we cache the **base datetime column** and compute parts/bins inside DuckDB, so derived columns do not need to be present in the cache.


