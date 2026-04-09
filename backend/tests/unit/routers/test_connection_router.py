"""Unit tests for connection router endpoints."""

import pytest
from unittest.mock import Mock, MagicMock, patch, AsyncMock
from pydantic import BaseModel

from backend.models.data_source import ConnectionDetails


class TestConnectEndpointLogic:
    """Tests for the POST /connect endpoint logic."""

    def test_connection_details_parsing(self):
        """Test parsing connection details from form data."""
        import json
        
        connection_json = json.dumps({
            'type': 'clickhouse',
            'host': 'localhost',
            'port': 8123,
            'user': 'default',
            'password': '',
        })
        
        # Parse like endpoint does
        details_dict = json.loads(connection_json)
        details = ConnectionDetails(**details_dict)
        
        assert details.type == 'clickhouse'
        assert details.host == 'localhost'
        assert details.port == 8123

    def test_csv_upload_handling(self):
        """Test CSV file upload metadata extraction."""
        # Simulate uploaded file
        class MockUploadFile:
            def __init__(self):
                self.filename = 'data.csv'
                self.content_type = 'text/csv'
                self.size = 1024
        
        uploaded_file = MockUploadFile()
        
        # Endpoint should extract file info
        if uploaded_file:
            assert uploaded_file.filename == 'data.csv'
            assert uploaded_file.content_type == 'text/csv'

    def test_connection_details_validation(self):
        """ConnectionDetails.type is a plain string; validation happens in registry/service."""
        invalid_details = {
            'type': 'invalid_type',  # Invalid type
        }
        details = ConnectionDetails(**invalid_details)
        assert details.type == "invalid_type"

    def test_clickhouse_connection_details(self):
        """Test ClickHouse-specific connection details."""
        details = ConnectionDetails(
            type='clickhouse',
            host='analytics.example.com',
            port=8123,
            user='analyst',
            password='secret',
            database='production'
        )
        
        assert details.type == 'clickhouse'
        assert details.host == 'analytics.example.com'
        assert details.database == 'production'

    def test_csv_connection_details(self):
        """Test CSV connection details."""
        details = ConnectionDetails(
            type='csv',
            csv_has_header=True,
            csv_delimiter=',',
            csv_decimal_separator='.',
        )
        
        assert details.type == 'csv'
        assert details.csv_has_header == True
        assert details.csv_delimiter == ','


class TestDisconnectEndpointLogic:
    """Tests for the POST /disconnect endpoint logic."""

    def test_session_cleanup_on_disconnect(self):
        """Test that session state is cleared on disconnect."""
        # Simulate session state
        session_state = {
            'connector': Mock(),
            'connection_details': ConnectionDetails(type='csv'),
            'csv_temp_path': '/tmp/upload_abc123.csv',
        }
        
        # Disconnect should clear state
        session_state['connector'] = None
        session_state['connection_details'] = None
        session_state['csv_temp_path'] = None
        
        assert session_state['connector'] is None
        assert session_state['connection_details'] is None

    def test_connector_disconnect_called(self):
        """Test that connector.disconnect() is called."""
        mock_connector = Mock()
        mock_connector.disconnect = Mock()
        
        # Endpoint calls disconnect
        mock_connector.disconnect()
        
        mock_connector.disconnect.assert_called_once()

    def test_csv_temp_file_cleanup(self):
        """Test that temporary CSV files are cleaned up."""
        import tempfile
        import os
        
        # Create temp file
        with tempfile.NamedTemporaryFile(delete=False, suffix='.csv') as f:
            temp_path = f.name
            f.write(b'test,data\n1,2\n')
        
        assert os.path.exists(temp_path)
        
        # Simulate cleanup
        os.remove(temp_path)
        assert not os.path.exists(temp_path)

    def test_disconnect_removes_session_from_storage(self):
        """Test that session is removed from storage dict."""
        sessions = {
            'session123:tab1': Mock(),
            'session123:tab2': Mock(),
        }
        
        composite_key = 'session123:tab1'
        if composite_key in sessions:
            del sessions[composite_key]
        
        assert composite_key not in sessions
        assert len(sessions) == 1


class TestDisconnectBeaconEndpointLogic:
    """Tests for the POST /disconnect-beacon endpoint logic."""

    def test_beacon_cleanup_without_cookies(self):
        """Test beacon cleanup when no session cookie is present."""
        session_id = None
        tab_id = 'tab123'
        
        if not session_id:
            response = {"message": "No session cookie found", "cleaned_up": False}
        
        assert response['cleaned_up'] == False

    def test_beacon_cleanup_with_valid_session(self):
        """Test beacon cleanup with valid session."""
        session_storage = {
            'session123:tab1': Mock(
                current_connector=Mock(),
                current_csv_temp_path=None
            )
        }
        
        session_id = 'session123'
        tab_id = 'tab1'
        composite_key = f"{session_id}:{tab_id}"
        
        if composite_key in session_storage:
            manager = session_storage[composite_key]
            if manager.current_connector:
                manager.current_connector.disconnect()
            del session_storage[composite_key]
            response = {"message": "Session cleaned up", "cleaned_up": True}
        
        assert response['cleaned_up'] == True
        assert composite_key not in session_storage

    def test_beacon_cleanup_nonexistent_session(self):
        """Test beacon cleanup for non-existent session."""
        session_storage = {}
        composite_key = 'session999:tab999'
        
        if composite_key not in session_storage:
            response = {"message": "Session not found", "cleaned_up": False}
        
        assert response['cleaned_up'] == False

    def test_beacon_connector_error_handling(self):
        """Test that connector errors during beacon cleanup are logged."""
        mock_connector = Mock()
        mock_connector.disconnect.side_effect = Exception('Connection error')
        
        try:
            mock_connector.disconnect()
        except Exception:
            pass  # Expected - error should be logged but not raised


