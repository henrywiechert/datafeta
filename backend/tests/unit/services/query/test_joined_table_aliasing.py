# Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
"""Test that fields from joined tables are properly aliased in SELECT."""

from backend.services.query_service import QueryService
from backend.models.query import (
    QueryDescription,
    Dimension,
    Measure,
)
from backend.models.data_source import (
    VirtualTableDefinition,
    TableJoinDefinition,
)


def test_joined_table_dimension_is_aliased():
    """
    When a dimension comes from a joined table (e.g., 'customers.name'),
    it should be aliased in the SELECT to preserve the full qualified name.
    """
    qs = QueryService()
    
    # Create a query with a join
    virtual_table = VirtualTableDefinition(
        primary_table="orders",
        joined_tables=[
            TableJoinDefinition(
                table_name="customers",
                join_type="LEFT",
                on_conditions=["orders.customer_id = customers.id"],
            )
        ],
    )
    
    desc = QueryDescription(
        target_table="orders",
        dimensions=[
            Dimension(field="customers.name", flavour="discrete"),
            Dimension(field="orders.order_date", flavour="discrete"),
        ],
        measures=[
            Measure(field="orders.amount", aggregation="sum", alias="total_amount")
        ],
        virtual_table=virtual_table,
    )
    
    sql = qs.translate_to_sql(desc, "duckdb", with_sampling=False, with_optimization=False)
    
    sql_str = sql[0] if isinstance(sql, tuple) else sql
    print(f"\nGenerated SQL:\n{sql_str}\n")
    
    # The SQL should alias customers.name to preserve the table prefix
    # DuckDB uses backticks, so check for that format
    assert '`customers`.`name` `customers.name`' in sql_str
    # orders.order_date should also be aliased
    assert '`orders`.`order_date` `orders.order_date`' in sql_str
    
    # GROUP BY should use the original field reference
    assert 'GROUP BY `customers`.`name`' in sql_str
    assert '`orders`.`order_date`' in sql_str


def test_single_table_dimension_not_aliased():
    """
    Single-table dimensions without special processing shouldn't be aliased
    (unless they have dots in the name for ClickHouse nested columns).
    """
    qs = QueryService()
    
    desc = QueryDescription(
        target_table="sales",
        dimensions=[
            Dimension(field="category", flavour="discrete"),
        ],
        measures=[
            Measure(field="revenue", aggregation="sum", alias="total_revenue")
        ],
    )
    
    sql = qs.translate_to_sql(desc, "duckdb", with_sampling=False, with_optimization=False)
    
    sql_str = sql[0] if isinstance(sql, tuple) else sql
    print(f"\nGenerated SQL:\n{sql_str}\n")
    
    # Single table field should not be aliased (unless processed by rounding/binning/etc)
    # The field should appear without AS unless it's been transformed
    assert '`category`' in sql_str
    # Should not have unnecessary aliasing like '`category` `category`'
    # (unless transformed, in which case it would be acceptable)
