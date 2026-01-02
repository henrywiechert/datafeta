"""
Shared DateTime semantics for backend SQL generation.
Encapsulates parts/modes, UTC contract, ISO weekday, sub-second modulo guidance,
and date_trunc / EXTRACT mappings per part.
"""

from typing import Dict

DateTimePart = str
DateTimeMode = str

DATETIME_PARTS: Dict[str, DateTimePart] = {
    'year': 'year',
    'month': 'month',
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
    'day': 'day',
    'weekday': 'day',  # weekday timeline bins at day resolution
    'hour': 'hour',
    'minute': 'minute',
    'second': 'second',
    'millisecond': 'millisecond',
    'microsecond': 'microsecond',
    'nanosecond': 'nanosecond',
}

# EXTRACT parts for distinct mode (weekday normalized separately)
DISTINCT_EXTRACT_PART: Dict[DateTimePart, str] = {
    'year': 'YEAR',
    'month': 'MONTH',
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
