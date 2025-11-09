from backend.models.data_source import VirtualTableDefinition, UnionTableDefinition
from backend.models.query import Dimension, QueryDescription
from backend.services.query_service import QueryService


def test_union_query_injects_source_table_column():
    query_description = QueryDescription(
        target_table="sales_2023",
        target_database="analytics",
        dimensions=[Dimension(field="category", flavour="discrete")],
        virtual_table=VirtualTableDefinition(
            primary_table="sales_2023",
            mode="union",
            union_tables=[UnionTableDefinition(table_name="sales_2024")],
        ),
    )

    query_sql, metadata = QueryService().translate_to_sql(
        query_description,
        table_name="sales_2023",
        db_type="duckdb",
        with_optimization=False,
    )

    assert "UNION ALL" in query_sql
    assert "'sales_2023' AS \"_source_table\"" in query_sql
    assert "'sales_2024' AS \"_source_table\"" in query_sql
    assert metadata == []
