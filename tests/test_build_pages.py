"""Offline tests for scripts/build_pages.py.

Nothing here runs the exporter, vite or a real MkDocs build: a full Pages build takes
minutes and is verified by running it (docs/getting-started/development.md). What is
pinned here is every decision the script makes on its own -- the public URL it derives,
the MkDocs config it generates, which request paths its preview answers and how, the
order of its build steps and the size gate.
"""

from __future__ import annotations

import http.client
import importlib.util
import json
import logging
import sys
import threading
from collections.abc import Sequence
from pathlib import Path
from types import ModuleType
from typing import Any

import pytest
import yaml
from mkdocs.config import load_config
from mkdocs.exceptions import Abort

from quviz.export import static_site

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts" / "build_pages.py"
PAGES_URL = "https://longwarriors.github.io/Atmoic-quantum-visualization/"
PREFIX = "/Atmoic-quantum-visualization/"


def _load_script(path: Path) -> ModuleType:
    spec = importlib.util.spec_from_file_location(path.stem, path)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    # Registered before execution: NamedTuple machinery resolves its module by name.
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


build_pages = _load_script(SCRIPT)


class _MkDocsSafeLoader(yaml.SafeLoader):
    """SafeLoader that keeps mkdocs.yml's ``!!python/name:`` tags as plain names."""


def _python_name(loader: _MkDocsSafeLoader, suffix: str, node: yaml.nodes.Node) -> str:
    loader.construct_scalar(node)
    return suffix


_MkDocsSafeLoader.add_multi_constructor("tag:yaml.org,2002:python/name:", _python_name)


# --- the public URL -------------------------------------------------------------


@pytest.mark.parametrize(
    ("remote", "expected"),
    [
        ("git@github.com:longwarriors/Atmoic-quantum-visualization.git", PAGES_URL),
        ("https://github.com/longwarriors/Atmoic-quantum-visualization.git", PAGES_URL),
        ("https://github.com/longwarriors/Atmoic-quantum-visualization", PAGES_URL),
        ("ssh://git@github.com/longwarriors/Atmoic-quantum-visualization.git\n", PAGES_URL),
        (
            "https://x-access-token@github.com/Longwarriors/QuViz/",
            "https://longwarriors.github.io/QuViz/",
        ),
        ("git@github.com:octocat/octocat.github.io.git", "https://octocat.github.io/"),
    ],
)
def test_the_site_url_is_derived_from_a_github_remote(remote: str, expected: str) -> None:
    assert build_pages.derive_site_url(remote) == expected


@pytest.mark.parametrize(
    "remote",
    [
        "git@gitlab.com:longwarriors/quviz.git",
        "https://github.com/longwarriors",
        "file:///srv/quviz.git",
        "",
    ],
)
def test_a_remote_that_is_not_a_github_repository_is_refused(remote: str) -> None:
    with pytest.raises(build_pages.BuildError, match="--site-url"):
        build_pages.derive_site_url(remote)


@pytest.mark.parametrize(
    ("given", "expected"),
    [
        ("https://longwarriors.github.io/Atmoic-quantum-visualization", PAGES_URL),
        (PAGES_URL, PAGES_URL),
        ("https://octocat.github.io", "https://octocat.github.io/"),
        ("http://127.0.0.1:4180/QuViz/", "http://127.0.0.1:4180/QuViz/"),
    ],
)
def test_a_site_url_is_normalised_to_end_in_a_slash(given: str, expected: str) -> None:
    assert build_pages.normalize_site_url(given) == expected


@pytest.mark.parametrize(
    "bad",
    [
        "longwarriors.github.io/QuViz",
        "ftp://example.org/x/",
        "https:///x/",
        "https://example.org/x/?a=1",
        "https://example.org/x/#top",
    ],
)
def test_a_malformed_site_url_is_refused(bad: str) -> None:
    with pytest.raises(build_pages.BuildError):
        build_pages.normalize_site_url(bad)


def test_the_base_path_is_the_path_of_the_site_url() -> None:
    assert build_pages.base_path_of(PAGES_URL) == PREFIX
    assert build_pages.base_path_of("https://octocat.github.io") == "/"


# --- the generated MkDocs config ------------------------------------------------


