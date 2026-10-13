/**
 * Director - human-paced UI actions for recording documentation snippets.
 *
 * Playwright acts instantly; a viewer needs to see the pointer travel, the click
 * land and the result settle. Every action here moves the (overlay) cursor along
 * an eased path first and pauses afterwards. Snippets should use these helpers
 * rather than raw locator.click() so the video stays readable.
 */

const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
// Wide enough for a field name next to the icons of a filter card or the Color shelf.
const MIDDLE_PANEL_PX = 280;

const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

class Director {
  constructor(page, { pace = 1 } = {}) {
    this.page = page;
    this.pace = pace;
    const viewport = page.viewportSize() || { width: 1280, height: 800 };
    this.pos = { x: viewport.width / 2, y: viewport.height / 2 };
    this.app = new AppSteps(this);
  }

  async pause(ms = 600) {
    await this.page.waitForTimeout(ms * this.pace);
  }

  async _center(target) {
    const locator = typeof target === 'string' ? this.page.locator(target) : target;
    await locator.scrollIntoViewIfNeeded();
    const box = await locator.boundingBox();
    if (!box) throw new Error(`Element has no bounding box: ${locator}`);
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  }

  /** Glide the pointer to a point; ~60 events/s so the video shows real motion. */
  async moveToPoint(x, y, { duration } = {}) {
    const from = this.pos;
    const distance = Math.hypot(x - from.x, y - from.y);
    const ms = (duration ?? Math.min(900, 250 + distance * 0.8)) * this.pace;
    const steps = Math.max(1, Math.round(ms / 16));
    for (let i = 1; i <= steps; i++) {
      const t = easeInOut(i / steps);
      await this.page.mouse.move(from.x + (x - from.x) * t, from.y + (y - from.y) * t);
      await this.page.waitForTimeout(16);
    }
    this.pos = { x, y };
  }

  async moveTo(target, options) {
    const { x, y } = await this._center(target);
    await this.moveToPoint(x, y, options);
  }

  async click(target, { pauseAfter = 700 } = {}) {
    await this.moveTo(target);
    await this.pause(200);
    await this.page.mouse.down();
    await this.page.waitForTimeout(90);
    await this.page.mouse.up();
    await this.pause(pauseAfter);
  }

  async rightClick(target, { pauseAfter = 700 } = {}) {
    await this.moveTo(target);
    await this.pause(200);
    await this.page.mouse.click(this.pos.x, this.pos.y, { button: 'right' });
    await this.pause(pauseAfter);
  }

  /**
   * HTML5 drag: press on the source, travel to the target, release.
   * `targetPosition` ({x, y} from the target's top-left) picks the drop point, e.g. the
   * start of a shelf so the field is inserted before the chips already on it.
   */
  async drag(source, target, { pauseAfter = 900, targetPosition } = {}) {
    await this.moveTo(source);
    await this.pause(250);
    await this.page.mouse.down();
    // A small nudge so Chromium starts the drag before the long move.
    await this.moveToPoint(this.pos.x + 8, this.pos.y + 4, { duration: 80 });
    if (targetPosition) {
      const locator = typeof target === 'string' ? this.page.locator(target) : target;
      const box = await locator.boundingBox();
      if (!box) throw new Error(`Drop target has no bounding box: ${locator}`);
      await this.moveToPoint(box.x + targetPosition.x, box.y + targetPosition.y, { duration: 900 });
    } else {
      await this.moveTo(target, { duration: 900 });
    }
    await this.pause(200);
    await this.page.mouse.up();
    await this.pause(pauseAfter);
  }

  /**
   * Drag an MUI slider thumb (the role="slider" input) to `value`, then nudge with the
   * arrow keys if the pointer landed a step off.
   */
  async setSlider(thumbInput, value, { pauseAfter = 600 } = {}) {
    const read = async (name) => Number(await thumbInput.getAttribute(name));
    const [min, max] = [await read('aria-valuemin'), await read('aria-valuemax')];
    const thumb = thumbInput.locator('xpath=..');
    const rail = await thumbInput.locator('xpath=ancestor::*[contains(@class, "MuiSlider-root")][1]').boundingBox();
    if (!rail) throw new Error('Slider has no bounding box');
    await this.moveTo(thumb);
    await this.pause(200);
    await this.page.mouse.down();
    const x = rail.x + ((value - min) / (max - min)) * rail.width;
    await this.moveToPoint(x, this.pos.y, { duration: 600 });
    await this.page.mouse.up();
    for (let i = 0; i < 10; i++) {
      const now = await read('aria-valuenow');
      if (now === value) break;
      await thumbInput.press(now < value ? 'ArrowRight' : 'ArrowLeft');
    }
    await this.pause(pauseAfter);
  }

