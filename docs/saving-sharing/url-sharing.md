# Sharing via URL

Every saved snapshot has a **unique URL** that you can send to others. Anyone with the URL (and access to the same DataSlicer instance) can open the snapshot directly.

---

## Getting the share URL

Choose **Share…** from the **File** menu, or click the **share** icon next to the snapshot name in
the bottom bar. Click **Copy link** to put the URL on the clipboard.

A link always opens what is saved on the server, so **Share…** only hands one out for saved work:

| Workspace | What Share offers |
|---|---|
| Open snapshot, no unsaved changes | The link, ready to copy |
| Open snapshot with unsaved changes (`•` in the bottom bar) | **Save & share** — saves the snapshot in place, then shows the link |
| New analysis (no snapshot open) | **Save as snapshot…** — name the snapshot, then the link is shown |

On a read-only server, unsaved changes cannot be saved; **Share…** then gives the link to the last
saved version. A new analysis cannot be shared as a link there — use
[Export to File](export-import.md) instead.

On plain-HTTP deployments the browser may block clipboard access. The link field is then selected
for you — press `Cmd+C` / `Ctrl+C` to copy it.

You can also copy a link from the Snapshot Gallery (hover over a snapshot and click the **link**
icon), or from your browser's address bar after loading a snapshot.

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

If the snapshot is not ClickHouse, or it uses a cross-database UNION, the `database` parameter is ignored and a short message explains why. **Share…** keeps the `database` parameter in the link it gives you, so recipients see the same database. The gallery share link uses `?snapshot=` only — append `&database=` yourself when needed.

See [Export & Import](./export-import.md#swapping-the-data-source-same-schema) for the same-schema assumption.

---

## What is and isn't included in the URL

The URL contains the **snapshot ID** (and optionally a ClickHouse `database` override) — not the full configuration inline. This means:

- The URL is short and clean.
- Changing the snapshot on your end updates what others see.
- If the snapshot is deleted from the server, the URL will no longer work.

For a self-contained shareable config (independent of the server), use [Export to File](export-import.md) instead.
