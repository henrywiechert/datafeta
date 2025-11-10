# Facet Grid Architecture Analysis

**Date**: November 10, 2025  
**Status**: ✅ Enabler refactorings completed (see ENABLER_REFACTORINGS_COMPLETE.md)  
**Purpose**: Analyze CSS Grid implementation for faceting and identify refactoring needs for dynamic resize feature

---

## Status Update

**Completed**: All three enabler refactorings (Enablers 1-3) are complete:
- ✅ Grid template logic extracted into reusable hook
- ✅ Constants centralized in config
- ✅ Three-layer architecture fully documented

**Next**: Ready for dynamic resize implementation (simplified uniform sizing approach)

---

## Executive Summary

The faceting system uses CSS Grid with a sophisticated dual-layer scrolling architecture. The grid sizing is currently static (computed once) using `gridTemplateColumns` and `gridTemplateRows`. For dynamic resizing with mouse handles, we'll need significant refactoring to:

1. **Convert from template strings to stateful arrays** for tracking individual track sizes
2. **Add resize handle UI components** on grid lines
3. **Implement drag handlers** that update grid track sizes
4. **Persist resize state** across re-renders
5. **Handle constraints** (min/max sizes, proportional adjustments)

---

## Current Architecture

### 1. Data Flow: Backend → Frontend

**Backend** (`facetCoordinator.ts`, `facetGenerator.ts`, `facetGrid.ts`):
- Computes grid layout structure: `columns`, `rows`, `columnSizes`, `rowSizes`
- `columnSizes` and `rowSizes` are `Array<number | 'fr'>`:
  - `number`: fixed pixel size (e.g., for bar charts with category axes)
  - `'fr'`: flexible fractional unit (e.g., for scatter plots)
- Returns `PlotResult` with `layout: GridLayout` and `plots: PositionedPlot[]`

**Frontend** (`ChartGrid.tsx`):
- Receives `PlotResult` spec with layout metadata
- Converts `columnSizes` and `rowSizes` arrays to CSS template strings
- Applies these strings to multiple CSS Grid containers (plots, axes, labels)

### 2. CSS Grid Structure

The rendering uses **THREE overlapping grid layers** for complex scrolling behavior:

#### Layer 1: Horizontal Scroll Layer (z-index: 3)
- **Position**: `position: absolute, left: leftFixedWidthPx, right: 14px`
- **Scrolling**: Horizontal only
- **Contains**:
  - Top facet labels (column headers)
  - Main plots area (with `plotsTranslateRef` for vertical sync)
  - Bottom X-axes
- **Grid Template**: 
  ```typescript
  gridTemplateColumns: `minmax(0, 1fr)`
  gridTemplateRows: `${topHeaderHeight}px 1fr ${dynamicXAxisPx}px 0px`
  ```

#### Layer 2: Vertical Scroll Layer (z-index: 2)
- **Position**: `position: absolute, left: 0, top: topHeaderHeight, bottom: bottomHeight`
- **Scrolling**: Vertical only
- **Contains**:
  - Left Y-axes and labels
  - Transparent sizing divs (for proper scrollbar calculation)
- **Grid Template**:
  ```typescript
  gridTemplateColumns: `${leftFixedWidthPx}px 1fr`
  gridTemplateRows: plotRowsSpec
  ```

#### Layer 3: Plot Grid (inside Layer 1's plot area)
- **The actual faceted charts**
- **Grid Template**:
  ```typescript
  gridTemplateColumns: plotTemplateColumns  // e.g., "400px 1fr 300px minmax(160px, 1fr)"
  gridTemplateRows: plotRowsSpec            // e.g., "200px 150px 200px"
  ```
- **Positioning**: Each plot has `gridColumn: pos.col + 1, gridRow: pos.row + 1`

### 3. Template String Generation

**Current Implementation** (lines 191-224 in `ChartGrid.tsx`):

