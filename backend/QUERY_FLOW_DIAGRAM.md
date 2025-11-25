# Query Execution Flow: From Frontend Request to Backend Response

## Complete Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│ FRONTEND                                                                        │
│ Sends POST /api/v1/data/query with QueryDescription JSON                       │
│ {                                                                               │
│   target_table, target_database,                                               │
│   dimensions[], measures[], filters[],                                         │
│   virtual_table?: {...},          ← Multi-table JOINs/UNIONs                  │
│   virtual_columns?: [...],        ← Computed columns                           │
│   optimization_hints?: {...}      ← Frontend optimization guidance             │
│ }                                                                               │
└─────────────────────────────────────────────────────────────────────────────────┘
                                      ↓
┌─────────────────────────────────────────────────────────────────────────────────┐
│ 1. FASTAPI ROUTER                     [routers/data.py:184]                    │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │
│ @router.post("/query")                                                          │
│                                                                                 │
│ 1a. Extract session_id from cookie → get ConnectionStateManager                │
│ 1b. Get active connector (depends on session)                                  │
│ 1c. Parse & validate QueryDescription (Pydantic model)                         │
│ 1d. Validate CSV table match & require database for ClickHouse                 │
└─────────────────────────────────────────────────────────────────────────────────┘
                                      ↓
