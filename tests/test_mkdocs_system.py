"""Repository-level contracts for the MkDocs information architecture."""

from __future__ import annotations

import hashlib
from collections import Counter
from pathlib import Path
from typing import Any

import yaml
from markdown import Markdown
from mkdocs.config import load_config

ROOT = Path(__file__).resolve().parents[1]
DOCS = ROOT / "docs"
CONFIG_PATH = ROOT / "mkdocs.yml"


class _MkDocsSafeLoader(yaml.SafeLoader):
    """Safe YAML loader that keeps MkDocs' callable tag as a plain name."""


def _python_name(loader: _MkDocsSafeLoader, suffix: str, node: yaml.nodes.Node) -> str:
    loader.construct_scalar(node)
    return suffix


_MkDocsSafeLoader.add_multi_constructor("tag:yaml.org,2002:python/name:", _python_name)


def _raw_config() -> dict[str, Any]:
    return yaml.load(CONFIG_PATH.read_text(encoding="utf-8"), Loader=_MkDocsSafeLoader)


def _nav_paths(node: Any) -> list[str]:
    if isinstance(node, str):
        return [node] if node.endswith(".md") else []
    if isinstance(node, list):
        return [path for child in node for path in _nav_paths(child)]
    if isinstance(node, dict):
        return [path for child in node.values() for path in _nav_paths(child)]
    raise TypeError(f"unsupported nav node: {node!r}")


def test_every_markdown_page_appears_once_in_navigation() -> None:
    nav_paths = _nav_paths(_raw_config()["nav"])
    counts = Counter(nav_paths)
    duplicates = sorted(path for path, count in counts.items() if count != 1)
    markdown = {path.relative_to(DOCS).as_posix() for path in DOCS.rglob("*.md")}

    assert duplicates == []
    assert set(nav_paths) == markdown


TOP_LEVEL_TABS = ["首页", "教材", "深入阅读", "开发者", "信源与审计"]
DEVELOPER_SECTIONS = ["项目", "入门", "操作指南", "技术参考", "决策记录"]


def _section(entries: list[Any], title: str) -> Any:
    for entry in entries:
        if isinstance(entry, dict) and title in entry:
            return entry[title]
    raise AssertionError(f"nav has no section {title!r}")


def test_navigation_separates_the_learner_path_from_developer_pages() -> None:
    nav = _raw_config()["nav"]
    assert [next(iter(entry)) for entry in nav] == TOP_LEVEL_TABS
    assert _section(nav, "首页") == "index.md"

    textbook = _section(nav, "教材")
    assert textbook[0] == "textbook/index.md"
    assert all(path.startswith("textbook/") for path in _nav_paths(textbook))

    further = _nav_paths(_section(nav, "深入阅读"))
    assert {path.split("/")[0] for path in further} == {"concepts", "tutorials"}
    # Implementation-facing pages live with the developer material.
    assert "concepts/architecture.md" not in further
    assert "tutorials/frontend-rendering.md" not in further

    developer = _section(nav, "开发者")
    assert [next(iter(entry)) for entry in developer] == DEVELOPER_SECTIONS
    developer_paths = _nav_paths(developer)
    for path in (
        "project/status.md",
        "getting-started/installation.md",
        "how-to/cite-sources.md",
        "concepts/architecture.md",
        "tutorials/frontend-rendering.md",
        "reference/physics-api.md",
        "adr/index.md",
    ):
        assert path in developer_paths, path

    assert _nav_paths(_section(nav, "信源与审计"))[0] == "references/index.md"


