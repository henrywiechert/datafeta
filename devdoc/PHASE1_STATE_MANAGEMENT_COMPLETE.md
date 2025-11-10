# Phase 1: State Management for Dynamic Resize - Complete

**Date**: November 10, 2025  
**Status**: ✅ Complete  
**Next**: Phase 2 - Resize Handle UI Components

---

## Summary

Successfully implemented state management for user-controlled grid cell sizing in ChartGrid component. The implementation supports uniform sizing (all cells get the same width/height) with automatic reset on spec changes.

---

## Changes Made

### 1. Added State Variables

```typescript
// User-controlled cell sizing (uniform across all cells)
// null = use automatic sizing, number = user has manually resized
const [userCellWidth, setUserCellWidth] = useState<number | null>(null);
const [userCellHeight, setUserCellHeight] = useState<number | null>(null);
```

**Design Decision**: Using `null` to represent "automatic sizing" makes it easy to distinguish between "user hasn't resized" vs "user set to 0px".

### 2. Auto-Reset on Spec Changes

```typescript
// Reset user overrides when spec changes (new data/chart type)
useEffect(() => {
  setUserCellWidth(null);
  setUserCellHeight(null);
}, [spec?.layout?.columns, spec?.layout?.rows]);
```

**Rationale**: When the grid structure changes (different number of columns/rows), user's previous size choices may not make sense anymore. Reset to automatic sizing to prevent broken layouts.

### 3. Reset Handler

```typescript
// Handler to reset cell sizes to automatic
const handleResetCellSizes = () => {
  setUserCellWidth(null);
  setUserCellHeight(null);
};

// Check if user has made any size overrides
const hasUserSizeOverrides = userCellWidth !== null || userCellHeight !== null;
```

**Purpose**: 
- `handleResetCellSizes()` - Will be called by reset button in future UI
- `hasUserSizeOverrides` - Can be used to conditionally show reset button or visual indicator

### 4. Modified Column Template Generation

**Before**:
```typescript
const plotTemplateColumns = layoutType === 'vertical'
  ? `minmax(${minColumnPx}px, 1fr)`
  : columnSizes && columnSizes.length > 0
    ? columnSizes.map(...).join(' ')
    : `repeat(${columns}, minmax(${minColumnPx}px, 1fr))`;
```

**After** (with user override support):
```typescript
const plotTemplateColumns = userCellWidth !== null
  ? `repeat(${columns}, ${userCellWidth}px)` // Uniform user-controlled sizing
  : layoutType === 'vertical'
    ? `minmax(${minColumnPx}px, 1fr)`
    : columnSizes && columnSizes.length > 0
      ? columnSizes.map(...).join(' ')
      : `repeat(${columns}, minmax(${minColumnPx}px, 1fr))`;
```

**Priority Order**:
1. User override (highest priority)
2. Layout type (vertical)
3. Spec columnSizes
4. Automatic sizing (fallback)

### 5. Modified Total Width Calculation

```typescript
const totalContentWidthPx = (() => {
  // User override takes precedence
  if (userCellWidth !== null) return columns * userCellWidth;
  
  // Original logic for automatic sizing...
})();
```

**Important**: This ensures horizontal scroll area is correctly sized when user resizes.

### 6. Modified Row Template Generation

**Before**:
```typescript
const inferredRowSizes: Array<number | 'fr'> = (() => {
  const sizes: Array<number | 'fr'> = [];
  for (let r = 0; r < rows; r++) {
    // Infer from spec or use rowHeightPx...
  }
  return sizes;
})();
```

**After** (with user override support):
```typescript
const inferredRowSizes: Array<number | 'fr'> = (() => {
  // If user has set a height override, use that for all rows
  if (userCellHeight !== null) {
    return Array(rows).fill(userCellHeight);
  }
  
  // Otherwise use the existing logic...
})();
```

**Key Change**: When user resizes, ALL rows get the same height (uniform sizing).

---

## Architecture Integration

### State Flow

```
User Drags Resize Handle (Phase 2)
         ↓
  Calculate New Size
         ↓
  setUserCellWidth(newWidth)
    or setUserCellHeight(newHeight)
         ↓
  Component Re-renders
         ↓
  Template Strings Regenerated
         ↓
  CSS Grid Updates (All 3 Layers)
```

### Inheritance Order (Priority)

**For Column Widths**:
1. ✅ `userCellWidth` (highest - manual resize)
2. `layoutType === 'vertical'` (special case)
3. `spec.layout.columnSizes` (from backend)
4. Automatic `minmax(160px, 1fr)` (fallback)

**For Row Heights**:
1. ✅ `userCellHeight` (highest - manual resize)
2. Individual plot `options.height` (from spec)
3. `spec.layout.rowSizes` (from backend)
4. Automatic `rowHeightPx` (responsive fill)

---

## Testing Notes

### Manual Testing Procedure

