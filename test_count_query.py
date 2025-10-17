"""Debug script to test actual count query"""

import sys
sys.path.insert(0, '/var/fpwork/dems19d7/data-slicer')

from backend.models.query import QueryDescription, Dimension
from pypika import Query, Table

# Simulate your query
query_desc = QueryDescription(
    target_table='L2_TMT_KPI_2',
    target_database='default',
    dimensions=[
        Dimension(field='nr_5192e_5g_average_number_of_scheduled_fdm_and_mu_mimo_ues_on_pdsch', axis='x', flavour='continuous'),
        Dimension(field='nr_5193b_5g_average_number_of_scheduled_fdm_and_mu_mimo_ues_on_pusch', axis='y', flavour='continuous'),
    ],
    measures=[],
    filters=[]
)

# Build the count query
table = Table(query_desc.target_table, schema=query_desc.target_database)
count_query = Query.from_(table)

continuous_dims = [d for d in query_desc.dimensions if d.flavour == 'continuous']

# Select fields
for dim in continuous_dims:
    field_term = getattr(table, dim.field)
    count_query = count_query.select(field_term)

# Add NOT NULL filters
for dim in continuous_dims:
    field_term = getattr(table, dim.field)
    count_query = count_query.where(field_term.isnotnull())

# GROUP BY
for dim in continuous_dims:
    field_term = getattr(table, dim.field)
    count_query = count_query.groupby(field_term)

# Get SQL
subquery_sql = count_query.get_sql(quote_char='`')
sql = f"SELECT COUNT(*) as unique_count FROM ({subquery_sql})"

print("=" * 80)
print("DEBUG: Count Query")
print("=" * 80)
print(f"\nGenerated SQL:")
print(sql)
print()
print("This query should:")
print("1. Select the two continuous fields")
print("2. Filter out NULLs")
print("3. GROUP BY both fields")
print("4. Count the number of groups")
print()
print("Expected result: A single row with the count of unique (x,y) pairs")
print("=" * 80)
