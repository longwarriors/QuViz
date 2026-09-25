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

A 5xx, a 404 (a request the routes do not know, which can only mean the
enumerator and ``routes.py`` disagree) or a transport exception aborts the run
before ``manifest.json`` exists: a half-built catalogue must not be
publishable. The manifest is the cross-part contract::

    {"format": "quviz-static/1", "version": "<16 hex>", "spec": {...},
     "entries": {"<route?query>": {"file": "files/<24 hex>.json",
                                   "status": 200,
                                   "content_type": "application/json",
                                   "headers": {"x-quviz-...": "..."}}}}
"""

from __future__ import annotations

import hashlib
import json
import os
import re
import time
from collections import Counter
from collections.abc import Callable, Generator, Iterable, Mapping
from concurrent.futures import Future, ProcessPoolExecutor, as_completed
from contextlib import closing
from dataclasses import dataclass
from multiprocessing import get_context
from pathlib import Path
from typing import Any, Final, NamedTuple

from quviz.export.asgi import AsgiGetClient
from quviz.export.catalog_spec import (
    DEFAULT_SPEC,
    SPEC_FORMAT,
    StaticCatalogSpec,
    spec_json_text,
)

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

FILE_HASH_LENGTH: Final = 24
VERSION_LENGTH: Final = 16
MAXIMUM_WORKERS: Final = 32

_REQUEST_KEY: Final = re.compile(r"/api/[!-~]*")
_EXPORTED_FILE: Final = re.compile(r"[0-9a-f]{24}\.(?:json|bin)")
#: Submitted first so the longest jobs never start last; output order is unaffected.
_SLOW_ROUTES: Final = (
    "/api/superposition/current-field",
    "/api/superposition/isosurface",
    "/api/orbitals/isosurface",
    "/api/orbitals/current-field",
)

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


def default_worker_count() -> int:
    """One worker per CPU, at most eight: the pool is memory-bound on 137^3 grids."""

    return max(1, min(8, os.cpu_count() or 1))


class _Replay(NamedTuple):
    """One replayed request, small enough to cross a process boundary."""

    key: str
    status: int
    content_type: str
    headers: tuple[tuple[str, str], ...]
    body: bytes
    seconds: float
    error: str | None


def _replay_with(client: AsgiGetClient, key: str) -> _Replay:
    started = time.perf_counter()
    try:
        response = client.get(key)
    except Exception as error:
        return _Replay(
            key, 0, "", (), b"", time.perf_counter() - started, f"{type(error).__name__}: {error}"
        )
    quviz_headers = tuple(
        sorted((name, value) for name, value in response.headers if name.startswith("x-quviz-"))
    )
    return _Replay(
        key,
        response.status,
        response.content_type,
        quviz_headers,
        response.body,
        time.perf_counter() - started,
        None,
    )


_worker_client: AsgiGetClient | None = None


def _initialise_worker() -> None:
    """Process-pool initializer: one application (one set of LRU caches) per worker."""

    global _worker_client
    _worker_client = AsgiGetClient()


def _replay(key: str) -> _Replay:
    """Process-pool task: replay ``key`` on this worker's application."""

    if _worker_client is None:
        raise RuntimeError("the export worker was not initialised")
    return _replay_with(_worker_client, key)


def _result_or_failure(future: Future[_Replay], key: str) -> _Replay:
    """A crashed or unpicklable worker becomes a transport failure of ``key``."""

    try:
        return future.result()
    except Exception as error:
        return _Replay(key, 0, "", (), b"", 0.0, f"{type(error).__name__}: {error}")


def _submission_order(keys: Iterable[str]) -> list[str]:
    """Slowest routes first, then by key; only scheduling changes, never output."""

    def rank(key: str) -> tuple[int, str]:
        route = key.partition("?")[0]
        position = _SLOW_ROUTES.index(route) if route in _SLOW_ROUTES else len(_SLOW_ROUTES)
        return position, key

    return sorted(keys, key=rank)


