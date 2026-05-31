---
name: frontend-react-review
description: >-
  Reviews a React/TypeScript frontend as a senior staff engineer. Covers render
  performance, React idioms, accessibility, maintainability, edge cases, and
  unnecessary complexity. Use when the user asks for a frontend review, React
  code review, UI architecture review, or staff-level assessment of the frontend.
---

# Frontend React Staff Review

Review the frontend as a senior React staff engineer.
Focus on:

- render performance
- React idioms
- accessibility
- maintainability
- edge cases
- unnecessary complexity

## Scope

- Default target: `frontend/src/` (adjust if the repo uses a different path).
- Read existing frontend docs first (`frontend/README.md`, `frontend/ui-management.md`, `frontend/src/contexts/CONTEXTS.md`, hook docs).
- Review **evidence in code**, not assumptions. Cite paths and line ranges for every significant finding.
- Do **not** refactor or fix unless the user asks. This skill produces a review report.

## Workflow

Copy and track progress:

```
Review Progress:
- [ ] Step 1: Map architecture and hot paths
- [ ] Step 2: Run verification (build/tests)
- [ ] Step 3: Investigate all six focus areas
- [ ] Step 4: Synthesize prioritized findings
- [ ] Step 5: Deliver report
```

### Step 1: Map architecture and hot paths

Identify before diving into files:

1. **Provider tree** — nesting order, duplicate providers, remount keys (e.g. `key={sheetId}`).
2. **State boundaries** — what is global vs per-route vs per-feature; where persistence/sync happens.
3. **Render hot paths** — chart grids, lists, drag-and-drop surfaces, tables, modals.
4. **Documented perf decisions** — memo comparators, refs-for-callbacks, deferred values, coordinator hooks.

Use semantic search and grep; read provider files and the largest page/orchestrator components.

### Step 2: Run verification

When shell access is available:

```bash
cd frontend && npm test -- --watchAll=false --passWithNoTests
cd frontend && npm run build
```

Note build failures, test gaps (tests pass but build fails = CI gap), and whether findings are in uncommitted changes.

### Step 3: Investigate six focus areas

Work through each area systematically. For grep patterns, anti-patterns, and depth prompts, see [checklist.md](checklist.md).

| Area | Primary questions |
|------|-------------------|
| **Render performance** | What re-renders on every state tick? Are memo boundaries early enough? Are expensive effects (SVG, ResizeObserver, full replot) isolated? |
| **React idioms** | Are hooks/contexts used idiomatically? Any god components, god hooks, stale closures, or fragile `eslint-disable`? |
| **Accessibility** | Can core flows work without a pointer? Are dialogs, loading states, and dynamic content announced and focus-managed? |
| **Maintainability** | Can a new engineer find state flow? Are files/docs proportional? Is domain logic duplicated across contexts? |
| **Edge cases** | Remounts, races, abort/cancel, legacy data migration, stale UI during transitions, memo comparator drift? |
| **Unnecessary complexity** | Coupling for one call site, custom comparators, redundant providers, indirection layers — does complexity buy measurable value? |

### Step 4: Synthesize findings

For each finding, record:

- **Severity**: Critical / High / Medium / Low
- **Location**: file path (+ line range when useful)
- **Observation**: what the code does
- **Impact**: user-visible or developer cost
- **Recommendation**: concrete next step (one sentence)

Balance praise: call out mature patterns already in place (stable callbacks, selective subscriptions, deferred rendering, good docs).

### Step 5: Deliver report

Use the output template below. Keep prose direct; prefer tables for prioritized recommendations.

## Output template

```markdown
# Frontend Review — Senior React Staff Engineer

## Executive summary
[2–4 sentences: overall maturity, top risks, top strengths]

## Critical / blockers
[Build breaks, security (XSS), data loss — or "None"]

## Render performance
### Working well
- …
### Concerns
- …

## React idioms
### Strengths / smells
[Table or bullets with code citations]

## Accessibility
### Gaps / bright spots

## Maintainability

## Edge cases

## Unnecessary complexity

## Prioritized recommendations
| Priority | Action | Effort |
|----------|--------|--------|
| P0 | … | … |

## Summary
[Short closing: what to fix first and why]
```

## Severity guide

| Level | When to use |
|-------|-------------|
| **Critical** | Broken build, XSS, broken core workflow, data corruption |
| **High** | Systemic re-render tax, major a11y blockers, unmaintainable hotspots |
| **Medium** | Localized perf debt, inconsistent patterns, missing keyboard paths |
| **Low** | Style, minor dedup, nice-to-have refactors |

## Review principles

1. **Evidence over generic advice** — tie recommendations to this codebase.
2. **Minimize noise** — skip textbook React tips unless violated here.
3. **Respect existing architecture** — suggest incremental splits (selectors, debounced sync, smaller providers) before rewrites.
4. **Distinguish intentional tradeoffs** — e.g. `useDeferredValue` showing stale UI, `StrictMode` double effects in dev, remount-on-sheet-switch.
5. **Flag memo footguns** — custom `React.memo` comparators that omit new props cause silent bugs.

## Additional resources

- Detailed investigation checklist: [checklist.md](checklist.md)
- Example finding patterns from this repo: [examples.md](examples.md)
