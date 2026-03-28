# Export & Import Configuration

In addition to server-side snapshots, you can export your visualization configuration as a local JSON file and import it on any DataSlicer instance.

---

## Exporting to a file

1. In the toolbar, click **Export Config** (or the download icon).
2. A `.json` file is downloaded to your computer containing the full configuration: data source details, field assignments, filters, properties, and all sheets.

This is useful for:
- Backing up a configuration locally
- Sharing a configuration with a colleague who is on a different DataSlicer instance
- Checking a configuration into version control

---

## Importing from a file

1. On the **Connect** page, click **Import Config from File…**.
2. Select the `.json` file exported previously.
3. DataSlicer reads the configuration and pre-fills the connection form and all visualization settings.
4. Click **Connect** to apply it.

---

## Difference from Snapshots

| | Export/Import | Snapshots |
|---|---|---|
| Storage | Your local file system | DataSlicer server |
| Sharing | Send the file manually | Share via URL or gallery |
| Works offline | Yes | Requires server access |
| Appears in gallery | No | Yes |
