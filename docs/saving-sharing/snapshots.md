# Snapshots

Snapshots save the complete state of a visualization — data source connection, field assignments, filters, properties, and sheet layout — so you can return to it later or share it with others.

---

## Saving a snapshot

Snapshots behave like documents: you open one, work on it, and save it.

All snapshot actions live in the **⋮** menu at the right-hand end of the bottom bar.

### Save As…

Creates a **new** snapshot.

- Enter a **name** for the snapshot.
- Optionally place it in a **folder** (type a new folder name or select an existing one).
- Click **Save**.

The snapshot is stored on the server and persists across browser sessions. The workspace then
continues working against the snapshot you just created.

### Save

Updates the snapshot you currently have open, in place — no name prompt, no picking it out of a
list. Press `Cmd+S` / `Ctrl+S`, or choose **Save** from the **⋮** menu.

The name of the open snapshot is shown in the bottom bar next to the **⋮** menu. A bullet (`•`)
in front of the name means there are unsaved changes:

```
• Sales/Reports / Q3 Revenue     ⋮
```

If no snapshot is open — for example you just imported a file or loaded a demo dataset — **Save**
prompts you for a name, exactly like **Save As…**. This is deliberate: loading a demo dataset
leaves the workspace untitled so that saving cannot overwrite a shared demo configuration.

---

## Opening the Snapshot Gallery

Choose **Saved Configurations…** from the **⋮** menu, or click **Saved Configurations…** on the
Connect page.

The gallery shows all saved snapshots, organised by folder. Click any snapshot to load it. The
snapshot you currently have open is marked **Current**, and its folder is expanded for you.

To overwrite a *different* snapshot with your current configuration, use the **Overwrite with
current** (💾) icon on that snapshot's row and confirm. To update the snapshot you already have
open, just use **Save**.

---

## Folders

Snapshots can be grouped into folders for organisation.

- To create a folder, type a new folder name in the **Folder** field when saving a snapshot.
- In the gallery, click a folder to expand or collapse it.
- To move a snapshot, use the **Move to folder** icon on its row in the gallery.

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

For ClickHouse, you can also share a [URL with a `database` parameter](./url-sharing.md#overriding-the-clickhouse-database) so recipients open the snapshot against a specific database without changing the saved snapshot.
