// Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
/**
 * Electron main process: spawn the FastAPI sidecar, open a window on localhost, kill on quit.
 */
const { app, BrowserWindow, dialog, Menu } = require("electron");
const { spawn } = require("child_process");
const http = require("http");
const net = require("net");
const fs = require("fs");
const path = require("path");
const {
  setupAutoUpdater,
  checkForUpdates,
  scheduleStartupUpdateCheck,
} = require("./updater");

const HEALTH_PATH = "/api/v1/health";
const STARTUP_TIMEOUT_MS = 90_000;
const HEALTH_POLL_MS = 250;

/** @type {import('child_process').ChildProcess | null} */
let backendProcess = null;
/** @type {BrowserWindow | null} */
let mainWindow = null;
let backendPort = null;
let isQuitting = false;

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function findFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : null;
      server.close((err) => {
        if (err) reject(err);
        else if (!port) reject(new Error("Failed to allocate a free port"));
        else resolve(port);
      });
    });
  });
}

function httpGetOk(url) {
  return new Promise((resolve) => {
    const req = http.get(url, { timeout: 2000 }, (res) => {
      res.resume();
      resolve(res.statusCode === 200);
    });
    req.on("error", () => resolve(false));
    req.on("timeout", () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function waitForHealth(port, timeoutMs) {
  const url = `http://127.0.0.1:${port}${HEALTH_PATH}`;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (backendProcess && backendProcess.exitCode !== null) {
      throw new Error(`Backend exited early with code ${backendProcess.exitCode}`);
    }
    if (await httpGetOk(url)) return;
    await sleep(HEALTH_POLL_MS);
  }
  throw new Error(`Backend did not become healthy within ${timeoutMs}ms (${url})`);
}

function dataDir() {
  return path.join(app.getPath("userData"), "data");
}

function sidecarBinaryPath() {
  const name = process.platform === "win32" ? "datafeta-backend.exe" : "datafeta-backend";
  if (app.isPackaged) {
    return path.join(process.resourcesPath, "sidecar", "datafeta-backend", name);
  }
  // Unpackaged: prefer a locally built sidecar if present.
  const local = path.join(__dirname, "..", "dist-sidecar", "datafeta-backend", name);
  if (fs.existsSync(local)) return local;
  return null;
}

function spawnBackend(port) {
  const env = {
    ...process.env,
    DATAFETA_HOST: "127.0.0.1",
    DATAFETA_PORT: String(port),
    DATAFETA_DATA_DIR: dataDir(),
    LOG_LEVEL: process.env.LOG_LEVEL || "info",
  };

  const binary = sidecarBinaryPath();
  if (binary) {
    console.log(`[desktop] Starting packaged sidecar: ${binary}`);
    return spawn(binary, [], {
      env,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
  }

  // Dev fallback: run the Python entrypoint from the repo.
  const repoRoot = path.join(__dirname, "..", "..");
  const entry = path.join(__dirname, "..", "sidecar", "entrypoint.py");
  const python =
    process.env.DATAFETA_PYTHON ||
    (process.platform === "win32" ? "python" : "python3");
  console.log(`[desktop] Starting Python sidecar: ${python} ${entry}`);
  return spawn(python, [entry], {
    cwd: repoRoot,
    env: {
      ...env,
      PYTHONPATH: repoRoot,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function attachBackendLogs(child) {
  const prefix = "[sidecar]";
  if (child.stdout) {
    child.stdout.on("data", (buf) => {
      process.stdout.write(`${prefix} ${buf}`);
    });
  }
  if (child.stderr) {
    child.stderr.on("data", (buf) => {
      process.stderr.write(`${prefix} ${buf}`);
    });
  }
  child.on("exit", (code, signal) => {
    console.log(`[desktop] Sidecar exited code=${code} signal=${signal}`);
    if (!isQuitting && mainWindow) {
      dialog.showErrorBox(
        "Data Slicer backend stopped",
        `The local backend exited unexpectedly (code=${code}, signal=${signal}).\nThe window will close.`
      );
      app.quit();
    }
  });
}

function stopBackend() {
  if (!backendProcess || backendProcess.killed) return;
  const child = backendProcess;
  backendProcess = null;
  try {
    if (process.platform === "win32") {
      spawn("taskkill", ["/pid", String(child.pid), "/f", "/t"], { stdio: "ignore" });
    } else {
      child.kill("SIGTERM");
      setTimeout(() => {
        if (!child.killed) child.kill("SIGKILL");
      }, 3000).unref();
    }
  } catch (err) {
    console.error("[desktop] Failed to stop sidecar:", err);
  }
}

function createWindow(port) {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 640,
    title: "Data Slicer",
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });

  const url = `http://127.0.0.1:${port}/`;
  mainWindow.loadURL(url);

  // The SPA registers beforeunload when a data source is connected (browser
  // "Leave site?" guard). In Electron that can swallow the red traffic-light
  // close; allow unload so X / Cmd+W actually exits.
  mainWindow.webContents.on("will-prevent-unload", (event) => {
    event.preventDefault();
  });

  mainWindow.on("close", () => {
    // Treat this as a single-window utility app: closing the window quits.
    if (!isQuitting) {
      app.quit();
    }
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

function createAppMenu() {
  /** @type {Electron.MenuItemConstructorOptions[]} */
  const template = [
    ...(process.platform === "darwin"
      ? [
          {
            label: app.name,
            submenu: [
              { role: "about" },
              { type: "separator" },
              {
                label: "Check for Updates…",
                click: () => {
                  checkForUpdates({ userInitiated: true }).catch((err) =>
                    console.error(err)
                  );
                },
              },
              { type: "separator" },
              { role: "services" },
              { type: "separator" },
              { role: "hide" },
              { role: "hideOthers" },
              { role: "unhide" },
              { type: "separator" },
              { role: "quit" },
            ],
          },
        ]
      : []),
    { role: "fileMenu" },
    { role: "editMenu" },
    { role: "viewMenu" },
    { role: "windowMenu" },
    {
      role: "help",
      submenu: [
        ...(process.platform === "darwin"
          ? []
          : [
              {
                label: "Check for Updates…",
                click: () => {
                  checkForUpdates({ userInitiated: true }).catch((err) =>
                    console.error(err)
                  );
                },
              },
            ]),
        {
          label: "Data directory",
          click: () => {
            dialog.showMessageBox({
              type: "info",
              message: "Data directory",
              detail: dataDir(),
            });
          },
        },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

async function startApp() {
  fs.mkdirSync(dataDir(), { recursive: true });
  createAppMenu();
  setupAutoUpdater();

  backendPort = await findFreePort();
  backendProcess = spawnBackend(backendPort);
  attachBackendLogs(backendProcess);

  try {
    await waitForHealth(backendPort, STARTUP_TIMEOUT_MS);
  } catch (err) {
    console.error("[desktop] Backend startup failed:", err);
    stopBackend();
    dialog.showErrorBox(
      "Data Slicer failed to start",
      `${err.message}\n\nCheck logs under:\n${path.join(dataDir(), "logs")}`
    );
    app.quit();
    return;
  }

  createWindow(backendPort);
  scheduleStartupUpdateCheck();
}

app.whenReady().then(() => {
  if (!gotLock) return;
  startApp().catch((err) => {
    console.error(err);
    dialog.showErrorBox("Data Slicer failed to start", String(err));
    app.quit();
  });
});

app.on("before-quit", () => {
  isQuitting = true;
  stopBackend();
});

app.on("window-all-closed", () => {
  app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0 && backendPort) {
    createWindow(backendPort);
  }
});
