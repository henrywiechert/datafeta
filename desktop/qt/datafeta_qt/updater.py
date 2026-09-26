# Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
"""Auto-update, modelled on the Electron shell's electron-updater setup.

Feed layout (same idea as electron-builder's latest-*.yml):
  <feed>/latest-qt-<os>-<arch>.json  {"version", "path", "sha256", "size", "releaseDate"}
  <feed>/<path>                      installer / archive for that platform

Default feed is GitHub Releases (release tag v<version>); DATAFETA_UPDATE_URL switches to a
generic static folder; DATAFETA_UPDATE_PRERELEASE=1 allows prereleases (GitHub feed only).
"""
from __future__ import annotations

import hashlib
import json
import logging
import os
import platform
import subprocess
import sys
import tempfile
import threading
import urllib.request
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import urljoin

from PySide6.QtCore import QObject, Qt, QTimer, Signal
from PySide6.QtWidgets import QApplication, QMessageBox

from . import paths

log = logging.getLogger("datafeta_qt.updater")

GITHUB_OWNER = "henrywiechert"
GITHUB_REPO = "data-slicer"
STARTUP_CHECK_DELAY_MS = 8_000


def platform_key() -> str:
    os_name = {"darwin": "mac", "win32": "win"}.get(sys.platform, "linux")
    machine = platform.machine().lower()
    arch = {"x86_64": "x64", "amd64": "x64", "aarch64": "arm64"}.get(machine, machine)
    return f"{os_name}-{arch}"


def metadata_name() -> str:
    return f"latest-qt-{platform_key()}.json"


def _version_key(version: str) -> tuple:
    """Semver ordering: 1.2.3 > 1.2.3-beta.2 > 1.2.3-beta.1 > 1.2.2."""
    core, _, pre = version.strip().lstrip("v").partition("-")
    nums = tuple(int(p) if p.isdigit() else 0 for p in core.split("+")[0].split("."))
    nums = (nums + (0, 0, 0))[:3]
    if not pre:
        return nums + ((1,),)
    ids = tuple((0, int(p), "") if p.isdigit() else (1, 0, p) for p in pre.split("."))
    return nums + ((0,) + ids,)


def is_newer(candidate: str, current: str) -> bool:
    return _version_key(candidate) > _version_key(current)


@dataclass
class UpdateInfo:
    version: str
    url: str
    sha256: str
    file_name: str


def _http_get(url: str, timeout: float = 30.0) -> bytes:
    request = urllib.request.Request(url, headers={"User-Agent": f"{paths.APP_ID}/{paths.app_version()}"})
    with urllib.request.urlopen(request, timeout=timeout) as response:  # noqa: S310 - https feeds
        return response.read()


def fetch_update_info() -> UpdateInfo:
    name = metadata_name()
    feed = os.environ.get("DATAFETA_UPDATE_URL", "").strip()
    if feed:
        base = feed.rstrip("/") + "/"
        meta = json.loads(_http_get(base + name))
        file_base = base
    elif os.environ.get("DATAFETA_UPDATE_PRERELEASE") == "1":
        api = f"https://api.github.com/repos/{GITHUB_OWNER}/{GITHUB_REPO}/releases?per_page=20"
        for release in json.loads(_http_get(api)):
            asset = next((a for a in release.get("assets", []) if a.get("name") == name), None)
            if not release.get("draft") and asset:
                meta = json.loads(_http_get(asset["browser_download_url"]))
                break
        else:
            raise RuntimeError(f"No release provides {name}")
        file_base = f"https://github.com/{GITHUB_OWNER}/{GITHUB_REPO}/releases/download/{release['tag_name']}/"
    else:
        # releases/latest/download follows the newest non-prerelease release.
        latest = f"https://github.com/{GITHUB_OWNER}/{GITHUB_REPO}/releases/latest/download/{name}"
        meta = json.loads(_http_get(latest))
        file_base = f"https://github.com/{GITHUB_OWNER}/{GITHUB_REPO}/releases/download/v{meta['version']}/"
    return UpdateInfo(
        version=str(meta["version"]),
        url=urljoin(file_base, meta["path"]),
        sha256=str(meta["sha256"]).lower(),
        file_name=Path(meta["path"]).name,
    )


