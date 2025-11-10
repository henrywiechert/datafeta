# Bar Chart Sorting by Value - UI Proposal

## Current State
Currently, bar charts display categories in the order they appear in the data (typically alphabetically or by natural data order). There's no ability to sort bars by their measure values.

## Goal
Enable users to sort bars by value in both ascending and descending order for both vertical and horizontal bar charts.

---

## Proposed UI Solutions

### **Option 1: Sort Control on Measure Field Chip (Recommended)**

**Description:** Add a sorting option directly to the measure field chip context menu on the axis.

**How it works:**
- Right-click on a **measure** field chip (e.g., `sum(sales)`) when it's placed on an axis
- New menu section appears: **"Bar Sort Order"**
  - **None** (default) ✔
  - **Ascending** ↑
  - **Descending** ↓

**Visual:**
```
┌─────────────────────────────────────────┐
│ Context Menu for "sum(sales)"           │
├─────────────────────────────────────────┤
│  Dimension                               │
│  Measure ✔                               │
├─────────────────────────────────────────┤
│  Discrete                                │
│  Continuous ✔                            │
├─────────────────────────────────────────┤
│  sum ✔                                   │
│  avg                                     │
│  count                                   │
│  count_distinct                          │
│  min                                     │
│  max                                     │
├─────────────────────────────────────────┤
│ ▶ Bar Sort Order                         │
│   ├─ None ✔                              │
│   ├─ Ascending ↑                         │
│   └─ Descending ↓                        │
└─────────────────────────────────────────┘
```

**Field Type Extension:**
```typescript
export interface Field {
  // ... existing properties
  barSortOrder?: 'none' | 'asc' | 'desc';  // New property
}
```

**Pros:**
- ✅ Contextual - appears where measures are configured
- ✅ No additional UI clutter
- ✅ Follows existing pattern (similar to aggregation selection)
- ✅ Works for both orientations automatically
- ✅ Clear and discoverable

**Cons:**
- ⚠️ Only visible via right-click menu (not immediately visible)
- ⚠️ May be less obvious for first-time users

**When to show:**
- Only show "Bar Sort Order" when:
  - The field is a measure
  - The field is on an axis (X or Y)
  - The current chart type produces a bar chart (has categories)

---

### **Option 2: Inline Sort Indicator on Field Chip**

**Description:** Add small sort indicator icons directly on the measure field chip.

**How it works:**
- When a measure field is on an axis, a small sort icon appears on the chip
- Clicking the icon cycles through: `None → Asc ↑ → Desc ↓ → None`
- Icon changes to show current state

**Visual:**
```
X Axis:
┌─────────────────┐ ┌──────────────────────┐
│ 📊 category     │ │ 📈 sum(sales) [↓]   │  ← Click [↓] to toggle sort
└─────────────────┘ └──────────────────────┘

States:
[  ] = No sort (natural order)
[↑] = Sort ascending (smallest to largest)
[↓] = Sort descending (largest to smallest)
```

**Pros:**
- ✅ Immediately visible - no menu needed
- ✅ Quick toggling with single click
- ✅ Visual indicator of current sort state
- ✅ Familiar pattern (similar to table column headers)

**Cons:**
- ⚠️ Takes up space on the chip
- ⚠️ Could be accidentally clicked
- ⚠️ May be confusing with multiple measures (which one sorts?)
- ⚠️ Less clean visual design

---

### **Option 3: Chart Controls Panel**

**Description:** Add sort controls to a dedicated chart controls area above/below the chart.

**How it works:**
- A small controls panel appears when viewing a bar chart
- Contains sorting options for the measure(s)
- Dropdown or button group to select sort order

**Visual:**
```
┌─────────────────────────────────────────────────────────┐
│ Chart Controls                                          │
│ Sort: [Dropdown: sum(sales) ▼] [⬆️ Asc] [⬇️ Desc] [⭕ None] │
└─────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────┐
│                                                         │
│           █                                             │
│           █                                             │
│           █   █                                         │
│       █   █   █   █                                     │
│   █   █   █   █   █                                     │
│   ──────────────────                                    │
│   A   B   C   D   E                                     │
└─────────────────────────────────────────────────────────┘
```

**Pros:**
- ✅ Clear and explicit
- ✅ Easy to discover
- ✅ Good for multiple measures (can select which one to sort by)

**Cons:**
- ⚠️ Takes up screen space
- ⚠️ Creates visual clutter
- ⚠️ Requires new UI component/panel
- ⚠️ Less contextual to the field configuration

---

### **Option 4: Dimension Field Sort Control**

**Description:** Add sort control to the **dimension** (category) field instead of measure.

**How it works:**
- Right-click on the dimension field (e.g., `category`)
- Menu shows: **"Sort By"**
  - **None** (alphabetical/natural) ✔
  - **Value Ascending** ↑
  - **Value Descending** ↓

**Visual:**
```
┌─────────────────────────────────────────┐
│ Context Menu for "category"             │
├─────────────────────────────────────────┤
│  Dimension ✔                             │
│  Measure                                 │
├─────────────────────────────────────────┤
│  Discrete ✔                              │
│  Continuous                              │
├─────────────────────────────────────────┤
│ ▶ Sort By                                │
│   ├─ None (Alphabetical) ✔               │
│   ├─ Value Ascending ↑                   │
│   └─ Value Descending ↓                  │
└─────────────────────────────────────────┘
```

**Pros:**
- ✅ Conceptually matches "sorting categories"
- ✅ Works well when there's only one dimension
- ✅ No UI clutter

