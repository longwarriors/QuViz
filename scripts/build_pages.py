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

import argparse
import contextlib
import http.server
import json
import os
import re
import shutil
import subprocess
import sys
import time
from collections.abc import Callable, Sequence
from http import HTTPStatus
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


# --- orchestration -----------------------------------------------------------------

BUILD_INFO_FORMAT = "quviz-pages-build/1"
MANIFEST_FORMAT = "quviz-static/1"


class Layout(NamedTuple):
    root: Path
    build: Path
    pages: Path
    data: Path
    web_out: Path
    mkdocs_config: Path
    build_info: Path


class Tools(NamedTuple):
    uv: str
    npm: str


class BuildOptions(NamedTuple):
    site_url: str
    workers: int
    skip_data: bool


Runner = Callable[[str, Sequence[str], Path], None]


def layout_for(root: Path) -> Layout:
    build = root / "build"
    pages = build / "pages"
    return Layout(
        root=root,
        build=build,
        pages=pages,
        data=pages / "data",
        web_out=build / "pages-web",
        mkdocs_config=build / "mkdocs.pages.yml",
        build_info=build / "pages-build.json",
    )


# `quviz export-static render --workers` accepts 1..32 (Part A's Typer range).
MAX_WORKERS = 32


def default_workers() -> int:
    """Part A's own default: the CPU count, at most 8 (about 0.3-0.4 GB per worker)."""

    return max(1, min(8, os.cpu_count() or 1))


def git_origin_url(root: Path) -> str:
    completed = subprocess.run(
        ["git", "remote", "get-url", "origin"],
        cwd=root,
        capture_output=True,
        text=True,
        check=False,
    )
    if completed.returncode != 0:
        raise BuildError(
            "this checkout has no git remote 'origin' to derive the Pages URL from; pass --site-url"
        )
    return completed.stdout.strip()


def find_tools(root: Path) -> Tools:
    uv = shutil.which("uv")
    npm = shutil.which("npm")
    if uv is None or npm is None:
        missing = [name for name, found in (("uv", uv), ("npm", npm)) if found is None]
        raise BuildError(
            f"{' and '.join(missing)} not found on PATH; install the toolchain described in "
            "docs/getting-started/installation.md"
        )
    if not (root / "web" / "node_modules").is_dir():
        raise BuildError(
            "web/node_modules is missing; run `npm --prefix web ci --no-audit --no-fund` first"
        )
    return Tools(uv=uv, npm=npm)


def run_step(label: str, argv: Sequence[str], cwd: Path) -> None:
    """Run one build step in the foreground; its own output streams to this console."""

    print(f"==> {label}\n    $ {' '.join(argv)}\n      (in {cwd})", flush=True)
    started = time.monotonic()
    completed = subprocess.run(list(argv), cwd=cwd, check=False)
    elapsed = time.monotonic() - started
    if completed.returncode != 0:
        raise BuildError(
            f"step '{label}' failed with exit code {completed.returncode} after {elapsed:.1f} s"
        )
    print(f"    ok in {elapsed:.1f} s", flush=True)


def _remove(path: Path) -> None:
    if path.is_dir() and not path.is_symlink():
        shutil.rmtree(path)
    elif path.exists() or path.is_symlink():
        path.unlink()


def prepare_output(layout: Layout, skip_data: bool) -> None:
    """Start from an empty site; with ``skip_data`` keep only the previous ``data/``."""

    manifest = layout.data / "manifest.json"
    if skip_data:
        if not manifest.is_file():
            raise BuildError(
                f"--skip-data reuses the data of a previous full build, but {manifest} does "
                "not exist; run once without --skip-data"
            )
        for child in layout.pages.iterdir():
            if child.name != "data":
                _remove(child)
    else:
        _remove(layout.pages)
        layout.data.mkdir(parents=True)
    _remove(layout.web_out)
    # pages-build.json describes a finished site: a build that fails from here on must
    # not leave the previous record standing next to a half-built build/pages/.
    _remove(layout.build_info)
    layout.build.mkdir(parents=True, exist_ok=True)


