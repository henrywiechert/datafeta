# Copyright (c) 2024-2026 Henry Wiechert (datafeta.io). SPDX-License-Identifier: AGPL-3.0-only
"""InfluxQL over HTTP for InfluxDB 1.8 and 2.x.

Both versions answer InfluxQL on ``POST /query``: 1.8 natively, 2.x through its
v1 compatibility API (a bucket is reachable once it has a DBRP mapping). This
module holds the HTTP client, the connection settings shared by the connect
form and the pre-connect discovery endpoints, and schema discovery.
"""
from __future__ import annotations

import json
import logging
import re
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, Iterator, List, Literal, Optional, Set, Tuple

import requests
from pydantic import BaseModel, model_validator

from backend.exceptions import DataSourceConnectionError, InvalidInputError

logger = logging.getLogger(__name__)

# Connect timeout, then the longest wait between two received bytes; data
# pulls stream, so the read timeout bounds a stall rather than the whole load.
_TIMEOUT = (10, 300)
_CHUNK_SIZE = 10_000  # points per response chunk
_READ_SIZE = 1 << 20  # bytes per socket read while streaming

# Relative "last N" windows accept whole units InfluxQL understands.
_DURATION_RE = re.compile(r"^[1-9]\d*(s|m|h|d|w)$")

INFLUX_FIELD_TYPES = ("float", "integer", "unsigned", "boolean", "string")


def quote_ident(name: str) -> str:
    """Quote an InfluxQL identifier (measurement, tag or field key)."""
    return '"' + name.replace("\\", "\\\\").replace('"', '\\"') + '"'


def _parse_utc(value: str, label: str) -> datetime:
    try:
        parsed = datetime.fromisoformat(value.strip())
    except ValueError:
        raise ValueError(f"{label} must be an ISO 8601 date/time, got {value!r}")
    # Influx stores UTC; a value without an offset is read as UTC.
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def _epoch_ns(moment: datetime) -> int:
    delta = moment - datetime(1970, 1, 1, tzinfo=timezone.utc)
    return (delta.days * 86_400 + delta.seconds) * 1_000_000_000 + delta.microseconds * 1_000


class InfluxDbServerConfig(BaseModel):
    """Where and how to reach an InfluxDB server."""

    influx_url: str
    influx_auth: Literal["none", "basic", "token"] = "none"
    influx_username: Optional[str] = None
    influx_password: Optional[str] = None
    influx_token: Optional[str] = None
    influx_verify_ssl: bool = True

    @model_validator(mode="before")
    @classmethod
    def _defaults_for_unset(cls, data: Any) -> Any:
        # ConnectionDetails carries every connector's fields, unset ones as None.
        if isinstance(data, dict):
            return {key: value for key, value in data.items() if value is not None}
        return data

    @model_validator(mode="after")
    def _validate_server(self):
        url = (self.influx_url or "").strip().rstrip("/")
        if not re.match(r"^https?://[^/\s]+", url):
            raise ValueError("InfluxDB URL must start with http:// or https:// (e.g. http://localhost:8086)")
        self.influx_url = url
        if self.influx_auth == "basic" and not self.influx_username:
            raise ValueError("A username is required for username/password authentication")
        if self.influx_auth == "token" and not self.influx_token:
            raise ValueError("A token is required for token authentication")
        return self

    def client(self) -> "InfluxQLClient":
        return InfluxQLClient(
            url=self.influx_url,
            auth=self.influx_auth,
            username=self.influx_username,
            password=self.influx_password,
            token=self.influx_token,
            verify_ssl=self.influx_verify_ssl,
        )


