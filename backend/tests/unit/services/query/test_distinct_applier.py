"""Unit tests for DistinctApplier."""

from pypika import Query, Table

from backend.services.query_components.distinct_applier import DistinctApplier
from backend.models.query import QueryDescription, Dimension, Measure


class TestDistinctApplier:
    """Test suite for DistinctApplier component."""

    def test_discrete_only_dimensions_should_apply_distinct(self):
        """Pure discrete dimension queries should trigger DISTINCT."""
        applier = DistinctApplier()
        desc = QueryDescription(
            target_table="sales",
            dimensions=[
                Dimension(field="category", flavour="discrete"),
                Dimension(field="region", flavour="discrete")
            ]
        )
        query = Query.from_(Table("sales"))
        
        should_apply = applier.should_apply_distinct(desc, False, query)
        
        assert should_apply is True

    def test_single_discrete_dimension_should_apply_distinct(self):
        """Single discrete dimension should trigger DISTINCT."""
        applier = DistinctApplier()
        desc = QueryDescription(
            target_table="sales",
            dimensions=[Dimension(field="category", flavour="discrete")]
        )
        query = Query.from_(Table("sales"))
        
        should_apply = applier.should_apply_distinct(desc, False, query)
        
        assert should_apply is True

    def test_query_with_measures_should_not_apply_distinct(self):
        """Queries with measures should NOT trigger DISTINCT."""
        applier = DistinctApplier()
        desc = QueryDescription(
            target_table="sales",
            dimensions=[Dimension(field="category", flavour="discrete")],
            measures=[Measure(field="amount", aggregation="sum", alias="total")]
        )
        query = Query.from_(Table("sales"))
        
        should_apply = applier.should_apply_distinct(desc, False, query)
        
        assert should_apply is False

    def test_continuous_dimensions_should_not_apply_distinct(self):
        """Continuous dimensions should NOT trigger DISTINCT."""
        applier = DistinctApplier()
        desc = QueryDescription(
            target_table="sales",
            dimensions=[Dimension(field="price", flavour="continuous")]
        )
        query = Query.from_(Table("sales"))
        
        should_apply = applier.should_apply_distinct(desc, False, query)
        
        assert should_apply is False

    def test_mixed_discrete_and_continuous_should_not_apply_distinct(self):
        """Mixed discrete and continuous dimensions should NOT trigger DISTINCT."""
        applier = DistinctApplier()
        desc = QueryDescription(
            target_table="sales",
            dimensions=[
                Dimension(field="category", flavour="discrete"),
                Dimension(field="price", flavour="continuous")
            ]
        )
        query = Query.from_(Table("sales"))
        
        should_apply = applier.should_apply_distinct(desc, False, query)
        
        assert should_apply is False

    def test_category_dedup_enabled_should_not_apply_distinct(self):
        """When category deduplication is enabled, DISTINCT should NOT be applied."""
        applier = DistinctApplier()
        desc = QueryDescription(
            target_table="sales",
            dimensions=[Dimension(field="category", flavour="discrete")]
        )
        query = Query.from_(Table("sales"))
        
        should_apply = applier.should_apply_distinct(desc, True, query)
        
        assert should_apply is False

    def test_distinct_already_applied_should_not_reapply(self):
        """If DISTINCT is already applied, should NOT reapply."""
        applier = DistinctApplier()
        desc = QueryDescription(
            target_table="sales",
            dimensions=[Dimension(field="category", flavour="discrete")]
        )
        query = Query.from_(Table("sales")).select("category").distinct()
        
        should_apply = applier.should_apply_distinct(desc, False, query)
        
        assert should_apply is False

    def test_no_dimensions_should_not_apply_distinct(self):
        """Query with no dimensions should NOT trigger DISTINCT."""
        applier = DistinctApplier()
        desc = QueryDescription(
            target_table="sales",
            measures=[Measure(field="amount", aggregation="sum", alias="total")]
        )
        query = Query.from_(Table("sales"))
        
        should_apply = applier.should_apply_distinct(desc, False, query)
        
        assert should_apply is False

    def test_apply_if_needed_modifies_query_when_should_apply(self):
        """apply_if_needed should modify query when conditions are met."""
        applier = DistinctApplier()
        desc = QueryDescription(
            target_table="sales",
            dimensions=[Dimension(field="category", flavour="discrete")]
        )
        query = Query.from_(Table("sales")).select("category")
        
        result_query = applier.apply_if_needed(query, desc, False)
        
        assert result_query._distinct is True

    def test_apply_if_needed_returns_unmodified_when_should_not_apply(self):
        """apply_if_needed should return original query when conditions not met."""
        applier = DistinctApplier()
        desc = QueryDescription(
            target_table="sales",
            dimensions=[Dimension(field="category", flavour="discrete")],
            measures=[Measure(field="amount", aggregation="sum", alias="total")]
        )
        query = Query.from_(Table("sales")).select("category")
        
        result_query = applier.apply_if_needed(query, desc, False)
        
        assert result_query._distinct is False

    def test_apply_if_needed_does_not_modify_with_category_dedup(self):
        """apply_if_needed should not modify query when category dedup is enabled."""
        applier = DistinctApplier()
        desc = QueryDescription(
            target_table="sales",
            dimensions=[Dimension(field="category", flavour="discrete")]
        )
        query = Query.from_(Table("sales")).select("category")
        
        result_query = applier.apply_if_needed(query, desc, True)
        
        assert result_query._distinct is False

    def test_multiple_discrete_dimensions_triggers_distinct(self):
        """Multiple discrete dimensions should trigger DISTINCT."""
        applier = DistinctApplier()
        desc = QueryDescription(
            target_table="sales",
            dimensions=[
                Dimension(field="category", flavour="discrete"),
                Dimension(field="region", flavour="discrete"),
                Dimension(field="status", flavour="discrete")
            ]
        )
        query = Query.from_(Table("sales"))
        
        should_apply = applier.should_apply_distinct(desc, False, query)
        
        assert should_apply is True

    def test_empty_dimensions_list_should_not_apply_distinct(self):
        """Empty dimensions list should NOT trigger DISTINCT."""
        applier = DistinctApplier()
        desc = QueryDescription(
            target_table="sales",
            dimensions=[]
        )
        query = Query.from_(Table("sales"))
        
        should_apply = applier.should_apply_distinct(desc, False, query)
        
        assert should_apply is False
