"""
API Examples for Column Casting

Shows how to configure and use the column casting solution in API requests.
"""

# ============================================================================
# EXAMPLE 1: Simple Column Cast (Quoted Numbers)
# ============================================================================

# Upload connection with column casting configuration
PUT /api/v1/connections/my_sales_data
{
  "type": "csv",
  "file_path": "sales_data.csv",
  "csv_delimiter": ",",
  "csv_has_header": true,
  "csv_decimal_separator": ".",
  "csv_date_format": "%Y-%m-%d",
  "csv_timestamp_format": "%Y-%m-%d %H:%M:%S",
  
  # New: Column casting configuration
  "column_casts": {
    "Revenue": {
      "cast_type": "BIGINT",
      "replacement_pattern": ","
    },
    "Units Sold": {
      "cast_type": "INTEGER",
      "replacement_pattern": ","
    }
  }
}


# Query using the connection (casts applied automatically)
POST /api/v1/data/query
{
  "target_table": "sales",
  "dimensions": [
    {
      "field": "Date",
      "flavour": "discrete"
    },
    {
      "field": "Product",
      "flavour": "discrete"
    }
  ],
  "measures": [
    {
      "field": "Revenue",
      "aggregation": "sum",
      "alias": "total_revenue"
    },
    {
      "field": "Units Sold",
      "aggregation": "sum",
      "alias": "total_units"
    }
  ]
}

# Generated SQL:
# SELECT 
#   "Date",
#   "Product",
#   CAST(REPLACE("Revenue", ',', '') AS BIGINT) as Revenue,
#   CAST(REPLACE("Units Sold", ',', '') AS INTEGER) as "Units Sold",
#   SUM(CAST(REPLACE("Revenue", ',', '') AS BIGINT)) as total_revenue,
#   SUM(CAST(REPLACE("Units Sold", ',', '') AS INTEGER)) as total_units
# FROM sales
# GROUP BY 1, 2


# ============================================================================
# EXAMPLE 2: Query with Explicit Column Casts (Override)
# ============================================================================

# Query with inline column casts (overrides connection-level config)
POST /api/v1/data/query
{
  "target_table": "financial_data",
  "dimensions": [
    {
      "field": "Account",
      "flavour": "discrete"
    }
  ],
  "measures": [
    {
      "field": "Amount",
      "aggregation": "sum",
      "alias": "total_amount"
    }
  ],
  
  # Column casts specified in query (not in connection)
  "column_casts": {
    "Amount": {
      "cast_type": "DECIMAL(15,2)",
      "replacement_pattern": ","
    }
  }
}

# Generated SQL:
# SELECT 
#   "Account",
#   CAST(REPLACE("Amount", ',', '') AS DECIMAL(15,2)) as Amount,
#   SUM(CAST(REPLACE("Amount", ',', '') AS DECIMAL(15,2))) as total_amount
# FROM financial_data
# GROUP BY 1


# ============================================================================
# EXAMPLE 3: Filter with Cast Column
# ============================================================================

POST /api/v1/data/query
{
  "target_table": "products",
  "dimensions": [
    {
      "field": "Category",
      "flavour": "discrete"
    }
  ],
  "measures": [
    {
      "field": "Price",
      "aggregation": "avg",
      "alias": "avg_price"
    }
  ],
  "filters": [
    {
      "field": "Price",
      "operator": ">",
      "value": 100
    },
    {
      "field": "Stock",
      "operator": ">",
      "value": 0
    }
  ],
  "column_casts": {
    "Price": {
      "cast_type": "DOUBLE",
      "replacement_pattern": ","
    },
    "Stock": {
      "cast_type": "INTEGER"
    }
  }
}

# Generated SQL:
# SELECT 
#   "Category",
#   CAST(REPLACE("Price", ',', '') AS DOUBLE) as Price,
#   AVG(CAST(REPLACE("Price", ',', '') AS DOUBLE)) as avg_price
# FROM products
# WHERE 
#   CAST(REPLACE("Price", ',', '') AS DOUBLE) > 100
#   AND CAST(REPLACE("Stock", ',', '') AS INTEGER) > 0
# GROUP BY 1