def _write_config(directory: Path, text: str) -> Path:
    directory.mkdir(parents=True, exist_ok=True)
    path = directory / "mkdocs.pages.yml"
    path.write_text(text, encoding="utf-8")
    return path


def test_the_generated_pages_config_is_accepted_by_mkdocs_itself(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.chdir(ROOT)  # quviz.docs.citations resolves references.bib against the cwd
    path = _write_config(
        tmp_path / "build", build_pages.render_pages_mkdocs_config(ROOT, PAGES_URL)
    )

    config = load_config(config_file=str(path))

    assert config["site_url"] == PAGES_URL + "learn/"
    assert Path(config["docs_dir"]) == ROOT / "docs"
    assert config["theme"].name == build_pages.THEME_NAME
    assert Path(config["theme"].custom_dir) == ROOT / build_pages.THEME_CUSTOM_DIR
    assert config["extra"]["quviz"]["lab_url"] == "../"
    assert config["watch"] == []


def test_the_contract_minimum_alone_resolves_docs_dir_under_build_and_is_refused(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
) -> None:
    """Negative control: why the generated config restates absolute paths.

    MkDocs resolves ``docs_dir``, ``watch`` and ``theme.custom_dir`` against the directory
    of the config file it was GIVEN -- build/ -- so ``INHERIT`` + ``site_url`` + ``extra``
    alone leaves the inherited (relative) ``theme.custom_dir: overrides`` pointing at
    build/overrides, which does not exist. ``Config._validate`` (mkdocs/config/base.py)
    walks the schema in declaration order and stops at the first failing key; ``theme``
    (defaults.py) is declared before ``docs_dir``, so *that* is the key mkdocs reports here
    -- reproduced on this checkout's mkdocs 1.6.1. ``docs_dir`` would fail the same way,
    for the same reason, were it reached; render_pages_mkdocs_config rebases both.
    """

    monkeypatch.chdir(ROOT)
    minimal = (
        f'INHERIT: "{(ROOT / "mkdocs.yml").as_posix()}"\n'
        f'site_url: "{PAGES_URL}learn/"\n'
        'extra:\n  quviz:\n    lab_url: "../"\n'
    )
    path = _write_config(tmp_path / "build", minimal)

    with caplog.at_level(logging.ERROR), pytest.raises(Abort):
        load_config(config_file=str(path))
    assert any("custom_dir" in record.getMessage() for record in caplog.records), caplog.text


def test_the_rebased_paths_are_the_ones_mkdocs_yml_declares() -> None:
    raw: dict[str, Any] = yaml.load(
        (ROOT / "mkdocs.yml").read_text(encoding="utf-8"), Loader=_MkDocsSafeLoader
    )
    assert raw["theme"].get("name") == build_pages.THEME_NAME, (
        "mkdocs.yml's theme.name changed; update THEME_NAME so the Pages config repeats "
        "the value MkDocs actually uses"
    )
    assert raw["theme"].get("custom_dir") == build_pages.THEME_CUSTOM_DIR, (
        "mkdocs.yml's theme.custom_dir changed; update THEME_CUSTOM_DIR so the Pages config "
        "rebases the directory MkDocs actually uses"
    )
    assert "docs_dir" not in raw, (
        "mkdocs.yml now sets docs_dir; render_pages_mkdocs_config must rebase that value "
        "instead of the default docs/"
    )


# --- the preview server's routing -------------------------------------------------


@pytest.fixture
def site(tmp_path: Path) -> Path:
    root = tmp_path / "pages"
    (root / "data" / "files").mkdir(parents=True)
    (root / "learn").mkdir()
    (root / "index.html").write_text("<!doctype html><title>lab</title>", encoding="utf-8")
    (root / "learn" / "index.html").write_text(
        "<!doctype html><title>learn</title>", encoding="utf-8"
    )
    (root / "data" / "manifest.json").write_text('{"format": "quviz-static/1"}', encoding="utf-8")
    (root / "data" / "files" / "abc.bin").write_bytes(b"QVPC\x01\x00")
    return root


@pytest.mark.parametrize(
    ("request_path", "expected"),
    [
        ("/", (302, PREFIX)),
        ("/Atmoic-quantum-visualization", (301, PREFIX)),
        ("/Atmoic-quantum-visualization/learn", (301, PREFIX + "learn/")),
        ("/Atmoic-quantum-visualization/learn?tab=1", (301, PREFIX + "learn/")),
        ("/index.html", (404, "")),
        ("/learn/", (404, "")),
        ("/data/manifest.json", (404, "")),
        ("/Atmoic-quantum-visualization/missing.js", (404, "")),
        ("/Atmoic-quantum-visualization/../index.html", (404, "")),
        ("/Atmoic-quantum-visualization/%2e%2e/index.html", (404, "")),
        ("/Atmoic-quantum-visualization/data%5Cmanifest.json", (404, "")),
    ],
)
def test_the_preview_answers_nothing_outside_the_sub_path(
    site: Path, request_path: str, expected: tuple[int, str]
) -> None:
    assert build_pages.map_request_path(request_path, PREFIX, site) == build_pages.Route(*expected)


@pytest.mark.parametrize(
    ("request_path", "relative"),
    [
        (PREFIX, "index.html"),
        (PREFIX + "?cache=1", "index.html"),
        (PREFIX + "learn/", "learn/index.html"),
        (PREFIX + "data/manifest.json", "data/manifest.json"),
        (PREFIX + "data/files/abc.bin", "data/files/abc.bin"),
    ],
)
def test_paths_under_the_sub_path_map_onto_the_built_site(
    site: Path, request_path: str, relative: str
) -> None:
    route = build_pages.map_request_path(request_path, PREFIX, site)
    assert route.status == 200
    assert Path(route.target) == site / relative


def test_a_user_site_is_served_from_the_root(site: Path) -> None:
    assert build_pages.map_request_path("/", "/", site) == build_pages.Route(
        200, str(site / "index.html")
    )


@pytest.mark.parametrize(
    ("name", "expected"),
    [
        ("a.bin", "application/octet-stream"),
        ("a.json", "application/json"),
        ("a.js", "text/javascript; charset=utf-8"),
        ("a.css", "text/css; charset=utf-8"),
        ("a.html", "text/html; charset=utf-8"),
        ("a.svg", "image/svg+xml"),
        ("a.woff2", "font/woff2"),
        ("a.unknown", "application/octet-stream"),
    ],
)
def test_content_types_match_what_pages_serves(name: str, expected: str) -> None:
    assert build_pages.content_type_for(Path(name)) == expected


# --- the size gate ------------------------------------------------------------------


def test_the_size_report_totals_groups_and_ranks_files(tmp_path: Path) -> None:
    root = tmp_path / "pages"
    (root / "data" / "files").mkdir(parents=True)
    (root / "assets").mkdir()
    (root / "data" / "files" / "big.bin").write_bytes(b"x" * 3000)
    (root / "data" / "manifest.json").write_bytes(b"x" * 100)
    (root / "assets" / "app.js").write_bytes(b"x" * 2000)
    (root / "index.html").write_bytes(b"x" * 10)

    report = build_pages.size_report(root, top=2)

    assert report.total == 5110
    assert report.files == 4
    assert report.by_top_level == {"(root files)": 10, "assets/": 2000, "data/": 3100}
    assert report.largest == [("data/files/big.bin", 3000), ("assets/app.js", 2000)]
    text = build_pages.format_size_report(report)
    assert "5,110 B" in text
    assert "4 files" in text
    assert "data/files/big.bin" in text


def test_a_site_over_the_pages_limit_fails_the_build() -> None:
    build_pages.check_site_limit(build_pages.PAGES_SITE_LIMIT_BYTES)
    with pytest.raises(build_pages.BuildError, match="1 GB"):
        build_pages.check_site_limit(build_pages.PAGES_SITE_LIMIT_BYTES + 1)


# --- orchestration ----------------------------------------------------------------

TOOLS = build_pages.Tools(uv="uv", npm="npm")
MANIFEST = {"format": "quviz-static/1", "version": "0123456789abcdef", "spec": {}, "entries": {}}


class FakeRunner:
    """Stands in for every subprocess, and writes what each real step would write."""

    def __init__(
        self, *, web_extra: dict[str, bytes] | None = None, manifest: dict[str, Any] = MANIFEST
    ) -> None:
        self.calls: list[tuple[list[str], Path]] = []
        self.web_extra = web_extra or {}
        self.manifest = manifest

    def __call__(self, label: str, argv: Sequence[str], cwd: Path) -> None:
        args = list(argv)
        self.calls.append((args, cwd))
        if "export-static" in args and "plan" in args:
            (Path(args[args.index("--out") + 1]) / "spec.json").write_text("{}", encoding="utf-8")
        elif "vite-node" in args:
            (Path(args[-1]) / "requests.json").write_text(
                '{"format": "quviz-static-requests/1", "requests": []}', encoding="utf-8"
            )
        elif "export-static" in args and "render" in args:
            data = Path(args[args.index("--data") + 1])
            (data / "files").mkdir(parents=True, exist_ok=True)
            (data / "files" / "abc.bin").write_bytes(b"QVPC")
            (data / "manifest.json").write_text(json.dumps(self.manifest), encoding="utf-8")
        elif "build:pages" in args:
            out = Path(args[args.index("--outDir") + 1])
            (out / "assets").mkdir(parents=True, exist_ok=True)
            (out / "index.html").write_text("<!doctype html>", encoding="utf-8")
            (out / "assets" / "app.js").write_text("export {}", encoding="utf-8")
            for relative, content in self.web_extra.items():
                target = out / relative
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(content)
        elif "mkdocs" in args:
            learn = Path(args[args.index("-d") + 1])
            learn.mkdir(parents=True, exist_ok=True)
            (learn / "index.html").write_text("<!doctype html>", encoding="utf-8")
        else:
            raise AssertionError(f"unexpected command {args}")


def _layout(tmp_path: Path) -> Any:
    root = tmp_path / "repo"
    (root / "web").mkdir(parents=True)
    return build_pages.layout_for(root)


def _expected_commands(layout: Any, workers: int) -> list[tuple[list[str], Path]]:
    data = str(layout.data)
    return [
        (
            ["uv", "run", "--locked", "--no-sync", "quviz", "export-static", "plan", "--out", data],
            layout.root,
        ),
        (
            ["npm", "exec", "--no", "--", "vite-node", "tools/static-requests.ts", "--", data],
            layout.root / "web",
        ),
        (
            [
                "uv", "run", "--locked", "--no-sync", "quviz", "export-static", "render",
                "--data", data, "--requests", str(layout.data / "requests.json"),
                "--workers", str(workers),
            ],
            layout.root,
        ),
        (
            [
                "npm", "--prefix", "web", "run", "build:pages", "--",
                "--outDir", str(layout.web_out), "--emptyOutDir",
            ],
            layout.root,
        ),
        (
            [
                "uv", "run", "--locked", "--no-sync", "--group", "docs", "mkdocs", "build",
                "--strict", "-f", str(layout.mkdocs_config), "-d", str(layout.pages / "learn"),
            ],
            layout.root,
        ),
    ]  # fmt: skip


def _write_previous_data(layout: Any) -> None:
    (layout.data / "files").mkdir(parents=True)
    (layout.data / "files" / "kept.bin").write_bytes(b"kept")
    (layout.data / "manifest.json").write_text(json.dumps(MANIFEST), encoding="utf-8")


def test_a_full_build_runs_every_step_in_order_and_assembles_the_site(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    layout = _layout(tmp_path)
    _write_previous_data(layout)
    (layout.pages / "stale.html").write_text("old", encoding="utf-8")
    runner = FakeRunner()

    report = build_pages.build_site(
        layout, build_pages.BuildOptions(PAGES_URL, 3, False), TOOLS, runner
    )

    assert runner.calls == _expected_commands(layout, 3)
    for relative in ("index.html", "assets/app.js", "data/manifest.json", "data/files/abc.bin",
                     "learn/index.html", ".nojekyll"):  # fmt: skip
        assert (layout.pages / relative).is_file(), relative
    assert not (layout.pages / "stale.html").exists(), "a full build starts from an empty site"
    assert not (layout.data / "files" / "kept.bin").exists(), "a full build regenerates data"
    assert json.loads(layout.build_info.read_text(encoding="utf-8")) == {
        "format": "quviz-pages-build/1",
        "site_url": PAGES_URL,
        "base_path": PREFIX,
        "data_version": "0123456789abcdef",
    }
    assert f'site_url: "{PAGES_URL}learn/"' in layout.mkdocs_config.read_text(encoding="utf-8")
    assert report.total == sum(p.stat().st_size for p in layout.pages.rglob("*") if p.is_file())
    assert "site size:" in capsys.readouterr().out


def test_skip_data_keeps_the_previous_data_and_runs_only_the_site_steps(tmp_path: Path) -> None:
    layout = _layout(tmp_path)
    _write_previous_data(layout)
    (layout.pages / "stale.html").write_text("old", encoding="utf-8")
    runner = FakeRunner()

    build_pages.build_site(layout, build_pages.BuildOptions(PAGES_URL, 3, True), TOOLS, runner)

    assert runner.calls == _expected_commands(layout, 3)[3:]
    assert (layout.data / "files" / "kept.bin").read_bytes() == b"kept"
    assert not (layout.pages / "stale.html").exists()
    assert (layout.pages / "index.html").is_file()


def test_skip_data_without_a_previous_full_build_fails_before_any_step(tmp_path: Path) -> None:
    layout = _layout(tmp_path)
    runner = FakeRunner()
    with pytest.raises(build_pages.BuildError, match=r"manifest\.json"):
        build_pages.build_site(layout, build_pages.BuildOptions(PAGES_URL, 3, True), TOOLS, runner)
    assert runner.calls == []


def _write_previous_build_info(layout: Any) -> None:
    layout.build.mkdir(parents=True, exist_ok=True)
    layout.build_info.write_text('{"format": "quviz-pages-build/1"}', encoding="utf-8")


def test_an_exporter_manifest_of_another_format_stops_the_build(tmp_path: Path) -> None:
    layout = _layout(tmp_path)
    _write_previous_build_info(layout)
    runner = FakeRunner(manifest={**MANIFEST, "format": "something-else"})
    with pytest.raises(build_pages.BuildError, match="quviz-static/1"):
        build_pages.build_site(layout, build_pages.BuildOptions(PAGES_URL, 3, False), TOOLS, runner)
    assert not any("build:pages" in args for args, _ in runner.calls)
    # pages-build.json describes a finished site; the previous one must not outlive it.
    assert not layout.build_info.exists()


def test_a_site_over_the_pages_limit_fails_the_build_and_records_no_build(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    layout = _layout(tmp_path)
    _write_previous_build_info(layout)
    monkeypatch.setattr(build_pages, "PAGES_SITE_LIMIT_BYTES", 1)
    with pytest.raises(build_pages.BuildError, match="1 GB"):
        build_pages.build_site(
            layout, build_pages.BuildOptions(PAGES_URL, 3, False), TOOLS, FakeRunner()
        )
    assert not layout.build_info.exists()


@pytest.mark.parametrize("collision", ["data/x.json", "learn/x.html"])
def test_a_lab_build_that_would_overwrite_the_data_or_the_textbook_is_refused(
    tmp_path: Path, collision: str
) -> None:
    layout = _layout(tmp_path)
    runner = FakeRunner(web_extra={collision: b"{}"})
    with pytest.raises(build_pages.BuildError, match="would overwrite"):
        build_pages.build_site(layout, build_pages.BuildOptions(PAGES_URL, 3, False), TOOLS, runner)


def test_a_lab_build_that_ships_a_sourcemap_is_refused(tmp_path: Path) -> None:
    layout = _layout(tmp_path)
    runner = FakeRunner(web_extra={"assets/app.js.map": b"{}"})
    with pytest.raises(build_pages.BuildError, match="sourcemap"):
        build_pages.build_site(layout, build_pages.BuildOptions(PAGES_URL, 3, False), TOOLS, runner)


def test_a_failing_step_reports_its_exit_code(tmp_path: Path) -> None:
    with pytest.raises(build_pages.BuildError, match="exit code 3"):
        build_pages.run_step("probe", [sys.executable, "-c", "raise SystemExit(3)"], tmp_path)


@pytest.mark.parametrize(
    "argv",
    [
        ["--workers", "0"],
        ["--workers", "33"],
        ["--workers", "many"],
        ["--serve", "0"],
        ["--serve", "70000"],
        ["--site-url"],
    ],
)
def test_invalid_arguments_are_rejected(argv: list[str]) -> None:
    # --workers 33 is refused here, before any step: the exporter's own option stops
    # at 32 and would otherwise fail only after `plan` and the enumerator had run.
    with pytest.raises(SystemExit) as exited:
        build_pages.parse_args(argv)
    assert exited.value.code == 2


def test_the_defaults_derive_everything_that_is_not_given() -> None:
    args = build_pages.parse_args([])
    assert args.site_url is None
    assert args.workers == build_pages.default_workers() >= 1
    assert args.skip_data is False
    assert args.serve is None


@pytest.mark.parametrize(("cpus", "expected"), [(None, 1), (1, 1), (4, 4), (64, 8)])
def test_the_default_worker_count_is_the_exporters_own_capped_at_eight(
    monkeypatch: pytest.MonkeyPatch, cpus: int | None, expected: int
) -> None:
    # Part A's default_worker_count(): the CPU count, at most 8. Each worker peaks at
    # about 0.3-0.4 GB, and --workers above 32 exits 2 in the exporter, so "CPU count
    # minus one" would break the build on 34+ cores and use 6-12 GB on 16-32.
    monkeypatch.setattr(build_pages.os, "cpu_count", lambda: cpus)
    assert build_pages.default_workers() == expected
    assert build_pages.parse_args([]).workers == expected
    # The script is standard-library only, so it restates the exporter's rule instead of
    # importing it; the patched os.cpu_count is the one static_site reads as well.
    assert static_site.default_worker_count() == expected


def test_what_the_script_restates_from_the_exporter_is_the_exporters_own() -> None:
    # tests/test_cli.py ties the Typer --workers range to MAXIMUM_WORKERS; this closes
    # the chain, so the script's own ceiling cannot drift from what the exporter accepts.
    assert build_pages.MANIFEST_FORMAT == static_site.MANIFEST_FORMAT
    assert build_pages.MAX_WORKERS == static_site.MAXIMUM_WORKERS
    assert build_pages.parse_args(["--workers", str(static_site.MAXIMUM_WORKERS)]).workers == (
        static_site.MAXIMUM_WORKERS
    )


def test_missing_tools_fail_fast_with_a_clear_message(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    monkeypatch.setattr(build_pages.shutil, "which", lambda _name: None)
    assert build_pages.main(["--skip-data"]) == 1
    assert "uv and npm not found on PATH" in capsys.readouterr().err


def test_the_preview_server_answers_like_pages(site: Path) -> None:
    server = build_pages.make_server(site, PREFIX, 0)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    host, port = server.server_address[:2]

    def fetch(method: str, path: str) -> tuple[int, dict[str, str], bytes]:
        connection = http.client.HTTPConnection(str(host), int(port), timeout=10)
        try:
            connection.request(method, path)
            response = connection.getresponse()
            return response.status, dict(response.getheaders()), response.read()
        finally:
            connection.close()

    try:
        status, headers, body = fetch("GET", PREFIX + "data/files/abc.bin")
        assert (status, headers["Content-Type"], body) == (
            200,
            "application/octet-stream",
            b"QVPC\x01\x00",
        )
        status, headers, _ = fetch("GET", PREFIX + "data/manifest.json")
        assert (status, headers["Content-Type"]) == (200, "application/json")
        status, headers, body = fetch("GET", PREFIX)
        assert status == 200 and headers["Content-Type"].startswith("text/html") and b"lab" in body
        status, headers, _ = fetch("GET", "/")
        assert (status, headers["Location"]) == (302, PREFIX)
        status, headers, _ = fetch("GET", PREFIX + "learn")
        assert (status, headers["Location"]) == (301, PREFIX + "learn/")
        assert fetch("GET", "/index.html")[0] == 404
        status, headers, body = fetch("HEAD", PREFIX + "data/files/abc.bin")
        assert (status, headers["Content-Length"], body) == (200, "6", b"")
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=10)
