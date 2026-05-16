# Sharing via URL

Every saved snapshot has a **unique URL** that you can send to others. Anyone with the URL (and access to the same DataSlicer instance) can open the snapshot directly.

---

## Getting the share URL

1. Save your visualization as a [Snapshot](snapshots.md).
2. In the Snapshot Gallery, hover over the snapshot and click the **share / link** icon.  
   The URL is copied to your clipboard.
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

## What is and isn't included in the URL

The URL contains only the **snapshot ID** — not the full configuration inline. This means:

- The URL is short and clean.
- Changing the snapshot on your end updates what others see.
- If the snapshot is deleted from the server, the URL will no longer work.

For a self-contained shareable config (independent of the server), use [Export to File](export-import.md) instead.
