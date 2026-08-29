# Sharing via URL

Every saved snapshot has a **unique URL** that you can send to others. Anyone with the URL (and access to the same DataSlicer instance) can open the snapshot directly.

---

## Getting the share URL

1. Save your visualization as a [Snapshot](snapshots.md).
2. In the Snapshot Gallery, hover over the snapshot and click the **share / link** icon.  
   The URL is shown so you can select and copy it.
3. Alternatively, after loading a snapshot the URL in your browser's address bar already contains the snapshot ID — you can copy that directly.

The URL looks like:  
```
http://your-dataslicer-host/?snapshot=abc123
```

---

## Opening a shared URL

Paste the URL into a browser. DataSlicer loads and applies the snapshot automatically.  
If the data source requires a password, you will be prompted for credentials before the data loads.

---

## Overriding the ClickHouse database

For ClickHouse snapshots that use a **single database** (no cross-database UNION), you can point the same saved analysis at another database with the same table and column names:

```
http://your-dataslicer-host/?snapshot=abc123&database=analytics_prod
```

When you open this URL:

1. The connection restore dialog prefills **Database** with the URL value.
2. **Same schema — swap database only** is enabled (and locked) so table selections and sheet layouts are kept.
3. You still enter the ClickHouse password, then connect.

If the snapshot is not ClickHouse, or it uses a cross-database UNION, the `database` parameter is ignored and a short message explains why. The gallery share link still uses `?snapshot=` only — append `&database=` yourself when needed.

See [Export & Import](./export-import.md#swapping-the-data-source-same-schema) for the same-schema assumption.

---

## What is and isn't included in the URL

The URL contains the **snapshot ID** (and optionally a ClickHouse `database` override) — not the full configuration inline. This means:

- The URL is short and clean.
- Changing the snapshot on your end updates what others see.
- If the snapshot is deleted from the server, the URL will no longer work.

For a self-contained shareable config (independent of the server), use [Export to File](export-import.md) instead.
