"""Test transitive relationship detection in table merge service."""

from backend.services.table_merge_service import TableMergeService
from backend.models.data_source import ForeignKeyRelationship
from unittest.mock import Mock


def test_get_suggested_tables_with_transitive_relationships():
    """
    Test that get_suggested_tables finds tables that can join to already-joined tables.
    
    Scenario:
    - Primary table: constructors
    - Already joined: sprint_results (has FK to constructors)
    - Should suggest: drivers (has FK to sprint_results)
    """
    # Mock connector
    mock_connector = Mock()
    
    # Define FK relationships
    mock_connector.detect_foreign_keys.return_value = [
        # sprint_results -> constructors
        ForeignKeyRelationship(
            from_table='sprint_results',
            from_column='constructorId',
            to_table='constructors',
            to_column='constructorId',
            relationship_type='many_to_one'
        ),
        # sprint_results -> drivers
        ForeignKeyRelationship(
            from_table='sprint_results',
            from_column='driverId',
            to_table='drivers',
            to_column='driverId',
            relationship_type='many_to_one'
        ),
        # sprint_results -> races
        ForeignKeyRelationship(
            from_table='sprint_results',
            from_column='raceId',
            to_table='races',
            to_column='raceId',
            relationship_type='many_to_one'
        ),
    ]
    
    service = TableMergeService(mock_connector)
    
    # Without already_joined, should only suggest sprint_results
    suggested = service.get_suggested_tables('kaggle', 'constructors')
    assert 'sprint_results' in suggested
    assert 'drivers' not in suggested  # Not directly related to constructors
    assert 'races' not in suggested
    
    # With sprint_results already joined, should now suggest drivers and races
    suggested_with_transitive = service.get_suggested_tables(
        'kaggle', 
        'constructors',
        already_joined=['sprint_results']
    )
    
    assert 'sprint_results' not in suggested_with_transitive  # Already joined, excluded
    assert 'drivers' in suggested_with_transitive  # Can join to sprint_results
    assert 'races' in suggested_with_transitive  # Can join to sprint_results


def test_get_suggested_tables_excludes_already_joined():
    """Test that already-joined tables are not suggested again."""
    mock_connector = Mock()
    
    mock_connector.detect_foreign_keys.return_value = [
        ForeignKeyRelationship(
            from_table='orders',
            from_column='customer_id',
            to_table='customers',
            to_column='id',
            relationship_type='many_to_one'
        ),
    ]
    
    service = TableMergeService(mock_connector)
    
    # Should suggest customers
    suggested = service.get_suggested_tables('test_db', 'orders')
    assert 'customers' in suggested
    
    # With customers already joined, should return empty (no other tables)
    suggested_with_joined = service.get_suggested_tables(
        'test_db', 
        'orders',
        already_joined=['customers']
    )
    assert 'customers' not in suggested_with_joined
    assert len(suggested_with_joined) == 0