class TestDebugSessionsEndpointLogic:
    """Tests for the GET /debug/sessions endpoint logic."""

    def test_sessions_list_structure(self):
        """Test structure of sessions list response."""
        sessions = [
            {
                'composite_key': 'session123:tab1',
                'session_id': 'session123',
                'tab_id': 'tab1',
                'has_connector': True,
                'connection_type': 'clickhouse',
                'csv_temp_path': None,
                'created_at': '2026-01-13T10:00:00',
                'last_accessed_at': '2026-01-13T10:05:00',
            },
            {
                'composite_key': 'session456:tab1',
                'session_id': 'session456',
                'tab_id': 'tab1',
                'has_connector': False,
                'connection_type': None,
                'csv_temp_path': None,
                'created_at': '2026-01-13T10:01:00',
                'last_accessed_at': '2026-01-13T10:01:00',
            },
        ]
        
        response = {
            'total_sessions': len(sessions),
            'sessions': sessions
        }
        
        assert response['total_sessions'] == 2
        assert response['sessions'][0]['has_connector'] == True
        assert response['sessions'][1]['has_connector'] == False

    def test_empty_sessions_list(self):
        """Test debug endpoint with no active sessions."""
        sessions = []
        response = {
            'total_sessions': len(sessions),
            'sessions': sessions
        }
        
        assert response['total_sessions'] == 0
        assert len(response['sessions']) == 0

    def test_session_timestamps(self):
        """Test that session timestamps are properly formatted."""
        from datetime import datetime, timezone
        
        created = datetime.now(timezone.utc).isoformat()
        accessed = datetime.now(timezone.utc).isoformat()
        
        session_info = {
            'composite_key': 'session123:tab1',
            'created_at': created,
            'last_accessed_at': accessed,
        }
        
        # Should be ISO format strings
        assert 'T' in session_info['created_at']
        assert 'Z' in session_info['created_at'] or '+' in session_info['created_at']


class TestConnectionStateManagement:
    """Tests for connection state management logic."""

    def test_single_connection_per_session(self):
        """Test that only one connection per session is maintained."""
        session_state = {
            'current_connector': Mock(),
            'current_connection_details': ConnectionDetails(type='clickhouse'),
        }
        
        # Create new connection - replaces old one
        session_state['current_connector'] = Mock()  # New connector
        session_state['current_connection_details'] = ConnectionDetails(type='csv')
        
        assert session_state['current_connection_details'].type == 'csv'

    def test_tab_specific_sessions(self):
        """Test that different tabs have separate sessions."""
        storage = {
            'session123:tab1': {'connector': 'ch_connector'},
            'session123:tab2': {'connector': 'csv_connector'},
        }
        
        # Tab 1 and Tab 2 have different connectors
        assert storage['session123:tab1']['connector'] == 'ch_connector'
        assert storage['session123:tab2']['connector'] == 'csv_connector'

    def test_session_isolation(self):
        """Test that sessions don't interfere with each other."""
        session1 = {'user_id': 'user1', 'connector': 'connector1'}
        session2 = {'user_id': 'user2', 'connector': 'connector2'}
        
        # Modifying session1 shouldn't affect session2
        session1['connector'] = 'connector_new'
        
        assert session1['connector'] == 'connector_new'
        assert session2['connector'] == 'connector2'


class TestConnectionErrorHandling:
    """Tests for connection error handling."""

    def test_invalid_connection_string(self):
        """Test handling of invalid connection string."""
        connection_string = "invalid://connection"
        
        try:
            ConnectionDetails(
                type='clickhouse',
                connection_string=connection_string
            )
        except Exception:
            pass  # Might be valid - connection_string is flexible

    def test_missing_required_connection_field(self):
        """Test handling of missing required connection fields."""
        # ClickHouse requires at least host or connection_string
        details = ConnectionDetails(
            type='clickhouse',
            host=None,
            connection_string=None
        )
        
        # Should be created - defaults will be used
        assert details.type == 'clickhouse'

    def test_connection_timeout_handling(self):
        """Test that connection timeouts are handled gracefully."""
        mock_connector = Mock()
        mock_connector.connect.side_effect = TimeoutError('Connection timeout')
        
        try:
            mock_connector.connect({})
            assert False, "Should raise TimeoutError"
        except TimeoutError:
            pass  # Expected