def download_update(info: UpdateInfo) -> Path:
    target_dir = paths.updates_dir()
    target_dir.mkdir(parents=True, exist_ok=True)
    target = target_dir / info.file_name
    partial = target.with_name(target.name + ".part")
    digest = hashlib.sha256()
    request = urllib.request.Request(info.url, headers={"User-Agent": paths.APP_ID})
    with urllib.request.urlopen(request, timeout=60) as response, open(partial, "wb") as out:  # noqa: S310
        total = int(response.headers.get("Content-Length") or 0)
        received, last_pct = 0, -10
        while chunk := response.read(1 << 20):
            out.write(chunk)
            digest.update(chunk)
            received += len(chunk)
            pct = int(received * 100 / total) if total else 0
            if pct >= last_pct + 10:
                last_pct = pct - pct % 10
                log.info("Download %d%%", last_pct)
    if digest.hexdigest() != info.sha256:
        partial.unlink(missing_ok=True)
        raise RuntimeError("Downloaded update failed the checksum check")
    partial.replace(target)
    return target


# --- install helpers: wait for this process to exit, swap in the new build, optionally relaunch ---

_MAC_SCRIPT = r"""#!/bin/sh
pid="$1"; archive="$2"; target="$3"; relaunch="$4"
while kill -0 "$pid" 2>/dev/null; do sleep 0.5; done
tmp="$(mktemp -d)" || exit 1
ditto -x -k "$archive" "$tmp" || exit 1
app="$(find "$tmp" -maxdepth 1 -name '*.app' | head -n 1)"
[ -n "$app" ] || exit 1
rm -rf "$target" && mv "$app" "$target" || exit 1
xattr -dr com.apple.quarantine "$target" 2>/dev/null
rm -rf "$tmp" "$archive"
[ "$relaunch" = 1 ] && open "$target"
exit 0
"""

_LINUX_SCRIPT = r"""#!/bin/sh
pid="$1"; image="$2"; target="$3"; relaunch="$4"
while kill -0 "$pid" 2>/dev/null; do sleep 0.5; done
cp "$image" "$target.new" && chmod +x "$target.new" && mv -f "$target.new" "$target" || exit 1
rm -f "$image"
[ "$relaunch" = 1 ] && nohup "$target" >/dev/null 2>&1 &
exit 0
"""

_WINDOWS_SCRIPT = r"""param([int]$ParentId, [string]$Installer, [string]$AppExe, [int]$Relaunch)
Wait-Process -Id $ParentId -ErrorAction SilentlyContinue
Start-Process -FilePath $Installer -ArgumentList '/VERYSILENT','/SUPPRESSMSGBOXES','/NORESTART' -Wait
Remove-Item -LiteralPath $Installer -ErrorAction SilentlyContinue
if ($Relaunch -eq 1) { Start-Process -FilePath $AppExe }
"""


def _write_script(name: str, body: str) -> Path:
    script = Path(tempfile.gettempdir()) / name
    script.write_text(body, encoding="utf-8")
    script.chmod(0o755)
    return script


def install_target() -> Path | None:
    """What gets replaced: the .app bundle, the AppImage, or (Windows) the installed exe."""
    exe = Path(sys.executable).resolve()
    if sys.platform == "darwin":
        bundle = exe.parents[2]  # <App>.app/Contents/MacOS/<exe>
        return bundle if bundle.suffix == ".app" else None
    if sys.platform == "win32":
        return exe
    appimage = os.environ.get("APPIMAGE")
    return Path(appimage) if appimage else None


def launch_installer(update_file: Path, relaunch: bool) -> None:
    target = install_target()
    if target is None:
        raise RuntimeError("This build cannot update itself (not an installed app bundle / AppImage).")
    args = [str(os.getpid()), str(update_file), str(target), "1" if relaunch else "0"]
    if sys.platform == "win32":
        script = _write_script("datafeta-qt-update.ps1", _WINDOWS_SCRIPT)
        subprocess.Popen(  # noqa: S603
            [
                "powershell.exe", "-NoProfile", "-ExecutionPolicy", "Bypass", "-WindowStyle", "Hidden",
                "-File", str(script), "-ParentId", args[0], "-Installer", args[1],
                "-AppExe", args[2], "-Relaunch", args[3],
            ],
            creationflags=subprocess.CREATE_NO_WINDOW | subprocess.CREATE_NEW_PROCESS_GROUP,
            close_fds=True,
        )
        return
    body = _MAC_SCRIPT if sys.platform == "darwin" else _LINUX_SCRIPT
    script = _write_script("datafeta-qt-update.sh", body)
    subprocess.Popen(  # noqa: S603
        ["/bin/sh", str(script), *args],
        start_new_session=True,
        close_fds=True,
        stdin=subprocess.DEVNULL,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )


