# Data Slicer Desktop

Double-click desktop app for Windows, macOS and Linux, built on **PySide6 + QtWebEngine**. The FastAPI backend runs **in-process** on a loopback port, and the React build is shown in a bundled Chromium (QtWebEngine). No Docker, Python or Node is needed on the end-user machine. Packaging is PyInstaller + AppImage / Inno Setup / dmg.

Bundle id `io.datafeta.dataslicer`, product name **Data Slicer**.

## What you get

- Installer / archive for the current OS (`desktop/dist/`): AppImage, Inno Setup installer, dmg
- Local backend bound to loopback only
- Auto-update from GitHub Releases (or an internal generic feed)
- Persistent data under the OS app data dir (`datafeta-desktop`):
  - macOS: `~/Library/Application Support/datafeta-desktop/data/`
  - Windows: `%APPDATA%/datafeta-desktop/data/`
  - Linux: `~/.config/datafeta-desktop/data/`
- Subdirs: `uploads/`, `snapshots/`, `logs/`

## Layout

```
desktop/
  datafeta_desktop/      # the app: backend.py, web.py, menu.py, updater.py, ...
  data-slicer.spec       # PyInstaller spec
  launcher.py            # PyInstaller entry script
  installer/windows.iss  # Inno Setup script
  scripts/build.sh       # frontend -> PyInstaller -> artifacts
  scripts/package.py     # per-OS packaging + update metadata
  scripts/build-frontend.sh
  build-resources/       # macOS entitlements
  requirements.txt       # PySide6 + PyInstaller
  package.json           # holds only the desktop version
```

## Behaviour

| Area | Implementation |
|---|---|
| Single instance; a second launch focuses the window | `QLocalServer` lock ([single_instance.py](datafeta_desktop/single_instance.py)) |
| Loopback backend on a free port, 90 s startup timeout, error dialogs | [backend.py](datafeta_desktop/backend.py), [app.py](datafeta_desktop/app.py) (splash screen while starting) |
| Backend crash → dialog → quit | `BackendServer.exited` signal |
| 1440×900 window, minimum 960×640, closing the window quits | [app.py](datafeta_desktop/app.py) |
| No "Leave site?" prompt, but the SPA's `beforeunload` flushes still run | JS shim injected at document creation ([web.py](datafeta_desktop/web.py)); close goes through `RequestClose` so the handlers run |
| Menus: app / File / Edit / View / Window / Help, Check for Updates, Data directory | [menu.py](datafeta_desktop/menu.py) (on macOS, Qt moves About / Updates / Quit into the app menu) |
| Save dialog for downloads, `window.open`, clipboard, File System Access API | Explicit handlers in [web.py](datafeta_desktop/web.py); Qt has none of these by default |
| Auto-update: GitHub Releases or `DATAFETA_UPDATE_URL`, prompt → download → restart, install on quit | [updater.py](datafeta_desktop/updater.py) |
| Data under the OS app-data dir `datafeta-desktop/data/` | [paths.py](datafeta_desktop/paths.py); QtWebEngine's own storage goes in `datafeta-desktop/qt-webengine/` |

Notes:
- External links (`target="_blank"` to other sites, or plain link clicks) open in the system browser.
- `window.open` to the app's own origin (for example `/help/`) opens a new app window.
- If the renderer process crashes, the app offers to reload the page.
- On Linux, if the kernel blocks unprivileged user namespaces (Ubuntu 23.10+ AppArmor), Chromium's sandbox is switched off. The view only loads the app's own loopback origin.

## Dev loop

```bash
# Once: backend deps plus PySide6 in the same venv
backend/.venv/bin/pip install -r backend/requirements.txt -r desktop/requirements.txt

./desktop/scripts/build-frontend.sh          # -> backend/static (or set FRONTEND_STATIC_DIR)
cd desktop && ../backend/.venv/bin/python -m datafeta_desktop
```

Auto-update is disabled in unpackaged runs.

## Build

On each target OS (no cross-compilation), from the repo root:

```bash
./desktop/scripts/build.sh                 # frontend -> PyInstaller -> artifacts
SKIP_FRONTEND=1 ./desktop/scripts/build.sh # reuse an existing backend/static
```

Artifacts land in `desktop/dist/`:

