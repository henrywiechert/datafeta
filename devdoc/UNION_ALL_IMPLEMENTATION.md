# UNION ALL Feature Implementation - Summary

## Overview

Added UNION ALL support alongside the existing JOIN feature to combine partitioned tables with identical schemas.

## Backend Changes

### 1. Models (`backend/models/data_source.py`)
- Added `UnionTableDefinition` model for tables in UNION mode
- Extended `VirtualTableDefinition` with:
  - `mode: 'join' | 'union'` field
  - `union_tables: List[UnionTableDefinition]` field
- Added `SuggestedUnionsResponse` model

### 2. Connectors (`backend/connectors/`)
- Added `detect_similar_tables()` method to `BaseConnector`
- Implemented in `ClickHouseConnector` to find tables with identical schemas
  - Compares column names and types
  - Returns list of matching tables

### 3. Services

#### TableMergeService (`backend/services/table_merge_service.py`)
- Added `get_similar_tables()` - calls connector's detect_similar_tables()
- Added `create_union_virtual_table()` - creates VirtualTableDefinition in union mode

#### QueryService (`backend/services/query_service.py`)
- Added `_translate_union_query()` method
  - Builds individual SELECT queries for each table
  - Combines with UNION ALL
  - Wraps in subquery for ORDER BY/LIMIT if needed
- Modified `translate_to_sql()` to detect union mode and delegate to new method

### 4. API Endpoints (`backend/routers/data.py`)
- Added `GET /suggested-unions?database=X&primary_table=Y`
  - Returns tables with matching schemas
  - Similar response format to suggested-joins

## Frontend Changes

### 1. Types (`frontend/src/types.ts`)
- Added `UnionTableDefinition` interface
- Extended `VirtualTableDefinition` with union mode and union_tables fields
- Added `SuggestedUnionsResponse` interface

### 2. API Service (`frontend/src/apiService.ts`)
- Added `getSuggestedUnions(database, primaryTable)` method

### 3. Context (`frontend/src/contexts/DataSourceContext.tsx`)
- Added union state:
  - `unionTables: string[]`
  - `suggestedUnionableTables: string[]`
- Added functions:
  - `setUnionTables()`
  - `setSuggestedUnionableTables()`
  - `toggleUnionTable()`
- Reset union state when primary table changes

## How It Works

### JOIN Mode (Existing)
```
Table: orders (id, customer_id, total)
Table: customers (id, name, city)
Result: orders LEFT JOIN customers ON orders.customer_id = customers.id
Fields: orders.id, orders.total, customers.name, customers.city
```

### UNION Mode (New)
```
Table: logs_2024_01 (timestamp, event, user_id)
Table: logs_2024_02 (timestamp, event, user_id)
Table: logs_2024_03 (timestamp, event, user_id)
Result: SELECT * FROM logs_2024_01 UNION ALL SELECT * FROM logs_2024_02 UNION ALL SELECT * FROM logs_2024_03
Fields: timestamp, event, user_id (same columns, more rows)
```

## Example SQL Generated

### Input Query
```json
{
  "target_table": "logs_2024_01",
  "dimensions": [{"field": "event", "flavour": "discrete"}],
  "measures": [{"field": "user_id", "aggregation": "count_distinct", "alias": "users"}],
  "virtual_table": {
    "primary_table": "logs_2024_01",
    "mode": "union",
    "union_tables": [
      {"table_name": "logs_2024_02"},
      {"table_name": "logs_2024_03"}
    ]
  }
}
```

### Output SQL
```sql
SELECT * FROM (
  (SELECT `event`, COUNT(DISTINCT `user_id`) AS `users` FROM `db`.`logs_2024_01` GROUP BY `event`)
  UNION ALL
  (SELECT `event`, COUNT(DISTINCT `user_id`) AS `users` FROM `db`.`logs_2024_02` GROUP BY `event`)
  UNION ALL
  (SELECT `event`, COUNT(DISTINCT `user_id`) AS `users` FROM `db`.`logs_2024_03` GROUP BY `event`)
) AS union_result
ORDER BY `event` ASC
```

