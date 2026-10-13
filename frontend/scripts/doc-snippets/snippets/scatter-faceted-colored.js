// Building Charts → Faceting: colour the faceted scatter plot by another discrete field;
// each server role forms its own cluster in both datacenters. Shrinking the dots to 2
// separates the clusters and sets up the size-by-measure snippet.

module.exports = {
  async setup(d) {
    await d.app.connectFile();
    await d.app.buildScatter();
    await d.app.place('Datacenter', d.app.shelf('x'));
    await d.app.waitForChart();
  },

  async record(d) {
    await d.click(d.app.sectionHeader('Field Overrides'));
    await d.drag(d.app.field('Role'), d.app.colorShelf());
    await d.app.waitForChart();
    await d.click(d.app.sizeButton());
    await d.setSlider(d.app.sizeSliderThumb(), 2);
    await d.app.closePopover();
    await d.app.restCursor();
    await d.app.waitForChart();
  },
};
