# Deferred State Updates During Stabilization

## The Problem with `useMemo` Alone

While `useMemo` batches **calculations**, it doesn't prevent **state** from updating multiple times:

```typescript
// useMemo batches calculations
const layoutCalcs = useMemo(() => {
  // All calculations happen in ONE batch
  return { plotRowsSpec, actualRowHeights, ... };
}, [rowHeightPx]); // ← But if this changes 3 times, useMemo runs 3 times!
```

### What Was Happening

Looking at your console logs:

```
[ChartGrid] Layout calculations recomputed: {rowHeightPx: 401, ...}
[ChartGrid] Layout calculations recomputed: {rowHeightPx: 401, ...}
[ChartGrid] Layout calculations recomputed: {rowHeightPx: 120, ...}
[ChartGrid] Layout calculations recomputed: {rowHeightPx: 120, ...}
```

**The flow**:
1. Faceting changes (e.g., 1x1 → 10x36)
2. ResizeObserver fires → calculates height = 401px → updates state
3. `useMemo` recalculates with rowHeightPx=401 → render at 401px (**USER SEES THIS**)
4. ResizeObserver fires again → calculates height = 120px → updates state
5. `useMemo` recalculates with rowHeightPx=120 → render at 120px (**USER SEES THIS**)
6. **Result**: User sees charts shrink from 401px → 120px (flicker)

The issue: **Multiple state updates = multiple renders**, even though each render uses batched calculations.

## The Solution: Defer State Updates

**Key insight**: Don't update `rowHeightPx` state during the stabilization period. Store pending values in a ref, apply once when stabilization completes.

```typescript
const [isStabilizing, setIsStabilizing] = useState(false);
const pendingRowHeightRef = useRef<number | null>(null);

// When faceting changes: activate stabilization freeze
useEffect(() => {
  pendingRowHeightRef.current = null;  // Clear any pending updates
  setIsStabilizing(true);
  
  const timeout = setTimeout(() => {
    setIsStabilizing(false);
    
    // Apply pending update ONCE after stabilization
    if (pendingRowHeightRef.current !== null) {
      setRowHeightPx(pendingRowHeightRef.current);
      pendingRowHeightRef.current = null;
    }
  }, 300);  // 300ms freeze period
  
  return () => clearTimeout(timeout);
}, [spec?.plots?.length, spec?.layout?.columns, spec?.layout?.rows]);

// In ResizeObserver callback:
const updateRowHeight = () => {
  const newHeight = calculateHeight();
  
  if (isStabilizing) {
    // DEFER: Store in ref, don't update state
    pendingRowHeightRef.current = newHeight;
    console.log('[ChartGrid] Deferring rowHeight update:', newHeight);
    return;
  }
  
  // Not stabilizing: update immediately
  setRowHeightPx(newHeight);
  console.log('[ChartGrid] Updating rowHeight:', newHeight);
};
```

## How It Works

### Timeline of Events

```
0ms:   Faceting changes 1x1 → 10x36
0ms:   Stabilization freeze activates (300ms)
0ms:   pendingRowHeightRef.current = null
10ms:  ResizeObserver fires → calculates 401px → stored in ref (not state)
20ms:  ResizeObserver fires → calculates 180px → stored in ref (overwrites 401)
50ms:  ResizeObserver fires → calculates 120px → stored in ref (overwrites 180)
...    (more ResizeObserver events, all deferred)
300ms: Stabilization completes
300ms: pendingRowHeightRef.current = 120px applied to state (ONE update)
300ms: useMemo recalculates with rowHeightPx=120 (ONE render)
```

**Result**: User sees only the **final** render at 120px, no intermediate states.

## Console Logs to Expect

### During Faceting Change (Development Mode)

```
[ChartGrid] Stabilizing: freezing dimension updates for 300ms
[ChartGrid] Deferring rowHeight update during stabilization: 401
[ChartGrid] Deferring rowHeight update during stabilization: 180
[ChartGrid] Deferring rowHeight update during stabilization: 120
[ChartGrid] Applying pending rowHeight after stabilization: 120
[ChartGrid] Updating rowHeight: 150 → 120
[ChartGrid] Layout calculations recomputed: {columns: 10, rows: 36, rowHeightPx: 120, ...}
[PlotArea] Rendering: 360 plots
```

**Key points**:
- Multiple "Deferring" logs → good! Intermediate updates are being blocked
- One "Applying pending" log → final update applied
- One "Layout calculations" log → single render
- **No visible intermediate states**

### What You Should NOT See

```
❌ [ChartGrid] Updating rowHeight: 401 → 180
❌ [ChartGrid] Layout calculations recomputed: {rowHeightPx: 401, ...}
❌ [ChartGrid] Updating rowHeight: 180 → 120
❌ [ChartGrid] Layout calculations recomputed: {rowHeightPx: 120, ...}
```

