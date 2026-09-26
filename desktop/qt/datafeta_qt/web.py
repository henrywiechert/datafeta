# Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
"""QtWebEngine profile, page and windows hosting the SPA served by the local backend."""
from __future__ import annotations

import logging
from pathlib import Path
from collections.abc import Callable

from PySide6.QtCore import QStandardPaths, Qt, QTimer, QUrl, Signal
from PySide6.QtGui import QDesktopServices
from PySide6.QtWebEngineCore import (
    QWebEngineDownloadRequest,
    QWebEngineFileSystemAccessRequest,
    QWebEngineFullScreenRequest,
    QWebEnginePage,
    QWebEnginePermission,
    QWebEngineProfile,
    QWebEngineScript,
    QWebEngineSettings,
)
from PySide6.QtWebEngineWidgets import QWebEngineView
from PySide6.QtWidgets import QApplication, QFileDialog, QMainWindow, QMessageBox

from . import paths

log = logging.getLogger("datafeta_qt.web")

# The SPA registers beforeunload (a "Leave site?" guard, plus state flushes). Electron's
# shell cancels the prompt via will-prevent-unload so close/reload always proceed. Qt has
# no such hook, so wrap beforeunload listeners: they still run (flushes happen) but cannot
# call preventDefault() / set returnValue. window.confirm() stays untouched.
BEFOREUNLOAD_SHIM = r"""
(() => {
  const wrapped = new WeakMap();
  const neutralize = (event) => new Proxy(event, {
    get(target, prop) {
      if (prop === 'preventDefault') return () => {};
      const value = Reflect.get(target, prop);
      return typeof value === 'function' ? value.bind(target) : value;
    },
    set(target, prop, value) {
      return prop === 'returnValue' ? true : Reflect.set(target, prop, value);
    },
  });
  const add = EventTarget.prototype.addEventListener;
  const remove = EventTarget.prototype.removeEventListener;
  const isUnloadGuard = (self, type, listener) =>
    self === window && type === 'beforeunload' && typeof listener === 'function';
  EventTarget.prototype.addEventListener = function (type, listener, options) {
    if (!isUnloadGuard(this, type, listener)) return add.call(this, type, listener, options);
    let wrapper = wrapped.get(listener);
    if (!wrapper) {
      wrapper = function (event) { listener.call(this, neutralize(event)); };
      wrapped.set(listener, wrapper);
    }
    return add.call(this, type, wrapper, options);
  };
  EventTarget.prototype.removeEventListener = function (type, listener, options) {
    if (isUnloadGuard(this, type, listener) && wrapped.has(listener)) {
      return remove.call(this, type, wrapped.get(listener), options);
    }
    return remove.call(this, type, listener, options);
  };
  Object.defineProperty(window, 'onbeforeunload', { configurable: true, get: () => null, set: () => {} });
})();
"""


def create_profile(parent) -> QWebEngineProfile:
    """Persistent profile (localStorage, cache) under the app's user data dir."""
    storage = paths.web_profile_dir()
    storage.mkdir(parents=True, exist_ok=True)
    profile = QWebEngineProfile("datafeta", parent)
    profile.setPersistentStoragePath(str(storage / "storage"))
    profile.setCachePath(str(storage / "cache"))

    script = QWebEngineScript()
    script.setName("datafeta-beforeunload-shim")
    script.setSourceCode(BEFOREUNLOAD_SHIM)
    script.setInjectionPoint(QWebEngineScript.InjectionPoint.DocumentCreation)
    script.setWorldId(QWebEngineScript.ScriptWorldId.MainWorld)
    script.setRunsOnSubFrames(False)
    profile.scripts().insert(script)

    profile.downloadRequested.connect(_on_download_requested)
    return profile


def _on_download_requested(download: QWebEngineDownloadRequest) -> None:
    """Electron's default: ask where to save. Qt cancels downloads nobody accepts."""
    downloads = QStandardPaths.writableLocation(QStandardPaths.StandardLocation.DownloadLocation)
    suggested = str(Path(downloads or Path.home()) / download.suggestedFileName())
    target, _ = QFileDialog.getSaveFileName(QApplication.activeWindow(), "Save File", suggested)
    if not target:
        download.cancel()
        return
    target_path = Path(target)
    download.setDownloadDirectory(str(target_path.parent))
    download.setDownloadFileName(target_path.name)
    download.accept()
    log.info("Downloading %s -> %s", download.url().toString(), target_path)


