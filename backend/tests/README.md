## Test Suite Layout

We group tests by **type** so contributors know immediately where a new spec belongs.

- `unit/` – Fast tests with no external side effects. Mirror the runtime packages so modules are easy to find.
  - `services/` – Service-layer helpers.
    - `query/` – Query builders, select/where helpers, etc.
    - `optimization/` – Optimizer planners, estimators, rounding strategies.
  - Add new subpackages as needed, e.g. `connectors/`.
- `integration/` – Cross-component flows that may touch databases, filesystems, or service orchestration.
  - `services/optimization/` currently covers the optimizer + query service handshake.
- `contract/` – Reserved for consumer-facing schema or API contract assertions.
- `legacy/` – Historical suites kept for parity while we finish the refactor. Migrate or delete these after replacement coverage lands.

### Adding New Tests

1. Choose the directory that matches the test *type* (unit vs. integration/contract).
2. Within `unit/`, create subdirectories that reflect the runtime package (`services`, `connectors`, `utils`, …).
3. Keep fixtures close to their tests via `conftest.py` in each subtree.
4. Update CI invocations if a new top-level bucket requires separate handling (e.g. `pytest tests/unit`).

Following this layout keeps fast, isolated suites easy to run (`pytest backend/tests/unit`) while making room for heavier scenarios without mixing the two styles.

