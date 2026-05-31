# Backend Python Review — Example Findings

Illustrative patterns from reviewing this repo. Adapt severity and wording to what you actually find.

## Performance — blocking I/O in async connect

**Finding:** Async route handler performs synchronous file I/O and connector setup on the event loop.

**Report excerpt:**

> `ConnectionService.connect_multipart` reads and validates the uploaded CSV synchronously inside an `async def` route. Under concurrent connects this blocks the event loop. Offload to `asyncio.to_thread` or make the route sync with a threadpool.

**Code citation pattern:**

```python
# routers/connection.py → services/connection_service.py
async def connect_to_datasource(...):
    ...
    await service.connect_multipart(...)  # inspect for sync open/read inside
```

## Performance — in-memory session storage

**Finding:** Session state is process-local with no TTL eviction.

**Report excerpt:**

> `session_storage` in `session_state.py` holds connectors and upload paths per `session_id:tab_id`. Documented for single-node deploy; flag as **High** if multi-instance production is planned without sticky sessions or Redis. Verify beacon disconnect always calls `remove_session`.

## Security — raw SQL string building

**Finding:** f-string SQL in estimator or helper bypasses PyPika parameterization.

**Report excerpt:**

> `table_size_detector.py` builds `SELECT COUNT(*) ... FROM {table_ref}`. If `table_ref` ever incorporates unsanitized user input, this is injection-prone. Prefer PyPika table references or strict allowlist validation.

**Code citation pattern:**

```120:120:backend/services/optimization/table_size_detector.py
            count_query = f"SELECT COUNT(*) as row_count FROM {table_ref}"
```

Audit context: is `table_ref` always builder-generated and quoted?

## Security — file upload hardening

**Finding:** Upload limits and path checks present or missing.

**Report excerpt (positive):**

> `ConnectionService._save_uploaded_file_with_limit` enforces 64 MiB cap and `_is_path_within_directory` guards session upload dirs — call out as a bright spot.

**Report excerpt (gap):**

> CSV connect path lacks MIME sniffing / content validation beyond extension check. Recommend magic-byte or pandas/DuckDB sniff before persisting.

## Python idioms — broad exception catch in router

**Finding:** Router catches `Exception` and wraps in connection error.

**Report excerpt:**

> `relationships.py` uses `except Exception as e` then raises `DataSourceConnectionError`. This collapses validation bugs, programming errors, and transient DB failures into 503-style errors. Catch connector-specific exceptions; let `AppException` hierarchy propagate to handlers.

```43:45:backend/routers/relationships.py
    except Exception as e:
        logger.error(f"Error detecting relationships: {e}")
        raise DataSourceConnectionError(f"Failed to detect table relationships: {e}")
```

## Python idioms — exception hierarchy (positive)

**Finding:** Centralized error handling.

**Report excerpt:**

> `exceptions.py` defines `InvalidInputError`, `QueryGenerationError`, `QueryExecutionError`, etc., with handlers registered in `main.py`. Endpoints should raise these directly instead of returning error payloads.

## Edge case — ClickHouse column names

**Finding:** Metadata or SQL generation mishandles dotted column names.

**Report excerpt:**

> ClickHouse columns may be named `"table.column"` or contain `.`. Flag any manual string splitting on `.` without dialect-aware quoting. Verify `field_reference_parser` and PyPika `quote_char` usage for ClickHouse vs DuckDB.

## Edge case — optimizer changes semantics

**Finding:** Adaptive rounding or sampling applied without client visibility.

**Report excerpt:**

> Optimizer may round measures or sample raw rows when estimates exceed thresholds. Intentional tradeoff — verify response metadata or debug fields expose applied strategies so the frontend can warn users. See `OptimizationApplier` and integration tests in `tests/integration/services/optimization/`.

## Maintainability — query pipeline split (positive)

**Finding:** Modular query builders.

**Report excerpt:**

> `QueryService.translate_to_sql` delegates to `select_builder`, `filter_builder`, `grouping_ordering_builder`, `optimization_applier`, and union-specific builders. Good separation; flag only if new chart types bypass the pipeline.

## Maintainability — stale documentation

**Finding:** README references removed modules.

**Report excerpt:**

> `backend/README.md` still links handlers to `routers/data.py`; routers are split into `connection.py`, `metadata.py`, `query.py`, `relationships.py`. Note doc drift — impacts onboarding.

## Unnecessary complexity — duplicate connect endpoints

**Finding:** Multipart vs JSON connect paths share logic unevenly.

**Report excerpt:**

> `connect` and `connect/json` routes both funnel to `ConnectionService` but with separate validation paths. Consider unified input model with content-type branching to reduce drift (already a known refactor direction).

## Unnecessary complexity — connector registry (positive)

**Finding:** Plugin architecture reduces branching.

**Report excerpt:**

> `ConnectorRegistry` + `ConnectorSpec` gate capabilities (`supports_multipart_connect`, etc.) and validate config models. New connectors should follow this pattern — flag any `if connection_type == ...` sprawl outside the registry.

## Positive patterns worth calling out

- PyPika-based SQL generation in `QueryService` and `query_components/`
- Connector plugin registry (`connectors/registry.py`, `connectors/spec.py`)
- Session + tab isolation via composite key and `X-Tab-Id`
- Query optimization with strategy planner + integration tests
- Arrow transport endpoint for large result sets
- Pydantic models for `QueryDescription` and connection details
- `QUERY_FLOW_DIAGRAM.md` documenting end-to-end flow
