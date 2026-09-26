# Data Slicer Desktop — Qt shell (prototype)

An alternative to the Electron shell in [`desktop/`](../README.md), built on **PySide6 + QtWebEngine**. Both use the same React build and FastAPI backend, and they share the same data folder.

| | Electron shell | Qt shell |
|---|---|---|
| Web engine | Bundled Chromium | Bundled Chromium (QtWebEngine) |
| Backend | PyInstaller sidecar process on a loopback port | Same FastAPI app, **in-process** on a loopback port |
| Toolchains | Node + Python | Python only |
| Packaging | electron-builder | PyInstaller + AppImage / Inno Setup / dmg |
| Updates | electron-updater | `datafeta_qt/updater.py` (same feed model) |

The product is named **Data Slicer Qt** (bundle id `io.datafeta.dataslicer.qt`), so it installs next to the Electron app without conflicts.

## Parity with the Electron shell

| Electron behaviour | Qt shell |
|---|---|
| Single instance; a second launch focuses the window | `QLocalServer` lock ([single_instance.py](datafeta_qt/single_instance.py)) |
| Loopback backend on a free port, 90 s startup timeout, error dialogs | [backend.py](datafeta_qt/backend.py), [app.py](datafeta_qt/app.py) (splash screen while starting) |
| Backend crash → dialog → quit | `BackendServer.exited` signal |
| 1440×900 window, minimum 960×640, closing the window quits | [app.py](datafeta_qt/app.py) |
| `will-prevent-unload` override: no "Leave site?" prompt, but the SPA's `beforeunload` flushes still run | JS shim injected at document creation ([web.py](datafeta_qt/web.py)); close goes through `RequestClose` so the handlers run |
| Menus: app / File / Edit / View / Window / Help, Check for Updates, Data directory | [menu.py](datafeta_qt/menu.py) (on macOS, Qt moves About / Updates / Quit into the app menu) |
| Chromium defaults: save dialog for downloads, `window.open`, clipboard, File System Access API | Explicit handlers in [web.py](datafeta_qt/web.py); Qt has none of these by default |
| Auto-update: GitHub Releases or `DATAFETA_UPDATE_URL`, prompt → download → restart, install on quit | [updater.py](datafeta_qt/updater.py) |
| Data under the OS app-data dir `datafeta-desktop/data/` | Same folder; QtWebEngine's own storage goes in `datafeta-desktop/qt-webengine/` |

Deliberate differences:
- External links (`target="_blank"` to other sites, or plain link clicks) open in the system browser. Electron opens them in a new Electron window, or navigates the app window away from the app.
- `window.open` to the app's own origin (for example `/help/`) opens a new app window, as in Electron.
- If the renderer process crashes, the app offers to reload the page. Electron leaves a blank window.
- On Linux, if the kernel blocks unprivileged user namespaces (Ubuntu 23.10+ AppArmor), Chromium's sandbox is switched off. The view only loads the app's own loopback origin.

## Dev loop

```bash
# Once: backend deps plus PySide6 in the same venv
backend/.venv/bin/pip install -r backend/requirements.txt -r desktop/qt/requirements.txt

./desktop/scripts/build-frontend.sh          # -> backend/static (or set FRONTEND_STATIC_DIR)
cd desktop/qt && ../../backend/.venv/bin/python -m datafeta_qt
```

Auto-update is disabled in unpackaged runs, as in Electron.

## Build

On each target OS (no cross-compilation), from the repo root:

```bash
./desktop/qt/scripts/build.sh                 # frontend -> PyInstaller -> artifacts
SKIP_FRONTEND=1 ./desktop/qt/scripts/build.sh # reuse an existing backend/static
```

Artifacts land in `desktop/qt/dist/`:

| OS | Artifacts | Self-update target |
|---|---|---|
| Linux | `.AppImage`, `.tar.gz` | AppImage (replaced in place) |
| Windows | `-setup.exe` (Inno Setup, per-user, no UAC), `.zip` | installer, run silently |
| macOS | `.dmg`, `.zip` (ad-hoc signed, same entitlements as Electron) | `.zip` (the `.app` is swapped in place) |

Each build also writes `latest-qt-<os>-<arch>.json` (version, file, sha256), which is what the updater reads.

Build-machine requirements: Python 3.11+, Node 24 (for the frontend). On Windows, Inno Setup 6 (`ISCC.exe` on PATH, in the default location, or set via `ISCC`). On Linux, `appimagetool` (downloaded automatically if missing; override with `APPIMAGETOOL`).

## CI

[`.github/workflows/desktop-qt-build.yml`](../../.github/workflows/desktop-qt-build.yml) runs on manual dispatch only. It builds macOS arm64, Windows, and Linux (on Ubuntu 22.04, for broader glibc compatibility). With **publish** ticked, it uploads everything to the GitHub Release `v<desktop/package.json version>`, alongside the Electron assets.

## Auto-update feed

| Mode | How |
|---|---|
| GitHub Releases (default) | Reads `releases/latest/download/latest-qt-<os>-<arch>.json`, then downloads from `releases/download/v<version>/` |
| Prereleases | `DATAFETA_UPDATE_PRERELEASE=1`: newest release, prereleases included, that has the metadata file (GitHub API) |
| Generic HTTP(S) | `DATAFETA_UPDATE_URL=https://host/folder/`: the `dist/` contents served as static files |

Flow: a check runs 8 s after startup, or from **Check for Updates…** → "Download / Later" → download with sha256 verification → "Restart now / Later". "Later" installs the update when the app quits. A small helper script waits for the app to exit, swaps in the new build (or runs the installer silently on Windows), and optionally relaunches.

## Environment variables

Same as the Electron shell (`DATAFETA_DATA_DIR`, `DATAFETA_UPDATE_URL`, `DATAFETA_UPDATE_PRERELEASE`, `LOG_LEVEL`, and the backend variables set by `desktop/sidecar/entrypoint.py`), plus:

| Variable | Purpose |
|---|---|
| `QTWEBENGINE_DISABLE_SANDBOX` | `1` / `0` forces the Chromium sandbox off or on (Linux auto-detects) |
| `QTWEBENGINE_REMOTE_DEBUGGING` | e.g. `9222`: attach Chrome DevTools to the web view (useful for automation) |

## Status

Tested on Linux (Rocky 8, headless / offscreen):
- **Dev mode:** automated checks for everything in the parity table. That covers startup, `beforeunload` handling (plus a control case showing the prompt would otherwise appear), `window.confirm`, same-origin and external popups, external link clicks, blob downloads, clipboard, single instance, the `beforeunload` flush on close, and backend-crash reporting.
- **Frozen PyInstaller build and AppImage:** startup, page load, single instance, graceful `SIGTERM` shutdown.
- **Update flow, end to end on Linux** against a local feed: restart-now and install-on-quit.

Not yet tested: the Windows and macOS builds (first CI run pending) and the update install steps on those two OSes. The PyInstaller `libpython` isn't stripped in local Linux builds.
