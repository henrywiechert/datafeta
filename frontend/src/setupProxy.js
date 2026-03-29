const { createProxyMiddleware } = require('http-proxy-middleware');

/**
 * CRA dev-server proxy configuration.
 *
 * The simple "proxy" field in package.json only forwards requests whose
 * Accept header does NOT include text/html.  That means navigating directly
 * to /help/ in the browser is served as the React SPA, which then hits the
 * catch-all React Router route and redirects the user to the start page.
 *
 * Declaring the path explicitly here ensures that ALL /help requests
 * (including full-page HTML navigations) are forwarded to the FastAPI
 * backend, where the MkDocs site is mounted at /help when the site/ build
 * directory exists.
 */
module.exports = function (app) {
  app.use(
    '/help',
    createProxyMiddleware({
      target: 'http://localhost:8000',
      changeOrigin: true,
    })
  );
};
