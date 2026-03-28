# Data Source Reference

Connector-specific notes and configuration options.

---

## CSV Files

| Option | Default | Notes |
|---|---|---|
| Delimiter | `,` | Use `\t` for TSV; any single character works |
| Decimal separator | `.` | Set to `,` for European locale files |
| Header detection | Automatic | First row is used as column names |
| Supported extensions | `.csv`, `.tsv`, `.txt` | Any plain-text delimited format |

**Multiple files:** You can load several CSV files as if they were one table. All files must have the same column structure. Use **Add Files** on the visualization page to add files to an existing CSV connection.

---

## ClickHouse

| Option | Default | Notes |
|---|---|---|
| Host | `localhost` | Hostname or IP of the ClickHouse server |
| Port | `8123` | HTTP interface port (not the native TCP port 9000) |
| Username | *(empty)* | Leave blank for anonymous access |
| Password | *(empty)* | |
| Database | *(from browser)* | Select after connecting |

DataSlicer uses the ClickHouse **HTTP interface**. Make sure port `8123` (or your configured HTTP port) is accessible from the DataSlicer server.

---

## Hive / Parquet

| Option | Notes |
|---|---|
| Partition files | Select all partition files or the top-level folder |
| Lazy loading | Only partitions needed for the current query are read |

Large Parquet datasets work best when partitioned by a common dimension (e.g. date). Use a filter on the partition key as a first filter to avoid scanning all partitions.

---

## Kaggle

| Option | Notes |
|---|---|
| Dataset identifier | Format: `owner/dataset-name` (from the Kaggle URL) |
| API key | Must be configured on the server by an administrator |

The dataset is downloaded and cached on the server the first time it is accessed. Subsequent connections are fast.