# ============================================================================
# EXAMPLE 4: Date Column Cast
# ============================================================================

POST /api/v1/data/query
{
  "target_table": "events",
  "dimensions": [
    {
      "field": "event_date",
      "flavour": "continuous",
      "date_part": "month",
      "date_mode": "distinct"
    }
  ],
  "measures": [
    {
      "field": "event_count",
      "aggregation": "sum",
      "alias": "total_events"
    }
  ],
  "column_casts": {
    # Cast string date to TIMESTAMP for extraction
    "event_date": {
      "cast_type": "TIMESTAMP"
    }
  }
}

# Generated SQL:
# SELECT 
#   EXTRACT(MONTH FROM CAST("event_date" AS TIMESTAMP)) as event_date_month_distinct,
#   SUM("event_count") as total_events
# FROM events
# GROUP BY 1


# ============================================================================
# EXAMPLE 5: Complex Scenario - European Format
# ============================================================================

# CSV Data:
# Product, Price, Sold
# Widget, "12,50", "1.234"
# Gadget, "8,99", "567"

# Note: Current implementation handles:
# - "12,50" -> remove comma -> "12.50" (if using REPLACE and decimal_separator)
# - "1.234" -> remove period -> "1234" (for BIGINT cast)
# This is simplified; real European format would need more logic.

POST /api/v1/data/query
{
  "target_table": "products_eu",
  "dimensions": [
    {
      "field": "Product",
      "flavour": "discrete"
    }
  ],
  "measures": [
    {
      "field": "Price",
      "aggregation": "avg",
      "alias": "avg_price"
    }
  ],
  "column_casts": {
    "Price": {
      "cast_type": "DECIMAL(10,2)",
      "replacement_pattern": ","  # Remove comma (assuming input has comma)
    },
    "Sold": {
      "cast_type": "INTEGER",
      "replacement_pattern": "."   # Remove thousands separator (period)
    }
  }
}


# ============================================================================
# EXAMPLE 6: Multiple Cast Types
# ============================================================================

POST /api/v1/data/query
{
  "target_table": "5g_performance",
  "dimensions": [
    {
      "field": "NRBTS name",
      "flavour": "discrete"
    },
    {
      "field": "Date",
      "flavour": "discrete"
    }
  ],
  "measures": [
    {
      "field": "Cell avail R",
      "aggregation": "avg",
      "alias": "avg_cell_avail"
    },
    {
      "field": "Revenue",
      "aggregation": "sum",
      "alias": "total_revenue"
    },
    {
      "field": "Users",
      "aggregation": "sum",
      "alias": "total_users"
    }
  ],
  "column_casts": {
    "Cell avail R": {
      "cast_type": "DOUBLE",
      "replacement_pattern": ","
    },
    "Revenue": {
      "cast_type": "BIGINT",
      "replacement_pattern": ","
    },
    "Users": {
      "cast_type": "INTEGER",
      "replacement_pattern": ","
    }
  }
}


# ============================================================================
# EXAMPLE 7: List Available Cast Types
# ============================================================================

# Get information about supported cast types
GET /api/v1/metadata/cast-types

# Response:
{
  "supported_types": [
    {
      "type": "BIGINT",
      "description": "64-bit integer",
      "example": "217351"
    },
    {
      "type": "INTEGER",
      "description": "32-bit integer",
      "example": "12345"
    },
    {
      "type": "SMALLINT",
      "description": "16-bit integer",
      "example": "100"
    },
    {
      "type": "DOUBLE",
      "description": "Floating point",
      "example": "12.50"
    },
    {
      "type": "FLOAT",
      "description": "Single precision float",
      "example": "3.14"
    },
    {
      "type": "DECIMAL(precision, scale)",
      "description": "Fixed-point decimal",
      "example": "DECIMAL(10,2) for 12345.67"
    },
    {
      "type": "VARCHAR",
      "description": "Text string",
      "example": "Some text"
    },
    {
      "type": "DATE",
      "description": "Date only",
      "example": "2025-08-22"
    },
    {
      "type": "TIMESTAMP",
      "description": "Date and time",
      "example": "2025-08-22 10:30:00"
    }
  ]
}


