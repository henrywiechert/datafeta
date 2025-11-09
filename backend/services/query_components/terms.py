"""Custom PyPika term helpers used by QueryService and related builders."""

from typing import Optional

from pypika.terms import Term


class ExtractTerm(Term):
    """Custom pypika term for EXTRACT(part FROM field) syntax."""

    def __init__(self, part: str, field: Term):
        super().__init__()
        self.part = part
        self.field = field

    def get_sql(self, **kwargs) -> str:
        """Render as EXTRACT(part FROM field) with optional alias."""
        field_sql = self.field.get_sql(**kwargs)
        sql = f"EXTRACT({self.part} FROM {field_sql})"

        if hasattr(self, "alias") and self.alias:
            quote_char = kwargs.get("quote_char", '"')
            sql = f"{sql} {quote_char}{self.alias}{quote_char}"

        return sql


class UnquotedField(Term):
    """Custom pypika term for referencing aliases without quotes in ORDER BY."""

    def __init__(self, name: str):
        super().__init__()
        self.name = name

    def get_sql(self, **kwargs) -> str:
        """Return the field name without quotes."""
        return self.name


class QuotedField(Term):
    """Custom pypika term for referencing aliases with quotes in ORDER BY."""

    def __init__(self, name: str):
        super().__init__()
        self.name = name

    def get_sql(self, **kwargs) -> str:
        """Return the field name with quotes (handles spaces and special characters)."""
        quote_char = kwargs.get("quote_char", '"')
        return f"{quote_char}{self.name}{quote_char}"


class CastField(Term):
    """Custom pypika term for CAST(field AS type) with optional string replacement."""

    def __init__(self, field: Term, cast_type: str, replacement_pattern: Optional[str] = None):
        super().__init__()
        self.field = field
        self.cast_type = cast_type
        self.replacement_pattern = replacement_pattern

    def get_sql(self, **kwargs) -> str:
        """Render as CAST(REPLACE(field, pattern, '') AS type) or CAST(field AS type)."""
        field_sql = self.field.get_sql(**kwargs)

        if self.replacement_pattern:
            pattern_escaped = self.replacement_pattern.replace("'", "''")
            sql = f"CAST(REPLACE({field_sql}, '{pattern_escaped}', '') AS {self.cast_type})"
        else:
            sql = f"CAST({field_sql} AS {self.cast_type})"

        if hasattr(self, "alias") and self.alias:
            quote_char = kwargs.get("quote_char", '"')
            sql = f"{sql} {quote_char}{self.alias}{quote_char}"

        return sql