def _replay_all(keys: tuple[str, ...], workers: int) -> Generator[_Replay, None, None]:
    """Yield replays as they finish; closing the generator cancels queued work.

    Typed as a ``Generator`` (not an ``Iterator``) because :func:`render`
    wraps it in :func:`contextlib.closing`, which needs ``close()``.

    The pool always uses the ``spawn`` start method, so Windows and Linux
    builds run the same worker bootstrap.
    """

    if workers == 1:
        client = AsgiGetClient()
        for key in keys:
            yield _replay_with(client, key)
        return
    pool = ProcessPoolExecutor(
        max_workers=min(workers, len(keys)),
        mp_context=get_context("spawn"),
        initializer=_initialise_worker,
    )
    try:
        futures = {pool.submit(_replay, key): key for key in _submission_order(keys)}
        for future in as_completed(futures):
            yield _result_or_failure(future, futures[future])
    finally:
        pool.shutdown(wait=True, cancel_futures=True)


def _failure(replay: _Replay) -> str | None:
    """Why ``replay`` must abort the export, or ``None`` when it is publishable."""

    if replay.error is not None:
        return f"{replay.key}: transport failure: {replay.error}"
    if replay.status >= 500:
        return f"{replay.key}: HTTP {replay.status}: {_detail(replay.body)}"
    if replay.status == 404:
        return (
            f"{replay.key}: HTTP 404: no such route (the request enumerator and routes.py disagree)"
        )
    return None


def read_requests(path: Path) -> tuple[str, ...]:
    """Validated request keys of a ``quviz-static-requests/1`` document, in file order."""

    try:
        document = json.loads(path.read_text(encoding="utf-8-sig"))
    except (OSError, ValueError) as error:
        raise StaticExportError(f"cannot read {path}: {error}") from error
    if not isinstance(document, dict) or document.get("format") != REQUESTS_FORMAT:
        raise StaticExportError(f"{path} is not a {REQUESTS_FORMAT} document")
    requests = document.get("requests")
    if not isinstance(requests, list) or not requests:
        raise StaticExportError(f"{path} must list at least one request")
    keys: list[str] = []
    seen: set[str] = set()
    for index, key in enumerate(requests):
        if not isinstance(key, str) or _REQUEST_KEY.fullmatch(key) is None or "#" in key:
            raise StaticExportError(
                f"{path}: requests[{index}] must be an ASCII '/api/...' request without "
                f"spaces or '#', got {key!r}"
            )
        if key in seen:
            raise StaticExportError(f"{path}: requests[{index}] repeats {key!r}")
        seen.add(key)
        keys.append(key)
    return tuple(keys)


def _read_spec(data: Path) -> dict[str, Any]:
    path = data / SPEC_FILE
    try:
        document = json.loads(path.read_text(encoding="utf-8-sig"))
    except (OSError, ValueError) as error:
        raise StaticExportError(
            f"cannot read {path} ({error}); run `quviz export-static plan --out {data}` first"
        ) from error
    if not isinstance(document, dict) or document.get("format") != SPEC_FORMAT:
        raise StaticExportError(f"{path} is not a {SPEC_FORMAT} document")
    return document


def _clear_exported_files(directory: Path) -> None:
    """Remove bodies an earlier render wrote, so ``files/`` holds exactly this manifest's."""

    if not directory.is_dir():
        return
    for child in directory.iterdir():
        if child.is_file() and _EXPORTED_FILE.fullmatch(child.name):
            child.unlink()


def _store_body(directory: Path, body: bytes, content_type: str, written: dict[str, int]) -> str:
    """Write ``body`` once under its content hash and return the file name."""

    media_type = content_type.split(";", 1)[0].strip().lower()
    suffix = ".json" if media_type == "application/json" else ".bin"
    name = f"{hashlib.sha256(body).hexdigest()[:FILE_HASH_LENGTH]}{suffix}"
    path = directory / name
    if name in written:
        if path.read_bytes() != body:
            raise StaticExportError(
                f"content-hash prefix collision on {name}; lengthen FILE_HASH_LENGTH"
            )
        return name
    path.write_bytes(body)
    written[name] = len(body)
    return name


def manifest_version(entries: Mapping[str, Mapping[str, Any]]) -> str:
    """First 16 hex digits of SHA-256 over the sorted ``(key, file, status)`` triples.

    Each triple is hashed as the UTF-8 line ``key``, TAB, ``file``, TAB,
    ``status``, LF. Keys are validated ASCII without whitespace, so the
    encoding is unambiguous.
    """

    digest = hashlib.sha256()
    triples = sorted(
        (key, str(entry["file"]), int(entry["status"])) for key, entry in entries.items()
    )
    for key, file, status in triples:
        digest.update(f"{key}\t{file}\t{status}\n".encode())
    return digest.hexdigest()[:VERSION_LENGTH]


