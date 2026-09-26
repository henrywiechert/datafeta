# Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
"""Qt shell entry: single instance, in-process backend, main window, menu, updater."""
from __future__ import annotations

import faulthandler
import logging
import os
import signal
import sys
import time
from pathlib import Path

from PySide6.QtCore import QCoreApplication, QEvent, QSize, Qt, QTimer, QUrl
from PySide6.QtGui import QIcon, QPixmap
from PySide6.QtWidgets import QApplication, QMessageBox, QSplashScreen
from shiboken6 import isValid

from . import menu, paths
from .backend import BackendServer, find_free_port, load_backend_app, prepare_environment
from .single_instance import SingleInstance
from .updater import Updater
from .web import BrowserWindow, WebPage, create_profile

log = logging.getLogger("datafeta_qt")

STARTUP_TIMEOUT_S = 90
HEALTH_POLL_MS = 250
# While starting, dump all thread stacks to desktop.log this often, so a hang shows where it is.
STALL_DUMP_S = 30


def _setup_logging() -> None:
    logs = paths.data_dir() / "logs"
    logs.mkdir(parents=True, exist_ok=True)
    # Always log to a file: GUI launches have no console (Windows: stdout is None; macOS
    # Finder / Linux desktop launches: stdout is /dev/null).
    log_file = open(logs / "desktop.log", "a", buffering=1, encoding="utf-8")  # noqa: SIM115
    # Give uvicorn / print() a real stream to write to.
    if sys.stdout is None or sys.stderr is None:
        sys.stdout = sys.stdout or log_file
        sys.stderr = sys.stderr or log_file

    # Configure only the shell's logger: root stays unconfigured so backend.main's
    # logging.basicConfig still installs its backend.log handler.
    formatter = logging.Formatter("%(asctime)s [desktop] %(levelname)s %(name)s: %(message)s")
    shell_log = logging.getLogger("datafeta_qt")
    shell_log.setLevel(logging.INFO)
    shell_log.propagate = False
    streams = [log_file] if sys.stderr is log_file else [log_file, sys.stderr]
    for stream in streams:
        handler = logging.StreamHandler(stream)
        handler.setFormatter(formatter)
        shell_log.addHandler(handler)
    shell_log.info("Starting %s %s (%s)", paths.PRODUCT_NAME, paths.app_version(), sys.platform)

    # Native crashes (SIGSEGV/SIGABRT) and startup hangs leave a Python traceback in the log.
    faulthandler.enable(file=log_file, all_threads=True)
    faulthandler.dump_traceback_later(STALL_DUMP_S, repeat=True, file=log_file)


def _configure_chromium() -> None:
    """Must run before QApplication exists."""
    if sys.platform.startswith("linux") and "QTWEBENGINE_DISABLE_SANDBOX" not in os.environ:
        # Ubuntu 23.10+ (AppArmor) blocks the unprivileged user namespaces Chromium's sandbox
        # needs. The view only ever renders our own loopback origin; external links open in
        # the system browser.
        restricted = Path("/proc/sys/kernel/apparmor_restrict_unprivileged_userns")
        clone = Path("/proc/sys/kernel/unprivileged_userns_clone")
        try:
            if (restricted.is_file() and restricted.read_text().strip() == "1") or (
                clone.is_file() and clone.read_text().strip() == "0"
            ):
                os.environ["QTWEBENGINE_DISABLE_SANDBOX"] = "1"
        except OSError:
            pass


