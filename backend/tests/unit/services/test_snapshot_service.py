"""Unit tests for SnapshotService."""

import json
import os

import pytest

from backend.exceptions import InvalidInputError, ResourceNotFoundError
from backend.services.snapshot_service import SnapshotService, validate_folder


class TestValidateFolder:
    """Tests for the validate_folder helper."""

    def test_empty_string_returns_empty(self):
        assert validate_folder("") == ""

    def test_none_like_whitespace_returns_empty(self):
        assert validate_folder("   ") == ""

    def test_strips_leading_trailing_slashes(self):
        assert validate_folder("/Sales/Reports/") == "Sales/Reports"

    def test_strips_segment_whitespace(self):
        assert validate_folder("  Sales /  Reports  ") == "Sales/Reports"

    def test_rejects_dotdot_segment(self):
        with pytest.raises(InvalidInputError):
            validate_folder("Sales/../etc")

    def test_rejects_single_dot_segment(self):
        with pytest.raises(InvalidInputError):
            validate_folder("Sales/./Reports")

    def test_rejects_empty_segment(self):
        with pytest.raises(InvalidInputError):
            validate_folder("Sales//Reports")

    def test_rejects_exceeding_depth(self):
        deep = "/".join(f"d{i}" for i in range(6))
        with pytest.raises(InvalidInputError, match="maximum depth"):
            validate_folder(deep)

    def test_max_depth_is_allowed(self):
        at_limit = "/".join(f"d{i}" for i in range(5))
        assert validate_folder(at_limit) == at_limit

    def test_rejects_long_segment(self):
        with pytest.raises(InvalidInputError, match="exceeds"):
            validate_folder("a" * 65)

    def test_rejects_backslash_in_segment(self):
        with pytest.raises(InvalidInputError):
            validate_folder("Sales\\Reports")

    def test_simple_single_folder(self):
        assert validate_folder("Marketing") == "Marketing"

    def test_nested_folder(self):
        assert validate_folder("Marketing/Q1/Weekly") == "Marketing/Q1/Weekly"


@pytest.fixture
def snapshot_dir(tmp_path):
    """Provide a temporary snapshot storage directory."""
    return str(tmp_path / "snapshots")


@pytest.fixture
def service(snapshot_dir):
    return SnapshotService(storage_dir=snapshot_dir)


class TestSnapshotServiceCRUD:
    """Basic CRUD operations."""

    def test_save_and_list(self, service):
        meta = service.save_snapshot("My Config", {"sheets": []})
        assert meta.name == "My Config"
        assert meta.folder == ""
        assert meta.id

        items = service.list_snapshots()
        assert len(items) == 1
        assert items[0].id == meta.id
        assert items[0].name == "My Config"
        assert items[0].folder == ""

    def test_save_strips_whitespace_name(self, service):
        meta = service.save_snapshot("  Padded  ", {"sheets": []})
        assert meta.name == "Padded"

    def test_save_empty_name_defaults_to_untitled(self, service):
        meta = service.save_snapshot("   ", {"sheets": []})
        assert meta.name == "Untitled"

    def test_get_snapshot(self, service):
        meta = service.save_snapshot("Test", {"key": "value"})
        data = service.get_snapshot(meta.id)
        assert data["configuration"]["key"] == "value"
        assert data["folder"] == ""

    def test_delete_snapshot(self, service):
        meta = service.save_snapshot("To Delete", {"sheets": []})
        service.delete_snapshot(meta.id)
        assert len(service.list_snapshots()) == 0

    def test_delete_nonexistent_raises(self, service):
        service.ensure_storage_dir()
        with pytest.raises(ResourceNotFoundError):
            service.delete_snapshot("nonexistent-id")

    def test_rename_snapshot(self, service):
        meta = service.save_snapshot("Old Name", {"sheets": []})
        updated = service.rename_snapshot(meta.id, "New Name")
        assert updated.name == "New Name"
        assert updated.folder == ""

    def test_overwrite_preserves_created_at(self, service):
        meta = service.save_snapshot("V1", {"v": 1})
        created = meta.created_at
        updated = service.save_snapshot("V2", {"v": 2}, snapshot_id=meta.id)
        assert updated.created_at == created
        assert updated.name == "V2"

    def test_list_sorted_by_updated_at_desc(self, service):
        m1 = service.save_snapshot("First", {"sheets": []})
        m2 = service.save_snapshot("Second", {"sheets": []})
        items = service.list_snapshots()
        assert items[0].id == m2.id
        assert items[1].id == m1.id


