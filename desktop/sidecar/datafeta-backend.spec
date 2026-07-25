# -*- mode: python ; coding: utf-8 -*-
# PyInstaller spec for the Data Slicer desktop sidecar.
# Build from repo root via: desktop/scripts/build-sidecar.sh

import sys
from pathlib import Path

from PyInstaller.utils.hooks import collect_all, collect_submodules

SPECDIR = Path(SPEC).resolve().parent
REPO_ROOT = SPECDIR.parents[1]
BACKEND_DIR = REPO_ROOT / "backend"
STATIC_DIR = BACKEND_DIR / "static"

datas = []
binaries = []
hiddenimports = []

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

block_cipher = None

a = Analysis(
    [str(SPECDIR / "entrypoint.py")],
    pathex=[str(REPO_ROOT)],
    binaries=binaries,
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=["backend.tests", "pytest", "pytest_cov"],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="datafeta-backend",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.zipfiles,
    a.datas,
    strip=False,
    upx=False,
    upx_exclude=[],
    name="datafeta-backend",
)
