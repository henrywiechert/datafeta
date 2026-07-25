// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
/**
 * Auto-update via electron-updater (GitHub Releases by default, optional generic feed).
 */
const { app, dialog, BrowserWindow } = require("electron");
const { autoUpdater } = require("electron-updater");

let checking = false;

function log(...args) {
  console.log("[updater]", ...args);
}

/**
 * Configure feed URL.
 * - Default: GitHub Releases (from electron-builder "publish" / package.json repository)
 * - Override: DATAFETA_UPDATE_URL → generic provider (internal HTTP(S) static host)
 */
function configureFeed() {
  const feedUrl = (process.env.DATAFETA_UPDATE_URL || "").trim();
  if (feedUrl) {
    autoUpdater.setFeedURL({
      provider: "generic",
      url: feedUrl.replace(/\/$/, ""),
    });
    log("Using generic feed:", feedUrl);
    return;
  }
  log("Using default publish feed (GitHub Releases)");
}

function setupAutoUpdater() {
  if (!app.isPackaged) {
    log("Skipping auto-update in unpackaged/dev mode");
    return;
  }

  configureFeed();

  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.allowPrerelease = process.env.DATAFETA_UPDATE_PRERELEASE === "1";

  autoUpdater.on("checking-for-update", () => log("Checking for update…"));
  autoUpdater.on("update-not-available", (info) => {
    log("No update available", info && info.version);
  });
  autoUpdater.on("error", (err) => {
    log("Error:", err && err.message ? err.message : err);
  });

  autoUpdater.on("update-available", async (info) => {
    log("Update available:", info.version);
    const win = BrowserWindow.getFocusedWindow();
    const { response } = await dialog.showMessageBox(win || undefined, {
      type: "info",
      buttons: ["Download", "Later"],
      defaultId: 0,
      cancelId: 1,
      title: "Update available",
      message: `Data Slicer ${info.version} is available`,
      detail: `You have ${app.getVersion()}. Download and install this update?`,
    });
    if (response === 0) {
      try {
        await autoUpdater.downloadUpdate();
      } catch (err) {
        dialog.showErrorBox(
          "Update download failed",
          err && err.message ? err.message : String(err)
        );
      }
    }
  });

  autoUpdater.on("download-progress", (progress) => {
    const pct = Math.round(progress.percent || 0);
    if (pct % 10 === 0) log(`Download ${pct}%`);
  });

  autoUpdater.on("update-downloaded", async (info) => {
    log("Update downloaded:", info.version);
    const win = BrowserWindow.getFocusedWindow();
    const { response } = await dialog.showMessageBox(win || undefined, {
      type: "info",
      buttons: ["Restart now", "Later"],
      defaultId: 0,
      cancelId: 1,
      title: "Update ready",
      message: `Version ${info.version} is ready to install`,
      detail:
        "The app will restart to apply the update. Unsaved in-app work may be lost.",
    });
    if (response === 0) {
      autoUpdater.quitAndInstall(false, true);
    }
  });
}

/**
 * @param {{ userInitiated?: boolean }} [opts]
 */
async function checkForUpdates(opts = {}) {
  const userInitiated = Boolean(opts.userInitiated);
  if (!app.isPackaged) {
    if (userInitiated) {
      await dialog.showMessageBox({
        type: "info",
        message: "Updates are only available in packaged builds.",
      });
    }
    return;
  }
  if (checking) {
    if (userInitiated) {
      await dialog.showMessageBox({
        type: "info",
        message: "Already checking for updates.",
      });
    }
    return;
  }

  checking = true;
  /** @type {(() => void) | null} */
  let onNotAvailable = null;
  if (userInitiated) {
    onNotAvailable = () => {
      dialog.showMessageBox({
        type: "info",
        message: `Data Slicer is up to date (${app.getVersion()}).`,
      });
    };
    autoUpdater.once("update-not-available", onNotAvailable);
  }

  try {
    await autoUpdater.checkForUpdates();
  } catch (err) {
    log("checkForUpdates failed:", err && err.message ? err.message : err);
    if (userInitiated) {
      dialog.showErrorBox(
        "Update check failed",
        err && err.message ? err.message : String(err)
      );
    }
  } finally {
    if (onNotAvailable) {
      autoUpdater.removeListener("update-not-available", onNotAvailable);
    }
    checking = false;
  }
}

function scheduleStartupUpdateCheck() {
  if (!app.isPackaged) return;
  setTimeout(() => {
    checkForUpdates({ userInitiated: false }).catch((err) => log(err));
  }, 8_000);
}

module.exports = {
  setupAutoUpdater,
  checkForUpdates,
  scheduleStartupUpdateCheck,
};
