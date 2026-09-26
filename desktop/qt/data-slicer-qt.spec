# -*- mode: python ; coding: utf-8 -*-
# PyInstaller spec for the Qt desktop shell (UI + backend in one process).
# Build from repo root via: desktop/qt/scripts/build.sh

import json
import sys
from pathlib import Path

from PyInstaller.utils.hooks import collect_all, collect_submodules

SPECDIR = Path(SPEC).resolve().parent
REPO_ROOT = SPECDIR.parents[1]
BACKEND_DIR = REPO_ROOT / "backend"
STATIC_DIR = BACKEND_DIR / "static"
VERSION = json.loads((REPO_ROOT / "desktop" / "package.json").read_text())["version"]
PRODUCT_NAME = "Data Slicer Qt"
BUNDLE_ID = "io.datafeta.dataslicer.qt"

datas = []
binaries = []
hiddenimports = []

# Backend packaging mirrors desktop/sidecar/datafeta-backend.spec.
for pkg in ("duckdb", "pyarrow", "uvicorn", "anyio", "clickhouse_connect", "pydantic", "starlette"):
    pkg_datas, pkg_binaries, pkg_hidden = collect_all(pkg)
    datas += pkg_datas
    binaries += pkg_binaries
    hiddenimports += pkg_hidden

hiddenimports += collect_submodules(
    "backend",
    filter=lambda name: not name.startswith("backend.tests"),
)
hiddenimports += [
    "entrypoint",  # desktop/sidecar/entrypoint.py (_prepare_env)
    "uvicorn.logging",
    "uvicorn.loops",
    "uvicorn.loops.auto",
    "uvicorn.protocols",
    "uvicorn.protocols.http",
    "uvicorn.protocols.http.auto",
    "uvicorn.protocols.websockets",
    "uvicorn.protocols.websockets.auto",
    "uvicorn.lifespan",
    "uvicorn.lifespan.on",
]

if STATIC_DIR.is_dir():
    datas.append((str(STATIC_DIR), "backend/static"))

version_json = BACKEND_DIR / "version.json"
if version_json.is_file():
    datas.append((str(version_json), "backend"))

site_dir = REPO_ROOT / "site"
if site_dir.is_dir():
    datas.append((str(site_dir), "site"))

# Shell data: app version and window/splash icon.
datas.append((str(REPO_ROOT / "desktop" / "package.json"), "desktop"))
datas.append((str(REPO_ROOT / "frontend" / "public" / "logo512.png"), "frontend/public"))

a = Analysis(
    [str(SPECDIR / "launcher.py")],
    pathex=[str(REPO_ROOT), str(SPECDIR), str(REPO_ROOT / "desktop" / "sidecar")],
    binaries=binaries,
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=["backend.tests", "pytest", "pytest_cov", "tkinter"],
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name=PRODUCT_NAME,
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon=str(REPO_ROOT / "frontend" / "public" / "favicon.ico") if sys.platform == "win32" else None,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=False,
    upx_exclude=[],
    name="data-slicer-qt",
)

if sys.platform == "darwin":
    app = BUNDLE(
        coll,
        name=f"{PRODUCT_NAME}.app",
        bundle_identifier=BUNDLE_ID,
        version=VERSION,
        info_plist={
            "CFBundleDisplayName": PRODUCT_NAME,
            "CFBundleShortVersionString": VERSION,
            "CFBundleVersion": VERSION,
            "LSApplicationCategoryType": "public.app-category.productivity",
            "NSHighResolutionCapable": True,
        },
    )