```typescript
const plotTemplateColumns =
  layoutType === 'vertical'
    ? `minmax(${minColumnPx}px, 1fr)`
    : columnSizes && columnSizes.length > 0
      ? columnSizes
          .slice(0, columns)
          .map((c) => (typeof c === 'number' ? `${c}px` : `minmax(${minColumnPx}px, 1fr)`))
          .join(' ')
      : `repeat(${columns}, minmax(${minColumnPx}px, 1fr))`;

const plotRowsSpec = inferredRowSizes
  .map((h) => (typeof h === 'number' ? `${h}px` : `${rowHeightPx}px`))
  .join(' ');
```

**Key Points**:
- Template strings are computed once per render
- No individual track state management
- `'fr'` tracks are converted to `minmax(minPx, 1fr)` for minimum size constraints
- Row heights can be dynamic (responsive to container size via `rowHeightPx` state)

---

## Architecture Issues for Dynamic Resize

### Issue 1: Template String Immutability
**Problem**: CSS Grid template strings (`gridTemplateColumns`, `gridTemplateRows`) cannot be easily mutated for individual tracks.

**Current**: `"400px 1fr 300px"`  
**Needed**: Individual track sizes accessible by index for drag updates

**Impact**: Need to maintain state as arrays and regenerate template strings on each resize.

### Issue 2: No Resize Handle UI
**Problem**: No visual affordance or event handling for resizing grid tracks.

**Needed**:
- Resize handles overlaid on grid lines (both row and column)
- Mouse event handlers (mousedown, mousemove, mouseup)
- Visual feedback during drag (cursor change, handle highlight)

### Issue 3: Multi-Layer Synchronization
**Problem**: Three separate grid layers must stay synchronized when track sizes change.

**Affected Grids**:
1. Plot grid (main content)
2. Top header grid (column facet labels)
3. Left sidebar grid (Y-axes and row facet labels)
4. Bottom footer grid (X-axes)
5. Transparent sizing grid (vertical scroll layer)

**Impact**: Template string must be applied consistently across all layers.

### Issue 4: Fixed vs Flexible Track Handling
**Problem**: Mixed track types (`number` px vs `'fr'`) complicate resize logic.

**Scenarios**:
- Resizing a fixed track: straightforward pixel adjustment
- Resizing a flexible track: need to "freeze" it to a pixel size, then adjust remaining `fr` tracks
- Resizing with neighbors: distribute space changes (one grows, one shrinks)

### Issue 5: Constraint Management
**Problem**: No current infrastructure for min/max size constraints per track.

**Needed**:
- Minimum column width (e.g., 160px to show plot content)
- Minimum row height (e.g., 120px for legibility)
- Maximum sizes (optional, for preventing runaway growth)
- Proportional adjustments when hitting constraints

### Issue 6: State Persistence
**Problem**: Resize state needs to survive re-renders and potentially be saved/loaded.

**Current**: `PlotResult` spec is immutable (from backend)  
**Needed**: Local state overlay to track user resize adjustments

### Issue 7: Responsive Row Heights
**Problem**: Current row heights are dynamically computed to fill available space (lines 133-169).

**Current Logic**:
```typescript
const updateRowHeight = () => {
  const available = vScrollRef.current.clientHeight;
  const r = Math.max(1, rowsForSizing);
  const h = Math.max(MIN_GRID_ROW_PX, Math.floor(available / r));
  setRowHeightPx(h);
};
```

**Conflict**: Dynamic row heights vs user-controlled resize  
**Resolution**: User resize should override automatic sizing for affected tracks

### Issue 8: Facet Grouping
**Problem**: Faceted grids have logical groups (baseCols × baseRows per facet).

**Current**: No awareness of facet boundaries in grid structure  
**Implication**: Resizing should ideally operate on facet groups, not individual cells

---

## Existing Resize Infrastructure

The codebase has **ResizeHandle** component (`components/Layout/ResizeHandle.tsx`) used for panel resizing:

**Features**:
- Horizontal/vertical drag support
- Min/max size constraints
- Visual feedback (hover, drag states)
- Cursor management
- Temporary size display during drag

**Limitations for Grid Use**:
- Designed for single-panel resize (not grid tracks)
- Requires explicit edge placement (not grid-line aligned)
- No multi-track synchronization

**Reusability**: ~50% - drag logic and visual patterns can be adapted

---

## Proposed Refactoring Strategy

### Phase 1: Grid State Management (Foundation)

**Goal**: Replace template strings with stateful arrays