def _write_text_atomically(path: Path, text: str) -> None:
    temporary = path.with_name(f"{path.name}.tmp")
    temporary.write_text(text, encoding="utf-8", newline="\n")
    os.replace(temporary, path)


@dataclass(frozen=True, slots=True)
class RenderSummary:
    """What :func:`render` wrote."""

    version: str
    entries: int
    files: int
    total_bytes: int
    status_counts: dict[int, int]
    route_seconds: dict[str, float]


def render(
    data: Path,
    requests: Path,
    *,
    workers: int = 1,
    log: ProgressLog = _silent,
) -> RenderSummary:
    """Replay ``requests`` into ``data/files/`` and write ``data/manifest.json``.

    Each entry key is the request string copied verbatim from ``requests``.
    Bodies are stored once per distinct content (``files/<sha256[:24]>`` with
    ``.json`` for ``application/json`` and ``.bin`` otherwise); only the
    lower-cased ``x-quviz-*`` headers are kept, because GitHub Pages cannot send
    them and the QVPC parser needs them. Entries are written in key order and
    file names come from content, so the output does not depend on ``workers``.

    The full v1 specification is about 1.2k requests: an estimated 9-10 minutes
    in one process, dominated by superposition current-field frames (2-25 s
    each), and about 1.5-2 minutes with eight workers.
    """

    if not 1 <= workers <= MAXIMUM_WORKERS:
        raise ValueError(f"workers must lie in 1..{MAXIMUM_WORKERS}, got {workers}")
    keys = read_requests(requests)
    spec = _read_spec(data)
    files = data / FILES_DIRECTORY
    manifest_path = data / MANIFEST_FILE
    manifest_path.unlink(missing_ok=True)
    _clear_exported_files(files)
    files.mkdir(parents=True, exist_ok=True)
    log(f"export-static render: {len(keys)} requests, {workers} worker(s), data={data}")

    entries: dict[str, dict[str, Any]] = {}
    written: dict[str, int] = {}
    route_counts: Counter[str] = Counter()
    route_seconds: dict[str, float] = {}
    status_counts: Counter[int] = Counter()
    width = len(str(len(keys)))
    started = time.perf_counter()
    with closing(_replay_all(keys, workers)) as replays:
        for replay in replays:
            failure = _failure(replay)
            if failure is not None:
                raise StaticExportError(
                    f"aborted after {len(entries)} of {len(keys)} requests; "
                    f"no manifest was written.\n  {failure}"
                )
            name = _store_body(files, replay.body, replay.content_type, written)
            entries[replay.key] = {
                "file": f"{FILES_DIRECTORY}/{name}",
                "status": replay.status,
                "content_type": replay.content_type,
                "headers": dict(replay.headers),
            }
            route = replay.key.partition("?")[0]
            route_counts[route] += 1
            route_seconds[route] = route_seconds.get(route, 0.0) + replay.seconds
            status_counts[replay.status] += 1
            log(
                f"[{len(entries):>{width}}/{len(keys)}] {replay.status} "
                f"{replay.seconds:7.2f}s {replay.key}"
            )

    ordered = {key: entries[key] for key in sorted(entries)}
    version = manifest_version(ordered)
    manifest = {"format": MANIFEST_FORMAT, "version": version, "spec": spec, "entries": ordered}
    _write_text_atomically(
        manifest_path, json.dumps(manifest, ensure_ascii=False, separators=(",", ":")) + "\n"
    )
    for route in sorted(route_counts):
        log(f"  {route}: {route_counts[route]} requests, {route_seconds[route]:.1f}s compute")
    log(
        f"  status counts: {dict(sorted(status_counts.items()))}; "
        f"wall time {time.perf_counter() - started:.1f}s"
    )
    total_bytes = sum(written.values())
    log(
        f"manifest.json: version {version}, {len(ordered)} entries, "
        f"{len(written)} files, {total_bytes} bytes"
    )
    return RenderSummary(
        version=version,
        entries=len(ordered),
        files=len(written),
        total_bytes=total_bytes,
        status_counts=dict(status_counts),
        route_seconds=dict(route_seconds),
    )