class InfluxDbConfig(InfluxDbServerConfig):
    """Connector config: server, database, measurements and the time window to load."""

    influx_database: str
    # None loads every measurement in the database.
    influx_measurements: Optional[List[str]] = None
    influx_time_mode: Literal["all", "last", "between"] = "all"
    influx_last: Optional[str] = None  # e.g. "7d"
    influx_start: Optional[str] = None  # ISO 8601, UTC when no offset is given
    influx_end: Optional[str] = None

    @model_validator(mode="after")
    def _validate_selection(self):
        self.influx_database = (self.influx_database or "").strip()
        if not self.influx_database:
            raise ValueError("An InfluxDB database is required")
        if self.influx_measurements is not None and not self.influx_measurements:
            raise ValueError("Select at least one measurement")
        if self.influx_time_mode == "last":
            if not self.influx_last or not _DURATION_RE.match(self.influx_last.strip()):
                raise ValueError("'Last' time range needs a duration like 30m, 12h, 7d or 4w")
            self.influx_last = self.influx_last.strip()
        if self.influx_time_mode == "between":
            if not self.influx_start:
                raise ValueError("'Between' time range needs a start date/time")
            start = _parse_utc(self.influx_start, "Start")
            if self.influx_end:
                end = _parse_utc(self.influx_end, "End")
                if end <= start:
                    raise ValueError("End of the time range must be after its start")
        return self

    def time_condition(self) -> Optional[str]:
        """The InfluxQL WHERE condition for the configured window (None = all time)."""
        if self.influx_time_mode == "last":
            return f"time >= now() - {self.influx_last}"
        if self.influx_time_mode == "between":
            condition = f"time >= {_epoch_ns(_parse_utc(self.influx_start, 'Start'))}"
            if self.influx_end:
                condition += f" AND time < {_epoch_ns(_parse_utc(self.influx_end, 'End'))}"
            return condition
        return None


@dataclass
class MeasurementSchema:
    name: str
    tags: List[str] = field(default_factory=list)
    # field key -> every type it was written with (several across shards)
    fields: Dict[str, Set[str]] = field(default_factory=dict)


class InfluxQLClient:
    """Minimal InfluxQL client over the HTTP ``/query`` endpoint."""

    def __init__(
        self,
        url: str,
        auth: str = "none",
        username: Optional[str] = None,
        password: Optional[str] = None,
        token: Optional[str] = None,
        verify_ssl: bool = True,
        session: Optional[requests.Session] = None,
    ) -> None:
        self.url = url.rstrip("/")
        self._session = session or requests.Session()
        self._session.verify = verify_ssl
        if auth == "basic":
            self._session.auth = (username or "", password or "")
        elif auth == "token":
            self._session.headers["Authorization"] = f"Token {token}"

    def close(self) -> None:
        self._session.close()

    # ----- Requests -----
    def _post(self, data: Dict[str, Any], stream: bool = False) -> requests.Response:
        try:
            response = self._session.post(
                f"{self.url}/query", data=data, stream=stream, timeout=_TIMEOUT
            )
        except requests.exceptions.SSLError as e:
            raise _tls_error(self.url, e)
        except requests.exceptions.RequestException as e:
            raise _unreachable(self.url, e)

        if response.status_code in (401, 403):
            raise DataSourceConnectionError(
                f"InfluxDB rejected the credentials ({response.status_code}): {_error_text(response)}"
            )
        if response.status_code == 404:
            raise DataSourceConnectionError(
                f"No InfluxQL endpoint at {self.url}/query. Check the URL (InfluxDB listens on port 8086 by default)."
            )
        if response.status_code >= 400:
            raise DataSourceConnectionError(
                f"InfluxDB returned HTTP {response.status_code}: {_error_text(response)}"
            )
        return response

    def ping(self) -> Optional[str]:
        """Return the server version, or None when the server does not report one."""
        try:
            response = self._session.get(f"{self.url}/ping", timeout=_TIMEOUT)
        except requests.exceptions.SSLError as e:
            raise _tls_error(self.url, e)
        except requests.exceptions.RequestException as e:
            raise _unreachable(self.url, e)
        if response.status_code >= 400 and response.status_code not in (401, 403):
            raise DataSourceConnectionError(
                f"InfluxDB ping failed with HTTP {response.status_code}. Check the URL."
            )
        return response.headers.get("X-Influxdb-Version")

    def query(self, statement: str, database: Optional[str] = None) -> List[Dict[str, Any]]:
        """Run one statement and return its series (an empty list when there are none)."""
        data = {"q": statement}
        if database:
            data["db"] = database
        response = self._post(data)
        try:
            payload = response.json()
        except ValueError:
            raise DataSourceConnectionError(
                f"InfluxDB at {self.url} answered with something other than JSON. Is this an InfluxDB server?"
            )
        return _series_of(payload)

    def stream_select(self, statement: str, database: str) -> Iterator[Tuple[List[str], List[List[Any]]]]:
        """Run a SELECT in chunked mode, yielding (columns, rows) per chunk.

        Chunked responses are not subject to the server's ``max-row-limit``, so a
        large result arrives complete instead of being silently cut off.
        """
        response = self._post(
            {
                "q": statement,
                "db": database,
                "epoch": "ns",
                "chunked": "true",
                "chunk_size": str(_CHUNK_SIZE),
            },
            stream=True,
        )
        with response:
            # Each chunk arrives as one long JSON line; requests' default 512-byte
            # reads re-copy it hundreds of times (6x slower on 1M points).
            for line in response.iter_lines(chunk_size=_READ_SIZE, delimiter=b"\n"):
                if not line.strip():
                    continue
                try:
                    payload = json.loads(line)
                except ValueError:
                    raise DataSourceConnectionError("InfluxDB sent a malformed response chunk")
                for series in _series_of(payload):
                    yield series.get("columns") or [], series.get("values") or []