def read_manifest_version(data_dir: Path) -> str:
    path = data_dir / "manifest.json"
    if not path.is_file():
        raise BuildError(f"the exporter wrote no {path}")
    try:
        manifest = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as error:
        raise BuildError(f"{path} is not JSON: {error}") from error
    if not isinstance(manifest, dict) or manifest.get("format") != MANIFEST_FORMAT:
        raise BuildError(f"{path} is not a {MANIFEST_FORMAT} manifest")
    version = manifest.get("version")
    if not isinstance(version, str) or not version:
        raise BuildError(f"{path} carries no version")
    return version


def copy_web_build(web_out: Path, pages: Path) -> None:
    """Merge the staged lab build into the site root, refusing collisions and sourcemaps."""

    if not (web_out / "index.html").is_file():
        raise BuildError(f"the lab build wrote no {web_out / 'index.html'}")
    maps = sorted(path.relative_to(web_out).as_posix() for path in web_out.rglob("*.map"))
    if maps:
        raise BuildError(f"the Pages lab build must not publish a sourcemap; found {maps}")
    for child in sorted(web_out.iterdir()):
        target = pages / child.name
        if target.exists():
            raise BuildError(
                f"the lab build contains {child.name!r}, which would overwrite the site's own "
                f"{child.name!r}"
            )
        if child.is_dir():
            shutil.copytree(child, target)
        else:
            shutil.copy2(child, target)


