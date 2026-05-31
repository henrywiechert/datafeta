# Frontend React Review — Example Findings

Illustrative patterns from reviewing this repo. Adapt severity and wording to what you actually find.

## Render performance — context value identity

**Finding:** Provider creates a new `value` object every render.

**Report excerpt:**

> `VisualizationContext.Provider` passes an inline object literal. Any `state` change re-renders all ~25 consumers, even those needing a single field. Memoize the value or add selector hooks.

**Code citation pattern:**

```244:253:frontend/src/contexts/VisualizationContext/VisualizationProvider.tsx
  return (
    <VisualizationContext.Provider value={{ 
      state, 
      dispatch, 
      ...
    }}>
```

## Render performance — persistence amplification

**Finding:** Effect syncs entire visualization snapshot to sheet context on every field change.

**Report excerpt:**

> `useVisualizationState` calls `updateActiveSheetState` with ~30 fields whenever any of them change, rebuilding `state.sheets` and re-rendering sheet chrome. Debounce or persist on sheet blur/switch.

## React idioms — god hook

**Finding:** Facade hook returns new object every render.

**Report excerpt:**

> `useVisualizationState()` composes four sub-hooks and returns a fresh object literal. `VisualizationPageContent` re-renders on every context tick; memoized children help, but the page shell does not.

## Accessibility — pointer-only core flow

**Finding:** Field placement is HTML5 drag-and-drop only.

**Report excerpt:**

> Axis assignment and reorder have no keyboard alternative. Flag as high-impact a11y gap; suggest context-menu or "Move to X/Y" actions as an incremental fix.

## Accessibility — unsanitized HTML

**Finding:** Markdown caption rendered with `dangerouslySetInnerHTML`.

**Report excerpt:**

> `ChartCaption` uses `marked.parse()` without sanitization. If captions are imported or shared, this is an XSS surface. Add DOMPurify or an allowlisted renderer.

## Edge case — custom memo comparator drift

**Finding:** `React.memo` comparator lists props manually.

**Report excerpt:**

> `ChartRenderer`'s comparator checks 20+ props by name. New props added without updating the comparator will silently skip updates. Prefer structural splits or document a required update checklist.

## Unnecessary complexity — duplicate provider

**Finding:** Root provider exists only for connection reset side effect.

**Report excerpt:**

> `VisualizationProvider` appears at root and again keyed per sheet in `VisualizationPage`. Root instance exists so `ConnectionProvider` can dispatch `RESET_QUERY_STATE`. Decouple reset from visualization state to remove the outer provider.

## Positive patterns worth calling out

- Refs-for-stable-callbacks in `useDragDrop` / `useFieldOperations`
- Zustand selectors on `FieldChip` for granular selection re-renders
- `useDeferredValue` in `ChartGrid` for filter transitions
- Panel collapse kept local in `VisualizationPage` to avoid facet re-renders
- Architecture docs (`CONTEXTS.md`, `HOOKS.md`, `ui-management.md`) matching code
