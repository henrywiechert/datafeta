"""Unit tests for TableContextBuilder."""

import pytest
from backend.dialects import get_dialect
from backend.services.query_components.table_context_builder import TableContextBuilder
from backend.models.query import QueryDescription
from backend.models.data_source import VirtualTableDefinition, TableJoinDefinition
from backend.exceptions import QueryGenerationError


class TestTableContextBuilder:
    """Test suite for TableContextBuilder component."""

    def test_single_table_no_database(self):
        """Single table query without database schema should create simple table."""
        builder = TableContextBuilder()
        desc = QueryDescription(target_table="sales")
        dialect = get_dialect("duckdb")
        
        ctx = builder.build(desc, dialect, None)
        
        assert ctx.primary_table.get_table_name() == "sales"
        assert ctx.default_table.get_table_name() == "sales"
        assert "sales" in ctx.table_map
        assert ctx.query is not None

    def test_single_table_with_clickhouse_database(self):
        """Single table query with ClickHouse should include schema."""
        builder = TableContextBuilder()
        desc = QueryDescription(
            target_table="sales",
            target_database="analytics"
        )
        dialect = get_dialect("clickhouse")
        
        ctx = builder.build(desc, dialect, None)
        
        assert ctx.primary_table.get_table_name() == "sales"
        # Check schema is present in SQL representation
        assert "analytics" in str(ctx.primary_table)
        assert "sales" in ctx.table_map

    def test_single_table_with_explicit_table_name(self):
        """Should use explicit target_table from QueryDescription."""
        builder = TableContextBuilder()
        desc = QueryDescription(target_table="explicit_table")
        dialect = get_dialect("duckdb")
        
        ctx = builder.build(desc, dialect, "fallback_table")
        
        # Should use explicit_table, not fallback
        assert ctx.primary_table.get_table_name() == "explicit_table"
        assert "explicit_table" in ctx.table_map

    def test_multi_table_inner_join(self):
        """Multi-table query with INNER JOIN should create proper context."""
        builder = TableContextBuilder()
        desc = QueryDescription(target_table="dummy", virtual_table=VirtualTableDefinition(
                primary_table="orders",
                joined_tables=[
                    TableJoinDefinition(
                        table_name="customers",
                        join_type="INNER",
                        on_conditions=["orders.customer_id=customers.id"]
                    )
                ]
            )
        )
        dialect = get_dialect("duckdb")
        ctx = builder.build(desc, dialect, None)
        
        assert ctx.primary_table.get_table_name() == "orders"
        assert "orders" in ctx.table_map
        assert "customers" in ctx.table_map
        assert ctx.default_table.get_table_name() == "orders"

    def test_multi_table_left_join(self):
        """Multi-table query with LEFT JOIN should be properly configured."""
        builder = TableContextBuilder()
        desc = QueryDescription(target_table="dummy", virtual_table=VirtualTableDefinition(
                primary_table="orders",
                joined_tables=[
                    TableJoinDefinition(
                        table_name="customers",
                        join_type="LEFT",
                        on_conditions=["orders.customer_id=customers.id"]
                    )
                ]
            )
        )
        dialect = get_dialect("duckdb")
        ctx = builder.build(desc, dialect, None)
        
        assert "orders" in ctx.table_map
        assert "customers" in ctx.table_map
        # Verify the query object has the join configured
        assert len(ctx.query._joins) == 1
        assert ctx.query._joins[0].how.value == "LEFT"

    def test_multi_table_right_join(self):
        """Multi-table query with RIGHT JOIN should be properly configured."""
        builder = TableContextBuilder()
        desc = QueryDescription(target_table="dummy", virtual_table=VirtualTableDefinition(
                primary_table="orders",
                joined_tables=[
                    TableJoinDefinition(
                        table_name="customers",
                        join_type="RIGHT",
                        on_conditions=["orders.customer_id=customers.id"]
                    )
                ]
            )
        )
        dialect = get_dialect("duckdb")
        ctx = builder.build(desc, dialect, None)
        
        # Verify the query object has the join configured
        assert len(ctx.query._joins) == 1
        assert ctx.query._joins[0].how.value == "RIGHT"

    def test_multi_table_full_outer_join(self):
        """Multi-table query with FULL JOIN should be properly configured."""
        builder = TableContextBuilder()
        desc = QueryDescription(target_table="dummy", virtual_table=VirtualTableDefinition(
                primary_table="orders",
                joined_tables=[
                    TableJoinDefinition(
                        table_name="customers",
                        join_type="FULL",
                        on_conditions=["orders.customer_id=customers.id"]
                    )
                ]
            )
        )
        dialect = get_dialect("duckdb")
        ctx = builder.build(desc, dialect, None)
        
        # Verify the query object has the join configured
        assert len(ctx.query._joins) == 1
        assert ctx.query._joins[0].how.value == "FULL OUTER"

    def test_multi_table_with_clickhouse_schema(self):
        """Multi-table query with ClickHouse should include schema for all tables."""
        builder = TableContextBuilder()
        desc = QueryDescription(
            target_table="dummy",
            target_database="analytics",
            virtual_table=VirtualTableDefinition(
                primary_table="orders",
                joined_tables=[
                    TableJoinDefinition(
                        table_name="customers",
                        join_type="INNER",
                        on_conditions=["orders.customer_id=customers.id"]
                    )
                ]
            )
        )
        
        dialect = get_dialect("clickhouse")
        ctx = builder.build(desc, dialect, None)
        
        # Check schema is present in table representations
        assert "analytics" in str(ctx.primary_table)
        assert "analytics" in str(ctx.table_map["customers"])

    def test_multi_table_three_way_join(self):
        """Multi-table query with three tables should create all table references."""
        builder = TableContextBuilder()
        desc = QueryDescription(target_table="dummy", virtual_table=VirtualTableDefinition(
                primary_table="orders",
                joined_tables=[
                    TableJoinDefinition(
                        table_name="customers",
                        join_type="INNER",
                        on_conditions=["orders.customer_id=customers.id"]
                    ),
                    TableJoinDefinition(
                        table_name="products",
                        join_type="LEFT",
                        on_conditions=["orders.product_id=products.id"]
                    )
                ]
            )
        )
        dialect = get_dialect("duckdb")
        ctx = builder.build(desc, dialect, None)
        
        assert "orders" in ctx.table_map
        assert "customers" in ctx.table_map
        assert "products" in ctx.table_map
        assert ctx.primary_table.get_table_name() == "orders"

    def test_nested_column_names_in_join_condition(self):
        """JOIN conditions should handle nested column names with dots."""
        builder = TableContextBuilder()
        desc = QueryDescription(target_table="dummy", virtual_table=VirtualTableDefinition(
                primary_table="events",
                joined_tables=[
                    TableJoinDefinition(
                        table_name="users",
                        join_type="INNER",
                        on_conditions=["events.user.id=users.id"]
                    )
                ]
            )
        )
        dialect = get_dialect("duckdb")
        ctx = builder.build(desc, dialect, None)
        
        assert "events" in ctx.table_map
        assert "users" in ctx.table_map
        # Should successfully parse nested column name (verify join exists)
        assert len(ctx.query._joins) == 1

    def test_table_map_contains_all_tables(self):
        """table_map should contain entries for all tables in the query."""
        builder = TableContextBuilder()
        desc = QueryDescription(target_table="dummy", virtual_table=VirtualTableDefinition(
                primary_table="orders",
                joined_tables=[
                    TableJoinDefinition(
                        table_name="customers",
                        join_type="INNER",
                        on_conditions=["orders.customer_id=customers.id"]
                    ),
                    TableJoinDefinition(
                        table_name="products",
                        join_type="INNER",
                        on_conditions=["orders.product_id=products.id"]
                    )
                ]
            )
        )
        dialect = get_dialect("duckdb")
        ctx = builder.build(desc, dialect, None)
        
        assert len(ctx.table_map) == 3
        assert all(table in ctx.table_map for table in ["orders", "customers", "products"])

    def test_default_table_matches_primary(self):
        """default_table should match primary_table for multi-table queries."""
        builder = TableContextBuilder()
        desc = QueryDescription(target_table="dummy", virtual_table=VirtualTableDefinition(
                primary_table="orders",
                joined_tables=[
                    TableJoinDefinition(
                        table_name="customers",
                        join_type="INNER",
                        on_conditions=["orders.customer_id=customers.id"]
                    )
                ]
            )
        )
        dialect = get_dialect("duckdb")
        ctx = builder.build(desc, dialect, None)
        
        assert ctx.default_table.get_table_name() == ctx.primary_table.get_table_name()
        assert ctx.default_table.get_table_name() == "orders"