def _tls_error(url: str, error: Exception) -> DataSourceConnectionError:
    return DataSourceConnectionError(
        f"TLS error talking to InfluxDB at {url}: {error}. "
        "For a self-signed certificate, turn off certificate verification."
    )


def _unreachable(url: str, error: Exception) -> DataSourceConnectionError:
    if isinstance(error, requests.exceptions.Timeout):
        reason = "the request timed out"
    elif isinstance(error, requests.exceptions.ConnectionError):
        reason = "the connection failed. Check the URL and that the server is running"
    else:
        reason = str(error)
    return DataSourceConnectionError(f"Could not reach InfluxDB at {url}: {reason}")


def _error_text(response: requests.Response) -> str:
    try:
        payload = response.json()
    except ValueError:
        return (response.text or "").strip()[:200] or response.reason
    if isinstance(payload, dict):
        return str(payload.get("error") or payload.get("message") or payload)[:200]
    return str(payload)[:200]


def _series_of(payload: Any) -> List[Dict[str, Any]]:
    if not isinstance(payload, dict):
        raise DataSourceConnectionError("Unexpected InfluxDB response")
    if payload.get("error"):
        raise DataSourceConnectionError(f"InfluxDB error: {payload['error']}")
    series: List[Dict[str, Any]] = []
    for result in payload.get("results") or []:
        if result.get("error"):
            raise DataSourceConnectionError(f"InfluxDB error: {result['error']}")
        series.extend(result.get("series") or [])
    return series


# ----- Discovery -----
def list_databases(client: InfluxQLClient) -> List[str]:
    """User databases (2.x: buckets with a DBRP mapping); system ones are hidden."""
    names = [
        str(row[0])
        for series in client.query("SHOW DATABASES")
        for row in series.get("values") or []
        if row
    ]
    return sorted(name for name in names if not name.startswith("_"))


def describe_measurements(client: InfluxQLClient, database: str) -> List[MeasurementSchema]:
    """Every measurement with its tag and field keys, read without touching any points."""
    schemas: Dict[str, MeasurementSchema] = {
        str(row[0]): MeasurementSchema(name=str(row[0]))
        for series in client.query("SHOW MEASUREMENTS", database)
        for row in series.get("values") or []
        if row
    }
    if not schemas:
        raise InvalidInputError(
            f"InfluxDB database '{database}' was not found or has no measurements. "
            "On InfluxDB 2.x the bucket needs a DBRP mapping to be queryable with InfluxQL."
        )

    for series in client.query("SHOW FIELD KEYS", database):
        schema = schemas.get(series.get("name"))
        if schema is None:
            continue
        for key, field_type in series.get("values") or []:
            schema.fields.setdefault(str(key), set()).add(str(field_type))

    for series in client.query("SHOW TAG KEYS", database):
        schema = schemas.get(series.get("name"))
        if schema is None:
            continue
        schema.tags = sorted(str(row[0]) for row in series.get("values") or [] if row)

    # A measurement without field keys holds no points (e.g. after a DELETE).
    return [schemas[name] for name in sorted(schemas) if schemas[name].fields]