## Next Steps (UI Integration)

### Phase 1: Add State Management to useVisualizationState
- Add `fetchSuggestedUnions()` function
- Add useEffect to call it when table is selected
- Track `suggestedUnionableTables` and `unionTables`

### Phase 2: Create UnionTableSelector Component
- Similar to JoinTableSelector
- Different header: "Combine Similar Tables" or "Merge Partitions"
- Chip-based UI for toggling tables
- Show count of tables being combined

### Phase 3: Integrate into CompactMetadataSelector
- Add UnionTableSelector below JoinTableSelector
- Show both sections when appropriate
- Mutual exclusion: Can't use JOIN and UNION modes simultaneously

### Phase 4: Update Query Building
- Modify virtual table creation to use union mode when unionTables is populated
- Ensure mode is set correctly in QueryDescription

## Testing

### Test with Your Data
Your tables (`vector_rjio_late_pdcch_syslog_0001`, `0002`, etc.) are perfect for UNION ALL!

1. Select `vector_rjio_late_pdcch_syslog_0001`
2. Backend detects similar tables (0002, 0003, etc.)
3. UI shows: "2 similar tables found"
4. Click to add 0002 and 0003
5. Query combines all three tables
6. Result: All rows from all three tables

### Test Schema Detection
```python
# Backend will compare:
Table A columns: [timestamp, event, user_id, value]
Table B columns: [timestamp, event, user_id, value] ✓ Match!
Table C columns: [timestamp, event, user_id, status] ✗ Different
```

## Benefits

1. **Flexible**: Supports both JOIN and UNION ALL use cases
2. **Automatic**: Schema detection finds compatible tables
3. **Clean**: Separates concerns - different services for different modes
4. **Efficient**: Single query instead of multiple fetches + client-side merge

## Limitations

1. **Identical Schemas Required**: Column names AND types must match exactly
2. **ClickHouse Only**: Not implemented for CSV files
3. **No Filtering**: Can't apply different filters to different tables (yet)
4. **No Table-Specific Columns**: Can't add a "source_table" column (yet)

## Future Enhancements

1. **Source Table Column**: Add `_source_table` column to track which table each row came from
2. **Per-Table Filters**: Allow different WHERE clauses for each table
3. **Schema Mapping**: Allow combining tables with similar but not identical schemas
4. **Performance**: Consider UNION (with dedup) vs UNION ALL option
5. **UI Improvements**: Show row counts per table, preview mode

## Architecture Benefits

The dual-mode approach (JOIN + UNION) is clean because:

1. **Shared Infrastructure**: Both use VirtualTableDefinition model
2. **Mode Flag**: Simple `mode: 'join' | 'union'` discriminator
3. **Separate Logic**: Different query generation paths
4. **Independent Features**: Can be enabled/disabled independently
5. **No Conflicts**: Can't mix JOIN and UNION (enforced by mode flag)

## Code Files Modified

### Backend
- ✅ `backend/models/data_source.py`
- ✅ `backend/connectors/base.py`
- ✅ `backend/connectors/clickhouse_connector.py`
- ✅ `backend/services/table_merge_service.py`
- ✅ `backend/services/query_service.py`
- ✅ `backend/routers/data.py`

### Frontend
- ✅ `frontend/src/types.ts`
- ✅ `frontend/src/apiService.ts`
- ✅ `frontend/src/contexts/DataSourceContext.tsx`
- ⏳ `frontend/src/hooks/useVisualizationState.ts` (next)
- ⏳ `frontend/src/components/Visualization/UnionTableSelector.tsx` (new, next)
- ⏳ `frontend/src/components/Visualization/CompactMetadataSelector.tsx` (next)

## Ready to Continue!

The backend is complete and the frontend foundation is in place. Ready to add the UI components when you are!
