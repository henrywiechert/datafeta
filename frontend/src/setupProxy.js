const { createProxyMiddleware } = require('http-proxy-middleware');

// Backend URL for the dev server. ./dev.sh exports DEV_BACKEND_URL from .env.dev;
// the fallback matches dev.sh's default backend port.
const BACKEND_URL = process.env.DEV_BACKEND_URL || 'http://localhost:8010';

/**
 * CRA dev-server proxy configuration.
 *
 * This replaces the "proxy" field of package.json, which cannot be driven by
 * an environment variable. That field only forwards requests whose Accept
 * header lacks text/html, and CRA applies it after the webpack middleware.
 * setupProxy runs before the webpack middleware, so a catch-all rule here
 * would swallow the bundle; list the backend's paths explicitly instead.
 *
 * /help is included so that full-page HTML navigations to /help/ reach the
 * MkDocs site mounted by FastAPI (when the site/ build directory exists)
 * instead of being served as the React SPA.
 */
const BACKEND_PATHS = ['/api', '/help', '/version', '/health', '/api-info'];

module.exports = function (app) {
  app.use(
    createProxyMiddleware(BACKEND_PATHS, {
      target: BACKEND_URL,
      changeOrigin: true,
    })
  );
};
