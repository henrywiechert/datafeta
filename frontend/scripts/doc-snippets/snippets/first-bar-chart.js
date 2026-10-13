// Getting Started → Your First Chart: a dimension on X, a measure on Y.

module.exports = {
  async setup(d) {
    await d.app.connectFile();
  },

  async record(d) {
    await d.drag(d.app.field('Role'), d.app.shelf('x'));
    await d.drag(d.app.field('Requests (sum)'), d.app.shelf('y'));
    await d.app.waitForChart();
  },
};
