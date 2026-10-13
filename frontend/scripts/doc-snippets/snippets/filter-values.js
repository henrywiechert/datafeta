// Getting Started → Your First Chart, step 4: keep only some values of a dimension.
// A new discrete filter starts with every value selected; unticking removes a value.

module.exports = {
  async setup(d) {
    await d.app.connectFile();
    await d.app.place('Role', d.app.shelf('x'));
    await d.app.place('Requests (sum)', d.app.shelf('y'));
    await d.app.waitForChart();
  },

  async record(d) {
    await d.drag(d.app.field('Role'), d.app.filtersShelf());
    await d.click(d.app.filterExpandButton());
    await d.click(d.app.filterValue('cache'), { pauseAfter: 300 });
    await d.click(d.app.filterValue('batch'));
    await d.click(d.app.applyFiltersButton(), { pauseAfter: 300 });
    await d.app.restCursor();
    await d.app.waitForChart();
  },
};