┌─────────────────────────────────────────────────────────────────────────────────┐
│ 2. QUERY SERVICE INITIALIZATION       [services/query_service.py:428]          │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │
│ QueryService.translate_to_sql()                                                 │
│                                                                                 │
│ 2a. Initialize QueryOptimizer with connector & config                          │
│ 2b. Determine db_type (clickhouse/duckdb/generic)                              │
│ 2c. Select quote_char (" for ClickHouse, ` for others)                         │
└─────────────────────────────────────────────────────────────────────────────────┘
                                      ↓
                    ┌─────────────────┴────────────────┐
                    │  Has virtual_table.mode=union?   │
                    └─────────────────┬────────────────┘
                            YES ↓           ↓ NO
                                │           │
    ┌───────────────────────────┘           └────────────────────────────┐
    ↓                                                                     ↓
┌─────────────────────────────────────────┐    ┌──────────────────────────────────────────┐
│ 3A. UNION TABLE PATH 🔶 COMPLEX         │    │ 3B. STANDARD PATH (Single/JOIN)          │
│ [union_query_builder.py]                │    │ [query_service.py:410-516]               │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │    │ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │
│                                         │    │                                          │
│ 3A.1 Parse database/table refs         │    │ 3B.1 Build Table Context                │
│      (support db/table notation)       │    │      [table_context_builder.py]         │
│                                         │    │      ┌──────────────────────────┐       │
│ 3A.2 Get columns for each table        │    │      │ Has virtual_table.mode   │       │
│      (filter fields per table)         │    │      │ = "join"?                │       │
│                                         │    │      └────┬─────────────────┬───┘       │
│ 3A.3 Build ordered field list          │    │           │ YES             │ NO        │
│      (dimensions + measures)           │    │           ↓                 ↓           │
│                                         │    │    ┌──────────┐      ┌──────────┐      │
│ 3A.4 FOR EACH table in union:          │    │    │Multi-    │      │Single    │      │
│      • Filter QueryDesc to only        │    │    │Table w/  │      │Table     │      │
│        fields existing in table        │    │    │JOINs     │      │Query     │      │
│      • Add _source_database/table      │    │    └──────────┘      └──────────┘      │
│      • Call translate_single_table()   │    │         │                  │            │
│        recursively 🔄                  │    │         └──────┬───────────┘            │
│      • Wrap in parentheses             │    │                ↓                        │
│                                         │    │    Creates: query, table_map,          │
│ 3A.5 JOIN with " UNION ALL "           │    │    default_table, primary_table         │
│                                         │    │                                          │
│ 3A.6 Return final SQL + metadata       │    │ 3B.2 Register Virtual Columns 🔶        │
│                                         │    │      [virtual_column_builder.py]        │
│ COMPLEXITY: High                        │    │      IF virtual_columns defined:        │
│ • Recursive query building              │    │      • Parse expressions                │
│ • Column filtering per table            │    │      • Support table.column refs        │
│ • Schema alignment across tables        │    │      • Validate & cache                 │
│ • Source tracking injection             │    │                                          │
└─────────────────────────────────────────┘    └──────────────────────────────────────────┘
                    │                                                   │
                    └────────────────────┬──────────────────────────────┘
                                         ↓
                        ┌────────────────────────────────┐
                        │  UNION path exits here         │
                        │  (no further optimization)     │
                        └────────┬───────────────────────┘
                                 │ UNION returns SQL
                                 │
                    STANDARD PATH continues ↓
                                 
┌─────────────────────────────────────────────────────────────────────────────────┐
│ 4. OPTIMIZATION PLANNING 🔶 COMPLEX     [optimization/optimizer.py:113]        │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │
│ QueryOptimizer.create_plan(query_desc)                                          │
│                                                                                 │
│ 4.1 PRIORITY 1: Backend Override (SmallTableDetector)                          │
│     • Check if table is small → skip_all_optimizations                         │
│     • Uses count_cache & table_size_detector                                   │
│                                                                                 │
│ 4.2 PRIORITY 2: Frontend Optimization Hints                                    │
│     IF optimization_hints provided:                                             │
│     ├─ Use field-level hints (per dimension/measure)                           │
│     ├─ Respect enable_global_distinct flag                                     │
│     └─ Apply optimization_level (off/conservative/aggressive)                  │
│     StrategyPlanner.create_from_hints() → strategies[]                          │
│                                                                                 │
│ 4.3 PRIORITY 3: Default Heuristics                                             │
│     IF no hints:                                                                │
│     └─ StrategyPlanner.create_from_query_structure()                           │
│        Analyzes: aggregations, dimension types, result size                    │
│                                                                                 │
│ 4.4 Build OptimizationPlan                                                     │
│     • strategies[] (sorted by priority)                                        │
│     • override (if small table)                                                │
│     • hints_used (for response metadata)                                       │
│                                                                                 │
│ STRATEGY SELECTION:                                                             │
│ ┌──────────────────────────────────────────────────────────────┐               │
│ │ AdaptiveRoundingStrategy     - Round numeric values          │               │
│ │ DateTimeBinningStrategy      - Bin datetime dimensions       │               │
│ │ CategoryDeduplicationStrategy - Dedupe category aggregations │               │
│ │ DiscreteDeduplicationStrategy - DISTINCT for discrete dims   │               │
│ │ DistinctPairStrategy         - DISTINCT for raw data queries │               │
│ └──────────────────────────────────────────────────────────────┘               │
│                                                                                 │
│ COMPLEXITY: Very High                                                           │
│ • Multi-stage cardinality estimation (EXPLAIN/COUNT queries)                   │
│ • Database-specific estimators (ClickHouse/DuckDB)                             │
│ • Strategy planner logic (adaptive_rounding_planner, dedup_planner)            │
│ • Cost-benefit analysis per optimization                                       │
└─────────────────────────────────────────────────────────────────────────────────┘
                                      ↓
┌─────────────────────────────────────────────────────────────────────────────────┐
│ 5. BUILD OPTIMIZATION CONTEXT          [query_service.py:167]                  │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │
│ _build_optimization_context()                                                   │
│                                                                                 │
│ IF optimization_plan has strategies:                                            │
│ ├─ Extract rounding_config (per-field rounding precision)                      │
│ ├─ Extract binning_config (datetime binning specifications)                    │
│ └─ Set use_category_dedup flag                                                 │
│                                                                                 │
│ Returns: OptimizationContext                                                    │
└─────────────────────────────────────────────────────────────────────────────────┘
                                      ↓
┌─────────────────────────────────────────────────────────────────────────────────┐
│ 6. BUILD SELECT CLAUSE 🔶 COMPLEX      [select_builder.py]                     │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │
│ SelectClauseBuilder.build()                                                     │
│                                                                                 │
│ 6.1 Process Dimensions                                                         │
│     FOR EACH dimension:                                                         │
│     ├─ Check if virtual_column (use vc_builder expression)                     │
│     ├─ Apply datetime extraction (DateTimeService)                             │
│     │  • DISTINCT mode: extract part (year, month, hour, etc.)                 │
│     │  • TIMELINE mode: truncate preserving timeline                           │
│     │  • Database-specific functions (ClickHouse/DuckDB/generic)               │
│     ├─ Apply column casting (CastField if configured)                          │
│     ├─ Apply rounding (if rounding_config exists for field)                    │
│     ├─ Apply datetime binning (if binning_config exists)                       │
│     └─ Track for GROUP BY                                                      │
│                                                                                 │
│ 6.2 Process Measures                                                           │
│     FOR EACH measure:                                                           │
│     ├─ Check if virtual_column (use vc_builder expression)                     │
│     ├─ Apply aggregation (SUM, AVG, COUNT, MIN, MAX, COUNT_DISTINCT)           │
│     ├─ Apply column casting (before aggregation)                               │
│     ├─ Apply rounding (after aggregation if configured)                        │
│     └─ Use alias if provided                                                   │
│                                                                                 │
│ 6.3 Handle Special Cases                                                       │
│     • Category deduplication grouping                                          │
│     • Null value guards (COALESCE)                                             │
│     • Quote field names with special characters                                │
│                                                                                 │
│ Returns: SelectClauseResult                                                     │
│ ├─ fields: PyPika select terms                                                 │
│ ├─ aliases: all field/measure aliases                                          │
│ └─ groupby_field_info_for_dedup: dedup metadata                                │
│                                                                                 │
│ COMPLEXITY: Very High                                                           │
│ • Virtual column expression parsing & resolution                               │
│ • Database-specific datetime handling                                          │
│ • Nested optimization applications (cast → round → bin)                        │
│ • Deduplication metadata tracking                                              │
└─────────────────────────────────────────────────────────────────────────────────┘
                                      ↓
┌─────────────────────────────────────────────────────────────────────────────────┐
│ 7. BUILD FILTER CRITERIA               [filter_builder.py]                     │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │
│ FilterBuilder.build()                                                           │
│                                                                                 │
│ FOR EACH filter in query_desc.filters:                                         │
│ ├─ Resolve field reference (check virtual_columns, table_map)                  │
│ ├─ Apply datetime extraction if needed                                         │
│ ├─ Apply column casting if configured                                          │
│ ├─ Build criterion based on operator:                                          │
│ │  • =, !=, <, >, <=, >= (comparison)                                          │
│ │  • IN, NOT IN (list membership)                                              │
│ │  • IS NULL, IS NOT NULL                                                      │
│ │  • LIKE, NOT LIKE (pattern matching)                                         │
│ │  • BETWEEN (range)                                                           │
│ └─ Handle datetime timezone conversions                                        │
│                                                                                 │
│ Special: regex sampling filters (internal optimization)                        │
│                                                                                 │
│ Returns: List[Criterion] → WHERE clause                                        │
└─────────────────────────────────────────────────────────────────────────────────┘
                                      ↓
┌─────────────────────────────────────────────────────────────────────────────────┐
│ 8. APPLY OPTIMIZATIONS                 [optimization_applier.py]               │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │
│ OptimizationApplier.apply()                                                     │
│                                                                                 │
│ IF optimization_plan exists:                                                    │
│    FOR EACH strategy in plan.strategies (sorted by priority):                  │
│    ├─ Check if strategy.can_apply(query_desc)                                  │
│    ├─ Apply strategy transformation to PyPika query                            │
│    │  • Modify SELECT (rounding/binning already applied in step 6)             │
│    │  • Add WHERE conditions (sampling)                                        │
│    │  • Modify GROUP BY (deduplication)                                        │
│    └─ Collect metadata (strategy name, reduction factor, config)               │
│                                                                                 │
│ Returns: (optimized_query, optimization_metadata[])                            │
│                                                                                 │
│ Note: Most optimizations already embedded in SELECT clause                      │
│       This step mainly handles DISTINCT and sampling                           │
└─────────────────────────────────────────────────────────────────────────────────┘
                                      ↓
┌─────────────────────────────────────────────────────────────────────────────────┐
│ 9. APPLY DISTINCT                      [distinct_applier.py]                   │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │
│ DistinctApplier.apply_if_needed()                                               │
│                                                                                 │
│ IF (discrete-only dimensions + no aggregations + no category dedup):           │
│    Add .distinct() to query                                                    │
│    Use case: Filter panels, tick strips                                        │
└─────────────────────────────────────────────────────────────────────────────────┘
                                      ↓
┌─────────────────────────────────────────────────────────────────────────────────┐
│ 10. BUILD GROUP BY                     [grouping_ordering_builder.py]          │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │
│ GroupingOrderingBuilder.build_groupby()                                         │
│                                                                                 │
│ IF query has measures (aggregations):                                          │
│    Group by all dimension fields                                               │
│    (Handles virtual columns, datetime extractions)                             │
└─────────────────────────────────────────────────────────────────────────────────┘
                                      ↓
┌─────────────────────────────────────────────────────────────────────────────────┐
│ 11. BUILD ORDER BY                     [grouping_ordering_builder.py]          │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │
│ GroupingOrderingBuilder.build_orderby()                                         │
│                                                                                 │
│ FOR EACH orderBy specification:                                                │
│ ├─ Resolve field (check aliases first, then raw fields)                        │
│ ├─ Handle virtual columns                                                      │
│ └─ Apply ASC/DESC direction                                                    │
│                                                                                 │
│ Default: If no orderBy specified, often orders by first dimension              │
└─────────────────────────────────────────────────────────────────────────────────┘
                                      ↓
┌─────────────────────────────────────────────────────────────────────────────────┐
│ 12. APPLY SAMPLING & LIMITS            [sampling_limits_builder.py]            │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │
│ SamplingAndLimitsBuilder.build()                                               │
│                                                                                 │
│ 12.1 Apply LIMIT                                                               │
│      IF query_desc.limit specified:                                            │
│         Add LIMIT clause                                                       │
│                                                                                 │
│ 12.2 Apply Sampling (if enabled & raw data query)                              │
│      IF with_sampling AND no aggregations:                                     │
│      ├─ Calculate if sampling needed (large result estimate)                   │
│      └─ Add SAMPLE clause (database-specific)                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
                                      ↓
┌─────────────────────────────────────────────────────────────────────────────────┐
│ 13. COMPILE SQL                        [query_service.py:496]                  │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │
│ query.get_sql(quote_char=quote_char)                                            │
│                                                                                 │
│ • PyPika generates final SQL string                                            │
│ • Uses database-appropriate quote character                                    │
│ • Log generated SQL                                                             │
│                                                                                 │
│ Build extended_metadata:                                                        │
│ └─ {optimizations[], hints_used, override}                                     │
│                                                                                 │
│ Returns: (sql_string, extended_metadata)                                       │
└─────────────────────────────────────────────────────────────────────────────────┘
                                      ↓
┌─────────────────────────────────────────────────────────────────────────────────┐
│ 14. EXECUTE QUERY                      [connectors/base.py]                    │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │
│ connector.fetch_data(sql_query)                                                 │
│                                                                                 │
│ Database-specific execution:                                                    │
│                                                                                 │
│ ┌─────────────────────────┐    ┌─────────────────────────┐                    │
│ │ ClickHouseConnector     │    │ FileConnector (DuckDB)  │                    │
│ ├─────────────────────────┤    ├─────────────────────────┤                    │
│ │ • clickhouse-connect    │    │ • DuckDB in-memory      │                    │
│ │ • Native protocol       │    │ • CSV file reading      │                    │
│ │ • Streaming support     │    │ • Auto schema detection │                    │
│ │ • Query caching         │    │ • Configurable parsing  │                    │
│ └─────────────────────────┘    └─────────────────────────┘                    │
│                                                                                 │
│ Returns: (columns[], rows[])                                                   │
│ • columns: [{'name': 'col1', 'type': 'String'}, ...]                           │
│ • rows: [{'col1': val1, 'col2': val2, ...}, ...]                               │
└─────────────────────────────────────────────────────────────────────────────────┘
                                      ↓
┌─────────────────────────────────────────────────────────────────────────────────┐
│ 15. BUILD RESULT                       [query_result_builder.py]               │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │
│ QueryResultBuilder.build_result()                                               │
│                                                                                 │
│ Constructs QueryResult model:                                                   │
│ ├─ columns: column names                                                       │
│ ├─ rows: data rows                                                             │
│ ├─ row_count: len(rows)                                                        │
│ ├─ query_sql: executed SQL                                                     │
│ ├─ optimizations_applied: metadata from step 8                                 │
│ ├─ optimization_hints_used: hints that were used                               │
│ ├─ optimization_override: small table skip info                                │
│ ├─ reduction_factor: data reduction percentage                                 │
│ └─ result_dimensions: {rows, columns, size_display}                            │
└─────────────────────────────────────────────────────────────────────────────────┘
                                      ↓
┌─────────────────────────────────────────────────────────────────────────────────┐
│ 16. RETURN TO FRONTEND                                                          │
│ ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ │
│ HTTP 200 OK with JSON:                                                          │
│ {                                                                               │
│   "columns": ["col1", "col2", ...],                                             │
│   "rows": [{...}, {...}, ...],                                                  │
│   "row_count": 1234,                                                            │
│   "query_sql": "SELECT ...",                                                    │
│   "optimizations_applied": [                                                    │
│     {                                                                           │
│       "type": "adaptive_rounding",                                              │
│       "config": {"Revenue": 2},                                                 │
│       "reduction": 0.65                                                         │
│     }                                                                           │
│   ],                                                                            │
│   "optimization_hints_used": {...},                                             │
│   "optimization_override": null,                                                │
│   "reduction_factor": 0.65,                                                     │
│   "result_dimensions": {                                                        │
│     "rows": 1234,                                                               │
│     "columns": 5,                                                               │
│     "size_display": "1,234 × 5"                                                 │
│   }                                                                             │
│ }                                                                               │
└─────────────────────────────────────────────────────────────────────────────────┘
```

## Special Scenarios Deep Dive

### Scenario A: Virtual Columns (Computed Fields)

```
┌──────────────────────────────────────────────────────────────┐
│ Virtual Column: "profit = Revenue - Cost"                    │
└──────────────────────────────────────────────────────────────┘
                              ↓
    1. Frontend sends:
       {
         "virtual_columns": [
           {
             "name": "profit",
             "expression": "Revenue - Cost",
             "data_type": "Float64"
           }
         ],
         "measures": [
           {"field": "profit", "aggregation": "sum"}
         ]
       }
                              ↓
    2. VirtualColumnExpressionBuilder:
       • Parse expression: "Revenue - Cost"
       • Build PyPika expression tree
       • Support operators: +, -, *, /, parentheses
       • Support table-qualified refs: "table1.Revenue"
       • Cache expression for reuse
                              ↓
    3. SelectClauseBuilder:
       • Detect "profit" is virtual
       • Get expression from vc_builder
       • Apply aggregation: SUM(Revenue - Cost)
       • Can apply rounding/casting to virtual columns
                              ↓
    4. FilterBuilder & OrderBy:
       • Virtual columns usable in filters
       • Virtual columns usable in sorting
       • Expression substituted automatically

COMPLEXITY: High
• Expression parsing without full SQL parser
• Table reference resolution in multi-table contexts
• Interaction with optimizations (rounding virtual columns)
```

### Scenario B: Multi-Table JOINs

```
┌──────────────────────────────────────────────────────────────┐
│ Query: Orders JOIN Customers ON Orders.customer_id = ...    │
└──────────────────────────────────────────────────────────────┘
                              ↓
    1. Frontend sends:
       {
         "target_table": "orders",
         "virtual_table": {
           "mode": "join",
           "primary_table": "orders",
           "joined_tables": [
             {
               "table_name": "customers",
               "join_type": "LEFT",
               "on_conditions": [
                 "orders.customer_id = customers.id"
               ]
             }
           ]
         },
         "dimensions": [
           {"field": "orders.order_date"},
           {"field": "customers.city"}
         ]
       }
                              ↓
    2. TableContextBuilder (multi-table path):
       • Create table_map: {
           "orders": Table("orders"),
           "customers": Table("customers")
         }
       • Build PyPika query with LEFT JOIN
       • Parse ON condition: extract table.column refs
                              ↓
    3. SelectClauseBuilder:
       • Resolve "orders.order_date" → table_map["orders"]["order_date"]
       • Resolve "customers.city" → table_map["customers"]["city"]
       • FieldReferenceParser handles table prefixes
                              ↓
    4. Generated SQL:
       SELECT
         "orders"."order_date",
         "customers"."city",
         SUM("orders"."amount")
       FROM "db"."orders"
       LEFT JOIN "db"."customers"
         ON "orders"."customer_id" = "customers"."id"
       GROUP BY "orders"."order_date", "customers"."city"

COMPLEXITY: Medium-High
• Table reference parsing (split on first dot only)
• JOIN condition parsing (equality only currently)
• Field resolution with table prefixes
• Schema-qualified tables for ClickHouse
```

### Scenario C: Multi-Database UNION

```
┌──────────────────────────────────────────────────────────────────┐
│ Query: UNION sales_2023 + sales_2024 (different databases)      │
└──────────────────────────────────────────────────────────────────┘
                              ↓
    1. Frontend sends:
       {
         "target_database": "db2023",
         "target_table": "sales",
         "virtual_table": {
           "mode": "union",
           "primary_table": "sales",
           "union_tables": [
             {
               "database": "db2024",
               "table_name": "sales"
             },
             {
               "database": "db2025",
               "table_name": "sales_q1"
             }
           ]
         },
         "dimensions": [
           {"field": "_source_database"},  ← Special: track origin
           {"field": "region"}
         ]
       }
                              ↓
    2. UnionQueryBuilder:
       • Collects table refs:
         - (db2023, sales)
         - (db2024, sales)
         - (db2025, sales_q1)
       
       • Gets columns for each table via connector
         - db2023.sales: [date, region, revenue, units]
         - db2024.sales: [date, region, revenue, units]
         - db2025.sales_q1: [date, region, revenue]  ← Missing 'units'
       
       • Flexible schema support:
         Creates ordered field list: [region]
         (only fields that exist in each table)
                              ↓
    3. FOR EACH table:
       • Filter QueryDescription:
         - Remove dimensions/measures for missing columns
         - Add _source_database literal: '${database}'
         - Add _source_table literal: '${table_name}'
       
       • Call translate_single_table() recursively 🔄
         This is a full query generation for this specific table
       
       • Wrap result in parentheses
                              ↓
    4. Combine with UNION ALL:
       (SELECT 'db2023' AS _source_database, region, SUM(revenue) 
        FROM db2023.sales GROUP BY region)
       UNION ALL
       (SELECT 'db2024' AS _source_database, region, SUM(revenue)
        FROM db2024.sales GROUP BY region)
       UNION ALL
       (SELECT 'db2025' AS _source_database, region, SUM(revenue)
        FROM db2025.sales_q1 GROUP BY region)
                              ↓
    5. NO further optimization applied to UNION queries
       (Returns SQL directly, skips steps 8-12)

COMPLEXITY: Very High
• Cross-database queries (schema qualification)
• Flexible schema handling (missing columns)
• Column existence checking per table
• Recursive query building per table
• Source tracking injection
• Special notation: "db/table" format support
```

### Scenario D: Optimization with Frontend Hints

```
┌──────────────────────────────────────────────────────────────┐
│ Frontend sends cardinality estimates to guide optimizations  │
└──────────────────────────────────────────────────────────────┘
                              ↓
    1. Frontend pre-queries cardinalities:
       POST /api/v1/data/distinct-count
       { "field": "customer_id", "table": "orders" }
       → Response: { "distinct_count": 1_500_000 }
                              ↓
    2. Frontend builds optimization hints:
       {
         "optimization_hints": {
           "optimization_level": "aggressive",
           "enable_global_distinct": false,
           "field_hints": {
             "Revenue": {
               "distinct_count": 45_000_000,
               "enable_rounding": true,
               "rounding_precision": 2,
               "enable_binning": false
             },
             "order_date": {
               "distinct_count": 3650,
               "enable_binning": true,
               "binning_interval": "day"
             }
           }
         }
       }
                              ↓
    3. QueryOptimizer.create_plan():
       • PRIORITY CHECK 1: SmallTableDetector
         IF table total rows < 10,000:
            Return empty plan (skip optimizations)
       
       • PRIORITY CHECK 2: Frontend Hints
         IF optimization_hints provided:
            StrategyPlanner.create_from_hints()
            
            For "Revenue":
            • distinct_count: 45M (very high)
            • enable_rounding: true
            • Create AdaptiveRoundingStrategy with precision=2
            
            For "order_date":
            • distinct_count: 3650
            • enable_binning: true
            • Create DateTimeBinningStrategy with interval=day
       
       • PRIORITY CHECK 3: Default Heuristics
         IF no hints:
            Estimate cardinalities via database queries
            Apply conservative optimizations
                              ↓
    4. Strategies applied in order:
       • AdaptiveRoundingStrategy (priority 20):
         ROUND(SUM(Revenue), 2) AS revenue_total
       
       • DateTimeBinningStrategy (priority 15):
         toStartOfDay(order_date) AS order_date
                              ↓
    5. Metadata returned to frontend:
       {
         "optimizations_applied": [
           {
             "type": "adaptive_rounding",
             "config": {"Revenue": 2},
             "reduction": 0.65,
             "estimated_before": 45_000_000,
             "estimated_after": 450_000
           },
           {
             "type": "datetime_binning",
             "config": {"order_date": "day"},
             "reduction": 0.95
           }
         ],
         "optimization_hints_used": { ... }  ← Echo back
       }

COMPLEXITY: Very High
• Frontend-backend negotiation loop
• Cardinality estimation queries (can be expensive)
• Multi-strategy coordination
• Per-field configuration
• Reduction factor calculation
```

## Complexity Indicators

### 🔶 Most Complex Components

1. **UnionQueryBuilder** (Complexity: Very High)
   - Recursive query generation
   - Cross-database support
   - Schema flexibility
   - Column filtering per table
   - Source tracking

2. **QueryOptimizer + StrategyPlanner** (Complexity: Very High)
   - Multi-stage cardinality estimation
   - Database-specific estimators
   - Strategy selection logic
   - Cost-benefit analysis
   - Frontend hint processing

3. **SelectClauseBuilder** (Complexity: Very High)
   - Virtual column expression parsing
   - Database-specific datetime functions
   - Nested optimization applications
   - Casting, rounding, binning layering
   - Deduplication metadata

4. **VirtualColumnExpressionBuilder** (Complexity: High)
   - Expression parsing without full parser
   - Table reference resolution
   - Multi-table context handling

### Error-Prone Areas

- **Table reference parsing**: Splitting on first dot only (column names may contain dots)
- **Quote character handling**: Different databases use different quote characters
- **Schema qualification**: ClickHouse requires schema, CSV doesn't
- **UNION schema alignment**: Handling missing columns gracefully
- **Optimization interaction**: Multiple optimizations on same field (cast → round → bin)

### Performance Bottlenecks

- **Cardinality estimation**: Multiple COUNT DISTINCT queries before main query
- **UNION queries**: N separate queries + UNION overhead
- **Small table detection**: Extra COUNT(*) query
- **Column listing for UNION**: N extra metadata queries

## Key Design Patterns

1. **Builder Pattern**: Modular query construction (SelectBuilder, FilterBuilder, etc.)
2. **Strategy Pattern**: Pluggable optimizations (AdaptiveRoundingStrategy, etc.)
3. **Recursive Composition**: UNION builder calls translate_single_table recursively
4. **Priority-Based Execution**: Optimization plan with sorted strategies
5. **Context Objects**: TableContext, OptimizationContext encapsulate complex state
6. **Dependency Injection**: Connector, optimizer passed through layers

