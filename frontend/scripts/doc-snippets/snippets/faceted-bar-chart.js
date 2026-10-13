// Building Charts → Faceting: a second discrete field in front of Role on X splits the
// bar chart into one panel per datacenter.

module.exports = {
  async setup(d) {
    await d.app.connectFile();
    await d.app.place('Role', d.app.shelf('x'));
    await d.app.place('Requests (sum)', d.app.shelf('y'));
    await d.app.waitForChart();
  },

  async record(d) {
    // Drop at the shelf's left edge so Datacenter lands before Role (outer facet).
    await d.drag(d.app.field('Datacenter'), d.app.shelf('x'), { targetPosition: { x: 6, y: 16 } });
    await d.app.waitForChart();
  },
};
