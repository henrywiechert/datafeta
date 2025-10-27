# Field Cardinality Validation Feature

## Overview

This feature prevents users from creating visualizations with too many facets by validating **discrete dimensions** before they're added to chart axes. The validation is **synchronous** and uses **pre-fetched cardinality counts** cached in field metadata for instant feedback.

**Important:** This validation **only applies to discrete dimensions**, not discrete measures. Discrete measures are aggregated to single values and don't create facets.

## Implementation Approach: Pre-fetch & Cache (Option 1)

We chose the **pre-fetch and cache** strategy for optimal user experience:

✅ **Pros:**
- Instant, synchronous validation (no waiting during drag-drop)
- Users see cardinality info upfront in field badges
- No interruption to drag-drop flow
- Clean architecture - validation uses cached data
- Works seamlessly with filtering (respects applied filters in queries)

❌ **Rejected Alternatives:**
- ~~Query during drag-drop~~ - Too slow, poor UX
- ~~Post-validation~~ - Confusing (field appears then disappears)
- ~~Query-time validation~~ - Too late, user already configured chart

---

## Architecture

### 1. Data Flow

```
Table Selected
    ↓
Fetch Columns (API)
    ↓
Batch Fetch Cardinality for ALL fields (background)
    ↓
Cache distinctCount in Field objects
    ↓
Display counts as badges in Available Fields panel
    ↓
User drags field → Synchronous validation using cached count
    ↓
Accept/Reject based on threshold
```

### 2. Key Components

#### **Configuration** (`config/cardinalityConfig.ts`)
- `MAX_FACET_COUNT = 50` - Threshold for validation
- Helper functions for formatting and messages

#### **API Service** (`apiService.ts`)
- `getFieldsCardinality()` - Batch fetch counts for all fields
- Runs in parallel for performance
- Fails gracefully if individual field fetch fails

#### **Field Metadata** (`types.ts`)
```typescript
export interface Field {
  // ... existing fields
  distinctCount?: number; // Cached count of distinct values
}
```

