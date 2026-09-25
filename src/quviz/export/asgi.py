"""A minimal in-process ASGI ``GET`` client for replaying the scene API.

The static exporter must store exactly the bytes a live ``quviz serve``
answers with -- status, body and the ``X-QuViz-*`` headers the QVPC parser
requires. Driving the ASGI application in-process gives that byte identity
without a socket or a server, and without ``httpx``, which is only a
development dependency: a runtime command must not import it.

Only what the exporter needs is implemented: ``GET`` with an optional query,
no request body, one response. Header names come back lower-cased, the way
Starlette writes them and the manifest stores them.
"""

from __future__ import annotations

import asyncio
from collections.abc import Awaitable, Callable, MutableMapping
from dataclasses import dataclass, field
from typing import Any, Final
from urllib.parse import unquote

from quviz.api.app import create_app

type Scope = MutableMapping[str, Any]
type Message = MutableMapping[str, Any]
type Receive = Callable[[], Awaitable[Message]]
type Send = Callable[[Message], Awaitable[None]]
type AsgiApp = Callable[[Scope, Receive, Send], Awaitable[None]]

_HOST: Final = "quviz-export"


@dataclass(frozen=True, slots=True)
class AsgiResponse:
    """One complete HTTP response: status, lower-cased headers in wire order, body."""

    status: int
    headers: tuple[tuple[str, str], ...]
    body: bytes

    def header(self, name: str) -> str | None:
        """The first value of header ``name`` (case-insensitive), or ``None``."""

        wanted = name.lower()
        return next((value for key, value in self.headers if key == wanted), None)

    @property
    def content_type(self) -> str:
        """The ``content-type`` header, or ``""`` when the response has none."""

        return self.header("content-type") or ""


@dataclass(slots=True)
class _Collected:
    status: int | None = None
    headers: list[tuple[str, str]] = field(default_factory=list)
    chunks: list[bytes] = field(default_factory=list)


class AsgiGetClient:
    """Issue ``GET route?query`` against an ASGI application, in this process.

    ``app`` defaults to ``create_app(mount_frontend=False)`` -- the application
    the API tests and the OpenAPI fixture use -- so whether ``web/dist`` exists
    cannot change a replayed response.
    """

    def __init__(self, app: AsgiApp | None = None) -> None:
        self._app: AsgiApp = app if app is not None else create_app(mount_frontend=False)

    def get(self, target: str) -> AsgiResponse:
        """Replay ``target`` (``/path`` or ``/path?query``, ASCII, percent-encoded).

        The query string is passed through byte for byte, so the application
        parses exactly the key the browser sends. An exception the application
        raises after answering (Starlette re-raises server errors) propagates.
        """

        if not target.startswith("/") or "#" in target:
            raise ValueError(
                f"target must be an absolute path with an optional query, got {target!r}"
            )
        path, _, query = target.partition("?")
        try:
            raw_path = path.encode("ascii")
            query_string = query.encode("ascii")
        except UnicodeEncodeError as error:
            raise ValueError(
                f"target must be ASCII (percent-encode it first), got {target!r}"
            ) from error
        scope: Scope = {
            "type": "http",
            "asgi": {"version": "3.0", "spec_version": "2.3"},
            "http_version": "1.1",
            "method": "GET",
            "scheme": "http",
            "path": unquote(path),
            "raw_path": raw_path,
            "root_path": "",
            "query_string": query_string,
            "headers": [(b"host", _HOST.encode("ascii"))],
            "client": ("127.0.0.1", 0),
            "server": (_HOST, 80),
            "extensions": {},
            "state": {},
        }
        return asyncio.run(self._exchange(scope))

    async def _exchange(self, scope: Scope) -> AsgiResponse:
        collected = _Collected()
        finished = asyncio.Event()
        request_delivered = False

        async def receive() -> Message:
            nonlocal request_delivered
            if not request_delivered:
                request_delivered = True
                return {"type": "http.request", "body": b"", "more_body": False}
            await finished.wait()
            return {"type": "http.disconnect"}

        async def send(message: Message) -> None:
            if message["type"] == "http.response.start":
                collected.status = int(message["status"])
                collected.headers.extend(
                    (bytes(name).decode("latin-1").lower(), bytes(value).decode("latin-1"))
                    for name, value in message.get("headers", ())
                )
            elif message["type"] == "http.response.body":
                collected.chunks.append(bytes(message.get("body", b"")))
                if not message.get("more_body", False):
                    finished.set()

        await self._app(scope, receive, send)
        if collected.status is None:
            raise RuntimeError(f"{scope['path']} returned without starting an HTTP response")
        return AsgiResponse(
            status=collected.status,
            headers=tuple(collected.headers),
            body=b"".join(collected.chunks),
        )
