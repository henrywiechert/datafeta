# Backend Python Review — Investigation Checklist

Use while executing Step 3 of [SKILL.md](SKILL.md). Not every item applies to every repo; skip irrelevant rows and note why.

## Architecture discovery

- [ ] Read `main.py` — router mounts, CORS, exception handlers, startup/shutdown (upload dir cleanup)
- [ ] Map `dependencies.py` + `session_state.py` — composite session key, connector resolution, locks
- [ ] List routers under `routers/` — connection, metadata, query, relationships, snapshot, kaggle
- [ ] Trace query path: `routers/query.py` → `QueryService` → `query_components/*` → connector
- [ ] Read `connectors/registry.py` + `connectors/spec.py` — plugin contract and capabilities
- [ ] Read `backend/QUERY_FLOW_DIAGRAM.md` if present; verify against current file paths

## Performance & scalability

### Async and blocking I/O

- [ ] `async def` endpoints calling sync blocking I/O (file read, `connect()`, DB client) without threadpool
- [ ] Sync `def` endpoints on hot paths — acceptable if truly CPU-light; flag heavy work
- [ ] Long-held locks on `ConnectionStateManager` blocking concurrent requests
- [ ] Full result sets loaded into memory before streaming Arrow/JSON

Search:

```bash
rg "async def" backend/routers backend/services --glob '*.py' | head -30
rg "open\(|read\(|shutil\.|subprocess\." backend/routers backend/services --glob '*.py' | head -25
rg "run_in_executor|to_thread" backend --glob '*.py'
```

### Query and optimization hot paths

- [ ] Duplicate COUNT/EXPLAIN queries per request (optimizer, cardinality, size detector)
- [ ] Optimization strategies changing semantics without documenting in response metadata
- [ ] N+1 metadata calls (list tables then columns per table in a loop from router)
- [ ] Missing limits on raw queries or DISTINCT pair extraction
- [ ] Arrow path vs JSON path — is Arrow used for large payloads consistently?

Search:

```bash
rg "translate_to_sql|fetch_data|query-arrow|execute_query" backend --glob '*.py' | head -25
rg "COUNT\(\*\)|EXPLAIN" backend/services --glob '*.py' | head -25
```

### Session and resource lifecycle

- [ ] In-memory `session_storage` growth — sessions removed on disconnect/beacon?
- [ ] CSV upload dirs cleaned on disconnect and shutdown
- [ ] Connector instances disconnected on session removal
- [ ] Count cache / optimizer caches — bounded? per-session?

Search:

```bash
rg "session_storage|remove_session|disconnect-beacon|upload_root" backend --glob '*.py'
rg "CountCache|count_cache" backend --glob '*.py'
```

## Python & FastAPI idioms

- [ ] Routers delegate to services; minimal business logic in route handlers
- [ ] Pydantic models (`models/query.py`, `models/data_source.py`) at API boundary
- [ ] Custom exceptions from `exceptions.py` raised; global handlers in `main.py`
- [ ] Broad `except Exception` re-raised as generic errors — loses type, may hide bugs
- [ ] `print()` instead of `logger` in production paths
- [ ] Missing type hints on service public methods
- [ ] Dependency injection via `Depends(get_active_connector)` etc. — consistent?
- [ ] `response_model=` on routes for contract clarity

Search:

```bash
rg "except Exception" backend --glob '*.py' | head -30
rg "print\(" backend --glob '*.py'
rg "raise HTTPException|raise InvalidInputError|raise Query" backend/routers --glob '*.py' | head -25
wc -l backend/services/query_service.py backend/services/connection_service.py backend/routers/*.py 2>/dev/null
```

## Security

- [ ] Raw SQL f-strings interpolating user/table/column/filter values (vs PyPika / parameterized)
- [ ] Virtual columns or filter values passed through without validation/sandboxing
- [ ] File upload: size limit, MIME/sniff, extension, path traversal, symlink escape
- [ ] Session-scoped paths — uploads only deletable within session directory
- [ ] Credentials in connection details logged or returned in error messages
- [ ] Debug endpoints (`/debug/sessions`) — gated in production?
- [ ] CORS `allow_credentials` + wildcard origins misconfiguration
- [ ] Snapshot load/save — deserialization of untrusted JSON configs

Search:

```bash
rg 'f".*SELECT|f".*FROM|\.format\(' backend --glob '*.py' | head -30
rg "upload|MAX_.*SIZE|content_type|mime" backend/services/connection_service.py backend/connectors --glob '*.py'
rg "debug/" backend/routers --glob '*.py'
rg "password|secret|api_key" backend --glob '*.py' -i | head -20
```

## Maintainability

- [ ] Files > ~400 lines — `query_service.py`, `connection_service.py`, large builders
- [ ] Query logic split across `query_components/` — clear ownership?
- [ ] Connector additions follow `ConnectorSpec` registry pattern
- [ ] Unit vs integration vs contract tests — gaps on changed routers?
- [ ] `requirements.in` / `requirements.txt` sync enforced in CI
- [ ] README endpoint paths match actual router modules (not stale `data.py` references)
- [ ] Comments explain *why* (optimizer tradeoffs, dialect quirks), not *what*

Search:

```bash
ls backend/tests/unit backend/tests/integration backend/tests/contract 2>/dev/null
rg "def test_" backend/tests --glob '*.py' -c
```

## Edge cases

- [ ] ClickHouse identifiers with `.` in column names — quoting/escaping in PyPika terms
- [ ] UNION ALL schema alignment — NULL padding, type coercion, `_source_database` metadata
- [ ] Multi-table JOIN — ambiguous column names, manual FK mappings vs heuristics
- [ ] Connect while previous connect in flight — async lock behavior
- [ ] Disconnect during active query — abort/cleanup behavior
- [ ] Empty tables, zero-row filters, all-NULL dimensions in chart/query builders
- [ ] Datetime timezone / UTC warnings handled consistently (`datetime_service`, semantics module)
- [ ] int64 / BigInt fidelity through Arrow adapter
- [ ] Hive parquet / incremental file add — partial state on failure

Search:

```bash
rg "quote_char|ClickHouse|column.*\\." backend/services backend/connectors --glob '*.py' | head -20
rg "asyncio\.Lock|connect_lock" backend --glob '*.py'
rg "virtual_table|union|UNION ALL" backend/services --glob '*.py' | head -20
```

## Unnecessary complexity

- [ ] Validation duplicated in router, service, and connector
- [ ] Service methods that only forward to connector one-to-one
- [ ] Multiple overlapping SQL builders for same chart type
- [ ] Defensive try/except wrapping that always re-raises opaque `DataSourceConnectionError`
- [ ] Legacy code paths kept for unused connector modes
- [ ] Deep inheritance where composition (builders, strategies) would suffice

Ask: **If we deleted this layer, what breaks?** If the answer is "nothing user-visible," flag it.

## Verification gaps to mention in report

- [ ] CI runs `pytest` on PR (`.github/workflows/test.yml`) — note Python versions in matrix
- [ ] CI does not run mypy/black strictly (code-quality workflow uses `|| true` for linters)
- [ ] No load/integration tests for concurrent sessions — manual test plan for session isolation
- [ ] Frontend build separate from backend CI — not in scope unless full-stack review requested
