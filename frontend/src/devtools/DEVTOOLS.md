# Devtools Module

Developer-only SQL query logging and inspection tools. **Excluded from production builds** via `process.env.NODE_ENV` checks.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                       Query Sources                                 │
│  apiService.ts (remote)  │  queryExecutionOrchestrator.ts (both)   │
└─────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼ logSqlQuery()
┌─────────────────────────────────────────────────────────────────────┐
│                      queryLog.ts (shim)                             │
│  • Production: no-op, zero overhead                                │
│  • Development: lazy-loads queryLogImpl.ts                         │
└─────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼ logSqlQueryImpl()
┌─────────────────────────────────────────────────────────────────────┐
│                    queryLogImpl.ts (impl)                           │
│  • In-memory store (max 300 entries)                               │
│  • Subscriber pattern for UI updates                               │
│  • Console.debug mirroring                                         │
│  • Lightweight SQL formatter                                        │
└─────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼ subscribeSqlLog()
┌─────────────────────────────────────────────────────────────────────┐
│                  SqlQueryViewerDialog.tsx                           │
│  • Full-screen dialog with query list                              │
│  • Filter by origin (remote/local)                                 │
│  • Search queries                                                   │
│  • SQL formatting toggle                                            │
│  • Re-run local queries via DuckDB                                 │
│  • Scratchpad for ad-hoc SQL                                       │
└─────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────┐
│                  DevSqlViewerControl.tsx                            │
│  • Terminal icon button in ChartControls                           │
│  • Lazy-loads the dialog on click                                  │
└─────────────────────────────────────────────────────────────────────┘
```

## Files

| File | Purpose | Lines |
|------|---------|-------|
| `queryLog.ts` | Production-safe shim with lazy loading | 44 |
| `queryLogImpl.ts` | In-memory log store and SQL formatter | 107 |
| `SqlQueryViewerDialog.tsx` | Full-screen query viewer UI | 428 |
| `DevSqlViewerControl.tsx` | Icon button entry point | 35 |

## Key Types

```typescript
// Origin distinguishes backend API vs. local DuckDB WASM
type SqlQueryOrigin = 'remote' | 'local';

// Event logged when a query executes
interface SqlQueryLogEvent {
  origin: SqlQueryOrigin;
  sql: string;
  label?: string;           // Human-readable label
  meta?: Record<string, any>; // e.g., { row_count, columns }
  durationMs?: number;       // Execution time
}

// Entry with ID and timestamp (internal)
interface SqlQueryLogEntry extends SqlQueryLogEvent {
  id: string;
  ts: number;
}
```

## Integration Points

### Logging Queries

```typescript
// In apiService.ts (remote queries)
import { logSqlQuery } from './devtools/queryLog';

logSqlQuery({
  origin: 'remote',
  sql: query,
  label: 'fetchData',
  durationMs: endTime - startTime,
  meta: { row_count: result.rows.length },
});

// In queryExecutionOrchestrator.ts (local DuckDB queries)
logSqlQuery({
  origin: 'local',
  sql: localSql,
  label: 'local query',
  meta: { strategy },
});
```

### Rendering the Control

```typescript
// In ChartControls.tsx
const DevSqlViewerControl = 
  process.env.NODE_ENV !== 'production'
    ? React.lazy(() => import('../../../../devtools/DevSqlViewerControl'))
    : null;

// Later in JSX:
{DevSqlViewerControl && (
  <Suspense fallback={null}>
    <DevSqlViewerControl />
  </Suspense>
)}
```

## Features

### Query List (Left Panel)
- Chronological list (newest first)
- Origin badge: `REMOTE` (blue) / `LOCAL` (green)
- Label, timestamp, duration, row count
- Click to select and view details

### Detail View (Right Panel)
- **Scratchpad**: Edit and run modified SQL against local DuckDB
- **Run locally**: Re-execute the selected local query
- **Metadata**: JSON view of query metadata
- **SQL**: Formatted or raw SQL display
- **Copy**: Copy SQL to clipboard

### Toolbar
- Filter by origin (All / Remote / Local)
- Search within SQL text
- Format toggle (pretty-print SQL)
- Clear all entries

## Production Safety

The module uses multiple layers to ensure zero production overhead:

1. **Shim pattern** (`queryLog.ts`):
   ```typescript
   export function logSqlQuery(event: SqlQueryLogEvent): void {
     if (process.env.NODE_ENV === 'production') return;  // ← eliminated by bundler
     // ...
   }
   ```

2. **Lazy loading**: Implementation only imported in development
3. **Component exclusion**: `DevSqlViewerControl` is `null` in production

## Design Notes

- **Bounded log**: Max 300 entries to prevent memory bloat
- **Fire-and-forget**: Logging never throws or blocks the main flow
- **Console mirroring**: Queries also appear in browser console (`console.debug`)
- **No external deps**: SQL formatter is a simple regex-based pretty-printer
- **Subscriber pattern**: UI updates reactively via `subscribeSqlLog()`

## Potential Improvements

| Area | Current | Improvement |
|------|---------|-------------|
| SQL Formatter | Regex-based, breaks on string literals | Consider lightweight library if needed |
| Persistence | In-memory only | Optional localStorage for session survival |
| Export | Copy only | Add "Export to .sql file" button |
| Syntax highlighting | None | Add Prism.js or similar (lazy-loaded) |