**Cons:**
- ⚠️ Less intuitive (you're sorting by value, but configuring on dimension)
- ⚠️ Ambiguous with multiple measures (which value to sort by?)
- ⚠️ Doesn't clearly indicate it's sorting by measure value

---

## Recommendation: **Option 1** (Sort Control on Measure Field Chip)

### Why Option 1 is best:

1. **Semantic clarity**: You're sorting by the measure value, so the control belongs on the measure field
2. **Minimal UI changes**: Uses existing context menu pattern
3. **Scales well**: If you have multiple measures, each can have its own sort setting
4. **No visual clutter**: Hidden until needed
5. **Consistent with existing patterns**: Similar to how aggregations are selected

### Implementation Details for Option 1

#### 1. **Field Type Update**
```typescript
// In types.ts
export interface Field {
  id: string;
  columnName: string;
  type: FieldType;
  aggregation?: Aggregation;
  flavour: Flavour;
  dataType: DataType;
  axis?: 'x' | 'y';
  dateTimePart?: DateTimePart;
  dateTimeMode?: DateTimeMode;
  castType?: ColumnCastConfig['cast_type'];
  castReplacement?: string;
  barSortOrder?: 'none' | 'asc' | 'desc';  // NEW
}
```

#### 2. **Context Menu Update**
Add new menu section in `FieldMenuItems.tsx`:
```typescript
// Show bar sort options only for measures on axes in bar chart context
{isMeasure && isInAxisDropZone && (
  <>
    <div className={menuStyles.separator} />
    <SubMenu label="Bar Sort Order">
      <div className={menuStyles.menuItem} onClick={() => onUpdate({ barSortOrder: 'none' })}>
        None (Natural Order) {(!field.barSortOrder || field.barSortOrder === 'none') && '✔'}
      </div>
      <div className={menuStyles.menuItem} onClick={() => onUpdate({ barSortOrder: 'asc' })}>
        Ascending ↑ {field.barSortOrder === 'asc' && '✔'}
      </div>
      <div className={menuStyles.menuItem} onClick={() => onUpdate({ barSortOrder: 'desc' })}>
        Descending ↓ {field.barSortOrder === 'desc' && '✔'}
      </div>
    </SubMenu>
  </>
)}
```

#### 3. **Visual Indicator (Optional Enhancement)**
Add a small sort indicator to the chip label when sorting is active:
```typescript
// In ChipWithTooltip.tsx or FieldChip label
const displayLabel = field.type === 'measure' && field.barSortOrder && field.barSortOrder !== 'none'
  ? `${baseLabel} ${field.barSortOrder === 'asc' ? '↑' : '↓'}`
  : baseLabel;
```

#### 4. **Bar Chart Logic Update**
In `barCore.ts` or `barUnified.ts`, apply sorting before rendering:
```typescript
// In buildBarOptions or similar
if (measureField.barSortOrder && measureField.barSortOrder !== 'none') {
  // Aggregate data by category
  const aggregated = aggregateByCategory(data, categoryColumn, measureName);
  
  // Sort by value
  aggregated.sort((a, b) => {
    const diff = a.value - b.value;
    return measureField.barSortOrder === 'asc' ? diff : -diff;
  });
  
  // Extract sorted categories
  const sortedCategories = aggregated.map(item => item.cat);
  
  // Use sorted categories as domain
  categoriesDomain = sortedCategories;
}
```

---

## Behavior Specifications

### General Rules:
1. **Default:** No sorting applied (`barSortOrder: undefined` or `'none'`)
2. **Activation:** Only effective when viewing a bar chart
3. **Multiple measures:** Each measure can have its own sort setting
   - Only one measure's sort setting should be active at a time
   - Priority: first measure field on the axis wins
4. **Both orientations:** Works automatically for vertical and horizontal bars

### Edge Cases:
- **Stacked bars:** Sort by total stack height (sum of all segments)
- **Multiple measures on same axis:** Apply sort from first measure with non-'none' setting
- **Faceted charts:** Apply sort within each facet independently
- **Missing values:** Treat as zero or place at end of sorted list

### User Feedback:
- When sort is active, show small indicator on field chip (e.g., `sum(sales) ↓`)
- Clear indication in context menu which sort is active
- Sort applies immediately upon selection (no "Apply" button needed)

---

## Alternative: Hybrid Approach (Option 1 + Option 2)

For maximum usability, combine approaches:
- **Right-click menu** (Option 1): Primary method to configure sort
- **Visual indicator** (Option 2): Small clickable icon on chip to quickly toggle
  - Shows current state: `[↑]`, `[↓]`, or nothing
  - Click to cycle through options
  - Right-click for full menu

This gives both discoverability (visual indicator) and full control (menu).

---

## Next Steps

1. **Decide on approach**: Option 1 recommended, possibly with visual indicator
2. **Update Field interface**: Add `barSortOrder` property
3. **Update FieldMenuItems**: Add sort menu section
4. **Update bar chart builder**: Apply sorting logic
5. **Add visual indicator** (optional): Update chip display
6. **Test with various scenarios**: Single/multiple measures, stacked bars, facets
7. **Document feature**: Add to user guide

---

## Questions to Consider

1. **Should sorting persist when switching chart types?**
   - Recommendation: Yes, but only apply when viewing a bar chart
   
2. **Should there be a global "reset all sorts" action?**
   - Recommendation: Not necessary initially; can clear on each field individually

3. **How to handle sorting with multiple measures?**
   - Recommendation: Only apply sort from one measure at a time (first one wins)
   - Could add dropdown to select "sort by: [measure]" in future

4. **Should dimension fields show which measure they're sorted by?**
   - Recommendation: Visual indicator on measure chip is sufficient

5. **Should this work for other chart types?**
   - Recommendation: Initially bar charts only; could extend to others later

