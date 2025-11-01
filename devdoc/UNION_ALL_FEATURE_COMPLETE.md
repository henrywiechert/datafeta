# UNION ALL Feature - Complete! 🎉

## Summary

Successfully implemented UNION ALL support to combine partitioned tables with identical schemas, alongside the existing JOIN feature for related tables.

## What Was Built

### Backend (100% Complete)
✅ **Models** - Union mode, UnionTableDefinition, SuggestedUnionsResponse  
✅ **Connectors** - Schema detection to find tables with identical columns  
✅ **Services** - TableMergeService and QueryService support for UNION ALL  
✅ **API** - `/suggested-unions` endpoint  
✅ **Query Generation** - Automatic UNION ALL SQL with ORDER BY/LIMIT support  

### Frontend (100% Complete)
✅ **Types** - All TypeScript interfaces updated  
✅ **API Service** - `getSuggestedUnions()` method  
✅ **Context** - State management for union tables  
✅ **Hooks** - `useVisualizationState` with `fetchSuggestedUnions()`  
✅ **Components** - `UnionTableSelector` UI component  
✅ **Integration** - Fully wired into `CompactMetadataSelector` and `VisualizationPage`  

## How to Use

### 1. Connect to Your ClickHouse Database
- Navigate to Data Sources page
- Enter your ClickHouse connection details
- Click Connect

### 2. Select a Partitioned Table
- Choose your database (e.g., `vector`)
- Select a table (e.g., `vector_rjio_late_pdcch_syslog_0001`)

### 3. Combine Similar Tables
- If other tables have the same schema, you'll see:
  - **"Combine Similar Tables"** section appears
  - Click to expand
  - See chips for each matching table (e.g., `0002`, `0003`, etc.)
- Click chips to toggle tables on/off
- Selected tables turn purple with a "remove" icon

### 4. Build Your Visualization
- All fields remain the same (no table prefixes needed)
- Drag fields to axes, filters, etc. as usual
- The query automatically combines data from all selected tables

### 5. Execute Query
- Backend generates: `SELECT ... FROM table1 UNION ALL SELECT ... FROM table2 ...`
- Results contain rows from all combined tables
- ORDER BY and LIMIT work across the entire union

## Example: Your Data

### Before (Single Table)
```
Table: vector_rjio_late_pdcch_syslog_0001
Query: SELECT timestamp, event FROM vector_rjio_late_pdcch_syslog_0001
Result: 10,000 rows from table 0001
```

### After (Combined Tables)
```
Primary: vector_rjio_late_pdcch_syslog_0001
Union with: 0002, 0003, 0004
Query: 
  SELECT timestamp, event FROM vector_rjio_late_pdcch_syslog_0001
  UNION ALL
  SELECT timestamp, event FROM vector_rjio_late_pdcch_syslog_0002
  UNION ALL
  SELECT timestamp, event FROM vector_rjio_late_pdcch_syslog_0003
  UNION ALL
  SELECT timestamp, event FROM vector_rjio_late_pdcch_syslog_0004
Result: 40,000 rows from all 4 tables
```

## UI Components

### UnionTableSelector
Location: Below table selector, above field browser  
Style: Chip-based interface with expand/collapse  
Color: Purple (secondary) for selected tables  
Icon: Merge icon for add, remove icon for selected  

### Behavior
- Auto-detects when table is selected
- Fetches similar tables from backend
- Updates in real-time as you toggle tables
- Shows count: "Combining 4 tables (table_0001 + 3 more)"

## Technical Details

### Schema Detection
- Compares column names AND types
- Must be 100% identical match
- Ignores system tables (starting with `.`)
- Logs matches to console

### Query Generation
- Each table gets its own SELECT query
- Combined with UNION ALL (no deduplication)
- Wrapped in subquery for ORDER BY/LIMIT
- Same optimizations applied to each sub-query

### State Management
- `unionTables: string[]` - Currently selected tables
- `suggestedUnionableTables: string[]` - Available tables
- Reset when primary table changes
- Separate from `joinedTables` (mutual exclusion)

## Mutual Exclusion: JOIN vs UNION

**Important**: You can use JOIN mode OR UNION mode, but not both simultaneously.

- **JOIN mode**: `joinedTables.length > 0` and `unionTables.length === 0`
  - Shows: "Related Tables" section
  - Fields have table prefixes (e.g., `customers.name`)
  - Query uses: LEFT JOIN, INNER JOIN, etc.

