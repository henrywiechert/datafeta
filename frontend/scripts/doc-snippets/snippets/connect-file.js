// Getting Started → Connecting to Data: upload a CSV and open the workspace.

module.exports = {
  async setup(d) {
    await d.page.goto('/');
    await d.app.fileInput().waitFor();
  },

  async record(d) {
    await d.chooseFiles(d.app.fileInput(), 'servers.csv');
    await d.click(d.app.connectButton(), { pauseAfter: 400 });
    const goToVisualization = d.page.getByRole('link', { name: 'Go to Visualization' });
    await goToVisualization.waitFor();
    await d.pause(700);
    await d.click(goToVisualization);
    await d.app.waitForFields();
  },
};
