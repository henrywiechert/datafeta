# Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
"""Turn the PyInstaller output into per-OS artifacts plus latest-qt-<os>-<arch>.json.

  Linux:   .AppImage (self-update target) + .tar.gz
  Windows: -setup.exe via Inno Setup (self-update target) + .zip
  macOS:   .zip of the .app (self-update target) + .dmg
"""
from __future__ import annotations

import hashlib
import json
import os
import platform
import shutil
import stat
import subprocess
import sys
import tarfile
import urllib.request
from datetime import datetime, UTC
from pathlib import Path

QT_DIR = Path(__file__).resolve().parents[1]
REPO_ROOT = QT_DIR.parents[1]
BUILD_DIR = QT_DIR / "dist-pyinstaller"
DIST_DIR = QT_DIR / "dist"
PRODUCT_NAME = "Data Slicer Qt"
APP_ID = "io.datafeta.dataslicer.qt"
ONEDIR = BUILD_DIR / "data-slicer-qt"
ICON = REPO_ROOT / "frontend" / "public" / "logo512.png"
APPIMAGETOOL_URL = (
    "https://github.com/AppImage/appimagetool/releases/download/continuous/appimagetool-{arch}.AppImage"
)


def version() -> str:
    return json.loads((REPO_ROOT / "desktop" / "package.json").read_text())["version"]


def platform_key() -> str:
    # Must match datafeta_qt.updater.platform_key().
    os_name = {"darwin": "mac", "win32": "win"}.get(sys.platform, "linux")
    machine = platform.machine().lower()
    arch = {"x86_64": "x64", "amd64": "x64", "aarch64": "arm64"}.get(machine, machine)
    return f"{os_name}-{arch}"


def run(*cmd: str | Path, **kwargs) -> None:
    print("+", " ".join(str(c) for c in cmd), flush=True)
    subprocess.run([str(c) for c in cmd], check=True, **kwargs)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with open(path, "rb") as fh:
        while chunk := fh.read(1 << 20):
            digest.update(chunk)
    return digest.hexdigest()


# --- Linux -------------------------------------------------------------------------------------

def _appimagetool() -> Path:
    found = os.environ.get("APPIMAGETOOL") or shutil.which("appimagetool")
    if found:
        return Path(found)
    tool = QT_DIR / "build-pyinstaller" / "appimagetool.AppImage"
    if not tool.exists():
        url = APPIMAGETOOL_URL.format(arch=platform.machine())
        print(f"Downloading {url}", flush=True)
        tool.parent.mkdir(parents=True, exist_ok=True)
        urllib.request.urlretrieve(url, tool)  # noqa: S310
        tool.chmod(tool.stat().st_mode | stat.S_IEXEC)
    return tool


def package_linux(base: str) -> Path:
    tarball = DIST_DIR / f"{base}.tar.gz"
    with tarfile.open(tarball, "w:gz") as tar:
        tar.add(ONEDIR, arcname="data-slicer-qt")

    appdir = QT_DIR / "build-pyinstaller" / "AppDir"
    shutil.rmtree(appdir, ignore_errors=True)
    shutil.copytree(ONEDIR, appdir / "usr" / "lib" / "data-slicer-qt", symlinks=True)
    apprun = appdir / "AppRun"
    apprun.write_text(
        "#!/bin/sh\n"
        'HERE="$(dirname "$(readlink -f "$0")")"\n'
        f'exec "$HERE/usr/lib/data-slicer-qt/{PRODUCT_NAME}" "$@"\n'
    )
    apprun.chmod(0o755)
    (appdir / f"{APP_ID}.desktop").write_text(
        "[Desktop Entry]\n"
        "Type=Application\n"
        f"Name={PRODUCT_NAME}\n"
        "Exec=data-slicer-qt\n"
        f"Icon={APP_ID}\n"
        "Categories=Office;\n"
    )
    shutil.copy(ICON, appdir / f"{APP_ID}.png")
    shutil.copy(ICON, appdir / ".DirIcon")

    image = DIST_DIR / f"{base}.AppImage"
    env = {**os.environ, "ARCH": platform.machine(), "APPIMAGE_EXTRACT_AND_RUN": "1"}
    run(_appimagetool(), "--no-appstream", appdir, image, env=env)
    return image


# --- Windows -----------------------------------------------------------------------------------

def _iscc() -> Path:
    found = os.environ.get("ISCC") or shutil.which("iscc")
    if found:
        return Path(found)
    for root in (os.environ.get("ProgramFiles(x86)"), os.environ.get("ProgramFiles")):
        if root and (Path(root) / "Inno Setup 6" / "ISCC.exe").is_file():
            return Path(root) / "Inno Setup 6" / "ISCC.exe"
    raise SystemExit("Inno Setup (ISCC.exe) not found; install it or set ISCC.")


def package_windows(base: str) -> Path:
    shutil.make_archive(str(DIST_DIR / base), "zip", root_dir=BUILD_DIR, base_dir=ONEDIR.name)
    run(
        _iscc(),
        f"/DAppVersion={version()}",
        f"/DSourceDir={ONEDIR}",
        f"/DOutputDir={DIST_DIR}",
        f"/DOutputBaseFilename={base}-setup",
        QT_DIR / "installer" / "windows.iss",
    )
    return DIST_DIR / f"{base}-setup.exe"


# --- macOS -------------------------------------------------------------------------------------

def package_mac(base: str) -> Path:
    app = BUILD_DIR / f"{PRODUCT_NAME}.app"
    # Ad-hoc signature like the Electron build (mac.identity "-"), same entitlements.
    run(
        "codesign", "--force", "--deep", "--sign", "-", "--options", "runtime",
        "--entitlements", REPO_ROOT / "desktop" / "build-resources" / "entitlements.mac.plist",
        app,
    )
    archive = DIST_DIR / f"{base}.zip"
    run("ditto", "-c", "-k", "--sequesterRsrc", "--keepParent", app, archive)

    staging = QT_DIR / "build-pyinstaller" / "dmg"
    shutil.rmtree(staging, ignore_errors=True)
    staging.mkdir(parents=True)
    run("ditto", app, staging / app.name)
    (staging / "Applications").symlink_to("/Applications")
    run(
        "hdiutil", "create", "-volname", PRODUCT_NAME, "-srcfolder", staging,
        "-ov", "-format", "UDZO", DIST_DIR / f"{base}.dmg",
    )
    return archive


def main() -> None:
    if not BUILD_DIR.is_dir():
        raise SystemExit(f"{BUILD_DIR} missing; run PyInstaller first (desktop/qt/scripts/build.sh).")
    shutil.rmtree(DIST_DIR, ignore_errors=True)
    DIST_DIR.mkdir(parents=True)

    key = platform_key()
    base = f"Data-Slicer-Qt-{version()}-{key}"
    if sys.platform == "win32":
        update_file = package_windows(base)
    elif sys.platform == "darwin":
        update_file = package_mac(base)
    else:
        update_file = package_linux(base)

    metadata = {
        "version": version(),
        "path": update_file.name,
        "sha256": sha256(update_file),
        "size": update_file.stat().st_size,
        "releaseDate": datetime.now(UTC).isoformat(timespec="seconds"),
    }
    (DIST_DIR / f"latest-qt-{key}.json").write_text(json.dumps(metadata, indent=2) + "\n")
    for artifact in sorted(DIST_DIR.iterdir()):
        print(f"    {artifact.name}  ({artifact.stat().st_size / 1e6:.1f} MB)")


if __name__ == "__main__":
    main()