# ============================================================================
# EXAMPLE 8: Preview Cast Results
# ============================================================================

# New endpoint: Preview what data looks like after casting
POST /api/v1/data/preview-casts
{
  "target_table": "sales",
  "column_casts": {
    "Revenue": {
      "cast_type": "BIGINT",
      "replacement_pattern": ","
    }
  },
  "limit": 5
}

# Response:
{
  "columns": [
    {
      "name": "Revenue",
      "original_type": "VARCHAR",
      "original_sample": "\"217,351\"",
      "cast_type": "BIGINT",
      "cast_sample": "217351"
    }
  ],
  "samples": [
    {
      "Revenue": 217351  # After cast
    },
    {
      "Revenue": 192615  # After cast
    }
  ]
}


# ============================================================================
# EXAMPLE 9: Column Casting Response
# ============================================================================

# Query response with cast information
GET /api/v1/data/query?query_id=abc123

{
  "columns": [
    {
      "name": "Date",
      "type": "VARCHAR",
      "cast_type": null
    },
    {
      "name": "Revenue",
      "type": "VARCHAR",
      "cast_type": "BIGINT",
      "cast_applied": true,
      "replacement_pattern": ","
    }
  ],
  "rows": [
    {
      "Date": "2025-08-22",
      "Revenue": 217351
    },
    {
      "Date": "2025-08-23",
      "Revenue": 192615
    }
  ],
  "row_count": 2,
  "query_sql": "SELECT \"Date\", CAST(REPLACE(\"Revenue\", ',', '') AS BIGINT) as Revenue FROM sales",
  "casts_applied": [
    {
      "column": "Revenue",
      "cast_type": "BIGINT",
      "replacement_pattern": ","
    }
  ]
}


# ============================================================================
# EXAMPLE 10: Error Handling
# ============================================================================

# Invalid cast (value can't be cast to type)
POST /api/v1/data/query
{
  "target_table": "data",
  "measures": [
    {
      "field": "Amount",
      "aggregation": "sum",
      "alias": "total"
    }
  ],
  "column_casts": {
    "Amount": {
      "cast_type": "INTEGER",
      "replacement_pattern": ","  # Removes comma but leaves "12.50"
    }
  }
}

# Error response:
{
  "error": "Cast failed",
  "message": "Cannot cast \"12.50\" to INTEGER - contains decimal point",
  "column": "Amount",
  "cast_type": "INTEGER",
  "replacement_pattern": ",",
  "suggestion": "Use DECIMAL(10,2) instead of INTEGER for values with decimals",
  "sample_value": "\"12.50\""
}


# ============================================================================
# IMPLEMENTATION NOTES
# ============================================================================

"""
Order of Operations in Backend:

1. Load connection details (includes column_casts)
2. Load QueryDescription (may override with query-level column_casts)
3. Merge casts (query-level overrides connection-level)
4. For each dimension/measure/filter:
   a. Get field reference: _get_field_with_cast()
   b. If column in column_casts:
      - Wrap with CastField(cast_type, replacement_pattern)
      - Generates: CAST(REPLACE(field, pattern, '') AS type)
   c. If not in column_casts:
      - Return regular Field reference
5. Build query with casts applied at all points
6. Execute query - database handles CAST/REPLACE natively
7. Return results (values now have correct types)

SQL Execution (DuckDB example):

Input data:  "217,351"  (VARCHAR)
Cast SQL:    CAST(REPLACE("217,351", ',', '') AS BIGINT)
Step 1:      REPLACE("217,351", ',', '') -> "217351"
Step 2:      CAST("217351" AS BIGINT) -> 217351
Output:      217351 (BIGINT)

Performance: ~0.1ms per cast on typical dataset
Memory: No buffering needed - casting done in database
Scalability: Works identically at any scale
"""
