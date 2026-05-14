# Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
"""Shared heuristic for detecting foreign key relationships by column naming conventions."""
import logging
from typing import Dict, List

from backend.models.data_source import Column, ForeignKeyRelationship

logger = logging.getLogger(__name__)


def detect_foreign_keys_by_naming_convention(
    table_columns: Dict[str, List[Column]],
) -> List[ForeignKeyRelationship]:
    """
    Detect potential FK relationships by analyzing column naming conventions.

    Heuristics applied:
    - Columns ending in ``_id``, ``id``, ``_Id``, ``Id`` are treated as FK candidates.
    - The prefix before the suffix is matched against table names (case-insensitive)
      with basic pluralisation (``+s``, ``+es``, ``-s``).
    - The target table must contain a plausible PK column (``id``, ``_id``,
      ``{table}id``, ``{table}_id``, or camelCase variants).

    Args:
        table_columns: Mapping of ``table_name -> [Column, ...]`` for every table
            in the database / dataset to analyse.

    Returns:
        List of detected :class:`ForeignKeyRelationship` objects.
    """
    table_names = list(table_columns.keys())
    relationships: List[ForeignKeyRelationship] = []

    logger.info(
        "Analyzing FK relationships across %d tables: %s",
        len(table_names),
        table_names[:10],
    )

    for from_table, columns in table_columns.items():
        col_names = [c.name for c in columns]
        logger.debug("Table '%s' has columns: %s", from_table, col_names)

        for col in columns:
            col_name_lower = col.name.lower()

            # --- 1. Is this column an FK candidate? ---
            if not (col_name_lower.endswith('_id') or col_name_lower.endswith('id')
                    or col.name.endswith('_Id') or col.name.endswith('Id')):
                continue

            # --- 2. Extract potential target table name ---
            potential_table_lower = col_name_lower
            if potential_table_lower.endswith('_id'):
                potential_table_lower = potential_table_lower[:-3]
            elif potential_table_lower.endswith('id'):
                potential_table_lower = potential_table_lower[:-2]
            potential_table_lower = potential_table_lower.lstrip('_')

            # Also try with original case (for patterns like "CustomerId")
            potential_table_original = col.name
            if potential_table_original.endswith('_Id'):
                potential_table_original = potential_table_original[:-3]
            elif potential_table_original.endswith('Id'):
                potential_table_original = potential_table_original[:-2]
            elif potential_table_original.endswith('_id'):
                potential_table_original = potential_table_original[:-3]
            elif potential_table_original.endswith('id'):
                potential_table_original = potential_table_original[:-2]
            potential_table_original = potential_table_original.lstrip('_')

            if not potential_table_lower:
                continue  # Column is literally "id" — skip

            logger.debug(
                "  Potential FK: %s.%s -> table '%s'",
                from_table, col.name, potential_table_lower,
            )

            # --- 3. Match against known tables ---
            found_match = False
            for to_table in table_names:
                if found_match:
                    break

                # Skip self-referencing matches where the FK column
                # is in the same table it would point to
                if to_table == from_table:
                    continue

                to_table_lower = to_table.lower()

                # Try both lower-case and original-case extracted names
                candidates = {potential_table_lower, potential_table_original.lower()}

                for candidate in candidates:
                    if not candidate:
                        continue
                    is_match = (
                        candidate == to_table_lower
                        or candidate + 's' == to_table_lower
                        or candidate + 'es' == to_table_lower
                        or candidate == to_table_lower + 's'
                        or candidate == to_table_lower.rstrip('s')
                    )
                    if not is_match:
                        continue

                    # --- 4. Verify target table has a plausible PK column ---
                    to_columns = table_columns.get(to_table, [])
                    to_col_names_lower = [c.name.lower() for c in to_columns]

                    table_singular = (
                        to_table_lower.rstrip('s')
                        if to_table_lower.endswith('s')
                        else to_table_lower
                    )
                    table_singular_camel = (
                        to_table.rstrip('s')
                        if to_table.endswith('s')
                        else to_table
                    )

                    has_id = (
                        'id' in to_col_names_lower
                        or '_id' in to_col_names_lower
                        or to_table_lower + 'id' in to_col_names_lower
                        or to_table_lower + '_id' in to_col_names_lower
                        or table_singular + 'id' in to_col_names_lower
                        or table_singular + '_id' in to_col_names_lower
                        or any(c.name == to_table + 'Id' for c in to_columns)
                        or any(c.name == table_singular_camel + 'Id' for c in to_columns)
                    )

                    if not has_id:
                        logger.debug(
                            "  Skipping: table '%s' has no suitable PK column", to_table
                        )
                        continue

                    # --- 5. Determine the actual PK column name ---
                    to_col_name = _resolve_pk_column(
                        to_columns, to_col_names_lower,
                        to_table_lower, table_singular,
                    )

                    relationships.append(ForeignKeyRelationship(
                        from_table=from_table,
                        from_columns=[col.name],
                        to_table=to_table,
                        to_columns=[to_col_name],
                        relationship_type='many_to_one',
                    ))
                    logger.info(
                        "Detected FK: %s.%s -> %s.%s",
                        from_table, col.name, to_table, to_col_name,
                    )
                    found_match = True
                    break  # stop checking candidate names for this column

    logger.info("Detected %d foreign key relationships", len(relationships))
    return relationships


# ---- internal helpers --------------------------------------------------------

def _resolve_pk_column(
    to_columns: List[Column],
    to_col_names_lower: List[str],
    to_table_lower: str,
    table_singular: str,
) -> str:
    """Pick the best-matching PK column name, preserving original casing."""
    if 'id' in to_col_names_lower:
        return 'id'
    if '_id' in to_col_names_lower:
        return '_id'

    # Try in order: singular_id, plural_id, singularid, pluralid
    for pattern in (
        table_singular + '_id',
        to_table_lower + '_id',
        table_singular + 'id',
        to_table_lower + 'id',
    ):
        if pattern in to_col_names_lower:
            for c in to_columns:
                if c.name.lower() == pattern:
                    return c.name
            break  # matched lowercase but couldn't find original — fall through

    return 'id'  # safe default