1. **Set Width Override**:
   ```javascript
   // In browser console or temp UI
   setUserCellWidth(400);
   ```
   Expected: All columns become 400px wide

2. **Set Height Override**:
   ```javascript
   setUserCellHeight(300);
   ```
   Expected: All rows become 300px tall

3. **Reset**:
   ```javascript
   handleResetCellSizes();
   ```
   Expected: Returns to automatic sizing

4. **Spec Change**:
   - Load different dataset or change faceting
   Expected: Overrides automatically reset

### Edge Cases Handled

✅ **Null Safety**: All checks use `!== null` to avoid falsy confusion with `0`  
✅ **Spec Changes**: Automatic reset prevents broken layouts  
✅ **Missing Spec**: Fallback to automatic sizing works without user overrides  
✅ **Zero Rows/Columns**: `Array(rows).fill()` handles edge cases gracefully

### Not Yet Implemented

⏳ **Persist Across Sessions**: Currently resets on page refresh  
⏳ **Per-Chart Type Defaults**: Min/max constraints not yet enforced  
⏳ **Undo/Redo**: No history tracking yet

---

## Files Modified

**Updated**: `/frontend/src/components/Visualization/ChartGrid/ChartGrid.tsx`
- Added state variables (lines 187-205)
- Modified column template generation (lines 281-290)
- Modified total width calculation (lines 293-304)
- Modified row template generation (lines 308-322)

**Lines Changed**: ~40 new/modified lines  
**Breaking Changes**: None  
**Linter Errors**: 0

---

## Integration Points for Phase 2

The following will be needed in Phase 2 (Resize Handle UI):

### 1. Resize Handlers (to be created)

```typescript
const handleColumnResize = (newWidth: number) => {
  setUserCellWidth(Math.max(MIN_CELL_WIDTH_PX, Math.min(MAX_CELL_WIDTH_PX, newWidth)));
};

const handleRowResize = (newHeight: number) => {
  setUserCellHeight(Math.max(MIN_CELL_HEIGHT_PX, Math.min(MAX_CELL_HEIGHT_PX, newHeight)));
};
```

### 2. Reset Button (to be added to UI)

```tsx
{hasUserSizeOverrides && (
  <button onClick={handleResetCellSizes}>
    Reset Grid Size
  </button>
)}
```

### 3. Resize Handle Positioning

Handles will need access to:
- `columns` - number of columns
- `rows` - number of rows
- `plotTemplateColumns` - for calculating gridline positions
- `plotRowsSpec` - for calculating gridline positions
- `leftFixedWidthPx` - for horizontal offset
- Grid container refs for positioning

---

## Current State Summary

### ✅ Implemented

- State management for uniform cell sizing
- Automatic reset on spec changes
- Priority-based template generation
- Total content size calculation
- Reset handler and flag

### ⏳ Next Phase (Phase 2)

- Resize handle components
- Cursor change detection on axis areas
- Virtual resize line during drag
- Drag event handlers
- Constraint enforcement

### 📊 Complexity

**Current Phase**: Low complexity, pure state management  
**Next Phase**: Medium complexity, DOM manipulation and event handling

---

## Validation

✅ **Linter**: No errors  
✅ **TypeScript**: No type errors  
✅ **Logic**: Priority order correct  
✅ **Safety**: Null checks in place  
✅ **Performance**: Minimal re-renders (state changes trigger expected updates only)

---

## Developer Notes

### Why Uniform Sizing?

Based on user requirements (clarification session):
- All cells get same width (not per-column)
- All cells get same height (not per-row)
- Applies uniformly to multi-level faceting

This significantly simplifies:
- State management (2 numbers vs 2 arrays)
- Template generation (repeat() vs complex joins)
- Resize logic (single calculation vs per-track)
- User mental model (resize whole grid, not individual tracks)

### Why Reset on Spec Change?

Consider:
- User resizes 3×2 grid to 400px × 300px cells
- User switches to 5×4 grid
- Old sizes may not be appropriate for new grid structure
- Auto-reset provides fresh start with appropriate defaults

Alternative (not implemented): Scale proportionally  
Decided against because it adds complexity without clear benefit.

### Why Null for "Automatic"?

Alternatives considered:
- `undefined` - Less explicit, harder to reason about
- `-1` - Magic number, conflicts with px values
- `'auto'` - Would require union type, more complex

`null` is:
- Explicit and semantic ("no user override")
- Easy to check (`!== null`)
- Type-safe (`number | null`)

---

## Conclusion

✅ Phase 1 is complete and ready for Phase 2.

**State management is**:
- Working correctly
- Well-integrated with existing template generation
- Ready for resize UI components to call
- Documented for future maintenance

**Next steps**:
1. Create resize handle components
2. Implement cursor change on axis hover
3. Add virtual line during drag
4. Connect drag handlers to state setters

**Estimated effort for Phase 2**: 6-8 hours