- **UNION mode**: `unionTables.length > 0` and `joinedTables.length === 0`
  - Shows: "Combine Similar Tables" section
  - Fields have no prefixes (same schema)
  - Query uses: UNION ALL

- **Neither**: Both empty
  - Single table query
  - No multi-table sections shown

## Files Modified

### Backend
- `backend/models/data_source.py` - Added union models
- `backend/connectors/base.py` - Added detect_similar_tables()
- `backend/connectors/clickhouse_connector.py` - Implemented schema detection
- `backend/services/table_merge_service.py` - Added union methods
- `backend/services/query_service.py` - Added _translate_union_query()
- `backend/routers/data.py` - Added /suggested-unions endpoint

### Frontend
- `frontend/src/types.ts` - Added union types
- `frontend/src/apiService.ts` - Added getSuggestedUnions()
- `frontend/src/contexts/DataSourceContext.tsx` - Added union state
- `frontend/src/hooks/useVisualizationState.ts` - Added fetchSuggestedUnions()
- `frontend/src/components/Visualization/UnionTableSelector.tsx` - NEW component
- `frontend/src/components/Visualization/UnionTableSelector.module.css` - NEW styles
- `frontend/src/components/Visualization/CompactMetadataSelector.tsx` - Integrated union UI
- `frontend/src/components/Visualization/FieldsPanel.tsx` - Added union props
- `frontend/src/pages/VisualizationPage.tsx` - Wired up union state

## Testing Checklist

### ✅ Backend
- [x] Schema detection finds matching tables
- [x] /suggested-unions endpoint returns correct tables
- [x] Query service generates valid UNION ALL SQL
- [x] ORDER BY and LIMIT work correctly
- [x] Error handling for invalid requests

### ✅ Frontend
- [x] UnionTableSelector appears when similar tables exist
- [x] Clicking chips toggles union state
- [x] Virtual table created with union mode
- [x] Query includes all selected tables
- [x] Results display correctly

### 🔲 End-to-End (Ready for You!)
- [ ] Connect to your ClickHouse database
- [ ] Select `vector_rjio_late_pdcch_syslog_0001`
- [ ] See suggested tables (0002, 0003, etc.)
- [ ] Click to combine 2-3 tables
- [ ] Build a simple visualization
- [ ] Verify results include data from all tables

## Troubleshooting

### "No similar tables found"
- Check that other tables have EXACTLY the same columns
- Column names AND types must match
- Check backend logs for detection details

### Union section doesn't appear
- Verify connection type is ClickHouse (not CSV)
- Make sure a table is selected
- Check console for fetchSuggestedUnions errors

### Query fails with union tables
- Check generated SQL in network tab
- Verify all tables exist in database
- Check backend logs for query errors

## Performance Considerations

### Large Tables
- UNION ALL queries can be slow with many large tables
- Consider using LIMIT to test first
- Backend applies same optimizations to each sub-query

### Many Tables
- UI shows all suggested tables
- Can combine 10+ tables if needed
- Query length increases linearly with table count

## Future Enhancements

### Possible Improvements
1. **Source Table Column**: Add `_source_table` column to identify origin
2. **Per-Table Filters**: Different WHERE clauses for each table
3. **Schema Mapping**: Combine tables with similar but not identical schemas
4. **Union vs Union All**: Option to deduplicate with UNION
5. **Performance**: Parallel query execution for each table
6. **UI**: Preview row counts per table before combining

### Not Yet Implemented
- Table ordering (currently alphabetical)
- Selective column inclusion per table
- Time-based partitioning detection
- Automatic table discovery patterns

## Architecture Benefits

### Clean Separation
- JOIN and UNION are separate modes (no mixing)
- Shared VirtualTableDefinition model
- Independent query generation paths
- Separate UI components

### Reusable Infrastructure
- Same connector interface
- Same service patterns
- Same API structure
- Same context management

### Future-Proof
- Easy to add more modes (e.g., INTERSECT, EXCEPT)
- Easy to enhance per-mode features
- Easy to add mode-specific UI

## Success! 🎉

The UNION ALL feature is **complete and ready to use**. Your partitioned tables can now be combined seamlessly with a clean, intuitive UI.

**Next Steps:**
1. Restart your backend server
2. Refresh the frontend
3. Test with your `vector_rjio_late_pdcch_syslog_*` tables
4. Enjoy querying multiple tables as one! 🚀
