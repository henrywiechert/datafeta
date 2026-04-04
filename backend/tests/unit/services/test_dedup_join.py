"""Unit tests for unique-row join enforcement (Feature 2).

Covers:
- DedupWrappedTable SQL generation
- enforce_unique_keys flag propagation from relationship_type
- Composite key uniqueness check service method
"""

import pytest
from unittest.mock import Mock, patch

from pypika import Query, Table

from backend.models.data_source import (
    ForeignKeyRelationship,
    TableJoinDefinition,
    VirtualTableDefinition,
)
from backend.models.query import QueryDescription
from backend.services.table_merge_service import TableMergeService
from backend.services.query_components.table_context_builder import (
    DedupWrappedTable,
    TableContextBuilder,
)


# ── DedupWrappedTable SQL generation ──────────────────────────────────────

class TestDedupWrappedTable:

    def test_single_key_column_get_sql(self):
        """Single key column produces correct dedup subquery."""
        t = DedupWrappedTable('users', ['user_id'])
        sql = t.get_sql()
        assert 'SELECT * FROM "users"' in sql
        assert 'WHERE ("user_id") IN' in sql
        assert 'GROUP BY "user_id" HAVING count()=1' in sql
        assert sql.endswith('"users"')

    def test_composite_key_columns(self):
        """Composite keys produce correct tuple in WHERE and GROUP BY."""
        t = DedupWrappedTable('events', ['slot', 'sfn', 'lcrId'])
        sql = t.get_sql()
        assert '"slot","sfn","lcrId"' in sql
        assert 'WHERE ("slot","sfn","lcrId") IN' in sql
        assert 'GROUP BY "slot","sfn","lcrId"' in sql

    def test_schema_qualified(self):
        """ClickHouse schema-qualified table uses schema in subquery but table name as alias."""
        t = DedupWrappedTable('orders', ['id'], schema='mydb')
        sql = t.get_sql()
        assert '"mydb"."orders"' in sql
        assert sql.endswith('"orders"')

    def test_field_reference(self):
        """Field references on DedupWrappedTable resolve correctly."""
        t = DedupWrappedTable('users', ['id'])
        field = t['name']
        # Should produce a Field reference that works in queries
        assert field is not None

    def test_join_produces_valid_sql(self):
        """DedupWrappedTable works correctly in a LEFT JOIN."""
        t1 = Table('orders')
        t2 = DedupWrappedTable('users', ['user_id'])
        q = Query.from_(t1).left_join(t2).on(
            t1['user_id'] == t2['id']
        ).select(t1.star, t2['name'])
        sql = q.get_sql()

        assert 'LEFT JOIN' in sql
        assert 'SELECT * FROM "users"' in sql
        assert 'HAVING count()=1' in sql
        assert '"orders"."user_id"="users"."id"' in sql

    def test_composite_key_join(self):
        """Composite-key DedupWrappedTable in a JOIN."""
        t1 = Table('primary')
        t2 = DedupWrappedTable('secondary', ['slot', 'sfn'])
        cond = (t1['slot'] == t2['slot']) & (t1['sfn'] == t2['sfn'])
        q = Query.from_(t1).left_join(t2).on(cond).select(t1.star)
        sql = q.get_sql()

        assert '"slot","sfn"' in sql
        assert 'GROUP BY "slot","sfn"' in sql


# ── enforce_unique_keys flag propagation ──────────────────────────────────

class TestEnforceUniqueKeysInSuggestJoins:

    def _make_service(self):
        mock_connector = Mock()
        mock_connector.detect_foreign_keys.return_value = []
        return TableMergeService(mock_connector)

    def test_many_to_one_enforces_on_target(self):
        """many_to_one: target (to_table) side should be unique."""
        service = self._make_service()
        rels = [
            ForeignKeyRelationship(
                from_table='orders',
                from_columns=['customer_id'],
                to_table='customers',
                to_columns=['id'],
                relationship_type='many_to_one',
            ),
        ]
        result = service.suggest_joins('db', 'orders', relationships=rels)

        assert len(result) == 1
        assert result[0].table_name == 'customers'
        assert result[0].enforce_unique_keys is True
        assert result[0].dedup_key_columns == ['id']

    def test_one_to_one_enforces_on_target(self):
        """one_to_one: target side should be unique."""
        service = self._make_service()
        rels = [
            ForeignKeyRelationship(
                from_table='users',
                from_columns=['id'],
                to_table='profiles',
                to_columns=['user_id'],
                relationship_type='one_to_one',
            ),
        ]
        result = service.suggest_joins('db', 'users', relationships=rels)

        assert len(result) == 1
        assert result[0].enforce_unique_keys is True
        assert result[0].dedup_key_columns == ['user_id']

    def test_one_to_many_no_enforcement_on_target(self):
        """one_to_many: target (to_table) is the 'many' side — no enforcement."""
        service = self._make_service()
        rels = [
            ForeignKeyRelationship(
                from_table='customers',
                from_columns=['id'],
                to_table='orders',
                to_columns=['customer_id'],
                relationship_type='one_to_many',
            ),
        ]
        result = service.suggest_joins('db', 'customers', relationships=rels)

        assert len(result) == 1
        assert result[0].table_name == 'orders'
        assert result[0].enforce_unique_keys is False
        assert result[0].dedup_key_columns is None

    def test_many_to_many_no_enforcement(self):
        """many_to_many: no enforcement on either side."""
        service = self._make_service()
        rels = [
            ForeignKeyRelationship(
                from_table='students',
                from_columns=['id'],
                to_table='courses',
                to_columns=['id'],
                relationship_type='many_to_many',
            ),
        ]
        result = service.suggest_joins('db', 'students', relationships=rels)

        assert len(result) == 1
        assert result[0].enforce_unique_keys is False

    def test_reverse_case2_one_to_many_enforces_source(self):
        """Case 2 (reverse lookup): one_to_many means from_table is unique."""
        service = self._make_service()
        rels = [
            ForeignKeyRelationship(
                from_table='users',
                from_columns=['id'],
                to_table='orders',
                to_columns=['user_id'],
                relationship_type='one_to_many',
            ),
        ]
        # Primary table is 'orders', so 'users' is found via case 2
        result = service.suggest_joins('db', 'orders', relationships=rels)

        assert len(result) == 1
        assert result[0].table_name == 'users'
        assert result[0].enforce_unique_keys is True
        assert result[0].dedup_key_columns == ['id']

    def test_composite_key_dedup_columns(self):
        """Composite key relationships populate dedup_key_columns correctly."""
        service = self._make_service()
        rels = [
            ForeignKeyRelationship(
                from_table='t1',
                from_columns=['slot', 'sfn'],
                to_table='t2',
                to_columns=['slot', 'sfn'],
                relationship_type='many_to_one',
            ),
        ]
        result = service.suggest_joins('db', 't1', relationships=rels)

        assert result[0].dedup_key_columns == ['slot', 'sfn']