class TestSnapshotServiceFolders:
    """Folder-related operations."""

    def test_save_with_folder(self, service):
        meta = service.save_snapshot("Report", {"sheets": []}, folder="Sales/Q1")
        assert meta.folder == "Sales/Q1"

        items = service.list_snapshots()
        assert items[0].folder == "Sales/Q1"

    def test_save_with_folder_validates(self, service):
        with pytest.raises(InvalidInputError):
            service.save_snapshot("Bad", {"sheets": []}, folder="Sales/../etc")

    def test_overwrite_preserves_folder_when_not_specified(self, service):
        meta = service.save_snapshot("V1", {"v": 1}, folder="Marketing")
        updated = service.save_snapshot("V2", {"v": 2}, snapshot_id=meta.id)
        assert updated.folder == "Marketing"

    def test_overwrite_can_change_folder(self, service):
        meta = service.save_snapshot("V1", {"v": 1}, folder="Marketing")
        updated = service.save_snapshot(
            "V2", {"v": 2}, snapshot_id=meta.id, folder="Sales"
        )
        assert updated.folder == "Sales"

    def test_move_snapshot(self, service):
        meta = service.save_snapshot("Item", {"sheets": []}, folder="A")
        moved = service.move_snapshot(meta.id, "B/Sub")
        assert moved.folder == "B/Sub"
        assert moved.id == meta.id

        data = service.get_snapshot(meta.id)
        assert data["folder"] == "B/Sub"

    def test_move_to_root(self, service):
        meta = service.save_snapshot("Item", {"sheets": []}, folder="Deep/Path")
        moved = service.move_snapshot(meta.id, "")
        assert moved.folder == ""

    def test_move_validates_folder(self, service):
        meta = service.save_snapshot("Item", {"sheets": []})
        with pytest.raises(InvalidInputError):
            service.move_snapshot(meta.id, "a" * 65)

    def test_rename_folder_basic(self, service):
        service.save_snapshot("A", {"sheets": []}, folder="OldName")
        service.save_snapshot("B", {"sheets": []}, folder="OldName")
        service.save_snapshot("C", {"sheets": []}, folder="Other")

        count = service.rename_folder("OldName", "NewName")
        assert count == 2

        items = service.list_snapshots()
        folders = {s.name: s.folder for s in items}
        assert folders["A"] == "NewName"
        assert folders["B"] == "NewName"
        assert folders["C"] == "Other"

    def test_rename_folder_nested(self, service):
        service.save_snapshot("Parent", {"sheets": []}, folder="X")
        service.save_snapshot("Child", {"sheets": []}, folder="X/Sub")
        service.save_snapshot("Deep", {"sheets": []}, folder="X/Sub/Deep")

        count = service.rename_folder("X", "Y")
        assert count == 3

        items = service.list_snapshots()
        folders = {s.name: s.folder for s in items}
        assert folders["Parent"] == "Y"
        assert folders["Child"] == "Y/Sub"
        assert folders["Deep"] == "Y/Sub/Deep"

    def test_rename_folder_same_path_returns_zero(self, service):
        service.save_snapshot("A", {"sheets": []}, folder="Same")
        assert service.rename_folder("Same", "Same") == 0

    def test_rename_folder_rejects_empty_old(self, service):
        with pytest.raises(InvalidInputError, match="root"):
            service.rename_folder("", "Something")

    def test_rename_folder_rejects_empty_new(self, service):
        with pytest.raises(InvalidInputError, match="empty"):
            service.rename_folder("Something", "")

    def test_get_snapshot_includes_folder(self, service):
        meta = service.save_snapshot("F", {"k": "v"}, folder="Dir")
        data = service.get_snapshot(meta.id)
        assert data["folder"] == "Dir"

    def test_rename_preserves_folder(self, service):
        meta = service.save_snapshot("Old", {"sheets": []}, folder="MyFolder")
        renamed = service.rename_snapshot(meta.id, "New")
        assert renamed.folder == "MyFolder"
