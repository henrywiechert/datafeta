// Building Charts → Faceting: a discrete field on X splits the scatter plot into panels.
// Datacenter (2 panels) rather than Role (5): the colour legend added in
// scatter-faceted-colored would otherwise push facets out of view.

module.exports = {
  async setup(d) {
    await d.app.connectFile();
    await d.app.buildScatter();
  },

  async record(d) {
    await d.drag(d.app.field('Datacenter'), d.app.shelf('x'));
    await d.app.restCursor();
    await d.app.waitForChart();
  },
};