# ── TableContextBuilder with dedup wrapping ───────────────────────────────

class TestTableContextBuilderDedup:

    def _build_query_desc(self, enforce=True, relationship_type='many_to_one'):
        """Helper to build a QueryDescription with a joined table."""
        return QueryDescription(
            target_table='orders',
            target_database=None,
            dimensions=[],
            measures=[],
            virtual_table=VirtualTableDefinition(
                primary_table='orders',
                mode='join',
                joined_tables=[
                    TableJoinDefinition(
                        table_name='customers',
                        join_type='LEFT',
                        on_conditions=['orders.customer_id = customers.id'],
                        enforce_unique_keys=enforce,
                        dedup_key_columns=['id'] if enforce else None,
                    )
                ],
            ),
        )

    def test_enforce_wraps_joined_table(self):
        """When enforce_unique_keys=True, joined table appears as dedup subquery."""
        qd = self._build_query_desc(enforce=True)
        builder = TableContextBuilder()
        ctx = builder.build(qd, db_type='duckdb', fallback_table_name='orders')

        sql = ctx.query.select(ctx.primary_table.star).get_sql()
        assert 'HAVING count()=1' in sql
        assert 'WHERE ("id") IN' in sql

    def test_no_enforce_normal_join(self):
        """When enforce_unique_keys=False, normal JOIN without dedup."""
        qd = self._build_query_desc(enforce=False)
        builder = TableContextBuilder()
        ctx = builder.build(qd, db_type='duckdb', fallback_table_name='orders')

        sql = ctx.query.select(ctx.primary_table.star).get_sql()
        assert 'HAVING count()' not in sql
        assert 'LEFT JOIN "customers"' in sql


# ── Cardinality check service ─────────────────────────────────────────────

class TestCheckCompositeKeyUniqueness:

    def _make_service(self, rows, conn_type='clickhouse'):
        from backend.services.cardinality_service import CardinalityService
        from backend.models.data_source import ConnectionDetails

        mock_connector = Mock()
        mock_connector.fetch_data.return_value = (['total_rows', 'unique_keys'], rows)

        conn_details = Mock(spec=ConnectionDetails)
        conn_details.type = conn_type

        return CardinalityService(mock_connector, conn_details), mock_connector

    def test_unique_keys_clickhouse(self):
        """ClickHouse: all rows unique → is_unique=True."""
        service, mock = self._make_service([[100, 100]], conn_type='clickhouse')
        result = service.check_composite_key_uniqueness('t1', ['slot', 'sfn'], database='mydb')

        assert result['is_unique'] is True
        assert result['total_rows'] == 100
        assert result['unique_keys'] == 100
        assert result['duplicate_rows'] == 0

        sql = mock.fetch_data.call_args[0][0]
        assert 'uniqExact' in sql
        assert 'tuple' in sql

    def test_duplicate_keys_clickhouse(self):
        """ClickHouse: some duplicates → is_unique=False."""
        service, _ = self._make_service([[150, 100]], conn_type='clickhouse')
        result = service.check_composite_key_uniqueness('t1', ['slot'], database='db')

        assert result['is_unique'] is False
        assert result['duplicate_rows'] == 50

    def test_duckdb_uses_count_distinct(self):
        """DuckDB: uses COUNT(DISTINCT (...)) syntax."""
        service, mock = self._make_service([[200, 200]], conn_type='duckdb')
        result = service.check_composite_key_uniqueness('events', ['a', 'b'])

        assert result['is_unique'] is True
        sql = mock.fetch_data.call_args[0][0]
        assert 'count(DISTINCT' in sql

    def test_empty_result(self):
        """Empty table returns zeros."""
        service, _ = self._make_service([], conn_type='clickhouse')
        result = service.check_composite_key_uniqueness('t1', ['id'], database='db')

        assert result['total_rows'] == 0
        assert result['is_unique'] is True

    def test_dict_row_format(self):
        """Handles dict row format (some connectors return dicts)."""
        service, _ = self._make_service(
            [{'total_rows': 500, 'unique_keys': 490}],
            conn_type='clickhouse'
        )
        result = service.check_composite_key_uniqueness('t1', ['id'], database='db')

        assert result['total_rows'] == 500
        assert result['unique_keys'] == 490
        assert result['duplicate_rows'] == 10
