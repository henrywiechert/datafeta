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

### Adding a whole database at once (ClickHouse)

When your databases share a schema — one per tenant, per region or per release —
you usually want *the same tables* from another database. The Data Source card's
database row has two buttons for this. Pick a database from the dropdown first:
choosing one stages it and does nothing on its own.

| Button | What it does |
|--------|--------------|
| ⇄ | **Switch**: keep the tables you have and read them from the staged database instead. |
| ⊞ | **Add**: keep what you have *and* append the same tables from the staged database as unions. |

So with `prod_us.orders` and `prod_us.events` selected, staging `prod_eu` and
pressing ⊞ adds `prod_eu.orders` and `prod_eu.events` in one click. Hover either
button before clicking and the tooltip tells you exactly what it will do —
including how many tables it will add and any that the staged database does not
have. If a button is greyed out, its tooltip says why.

After an add, a line appears under the picker summarising what landed, with an
**Undo** that removes just those tables.

Two things worth knowing:

- Only tables whose names match are added. Anything without a counterpart in the
  staged database is skipped and named in the summary.
- Once you have combined tables from more than one database, ⇄ is unavailable —
  there is no single database left to switch to. Remove the extra tables from
  **Selected Tables** to get it back.

### Removing the primary table

The primary table is the one marked **P**. Removing it clears the *whole*
selection — every unioned and joined table goes with it, along with detected
relationships — so DataSlicer asks first and tells you what you are about to
lose. Fields already placed on the axes are marked invalid either way.

### Removing a database again

In **Selected Tables**, rows belonging to another database carry two icons: the
usual bin removes that one table, and the brush beside it removes *every* table
of that database at once. It asks for confirmation first and lists what it is
about to drop.

The brush does not appear on rows of your primary table's own database — losing
those would clear the primary and reset your joins and relationships with it —
nor on a database contributing only one table, where the bin already does the
job.

To pick tables by a name pattern across many databases instead, use **Add by
pattern** in the Data Source header.

---

## Removing joins / unions

Open the Data Sources panel and click **×** next to the joined or union source to remove it.