| OS | Artifacts | Self-update target |
|---|---|---|
| Linux | `.AppImage`, `.tar.gz` | AppImage (replaced in place) |
| Windows | `-setup.exe` (Inno Setup, per-user, no UAC), `.zip` | installer, run silently |
| macOS | `.dmg`, `.zip` (ad-hoc signed, hardened-runtime entitlements from `desktop/build-resources/`) | `.zip` (the `.app` is swapped in place) |

Each build also writes `latest-qt-<os>-<arch>.json` (version, file, sha256), which is what the updater reads.

Build-machine requirements: Python 3.11+, Node 24 (for the frontend). On Windows, Inno Setup 6 (`ISCC.exe` on PATH, in the default location, or set via `ISCC`). On Linux, `appimagetool` (downloaded automatically if missing; override with `APPIMAGETOOL`).

## Auto-update feed

| Mode | How |
|---|---|
| GitHub Releases (default) | Reads `releases/latest/download/latest-qt-<os>-<arch>.json`, then downloads from `releases/download/v<version>/` |
| Prereleases | `DATAFETA_UPDATE_PRERELEASE=1`: newest release, prereleases included, that has the metadata file (GitHub API) |
| Generic HTTP(S) | `DATAFETA_UPDATE_URL=https://host/folder/`: the `dist/` contents served as static files |

Flow: a check runs 8 s after startup, or from **Check for Updates…** → "Download / Later" → download with sha256 verification → "Restart now / Later". "Later" installs the update when the app quits. A small helper script waits for the app to exit, swaps in the new build (or runs the installer silently on Windows), and optionally relaunches.

## Environment variables

`DATAFETA_DATA_DIR`, `DATAFETA_UPDATE_URL`, `DATAFETA_UPDATE_PRERELEASE`, `LOG_LEVEL`, and the backend variables set in [backend.py](datafeta_desktop/backend.py) (`UPLOAD_ROOT_DIR`, `SNAPSHOT_STORAGE_DIR`, `LOG_FILE`, `FRONTEND_STATIC_DIR`), plus:

| Variable | Purpose |
|---|---|
| `QTWEBENGINE_DISABLE_SANDBOX` | `1` / `0` forces the Chromium sandbox off or on (Linux auto-detects) |
| `QTWEBENGINE_REMOTE_DEBUGGING` | e.g. `9222`: attach Chrome DevTools to the web view (useful for automation) |

## Status

Tested on Linux (Rocky 8, headless / offscreen):
- **Dev mode:** automated checks for everything in the behaviour table. That covers startup, `beforeunload` handling (plus a control case showing the prompt would otherwise appear), `window.confirm`, same-origin and external popups, external link clicks, blob downloads, clipboard, single instance, the `beforeunload` flush on close, and backend-crash reporting.
- **Frozen PyInstaller build and AppImage:** startup, page load, single instance, graceful `SIGTERM` shutdown.
- **Update flow, end to end on Linux** against a local feed: restart-now and install-on-quit.

Not yet tested: the Windows and macOS builds (first CI run pending) and the update install steps on those two OSes. The PyInstaller `libpython` isn't stripped in local Linux builds.

## Release

Workflow: [`.github/workflows/desktop-build.yml`](../.github/workflows/desktop-build.yml) builds macOS (arm64), Windows and Linux (on Ubuntu 22.04, for broader glibc compatibility) in parallel.

| Trigger | Behavior |
|---|---|
| Actions → **Desktop build** → Run workflow | Build all platforms; optionally tick **publish** (release `v<desktop/package.json version>`) |
| Push tag `desktop-v1.2.3` | Build all platforms and publish a GitHub Release for `1.2.3` (the tag overrides the version) |

```bash
git tag desktop-v0.2.2
git push origin desktop-v0.2.2
```

Publishing uploads the artifacts plus `latest-qt-<os>-<arch>.json` to the release. `desktop/package.json` exists only to hold the desktop `version`.

Private repo note: clients cannot download private release assets without a token. Use a generic internal feed, or a public releases repo.

## Known limits

- Unsigned builds (Gatekeeper / SmartScreen may warn)
- Bundle size is large (Chromium + Python + DuckDB/Arrow)
- Cross-compilation is unsupported — build on each target OS