**Changes**:

1. **Add state to ChartGrid.tsx**:
   ```typescript
   const [columnSizesState, setColumnSizesState] = useState<Array<number | 'fr'>>(
     spec.layout?.columnSizes || []
   );
   const [rowSizesState, setRowSizesState] = useState<Array<number | 'fr'>>(
     spec.layout?.rowSizes || []
   );
   ```

2. **Sync with spec changes**:
   ```typescript
   useEffect(() => {
     setColumnSizesState(spec.layout?.columnSizes || []);
     setRowSizesState(spec.layout?.rowSizes || []);
   }, [spec.layout?.columns, spec.layout?.rows]);
   ```

3. **Template generation helper**:
   ```typescript
   function generateTemplateString(
     sizes: Array<number | 'fr'>, 
     minPx: number
   ): string {
     return sizes
       .map(s => typeof s === 'number' ? `${s}px` : `minmax(${minPx}px, 1fr)`)
       .join(' ');
   }
   ```

4. **Update all grid template usages** to use `generateTemplateString(columnSizesState, minColumnPx)`

**Benefits**:
- Centralized size state
- Easy to update individual tracks
- No impact on existing functionality

### Phase 2: Resize Handle Components

**Goal**: Add visual handles and capture drag events

**Components to Create**:

1. **`GridResizeHandle.tsx`** - Generic grid line resize handle
   ```typescript
   interface GridResizeHandleProps {
     orientation: 'row' | 'column';
     index: number; // Which grid line (between tracks)
     onResize: (index: number, delta: number) => void;
     bounds: { left: number; top: number; right: number; bottom: number };
   }
   ```

2. **`GridResizeOverlay.tsx`** - Container for all handles
   ```typescript
   interface GridResizeOverlayProps {
     columnHandles: number[]; // Indices of resizable column lines
     rowHandles: number[]; // Indices of resizable row lines
     gridBounds: DOMRect;
     onColumnResize: (index: number, delta: number) => void;
     onRowResize: (index: number, delta: number) => void;
   }
   ```

**Handle Positioning**:
- Position: `absolute` within grid container
- Calculate position from cumulative track sizes
- Width/Height: 5-10px hit area (visual: 1-2px line)
- Cursor: `col-resize` or `row-resize`
- Visual: Semi-transparent overlay, highlight on hover/drag

**Challenges**:
- Accurate positioning over grid lines (needs track size calculation)
- Handling scroll offsets (handles must move with content)
- Z-index management (above plots but below tooltips)

### Phase 3: Resize Logic

**Goal**: Implement track size updates on drag

**Resize Handler**:
```typescript
const handleColumnResize = useCallback((index: number, deltaX: number) => {
  setColumnSizesState(prev => {
    const next = [...prev];
    const current = next[index];
    const currentPx = typeof current === 'number' 
      ? current 
      : measureGridTrack(gridRef, 'column', index); // Helper to get computed size
    
    const newSize = Math.max(MIN_COLUMN_PX, currentPx + deltaX);
    next[index] = newSize;
    
    // Optional: Adjust neighboring track
    if (index + 1 < next.length) {
      const neighbor = next[index + 1];
      const neighborPx = typeof neighbor === 'number' 
        ? neighbor 
        : measureGridTrack(gridRef, 'column', index + 1);
      next[index + 1] = Math.max(MIN_COLUMN_PX, neighborPx - deltaX);
    }
    
    return next;
  });
}, []);
```

**Key Decisions**:
1. **Adjustment Strategy**:
   - Option A: Resize track + neighbor (zero-sum, preserves total size)
   - Option B: Resize track only (content area grows/shrinks)
   - Recommendation: **Option A** for faceted grids (maintains alignment)

2. **Fr Track Handling**:
   - On first resize: Convert `'fr'` to pixel value (freeze it)
   - Store original `'fr'` ratio for "reset" functionality
   - Remaining `'fr'` tracks adjust proportionally

3. **Constraint Enforcement**:
   - Clamp to MIN/MAX per track
   - If at constraint, don't resize (or resize only neighbor)

### Phase 4: Visual Polish

**Goal**: Professional UX for resize interaction