class Updater(QObject):
    """Check → ask → download → ask → install (now, or when the app quits)."""

    _checked = Signal(object, bool)  # UpdateInfo | Exception, user_initiated
    _downloaded = Signal(object, object)  # UpdateInfo, Path | Exception

    def __init__(self, parent_window_getter) -> None:
        super().__init__()
        self._window = parent_window_getter
        self._busy = False
        self._pending: tuple[UpdateInfo, Path] | None = None
        self._checked.connect(self._on_checked, Qt.ConnectionType.QueuedConnection)
        self._downloaded.connect(self._on_downloaded, Qt.ConnectionType.QueuedConnection)
        if os.environ.get("DATAFETA_UPDATE_URL", "").strip():
            log.info("Using generic feed: %s", os.environ["DATAFETA_UPDATE_URL"])
        else:
            log.info("Using default feed (GitHub Releases)")

    @property
    def enabled(self) -> bool:
        return paths.is_frozen()

    def schedule_startup_check(self) -> None:
        if self.enabled:
            QTimer.singleShot(STARTUP_CHECK_DELAY_MS, lambda: self.check(user_initiated=False))
        else:
            log.info("Skipping auto-update in unpackaged/dev mode")

    def check(self, user_initiated: bool = False) -> None:
        if not self.enabled:
            if user_initiated:
                self._info("Updates are only available in packaged builds.")
            return
        if self._busy:
            if user_initiated:
                self._info("Already checking for updates.")
            return
        self._busy = True
        log.info("Checking for update…")

        def work() -> None:
            try:
                self._checked.emit(fetch_update_info(), user_initiated)
            except Exception as exc:  # noqa: BLE001
                self._checked.emit(exc, user_initiated)

        threading.Thread(target=work, name="update-check", daemon=True).start()

    def _on_checked(self, result, user_initiated: bool) -> None:
        current = paths.app_version()
        if isinstance(result, Exception):
            self._busy = False
            log.warning("Update check failed: %s", result)
            if user_initiated:
                QMessageBox.critical(self._window(), "Update check failed", str(result))
            return
        info: UpdateInfo = result
        if not is_newer(info.version, current):
            self._busy = False
            log.info("No update available (%s)", info.version)
            if user_initiated:
                self._info(f"{paths.APP_NAME} is up to date ({current}).")
            return

        log.info("Update available: %s", info.version)
        answer = self._ask(
            "Update available",
            f"{paths.APP_NAME} {info.version} is available",
            f"You have {current}. Download and install this update?",
            "Download",
        )
        if not answer:
            self._busy = False
            return

        def work() -> None:
            try:
                self._downloaded.emit(info, download_update(info))
            except Exception as exc:  # noqa: BLE001
                self._downloaded.emit(info, exc)

        threading.Thread(target=work, name="update-download", daemon=True).start()

    def _on_downloaded(self, info: UpdateInfo, result) -> None:
        self._busy = False
        if isinstance(result, Exception):
            log.warning("Update download failed: %s", result)
            QMessageBox.critical(self._window(), "Update download failed", str(result))
            return
        log.info("Update downloaded: %s", info.version)
        self._pending = (info, result)
        if self._ask(
            "Update ready",
            f"Version {info.version} is ready to install",
            "The app will restart to apply the update. Unsaved in-app work may be lost.",
            "Restart now",
        ):
            if self._start_install(relaunch=True):
                QApplication.quit()

    def install_pending_on_quit(self) -> None:
        """electron-updater's autoInstallOnAppQuit: apply a downloaded update on exit."""
        if self._pending is not None:
            self._start_install(relaunch=False)

    def _start_install(self, relaunch: bool) -> bool:
        assert self._pending is not None
        _, update_file = self._pending
        try:
            launch_installer(update_file, relaunch)
        except Exception as exc:  # noqa: BLE001
            log.error("Could not start update install: %s", exc)
            if relaunch:
                QMessageBox.critical(
                    self._window(), "Update failed", f"{exc}\n\nThe download is at:\n{update_file}"
                )
            self._pending = None
            return False
        self._pending = None
        return True

    def _ask(self, title: str, text: str, detail: str, accept_label: str) -> bool:
        box = QMessageBox(self._window())
        box.setIcon(QMessageBox.Icon.Information)
        box.setWindowTitle(title)
        box.setText(text)
        box.setInformativeText(detail)
        accept = box.addButton(accept_label, QMessageBox.ButtonRole.AcceptRole)
        later = box.addButton("Later", QMessageBox.ButtonRole.RejectRole)
        box.setDefaultButton(accept)
        box.setEscapeButton(later)
        box.exec()
        return box.clickedButton() is accept

    def _info(self, text: str) -> None:
        QMessageBox.information(self._window(), paths.APP_NAME, text)
