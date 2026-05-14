# Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
"""Unit tests for logging utilities."""

import pytest

from backend.utils.logging_utils import redact_sensitive, SENSITIVE_KEYS


class TestRedactSensitive:
    """Tests for redact_sensitive function."""

    def test_redact_sensitive_masks_password(self):
        """Test that password values are masked."""
        data = {'host': 'localhost', 'password': 'secret123'}
        result = redact_sensitive(data)
        assert result['host'] == 'localhost'
        assert result['password'] == '***'

    def test_redact_sensitive_masks_api_key(self):
        """Test that api_key values are masked."""
        data = {'user': 'admin', 'api_key': 'abc123xyz'}
        result = redact_sensitive(data)
        assert result['user'] == 'admin'
        assert result['api_key'] == '***'

    def test_redact_sensitive_masks_connection_string(self):
        """Test that connection_string values are masked."""
        data = {'name': 'mydb', 'connection_string': 'clickhouse://user:pass@host:8123'}
        result = redact_sensitive(data)
        assert result['name'] == 'mydb'
        assert result['connection_string'] == '***'

    def test_redact_sensitive_case_insensitive(self):
        """Test that key matching is case insensitive."""
        data = {'API_KEY': 'abc', 'Connection_String': 'dsn://...', 'PASSWORD': 'secret'}
        result = redact_sensitive(data)
        assert result['API_KEY'] == '***'
        assert result['Connection_String'] == '***'
        assert result['PASSWORD'] == '***'

    def test_redact_sensitive_custom_replacement(self):
        """Test that custom replacement string can be used."""
        data = {'password': 'secret'}
        result = redact_sensitive(data, replacement='[REDACTED]')
        assert result['password'] == '[REDACTED]'

    def test_redact_sensitive_preserves_non_sensitive(self):
        """Test that non-sensitive keys are preserved."""
        data = {'host': 'localhost', 'port': 8123, 'database': 'default'}
        result = redact_sensitive(data)
        assert result == data

    def test_redact_sensitive_empty_dict(self):
        """Test handling of empty dictionary."""
        result = redact_sensitive({})
        assert result == {}

    def test_redact_sensitive_returns_new_dict(self):
        """Test that original dict is not modified."""
        data = {'password': 'secret'}
        result = redact_sensitive(data)
        assert data['password'] == 'secret'
        assert result['password'] == '***'
        assert data is not result

    def test_redact_sensitive_kaggle_api_key(self):
        """Test that kaggle_api_key is recognized as sensitive."""
        data = {'kaggle_api_key': 'mykey', 'kaggle_dataset': 'user/dataset'}
        result = redact_sensitive(data)
        assert result['kaggle_api_key'] == '***'
        assert result['kaggle_dataset'] == 'user/dataset'

    def test_redact_sensitive_token_and_secret(self):
        """Test that token and secret keys are masked."""
        data = {'token': 'bearer_xyz', 'secret': 'mysecret', 'public': 'value'}
        result = redact_sensitive(data)
        assert result['token'] == '***'
        assert result['secret'] == '***'
        assert result['public'] == 'value'


class TestSensitiveKeysConstant:
    """Tests for SENSITIVE_KEYS constant."""

    def test_expected_keys_present(self):
        """Test that expected sensitive keys are in the set."""
        expected = ['password', 'api_key', 'connection_string', 'kaggle_api_key', 'secret', 'token']
        for key in expected:
            assert key in SENSITIVE_KEYS

    def test_is_frozenset(self):
        """Test that SENSITIVE_KEYS is immutable."""
        assert isinstance(SENSITIVE_KEYS, frozenset)
