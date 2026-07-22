# Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
"""SPA frontend serving: client routes must fall back to index.html on hard reload."""

import tempfile
from pathlib import Path

from fastapi import FastAPI
from fastapi.testclient import TestClient


def _spa_app(tmp: Path) -> FastAPI:
    (tmp / "index.html").write_text("<!doctype html><html><body>spa-shell</body></html>")
    (tmp / "asset.js").write_text("console.log(1)")
    app = FastAPI()

    @app.get("/api/v1/health", include_in_schema=False)
    def api_health():
        return {"status": "ok"}

    # Match production: frontend registered first, then light health route.
    app.frontend("/", directory=str(tmp), fallback="index.html")

    @app.get("/health", include_in_schema=False)
    def health():
        return {"status": "ok"}

    return app


class TestSpaFrontendFallback:
    def test_client_route_serves_index_html(self):
        with tempfile.TemporaryDirectory() as tmp:
            client = TestClient(_spa_app(Path(tmp)))
            response = client.get("/visualize", headers={"Accept": "text/html"})
            assert response.status_code == 200
            assert "spa-shell" in response.text
            assert "text/html" in response.headers.get("content-type", "")

    def test_api_routes_still_win(self):
        with tempfile.TemporaryDirectory() as tmp:
            client = TestClient(_spa_app(Path(tmp)))
            response = client.get("/api/v1/health")
            assert response.status_code == 200
            assert response.json() == {"status": "ok"}

            health = client.get("/health")
            assert health.status_code == 200
            assert health.json() == {"status": "ok"}

    def test_missing_assets_still_404(self):
        with tempfile.TemporaryDirectory() as tmp:
            client = TestClient(_spa_app(Path(tmp)))
            response = client.get("/missing.js")
            assert response.status_code == 404

            asset = client.get("/asset.js")
            assert asset.status_code == 200
            assert asset.text == "console.log(1)"
