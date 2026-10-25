# Contributing

Thanks for contributing to this project.

## Before opening a pull request

1. Sign the Individual Contributor License Agreement in `CLA.md`, unless you are contributing under a signed corporate agreement in `CLA_CORPORATE.md`.
2. Make sure your contribution is compatible with the GNU Affero General Public License v3.0 in the root `LICENSE` file.
3. Confirm that you have the right to contribute the code, documentation, or other material you are submitting.

## Pull requests

- Open focused pull requests.
- Include tests for behavior changes when practical.
- Do not mix unrelated refactors with feature or bug-fix changes.
- Keep public API changes explicit in the PR description.

## Development setup

### Frontend

```bash
cd frontend
npm install
npm start          # dev server on http://localhost:3000
```

### Backend

```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload
```

Or, from the repository root:

```bash
python -m pip install -r backend/requirements.txt
uvicorn backend.main:app --reload
```

### Tests

Run all backend and frontend tests from the repository root:

```bash
make test
```

Architecture notes live in [`backend/README.md`](backend/README.md) and [`frontend/README.md`](frontend/README.md); see also [`frontend/ARROW.md`](frontend/ARROW.md) and [`frontend/DUCKDB_WASM.md`](frontend/DUCKDB_WASM.md). Packaging the desktop app is described in [`desktop/README.md`](desktop/README.md).

## Development standards

### Backend

- Python 3.11+
- Format with Black
- Sort imports with isort
- Keep flake8 compatibility with the existing backend configuration
- Prefer small, focused tests under `backend/tests/`

### Frontend

- TypeScript strict mode
- Follow the existing CRA and ESLint conventions
- Keep component and hook changes focused
- Add or update tests when behavior changes

## License headers

Source files in this repository use SPDX headers. Preserve existing headers and add the correct header to new source files.

## CLA enforcement

This repository is expected to enforce CLA checks in pull requests. If the CLA bot reports that your signature is missing, complete the signing step and re-run the check.
