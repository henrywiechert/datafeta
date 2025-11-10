# Bar Chart Sorting - Future Enhancements

## Current Implementation (Complete)

✅ **Basic sorting** - Works for simple bar charts (single chart)
✅ **Faceted sorting** - Sorts globally across all facets using aggregate values
✅ **Visual indicators** - Shows arrow on field chip (e.g., `sum(revenue) ↑`)
✅ **Context menu** - Right-click measure field → "Bar Sort Order"
✅ **In-chart icon** - Bottom-right corner icon (optional, can be improved)

---

## Future Enhancement: Per-Facet Sorting with Alignment

### User Requirement
When multiple bar charts share a common category axis (faceting scenario), allow sorting based on a **specific facet's values** while maintaining alignment across all charts.

### Example Scenario
```
X-Axis: Product (discrete dimension - shared categories)
Y-Axis: Region (discrete dimension - creates multiple bar charts) + Revenue (measure)

Current behavior (Global sort):
- Sorts by TOTAL revenue across all regions
- All charts show: [Product A, Product C, Product B]

Desired behavior (Per-facet sort):
- User clicks sort on "North Region" facet
- Categories sorted by North Region's revenue: [Product C, Product A, Product B]
- All other facets (South, East, West) use the SAME order
- Categories remain aligned across all facets
```

### UI Design Options

#### Option 1: Sort Icon on Each Facet
Add a small sort icon to each individual facet/chart header:
```
┌─────────────────────────────────┐
│ North Region [↓]  ← Click here  │
├─────────────────────────────────┤
│  ███                            │
│  ███ ███ ███                    │
└─────────────────────────────────┘

┌─────────────────────────────────┐
│ South Region                    │
├─────────────────────────────────┤
│      ███                        │
│  ███ ███ ███                    │
└─────────────────────────────────┘

All charts use North Region's sort order
```

#### Option 2: Enhanced Context Menu
Add an additional option in the field menu:
```
Bar Sort Order ▶
  ├─ None (Natural Order)
  ├─ Ascending (Global - across all facets) ✔
  ├─ Descending (Global - across all facets)
  ├─ [separator]
  └─ Advanced ▶
      ├─ Sort by specific facet...
      └─ [Shows dropdown of facet values]
```

#### Option 3: Click-to-Sort on Facet Title
Make facet titles clickable:
- Click once: Sort by this facet (ascending)
- Click twice: Sort by this facet (descending)  
- Click third time: Reset to global/natural order
- Visual indicator shows which facet is controlling the sort

---

## Implementation Approach

### Data Structure Extension
Add to Field interface:
```typescript
export interface Field {
  // ... existing properties
  barSortOrder?: 'none' | 'asc' | 'desc';
  barSortFacet?: string; // NEW: Which facet value to sort by (e.g., "North Region")
}
```

### Sorting Logic
```typescript
// In generateFacetedGrid
if (measureWithSort && measureWithSort.barSortFacet) {
  // Filter data to only the specified facet
  const facetFieldName = getFieldColumnName(effectiveRowFacetFields[0] || effectiveColFacetFields[0]);
  const facetData = context.queryResult.rows.filter(
    row => row[facetFieldName] === measureWithSort.barSortFacet
  );
  
  // Sort using only that facet's data
  sortedCategoryDomain = sortCategoriesByValue(
    sortedCategoryDomain,
    facetData,  // ← Only one facet's data
    categoryColumnName,
    measureName,
    measureWithSort.barSortOrder
  );
} else {
  // Current behavior: sort by aggregate across all facets
  // ...
}
```

### UI Changes
1. **Facet headers need to be interactive**
   - Add click handler to facet title elements
   - Show visual indicator (icon) when a facet is controlling the sort
   
2. **Context menu enhancement**
   - Detect when in faceted mode
   - Show list of available facets to sort by
   - Update field with both `barSortOrder` and `barSortFacet`

3. **Visual feedback**
   - Field chip shows: `sum(revenue) ↓ (North Region)`
   - Facet controlling the sort shows indicator: `North Region [↓]`

---

## Edge Cases to Handle

### 1. Missing Categories in Controlling Facet
**Problem:** Selected facet doesn't have all categories
**Solution:** Categories missing from the controlling facet appear at the end in natural order

### 2. Switching Between Facets
**Problem:** User sorts by North, then sorts by South
**Solution:** Clear previous selection, apply new sort

### 3. Facet Structure Changes
**Problem:** User removes the facet dimension that was controlling the sort
**Solution:** Fall back to global aggregate sort

### 4. Multiple Measures
**Problem:** Multiple measures, each sorted by different facets
**Solution:** 
- Only one measure's sort can be active at a time
- Or: Each measure remembers its facet but only one is applied

---

## Priority

**Current Status:** ⚪ Not started (future enhancement)

**Estimated Effort:** Medium (1-2 days)
- UI changes: Add interactive facet headers
- State management: Track which facet controls sort
- Sorting logic: Filter data to specific facet before sorting
- Testing: Multiple facet scenarios

**Prerequisite:** Current implementation must be stable and well-tested

---

## Related Use Cases

### Use Case 1: Regional Performance
```
Scenario: Sales by product across regions
Action: Click sort on "North Region"
Result: All charts show products ranked by North Region performance
Benefit: Easily compare how other regions rank products differently
```

### Use Case 2: Time Comparison
```
Scenario: Category sales across months
Action: Click sort on "December"
Result: All months show categories ranked by December sales
Benefit: See which categories were strongest in peak season
```

### Use Case 3: Cohort Analysis
```
Scenario: Feature usage across user cohorts
Action: Click sort on "Power Users"
Result: All cohorts show features ranked by power user preferences
Benefit: Identify which features appeal differently to segments
```

---

## Alternative Approach: Multiple Sort Modes

Instead of per-facet sorting, offer different **aggregation methods**:

```
Bar Sort Order ▶
  ├─ None (Natural Order)
  ├─ By Total (Sum across all facets) ✔
  ├─ By Average (Mean across facets)
  ├─ By Maximum (Highest facet value)
  ├─ By Minimum (Lowest facet value)
  └─ By First Facet (Top/leftmost facet only)
```

**Pros:**
- Simpler UI (no need to click on individual facets)
- Clearer semantics (explicit about aggregation method)
- Works well when facets represent time or ordered categories

**Cons:**
- Less flexible than choosing specific facet
- Doesn't cover "sort by Q4 sales" use case directly

---

## Testing Checklist (When Implemented)

- [ ] Sort by first facet (row dimension)
- [ ] Sort by middle facet
- [ ] Sort by last facet
- [ ] Sort with missing categories in controlling facet
- [ ] Sort with 2D faceting (rows and columns)
- [ ] Switch between different facets dynamically
- [ ] Clear sort and return to natural order
- [ ] Visual indicators update correctly
- [ ] Field chip shows facet name in indicator
- [ ] Save/load configuration with facet-specific sort

---

## Documentation Needed

When implemented:
1. **User Guide:** How to use per-facet sorting
2. **Visual Examples:** Before/after screenshots
3. **Video Tutorial:** Demonstrating the feature
4. **API Documentation:** Field properties for facet sorting
5. **Migration Guide:** If changing existing behavior

---

## Notes

- Current global sorting is correct and useful for most cases
- Per-facet sorting is an advanced feature for power users
- Consider making it a "secondary" option (e.g., Shift+Click on facet)
- Could also offer both modes: "Sort globally" vs "Sort by specific facet"

