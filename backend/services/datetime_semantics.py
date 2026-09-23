# Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
"""
Shared DateTime semantics for backend SQL generation.
Encapsulates parts/modes, UTC contract, ISO weekday/week, sub-second modulo guidance,
and date_trunc / EXTRACT mappings per part.
"""

from typing import Dict

DateTimePart = str
DateTimeMode = str

DATETIME_PARTS: Dict[str, DateTimePart] = {
    'year': 'year',
    'month': 'month',
    'week': 'week',
    'day': 'day',
    'weekday': 'weekday',
    'hour': 'hour',
    'minute': 'minute',
    'second': 'second',
    'millisecond': 'millisecond',
    'microsecond': 'microsecond',
    'nanosecond': 'nanosecond',
}

DATETIME_MODES: Dict[str, DateTimeMode] = {
    'distinct': 'distinct',
    'timeline': 'timeline',
}

# date_trunc units for timeline mode
TIMELINE_UNITS: Dict[DateTimePart, str] = {
    'year': 'year',
    'month': 'month',
    'week': 'week',
    'day': 'day',
    'weekday': 'day',  # weekday timeline bins at day resolution
    'hour': 'hour',
    'minute': 'minute',
    'second': 'second',
    'millisecond': 'millisecond',
    'microsecond': 'microsecond',
    'nanosecond': 'nanosecond',
}

# EXTRACT parts for distinct mode (weekday normalized separately; week is ISO 1–53)
DISTINCT_EXTRACT_PART: Dict[DateTimePart, str] = {
    'year': 'YEAR',
    'month': 'MONTH',
    'week': 'WEEK',
    'day': 'DAY',
    'weekday': 'DOW',
    'hour': 'HOUR',
    'minute': 'MINUTE',
    'second': 'SECOND',
    'millisecond': 'MILLISECOND',
    'microsecond': 'MICROSECOND',
    'nanosecond': 'NANOSECOND',
}

# Sub-second parts require modulo for engines that include the seconds component
SUBSECOND_MODULO: Dict[DateTimePart, int] = {
    'millisecond': 1000,
    'microsecond': 1000000,
    'nanosecond': 1000000000,
}


def get_timeline_unit(part: DateTimePart) -> str:
    return TIMELINE_UNITS[part]


def get_distinct_extract_part(part: DateTimePart) -> str:
    return DISTINCT_EXTRACT_PART[part]


def get_modulo(part: DateTimePart):
    return SUBSECOND_MODULO.get(part)


def build_datetime_alias(field: str, part: DateTimePart, mode: DateTimeMode) -> str:
    return f"{field}_{part}_{mode}"


# --------------------------------------------------------------------------- #
# The two rules, each stated exactly once. Mirrored in the frontend by
# resolveDateTime() in frontend/src/datetime/datetimeSemantics.ts.
# --------------------------------------------------------------------------- #

def applies_datetime(date_mode) -> bool:
    """
    Whether datetime handling applies at all -- MODE-only.

    "Full DateTime" carries a mode but no part: the value is the parsed timestamp
    itself. The mode is still required, because it is what triggers parsing a
    text-stored column into a real timestamp. Gating on part AND mode here makes
    the WHERE clause compare the raw source string while the SELECT compares a
    parsed timestamp.
    """
    return bool(date_mode)


def has_derived_alias(date_part) -> bool:
    """
    Whether the column is emitted under a derived alias -- PART-only.

    Full DateTime keeps the plain field name; only an explicit part produces
    "<field>_<part>_<mode>".
    """
    return bool(date_part)


def output_name(field: str, date_part, date_mode) -> str:
    """The output column name a dimension resolves to."""
    if has_derived_alias(date_part):
        return build_datetime_alias(field, date_part, date_mode)
    return field