**Features**:
1. **Handle Appearance**:
   - Default: Invisible or subtle line
   - Hover: Visible line (2px, contrasting color)
   - Drag: Thicker line (3px) + change grid template for live preview

2. **Cursor Management**:
   - Set `document.body.style.cursor` during drag
   - Prevent text selection (`user-select: none`)

3. **Live Preview**:
   - Update grid immediately during drag (not just on mouseup)
   - Optional: Debounce for performance if needed

4. **Visual Feedback**:
   - Show current size tooltip during drag
   - Highlight affected tracks

5. **Undo/Reset**:
   - Button to reset to original sizes
   - Keyboard shortcut (e.g., Double-click handle)

### Phase 5: Persistence (Optional)

**Goal**: Save user resize preferences

**Storage Options**:
1. **Local State Only**: Resets on spec change (simple)
2. **Session Storage**: Persists during session
3. **Local Storage**: Persists across sessions
4. **Save/Load System**: Include in existing save/load feature

**Recommendation**: Start with Local State, add persistence later if requested

### Phase 6: Facet-Aware Resizing (Advanced)

**Goal**: Resize entire facet rows/columns instead of individual tracks

**Concept**:
- Identify facet boundaries from `spec.facetLabels.spans.baseCols/baseRows`
- Show handles only at facet boundaries
- Resize all tracks within a facet group uniformly

**Benefits**:
- Cleaner UX (fewer handles)
- Maintains facet proportions
- Aligns with user mental model

**Implementation**:
```typescript
const facetColumnBoundaries = useMemo(() => {
  const baseCols = spec.facetLabels?.spans?.baseCols || 1;
  const boundaries: number[] = [];
  for (let i = baseCols; i < columns; i += baseCols) {
    boundaries.push(i);
  }
  return boundaries;
}, [spec, columns]);
```

---

## Implementation Complexity Assessment

| Feature | Complexity | Estimated Effort | Risk Level |
|---------|-----------|------------------|------------|
| **Phase 1**: State Management | Low | 4 hours | Low |
| **Phase 2**: Handle Components | Medium | 8 hours | Medium |
| **Phase 3**: Resize Logic | Medium-High | 12 hours | Medium |
| **Phase 4**: Visual Polish | Low-Medium | 6 hours | Low |
| **Phase 5**: Persistence | Low | 3 hours | Low |
| **Phase 6**: Facet-Aware | Medium | 8 hours | Medium |
| **Testing & Debugging** | - | 8 hours | - |
| **Total** | - | **49 hours** | - |

**Risks**:
1. **Scrolling Interference**: Resize handles might conflict with scroll gestures
2. **Performance**: Frequent re-renders during drag on large grids
3. **Multi-Layer Sync**: Ensuring all five grid layers update consistently
4. **Edge Cases**: Handling all combinations of fixed/flexible tracks

---

## Alternative Approaches Considered

### Alternative 1: CSS resize Property
**Concept**: Use CSS `resize: both` on grid tracks

**Pros**: Built-in browser support, no custom drag logic  
**Cons**: 
- Limited styling control
- Poor UX (resize from corner only, not grid lines)
- No constraint enforcement
- Not supported well for grid tracks

**Verdict**: ❌ Not suitable for this use case

### Alternative 2: Third-Party Library
**Options**: `react-grid-layout`, `react-resizable`, `re-resizable`

**Pros**: Battle-tested, feature-rich  
**Cons**:
- Heavy dependencies
- Designed for different layout patterns (not CSS Grid tracks)
- Would require significant adaptation
- Might not support our three-layer scroll architecture

**Verdict**: ❌ More complex to integrate than custom solution

### Alternative 3: Canvas-Based Grid
**Concept**: Render entire grid in HTML5 Canvas

**Pros**: Full control over rendering and interaction  
**Cons**:
- Loss of DOM benefits (accessibility, text selection, hover states)
- Would require rewriting entire ChartGrid component
- Observable Plot is SVG-based (hard to embed in Canvas)

**Verdict**: ❌ Too disruptive

---

## Recommended Refactoring Plan

### Immediate (Before Dynamic Resize)