  async type(target, text, { delay = 70, pauseAfter = 500 } = {}) {
    await this.click(target, { pauseAfter: 200 });
    await this.page.keyboard.type(text, { delay: delay * this.pace });
    await this.pause(pauseAfter);
  }

  async press(key, { pauseAfter = 500 } = {}) {
    await this.page.keyboard.press(key);
    await this.pause(pauseAfter);
  }

  /** Click a native file input's button and answer the chooser (the OS dialog never shows). */
  async chooseFiles(input, fileNames, { pauseAfter = 600 } = {}) {
    const locator = typeof input === 'string' ? this.page.locator(input) : input;
    const box = await locator.boundingBox();
    if (!box) throw new Error(`File input has no bounding box: ${locator}`);
    // The native "Choose Files" button sits at the input's left edge.
    await this.moveToPoint(box.x + Math.min(50, box.width / 2), box.y + box.height / 2);
    await this.pause(200);
    const [chooser] = await Promise.all([
      this.page.waitForEvent('filechooser'),
      (async () => {
        await this.page.mouse.down();
        await this.page.waitForTimeout(90);
        await this.page.mouse.up();
      })(),
    ]);
    await this.pause(300);
    await chooser.setFiles([].concat(fileNames).map((name) => path.resolve(DATA_DIR, name)));
    await this.pause(pauseAfter);
  }

  /** Caption bar at the bottom of the frame for `ms`; returns at once so actions run beneath it. */
  async caption(text, { ms = 2500 } = {}) {
    const html =
      '<div style="position:fixed;left:50%;bottom:28px;transform:translateX(-50%);' +
      'background:rgba(20,20,30,0.85);color:#fff;font:500 18px/1.3 system-ui,sans-serif;' +
      `padding:10px 18px;border-radius:8px;max-width:80%;text-align:center">${text}</div>`;
    // showOverlay's own `duration` blocks until it expires, so remove it on a timer instead.
    const overlay = await this.page.screencast.showOverlay(html);
    setTimeout(() => overlay.dispose().catch(() => {}), ms * this.pace);
  }
}

/**
 * App-specific locators and multi-step flows. Keep selectors here so a UI change
 * is fixed in one place rather than in every snippet.
 */
class AppSteps {
  constructor(director) {
    this.d = director;
    this.page = director.page;
  }

  // ---- locators -------------------------------------------------------------

  fileInput() {
    return this.page.locator('input[type=file][multiple]');
  }

  connectButton() {
    return this.page.getByRole('button', { name: 'Connect', exact: true });
  }

  /** A field chip in the Fields panel, e.g. field('Role') or field('Requests (sum)'). */
  field(label) {
    return this.page
      .locator('.field-chip')
      .filter({ hasText: new RegExp(`^#?\\s*${escapeRegExp(label)}$`) })
      .first();
  }

  /** The X / Y axis shelves at the top of the chart panel. */
  shelf(axis) {
    return this.page.locator('[class^="DropZone_dropZone"]').nth(axis === 'x' ? 0 : 1);
  }

  /** A chip already on an axis shelf; its label carries suffixes like "[discrete]". */
  shelfField(axis, label) {
    return this.shelf(axis)
      .locator('.field-chip')
      .filter({ hasText: new RegExp(`^#?\\s*${escapeRegExp(label)}(\\s|$)`) })
      .first();
  }

  /** An entry of the open field context menu, e.g. 'Continuous' or 'Dimension'. */
  menuItem(label) {
    return this.page
      .locator('[class*="menuItem"]')
      .filter({ hasText: new RegExp(`^\\s*${escapeRegExp(label)}\\s*✔?\\s*$`) })
      .first();
  }

  filtersShelf() {
    return this.page.locator('[class^="FilterDropZone_dropZone"]').first();
  }

  /** Expand button of the n-th filter card in the Filters panel. */
  filterExpandButton(index = 0) {
    return this.page.locator('[class*="FilterFieldChip_expandButton"]').nth(index);
  }

  /** A value checkbox inside an expanded discrete filter. */
  filterValue(label) {
    return this.page
      .locator('label[class*="checkboxItem"]')
      .filter({ hasText: new RegExp(`^${escapeRegExp(label)}$`) })
      .first();
  }

  applyFiltersButton() {
    return this.page.getByRole('button', { name: 'Apply' });
  }

  /** Section headers of the middle panel: 'Filters', 'Field Overrides', 'Measure Group'. */
  sectionHeader(title) {
    return this.page.getByText(title, { exact: true }).first();
  }

