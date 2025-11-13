# Virtual Columns - Quick Summary

**Branch:** `virtual-columns`  
**Status:** 📋 Research Complete - Ready for Implementation  
**Date:** November 13, 2025

---

## What Are Virtual Columns?

Virtual columns (calculated/derived columns) allow users to create new columns from existing ones using mathematical operations and functions. Calculations happen **at the SQL level** (in ClickHouse/DuckDB) for optimal performance.

**Example:**
```json
{
  "name": "profit",
  "expression": "(revenue - cost)",
  "output_type": "DOUBLE"
}
```

---

## Key Decisions

| Question | Decision |
|----------|----------|
| **Storage Location** | Query-level (saved with visualization JSON) |
| **Expression Complexity** | Level 3: Arithmetic + Functions + Conditionals (CASE WHEN) |
| **Column Visibility** | Always visible in lists, flagged as `is_virtual=true` |
| **Multi-table Support** | Support qualified names (`table.column`) |
| **VC Dependencies** | No - virtual columns cannot reference other virtual columns |
| **Error Handling** | Validation + Execution + NULL handling |
| **UI** | Simple text input |
| **Implementation** | Proposal 1 - String expressions with Pypika |

---

## Architecture Overview

```
Frontend (Text Input)
    ↓
Virtual Column Definition (JSON)
    ↓
QueryDescription.virtual_columns
    ↓
Backend: VirtualColumnExpressionBuilder
    ↓
Parse & Validate Expression
    ↓
Convert to Pypika Terms
    ↓
Integrate into SQL Query
    ↓
Database Execution
```

---

## Example Use Cases

### 1. Simple Calculation
```json
{
  "name": "profit",
  "expression": "(revenue - cost)",
  "output_type": "DOUBLE"
}
```

### 2. With Functions
```json
{
  "name": "rounded_price",
  "expression": "ROUND(price, 2)",
  "output_type": "DOUBLE"
}
```

### 3. Conditional Logic
```json
{
  "name": "customer_segment",
  "expression": "CASE().when(order_value >= 1000, 'Premium').when(order_value >= 500, 'Standard').else_('Basic')",
  "output_type": "VARCHAR"
}
```

### 4. Multi-table (JOINs)
```json
{
  "name": "customer_value",
  "expression": "(orders.total_amount * customers.repeat_rate)",
  "output_type": "DOUBLE"
}
```

---

## Implementation Phases

### ✅ Phase 0: Research (COMPLETE)
- [x] Architecture analysis
- [x] Security considerations
- [x] Pypika integration strategy
- [x] Decision documentation

### 🔄 Phase 1: Backend Core (NEXT)
- [ ] Data models (`VirtualColumnDefinition`)
- [ ] Expression parser (`VirtualColumnExpressionBuilder`)
- [ ] QueryService integration
- [ ] Unit tests
- [ ] Integration tests

**Estimated:** 1-2 sprints

### ⏳ Phase 2: Frontend
- [ ] TypeScript types
- [ ] Virtual Column Manager component
- [ ] State management
- [ ] Query builder integration
- [ ] End-to-end testing

**Estimated:** 1 sprint

### 🧪 Phase 3: Testing & Validation
- [ ] Comprehensive test coverage
- [ ] ClickHouse testing
- [ ] DuckDB/CSV testing
- [ ] Performance testing
- [ ] Error scenario testing

**Estimated:** 0.5 sprint

### 📚 Phase 4: Documentation
- [ ] User guide
- [ ] API documentation
- [ ] Examples library
- [ ] Troubleshooting guide

**Estimated:** 0.5 sprint

**Total Estimated Effort:** 3-4 sprints

---

## Key Technical Components

### Backend

**New Files:**
- `backend/services/query_components/virtual_column_builder.py` - Expression parser
- `backend/tests/unit/services/test_virtual_column_builder.py` - Unit tests
- `backend/tests/integration/test_virtual_columns_query.py` - Integration tests

**Modified Files:**
- `backend/models/data_source.py` - Add `VirtualColumnDefinition` model
- `backend/models/query.py` - Add `virtual_columns` field
- `backend/services/query_service.py` - Integrate VC builder
- `backend/services/query_components/select_builder.py` - Accept vc_builder param
- `backend/services/query_components/filter_builder.py` - Accept vc_builder param

### Frontend

**New Files:**
- `frontend/src/components/VirtualColumns/VirtualColumnManager.tsx` - UI component
- `frontend/src/components/VirtualColumns/VirtualColumnManager.module.css` - Styles