**1. Extract Grid Template Logic** (2 hours)
- Create `hooks/useGridTemplates.ts`:
  ```typescript
  export function useGridTemplates(
    columnSizes: Array<number | 'fr'>,
    rowSizes: Array<number | 'fr'>,
    minColumnPx: number,
    minRowPx: number
  ) {
    return useMemo(() => ({
      columns: generateTemplateString(columnSizes, minColumnPx),
      rows: generateTemplateString(rowSizes, minRowPx),
    }), [columnSizes, rowSizes, minColumnPx, minRowPx]);
  }
  ```

**2. Centralize Grid Constants** (1 hour)
- Move all grid-related constants to `config/gridLayoutConfig.ts`:
  ```typescript
  export const MIN_GRID_COLUMN_PX = 160;
  export const MIN_GRID_ROW_PX = 120;
  export const RESIZE_HANDLE_WIDTH = 8;
  export const RESIZE_HANDLE_COLOR = '#99a795';
  ```

**3. Document Grid Architecture** (1 hour)
- Add inline comments explaining three-layer structure
- Document coordinate systems (grid positions vs pixel offsets)

### For Dynamic Resize Implementation

**Follow Phase 1-4 from "Proposed Refactoring Strategy"** above, in order.

**Recommended Sequence**:
1. Phase 1 (Foundation) - Get state management working
2. Phase 2 (Handles) - Add visual elements (no-op resize first)
3. Phase 3 (Logic) - Implement resize behavior
4. Phase 4 (Polish) - Enhance UX

**Optional Enhancements** (after basic resize works):
- Phase 5 (Persistence)
- Phase 6 (Facet-Aware)

---

## Code Quality Improvements (While Refactoring)

1. **Type Safety**:
   - Create `types/gridTypes.ts` with `GridTrackSize`, `GridPosition`, etc.
   - Strengthen `PlotResult` interface with better layout typing

2. **Modularity**:
   - Split `ChartGrid.tsx` (435 lines) into smaller components:
     - `ChartGridCore.tsx` (orchestration)
     - `ChartGridLayers.tsx` (layer management)
     - `ChartGridState.tsx` (state management hook)

3. **Testing**:
   - Unit tests for template generation helpers
   - Unit tests for resize logic (track size calculations)
   - Integration tests for multi-layer synchronization

4. **Performance**:
   - Memoize template string generation
   - Consider `useTransition` for non-urgent resize updates
   - Profile re-render cost on large grids (10x10+ facets)

---

## Open Questions

1. **Resize Granularity**: Should users resize individual grid tracks or facet groups?
   - **Recommendation**: Start with individual, add facet-aware as optional enhancement

2. **Resize Axis**: Column-only, row-only, or both?
   - **Recommendation**: Both, but columns are higher priority (more common use case)

3. **Default Behavior**: Resize single track or adjust neighbor to maintain total size?
   - **Recommendation**: Adjust neighbor (Option A) for faceted grids

4. **Fr Track Conversion**: When user resizes an `'fr'` track, keep as `fr` or convert to `px`?
   - **Recommendation**: Convert to `px` (simplifies logic, user intent is explicit sizing)

5. **Constraint Sourcing**: Where do min/max constraints come from?
   - **Recommendation**: 
     - Global defaults in config
     - Chart type can specify (e.g., bar charts need min height for categories)
     - User override in properties panel (advanced)

6. **Handle Visibility**: Always show, show on hover, or toggle via UI control?
   - **Recommendation**: Show on container hover (not cluttered, discoverable)

---

## Conclusion

The current CSS Grid faceting architecture is **well-structured and maintainable**, with clear separation between layout computation (backend) and rendering (frontend). However, it was **designed for static layouts** and will require **moderate refactoring** to support dynamic resizing.

**Key Takeaway**: The refactoring is **feasible and low-risk** if done incrementally:
- Foundation changes (Phase 1) are straightforward and non-breaking
- Resize feature can be developed in isolation and gated by feature flag
- Existing architecture doesn't need major redesign

**Estimated Total Effort**: ~50 hours for full implementation with polish  
**Minimum Viable Feature**: ~24 hours (Phases 1-3 only)

**Recommendation**: ✅ **Proceed with refactoring**, starting with Phase 1 to establish state management foundation.

