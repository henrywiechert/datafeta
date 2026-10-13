// Building Charts → Chart Types, Scatter Plot: a measure on Size turns the scatter plot
// into a bubble chart. Errors stay small except web-05's Thursday burst, which balloons.
// Starts from small dots (size 2, as scatter-faceted-colored ends); the Size range then
// defaults to 4-20, so its low end is pulled back to 2 to keep ordinary points small.

module.exports = {
  async setup(d) {
    await d.app.connectFile();
    await d.app.buildScatter();
    await d.app.sectionHeader('Field Overrides').click();
    await d.app.place('Role', d.app.colorShelf());
    await d.app.setDotSize(2);
    await d.app.waitForChart();
  },

  async record(d) {
    await d.drag(d.app.field('Errors (sum)'), d.app.sizeShelf());
    await d.app.waitForChart();
    await d.click(d.app.sizeButton());
    await d.setSlider(d.app.sizeSliderThumb(0), 2);
    await d.app.closePopover();
    await d.app.restCursor();
    await d.app.waitForChart();
  },
};