class DesktopApp:
    def __init__(self, qt_app, backend: BackendServer, splash: QSplashScreen | None) -> None:
        self.qt_app = qt_app
        self.backend = backend
        self.splash = splash
        self.windows: list[BrowserWindow] = []
        self.main_window: BrowserWindow | None = None
        self.quitting = False

        self.profile = create_profile(qt_app)
        self.updater = Updater(lambda: self.main_window)
        self.main_window = self._create_window(None, main=True)

        self.backend.exited.connect(self._on_backend_exited)
        self.backend.start()
        self._deadline = time.monotonic() + STARTUP_TIMEOUT_S
        self._health_timer = QTimer()
        self._health_timer.timeout.connect(self._poll_startup)
        self._health_timer.start(HEALTH_POLL_MS)

    # --- windows ---
    def _create_window(self, url: QUrl | None, main: bool = False) -> BrowserWindow:
        page = WebPage(self.profile, self.backend.url, self.open_app_window)
        window = BrowserWindow(page)
        if main:
            window.resize(1440, 900)
            window.setMinimumSize(QSize(960, 640))
            menu.install_menu(
                window,
                check_for_updates=lambda: self.updater.check(user_initiated=True),
                show_data_directory=lambda: menu.show_data_directory(window),
            )
            # Single-window utility app: closing the main window quits.
            window.closed.connect(self.quit)
        else:
            window.resize(1100, 800)
        window.closed.connect(lambda: self.windows.remove(window))
        self.windows.append(window)
        if url is not None:
            page.load(url)
        return window

    def open_app_window(self, url: QUrl) -> None:
        """window.open() to our own origin (e.g. the /help/ manual) opens a new app window."""
        window = self._create_window(url)
        window.show()

    def activate(self) -> None:
        if self.main_window is not None:
            self.main_window.bring_to_front()

    # --- backend lifecycle ---
    def _poll_startup(self) -> None:
        if self.backend.started:
            self._health_timer.stop()
            log.info("Backend ready on %s", self.backend.url)
            self.main_window.page.load(QUrl(self.backend.url))
            self.main_window.show()
            self._close_splash()
            self.updater.schedule_startup_check()
            return
        if time.monotonic() > self._deadline:
            self._health_timer.stop()
            self._close_splash()
            QMessageBox.critical(
                self.main_window,
                "Data Slicer failed to start",
                f"Backend did not become ready within {STARTUP_TIMEOUT_S}s.\n\n"
                f"Check logs under:\n{paths.data_dir() / 'logs'}",
            )
            self.quit()

    def _on_backend_exited(self, reason: str) -> None:
        log.info("Backend exited: %s", reason)
        if self.quitting or self.backend.stopping:
            return
        self._health_timer.stop()
        self._close_splash()
        title = "Data Slicer backend stopped" if self.backend.started else "Data Slicer failed to start"
        QMessageBox.critical(
            self.main_window,
            title,
            f"The local backend exited unexpectedly ({reason}).\nThe window will close.\n\n"
            f"Check logs under:\n{paths.data_dir() / 'logs'}",
        )
        self.quit()

    def _close_splash(self) -> None:
        # Startup is over (window shown or error reported): stop the stall dumps.
        faulthandler.cancel_dump_traceback_later()
        if self.splash is not None:
            self.splash.close()
            self.splash = None

    def quit(self) -> None:
        self.quitting = True
        # Deferred so the closing window finishes its close event first.
        QTimer.singleShot(0, self.qt_app.quit)

    def shutdown(self) -> None:
        """After the event loop: stop the backend, then release pages before the profile."""
        self.quitting = True
        self.backend.stop()
        self.updater.install_pending_on_quit()
        for window in self.windows:
            if isValid(window):
                window.deleteLater()
        self.windows.clear()
        self.main_window = None
        QCoreApplication.sendPostedEvents(None, QEvent.Type.DeferredDelete)
        self.profile.deleteLater()
        QCoreApplication.sendPostedEvents(None, QEvent.Type.DeferredDelete)


def _route_signals_to_quit(desktop: DesktopApp) -> None:
    """SIGTERM/SIGINT (logout, kill, Ctrl+C) take the normal quit path so the backend shuts down."""
    for sig in (signal.SIGTERM, signal.SIGINT):
        signal.signal(sig, lambda *_: desktop.quit())
    # Python only runs signal handlers between bytecodes; wake the interpreter periodically.
    timer = QTimer(desktop.qt_app)
    timer.timeout.connect(lambda: None)
    timer.start(500)


def _show_splash(icon) -> QSplashScreen | None:
    if icon is None:
        return None
    pixmap = QPixmap(str(icon)).scaledToWidth(256, Qt.TransformationMode.SmoothTransformation)
    splash = QSplashScreen(pixmap)
    splash.showMessage(
        "Starting Data Slicer…", Qt.AlignmentFlag.AlignBottom | Qt.AlignmentFlag.AlignHCenter
    )
    splash.show()
    QApplication.processEvents()
    return splash


def main() -> int:
    _setup_logging()
    _configure_chromium()

    QCoreApplication.setAttribute(Qt.ApplicationAttribute.AA_ShareOpenGLContexts)
    qt_app = QApplication(sys.argv)
    qt_app.setApplicationName(paths.PRODUCT_NAME)
    qt_app.setApplicationDisplayName(paths.APP_NAME)
    qt_app.setApplicationVersion(paths.app_version())
    qt_app.setOrganizationDomain("datafeta.io")
    qt_app.setDesktopFileName(paths.APP_ID)
    icon = paths.icon_path()
    if icon is not None:
        qt_app.setWindowIcon(QIcon(str(icon)))

    lock = SingleInstance(paths.APP_ID)
    if not lock.acquire():
        log.info("Another instance is running; asked it to come to the front.")
        return 0

    splash = _show_splash(icon)
    started: list[DesktopApp] = []

    def start() -> None:
        try:
            port = find_free_port()
            prepare_environment(port)
            # Before any QtWebEngine object exists (see load_backend_app).
            backend = BackendServer(port, load_backend_app())
            desktop = DesktopApp(qt_app, backend, splash)
        except Exception as exc:  # noqa: BLE001
            log.exception("Startup failed")
            faulthandler.cancel_dump_traceback_later()
            if splash is not None:
                splash.close()
            QMessageBox.critical(
                None,
                "Data Slicer failed to start",
                f"{exc}\n\nCheck logs under:\n{paths.data_dir() / 'logs'}",
            )
            qt_app.exit(1)
            return
        started.append(desktop)
        lock.activated.connect(desktop.activate)
        _route_signals_to_quit(desktop)

    # The backend import is slow (seconds on a cold start). Run it from inside the event loop:
    # macOS keeps bouncing the Dock icon, and may not draw the splash, until exec() runs.
    QTimer.singleShot(0, start)
    code = qt_app.exec()
    if started:
        started[0].shutdown()
    return code
