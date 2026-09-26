# -*- mode: python ; coding: utf-8 -*-
# PyInstaller spec for the Qt desktop shell (UI + backend in one process).
# Build from repo root via: desktop/qt/scripts/build.sh

import json
import os
import re
import sys
from pathlib import Path

from PyInstaller.depend.bindepend import get_imports
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


# --- Trim Qt to what the shell links against -------------------------------------------------
# PyInstaller's QtQml hook (pulled in because QtWebEngineCore links QtQml/QtQuick) collects the
# whole QML tree, whose plugins drag in ~100 unused Qt libraries (Qt3D, Quick3D, Multimedia, ...).
# That roughly doubles the bundle, and macOS scans every binary on first launch. The shell uses
# no QML: drop it and the unneeded plugins, then keep only the Qt libraries still reachable from
# the remaining binaries.
_QML = re.compile(r"(^|/)PySide6/(Qt/)?qml/")
_UNUSED_PLUGINS = re.compile(
    r"(^|/)PySide6/(Qt/)?plugins/("
    r"qmltooling/"  # QML debugger
    r"|position/"  # geolocation backends (QtSerialPort)
    r"|platforminputcontexts/[^/]*virtualkeyboard"  # QtVirtualKeyboard (+ QML)
    r"|imageformats/[^/]*qpdf"  # QtPdf
    r")"
)
# Qt's own libraries: libQt6Foo.so.6 (Linux), Qt6Foo.dll (Windows), QtFoo.framework (macOS).
_QT_LIB = re.compile(
    r"(^|/)(libQt6\w+\.so[.\d]*|Qt6\w+\.dll|Qt\w+\.framework/Versions/\w+/Qt\w+)$", re.I
)
_WEBENGINE_HELPER = re.compile(r"(^|/)QtWebEngineProcess(\.exe)?$", re.I)


def _dest(entry) -> str:
    return entry[0].replace("\\", "/")


def _trim_qt(binaries, datas):
    def unused(entry) -> bool:
        return bool(_QML.search(_dest(entry)) or _UNUSED_PLUGINS.search(_dest(entry)))

    binaries = [b for b in binaries if not unused(b)]
    datas = [d for d in datas if not unused(d)]

    files = [b for b in binaries if b[2] != "SYMLINK" and os.path.isfile(b[1])]
    qt_libs = {os.path.realpath(b[1]): b for b in files if _QT_LIB.search(_dest(b))}
    # Roots: every non-Qt binary (Python extensions, Qt plugins, ...) plus the WebEngine helper,
    # which macOS collects as part of the QtWebEngineCore framework.
    todo = [b[1] for b in files if os.path.realpath(b[1]) not in qt_libs]
    todo += [d[1] for d in datas if _WEBENGINE_HELPER.search(_dest(d)) and os.path.isfile(d[1])]
    keep, seen = set(), set()
    while todo:
        path = os.path.realpath(todo.pop())
        if path in seen:
            continue
        seen.add(path)
        if path in qt_libs:
            keep.add(path)
        try:
            imports = get_imports(path)
        except Exception as exc:  # noqa: BLE001 - not a binary PyInstaller can parse
            print(f"Qt trim: cannot read imports of {path}: {exc}")
            continue
        for _name, resolved in imports:
            if resolved and os.path.realpath(resolved) in qt_libs:
                todo.append(resolved)

    dropped = [entry for path, entry in qt_libs.items() if path not in keep]
    # macOS: also drop the framework's Resources/Info.plist etc., or codesign sees a
    # framework without a binary.
    dropped_frameworks = tuple(
        _dest(entry).split(".framework/")[0] + ".framework/"
        for entry in dropped
        if ".framework/" in _dest(entry)
    )
    dropped_libs = {os.path.realpath(entry[1]) for entry in dropped}
    binaries = [
        b for b in binaries
        if os.path.realpath(b[1]) not in dropped_libs and not _dest(b).startswith(dropped_frameworks)
    ]
    datas = [d for d in datas if not _dest(d).startswith(dropped_frameworks)]

    kept_names = sorted(Path(_dest(qt_libs[p])).name for p in keep)
    print(f"Qt trim: keeping {len(kept_names)} Qt libraries: {', '.join(kept_names)}")
    print(f"Qt trim: dropped {len(dropped)} unused Qt libraries and the QML tree")
    return binaries, datas


a.binaries, a.datas = _trim_qt(a.binaries, a.datas)

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