def build_site(
    layout: Layout, options: BuildOptions, tools: Tools, runner: Runner = run_step
) -> SizeReport:
    """Build build/pages/ and return its size report; raises BuildError on any failure."""

    site_url = normalize_site_url(options.site_url)
    prepare_output(layout, options.skip_data)
    uv_run = [tools.uv, "run", "--locked", "--no-sync"]
    total = 2 if options.skip_data else 5
    numbers = iter(range(1, total + 1))

    def step(label: str, argv: list[str], cwd: Path) -> None:
        runner(f"[{next(numbers)}/{total}] {label}", argv, cwd)

    if not options.skip_data:
        data = str(layout.data)
        step(
            "plan the static catalog",
            [*uv_run, "quviz", "export-static", "plan", "--out", data],
            layout.root,
        )
        # Run from web/: `npm --prefix web exec` keeps the caller's cwd, and vite-node
        # resolves tools/static-requests.ts against the cwd.
        step(
            "enumerate the lab's requests",
            [tools.npm, "exec", "--no", "--", "vite-node", "tools/static-requests.ts", "--", data],
            layout.root / "web",
        )
        step(
            "render every precomputed response",
            [
                *uv_run, "quviz", "export-static", "render", "--data", data,
                "--requests", str(layout.data / "requests.json"),
                "--workers", str(options.workers),
            ],
            layout.root,
        )  # fmt: skip
    data_version = read_manifest_version(layout.data)
    step(
        "build the lab in pages mode",
        [
            tools.npm, "--prefix", "web", "run", "build:pages", "--",
            "--outDir", str(layout.web_out), "--emptyOutDir",
        ],
        layout.root,
    )  # fmt: skip
    layout.mkdocs_config.write_text(
        render_pages_mkdocs_config(layout.root, site_url), encoding="utf-8"
    )
    step(
        "build the textbook",
        [
            *uv_run, "--group", "docs", "mkdocs", "build", "--strict",
            "-f", str(layout.mkdocs_config), "-d", str(layout.pages / "learn"),
        ],
        layout.root,
    )  # fmt: skip
    copy_web_build(layout.web_out, layout.pages)
    # Jekyll is irrelevant for an Actions deployment, and upload-pages-artifact leaves
    # hidden files out by default; the marker keeps a branch-based deployment honest too.
    (layout.pages / ".nojekyll").write_bytes(b"")
    report = size_report(layout.pages)
    print(format_size_report(report), flush=True)
    check_site_limit(report.total)
    layout.build_info.write_text(
        json.dumps(
            {
                "format": BUILD_INFO_FORMAT,
                "site_url": site_url,
                "base_path": base_path_of(site_url),
                "data_version": data_version,
            },
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    return report


# --- the sub-path preview ------------------------------------------------------------


def make_server(site_root: Path, prefix: str, port: int) -> http.server.ThreadingHTTPServer:
    """A 127.0.0.1 server that answers exactly as map_request_path decides."""

    class PagesPreviewHandler(http.server.BaseHTTPRequestHandler):
        server_version = "QuVizPagesPreview/1"

        def do_GET(self) -> None:
            self._answer(send_body=True)

        def do_HEAD(self) -> None:
            self._answer(send_body=False)

        def _answer(self, *, send_body: bool) -> None:
            route = map_request_path(self.path, prefix, site_root)
            if route.status in (HTTPStatus.MOVED_PERMANENTLY, HTTPStatus.FOUND):
                self.send_response(route.status)
                self.send_header("Location", route.target)
                self.send_header("Content-Length", "0")
                self.end_headers()
                return
            if route.status == HTTPStatus.OK:
                path = Path(route.target)
                body = path.read_bytes()
                content_type = content_type_for(path)
            else:
                body = f"404: {self.path} is not part of the site served under {prefix}\n".encode()
                content_type = "text/plain; charset=utf-8"
            self.send_response(route.status)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-cache")
            self.end_headers()
            if send_body:
                self.wfile.write(body)

        def log_request(self, code: int | str = "-", size: int | str = "-") -> None:
            if isinstance(code, int) and code >= HTTPStatus.BAD_REQUEST:
                super().log_request(code, size)

    return http.server.ThreadingHTTPServer(("127.0.0.1", port), PagesPreviewHandler)


def serve(site_root: Path, prefix: str, port: int) -> None:
    server = make_server(site_root, prefix, port)
    print(
        f"build_pages: previewing http://127.0.0.1:{port}{prefix} "
        "(only this sub-path is served; Ctrl+C stops)",
        flush=True,
    )
    try:
        with contextlib.suppress(KeyboardInterrupt):
            server.serve_forever()
    finally:
        server.server_close()


# --- command line --------------------------------------------------------------------


def _worker_count(text: str) -> int:
    value = int(text)
    if not 1 <= value <= MAX_WORKERS:
        raise argparse.ArgumentTypeError(f"{text} is not a worker count in 1..{MAX_WORKERS}")
    return value


def _port(text: str) -> int:
    value = int(text)
    if not 1 <= value <= 65535:
        raise argparse.ArgumentTypeError(f"{text} is not a TCP port")
    return value


def parse_args(argv: Sequence[str] | None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        prog="build_pages.py",
        description="Assemble the GitHub Pages site in build/pages/ and optionally preview it.",
    )
    parser.add_argument(
        "--site-url", help="public site URL (default: derived from `git remote get-url origin`)"
    )
    parser.add_argument(
        "--workers",
        type=_worker_count,
        default=default_workers(),
        help=f"exporter processes, 1-{MAX_WORKERS} (default: CPU count, at most 8)",
    )
    parser.add_argument(
        "--skip-data",
        action="store_true",
        help="reuse build/pages/data from the previous full build; rebuild only lab and textbook",
    )
    parser.add_argument(
        "--serve",
        type=_port,
        metavar="PORT",
        help="after building, serve build/pages under the site's sub-path on 127.0.0.1:PORT",
    )
    return parser.parse_args(argv)


def main(argv: Sequence[str] | None = None) -> int:
    args = parse_args(argv)
    try:
        tools = find_tools(ROOT)
        site_url = (
            normalize_site_url(args.site_url)
            if args.site_url
            else derive_site_url(git_origin_url(ROOT))
        )
        layout = layout_for(ROOT)
        build_site(layout, BuildOptions(site_url, args.workers, args.skip_data), tools)
        print(f"build_pages: site ready in {layout.pages} (site_url {site_url})", flush=True)
        if args.serve is not None:
            serve(layout.pages, base_path_of(site_url), args.serve)
    except BuildError as error:
        print(f"build_pages: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
