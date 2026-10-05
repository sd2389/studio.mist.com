"""Timestamps as the API answers them: in UTC, and saying so.

The schema stores naive datetime.utcnow() values. Written as they are, they carry no zone and a
browser reads them as its own local time. A field typed UTCDateTime is written with a Z.
"""

from datetime import UTC, datetime
from typing import Annotated

from pydantic import PlainSerializer


def utc_isoformat(value: datetime) -> str:
    """ISO 8601 in UTC, with a Z. A naive datetime is UTC, as every one the schema stores is."""
    aware = value.replace(tzinfo=UTC) if value.tzinfo is None else value.astimezone(UTC)
    return aware.isoformat().replace("+00:00", "Z")


UTCDateTime = Annotated[datetime, PlainSerializer(utc_isoformat, return_type=str, when_used="json")]
