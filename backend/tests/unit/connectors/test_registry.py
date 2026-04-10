"""Unit tests for connector registry plugin metadata."""

from types import SimpleNamespace

from backend.connectors.registry import get_connector_registry


class TestConnectorRegistrySpecs:
    def test_csv_spec_declares_plugin_hooks(self):
        spec = get_connector_registry().get_spec("csv")
        assert spec.capabilities.supports_multipart_connect is True
        assert spec.capabilities.supports_incremental_file_add is True
        assert spec.build_multipart_connect_args is not None

    def test_kaggle_spec_builds_session_scoped_download_dir(self, tmp_path):
        spec = get_connector_registry().get_spec("kaggle")
        cfg = spec.config_model(
            kaggle_username="user",
            kaggle_api_key="secret",
            kaggle_dataset="owner/dataset",
        )
        request = SimpleNamespace(app=SimpleNamespace(state=SimpleNamespace(upload_root_dir=str(tmp_path))))
        connect_args = spec.build_connect_args(cfg, None, request, "session-1")
        assert connect_args["download_dir"] == str(tmp_path / "session-1")
