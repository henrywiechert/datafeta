# Connecting to a Data Source

On the **Connect** page, choose a data source type and fill in the connection details.

---

## CSV / Parquet / JSON / Excel Files

Upload one or more files directly from your computer. Supported formats:

| Format | Extensions |
|---|---|
| Delimited text | `.csv`, `.tsv`, `.txt` |
| Columnar | `.parquet` |
| JSON | `.json`, `.ndjson`, `.jsonl` |
| Excel / OpenDocument | `.xlsx`, `.xlsm`, `.xls`, `.xlsb`, `.ods` |

**Steps:**

1. Select **File (CSV, Parquet, JSON, Excel)** as the connection type.
2. Click **Browse** and select one or more files (formats can be mixed).
3. For CSV files, optionally adjust:
    - **Delimiter** — character separating columns (default: `,`)
    - **Decimal separator** — `.` or `,` depending on your locale
4. Click **Connect**. If a workbook has more than one sheet, choose the sheets to load in the
   **Select Sheets** dialog.

<video src="../../assets/snippets/connect-file.webm" poster="../../assets/snippets/connect-file.png" controls loop muted playsinline width="100%"></video>

Each file becomes its own queryable table (a workbook: one table per selected sheet). To add more files after connecting, use **Add Files** in the Fields panel.

### JSON / NDJSON / JSONL

JSON files are automatically flattened on connect so nested structures become regular columns:

- **Nested objects** → `parent__child` columns (e.g. `address.city` → `address__city`)
- **Arrays** → one row per element plus a `field__index` position column
- **Arrays of objects** → combined: `events__index`, `events__name`, `events__ts`, …

The result is materialised as Parquet internally, so queries are fast regardless of the original file size. Large single-object files (such as Chrome Trace Format `.json` files) are fully supported.

### Excel / OpenDocument workbooks

After you click **Connect** (or **Add Files**), a **Select Sheets** dialog lists every sheet of each
workbook. Visible sheets are selected by default; hidden sheets and chart sheets are shown but cannot
be loaded. Workbooks with a single usable sheet skip the dialog.

- **Tables** are named `workbook_sheet` (or just `workbook` when it has a single usable sheet).
- **Title rows** above the header (report titles, blank lines) are skipped automatically.
- **Column types** come from every cell: whole numbers become integers, a column that mixes numbers
  and text stays text, and date-formatted cells become dates or timestamps.
- **Dates stored as text** (e.g. `10/04/2026 22:00`) are parsed with the **Date Format** /
  **Timestamp Format** under **Advanced Excel Options** — choose `MM/DD/YYYY HH:MM` or
  `DD/MM/YYYY HH:MM` to match your export.
- **Formulas** show the value Excel last saved with the file.

Saved workspaces remember which sheets were loaded, so restoring one loads the same sheets again.
See [Excel Files](../reference/data-sources.md#excel-files) for the details.

---

## SQLite Database Files

Upload a SQLite database file (`.sqlite`, `.sqlite3` or `.db`). One file holds a whole schema, so
every table and view in it becomes queryable at once.

**Steps:**

1. Select **SQLite Database File** as the connection type.
2. Click **Browse** and select the database file.
3. Click **Connect**.
4. On the visualization page, pick the primary table from the **Table** dropdown.

The file is opened read-only and is never modified. Tables can be combined with **Union**, and
because SQLite stores real foreign keys, joinable tables are suggested straight from the schema —
see [Joining Tables](../advanced/joins.md).

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

## InfluxDB

Load measurements from InfluxDB 1.8, or from InfluxDB 2.x through its v1 (InfluxQL) API.

**Steps:**

1. Select **InfluxDB 1.8 / 2.x** as the connection type.
2. Enter the **Server URL**, e.g. `http://localhost:8086`, and choose the authentication:
    - **None** — the server has authentication disabled
    - **Username and password** — an InfluxDB 1.8 user, or a 2.x v1-auth user
    - **API token (2.x)** — a token with read access to the bucket
3. Type the **Database**, or click **List databases** and pick one. On 2.x, a database is a bucket
   with a DBRP mapping.
4. Optionally click **Load measurements** and untick the ones you don't need. Without a selection,
   every measurement is loaded.
5. Choose the **Time range**: the last N minutes/hours/days/weeks, a fixed UTC window, or all time.
6. Click **Connect**.

The points are copied into DataSlicer once, when you connect; each measurement becomes a table. To
see newer data, reconnect. See [Data Source Reference](../reference/data-sources.md#influxdb) for
how tags, fields and timestamps are mapped.

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
