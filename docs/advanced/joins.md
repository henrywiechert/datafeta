# Joins & Unions

DataSlicer can combine data from multiple tables before visualizing it, using joins (for related tables in the same database) or unions (for appending rows from multiple tables or databases).

---

## Table Joins

A join merges two tables **horizontally** — matching rows from one table with rows from another on a common key.

**Steps:**

1. In the Fields panel, click the **table name** dropdown at the top to open the Data Sources panel.
2. Click **Add Join**.
3. Select the second table from the database browser.
4. Choose the **join key** columns (one from each table) and the join type:
    - **Inner** — only rows with matching keys in both tables
    - **Left** — all rows from the primary table; nulls where the joined table has no match
    - **Right** — all rows from the joined table
5. Click **Apply**.

Fields from both tables now appear in the Fields panel, prefixed with the table name if there are name conflicts.

---

## Cross-Database Unions

A union stacks two datasets **vertically** — appending the rows of one data source on top of another. Both sources must have compatible columns.

**Steps:**

1. In the Data Sources panel, click **Add Union Source**.
2. Connect a second data source (e.g. a second CSV file, another ClickHouse table).
3. DataSlicer maps columns by name. Columns that exist in only one source are filled with `null` in the other.

---

## Removing joins / unions

Open the Data Sources panel and click **×** next to the joined or union source to remove it.
