# Virtual Columns & Calculated Fields

Virtual columns let you create new fields derived from your existing data — without modifying the source. They appear in the Fields panel alongside regular columns and can be used in charts and filters just like any other field.

---

## Opening the Virtual Column Manager

Click the **"+ Column"** button at the bottom of the Fields panel, or right-click any field and choose **Add Virtual Column**.

The Virtual Column Manager dialog opens, listing any columns already defined.

---

## SQL Expressions

You can write any SQL expression supported by your data source.

Examples:

```sql
-- Profit margin as a percentage
revenue / NULLIF(cost, 0) * 100

-- Full name concatenated
first_name || ' ' || last_name

-- Bucketed age groups
CASE
  WHEN age < 18  THEN 'Under 18'
  WHEN age < 35  THEN '18–34'
  WHEN age < 55  THEN '35–54'
  ELSE '55+'
END
```

Give the column a **name** and click **Save**. The column immediately appears in the Fields panel as a Dimension or Measure (detected automatically from the expression return type).

---

## Numeric Binning

Binning groups a continuous numeric field into discrete buckets. This is useful for histograms and heatmaps.

1. In the Virtual Column Manager, click **Add Binned Column**.
2. Select the source numeric field.
3. Set the **number of bins** (DataSlicer calculates equal-width bucket boundaries from the data range).
4. The resulting Dimension contains values like `[0, 10)`, `[10, 20)`, etc.

---

## Date / Time Binning

Group a DateTime field by a calendar unit.

1. Select a Date field and choose **Bin by**.
2. Available units: **Year**, **Quarter**, **Month**, **Week**, **Day**, **Hour**.
3. The binned field acts as a Dimension — drag it to the X axis for time-series charts with consistent spacing.

---

## Field Aliases

To rename a field for display purposes without creating a full virtual column:

1. Right-click a field in the Fields panel.
2. Choose **Rename**.
3. Enter the display name.

The alias is saved with your snapshot configuration and does not affect the underlying data.

---

## Editing and deleting virtual columns

Open the Virtual Column Manager, click on any existing column to edit its expression, or click **Delete** to remove it.
