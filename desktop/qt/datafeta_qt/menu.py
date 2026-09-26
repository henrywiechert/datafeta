# Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
"""Application menu mirroring the Electron shell (app/File/Edit/View/Window/Help)."""
from __future__ import annotations

import sys
from collections.abc import Callable

from PySide6.QtCore import QUrl
from PySide6.QtGui import QAction, QDesktopServices, QKeySequence
from PySide6.QtWebEngineCore import QWebEnginePage
from PySide6.QtWidgets import QApplication, QMessageBox

from . import paths
from .web import BrowserWindow

IS_MAC = sys.platform == "darwin"


def _action(window, text, slot, shortcut=None, role=None) -> QAction:
    action = QAction(text, window)
    if shortcut is not None:
        if isinstance(shortcut, (list, tuple)):
            action.setShortcuts([QKeySequence(s) for s in shortcut])
        else:
            action.setShortcut(QKeySequence(shortcut))
    if role is not None:
        action.setMenuRole(role)
    action.triggered.connect(slot)
    return action


def _page_action(window: BrowserWindow, web_action, text, shortcut) -> QAction:
    """Edit actions run against the page; the web view handles the keys itself when focused."""
    return _action(window, text, lambda: window.page.triggerAction(web_action), shortcut)


def install_menu(
    window: BrowserWindow,
    check_for_updates: Callable[[], None],
    show_data_directory: Callable[[], None],
) -> None:
    bar = window.menuBar()
    roles = QAction.MenuRole

    # macOS: Qt moves About / Check for Updates / Quit into the application menu by role.
    about = _action(window, f"About {paths.APP_NAME}", lambda: _show_about(window), role=roles.AboutRole)
    updates = _action(
        window, "Check for Updates…", check_for_updates, role=roles.ApplicationSpecificRole
    )
    quit_action = _action(
        window, "Quit" if IS_MAC else "Exit", QApplication.quit, "Ctrl+Q", role=roles.QuitRole
    )

    file_menu = bar.addMenu("&File")
    if IS_MAC:
        file_menu.addAction(_action(window, "Close Window", window.close, "Ctrl+W"))
        file_menu.addAction(about)
        file_menu.addAction(updates)
    file_menu.addAction(quit_action)

    edit = bar.addMenu("&Edit")
    wa = QWebEnginePage.WebAction
    edit.addAction(_page_action(window, wa.Undo, "Undo", QKeySequence.StandardKey.Undo))
    edit.addAction(_page_action(window, wa.Redo, "Redo", QKeySequence.StandardKey.Redo))
    edit.addSeparator()
    edit.addAction(_page_action(window, wa.Cut, "Cut", QKeySequence.StandardKey.Cut))
    edit.addAction(_page_action(window, wa.Copy, "Copy", QKeySequence.StandardKey.Copy))
    edit.addAction(_page_action(window, wa.Paste, "Paste", QKeySequence.StandardKey.Paste))
    if IS_MAC:
        edit.addAction(
            _page_action(window, wa.PasteAndMatchStyle, "Paste and Match Style", "Ctrl+Alt+Shift+V")
        )
    edit.addSeparator()
    edit.addAction(_page_action(window, wa.SelectAll, "Select All", QKeySequence.StandardKey.SelectAll))

    view = bar.addMenu("&View")
    view.addAction(
        _action(window, "Reload", lambda: window.page.triggerAction(wa.Reload), "Ctrl+R")
    )
    view.addAction(
        _action(
            window, "Force Reload",
            lambda: window.page.triggerAction(wa.ReloadAndBypassCache), "Ctrl+Shift+R",
        )
    )
    view.addAction(
        _action(
            window, "Toggle Developer Tools", window.toggle_devtools,
            "Ctrl+Alt+I" if IS_MAC else "Ctrl+Shift+I",
        )
    )
    view.addSeparator()
    view.addAction(_action(window, "Actual Size", window.zoom_reset, "Ctrl+0"))
    view.addAction(_action(window, "Zoom In", lambda: window.zoom_by(0.1), ["Ctrl++", "Ctrl+="]))
    view.addAction(_action(window, "Zoom Out", lambda: window.zoom_by(-0.1), "Ctrl+-"))
    view.addSeparator()
    view.addAction(
        _action(
            window, "Toggle Full Screen", window.toggle_full_screen,
            "Ctrl+Meta+F" if IS_MAC else "F11",
        )
    )

    win_menu = bar.addMenu("&Window")
    win_menu.addAction(_action(window, "Minimize", window.showMinimized, "Ctrl+M"))
    if IS_MAC:
        win_menu.addAction(_action(window, "Zoom", window.toggle_maximized))
    else:
        win_menu.addAction(_action(window, "Close", window.close, "Ctrl+W"))

    help_menu = bar.addMenu("&Help")
    if not IS_MAC:
        help_menu.addAction(updates)
    help_menu.addAction(_action(window, "Data directory", show_data_directory))
    if not IS_MAC:
        help_menu.addSeparator()
        help_menu.addAction(about)


def _show_about(window) -> None:
    QMessageBox.about(
        window,
        f"About {paths.APP_NAME}",
        f"<b>{paths.APP_NAME}</b><br>Version {paths.app_version()} (Qt shell)<br><br>"
        "Copyright © 2024-2026 Henry Wiechert (datafeta.io)",
    )


def show_data_directory(window) -> None:
    folder = paths.data_dir()
    box = QMessageBox(window)
    box.setIcon(QMessageBox.Icon.Information)
    box.setWindowTitle("Data directory")
    box.setText("Data directory")
    box.setInformativeText(str(folder))
    open_button = box.addButton("Open Folder", QMessageBox.ButtonRole.ActionRole)
    box.addButton(QMessageBox.StandardButton.Ok)
    box.exec()
    if box.clickedButton() is open_button:
        QDesktopServices.openUrl(QUrl.fromLocalFile(str(folder)))
