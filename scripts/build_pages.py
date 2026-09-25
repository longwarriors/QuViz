"""Assemble the GitHub Pages site -- lab, precomputed data and textbook -- in build/pages/.

Run from anywhere; every step anchors itself on this checkout::

    uv run --locked --no-sync python scripts/build_pages.py [--site-url URL] [--workers N]
                                                           [--skip-data] [--serve PORT]

Layout (design/specs/2026-09-25-pages-textbook-lab-design.md, D1): the lab SPA at the
site root, the MkDocs textbook under ``learn/`` and the precomputed scene catalog under
``data/``. The local build plus the ``--serve`` preview is the release verdict;
.github/workflows/pages.yml only re-runs this script and deploys what it wrote.

Standard library only. The file is ruff-checked; mypy's ``packages`` is ``quviz`` only,
so tests/test_build_pages.py imports it directly and pins every decision it makes.
"""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import NamedTuple
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parents[1]

#: GitHub Pages refuses a published site above 1 GB.
PAGES_SITE_LIMIT_BYTES = 1_000_000_000

#: ``theme.name`` and ``theme.custom_dir`` in mkdocs.yml. MkDocs resolves ``custom_dir``
#: -- like ``docs_dir`` and ``watch`` -- against the directory of the config file it was
#: GIVEN, so the generated build/mkdocs.pages.yml restates both as absolute values.
#: tests/test_build_pages.py fails when mkdocs.yml stops declaring either one.
THEME_NAME = "material"
THEME_CUSTOM_DIR = "overrides"

#: Where textbook figures find the lab on Pages: learn/ is one level below the site root.
PAGES_LAB_URL = "../"

#: Content types the preview server sends. Explicit rather than ``mimetypes``: on Windows
#: that module reads the registry, which maps ``.js`` to ``text/plain`` on some machines.
CONTENT_TYPES: dict[str, str] = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".mjs": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json",
    ".map": "application/json",
    ".bin": "application/octet-stream",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".ico": "image/x-icon",
    ".woff2": "font/woff2",
    ".woff": "font/woff",
    ".xml": "application/xml",
    ".gz": "application/gzip",
    ".txt": "text/plain; charset=utf-8",
}

_GITHUB_REMOTE = re.compile(
    r"^(?:git@github\.com:|ssh://git@github\.com/|https://(?:[^@/]+@)?github\.com/)"
    r"(?P<owner>[A-Za-z0-9-]+)/(?P<repo>[A-Za-z0-9._-]+?)(?:\.git)?/?$"
)


class BuildError(Exception):
    """A build step failed or a precondition does not hold; the message says which."""


class Route(NamedTuple):
    """How the preview answers one request path: 200 + file, 301/302 + Location, or 404."""

    status: int
    target: str


class SizeReport(NamedTuple):
    total: int
    files: int
    by_top_level: dict[str, int]
    largest: list[tuple[str, int]]


def derive_site_url(remote: str) -> str:
    """``https://<owner>.github.io/<repo>/`` for a GitHub remote in ssh or https form."""

    match = _GITHUB_REMOTE.match(remote.strip())
    if match is None:
        raise BuildError(
            f"cannot derive a GitHub Pages URL from the remote {remote.strip()!r}; pass --site-url"
        )
    owner = match.group("owner").lower()
    repo = match.group("repo")
    if repo.lower() == f"{owner}.github.io":
        return f"https://{owner}.github.io/"
    return f"https://{owner}.github.io/{repo}/"


def normalize_site_url(url: str) -> str:
    """An absolute http(s) URL with no query or fragment, ending in exactly one slash."""

    parts = urlsplit(url.strip())
    if parts.scheme not in {"https", "http"} or not parts.hostname:
        raise BuildError(
            f"site URL {url!r} must be an absolute http(s) URL such as "
            "https://<owner>.github.io/<repo>/"
        )
    if parts.query or parts.fragment:
        raise BuildError(f"site URL {url!r} must not carry a query or a fragment")
    path = parts.path if parts.path.endswith("/") else parts.path + "/"
    return f"{parts.scheme}://{parts.netloc}{path}"


def base_path_of(site_url: str) -> str:
    """The sub-path Pages serves the site under: ``/<repo>/``, or ``/`` for a user site."""

    return urlsplit(normalize_site_url(site_url)).path


