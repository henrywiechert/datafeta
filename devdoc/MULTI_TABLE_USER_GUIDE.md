# Multi-Table JOIN Feature - User Guide

## Overview

The multi-table JOIN feature allows you to automatically detect and join related tables in ClickHouse databases. It works by analyzing column naming patterns to identify foreign key relationships, then allowing you to toggle which tables to include in your queries.

## How It Works

### 1. Foreign Key Detection

When you select a table, the backend automatically scans for foreign key relationships using heuristic pattern matching:

**Pattern matching rules:**
- Looks for columns ending in `_id` or `id` (e.g., `customer_id`, `order_id`, `user_id`)
- Extracts the potential table name by removing the `_id` suffix
- Handles singular/plural variations (e.g., `customer_id` → `customers` table)
- Checks if the target table has an `id` column
- Creates a relationship: `source_table.foreign_key_column → target_table.id`

**Example:**
```
Table: orders
Column: customer_id
↓
Detects relationship: orders.customer_id → customers.id
```

### 2. UI Display

When relationships are detected:
- A "Related Tables" section appears below the table selector
- Click to expand and see all joinable tables
- Click any table chip to toggle joining it
- Joined tables show in blue with a "linked" icon

### 3. Field Browser Updates

When you join tables:
- Fields from all joined tables appear in the field browser
- Fields are prefixed with their table name (e.g., `customers.name`, `orders.total`)
- You can drag these prefixed fields to axes, filters, etc.

### 4. Query Generation

When you execute a query with joined fields:
- The backend automatically generates LEFT JOIN clauses
- Joins are based on the detected foreign key relationships
- The generated SQL includes proper table prefixes and ON conditions

**Example generated query:**
```sql
SELECT 
    orders.id,
    orders.order_date,
    customers.name as "customers.name",
    customers.city as "customers.city"
FROM orders
LEFT JOIN customers ON orders.customer_id = customers.id
```

## Setting Up a Test Database

To test the feature, you need tables with proper foreign key naming conventions:

### Option 1: Run the test setup script

```bash
clickhouse-client --database test_db < devdoc/test-multi-table-setup.sql
```

This creates:
- `customers` table (id, name, email, city)
- `orders` table (id, **customer_id**, order_date, total, status)
- `products` table (id, name, category, price)
- `order_items` table (id, **order_id**, **product_id**, quantity, price)

### Option 2: Create your own related tables

**Requirements:**
1. Foreign key columns must end in `_id` or `id`
2. The column name prefix should match the target table name
3. Target tables must have an `id` column

**Example:**
```sql
CREATE TABLE customers (
    id UInt32,
    name String
) ENGINE = Memory;

CREATE TABLE orders (
    id UInt32,
    customer_id UInt32,  -- Will be detected as FK to customers.id
    total Float64
) ENGINE = Memory;
```

## Limitations

### 1. Naming Convention Required

The FK detection **only works** if your columns follow these patterns:
- ✅ `customer_id` → matches `customers` table
- ✅ `order_id` → matches `orders` table
- ✅ `user_id` → matches `users` table
- ❌ `cust_ref` → won't match `customers`
- ❌ `ord_number` → won't match `orders`

### 2. Not for Partitioned Tables

If you have multiple tables with the **same schema** (e.g., `data_2024_01`, `data_2024_02`, `data_2024_03`), this feature won't help. Those tables should be combined with **UNION ALL**, not JOINs. That's a different feature not yet implemented.

### 3. ClickHouse Only

Currently only works with ClickHouse databases. CSV files don't support multi-table operations.

### 4. Heuristic-Based

Since ClickHouse doesn't enforce foreign key constraints, the detection is based on naming patterns. It may:
- **Miss relationships** if naming doesn't match conventions
- **Suggest incorrect relationships** if column names coincidentally match table names

## Troubleshooting

### "Found 0 joinable tables"

**Possible causes:**
1. **No FK naming patterns**: Your columns don't end in `_id` or `id`
2. **Table name mismatch**: Column prefix doesn't match any table name
3. **No id column**: Target tables don't have an `id` column
4. **Same-schema tables**: You have partitioned data, not related tables

**Check the backend logs:**
```
INFO: Found 0 joinable tables for 'your_table'
```

**Solution:**
- Enable debug logging to see which columns were checked
- Verify your column names follow the `tablename_id` pattern
- Create test tables with the setup script to verify the feature works

### Joined table fields don't appear

**Possible causes:**
1. The `fetchMergedColumns` API call failed
2. Backend couldn't generate the virtual table definition

**Check browser console for errors:**
```javascript
// Should see successful fetch
fetchMergedColumns: Success with X columns
```

### Query fails after joining tables

**Possible causes:**
1. Pydantic model not rebuilt (should be fixed)
2. Query service couldn't parse table-prefixed field names
3. Backend couldn't generate valid JOIN syntax

**Check backend logs for:**
```
ERROR: Failed to execute query: ...
```

## Future Enhancements

Potential improvements for future versions:

1. **Manual relationship definition**: Allow users to manually specify join conditions
2. **Multiple join paths**: Support choosing between different FK relationships
3. **UNION ALL support**: Combine partitioned tables with same schema
4. **Join type selection**: Allow choosing INNER, LEFT, RIGHT, FULL joins
5. **Relationship visualization**: Show a diagram of detected relationships
6. **Smart aliasing**: Automatically handle table name collisions
7. **Performance optimization**: Cache FK detection results

## Example Workflow

1. **Connect to ClickHouse** with the test database
2. **Select database**: `test_db`
3. **Select table**: `orders`
4. **See suggested tables**: `customers` appears in Related Tables section
5. **Toggle join**: Click the `customers` chip
6. **Browse fields**: See `customers.name`, `customers.city`, etc. in field browser
7. **Build visualization**: Drag `orders.order_date` to X-axis, `customers.city` to color
8. **Execute**: Backend generates and runs the JOIN query automatically

## API Endpoints

The feature uses these endpoints:

- `GET /api/v1/data/suggested-joins?database=X&primary_table=Y`
  - Returns list of joinable tables for a primary table
  
- `POST /api/v1/data/merged-columns`
  - Returns combined columns from primary + joined tables
  - Columns include `table_name` field for source tracking
  
- `POST /api/v1/data/query`
  - Executes queries with `virtual_table` definition
  - Automatically generates JOIN clauses
