"""The exporter's in-process ASGI client must answer exactly like the live app.

``quviz export-static render`` stores whatever this client returns, so any
difference from what ``TestClient`` (and therefore uvicorn) serves would ship to
GitHub Pages. Each case compares status, body bytes and the lower-cased header
list against the dev-only ``TestClient``.
"""

from __future__ import annotations

from typing import Any

import pytest
from fastapi.testclient import TestClient

from quviz.api import routes as routes_module
from quviz.api.app import create_app
from quviz.export.asgi import AsgiGetClient

live = TestClient(create_app(mount_frontend=False))
replay = AsgiGetClient()

POINT_CLOUD = "/api/orbitals/point-cloud?n=2&l=1&m=0&z=1&basis=real&samples=1000&seed=7"
ISOSURFACE = (
    "/api/orbitals/isosurface?n=1&l=0&m=0&z=1&basis=real&resolution=49&probability_mass=0.8"
)
REFUSED = "/api/orbitals/metadata?n=2&l=1&m=2&z=1&basis=real"
VALIDATION_REFUSED = "/api/orbitals/metadata?n=0&l=0&m=0&z=1&basis=real"
ENCODED_SUPERPOSITION = (
    "/api/superposition/slice?terms=1%2C0%2C0%2C0.7071067811865476%3B2%2C1%2C0%2C0.7071067811865476"
    "&time=3.6&basis=complex&z=1&a_mu=1&resolution=65&plane=xz&observable=phase"
)


@pytest.mark.parametrize(
    "target", [POINT_CLOUD, ISOSURFACE, REFUSED, VALIDATION_REFUSED, ENCODED_SUPERPOSITION]
)
def test_replay_is_byte_identical_to_the_test_client(target: str) -> None:
    ours = replay.get(target)
    theirs = live.get(target)

    assert ours.status == theirs.status_code
    assert ours.body == theirs.content
    assert sorted(ours.headers) == sorted(theirs.headers.multi_items())
    assert ours.content_type == theirs.headers["content-type"]


def test_the_qvpc_headers_survive_and_lookup_is_case_insensitive() -> None:
    response = replay.get(POINT_CLOUD)
    assert response.status == 200
    assert response.header("X-QuViz-Format") == "QVPC/1"
    assert response.header("x-quviz-radial-mass") is not None
    assert response.header("x-no-such-header") is None


@pytest.mark.parametrize(
    "target", ["api/orbitals/catalog", "/api/orbitals/catalog#frag", "/api/x?label=ψ"]
)
def test_targets_must_be_absolute_ascii_paths_without_fragments(target: str) -> None:
    with pytest.raises(ValueError, match="target must be"):
        replay.get(target)


def test_a_server_exception_reaches_the_caller(monkeypatch: pytest.MonkeyPatch) -> None:
    def broken(*args: object, **kwargs: object) -> None:
        raise AssertionError("programming sentinel")

    monkeypatch.setattr(routes_module, "_point_cloud_bytes", broken)
    with pytest.raises(AssertionError, match="programming sentinel"):
        AsgiGetClient().get(POINT_CLOUD)


def test_an_application_that_never_answers_is_an_error() -> None:
    async def silent(scope: Any, receive: Any, send: Any) -> None:
        return None

    with pytest.raises(RuntimeError, match="without starting an HTTP response"):
        AsgiGetClient(silent).get("/anything")


def test_scope_and_a_streamed_body_follow_the_asgi_http_protocol() -> None:
    seen: dict[str, Any] = {}

    async def streamed(scope: Any, receive: Any, send: Any) -> None:
        seen.update(scope)
        assert (await receive())["type"] == "http.request"
        await send(
            {
                "type": "http.response.start",
                "status": 207,
                "headers": [(b"Content-Type", b"text/plain"), (b"X-QuViz-Test", b"1")],
            }
        )
        await send({"type": "http.response.body", "body": b"ab", "more_body": True})
        await send({"type": "http.response.body", "body": b"cd"})
        seen["after"] = (await receive())["type"]

    response = AsgiGetClient(streamed).get("/api/demo%20path?a=1&b=x%2Cy")

    assert response.status == 207
    assert response.body == b"abcd"
    assert response.headers == (("content-type", "text/plain"), ("x-quviz-test", "1"))
    assert seen["method"] == "GET"
    assert seen["path"] == "/api/demo path"
    assert seen["raw_path"] == b"/api/demo%20path"
    assert seen["query_string"] == b"a=1&b=x%2Cy"
    assert seen["after"] == "http.disconnect"
