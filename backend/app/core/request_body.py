"""Raw request bodies read with a cap, so a client can't make the API hold more than a route takes."""

from __future__ import annotations

from collections.abc import AsyncIterator

from fastapi import HTTPException


async def read_at_most(chunks: AsyncIterator[bytes], limit: int) -> bytes:
    """The whole body, or 413 as soon as it passes `limit` bytes."""
    body = bytearray()
    async for chunk in chunks:
        body += chunk
        if len(body) > limit:
            raise HTTPException(status_code=413, detail=f"At most {limit} bytes a file")
    return bytes(body)
