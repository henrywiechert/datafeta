# Connecting to a Data Source

On the **Connect** page, choose one of the four data source types and fill in the connection details.

---

## CSV / Parquet / JSON Files

Upload one or more files directly from your computer. Supported formats:

| Format | Extensions |
|---|---|
| Delimited text | `.csv`, `.tsv`, `.txt` |
| Columnar | `.parquet` |
| JSON | `.json`, `.ndjson`, `.jsonl` |

**Steps:**

1. Select **File (CSV, Parquet, JSON)** as the connection type.
2. Click **Browse** and select one or more files (formats can be mixed).
3. For CSV files, optionally adjust:
    - **Delimiter** — character separating columns (default: `,`)
    - **Decimal separator** — `.` or `,` depending on your locale
4. Click **Connect**.

Each file becomes its own queryable table. To add more files after connecting, use **Add Files** in the Fields panel.

### JSON / NDJSON / JSONL

JSON files are automatically flattened on connect so nested structures become regular columns:

- **Nested objects** → `parent__child` columns (e.g. `address.city` → `address__city`)
- **Arrays** → one row per element plus a `field__index` position column
- **Arrays of objects** → combined: `events__index`, `events__name`, `events__ts`, …

The result is materialised as Parquet internally, so queries are fast regardless of the original file size. Large single-object files (such as Chrome Trace Format `.json` files) are fully supported.

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