  /** Color shelf of the "ALL" card in Field Overrides (first property shelf). */
  colorShelf() {
    return this.page.locator('[class^="PropertyDropZone_dropZone"]').first();
  }

  /** The Size icon button of the "ALL" card; opens the size slider popover. */
  sizeButton() {
    return this.page.getByRole('button', { name: 'Size', exact: true }).first();
  }

  /** Size shelf of the "ALL" card: the drop zone next to the Size button. */
  sizeShelf() {
    return this.sizeButton().locator('xpath=..').locator('[class^="PropertyDropZone_dropZone"]');
  }

  /**
   * Thumb(s) of the open size popover: one ("Thickness", a fixed dot size) without a
   * field on Size, two (range low/high) with one.
   */
  sizeSliderThumb(index = 0) {
    return this.page.locator('.MuiPopover-root').getByRole('slider').nth(index);
  }

  // ---- flows ----------------------------------------------------------------

  /** Move the pointer off controls (no hover tooltips) into the empty foot of the middle panel. */
  async restCursor() {
    const viewport = this.page.viewportSize();
    await this.d.moveToPoint(330, viewport.height - 70);
  }

  /** Instant drag for setup steps that are not part of the recording. */
  async place(fieldLabel, target) {
    await this.field(fieldLabel).dragTo(target);
  }

  /** Instant field-menu change in the Fields panel, e.g. turn 'CPU (%) (sum)' into a dimension. */
  async setFieldType(fieldLabel, menuLabel = 'Dimension') {
    await this.field(fieldLabel).click({ button: 'right' });
    await this.menuItem(menuLabel).click();
  }

  /**
   * Close an MUI popover. Escape hands focus back to the opening button, whose tooltip
   * would then stay on screen, so focus is dropped as well.
   */
  async closePopover() {
    await this.page.keyboard.press('Escape');
    await this.page.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur());
    await this.d.pause(300);
  }

  /** Instant dot-size change through the Size popover (no field on Size). */
  async setDotSize(size) {
    await this.sizeButton().click();
    const thumb = this.sizeSliderThumb();
    await thumb.focus();
    for (let i = 0; i < 60 && Number(await thumb.getAttribute('aria-valuenow')) !== size; i++) {
      await thumb.press(Number(await thumb.getAttribute('aria-valuenow')) < size ? 'ArrowRight' : 'ArrowLeft');
    }
    await this.closePopover();
  }

  /** Raw-row scatter: Requests vs CPU (%) as continuous dimensions (setup for scatter snippets). */
  async buildScatter() {
    await this.setFieldType('Requests (sum)');
    await this.setFieldType('CPU (%) (sum)');
    await this.place('Requests', this.shelf('x'));
    await this.place('CPU (%)', this.shelf('y'));
    await this.waitForChart();
  }

  /** Connect the bundled demo file and open the visualization page (fast, for setup). */
  async connectFile(fileName = 'servers.csv') {
    await this.page.goto('/');
    await this.fileInput().setInputFiles(path.resolve(DATA_DIR, fileName));
    await this.connectButton().click();
    await this.page.getByRole('link', { name: 'Go to Visualization' }).click();
    await this.waitForFields();
    await this.setMiddlePanelWidth();
  }

  /**
   * Drag the Properties divider so the middle panel is `width` px wide. The default
   * (15% ≈ 180px at the recording viewport) truncates chips in filter cards and the
   * Color shelf down to their icon.
   */
  async setMiddlePanelWidth(width = MIDDLE_PANEL_PX) {
    const fieldsHandle = await this.page.getByRole('separator', { name: 'Resize Fields panel' }).boundingBox();
    const handle = await this.page.getByRole('separator', { name: 'Resize Properties panel' }).boundingBox();
    if (!fieldsHandle || !handle) throw new Error('Panel dividers not found');
    const current = handle.x - (fieldsHandle.x + fieldsHandle.width);
    // Grab above the centre: the handle's collapse button sits in the middle.
    const x = handle.x + handle.width / 2;
    const y = handle.y + handle.height * 0.25;
    await this.page.mouse.move(x, y);
    await this.page.mouse.down();
    await this.page.mouse.move(x + (width - current), y, { steps: 10 });
    await this.page.mouse.up();
  }

  /** Wait until the Fields panel lists the connected table's columns. */
  async waitForFields() {
    await this.page.locator('.field-chip').first().waitFor();
  }

  /** Wait until an Observable Plot chart is on screen. */
  async waitForChart() {
    await this.page.locator('svg[class^="plot"]').first().waitFor({ timeout: 15000 });
  }
}

module.exports = { Director, DATA_DIR };
