// Getting Started → Your First Chart, step 3: split the bars by a dimension's colour.
// Datacenter rather than Environment: staging is ~5% of traffic and would barely show.

module.exports = {
  async setup(d) {
    await d.app.connectFile();
    await d.app.place('Role', d.app.shelf('x'));
    await d.app.place('Requests (sum)', d.app.shelf('y'));
    await d.app.waitForChart();
  },

  async record(d) {
    await d.click(d.app.sectionHeader('Field Overrides'));
    await d.drag(d.app.field('Datacenter'), d.app.colorShelf());
    await d.app.waitForChart();
  },
};
