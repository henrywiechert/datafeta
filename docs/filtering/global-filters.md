# Global Filters

Global filters are shared across **all sheets** in your workspace. When you update a global filter on one sheet, all other sheets automatically apply the same restriction.

---

## Base filters vs. refinement filters

DataSlicer has two tiers of filters:

| Tier | Scope | Description |
|---|---|---|
| **Base (global) filters** | All sheets | Applied everywhere; locked to the shared definition |
| **Refinement filters** | Current sheet only | Local adjustments on top of the base filters |

---

## Making a filter global

1. Add a filter as normal (drag a field to the Filters drop zone).
2. In the filter panel, click the **globe** icon (🌐) or toggle **Global** to promote the filter.
3. The filter will now appear on every sheet with the same settings.

---

## Editing a global filter

Edit it from any sheet — the change propagates immediately to all other sheets in the current session.

---

## Local refinements

If you need a different date range or value subset on just one sheet without affecting the others, use a **refinement filter** (the default, non-global filter). Refinement filters narrow down the data further on top of any base/global filters.
