"""Offline tests for scripts/build_pages.py.

Nothing here runs the exporter, vite or a real MkDocs build: a full Pages build takes
minutes and is verified by running it (docs/getting-started/development.md). What is
pinned here is every decision the script makes on its own -- the public URL it derives,
the MkDocs config it generates, which request paths its preview answers and how, the
order of its build steps and the size gate.
"""

from __future__ import annotations

import importlib.util
import logging
import sys
from pathlib import Path
from types import ModuleType
from typing import Any

import pytest
import yaml
from mkdocs.config import load_config
from mkdocs.exceptions import Abort

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
