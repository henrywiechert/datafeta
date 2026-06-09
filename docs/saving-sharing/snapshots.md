# Snapshots

Snapshots save the complete state of a visualization — data source connection, field assignments, filters, properties, and sheet layout — so you can return to it later or share it with others.

---

## Saving a snapshot

Click the **Save** (💾) icon next to the sheet tab, or press **Quick Save** in the toolbar.

- Enter a **name** for the snapshot.
- Optionally place it in a **folder** (type a new folder name or select an existing one).
- Click **Save**.

The snapshot is stored on the server and persists across browser sessions.

---

## Opening the Snapshot Gallery

Click **Saved Configurations…** on the Connect page, or the gallery icon in the toolbar.

The gallery shows all saved snapshots, organised by folder. Click any snapshot to load it.

---

## Folders

Snapshots can be grouped into folders for organisation.

- To create a folder, type a new folder name when saving a snapshot.
- In the gallery, click a folder to expand or collapse it.
- Drag snapshots between folders in the gallery to reorganise them.

---

## Deleting snapshots

In the gallery, hover over a snapshot and click the **delete** (🗑) icon. You will be asked to confirm.

---

## Loading a snapshot

In the gallery, click a snapshot name. DataSlicer will:

1. Restore the data source connection (you may need to re-enter credentials for private databases).
2. Restore all field assignments, filters, and chart properties.
3. Open all sheets that were saved.

When the connection dialog appears, use **Same schema — swap database only** (ClickHouse) or **Same schema — swap file only** (CSV) to reconnect to a different database or file while keeping your saved table selections and sheet layouts. See [Export & Import](./export-import.md#swapping-the-data-source-same-schema) for details.
