#!/usr/bin/env node
/**
 * Record user-manual snippets: short videos of UI actions, driven by Playwright.
 *
 *   node scripts/doc-snippets/record.js                 # record all snippets
 *   node scripts/doc-snippets/record.js first-bar-chart # record selected snippets
 *   node scripts/doc-snippets/record.js --headed        # watch it happen
 *
 * Each snippet in ./snippets writes docs/assets/snippets/<name>.webm plus a
 * <name>.png poster (the final frame). By default a private backend is started on
 * DOC_SNIPPETS_PORT (8011) serving frontend/build with an empty snapshot store,
 * so recordings never touch real data. Set DOC_SNIPPETS_URL to record against an
 * already running app instead.
 */

const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { chromium } = require('playwright');
const { Director } = require('./director');
const { installOverlay } = require('./overlay');

const FRONTEND_DIR = path.resolve(__dirname, '..', '..');
const ROOT_DIR = path.resolve(FRONTEND_DIR, '..');
const SNIPPETS_DIR = path.join(__dirname, 'snippets');
const OUT_DIR = path.join(ROOT_DIR, 'docs', 'assets', 'snippets');

// Wide enough for the three-panel layout, small enough to stay legible when the
// video is scaled down to the manual's content column.
const VIEWPORT = { width: 1200, height: 750 };

function parseArgs(argv) {
  const args = { headed: false, names: [] };
  for (const arg of argv) {
    if (arg === '--headed') args.headed = true;
    else if (arg.startsWith('--')) throw new Error(`Unknown option: ${arg}`);
    else args.names.push(arg.replace(/\.js$/, ''));
  }
  return args;
}

function loadSnippets(names) {
  const available = fs.readdirSync(SNIPPETS_DIR)
    .filter((file) => file.endsWith('.js'))
    .map((file) => file.replace(/\.js$/, ''))
    .sort();
  const unknown = names.filter((name) => !available.includes(name));
  if (unknown.length) {
    throw new Error(`Unknown snippet(s): ${unknown.join(', ')}. Available: ${available.join(', ')}`);
  }
  return (names.length ? names : available).map((name) => ({
    name,
    ...require(path.join(SNIPPETS_DIR, `${name}.js`)),
  }));
}

function findPython() {
  const candidates = [
    path.join(ROOT_DIR, '.venv', 'bin', 'python'),
    path.join(ROOT_DIR, 'backend', '.venv', 'bin', 'python'),
    path.join(ROOT_DIR, '..', 'venv', 'bin', 'python'),
  ];
  return candidates.find((candidate) => fs.existsSync(candidate)) || 'python3';
}

async function waitForServer(url, child, timeoutMs = 60000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Backend exited early (code ${child.exitCode})`);
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // not listening yet
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Backend did not answer at ${url} within ${timeoutMs / 1000}s`);
}

async function startBackend() {
  const buildDir = path.join(FRONTEND_DIR, 'build');
  if (!fs.existsSync(path.join(buildDir, 'index.html'))) {
    throw new Error('frontend/build is missing - run `npm run build` first (or use `make doc-snippets`).');
  }
  const port = process.env.DOC_SNIPPETS_PORT || '8011';
  const snapshotDir = fs.mkdtempSync(path.join(os.tmpdir(), 'doc-snippets-'));
  const log = fs.openSync(path.join(snapshotDir, 'backend.log'), 'w');
  const child = spawn(
    findPython(),
    ['-m', 'uvicorn', 'backend.main:app', '--app-dir', ROOT_DIR, '--port', port,
      '--h11-max-incomplete-event-size', '131072'],
    {
      cwd: ROOT_DIR,
      env: { ...process.env, FRONTEND_STATIC_DIR: buildDir, SNAPSHOT_STORAGE_DIR: snapshotDir },
      stdio: ['ignore', log, log],
    },
  );
  const url = `http://localhost:${port}`;
  try {
    await waitForServer(url, child);
  } catch (err) {
    child.kill();
    throw new Error(`${err.message}\nBackend log: ${path.join(snapshotDir, 'backend.log')}`);
  }
  return {
    url,
    stop: () => {
      child.kill();
      fs.rmSync(snapshotDir, { recursive: true, force: true });
    },
  };
}

async function recordSnippet(browser, baseURL, snippet) {
  const context = await browser.newContext({
    baseURL,
    viewport: VIEWPORT,
    deviceScaleFactor: 1,
    colorScheme: 'light',
    reducedMotion: 'no-preference',
  });
  await context.addInitScript(installOverlay);
  const page = await context.newPage();
  const director = new Director(page);
  const video = path.join(OUT_DIR, `${snippet.name}.webm`);
  const poster = path.join(OUT_DIR, `${snippet.name}.png`);
  try {
    if (snippet.setup) await snippet.setup(director);
    // Park the pointer where the recording starts so the first frame has a cursor.
    await page.mouse.move(director.pos.x, director.pos.y);
    await page.screencast.start({ path: video, size: VIEWPORT, quality: 95 });
    await director.pause(400);
    await snippet.record(director);
    await director.pause(1200);
    await page.screenshot({ path: poster });
    await page.screencast.stop();
  } finally {
    await context.close();
  }
  return [video, poster];
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const snippets = loadSnippets(args.names);
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const server = process.env.DOC_SNIPPETS_URL
    ? { url: process.env.DOC_SNIPPETS_URL.replace(/\/$/, ''), stop: () => {} }
    : await startBackend();
  const browser = await chromium.launch({ headless: !args.headed });
  let failed = 0;
  try {
    for (const snippet of snippets) {
      const started = Date.now();
      try {
        const files = await recordSnippet(browser, server.url, snippet);
        const seconds = ((Date.now() - started) / 1000).toFixed(1);
        console.log(`✔ ${snippet.name} (${seconds}s) → ${files.map((f) => path.relative(ROOT_DIR, f)).join(', ')}`);
      } catch (err) {
        failed++;
        console.error(`✘ ${snippet.name}: ${err.message}`);
      }
    }
  } finally {
    await browser.close();
    server.stop();
  }
  process.exitCode = failed ? 1 : 0;
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
