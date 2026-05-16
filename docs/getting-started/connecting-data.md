# Connecting to a Data Source

On the **Connect** page, choose one of the four data source types and fill in the connection details.

---

## CSV Files

Upload one or more delimited text files (`.csv`, `.tsv`, etc.) directly from your computer.

**Steps:**

1. Select **CSV** as the connection type.
2. Click **Browse** and select one or more files.
3. Optionally adjust:
    - **Delimiter** — character separating columns (default: `,`)
    - **Decimal separator** — `.` or `,` depending on your locale
4. DataSlicer detects column headers automatically from the first row.
5. Click **Connect**.

To add more files to an existing CSV connection (already on the visualization page), use **Add Files** in the Fields panel.

---

## ClickHouse

Connect to a running ClickHouse database over HTTP.

**Steps:**

1. Select **ClickHouse** as the connection type.
2. Enter:
    - **Host** — e.g. `localhost` or a remote hostname
    - **Port** — default is `8123`
    - **Username / Password** — leave blank if authentication is disabled
3. Click **Connect**.
4. On the visualization page, use the **Database** and **Table** dropdowns to browse your schema.

---

## Hive / Parquet Files

Load columnar Parquet files, including large partitioned datasets.

**Steps:**

1. Select **Hive/Parquet** as the connection type.
2. Browse and select your Parquet files or partition folders.
3. Click **Connect**.

Partitions are loaded lazily — only the partitions needed for each query are read, keeping things fast on large datasets.

---

## Kaggle Datasets

Download and explore public datasets directly from Kaggle.

**Steps:**

1. Select **Kaggle** as the connection type.
2. Enter your **Kaggle dataset identifier** (e.g. `username/dataset-name`).
3. Click **Connect** — DataSlicer will download and index the dataset.

> **Note:** You need a Kaggle API key configured on the server for this to work. Contact your DataSlicer administrator if you encounter authentication errors.