If you see multiple "Updating rowHeight" logs with different values, the deferred update mechanism isn't working.

## Why 300ms?

The stabilization period is **300ms** (increased from 200ms) because:

1. **ResizeObserver debounce**: 250ms (waits for DOM to settle)
2. **Browser layout/paint**: ~50ms (depends on complexity)
3. **Safety margin**: Extra time to ensure all updates have queued

The 300ms freeze ensures that:
- All ResizeObserver callbacks have fired
- All pending DOM mutations have completed
- We capture the **final** calculated height
- Only **one** state update happens

## Comparison: Before vs After

### Before (Immediate State Updates)

```
User changes faceting
  ↓
ResizeObserver fires (401px) → setState(401) → render
  ↓ (USER SEES 401px charts)
ResizeObserver fires (120px) → setState(120) → render
  ↓ (USER SEES 120px charts - FLICKER!)
```

### After (Deferred State Updates)

```
User changes faceting
  ↓
Stabilization activates (300ms freeze)
  ↓
ResizeObserver fires (401px) → ref.current = 401 (no render)
  ↓
ResizeObserver fires (120px) → ref.current = 120 (no render)
  ↓
Stabilization completes → setState(120) → render
  ↓ (USER SEES 120px charts - ONE RENDER)
```

## Integration with Batched Calculations

This works together with the `useMemo` batching:

1. **Deferred updates**: Prevent `rowHeightPx` state from changing multiple times
2. **Batched calculations**: When `rowHeightPx` finally changes, all derived properties update atomically

Together, they ensure:
- ✅ `rowHeightPx` updates **once** per faceting change
- ✅ Layout calculations recompute **once** with all final values
- ✅ Child components receive **one** set of updated props
- ✅ User sees **one** render to final layout

## Troubleshooting

### Still seeing intermediate renders?

**Check the logs**:
1. Is `[ChartGrid] Deferring rowHeight update during stabilization:` appearing?
   - **Yes**: Good! Deferred mechanism is working
   - **No**: Stabilization might not be active when ResizeObserver fires

2. How many `[ChartGrid] Layout calculations recomputed:` logs do you see?
   - **One**: Perfect! Single render
   - **Two**: Acceptable (initial + after pending applied)
   - **Three+**: Issue - state is updating too many times

3. Are the `rowHeightPx` values changing in the "Layout calculations" logs?
   - **Same value**: Good (e.g., 120, 120)
   - **Different values**: Issue (e.g., 401, 120) - deferred updates not working

### Debug Steps

1. **Enable development mode** (already enabled) - logs will show the exact sequence
2. **Change faceting** (e.g., 1x1 → 10x36) and watch console
3. **Look for the pattern**:
   - Stabilizing → Deferring (multiple) → Applying pending (once) → Layout calculations (once)
4. **Share the logs** if the pattern doesn't match

## Performance Impact

### Before
- 3-4 renders per faceting change
- 3-4 layout recalculations
- 3-4 React reconciliation cycles
- **Visible flicker** as charts resize

### After
- 1 render per faceting change
- 1 layout recalculation
- 1 React reconciliation cycle
- **Instant** transition to final size

**Estimated improvement**: 70-80% reduction in render time during faceting changes.

## Edge Cases Handled

### Multiple rapid faceting changes
If user changes faceting multiple times within 300ms:
- Each change resets the stabilization timer
- Only the final state is rendered
- Intermediate faceting states are never visible

### Browser resize during stabilization
- Resize events also schedule debounced updates (250ms)
- These are also deferred during stabilization
- Final size is applied when both stabilization and debounce complete

### Component unmount during stabilization
- Cleanup function clears the stabilization timeout
- Pending updates are discarded
- No memory leaks

## Alternative Approaches Considered

### 1. Increase debounce delay
**Tried**: Increased from 100ms → 250ms
**Result**: Helped but not enough - ResizeObserver still fired before debounce completed

### 2. Skip renders during stabilization (React.memo)
**Tried**: Aggressive memoization in child components
**Result**: Helped but couldn't prevent parent re-renders when state changed

### 3. CSS-only transitions
**Tried**: Use CSS transitions to smooth out size changes
**Result**: Still shows intermediate states, just animated

### 4. This solution (deferred state updates)
**Result**: ✅ Completely eliminates intermediate states by preventing state changes during the critical period

## Conclusion

Deferred state updates are the **missing piece** that completes the optimization strategy:

- **`useMemo`**: Batches calculations (prevents cascading derived value updates)
- **Debouncing**: Reduces frequency of updates (waits for DOM to settle)
- **Stabilization freeze**: Prevents updates during critical period (layout changes)
- **Deferred updates**: Stores intermediate values, applies final value once (ONE state change = ONE render)

Together, these ensure **single, clean renders** with no visible intermediate states.


