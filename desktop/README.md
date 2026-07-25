# Data Slicer Desktop

Double-click desktop shell: **Electron** hosts the UI window and spawns a packaged **FastAPI** sidecar on `127.0.0.1`.

This mirrors the all-in-one Docker layout (frontend build served from the backend) without requiring Docker, Node, or Python on the end-user machine.

## What you get

- Installer / zip for the current OS (`desktop/dist/`)
- Local backend bound to loopback only
- Auto-update from GitHub Releases (or an internal generic feed)
- Persistent data under the OS app data dir (`datafeta-desktop`):
  - macOS: `~/Library/Application Support/datafeta-desktop/data/`
  - Windows: `%APPDATA%/datafeta-desktop/data/`
  - Linux: `~/.config/datafeta-desktop/data/`
- Subdirs: `uploads/`, `snapshots/`, `logs/`

## Prerequisites (build machine only)

- Node.js 24+ (same as frontend)
- Python 3.11+ with backend deps installed (prefer `backend/.venv`)
- Platform-native build (build macOS on Mac, Windows on Windows, Linux on Linux)

```bash
# Backend venv (once)
make setup-dev
# or:
python3 -m venv backend/.venv
backend/.venv/bin/pip install -r backend/requirements.txt
```

## Build

From the repo root:

```bash
chmod +x desktop/scripts/*.sh
./desktop/scripts/package.sh
```

Or step by step:

```bash
./desktop/scripts/build-frontend.sh   # -> backend/static
./desktop/scripts/build-sidecar.sh    # -> desktop/dist-sidecar/datafeta-backend
cd desktop && npm ci && npm run dist  # -> desktop/dist
```

Artifacts land in `desktop/dist/` (dmg/AppImage/nsis and/or zip, depending on OS).

## Auto-update (Phase 2)

Packaged apps check for updates ~8s after startup, and via **Data Slicer → Check for Updates…** (macOS) or **Help → Check for Updates…** (Windows/Linux).

### Feed options

| Mode | When to use | How |
|---|---|---|
| **GitHub Releases** (default) | Public release assets, or clients that can reach GitHub with auth | Built-in `publish` config → `henrywiechert/data-slicer` |
| **Generic HTTP(S)** | Internal tools / private GitHub (no client tokens) | Set `DATAFETA_UPDATE_URL` to a static folder URL |

`DATAFETA_UPDATE_URL` must serve electron-builder metadata files such as `latest-mac.yml` / `latest.yml` / `latest-linux.yml` plus the matching artifacts (zip / nsis / AppImage). Those files are produced in `desktop/dist/` on each build.

Example (generic feed):

```bash
# Host desktop/dist artifacts on https://updates.example.com/data-slicer/
# Then launch with:
DATAFETA_UPDATE_URL=https://updates.example.com/data-slicer/ open "Data Slicer.app"
```

For a permanent internal default, bake the URL into a wrapper script or set it in the launch environment for your fleet.

### Publish a release (GitHub)

1. Bump `"version"` in `desktop/package.json` (semver).
2. Build on each target OS you support (mac/win/linux artifacts are OS-specific).
3. Publish:

```bash
export GH_TOKEN=ghp_...   # repo scope
./desktop/scripts/publish-release.sh
```

Or after a local `./desktop/scripts/package.sh`:

```bash
cd desktop
GH_TOKEN=ghp_... npm run dist:publish
```

This creates/updates a GitHub Release for that version and uploads updater metadata + installers.

**Private repo note:** clients cannot download private release assets without a token. Prefer a **generic** internal feed, or a dedicated public releases repo.

**macOS signing note:** unsigned builds can still download updates, but Gatekeeper may warn after replace. Code signing/notarization (Phase 3) makes updates smoother.

## Dev loop (no packaging)

```bash
cd desktop
npm install
DATAFETA_PYTHON=../backend/.venv/bin/python npm start
```

Optional: build only the sidecar and let Electron use `desktop/dist-sidecar/...`:

```bash
./desktop/scripts/build-frontend.sh
./desktop/scripts/build-sidecar.sh
cd desktop && npm start
```

## Smoke-test the sidecar alone

```bash
DATAFETA_HOST=127.0.0.1 \
DATAFETA_PORT=8765 \
DATAFETA_DATA_DIR=/tmp/datafeta-desktop-test \
./desktop/dist-sidecar/datafeta-backend/datafeta-backend
```

Then open `http://127.0.0.1:8765/` and `http://127.0.0.1:8765/api/v1/health`.

## Environment variables

| Variable | Set by | Purpose |
|---|---|---|
| `DATAFETA_HOST` | Electron | Always `127.0.0.1` |
| `DATAFETA_PORT` | Electron | Ephemeral free port |
| `DATAFETA_DATA_DIR` | Electron | userData `data/` root |
| `DATAFETA_UPDATE_URL` | admin / launcher | Optional generic update feed base URL |
| `DATAFETA_UPDATE_PRERELEASE` | admin | Set to `1` to allow prerelease updates |
| `UPLOAD_ROOT_DIR` | sidecar entrypoint | Upload/temp files |
| `SNAPSHOT_STORAGE_DIR` | sidecar entrypoint | Snapshot JSON store |
| `LOG_FILE` | sidecar entrypoint | Backend log path |
| `FRONTEND_STATIC_DIR` | sidecar entrypoint | Bundled SPA path |
| `DATAFETA_PYTHON` | developer | Python used in unpackaged mode |
| `GH_TOKEN` | publisher | Publish desktop releases to GitHub |

## Layout

```
desktop/
  electron/main.js       # spawn sidecar, window, quit cleanup, menu
  electron/updater.js    # electron-updater wiring
  sidecar/entrypoint.py  # env prep + uvicorn
  sidecar/datafeta-backend.spec
  scripts/build-frontend.sh
  scripts/build-sidecar.sh
  scripts/package.sh
  scripts/publish-release.sh
  package.json           # electron + electron-builder + updater
```

## Known limits

- Unsigned builds (Gatekeeper / SmartScreen may warn)
- Bundle size is large (Chromium + Python + DuckDB/Arrow)
- Cross-compilation is unsupported — build on each target OS
- Private GitHub release downloads need auth; use a generic feed for internal fleets