**Modified Files:**
- `frontend/src/types.ts` - Add `VirtualColumnDefinition` type
- `frontend/src/hooks/useVisualizationState.ts` - State management
- `frontend/src/queryBuilder/queryBuilder.ts` - Include virtual columns in queries

---

## Security Features

### Expression Validation
- ✅ Forbidden keywords check (DROP, DELETE, INSERT, etc.)
- ✅ SQL comment prevention
- ✅ Statement separator blocking
- ✅ Column reference validation
- ✅ No VC-to-VC references

### Safe Execution
- ✅ Restricted eval namespace
- ✅ Pypika parameterization
- ✅ Read-only database connections
- ✅ Query timeouts

---

## Performance Benefits

| Aspect | SQL-Level | Frontend-Level |
|--------|-----------|----------------|
| **Calculation** | ⚡ Database-optimized | 🐌 Row-by-row JS |
| **Data Transfer** | ✅ Minimal | ❌ Transfer all raw data |
| **Aggregation** | ✅ Native SQL | ❌ Limited |
| **Filtering** | ✅ Before transfer | ⚠️ After transfer |

---

## Supported Operations

### Arithmetic
- `+` Addition
- `-` Subtraction
- `*` Multiplication
- `/` Division
- `%` Modulo

### Functions
- `ROUND(value, decimals)`
- `ABS(value)`
- `COALESCE(value, default)`
- `CONCAT(string1, string2, ...)`
- `UPPER(string)`, `LOWER(string)`
- `LENGTH(string)`
- `SUBSTRING(string, start, length)`
- `CAST(value, type)`

### Conditionals
- `CASE().when(condition, value).when(...).else_(default)`

### Comparisons
- `==`, `!=`, `>`, `<`, `>=`, `<=`

### Logical
- `&` (AND), `|` (OR)

---

## Example Queries

### Virtual Column as Dimension
```json
{
  "target_table": "sales",
  "dimensions": [
    {"field": "profit_level", "flavour": "discrete"}
  ],
  "measures": [
    {"field": "revenue", "aggregation": "sum", "alias": "total_revenue"}
  ],
  "virtual_columns": [
    {
      "name": "profit_level",
      "expression": "CASE().when(revenue - cost > 1000, 'High').else_('Low')",
      "output_type": "VARCHAR"
    }
  ]
}
```

**Generated SQL:**
```sql
SELECT 
  CAST(CASE WHEN ("revenue"-"cost")>1000 THEN 'High' ELSE 'Low' END AS VARCHAR) AS "profit_level",
  SUM("revenue") AS "total_revenue"
FROM "sales"
GROUP BY "profit_level"
```

### Virtual Column as Measure
```json
{
  "target_table": "sales",
  "dimensions": [
    {"field": "product", "flavour": "discrete"}
  ],
  "measures": [
    {"field": "profit", "aggregation": "sum", "alias": "total_profit"}
  ],
  "virtual_columns": [
    {
      "name": "profit",
      "expression": "(revenue - cost)",
      "output_type": "DOUBLE"
    }
  ]
}
```

**Generated SQL:**
```sql
SELECT 
  "product",
  SUM(CAST(("revenue"-"cost") AS DOUBLE)) AS "total_profit"
FROM "sales"
GROUP BY "product"
```

---

## Next Steps

1. **Review Documents**
   - [VIRTUAL_COLUMNS_RESEARCH.md](./VIRTUAL_COLUMNS_RESEARCH.md) - Detailed research
   - [VIRTUAL_COLUMNS_IMPLEMENTATION_PLAN.md](./VIRTUAL_COLUMNS_IMPLEMENTATION_PLAN.md) - Implementation details

2. **Start Phase 1**
   - Implement `VirtualColumnDefinition` model
   - Create `VirtualColumnExpressionBuilder`
   - Integrate into `QueryService`
   - Write tests

3. **Prototype & Test**
   - Test with simple expressions
   - Validate security
   - Measure performance
   - Iterate based on findings

---

## Questions or Concerns?

- **Security:** Expression validation prevents SQL injection
- **Performance:** Database-level calculation = optimal performance
- **Complexity:** Start simple (Level 1-2), already supporting Level 3
- **Maintenance:** Leverages existing Pypika infrastructure

---

**Ready to implement!** 🚀

See implementation plan for detailed step-by-step guide.
