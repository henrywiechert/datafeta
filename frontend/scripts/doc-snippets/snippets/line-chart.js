// Building Charts → Chart Types, Line Chart: a datetime dimension on X starts out
// discrete (one bar per hour); switching it to Continuous turns the bars into a line.

module.exports = {
  async setup(d) {
    await d.app.connectFile();
  },

  async record(d) {
    await d.drag(d.app.field('Timestamp'), d.app.shelf('x'));
    await d.drag(d.app.field('Requests (sum)'), d.app.shelf('y'));
    await d.app.waitForChart();
    await d.pause(600);
    await d.rightClick(d.app.shelfField('x', 'Timestamp'));
    await d.click(d.app.menuItem('Continuous'), { pauseAfter: 300 });
    await d.app.restCursor();
    await d.app.waitForChart();
  },
};