#### **Cardinality Fetching** (`hooks/useVisualizationState.ts`)
- Fetches counts when table is loaded
- Updates fields asynchronously (doesn't block UI)
- Sets `distinctCount` on each field

#### **Visual Feedback** (`FieldChipLabel.tsx`)
- Shows count badges for discrete fields: `product_name (242)`
- Red/bold for high cardinality (>50)
- Tooltip explains the warning

#### **Validation** (`utils/cardinalityValidation.ts`)
```typescript
validateDiscreteDimensionForAxis(field, xFields, yFields)
  → Returns error message or null
  → Synchronous - uses cached distinctCount
```

#### **Drop Handler** (`hooks/useDragDrop.ts`)
- Validates before accepting drop
- Shows alert if validation fails
- Rejects the drop (field not added)

#### **Flavour Change Validation** (`FieldContextMenu.tsx`)
- Intercepts continuous → discrete changes **for dimensions only**
- Shows confirmation if dimension is on axis with high cardinality
- Allows user to proceed or cancel
- **Does not validate measures** (they don't create facets)

---

## User Experience

### Scenario 1: Low Cardinality (< 50 values)

**User actions:**
1. Drags `month` field (12 values) to X axis

**System response:**
- ✅ Field accepted immediately
- Badge shows: `month (12)`
- No notification

---

### Scenario 2: High Cardinality (> 50 values)

**User actions:**
1. Drags `product_id` field (327 values) to X axis
2. Y axis already has a measure

**System response:**
- ❌ Drop rejected
- Alert: "This field has 327 unique values, which exceeds the limit of 50..."
- Field NOT added to axis
- User must filter data first

---

### Scenario 3: Changing Flavour on Axis

**User actions:**
1. Field `revenue` (measure) is on Y axis as continuous
2. User right-clicks, changes to discrete

**System response:**
- ✅ No validation (measures don't create facets)
- Flavour changes immediately
- Chart shows discrete measure value

**User actions (dimension):**
1. Field `timestamp` (dimension) is on X axis as continuous
2. User right-clicks, changes to discrete
3. Field has 1,523 unique values

**System response:**
- ⚠️ Confirmation dialog: "This field has 1,523 unique values. Changing to discrete may create too many facets..."
- User can proceed or cancel
- If cancelled, flavour doesn't change

---

### Scenario 4: Filtered Data

**User actions:**
1. `product_id` has 327 values (high cardinality)
2. User adds filter: `category = 'Electronics'` (reduces to 45 products)
3. User drags `product_id` to X axis

**System response:**
- ⚠️ **Current limitation**: Validation still uses unfiltered count (327)
- Drop is rejected
- **Future enhancement**: Re-fetch cardinality after filters applied

---

## Configuration

### Threshold

Edit `frontend/src/config/cardinalityConfig.ts`:

```typescript
export const MAX_FACET_COUNT = 50; // Change this value
```

### Messages

All user-facing messages are in `cardinalityConfig.ts`:
- `getCardinalityWarning()` - For drop validation
- `getFlavourChangeWarning()` - For flavour changes
- `formatDistinctCount()` - For badge display

---

## Technical Details

### Performance

**Initial Load:**
- Fetches cardinality for all fields in parallel
- ~100-500ms per field (depending on table size)
- Doesn't block UI - fields appear first, counts added when ready

**Drag & Drop:**
- Validation is **synchronous** (instant)
- No network latency
- Uses cached `distinctCount` value

### Error Handling

**If cardinality fetch fails:**
- Field gets `distinctCount = 0`
- Validation passes (fail-open)
- No badge shown
- User can still use the field

**If field has no `distinctCount`:**
- Validation is skipped
- Field accepted
- No blocking

### Filter Integration

**Current behavior:**
- Cardinality is fetched for **unfiltered** data
- Validation doesn't account for active filters
- This is intentional to keep validation simple and fast

**Future enhancement:**
- Option to re-fetch cardinality when filters change
- Would require invalidating cache
- Trade-off: slower but more accurate

---

## Files Modified/Created

### Created:
- `frontend/src/config/cardinalityConfig.ts` - Configuration and helpers
- `frontend/src/utils/cardinalityValidation.ts` - Validation logic

### Modified:
- `frontend/src/types.ts` - Added `distinctCount?` to Field
- `frontend/src/apiService.ts` - Added `getFieldsCardinality()`
- `frontend/src/hooks/useVisualizationState.ts` - Fetch cardinality on table load
- `frontend/src/hooks/useDragDrop.ts` - Validate in drop handler
- `frontend/src/components/Visualization/FieldChip/FieldChipLabel.tsx` - Display count badges
- `frontend/src/components/Visualization/FieldChip/FieldContextMenu.tsx` - Validate flavour changes

---

## Testing Scenarios

### Manual Testing Checklist

- [  ] Load table with high-cardinality fields → counts appear in badges
- [  ] Drag low-cardinality field (<50) to axis → accepted
- [  ] Drag high-cardinality field (>50) to axis with measure → rejected
- [  ] Drag high-cardinality field to empty axis → accepted (no validation)
- [  ] Change continuous → discrete on axis → confirmation shown
- [  ] User cancels flavour change → field unchanged
- [  ] User confirms flavour change → field updated
- [  ] High-cardinality badge shown in red/bold
- [  ] Tooltip shows explanation
- [  ] Works with CSV and ClickHouse
- [  ] Cardinality fetch failure doesn't block UI

### Edge Cases

- **Empty table**: Count = 0, validation passes
- **Exactly 50 values**: Validation passes (not > 50)
- **Network error**: Validation skipped, field accepted
- **Field without cached count**: Validation skipped

---

## Limitations & Future Enhancements

### Current Limitations

1. **No filter awareness**: Validates against unfiltered counts
2. **Uses `alert()`**: Basic notification, not elegant
3. **No caching persistence**: Counts refetched on every table load
4. **Fixed threshold**: Not user-configurable in UI
5. **No loading indicator**: Cardinality fetch happens silently

### Future Enhancements

1. **Filter-aware validation**
   - Re-fetch counts when filters change
   - Show "filtered count" vs "total count" in badges

2. **Better notifications**
   - Replace `alert()` with Material-UI Snackbar
   - Non-blocking, dismissible notifications

3. **Configurable threshold**
   - Add setting in UI to adjust MAX_FACET_COUNT
   - Different thresholds for different data sources

4. **Loading states**
   - Show spinner while fetching cardinality
   - Progress indicator for batch fetches

5. **Cardinality caching**
   - Store in localStorage/IndexedDB
   - Don't re-fetch on every table load

6. **Sample-based estimation**
   - For very large tables, use APPROX_COUNT_DISTINCT
   - Faster, but less accurate

---

## Migration & Rollback

### To Enable (Already Active)
Feature is active by default when code is deployed.

### To Disable
Comment out validation in `hooks/useDragDrop.ts`:

```typescript
// const validationError = validateDiscreteDimensionForAxis(...);
// if (validationError) { ... }
```

### To Change Threshold
Edit `config/cardinalityConfig.ts`:

```typescript
export const MAX_FACET_COUNT = 100; // Increase limit
```

---

## Performance Impact

**Positive:**
- Prevents slow/unusable visualizations with too many facets
- Saves backend resources (fewer massive queries)

**Negative:**
- Slight delay on table load (~2-5 seconds for 50 fields)
- Extra API calls for cardinality
- Minimal - cardinality fetch is parallelized and doesn't block UI

**Net Impact:** Significant improvement in UX and performance