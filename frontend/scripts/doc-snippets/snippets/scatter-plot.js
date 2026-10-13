// Building Charts → Chart Types, Scatter Plot: numeric fields turned into dimensions are
// continuous and unaggregated, so with one on each axis every row becomes a point.

module.exports = {
  async setup(d) {
    await d.app.connectFile();
  },

  async record(d) {
    await d.rightClick(d.app.field('Requests (sum)'));
    await d.click(d.app.menuItem('Dimension'), { pauseAfter: 500 });
    await d.rightClick(d.app.field('CPU (%) (sum)'));
    await d.click(d.app.menuItem('Dimension'), { pauseAfter: 500 });
    await d.drag(d.app.field('Requests'), d.app.shelf('x'));
    await d.drag(d.app.field('CPU (%)'), d.app.shelf('y'));
    await d.app.restCursor();
    await d.app.waitForChart();
  },
};
