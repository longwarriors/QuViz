"""Replay the scene API into a static, content-addressed catalogue.

Three steps, split so the browser's own request formation sits in the middle:

1. :func:`plan` writes both catalogue responses and ``spec.json``;
2. ``web/tools/static-requests.ts`` expands them into ``requests.json`` with the
   same request builders the live client uses;
3. :func:`render` replays every request through the ASGI application and
   writes one file per distinct response body plus ``manifest.json``.

Every stored body is the exact byte string a live ``quviz serve`` answers
with, scientific refusals (422 with a ``detail``) included, so the static site
shows the server's own reasons.
"""

from __future__ import annotations

import json
from collections.abc import Callable
from pathlib import Path
from typing import Final

from quviz.export.asgi import AsgiGetClient
from quviz.export.catalog_spec import DEFAULT_SPEC, StaticCatalogSpec, spec_json_text

MANIFEST_FORMAT: Final = "quviz-static/1"
REQUESTS_FORMAT: Final = "quviz-static-requests/1"
ORBITAL_CATALOG_ROUTE: Final = "/api/orbitals/catalog"
SUPERPOSITION_CATALOG_ROUTE: Final = "/api/superposition/catalog"
ORBITAL_CATALOG_FILE: Final = "catalog-orbitals.json"
SUPERPOSITION_CATALOG_FILE: Final = "catalog-superpositions.json"
SPEC_FILE: Final = "spec.json"
REQUESTS_FILE: Final = "requests.json"
MANIFEST_FILE: Final = "manifest.json"
FILES_DIRECTORY: Final = "files"

type ProgressLog = Callable[[str], None]


class StaticExportError(RuntimeError):
    """The catalogue could not be exported faithfully; nothing publishable was written."""


def _silent(message: str) -> None:
    """Discard progress messages (the library default)."""


def _detail(body: bytes) -> str:
    """A short, printable excerpt of a response body for an error message."""

    text = body.decode("utf-8", errors="replace").strip()
    return text if len(text) <= 240 else f"{text[:240]}..."


def plan(
    out: Path,
    *,
    spec: StaticCatalogSpec = DEFAULT_SPEC,
    client: AsgiGetClient | None = None,
    log: ProgressLog = _silent,
) -> tuple[Path, ...]:
    """Write both catalogue responses verbatim and ``spec.json`` into ``out``.

    The catalogue files are the exact bytes of ``GET /api/orbitals/catalog`` and
    ``GET /api/superposition/catalog``. The specification is checked against
    the published superposition catalogue before anything is written, so a
    preset the server no longer publishes fails here instead of turning into
    silent static misses later.
    """

    asgi = client if client is not None else AsgiGetClient()
    bodies: dict[str, bytes] = {}
    for route in (ORBITAL_CATALOG_ROUTE, SUPERPOSITION_CATALOG_ROUTE):
        response = asgi.get(route)
        if response.status != 200:
            raise StaticExportError(
                f"{route} answered HTTP {response.status}: {_detail(response.body)}"
            )
        bodies[route] = response.body
    published = {str(entry["id"]) for entry in json.loads(bodies[SUPERPOSITION_CATALOG_ROUTE])}
    missing = [preset for preset in spec.superpositions.presets if preset not in published]
    if missing:
        raise StaticExportError(
            "the specification names superposition presets the server does not publish: "
            f"{missing}; published: {sorted(published)}"
        )

    out.mkdir(parents=True, exist_ok=True)
    targets = (
        (out / ORBITAL_CATALOG_FILE, bodies[ORBITAL_CATALOG_ROUTE]),
        (out / SUPERPOSITION_CATALOG_FILE, bodies[SUPERPOSITION_CATALOG_ROUTE]),
        (out / SPEC_FILE, spec_json_text(spec).encode("utf-8")),
    )
    for path, payload in targets:
        path.write_bytes(payload)
        log(f"wrote {path} ({len(payload)} bytes)")
    return tuple(path for path, _ in targets)
