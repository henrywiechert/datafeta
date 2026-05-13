"""Service for converting frontend filter-config to backend QueryFilter list."""

import logging
from typing import Any, Dict, List, Optional

from backend.models.query import Filter as QueryFilter
from backend.models.data_source import VirtualTableDefinition

logger = logging.getLogger(__name__)


class FilterConversionService:
    """Converts frontend filter-config dict to backend QueryFilter list."""
    
    BUILTIN_UNION_VIRTUALS = {'_source_database', '_source_table'}
    
    @classmethod
    def convert_filters(
        cls,
        filters: Dict[str, Any],
        virtual_table: Optional[VirtualTableDefinition] = None
    ) -> List[QueryFilter]:
        """
        Convert frontend filter config dict to QueryFilter list.
        
        Frontend filter config format:
        {
            "filter_key": {
                "columnName": "field_name",
                "type": "discrete" | "continuous" | "range" | "datetime",
                "selectedValues": [...],  # for discrete
                "minValue": ..., "maxValue": ...,  # for continuous/range
                "startDate": ..., "endDate": ...,  # for datetime
                "dateTimePart": ..., "dateTimeMode": ...  # optional datetime extraction
            }
        }
        
        Args:
            filters: Frontend filter configuration dict
            virtual_table: Optional virtual table definition (for checking union mode)
        
        Returns:
            List of QueryFilter objects for backend query service
        """
        query_filters: List[QueryFilter] = []
        
        if not isinstance(filters, dict):
            return query_filters
        
        is_union_mode = (
            virtual_table is not None and 
            getattr(virtual_table, 'mode', None) == 'union'
        )
        
        for _key, cfg in filters.items():
            if not isinstance(cfg, dict):
                continue
            
            field = cfg.get('columnName') or _key
            if not field:
                continue
            
            # Skip builtin union-only columns if not in union mode
            if field in cls.BUILTIN_UNION_VIRTUALS and not is_union_mode:
                continue
            
            filter_type = cfg.get('type')
            date_part = cfg.get('dateTimePart')
            date_mode = cfg.get('dateTimeMode')
            
            if filter_type == 'discrete':
                selected = cfg.get('selectedValues') or []
                excluded = cfg.get('excludedValues') or []
                total_available = cfg.get('totalAvailableCount')
                selected_len = len(selected)

                use_exclusion = (
                    excluded
                    and (
                        selected_len == 0
                        or (
                            total_available is not None
                            and len(excluded) < selected_len
                        )
                    )
                )

                if use_exclusion:
                    query_filters.append(
                        QueryFilter(
                            field=field,
                            operator='not in',
                            value=excluded,
                            date_part=date_part,
                            date_mode=date_mode,
                        )
                    )
                elif selected_len == 0:
                    pass
                elif (
                    total_available is not None
                    and total_available > 0
                    and selected_len == total_available
                ):
                    pass
                else:
                    query_filters.append(
                        QueryFilter(
                            field=field,
                            operator='in',
                            value=selected,
                            date_part=date_part,
                            date_mode=date_mode,
                        )
                    )
            
            elif filter_type in ('continuous', 'range'):
                min_val = cfg.get('minValue')
                if min_val is None:
                    min_val = cfg.get('min')
                max_val = cfg.get('maxValue')
                if max_val is None:
                    max_val = cfg.get('max')
                
                if min_val is not None:
                    query_filters.append(
                        QueryFilter(
                            field=field,
                            operator='>=',
                            value=min_val,
                            date_part=date_part,
                            date_mode=date_mode
                        )
                    )
                if max_val is not None:
                    query_filters.append(
                        QueryFilter(
                            field=field,
                            operator='<=',
                            value=max_val,
                            date_part=date_part,
                            date_mode=date_mode
                        )
                    )

            elif filter_type == 'measure':
                # Measure filter → HAVING clause (scope='group').
                # 'columnName' must be the measure alias (e.g. "SUM(revenue)").
                min_val = cfg.get('minValue')
                if min_val is None:
                    min_val = cfg.get('min')
                max_val = cfg.get('maxValue')
                if max_val is None:
                    max_val = cfg.get('max')

                if min_val is not None:
                    query_filters.append(
                        QueryFilter(
                            field=field,
                            operator='>=',
                            value=min_val,
                            scope='group',
                        )
                    )
                if max_val is not None:
                    query_filters.append(
                        QueryFilter(
                            field=field,
                            operator='<=',
                            value=max_val,
                            scope='group',
                        )
                    )
            
            elif filter_type == 'datetime':
                start = cfg.get('startDate')
                end = cfg.get('endDate')
                
                if start is not None:
                    query_filters.append(
                        QueryFilter(field=field, operator='>=', value=start)
                    )
                if end is not None:
                    query_filters.append(
                        QueryFilter(field=field, operator='<=', value=end)
                    )
        
        return query_filters

