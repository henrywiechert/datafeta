# Frontend React Review — Investigation Checklist

Use while executing Step 3 of [SKILL.md](SKILL.md). Not every item applies to every repo; skip irrelevant rows and note why.

## Architecture discovery

- [ ] Read `index.tsx` / app entry — provider nesting, `StrictMode`, duplicate providers
- [ ] Map contexts: scope (session vs sheet vs route), persistence, reset triggers
- [ ] Find remount boundaries (`key=` on providers or route containers)
- [ ] Identify orchestrator components (large pages, `*Area`, `*Panel` wiring many hooks)
- [ ] Read any `*.md` under `contexts/`, `hooks/`, or component folders

## Render performance

### Context and subscriptions

- [ ] Provider `value={{ ... }}` recreated every render without `useMemo`
- [ ] Consumers subscribing to full context when they need one field
- [ ] Selector hooks or split contexts for hot vs cold state
- [ ] Sync effects that write parent context on every child state change (persistence amplification)

Search:

```bash
rg "createContext|\.Provider\s+value=\{\{" frontend/src --glob '*.{tsx,ts}'
rg "useVisualizationContext|useContext\(" frontend/src -c
```

### Memoization and boundaries

- [ ] `React.memo` with custom comparators — are all props listed? documented?
- [ ] Memo on leaf while parent orchestrator re-renders heavily anyway
- [ ] `useCallback` / `useMemo` used to fix symptoms of unstable context values
- [ ] Refs-for-callbacks pattern in drag/drop and field operations (good pattern to note)

Search:

```bash
rg "React\.memo|memo\(" frontend/src --glob '*.tsx'
rg "eslint-disable.*exhaustive-deps" frontend/src
```

### Expensive render work

- [ ] Chart/canvas/SVG libraries re-running in `useEffect` on broad deps
- [ ] `ResizeObserver` / scroll listeners per cell in grids (facet scale)
- [ ] `useDeferredValue` / `startTransition` for heavy UI updates
- [ ] Virtualization for long lists or many repeated plot cells
- [ ] `flushSync` — intentional UX tradeoff? called in hot paths?

Search:

```bash
rg "useDeferredValue|startTransition|flushSync|ResizeObserver" frontend/src
rg "Plot\.plot|dangerouslySetInnerHTML" frontend/src
```

### Logging in hot paths

- [ ] `console.log` in render paths or per-cell callbacks without `NODE_ENV` guard

```bash
rg "console\.(log|warn)" frontend/src --glob '*.{tsx,ts}' | head -40
```

## React idioms

- [ ] `useReducer` + extracted reducers for complex state (good)
- [ ] God hooks composing many sub-hooks and returning new object literals every render
- [ ] Effects with large dependency arrays mirroring full state snapshots
- [ ] `any` / `@ts-ignore` / `eslint-disable` without comment
- [ ] Lazy routes and code splitting for heavy pages
- [ ] Prop drilling vs context — is the boundary sensible?
- [ ] Duplicate domain state across contexts (documented duplication vs accidental)

Search:

```bash
rg "\bany\b|@ts-ignore|eslint-disable" frontend/src --glob '*.{tsx,ts}' | head -30
wc -l frontend/src/App.tsx frontend/src/pages/*.tsx frontend/src/contexts/*.tsx 2>/dev/null
```

## Accessibility

- [ ] Core workflows (drag-drop, reorder, assign fields) — pointer-only?
- [ ] Keyboard shortcuts documented and discoverable
- [ ] `aria-*`, `role`, `tabIndex`, `onKeyDown` coverage on custom controls
- [ ] MUI `Dialog` / modals — focus trap, return focus, `aria-labelledby`
- [ ] Loading states — `aria-busy`, live regions for async completion
- [ ] `dangerouslySetInnerHTML` — sanitized? user-controlled content?
- [ ] Double-click-only or hover-only affordances
- [ ] Data visualizations — table/export fallback for screen readers

Search:

```bash
rg "aria-|role=|tabIndex|onKeyDown" frontend/src -c
rg "draggable|onDragStart|onDrop" frontend/src --glob '*.tsx' | head -25
rg "dangerouslySetInnerHTML" frontend/src
```

## Maintainability

- [ ] Files > ~400 lines — candidate for split?
- [ ] Context files with 20+ methods — domain module extraction?
- [ ] Docs match actual provider tree and state flow
- [ ] Tests cover domain logic but miss build/typecheck gaps
- [ ] Naming consistency across hooks, reducers, and components
- [ ] Comments explain *why* (perf tradeoffs), not *what*

## Edge cases

- [ ] Sheet/tab/route switch — in-flight query/render cancellation
- [ ] Filter staging vs applied state — undo/redo sync
- [ ] Legacy persisted shape migration (normalization on load)
- [ ] AbortController / race handling in metadata and query hooks
- [ ] `JSON.stringify` for change detection — key order, undefined fields
- [ ] StrictMode double mount — effect cleanup correctness
- [ ] Empty/error/loading states for charts and tables
- [ ] BigInt, null, non-finite numbers from API/Arrow adapters

Search:

```bash
rg "AbortController|abort\(" frontend/src
rg "JSON\.stringify" frontend/src --glob '*.{tsx,ts}' | head -20
rg "normalize|migration|legacy|backward" frontend/src --glob '*.{tsx,ts}' -i | head -20
```

## Unnecessary complexity

- [ ] Provider exists only to satisfy one dispatch from another module
- [ ] Wrapper hooks that add no abstraction over direct sub-hook use
- [ ] Custom memo comparators with 15+ field equality checks
- [ ] Indirection layers (facade hooks, pass-through contexts)
- [ ] Duplicate providers noted as "harmless" in comments
- [ ] Over-engineered state machines for simple UI toggles

Ask: **If we deleted this layer, what breaks?** If the answer is "nothing user-visible," flag it.

## Verification gaps to mention in report

- [ ] CI runs `npm run build` (not just unit tests)
- [ ] No e2e/a11y automation — manual test plan for flagged a11y items