def render_pages_mkdocs_config(root: Path, site_url: str) -> str:
    """The generated build/mkdocs.pages.yml: mkdocs.yml plus what only the Pages build knows.

    ``site_url`` makes the sitemap -- and so Material's instant navigation -- real on the
    static site; ``extra.quviz.lab_url`` points textbook figures at the lab one level up.
    ``docs_dir``, ``watch`` and ``theme.name``/``theme.custom_dir`` are restated because
    MkDocs resolves the filesystem ones against THIS file's directory (build/), not
    against the inherited mkdocs.yml's; ``theme.name`` is repeated alongside so the
    generated ``theme:`` mapping names the same theme mkdocs.yml selects, not the default.
    """

    site = normalize_site_url(site_url)
    base = root.resolve().as_posix()
    return "\n".join(
        [
            "# Generated by scripts/build_pages.py for the GitHub Pages build. Do not edit.",
            f"INHERIT: {json.dumps(base + '/mkdocs.yml')}",
            f"docs_dir: {json.dumps(base + '/docs')}",
            "watch: []",
            f"site_url: {json.dumps(site + 'learn/')}",
            "theme:",
            f"  name: {json.dumps(THEME_NAME)}",
            f"  custom_dir: {json.dumps(base + '/' + THEME_CUSTOM_DIR)}",
            "extra:",
            "  quviz:",
            f"    lab_url: {json.dumps(PAGES_LAB_URL)}",
            "",
        ]
    )


def map_request_path(raw_path: str, prefix: str, site_root: Path) -> Route:
    """Answer one request path the way GitHub Pages answers a project site.

    Only paths under ``prefix`` are the site. ``/`` redirects there (302, a preview
    convenience); the bare prefix and a directory without its trailing slash get Pages'
    301 to the slashed form; a directory serves its ``index.html``; everything else --
    including any ``..``, backslash or drive-letter segment -- is a 404.
    """

    path = unquote(urlsplit(raw_path).path)
    if prefix != "/" and path in {"/", prefix.rstrip("/")}:
        return Route(302 if path == "/" else 301, prefix)
    if not path.startswith(prefix):
        return Route(404, "")
    relative = path[len(prefix) :]
    segments = [segment for segment in relative.split("/") if segment]
    if any(segment in {".", ".."} or "\\" in segment or ":" in segment for segment in segments):
        return Route(404, "")
    candidate = site_root.joinpath(*segments)
    if candidate.is_dir():
        if relative and not relative.endswith("/"):
            return Route(301, path + "/")
        candidate = candidate / "index.html"
    if candidate.is_file():
        return Route(200, str(candidate))
    return Route(404, "")


def content_type_for(path: Path) -> str:
    return CONTENT_TYPES.get(path.suffix.lower(), "application/octet-stream")


def size_report(site_root: Path, top: int = 10) -> SizeReport:
    """Total bytes, bytes per top-level entry, and the ``top`` largest files."""

    sizes: list[tuple[str, int]] = []
    by_top_level: dict[str, int] = {}
    for path in sorted(p for p in site_root.rglob("*") if p.is_file()):
        relative = path.relative_to(site_root).as_posix()
        size = path.stat().st_size
        head = relative.split("/", 1)[0] + "/" if "/" in relative else "(root files)"
        by_top_level[head] = by_top_level.get(head, 0) + size
        sizes.append((relative, size))
    largest = sorted(sizes, key=lambda item: (-item[1], item[0]))[:top]
    return SizeReport(
        total=sum(size for _, size in sizes),
        files=len(sizes),
        by_top_level=dict(sorted(by_top_level.items())),
        largest=largest,
    )


def _human(size: int) -> str:
    return f"{size / 1_000_000:,.2f} MB ({size:,} B)"


def format_size_report(report: SizeReport) -> str:
    width = max((len(name) for name in report.by_top_level), default=0)
    lines = [f"site size: {_human(report.total)} in {report.files} files", "by top-level entry:"]
    lines += [
        f"  {name.ljust(width)}  {_human(size)}" for name, size in report.by_top_level.items()
    ]
    lines.append(f"largest {len(report.largest)} files:")
    lines += [f"  {_human(size)}  {name}" for name, size in report.largest]
    return "\n".join(lines)


def check_site_limit(total: int) -> None:
    if total > PAGES_SITE_LIMIT_BYTES:
        raise BuildError(
            f"the site is {_human(total)}, above GitHub Pages' 1 GB limit for a published "
            "site; shrink StaticCatalogSpec before publishing"
        )