def test_theme_injects_the_lab_url_and_defaults_to_the_dark_palette() -> None:
    config = _raw_config()
    theme = config["theme"]
    assert theme["custom_dir"] == "overrides"
    assert theme["font"] is False
    assert config["extra"] == {"quviz": {"lab_url": "http://127.0.0.1:8000/"}}

    palette = theme["palette"]
    assert [entry["scheme"] for entry in palette] == ["slate", "default"]
    for entry in palette:
        # Dark is the default, not a system-preference branch; light is the toggle.
        assert "media" not in entry
        assert (entry["primary"], entry["accent"]) == ("custom", "custom")

    template = (ROOT / "overrides" / "main.html").read_text(encoding="utf-8")
    assert template.startswith('{% extends "base.html" %}')
    assert "{% block extrahead %}" in template
    assert "{{ super() }}" in template
    assert '<meta name="quviz-lab" content="{{ config.extra.quviz.lab_url | e }}">' in template

    loaded = load_config(str(CONFIG_PATH))
    assert Path(loaded["theme"].custom_dir).resolve() == (ROOT / "overrides").resolve()

    mermaid = (DOCS / "assets/javascripts/mermaid.js").read_text(encoding="utf-8")
    assert "theme: quvizMermaidTheme()" in mermaid
    assert '? "default"' in mermaid
    assert ': "dark"' in mermaid
    assert '"neutral"' not in mermaid


def test_strict_validation_policy_is_explicit() -> None:
    config = _raw_config()
    assert config["strict"] is True
    assert config["validation"] == {
        "nav": {
            "omitted_files": "warn",
            "not_found": "warn",
            "absolute_links": "warn",
        },
        "links": {
            "not_found": "warn",
            "absolute_links": "relative_to_docs",
            "unrecognized_links": "warn",
            "anchors": "warn",
        },
    }


def test_admonition_titles_use_markdown_syntax_not_typographic_quotes() -> None:
    malformed: list[str] = []
    for path in DOCS.rglob("*.md"):
        for line_number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
            if line.startswith("!!!") and ("“" in line or "”" in line):
                malformed.append(f"{path.relative_to(ROOT)}:{line_number}: {line}")

    assert malformed == [], (
        "PyMdown admonition titles require straight ASCII quotes; typographic quotes "
        "render the indented body as a code block:\n" + "\n".join(malformed)
    )


def test_mathjax_and_mermaid_are_exactly_pinned_and_instant_navigation_aware() -> None:
    scripts = _raw_config()["extra_javascript"]
    assert scripts == [
        "assets/javascripts/mathjax.js",
        "https://cdn.jsdelivr.net/npm/mathjax@3.2.2/es5/tex-mml-chtml.js",
        "https://cdn.jsdelivr.net/npm/mermaid@11.17.2/dist/mermaid.min.js",
        "assets/javascripts/mermaid.js",
        "assets/javascripts/quviz-figure.js",
    ]
    mathjax = (DOCS / "assets/javascripts/mathjax.js").read_text(encoding="utf-8")
    mermaid = (DOCS / "assets/javascripts/mermaid.js").read_text(encoding="utf-8")
    assert "document$.subscribe" in mathjax
    assert "MathJax.typesetPromise()" in mathjax
    assert "startOnLoad: false" in mermaid
    assert "document$.subscribe(renderMermaid)" in mermaid
    assert "window.mermaid.run({ nodes })" in mermaid
    figure = (DOCS / "assets/javascripts/quviz-figure.js").read_text(encoding="utf-8")
    assert "document$.subscribe(enhance)" in figure
    assert "window.QuvizFigure" in figure


def test_mermaid_fence_reaches_runtime_as_plain_diagram_text() -> None:
    config = load_config(str(CONFIG_PATH))
    markdown = Markdown(
        extensions=config["markdown_extensions"],
        extension_configs=config["mdx_configs"],
    )
    html = markdown.convert("```mermaid\ngraph LR\nA --> B\n```")

    assert '<div class="mermaid">graph LR' in html
    assert "A --&gt; B" in html
    assert "<code>" not in html


def test_phase_zero_python_api_reference_covers_public_modules() -> None:
    reference = (DOCS / "reference/physics-api.md").read_text(encoding="utf-8")
    modules = {
        "quviz.conventions",
        "quviz.export.asgi",
        "quviz.export.catalog_spec",
        "quviz.export.static_site",
        "quviz.physics.continuity",
        "quviz.physics.finite_box",
        "quviz.physics.hybridization",
        "quviz.physics.hydrogenic",
        "quviz.physics.observables",
        "quviz.physics.planes",
        "quviz.physics.superposition",
        "quviz.sampling.inverse_cdf",
        "quviz.sampling.point_cloud",
        "quviz.scene.binary",
        "quviz.scene.builders",
        "quviz.scene.models",
        "quviz.scene.slices",
        "quviz.scene.streamlines",
        "quviz.solvers.grid",
    }
    documented = {
        line.removeprefix("::: ").strip()
        for line in reference.splitlines()
        if line.startswith("::: ")
    }
    assert documented == modules


