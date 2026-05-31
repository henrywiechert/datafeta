---
name: backend-python-review
description: >-
  Reviews a Python/FastAPI backend as a senior staff engineer. Covers performance
  and scalability, Python/FastAPI idioms, security, maintainability, edge cases,
  and unnecessary complexity. Use when the user asks for a backend review, API
  review, FastAPI code review, or staff-level assessment of the backend.
---

# Backend Python Staff Review

Review the backend as a senior Python/FastAPI staff engineer.
Focus on:

- performance and scalability
- Python and FastAPI idioms
- security
- maintainability
- edge cases
- unnecessary complexity

## Scope

- Default target: `backend/` (adjust if the repo uses a different path).
- Read existing backend docs first (`backend/README.md`, `backend/QUERY_FLOW_DIAGRAM.md`, `backend/tests/README.md`).
- Review **evidence in code**, not assumptions. Cite paths and line ranges for every significant finding.
- Do **not** refactor or fix unless the user asks. This skill produces a review report.
- Run tests in the backend only (project convention).

## Workflow

Copy and track progress:

```
Review Progress:
- [ ] Step 1: Map architecture and hot paths
- [ ] Step 2: Run verification (tests, optional type/lint checks)
- [ ] Step 3: Investigate all six focus areas
- [ ] Step 4: Synthesize prioritized findings
- [ ] Step 5: Deliver report
```

### Step 1: Map architecture and hot paths

Identify before diving into files:

1. **Request path** — router → dependencies (`dependencies.py`, `session_state.py`) → service → connector.
2. **Session boundaries** — cookie + `X-Tab-Id` composite key; upload dirs; connector lifecycle; cleanup on disconnect/beacon.
3. **Hot paths** — `/query`, `/query-arrow`, connect/upload, metadata listing, optimization pipeline, multi-table UNION/JOIN.
4. **Documented design** — connector registry/plugin spec, query component builders, exception hierarchy, optimizer strategies.

Use semantic search and grep; read `main.py`, `dependencies.py`, and the largest routers/services.

### Step 2: Run verification

When shell access is available:

```bash
cd backend && pytest tests/ -v --tb=short
```

Optional when tooling is installed:

```bash
cd backend && python -m pip install -r requirements.txt
cd backend && flake8 . --max-line-length=100 --extend-ignore=E203,W503 2>/dev/null | head -40
cd backend && black --check . 2>/dev/null
```

Note test failures, coverage gaps for changed areas, and whether CI enforces dependency sync (`pip-compile --check` in code-quality workflow). Mention if findings are in uncommitted changes.

### Step 3: Investigate six focus areas

Work through each area systematically. For grep patterns, anti-patterns, and depth prompts, see [checklist.md](checklist.md).

| Area | Primary questions |
|------|-------------------|
| **Performance & scalability** | Blocking I/O in `async` handlers? Session memory growth? Redundant queries (counts, EXPLAIN)? Large result sets buffered in memory? Connector pooling? |
| **Python & FastAPI idioms** | Thin routers, fat services? Consistent exception types vs ad-hoc `except Exception`? Pydantic validation at boundaries? Sync endpoints doing heavy work? Type hints on public APIs? |
| **Security** | SQL built via string concat with user input? Upload size/MIME/path checks? Symlink-safe deletion? Secrets in logs or responses? Session isolation across tabs? Debug endpoints exposed? |
| **Maintainability** | Can a new engineer trace query → SQL? Are routers split by domain? Connector plugin pattern used consistently? Tests for domain logic vs router glue? Docs match router layout? |
| **Edge cases** | ClickHouse column names with `.` or table-prefixed names? Empty/error results for UNION schema alignment? Race on connect/disconnect (async lock)? Stale session after tab close? BigInt/Arrow type fidelity? |
| **Unnecessary complexity** | Duplicate validation (Pydantic + manual)? Pass-through service methods? Overlapping query builders? Defensive `except Exception` masking bugs? |

### Step 4: Synthesize findings

For each finding, record:

- **Severity**: Critical / High / Medium / Low
- **Location**: file path (+ line range when useful)
- **Observation**: what the code does
- **Impact**: user-visible, security, or developer cost
- **Recommendation**: concrete next step (one sentence)

Balance praise: call out mature patterns (PyPika query building, connector registry, split query components, exception hierarchy, integration tests for optimization).

### Step 5: Deliver report

Use the output template below. Keep prose direct; prefer tables for prioritized recommendations.

## Output template

```markdown
# Backend Review — Senior Python Staff Engineer

## Executive summary
[2–4 sentences: overall maturity, top risks, top strengths]

## Critical / blockers
[Security holes, data loss, broken core API — or "None"]

## Performance & scalability
### Working well
- …
### Concerns
- …

## Python & FastAPI idioms
### Strengths / smells
[Table or bullets with code citations]

## Security
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
| **Critical** | SQL injection, auth bypass, arbitrary file read/write, data corruption, broken core query/connect flow |
| **High** | Blocking event loop under load, session leaks, missing upload limits, systemic error-handling gaps |
| **Medium** | Localized perf debt, inconsistent patterns, missing tests for risky paths, operational footguns |
| **Low** | Style, minor dedup, nice-to-have refactors, doc drift |

## Review principles

1. **Evidence over generic advice** — tie recommendations to this codebase (connectors, optimizer, session model).
2. **Minimize noise** — skip textbook FastAPI tips unless violated here.
3. **Respect existing architecture** — suggest incremental extraction (services, registry, threadpool for blocking I/O) before rewrites.
4. **Distinguish intentional tradeoffs** — in-memory sessions for single-node deploy, heuristic FK detection, optimizer sampling/rounding changing result semantics.
5. **ClickHouse awareness** — column names may contain `.` or repeat the table name (`"<table>.<col>"`); flag mishandling in SQL generation or metadata mapping.
6. **SQL safety nuance** — PyPika-built queries are generally safe; audit raw f-string SQL in builders, estimators, and connectors separately.

## Additional resources

- Detailed investigation checklist: [checklist.md](checklist.md)
- Example finding patterns from this repo: [examples.md](examples.md)
