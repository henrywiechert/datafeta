# Project Guidelines — DataSlicer

## Architecture

Full-stack OLAP-in-browser data analysis platform (Polaris Formalism / Tableau-like).

```
frontend/   — React 18 + TypeScript, MUI, Observable Plot, DuckDB WASM caching
backend/    — FastAPI + Python 3.11+, PyPika SQL generation, multi-connector system
docs/       — MkDocs user manual
doc/design/ — HTML architecture docs (joins/unions)
```

### Backend layers

Router → Dependencies (DI via FastAPI `Depends`) → Services → Connectors → Data sources

- **Connectors**: Plugin registry in `connectors/registry.py` with `ConnectorSpec` metadata. All connectors implement `BaseConnector` (see `connectors/base.py`).
- **Dialects**: Strategy pattern — `SqlDialect` base class with `ClickHouseDialect` and `DuckDbDialect`. Use `get_dialect(db_type)`, never `if db_type == ...` conditionals.
- **Query building**: PyPika-based, modular builders in `services/query_components/`. Custom terms: `QuotedField`, `UnquotedField`, `CastField`, `ExtractTerm`.
- **Optimization**: Strategy-based system in `services/optimization/`. Frontend sends `OptimizationHints`, backend applies adaptive rounding, binning, sampling.
- **Sessions**: Composite key `(session_id, X-Tab-Id)` for multi-tab isolation.
- **Exceptions**: Hierarchy rooted at `AppException` with status-code-specific subclasses.

### Frontend layers

Pages → Components → Hooks → Contexts/Stores → API services

- **State**: React Context (`SheetContext`, `DataSourceContext`, `VisualizationContext`) + Zustand for lightweight stores.
- **API client**: Modular services in `src/services/api/`, unified via `apiService`.
- **Types**: Domain-specific files in `src/types/`, re-exported from `index.ts`.
- **Components**: Feature-organized under `src/components/` (Visualization/, Filters/, etc.).

## Build and Test

### Backend

```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload                    # dev server
pytest tests/ -v --tb=short                  # all tests
pytest tests/unit                            # unit only
pytest tests/integration                     # integration only
```

### Frontend

```bash
cd frontend
npm install
npm start                                    # dev server (CRA, port 3000)
npm test                                     # Jest + React Testing Library (watch mode)
npm run build                                # production build
```

### Docker

```bash
./build-docker.sh                            # generates version files + builds image
docker run -p 8000:8000 data-slicer          # API at /api/v1, frontend at /
```

## Code Style

- **Backend**: Black formatting, isort imports, flake8 linting (100-char line limit, ignore E203/W503). Python 3.11+ typing.
- **Frontend**: TypeScript strict mode, CRA defaults for ESLint. Functional components with hooks; no class components.

## Conventions

- **ClickHouse column names can contain dots** (e.g., `table_name.column_name`). Always handle this in quoting/parsing logic.
- **Don't duplicate existing code** — search before implementing.
- **Minimal, focused changes** — avoid touching unrelated files.
- **No new dependencies** unless clearly justified.
- **Never expose secrets** or credentials in code or logs. Use `logging_utils.redact_sensitive()`.
- **No commits or pushes** — the user handles git operations.
- **Backend tests only** — generate or update tests to maintain coverage for changed behavior.
- **Refactor first** if a change would scatter across many files — ask the user before proceeding.

## Documentation

- User manual: `docs/` (MkDocs) — see [mkdocs.yml](../mkdocs.yml) for structure
- Backend internals: [backend/README.md](../backend/README.md), [QUERY_FLOW_DIAGRAM.md](../backend/QUERY_FLOW_DIAGRAM.md)
- Frontend internals: [frontend/README.md](../frontend/README.md), plus topic-specific docs (ARROW.md, DUCKDB_WASM.md, etc.)
- Query optimization catalog: [doc/QUERY_OPTIMIZATION_INVENTORY.md](../doc/QUERY_OPTIMIZATION_INVENTORY.md)
- Keep docs up to date after larger changes.