FONT_FILES = {
    # @fontsource-variable/google-sans-flex@5.3.1 (SIL OFL 1.1), fetched verbatim.
    "google-sans-flex-latin-wght-normal.woff2": (
        "4f2ce47af77a0bb9ec3dbd2e81bab7eb97fbcfcd94e47fa63510bb4271b09113"
    ),
    "google-sans-flex-math-wght-normal.woff2": (
        "f266d6cc9d343ae3da3de6ee68a772a76a27277ba864a1a07f8bc7ec4bcfd68d"
    ),
    "OFL.txt": "7168a081fbcea8dbe975e3a015c4e340761b3b4ddf8de0c8a818543f773a29e0",
}
# spec §4.4: the lab and the textbook share one set of design tokens.
SPEC_TOKENS = {
    "--qv-bg": "#0e0f11",
    "--qv-glass": "rgba(0, 0, 0, 0.6)",
    "--qv-glass-strong": "rgba(16, 17, 20, 0.86)",
    "--qv-border": "rgba(255, 255, 255, 0.15)",
    "--qv-border-strong": "rgba(255, 255, 255, 0.3)",
    "--qv-glow": "0 0 12px rgba(100, 160, 255, 0.2)",
    "--qv-blur": "blur(16px)",
    "--qv-radius-panel": "24px",
    "--qv-radius-pill": "100px",
    "--qv-radius-tag": "4px",
    "--qv-text": "#fff",
    "--qv-text-2": "rgba(255, 255, 255, 0.62)",
    "--qv-text-3": "rgba(255, 255, 255, 0.4)",
    "--qv-band": "rgba(255, 255, 255, 0.045)",
    "--qv-accent": "#8ab4f8",
    "--qv-accent-strong": "#1a73e8",
    "--qv-ok": "#81c995",
    "--qv-warn": "#fdd663",
    "--qv-danger": "#f28b82",
}


def test_google_sans_flex_is_self_hosted_with_its_licence_and_spec_tokens() -> None:
    fonts = DOCS / "assets" / "fonts"
    assert sorted(path.name for path in fonts.iterdir()) == sorted(FONT_FILES)
    for name, digest in FONT_FILES.items():
        assert hashlib.sha256((fonts / name).read_bytes()).hexdigest() == digest, name
    assert "SIL OPEN FONT LICENSE Version 1.1" in (fonts / "OFL.txt").read_text(encoding="utf-8")

    css = (DOCS / "assets/stylesheets/extra.css").read_text(encoding="utf-8")
    assert css.count("@font-face") == 2
    for name in FONT_FILES:
        if name.endswith(".woff2"):
            assert f'url("../fonts/{name}") format("woff2")' in css
    assert '--md-text-font: "Google Sans Flex", system-ui, "PingFang SC"' in css
    for token, value in SPEC_TOKENS.items():
        assert f"  {token}: {value};" in css, token
    # font: false keeps Material from requesting Google Fonts; nothing else may either.
    assert _raw_config()["theme"]["font"] is False
    for path in [*DOCS.rglob("*.css"), *DOCS.rglob("*.js"), *(ROOT / "overrides").rglob("*")]:
        if path.is_file():
            text = path.read_text(encoding="utf-8")
            assert "fonts.googleapis.com" not in text, path
            assert "fonts.gstatic.com" not in text, path


def test_every_adr_is_indexed_and_listed_under_decision_records() -> None:
    nav = _raw_config()["nav"]
    decisions = _nav_paths(_section(_section(nav, "开发者"), "决策记录"))
    adrs = sorted(path.relative_to(DOCS).as_posix() for path in (DOCS / "adr").glob("0*.md"))
    assert "adr/0005-static-hosting.md" in adrs
    assert decisions == ["adr/index.md", *adrs]
    index = (DOCS / "adr" / "index.md").read_text(encoding="utf-8")
    for adr in adrs:
        assert f"]({Path(adr).name})" in index, adr