class WebPage(QWebEnginePage):
    """Page bound to the backend origin; everything else goes to the system browser."""

    def __init__(
        self,
        profile: QWebEngineProfile,
        backend_url: str,
        open_app_window: Callable[[QUrl], None],
        parent=None,
    ) -> None:
        super().__init__(profile, parent)
        self._origin = QUrl(backend_url)
        self._open_app_window = open_app_window

        settings = self.settings()
        settings.setAttribute(QWebEngineSettings.WebAttribute.JavascriptCanAccessClipboard, True)
        settings.setAttribute(QWebEngineSettings.WebAttribute.JavascriptCanPaste, True)
        settings.setAttribute(QWebEngineSettings.WebAttribute.FullScreenSupportEnabled, True)

        self.permissionRequested.connect(self._on_permission)
        self.fileSystemAccessRequested.connect(self._on_file_system_access)

    def is_app_url(self, url: QUrl) -> bool:
        return (
            url.scheme() == self._origin.scheme()
            and url.host() == self._origin.host()
            and url.port() == self._origin.port()
        )

    def route_url(self, url: QUrl) -> None:
        """Same-origin URLs (e.g. /help/) get an app window; the rest the default browser."""
        if self.is_app_url(url):
            self._open_app_window(url)
        elif url.scheme() in ("http", "https", "mailto"):
            QDesktopServices.openUrl(url)
        else:
            log.warning("Blocked window for %s", url.toString())

    def acceptNavigationRequest(self, url, nav_type, is_main_frame) -> bool:  # noqa: N802
        if (
            is_main_frame
            and nav_type == QWebEnginePage.NavigationType.NavigationTypeLinkClicked
            and url.scheme() in ("http", "https", "mailto")
            and not self.is_app_url(url)
        ):
            QDesktopServices.openUrl(url)
            return False
        return super().acceptNavigationRequest(url, nav_type, is_main_frame)

    def createWindow(self, _type):  # noqa: N802 - window.open / target="_blank"
        return _PopupCatcher(self.profile(), self.route_url, self)

    def _on_permission(self, permission: QWebEnginePermission) -> None:
        # Electron grants permission requests by default; keep that for our own origin only.
        if self.is_app_url(permission.origin()):
            permission.grant()
        else:
            permission.deny()

    def _on_file_system_access(self, request: QWebEngineFileSystemAccessRequest) -> None:
        # showSaveFilePicker(): the user already picked the file in a native dialog.
        if self.is_app_url(request.origin()):
            request.accept()
        else:
            request.reject()


class _PopupCatcher(QWebEnginePage):
    """Throwaway page returned from createWindow: grabs the first real URL and routes it."""

    def __init__(self, profile: QWebEngineProfile, route: Callable[[QUrl], None], parent) -> None:
        super().__init__(profile, parent)
        self._route = route
        self._done = False

    def acceptNavigationRequest(self, url, _nav_type, _is_main_frame) -> bool:  # noqa: N802
        if url.scheme() == "about":
            return True
        if not self._done:
            self._done = True
            self._route(url)
            QTimer.singleShot(0, self.deleteLater)
        return False


class BrowserWindow(QMainWindow):
    """A window with one web view. `closed` fires once the window has really closed."""

    closed = Signal()

    def __init__(self, page: WebPage, title: str = paths.APP_NAME) -> None:
        super().__init__()
        self.setAttribute(Qt.WidgetAttribute.WA_DeleteOnClose)
        self.setWindowTitle(title)
        self.view = QWebEngineView(self)
        page.setParent(self.view)
        self.view.setPage(page)
        self.setCentralWidget(self.view)
        self._devtools: QMainWindow | None = None
        self._close_ready = False
        self._close_requested = False

        page.titleChanged.connect(lambda t: self.setWindowTitle(t or title))
        page.windowCloseRequested.connect(self._finish_close)
        page.fullScreenRequested.connect(self._on_full_screen_request)
        page.renderProcessTerminated.connect(self._on_render_process_terminated)

    @property
    def page(self) -> WebPage:
        return self.view.page()  # type: ignore[return-value]

    # --- closing: run the page's beforeunload handlers first (state flush), like Electron ---
    def closeEvent(self, event) -> None:  # noqa: N802
        if self._close_ready:
            if self._devtools is not None:
                self._devtools.close()
            event.accept()
            self.closed.emit()
            return
        event.ignore()
        if not self._close_requested:
            self._close_requested = True
            self.page.triggerAction(QWebEnginePage.WebAction.RequestClose)
            QTimer.singleShot(3000, self._finish_close)  # renderer hung / never answers

    def _finish_close(self) -> None:
        if self._close_ready:
            return
        self._close_ready = True
        self.close()

    # --- view helpers used by the menu ---
    def toggle_devtools(self) -> None:
        if self._devtools is None:
            devtools = QMainWindow()
            devtools.setWindowTitle(f"Developer Tools - {self.windowTitle()}")
            view = QWebEngineView(devtools)
            view.setPage(QWebEnginePage(self.page.profile(), view))
            self.page.setDevToolsPage(view.page())
            devtools.setCentralWidget(view)
            devtools.resize(1000, 700)
            self._devtools = devtools
        if self._devtools.isVisible():
            self._devtools.hide()
        else:
            self._devtools.show()
            self._devtools.raise_()

    def zoom_by(self, step: float) -> None:
        self.view.setZoomFactor(min(5.0, max(0.25, round(self.view.zoomFactor() + step, 2))))

    def zoom_reset(self) -> None:
        self.view.setZoomFactor(1.0)

    def toggle_full_screen(self) -> None:
        if self.isFullScreen():
            self.showNormal()
        else:
            self.showFullScreen()

    def toggle_maximized(self) -> None:
        if self.isMaximized():
            self.showNormal()
        else:
            self.showMaximized()

    def bring_to_front(self) -> None:
        if self.isMinimized():
            self.showNormal()
        self.show()
        self.raise_()
        self.activateWindow()

    def _on_full_screen_request(self, request: QWebEngineFullScreenRequest) -> None:
        request.accept()
        if request.toggleOn():
            self.showFullScreen()
        else:
            self.showNormal()

    def _on_render_process_terminated(self, status, exit_code: int) -> None:
        if status == QWebEnginePage.RenderProcessTerminationStatus.NormalTerminationStatus:
            return
        log.error("Render process terminated: status=%s code=%s", status, exit_code)
        answer = QMessageBox.question(
            self,
            "Page stopped",
            "The Data Slicer page stopped unexpectedly. Reload it?",
        )
        if answer == QMessageBox.StandardButton.Yes:
            self.page.triggerAction(QWebEnginePage.WebAction.Reload)
