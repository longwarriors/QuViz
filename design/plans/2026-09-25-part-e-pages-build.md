# Part E — Pages Build, Deploy Workflow, Static E2E, Docker Visual Gate and Release Docs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the work of Parts A–D into a publishable, locally verified GitHub Pages site. The deliverables are a one-command local build and sub-path preview (`scripts/build_pages.py`), a publisher-only Actions workflow (`.github/workflows/pages.yml`), and a browser suite against the built static site (`web/pages-e2e/`, `npm run test:pages`). The Linux visual gate moves into a pinned Docker image (`scripts/visual-docker.*`), and its five baselines are regenerated and reviewed. Release docs and a final full-gate run complete the part.

**Architecture:** `scripts/build_pages.py` runs from any cwd and anchors every step on its own checkout. It calls Part A's exporter (`quviz export-static plan|render`), Part B's enumerator (`vite-node tools/static-requests.ts`) and Part B's `build:pages` (output staged in `build/pages-web/`). It then builds Part C's MkDocs site through a generated `build/mkdocs.pages.yml` into `build/pages/learn/`, and assembles the result in `build/pages/`. It records the build in `build/pages-build.json`. With `--serve`, it serves `build/pages/` from a stdlib `ThreadingHTTPServer` under the repository sub-path only, the way GitHub Pages does. The Actions workflow re-runs that script with the `actions/configure-pages` base URL and deploys. `test:pages` rebuilds the lab and textbook against the data of the last full build (`--skip-data --serve 4180`), then drives the real UI. A post-run auditor over a closed title manifest backs it. Visual baselines are produced only inside `mcr.microsoft.com/playwright:v1.62.1-noble`, pinned by digest.

**Tech Stack:** Python 3.12 stdlib (`argparse`, `subprocess`, `http.server`, `shutil`, `json`, `urllib.parse`), pytest and PyYAML plus MkDocs `load_config` in the tests, GitHub Actions (`actions/configure-pages@v6`, `actions/upload-pages-artifact@v5`, `actions/deploy-pages@v5`), Playwright 1.62.1 (existing devDependency), Node ESM gate scripts, PowerShell 7 and bash, and Docker Desktop.

**Spec:** `design/specs/2026-09-25-pages-textbook-lab-design.md` (§1 success criteria 1–5, §3 D1/D5/D6/D13, §4.5 last bullet, §4.6, §5 sourcemap row, §6, §7) and the binding cross-part contracts in `design/plans/2026-09-25-contracts.md`.

## Global Constraints

- Work on branch `feat/pages-textbook-lab`. Commit once per task. Never `git push`, never enable GitHub Pages, never merge. Those outward actions are listed in Task E9 and need the user's explicit confirmation.
- Parts A–D are merged before Part E starts (contracts: "E may assume A–D exist"). Every line number below was read on `bbe1a5e`. A–D may have shifted lines, so each edit names a unique anchor string. Match the anchor, not the number.
- CLAUDE.md is binding and overrides the orchestrator's "affected tests only" guidance **for commits**:
  - During a task, run only the affected tests.
  - Before each commit that changes Python (`scripts/`, `tests/`), also run `uv run --locked --group docs pytest --cov=quviz --cov-report=term-missing` (coverage ≥ 85%, 0 skipped).
  - Before each commit that changes `web/`, run `npm --prefix web run test` and `npm --prefix web run typecheck`.
  - Report what actually ran and what did not.
- Tests may never skip (`tests/conftest.py`), and `xfail_strict` holds. Every new pin gets a negative control, following the repo convention of module-level predicates fed a sabotaged input.
- `scripts/build_pages.py` uses the **standard library only**. It is ruff-checked; mypy covers `quviz` only. Tests import it via `importlib` the way `tests/test_check_links.py:36-41` does, and additionally register the module in `sys.modules` before `exec_module`.
- Python strings and comments must not contain fullwidth `，：（）；`. RUF001/RUF003 flag them (measured with ruff on this tree). Tooling messages in `.py`, `.ps1` and `.sh` are English, following the precedent of `scripts/check.ps1`. Chinese goes in docs and in the UI strings the e2e suite asserts.
- Web constraints:
  - No new npm dependency. Local Node 24.14.1 fails engine-strict, so never run `npm ci` or `npm install` on the host.
  - No new runtime module under `web/src`. The only new `web/src` file is a test (`pagesGate.test.ts`), so `coverage-scope.json`, `vitest.config.ts` and the coverage latch are untouched.
  - No new `.d.ts`, `.js` or `.mts` under `web/src`.
  - `web/scripts/` gains exactly `assert-pages-run.mjs` and `assert-pages-run.d.mts`, with `WEB_SCRIPTS` in `tests/test_check_script.py` edited in the same task.
- Measured command facts (read-only probes on this machine):
  - `npm --prefix web exec` keeps cwd = repository root. So relative script paths for `vite-node`, `vitest` and `playwright` must be run as `npm --prefix web run …` (npm runs scripts in `web/`), or with a cwd of `web/`, or with a `web/`-relative path.
  - Single vitest files run as `npm --prefix web run test:watch -- run src/<file>.test.ts`. That expands to `vitest run src/<file>` in `web/`.
  - Single Playwright configs run as `npm --prefix web exec --no -- playwright test --config=web/<config>`.
- Docs constraints:
  - No new Markdown pages. `tests/test_mkdocs_system.py:44-51` requires every page in nav exactly once.
  - Never put a `*.github.io` URL under `docs/`: `scripts/check_links.py` probes every URL added under `docs/`, including inside code spans, and the site does not exist yet. The concrete Pages URL goes in `README.md` only; `check_links` does not scan it.
  - Identifiers that start with LaTeX-fragment letters (`ext…`, `eta…`, `vert…`) are always written as inline code, so `tests/test_docs_integrity.py`'s orphan-fragment gate never sees them.
- Commands are the contract's "Shared commands". Full gates run only in Task E9. Long operations are the full build (tens of minutes, dominated by the render step) and the Docker runs. Run them in the background and wait for their completion line.

## Review Focus

1. **`build/mkdocs.pages.yml` carries more than the contract's four keys.** MkDocs resolves `docs_dir`, `watch` and `theme.custom_dir` against the directory of the config file it was *given*: `mkdocs/config/config_options.py:692-708` for `FilesystemObject`, and `:843-846` for `custom_dir`. The contract-minimal file therefore aborts with `Config value 'docs_dir': The path '…\build\docs' isn't an existing directory.`, which was reproduced. The generated file restates those three as absolute paths. A negative-control test proves the minimal form fails, and a drift test binds `THEME_CUSTOM_DIR` to `mkdocs.yml`.
2. **The enumerator runs from `web/`.** The contract spells it `npm --prefix web exec --no -- vite-node tools/static-requests.ts -- <data>`. Measured, `npm --prefix web exec` keeps cwd at the repo root, so `tools/static-requests.ts` would resolve to `<root>/tools/…`. `build_pages.py` runs `npm exec --no -- vite-node tools/static-requests.ts -- <abs data>` with cwd `web/`: the same tool and arguments, with a cwd that works.
3. **The lab is built into `build/pages-web/`** through `npm --prefix web run build:pages -- --outDir <abs> --emptyOutDir`. This keeps `web/dist`, which `quviz serve` mounts, as the live-mode build. The build fails if the staged lab contains any `*.map` (spec §5: no sourcemap on Pages) or would overwrite `data/` or `learn/`.
4. **The preview server's strictness is the point.**
   - `/` returns 302 to the sub-path, and the bare sub-path or any directory without a trailing slash returns 301.
   - Anything outside the sub-path, and any `..`, backslash or `:` segment, returns 404.
   - Content types come from an explicit table. Windows `mimetypes` reads the registry and can serve `.js` as `text/plain`.
   - Deliberate differences from Pages: it sends `Cache-Control: no-cache` (Pages sends `max-age=600`) and does not gzip.
   - Material rebases sitemap URLs by protocol and hostname but not port (`function fi` in `bundle.d7400e89.min.js`), so instant navigation degrades to full loads on `127.0.0.1:4180`. The Pages suite therefore does not assert instant navigation.
5. **`pages.yml` least privilege.**
   - Top level: `contents: read`.
   - `build`: `contents: read` plus `pages: read`. `actions/configure-pages` only GETs `/repos/{owner}/{repo}/pages`.
   - `deploy`: `pages: write` plus `id-token: write`.
   - `pages: read` has not been exercised on a real run. It is the one assumption the first deploy verifies (E9 list).
6. **`test:pages` requires a prior full build.** The config throws at load if `build/pages/data/manifest.json` or `build/pages-build.json` is missing. The textbook test needs network access, because MathJax and Mermaid load from the jsDelivr prefixes pinned in `mkdocs.yml`.
7. **Cross-part selector assumptions in `web/pages-e2e/site.spec.ts`** (listed in the summary). Task E4 Step 1 greps each hook before any test is written. Two of them are behavioural rules rather than selectors, and T3/T4 are written around them:
   - **Playback is read off the time pill, not the URL.** B10 writes `t` only while paused. T4 samples the pill's readout, scrubber and `帧 i/N` line in one `evaluate` while playing, then checks the hash after pausing and after one paused step.
   - **Frame provenance is checked only while paused.** D10's `useFramePrefetch` loads the whole period while playing, so "this frame's file was fetched" proves nothing then. T4 checks it on the paused step, where prefetch is off.
   - **The `not_precomputed` refusal is asserted by kind, not wording.** B8 words each spec limit differently, and the `n = 5` reason does not contain `未预计算`. T3 asserts D11's `未预计算` row tag and that the status repeats the row's `title` reason verbatim.
8. **The Docker image is pinned by digest.** It is `mcr.microsoft.com/playwright:v1.62.1-noble@sha256:dcc5531e97840b9b5e794f2814476b21571c5124a3fca2267d73041f56e7580e`; the digest came from the MCR manifest API, and the image config records `NODE_VERSION=24`.
   - Before `npm ci`, the wrapper checks the image's `node --version` against `web/package.json` engines. `tests/test_visual_docker.py` runs the wrapper with a stub `docker`.
   - This is a policy change. `npm run test:visual:update` was previously banned; it is now allowed only inside the container, followed by a same-run comparison and a human review of every PNG.
9. **Calibration stop rule (E7).** If the re-measured half-period control keeps less than 2× the budget at threshold 0.05, stop and escalate. Changing `HALF_PERIOD_REJECTION` also means editing the AST pins in `web/scripts/assert-visual-run.mjs:535-537` and `visualGate.test.ts`.
10. **Status claims must be evidence-based.** Task E8 Step 1 greps each deliverable of A–D before `status.md` claims it.

---

### Task E1: `build_pages.py` pure helpers — site URL, MkDocs Pages config, preview routing, size gate

**Files:**
- Create: `scripts/build_pages.py`
- Create: `tests/test_build_pages.py`

**Interfaces:**
- Consumes:
  - `mkdocs.yml` as left by Part C (contracts "C produces"): `theme.custom_dir: overrides` and `extra.quviz.lab_url: "http://127.0.0.1:8000/"`.
  - The contracts' Pages config shape: `INHERIT` + `site_url: <pages url>learn/` + `extra.quviz.lab_url: "../"`.
- Produces (module `scripts/build_pages.py`):
  - `class BuildError(Exception)`
  - `class Route(NamedTuple)`: `status: int`, `target: str`
  - `class SizeReport(NamedTuple)`: `total: int`, `files: int`, `by_top_level: dict[str, int]`, `largest: list[tuple[str, int]]`
  - `ROOT: Path`, `PAGES_SITE_LIMIT_BYTES = 1_000_000_000`, `THEME_CUSTOM_DIR = "overrides"`, `PAGES_LAB_URL = "../"`, `CONTENT_TYPES: dict[str, str]`
  - `def derive_site_url(remote: str) -> str`
  - `def normalize_site_url(url: str) -> str`
  - `def base_path_of(site_url: str) -> str`
  - `def render_pages_mkdocs_config(root: Path, site_url: str) -> str`
  - `def map_request_path(raw_path: str, prefix: str, site_root: Path) -> Route`
  - `def content_type_for(path: Path) -> str`
  - `def size_report(site_root: Path, top: int = 10) -> SizeReport`
  - `def format_size_report(report: SizeReport) -> str`
  - `def check_site_limit(total: int) -> None`

- [ ] **Step 1: Write the failing tests**

Create `tests/test_build_pages.py`:

```python
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
    assert Path(config["theme"].custom_dir) == ROOT / build_pages.THEME_CUSTOM_DIR
    assert config["extra"]["quviz"]["lab_url"] == "../"
    assert config["watch"] == []


def test_the_contract_minimum_alone_resolves_docs_dir_under_build_and_is_refused(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
) -> None:
    """Negative control: why the generated config restates absolute paths.

    MkDocs resolves ``docs_dir`` (and ``watch``, ``theme.custom_dir``) against the
    directory of the config file it was GIVEN -- build/ -- so ``INHERIT`` + ``site_url`` +
    ``extra`` alone points the build at build/docs, which does not exist.
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
    assert any("docs_dir" in record.getMessage() for record in caplog.records), caplog.text


def test_the_rebased_paths_are_the_ones_mkdocs_yml_declares() -> None:
    raw: dict[str, Any] = yaml.load(
        (ROOT / "mkdocs.yml").read_text(encoding="utf-8"), Loader=_MkDocsSafeLoader
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
    assert build_pages.map_request_path(request_path, PREFIX, site) == build_pages.Route(
        *expected
    )


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
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `uv run --locked --group docs pytest tests/test_build_pages.py -q`
Expected: a collection error. `FileNotFoundError` is raised from `spec.loader.exec_module`, naming `scripts\build_pages.py`, and no test runs.

- [ ] **Step 3: Implement the helpers**

Create `scripts/build_pages.py`:

```python
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

#: ``theme.custom_dir`` in mkdocs.yml. MkDocs resolves it -- like ``docs_dir`` and
#: ``watch`` -- against the directory of the config file it was GIVEN, so the generated
#: build/mkdocs.pages.yml restates it as an absolute path. tests/test_build_pages.py
#: fails when mkdocs.yml stops declaring this value.
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
            f"cannot derive a GitHub Pages URL from the remote {remote.strip()!r}; "
            "pass --site-url"
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
    ``docs_dir``, ``watch`` and ``theme.custom_dir`` are restated because MkDocs resolves
    them against THIS file's directory (build/), not against the inherited mkdocs.yml's.
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
    lines += [f"  {name.ljust(width)}  {_human(size)}" for name, size in report.by_top_level.items()]
    lines.append(f"largest {len(report.largest)} files:")
    lines += [f"  {_human(size)}  {name}" for name, size in report.largest]
    return "\n".join(lines)


def check_site_limit(total: int) -> None:
    if total > PAGES_SITE_LIMIT_BYTES:
        raise BuildError(
            f"the site is {_human(total)}, above GitHub Pages' 1 GB limit for a published "
            "site; shrink StaticCatalogSpec before publishing"
        )
```

- [ ] **Step 4: Run the tests and lint, and confirm they pass**

Run: `uv run --locked --group docs pytest tests/test_build_pages.py -q`
Expected: `50 passed`.

Run: `uv run --locked ruff check scripts/build_pages.py tests/test_build_pages.py` and `uv run --locked ruff format --check scripts/build_pages.py tests/test_build_pages.py`.
Expected: `All checks passed!` and `2 files already formatted`. If the formatter reports a file, run `uv run --locked ruff format scripts/build_pages.py tests/test_build_pages.py`, then re-run both checks.

- [ ] **Step 5: Pre-commit gate (CLAUDE.md), then commit**

Run: `uv run --locked --group docs pytest --cov=quviz --cov-report=term-missing`
Expected: `… passed` with `0 skipped`, and `Required test coverage of 85% reached`.

```bash
git add scripts/build_pages.py tests/test_build_pages.py
git commit -m "$(cat <<'EOF'
feat(pages): add build_pages helpers for site URL, MkDocs Pages config and preview routing

Claude-Session: https://claude.ai/code/session_01E44DEzsc7Av26fc7nZ5rSo
EOF
)"
```

---

### Task E2: `build_pages.py` orchestration, CLI and sub-path preview server; first real full build

**Files:**
- Modify: `scripts/build_pages.py` (import block at the top of the file; append the orchestration section after `check_site_limit`)
- Modify: `tests/test_build_pages.py` (replace the import block; append the orchestration and server tests at the end of the file)
- Modify: `docs/getting-started/development.md`: insert a section immediately before the line `## 提交前门禁` (currently line 65)
- Modify: `docs/reference/quality-gates.md`: insert a section immediately before `## 文档与引用 { #docs-and-citations }` (currently line 116)

**Interfaces:**
- Consumes:
  - Part A: `quviz export-static plan --out <data>` and `quviz export-static render --data <data> --requests <data>/requests.json --workers N`. Part A's Typer option accepts `--workers` in 1..32 only (exit 2 otherwise), and its own default is `default_worker_count()` = `max(1, min(8, os.cpu_count() or 1))`, sized by its estimate of 0.3–0.4 GB peak memory per worker (Part A plan: `default_worker_count` in Task A4, the Typer range in Task A5, the memory estimate under "Budget").
  - Part A: `<data>/manifest.json` with `format: "quviz-static/1"` and a string `version`.
  - Part B: `web/tools/static-requests.ts` run by vite-node with `-- <data>`, writing `<data>/requests.json`.
  - Part B: `"build:pages": "tsc -b && vite build --mode pages --sourcemap false"`.
  - Part C: a MkDocs site that builds `--strict` through the generated config.
- Produces:
  - Types:
    - `class Layout(NamedTuple)`: `root`, `build`, `pages`, `data`, `web_out`, `mkdocs_config`, `build_info`, all `Path`
    - `class Tools(NamedTuple)`: `uv: str`, `npm: str`
    - `class BuildOptions(NamedTuple)`: `site_url: str`, `workers: int`, `skip_data: bool`
    - `Runner = Callable[[str, Sequence[str], Path], None]`
  - Constants: `MAX_WORKERS = 32` (Part A's `--workers` upper bound)
  - Functions:
    - `def layout_for(root: Path) -> Layout`
    - `def default_workers() -> int`: the same value as Part A's `default_worker_count()`, the CPU count capped at 8
    - `def git_origin_url(root: Path) -> str`
    - `def find_tools(root: Path) -> Tools`
    - `def run_step(label: str, argv: Sequence[str], cwd: Path) -> None`
    - `def prepare_output(layout: Layout, skip_data: bool) -> None`
    - `def read_manifest_version(data_dir: Path) -> str`
    - `def copy_web_build(web_out: Path, pages: Path) -> None`
    - `def build_site(layout: Layout, options: BuildOptions, tools: Tools, runner: Runner = run_step) -> SizeReport`
    - `def make_server(site_root: Path, prefix: str, port: int) -> http.server.ThreadingHTTPServer`
    - `def serve(site_root: Path, prefix: str, port: int) -> None`
    - `def parse_args(argv: Sequence[str] | None) -> argparse.Namespace`
    - `def main(argv: Sequence[str] | None = None) -> int`
  - Files:
    - `build/pages/` (site root: lab files + `data/` + `learn/` + `.nojekyll`)
    - `build/pages-web/` (staged lab build)
    - `build/mkdocs.pages.yml`
    - `build/pages-build.json` = `{"format": "quviz-pages-build/1", "site_url": "<normalized>", "base_path": "/<repo>/", "data_version": "<manifest.version>"}`
  - CLI: `--site-url URL`, `--workers N` (1..32, default `default_workers()`), `--skip-data`, `--serve PORT`.

- [ ] **Step 1: Write the failing tests**

In `tests/test_build_pages.py`, replace the import block (everything from `import importlib.util` through `from mkdocs.exceptions import Abort`) with:

```python
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
```

Append at the end of `tests/test_build_pages.py`:

```python
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

    report = build_pages.build_site(layout, build_pages.BuildOptions(PAGES_URL, 3, False), TOOLS, runner)

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
    with pytest.raises(build_pages.BuildError, match="manifest.json"):
        build_pages.build_site(layout, build_pages.BuildOptions(PAGES_URL, 3, True), TOOLS, runner)
    assert runner.calls == []


def test_an_exporter_manifest_of_another_format_stops_the_build(tmp_path: Path) -> None:
    layout = _layout(tmp_path)
    runner = FakeRunner(manifest={**MANIFEST, "format": "something-else"})
    with pytest.raises(build_pages.BuildError, match="quviz-static/1"):
        build_pages.build_site(layout, build_pages.BuildOptions(PAGES_URL, 3, False), TOOLS, runner)
    assert not any("build:pages" in args for args, _ in runner.calls)


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
        assert (status, headers["Content-Type"], body) == (200, "application/octet-stream", b"QVPC\x01\x00")
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
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `uv run --locked --group docs pytest tests/test_build_pages.py -q`
Expected: a collection error, `AttributeError: module 'build_pages' has no attribute 'Tools'`, raised by the module-level `TOOLS = build_pages.Tools(...)`. No test runs, including the 50 from E1. That is the correct red state: the module's new public surface does not exist yet.

- [ ] **Step 3: Implement the orchestration, CLI and server**

In `scripts/build_pages.py`, replace the import block (`import json` … `from urllib.parse import unquote, urlsplit`) with:

```python
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
```

Append after `check_site_limit`:

```python
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
            "this checkout has no git remote 'origin' to derive the Pages URL from; "
            "pass --site-url"
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
        step("plan the static catalog", [*uv_run, "quviz", "export-static", "plan", "--out", data], layout.root)
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
    report = size_report(layout.pages)
    print(format_size_report(report), flush=True)
    check_site_limit(report.total)
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
```

- [ ] **Step 4: Run the tests and lint, and confirm they pass**

Run: `uv run --locked --group docs pytest tests/test_build_pages.py -q`
Expected: `71 passed` (E1's 50, plus 21 here: 6 rejected argument forms and 4 default-worker cases among them).

Run: `uv run --locked ruff check scripts/build_pages.py tests/test_build_pages.py` then `uv run --locked ruff format --check scripts/build_pages.py tests/test_build_pages.py`.
Expected: `All checks passed!` and `2 files already formatted`. The `# fmt: skip` markers keep the argv lists one-per-line readable; if the formatter still reports a change, run `ruff format` on the two files and re-check.

- [ ] **Step 5: Document the build**

In `docs/getting-started/development.md`, insert immediately before the line `## 提交前门禁`:

````markdown
## 静态教材站（GitHub Pages）

教材站由 `scripts/build_pages.py` 在本地组装到 `build/pages/`（`build/` 已被 `.gitignore` 忽略，预计算数据不入库）：

```bash
uv run --locked --no-sync python scripts/build_pages.py                            # 完整构建：预计算数据 + 实验室 + 教材
uv run --locked --no-sync python scripts/build_pages.py --skip-data                # 复用上次的 build/pages/data，只重建实验室与教材
uv run --locked --no-sync python scripts/build_pages.py --skip-data --serve 4180   # 重建后按仓库子路径预览
```

完整构建依次运行：

1. `quviz export-static plan` 写出目录与规格；
2. `web/tools/static-requests.ts` 由前端真实请求代码枚举 `requests.json`；
3. `quviz export-static render --workers N` 通过 ASGI 逐字回放每个请求。N 默认与导出器相同，取 CPU 数且最多 8：每个进程峰值约 0.3–0.4 GB 内存。导出器只接受 1–32，超出范围时脚本在任何步骤之前拒绝；
4. `npm --prefix web run build:pages` 构建实验室，输出到 `build/pages-web/`，不覆盖 `quviz serve` 挂载的 `web/dist`；
5. 生成 `build/mkdocs.pages.yml` 并 `mkdocs build --strict` 到 `build/pages/learn/`。

最后合并实验室文件、写入 `.nojekyll`，并打印体积报告（总量、各顶层目录、最大 10 个文件）。实验室构建里出现 sourcemap，或整站超过 GitHub Pages 的 1 GB 上限，构建都会失败。完整构建的耗时主要花在第 3 步。

`site_url` 默认由 `git remote get-url origin` 推导为 `https://<owner>.github.io/<repo>/`，也可以用 `--site-url` 指定。它只影响教材的 sitemap、canonical 与预览子路径；实验室本身全部使用相对路径。`--serve` 在 `http://127.0.0.1:<端口>/<repo>/` 预览，并且只在这个子路径下应答，与 Pages 一致：`/` 跳转到子路径，子路径之外一律 404。所以任何写死根路径的资源都会在预览里暴露。预览与 Pages 的两处刻意差异如下：

- 预览发送 `Cache-Control: no-cache`，不压缩；
- Material 的 instant navigation 按 sitemap 重定位链接时只替换协议与主机名、不替换端口，所以在本地端口上退化为整页跳转，在 Pages 上正常。

````

In `docs/reference/quality-gates.md`, insert immediately before the line `## 文档与引用 { #docs-and-citations }`:

```markdown
## 静态教材站与发布

- ✅ `scripts/build_pages.py` 自身的决定 — `tests/test_build_pages.py` 钉住以下各项：
    - `site_url` 由 ssh/https 形式的 GitHub remote 推导；`<owner>.github.io` 用户站点落在根路径；非 GitHub remote 直接拒绝并要求 `--site-url`，而不是猜测。
    - 生成的 `build/mkdocs.pages.yml` 由 MkDocs 自己的 `load_config` 校验通过。负控：只含 `INHERIT`、`site_url`、`extra` 的最小写法会因 `docs_dir` 被相对 `build/` 解析而失败；`theme.custom_dir` 与 `mkdocs.yml` 的声明互校。
    - 预览服务器只在仓库子路径下应答：`/` 302 到子路径，子路径外 404，目录补斜杠 301，`..` 与反斜杠拒绝；`.bin` 为 `application/octet-stream`，`.json` 为 `application/json`。
    - 编排按固定顺序调用导出、枚举、渲染、`build:pages` 与 MkDocs；`--skip-data` 复用上次数据，缺少 `manifest.json` 时在任何步骤之前失败。
    - `--workers` 默认取 CPU 数且最多 8，与导出器自己的默认相同；超出导出器接受的 1–32 时在任何步骤之前拒绝。
    - 实验室构建若会覆盖 `data/`、`learn/` 或带 sourcemap 即失败；整站超过 GitHub Pages 1 GB 上限时构建失败；

```

- [ ] **Step 6: Run the docs gates**

Run: `uv run --locked --group docs pytest tests/test_docs_integrity.py tests/test_mkdocs_system.py -q` then `uv run --locked --group docs mkdocs build --strict`.
Expected: all passed; `INFO    -  Documentation built in … seconds`. The new text contains only loopback URLs, so `check_links` would skip it.

- [ ] **Step 7: First real full build (integration of Parts A–D)**

Run in the background, and wait for the final line:
`uv run --locked --no-sync python scripts/build_pages.py 2>&1 | tee build/pages-build.log`

Expected:
- Five `==> [k/5] …` banners, each followed by `ok in … s`.
- A size report whose `by top-level entry:` lists `(root files)`, `assets/`, `data/` and `learn/`. The total is well under 1 GB; spec §4.1 estimates about 280 MB raw.
- The last line is `build_pages: site ready in …\build\pages (site_url https://longwarriors.github.io/Atmoic-quantum-visualization/)`.

If a step fails, the message names the step and its exit code. Fix it in the owning part's code: exporter → A, enumerator/`build:pages` → B, MkDocs → C. Do not add a workaround here.

- [ ] **Step 8: Preview smoke**

Run in the background: `uv run --locked --no-sync python scripts/build_pages.py --skip-data --serve 4180`. Wait for `build_pages: previewing http://127.0.0.1:4180/Atmoic-quantum-visualization/`. Then:

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:4180/Atmoic-quantum-visualization/
curl -s -o /dev/null -w "%{http_code} %{redirect_url}\n" http://127.0.0.1:4180/
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:4180/Atmoic-quantum-visualization/learn/
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:4180/index.html
curl -s http://127.0.0.1:4180/Atmoic-quantum-visualization/data/manifest.json | head -c 60
```

Expected, in order:
- `200`
- `302 http://127.0.0.1:4180/Atmoic-quantum-visualization/`
- `200`
- `404`
- a line starting `{"format": "quviz-static/1"` (whitespace may differ)

Then open `http://127.0.0.1:4180/Atmoic-quantum-visualization/` in a browser, and confirm the lab renders the opening 2p_z point cloud. Stop the background server.

Run: `git status --short`
Expected: only the four files of this task are modified. `build/` is ignored.

- [ ] **Step 9: Pre-commit gate (CLAUDE.md), then commit**

Run: `uv run --locked --group docs pytest --cov=quviz --cov-report=term-missing`
Expected: `… passed`, `0 skipped`, coverage ≥ 85%.

```bash
git add scripts/build_pages.py tests/test_build_pages.py docs/getting-started/development.md docs/reference/quality-gates.md
git commit -m "$(cat <<'EOF'
feat(pages): build the Pages site locally and preview it under the repository sub-path

Claude-Session: https://claude.ai/code/session_01E44DEzsc7Av26fc7nZ5rSo
EOF
)"
```

---

### Task E3: `.github/workflows/pages.yml` — publisher with pinned structure, and Node pins over every workflow

**Files:**
- Create: `.github/workflows/pages.yml`
- Create: `tests/test_pages_workflow.py`
- Modify: `tests/test_declared_versions.py`: add `import yaml` and a `WORKFLOWS`/`PAGES_WORKFLOW` constant next to `CI_WORKFLOW` (line 30); extend `test_node_version_files_and_ci_pin_the_lowest_supported_runtime` (lines 132-144); append new tests
- Modify: `docs/reference/quality-gates.md`: append one bullet to the section `## 静态教材站与发布` (added in E2)
- Modify: `docs/getting-started/development.md`: append one paragraph to the section `## 静态教材站（GitHub Pages）` (added in E2)

**Interfaces:**
- Consumes:
  - `scripts/build_pages.py --site-url URL` (E2); `normalize_site_url` accepts configure-pages' `base_url`, which has no trailing slash.
  - `tests/test_ci_workflows.py` rules, applied to every `*.yml`: `uv sync --locked --all-groups`, `astral-sh/setup-uv@v10.0.1`, no `npm install`, every job has steps.
- Produces:
  - workflow `Pages`: jobs `build` and `deploy`; artifact path `build/pages`; environment `github-pages`.
  - `pages_workflow_problems(workflow: dict[str, Any]) -> list[str]` in `tests/test_pages_workflow.py`.
  - `setup_node_pin_problems(workflow: dict[str, Any], label: str, minimum: str) -> list[str]` in `tests/test_declared_versions.py`.

- [ ] **Step 1: Write the failing tests**

Create `tests/test_pages_workflow.py`:

```python
"""Pins on .github/workflows/pages.yml, the publisher of the static textbook site.

It is a publisher, not a gate: CLAUDE.md makes local verification final, and a site is
releasable once `scripts/build_pages.py` and `npm run test:pages` pass locally. What is
pinned here is therefore what makes a deployment *that* site: it runs only for master (or
by hand), rebuilds everything from the checkout with the same script (never --skip-data),
takes its public URL from actions/configure-pages, uploads exactly build/pages, and hands
write access only to the job that deploys. The workflow-wide rules (locked installs, one
setup-uv release) live in tests/test_ci_workflows.py and already glob this file; its
setup-node pin lives in tests/test_declared_versions.py.

As in the sibling modules, the predicate is a module-level function, and every rule has a
negative control that feeds it a sabotaged copy of the real workflow.
"""

from __future__ import annotations

import copy
import re
from collections.abc import Callable
from pathlib import Path
from typing import Any

import pytest
import yaml

ROOT = Path(__file__).resolve().parents[1]
PAGES_WORKFLOW = ROOT / ".github" / "workflows" / "pages.yml"

#: ``on:`` parses to the YAML 1.1 boolean ``True``.
_ON_KEY = True

BUILD_COMMAND = 'uv run --locked --no-sync python scripts/build_pages.py --site-url "$SITE_URL"'
SITE_URL_INPUT = "${{ steps.pages.outputs.base_url }}"
PAGE_URL_OUTPUT = "${{ steps.deployment.outputs.page_url }}"

#: The build job's steps, in order: ``uses`` entries match by action prefix, ``run``
#: entries match the whitespace-normalised script exactly.
BUILD_STEPS: tuple[tuple[str, str], ...] = (
    ("uses", "actions/checkout@"),
    ("uses", "astral-sh/setup-uv@"),
    ("uses", "actions/setup-node@"),
    ("run", "uv sync --locked --all-groups"),
    ("run", "npm --prefix web ci --no-audit --no-fund"),
    ("uses", "actions/configure-pages@"),
    ("run", BUILD_COMMAND),
    ("uses", "actions/upload-pages-artifact@"),
)

_RELEASE_TAG = re.compile(r"^[\w.-]+/[\w.-]+@v\d+(?:\.\d+\.\d+)?$")


def _load() -> dict[str, Any]:
    assert PAGES_WORKFLOW.is_file(), f"{PAGES_WORKFLOW} does not exist"
    parsed = yaml.safe_load(PAGES_WORKFLOW.read_text(encoding="utf-8"))
    assert isinstance(parsed, dict), f"{PAGES_WORKFLOW} does not parse as a mapping"
    return parsed


def _normalise(script: object) -> str:
    return " ".join(str(script).split())


def _steps(job: dict[str, Any]) -> list[dict[str, Any]]:
    steps = job.get("steps")
    return [step for step in steps if isinstance(step, dict)] if isinstance(steps, list) else []


def _matches(step: dict[str, Any], kind: str, value: str) -> bool:
    if kind == "uses":
        return str(step.get("uses", "")).startswith(value)
    return "uses" not in step and _normalise(step.get("run", "")) == value


def _build_problems(job: dict[str, Any]) -> list[str]:
    problems: list[str] = []
    if job.get("runs-on") != "ubuntu-latest":
        problems.append(f"build job must run on ubuntu-latest, found {job.get('runs-on')!r}")
    if job.get("permissions") != {"contents": "read", "pages": "read"}:
        problems.append(
            "build job permissions must be exactly contents: read and pages: read "
            f"(configure-pages only reads the site); found {job.get('permissions')!r}"
        )
    steps = _steps(job)
    for step in steps:
        script = _normalise(step.get("run", ""))
        if "build_pages.py" in script and ("--skip-data" in script or "--serve" in script):
            problems.append(
                "the deploy build must regenerate the data from this checkout: "
                "no --skip-data or --serve"
            )
    if len(steps) != len(BUILD_STEPS) or not all(
        _matches(step, kind, value) for step, (kind, value) in zip(steps, BUILD_STEPS, strict=False)
    ):
        shape = [str(step.get("uses") or _normalise(step.get("run", ""))) for step in steps]
        problems.append(f"build steps must be, in order, {BUILD_STEPS}; found {shape}")
    configure = [s for s in steps if str(s.get("uses", "")).startswith("actions/configure-pages@")]
    if not configure or configure[0].get("id") != "pages":
        problems.append("the actions/configure-pages step must have id `pages`")
    build = [s for s in steps if "build_pages.py" in _normalise(s.get("run", ""))]
    if not build or build[0].get("env") != {"SITE_URL": SITE_URL_INPUT}:
        problems.append(f"the build step must take SITE_URL from {SITE_URL_INPUT} (base_url)")
    upload = [
        s for s in steps if str(s.get("uses", "")).startswith("actions/upload-pages-artifact@")
    ]
    if not upload or (upload[0].get("with") or {}).get("path") != "build/pages":
        problems.append("actions/upload-pages-artifact must upload exactly build/pages")
    return problems


def _deploy_problems(job: dict[str, Any]) -> list[str]:
    problems: list[str] = []
    if job.get("needs") != "build":
        problems.append(f"deploy needs build, found needs = {job.get('needs')!r}")
    if job.get("runs-on") != "ubuntu-latest":
        problems.append(f"deploy job must run on ubuntu-latest, found {job.get('runs-on')!r}")
    if job.get("permissions") != {"pages": "write", "id-token": "write"}:
        problems.append(
            "deploy job permissions must be exactly pages: write and id-token: write; "
            f"found {job.get('permissions')!r}"
        )
    if job.get("environment") != {"name": "github-pages", "url": PAGE_URL_OUTPUT}:
        problems.append(
            f"deploy must use the github-pages environment with url {PAGE_URL_OUTPUT}; "
            f"found {job.get('environment')!r}"
        )
    steps = _steps(job)
    if (
        len(steps) != 1
        or not str(steps[0].get("uses", "")).startswith("actions/deploy-pages@")
        or steps[0].get("id") != "deployment"
    ):
        problems.append("deploy must be exactly one actions/deploy-pages step with id deployment")
    return problems


def _escape_problems(name: str, job: dict[str, Any]) -> list[str]:
    problems = [
        f"`{name}` job carries `{escape}`; a publisher step must not be conditional or advisory"
        for escape in ("if", "continue-on-error")
        if escape in job
    ]
    for index, step in enumerate(_steps(job)):
        problems += [
            f"`{name}` job step {index} carries `{escape}`"
            for escape in ("if", "continue-on-error")
            if escape in step
        ]
    return problems


def _pin_problems(name: str, job: dict[str, Any]) -> list[str]:
    return [
        f"`{name}` job uses {step['uses']!r}, which is not pinned to a release tag"
        for step in _steps(job)
        if "uses" in step and not _RELEASE_TAG.match(str(step["uses"]))
    ]


def pages_workflow_problems(workflow: dict[str, Any]) -> list[str]:
    """Every way ``workflow`` differs from the reviewed Pages publisher."""

    problems: list[str] = []
    triggers = workflow.get(_ON_KEY)
    if not isinstance(triggers, dict) or set(triggers) != {"push", "workflow_dispatch"}:
        problems.append(
            "triggers must be exactly push and workflow_dispatch; a pull request must never "
            f"deploy. Found {triggers!r}"
        )
    elif triggers["push"] != {"branches": ["master"]}:
        problems.append(f"push must be limited to branches [master]; found {triggers['push']!r}")
    if workflow.get("permissions") != {"contents": "read"}:
        problems.append(
            "top-level permissions must be exactly contents: read, so no job inherits write "
            f"access; found {workflow.get('permissions')!r}"
        )
    if workflow.get("concurrency") != {"group": "pages", "cancel-in-progress": False}:
        problems.append(
            "concurrency must be group `pages` with cancel-in-progress false, so a running "
            f"deployment is never cut off; found {workflow.get('concurrency')!r}"
        )
    jobs = workflow.get("jobs")
    if not isinstance(jobs, dict) or set(jobs) != {"build", "deploy"}:
        found = sorted(jobs) if isinstance(jobs, dict) else jobs
        problems.append(f"jobs must be exactly build and deploy; found {found!r}")
        return problems
    problems += _build_problems(jobs["build"])
    problems += _deploy_problems(jobs["deploy"])
    for name, job in jobs.items():
        problems += _escape_problems(str(name), job)
        problems += _pin_problems(str(name), job)
    return problems


def test_the_pages_workflow_publishes_only_the_locally_verified_build() -> None:
    assert pages_workflow_problems(_load()) == []


def _step(workflow: dict[str, Any], job: str, needle: str) -> dict[str, Any]:
    return next(
        step
        for step in workflow["jobs"][job]["steps"]
        if needle in str(step.get("uses", "")) or needle in _normalise(step.get("run", ""))
    )


def _remove_configure_pages(workflow: dict[str, Any]) -> None:
    workflow["jobs"]["build"]["steps"].remove(_step(workflow, "build", "configure-pages"))


MUTATIONS: list[tuple[str, Callable[[dict[str, Any]], object], str]] = [
    ("pull_request trigger", lambda wf: wf[_ON_KEY].update({"pull_request": None}), "triggers"),
    ("push to every branch", lambda wf: wf[_ON_KEY].update({"push": None}), "push must be limited"),
    (
        "write access for every job",
        lambda wf: wf.update({"permissions": {"contents": "read", "pages": "write", "id-token": "write"}}),
        "top-level permissions",
    ),
    (
        "OIDC token in the build job",
        lambda wf: wf["jobs"]["build"]["permissions"].update({"id-token": "write"}),
        "build job permissions",
    ),
    ("no concurrency group", lambda wf: wf.pop("concurrency"), "concurrency"),
    (
        "cancel an in-flight deployment",
        lambda wf: wf["concurrency"].update({"cancel-in-progress": True}),
        "concurrency",
    ),
    ("deploy without needs", lambda wf: wf["jobs"]["deploy"].pop("needs"), "needs"),
    (
        "another environment",
        lambda wf: wf["jobs"]["deploy"]["environment"].update({"name": "production"}),
        "github-pages",
    ),
    (
        "skip-data deploy",
        lambda wf: _step(wf, "build", "build_pages.py").update({"run": BUILD_COMMAND + " --skip-data"}),
        "--skip-data",
    ),
    (
        "site URL not from configure-pages",
        lambda wf: _step(wf, "build", "build_pages.py").update({"env": {"SITE_URL": "https://example.org/"}}),
        "base_url",
    ),
    (
        "wrong artifact path",
        lambda wf: _step(wf, "build", "upload-pages-artifact").update({"with": {"path": "build"}}),
        "build/pages",
    ),
    (
        "conditional build step",
        lambda wf: _step(wf, "build", "build_pages.py").update({"if": "always()"}),
        "`if`",
    ),
    (
        "advisory deploy job",
        lambda wf: wf["jobs"]["deploy"].update({"continue-on-error": True}),
        "continue-on-error",
    ),
    (
        "floating action ref",
        lambda wf: _step(wf, "deploy", "deploy-pages").update({"uses": "actions/deploy-pages@main"}),
        "release tag",
    ),
    ("configure-pages removed", _remove_configure_pages, "build steps must be"),
    (
        "an extra job",
        lambda wf: wf["jobs"].update({"lint": {"runs-on": "ubuntu-latest", "steps": [{"run": "true"}]}}),
        "jobs must be exactly",
    ),
]  # fmt: skip


@pytest.mark.parametrize(
    ("label", "mutate", "expected"), MUTATIONS, ids=[label for label, _, _ in MUTATIONS]
)
def test_a_drifted_pages_workflow_is_rejected(
    label: str, mutate: Callable[[dict[str, Any]], object], expected: str
) -> None:
    workflow = copy.deepcopy(_load())
    mutate(workflow)
    problems = pages_workflow_problems(workflow)
    assert any(expected in problem for problem in problems), f"{label}: {problems}"
```

In `tests/test_declared_versions.py`:

- after `import pytest` (line 20), add `import yaml` and `from typing import Any`, keeping the isort order: `from typing import Any` goes in the stdlib block after `from pathlib import Path`, and `import yaml` after `import pytest`;
- after `CI_WORKFLOW = …` (line 30), add:

```python
WORKFLOWS = ROOT / ".github" / "workflows"
PAGES_WORKFLOW = WORKFLOWS / "pages.yml"
```

- replace the body of `test_node_version_files_and_ci_pin_the_lowest_supported_runtime` (lines 132-144) with:

```python
def _minimum_node() -> str:
    return ".".join(str(part) for part in min(_engine_lower_bounds(_node_engines_range())))


def test_node_version_files_and_ci_pin_the_lowest_supported_runtime() -> None:
    """Local version managers and every front-end CI job use one exact baseline."""

    minimum = _minimum_node()
    assert NODE_VERSION.read_text(encoding="utf-8").strip() == minimum
    assert NVMRC.read_text(encoding="utf-8").strip() == minimum

    workflow = CI_WORKFLOW.read_text(encoding="utf-8")
    ci_versions = re.findall(r'^\s*node-version:\s*["\']?([^"\'\s]+)', workflow, re.MULTILINE)
    assert len(ci_versions) == 3, (
        "the three web, full-stack and visual setup-node steps must each pin a runtime"
    )
    assert set(ci_versions) == {minimum}

    pages = PAGES_WORKFLOW.read_text(encoding="utf-8")
    pages_versions = re.findall(r'^\s*node-version:\s*["\']?([^"\'\s]+)', pages, re.MULTILINE)
    assert pages_versions == [minimum], (
        "the Pages build's single setup-node step must pin the same runtime as CI"
    )
```

- append at the end of the file:

```python
def setup_node_pin_problems(workflow: dict[str, Any], label: str, minimum: str) -> list[str]:
    """Every ``actions/setup-node`` step in ``workflow`` that does not pin ``minimum``."""

    problems: list[str] = []
    jobs = workflow.get("jobs") or {}
    for job_name, job in jobs.items():
        for index, step in enumerate((job or {}).get("steps") or []):
            if not str(step.get("uses", "")).startswith("actions/setup-node@"):
                continue
            inputs = step.get("with") or {}
            where = f"{label} job `{job_name}` step {index}"
            if "node-version-file" in inputs:
                problems.append(
                    f"{where} reads node-version-file; spell node-version: \"{minimum}\" so "
                    "this gate compares it"
                )
            if str(inputs.get("node-version", "")) != minimum:
                problems.append(
                    f"{where} pins node-version {inputs.get('node-version')!r}, not {minimum!r}"
                )
    return problems


def test_every_workflow_setup_node_step_pins_the_lowest_supported_runtime() -> None:
    """Every workflow file, not only ci.yml: a new workflow cannot drift unpinned."""

    minimum = _minimum_node()
    files = sorted(WORKFLOWS.glob("*.yml")) + sorted(WORKFLOWS.glob("*.yaml"))
    assert PAGES_WORKFLOW in files, "the Pages workflow is gone; this pin exists for it"
    problems: list[str] = []
    for path in files:
        problems += setup_node_pin_problems(
            yaml.safe_load(path.read_text(encoding="utf-8")), path.name, minimum
        )
    assert not problems, "\n".join(problems)


@pytest.mark.parametrize(
    ("inputs", "reason"),
    [
        ({}, "no node-version at all"),
        ({"node-version": "22"}, "a floating major"),
        ({"node-version": "24.15.0"}, "a supported but different runtime"),
        ({"node-version-file": ".node-version"}, "a file the gate cannot compare"),
    ],
)
def test_a_setup_node_step_that_drifts_from_the_pin_is_rejected(
    inputs: dict[str, str], reason: str
) -> None:
    workflow = {"jobs": {"web": {"steps": [{"uses": "actions/setup-node@v6", "with": inputs}]}}}
    assert setup_node_pin_problems(workflow, "<synthetic>", _minimum_node()), reason
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `uv run --locked --group docs pytest tests/test_pages_workflow.py tests/test_declared_versions.py -q`
Expected:
- `tests/test_pages_workflow.py`: every test fails with `AssertionError: …pages.yml does not exist`, 17 in all.
- `tests/test_declared_versions.py`: `test_node_version_files_and_ci_pin_the_lowest_supported_runtime` and `test_every_workflow_setup_node_step_pins_the_lowest_supported_runtime` fail with `FileNotFoundError` or the missing-workflow assertion.
- The 4 drift controls pass. They exercise the predicate alone.

- [ ] **Step 3: Create the workflow**

Create `.github/workflows/pages.yml`:

```yaml
name: Pages

# The publisher of the static textbook site -- not a gate. CLAUDE.md makes local
# verification final: `scripts/build_pages.py` and `npm run test:pages` prove the site
# locally, and this workflow only re-runs the same script on master and deploys what it
# wrote. tests/test_pages_workflow.py pins its structure (triggers, least-privilege
# permissions, the exact build steps, the artifact and the environment);
# tests/test_declared_versions.py pins its Node; tests/test_ci_workflows.py holds it to
# the locked-install and single-setup-uv rules every workflow shares.
#
# Prerequisite (a maintainer action, not done by any commit): Settings -> Pages -> Build
# and deployment -> Source = GitHub Actions. Until then configure-pages fails.

permissions:
  contents: read

on:
  push:
    branches: [master]
  workflow_dispatch:

concurrency:
  group: pages
  cancel-in-progress: false

jobs:
  build:
    runs-on: ubuntu-latest
    # The exporter renders every precomputed scene; the render step dominates.
    timeout-minutes: 120
    permissions:
      contents: read
      pages: read
    steps:
      - uses: actions/checkout@v6
      - name: Install uv
        uses: astral-sh/setup-uv@v10.0.1
        with:
          enable-cache: true
          python-version: "3.12"
      - uses: actions/setup-node@v6
        with:
          node-version: "22.22.2"
      - name: Sync
        run: uv sync --locked --all-groups
      - name: Install frontend dependencies
        run: npm --prefix web ci --no-audit --no-fund
      - name: Read the Pages site URL
        id: pages
        uses: actions/configure-pages@v6
      # A full build, never --skip-data: the deployed data is rendered from this checkout.
      - name: Build the site
        env:
          SITE_URL: ${{ steps.pages.outputs.base_url }}
        run: uv run --locked --no-sync python scripts/build_pages.py --site-url "$SITE_URL"
      - uses: actions/upload-pages-artifact@v5
        with:
          path: build/pages

  deploy:
    needs: build
    runs-on: ubuntu-latest
    permissions:
      pages: write
      id-token: write
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - name: Deploy
        id: deployment
        uses: actions/deploy-pages@v5
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `uv run --locked --group docs pytest tests/test_pages_workflow.py tests/test_declared_versions.py tests/test_ci_workflows.py -q`
Expected: all passed. The Pages module contributes 17, `test_declared_versions.py` gains 5, and every `test_ci_workflows.py` rule now also covers `pages.yml`.

Run: `uv run --locked ruff check tests/test_pages_workflow.py tests/test_declared_versions.py` and `uv run --locked ruff format --check tests/test_pages_workflow.py tests/test_declared_versions.py`.
Expected: `All checks passed!`, `2 files already formatted`.

- [ ] **Step 5: Document**

In `docs/reference/quality-gates.md`, append directly after the E2 bullet, whose last line ends `整站超过 GitHub Pages 1 GB 上限时构建失败；`:

```markdown
- ✅ 发布 workflow 的结构 — `tests/test_pages_workflow.py` 钉住 `.github/workflows/pages.yml` 的以下各项，每类篡改都有负控：
    - 只在 master push 与手动触发时运行。
    - 顶层只读权限；`build` 只有 `contents: read` 与 `pages: read`；`deploy` 只有 `pages: write` 与 `id-token: write`，并使用 `github-pages` environment。
    - 构建步骤逐项固定：锁定安装；`actions/configure-pages` 的 `base_url` 传给 `--site-url`；完整重建而非 `--skip-data`；上传 `build/pages`。
    - 任何步骤不得带 `if:` / `continue-on-error:`；action 只能引用版本 tag。

    Node 版本由 `tests/test_declared_versions.py` 对**所有** workflow 的 `actions/setup-node` 步骤统一钉为 `.node-version`；锁定安装与 setup-uv 版本由 `tests/test_ci_workflows.py` 对所有 workflow 统一检查。该 workflow 是发布器而不是门禁：可发布的判据是本地的完整构建与 `npm run test:pages`；
```

In `docs/getting-started/development.md`, append at the end of the section `## 静态教材站（GitHub Pages）` (after the paragraph about the preview's differences from Pages):

```markdown
`.github/workflows/pages.yml` 在 master 更新时用同一脚本完整重建站点，`site_url` 取自 `actions/configure-pages`，然后部署。它是发布器而不是门禁：可发布的判据仍是本地的完整构建与浏览器门禁。首次使用前，需要维护者在仓库设置中把 Pages 的构建来源设为 GitHub Actions。
```

Run: `uv run --locked --group docs pytest tests/test_docs_integrity.py tests/test_mkdocs_system.py -q` and `uv run --locked --group docs mkdocs build --strict`.
Expected: all passed; `Documentation built`.

- [ ] **Step 6: Pre-commit gate (CLAUDE.md), then commit**

Run: `uv run --locked --group docs pytest --cov=quviz --cov-report=term-missing`
Expected: `… passed`, `0 skipped`, coverage ≥ 85%.

```bash
git add .github/workflows/pages.yml tests/test_pages_workflow.py tests/test_declared_versions.py docs/reference/quality-gates.md docs/getting-started/development.md
git commit -m "$(cat <<'EOF'
ci(pages): publish build_pages output with a pinned least-privilege workflow

Claude-Session: https://claude.ai/code/session_01E44DEzsc7Av26fc7nZ5rSo
EOF
)"
```

---

### Task E4: `web/pages-e2e/` — the static site driven through the real UI under the sub-path

**Files:**
- Create: `web/playwright.pages.config.ts`
- Create: `web/pages-e2e/site.spec.ts`
- Modify: `web/tsconfig.e2e.json` (the `$comment` at line 2 and the `include` array at lines 23-28)
- Modify: `web/src/guards.test.ts`:
  - the root constants after line 781;
  - the doc comment at lines 765-779;
  - the test `reaches both Playwright suites, which no other guard in this file sees` (lines 983-996);
  - add a scan test after the `…in the full-stack suite` test (lines 1359-1367).

**Interfaces:**
- Consumes:
  - E2: `build/pages-build.json` (`format`, `site_url`, `base_path`), the prior full build in `build/pages/data/`, and `build_pages.py --skip-data --site-url URL --serve PORT`.
  - Part A: `data/manifest.json` = `{format: "quviz-static/1", entries: {key: {file: "files/<hash>.json|.bin", …}}}`.
  - Part B:
    - the deep-link keys `embed`, `mode`, `n`, `l`, `m`, `basis`, `preset`, `t`, `rep`, written back with `history.replaceState`;
    - B10 `deepLinkFromStore`: `t` is written **only while paused** and omitted at `t = 0` (`if (!state.playing && state.timeAu !== 0)`), pinned by B's `does not rewrite the hash on playback ticks, and records the time on pause`. While a superposition plays, the hash carries no `t`, so T4 reads the playing frames off the time pill and checks the hash only after pausing;
    - the static transport, fetching `data/files/*` with a plain `fetch` (no cache override);
    - refusal status `not_precomputed`. Its reason is not one fixed sentence: B8's `staticRefusal` words each spec limit differently (for `n = 5`: `静态教材版只预计算 n ≤ 4 的本征态；…`) and `STATIC_MISS_REASON` covers manifest misses. T3 therefore asserts the refusal *kind* through D11's tag and binds the status text to the row's reason, never to a wording;
    - the static capability overlay offers the manifest's frame times as `ParameterBound.values`: for 1s + 2p_z, the 28 frames `playbackFrames(16.755…)` = `0, 0.6, …, 16.2` (checked against `tests/fixtures/visual/catalog-superposition.json`: period 16.755160819145562, 28 frames, each equal to `k × 0.6`).
  - Part C: `<figure class="quviz-figure" data-lab="…">` under `learn/textbook/**/index.html`, a button whose name contains `加载交互图`, a link `在实验室中打开`, and an iframe inserted on click.
  - Part D:
    - `[data-chrome]` panels, exactly one `<canvas>`, and `[data-scene-ready]` carrying `sceneIdentityKey` (`web/src/components/sceneRequest.ts:140-160`);
    - `span[data-status]` with `ready`/`unavailable`, whose unavailable text is `…暂不可用 · <reason>` (D12 `statusLine`);
    - `button[data-representation]` with `aria-pressed`; when refused, `data-unavailable="true"`, `title` = the capability reason verbatim, and the D11 `REFUSAL_TAG` tag `未预计算` for `not_precomputed`. D11 emits the attribute from an object literal (`'data-representation': id` in `controls/RepresentationSection.tsx`), not as JSX;
    - the D10 time pill `section[data-chrome][data-time-kind="oscillating"]` containing `button[data-control="playback"]` (`aria-pressed`, `aria-disabled`), `input[type=range][data-time-scrubber]` over frame indices (`value` = frame index, `aria-valuetext` = `t = <t.toFixed(1)> a.u.`), `button[data-time-step="1"]`, the read-only `output[data-time-readout]` (`t.toFixed(1)`) that replaces free time entry whenever the bound carries `values` (always, on the static site), and the meta line `周期 T = <T.toFixed(2)> a.u. · 帧 <i>/<N>`;
    - D10 `useFramePrefetch`: in static mode it fetches every frame of the period **only while playing** and aborts on pause, so a frame file fetched while paused is the frame on screen;
    - a header link named `教材` → `./learn/`;
    - in embed mode, no header, no `控制上下文` navigation and no dialog, plus a link `在实验室中打开` (`target=_blank`, the same deep link without `embed`);
    - a guide dialog (`role=dialog`) that closes on Escape.
- Produces: the Playwright config `web/playwright.pages.config.ts` (port 4180, `testDir: 'pages-e2e'`, JSON report at `web/test-results/pages/results.json`) and exactly these 8 test titles, consumed by E5:
  1. `opens the lab from precomputed static data with no API or off-origin request`
  2. `switches representation using only precomputed files`
  3. `explains a combination the static catalog did not precompute instead of failing`
  4. `plays the 1s + 2p_z superposition through its precomputed frames and shows the time`
  5. `restores a deep link and writes state changes back without adding history`
  6. `embed mode drops the lab chrome and links the same state back to the full lab`
  7. `serves the textbook under learn/ with typeset math and a figure that loads the lab`
  8. `answers only under the repository sub-path, with Pages content types`

- [ ] **Step 1: Confirm the cross-part hooks exist (precondition, read-only)**

```bash
ls build/pages/data/manifest.json build/pages-build.json
grep -rln "data-chrome" web/src/components | head -5
grep -rn "在实验室中打开" web/src | head -3
grep -rn "教材" web/src/components | head -3
grep -n 'data-control="playback"' web/src/components/TimePill.tsx
grep -c 'data-time-kind\|data-time-scrubber\|data-time-step="1"\|data-time-readout' web/src/components/TimePill.tsx
grep -rnE "data-representation['\"]?[:=]" web/src/components --include=*.tsx --exclude=*.test.tsx | head -3
grep -rn "not_precomputed: '未预计算'" web/src/components | head -3
grep -n "加载交互图" docs/assets/javascripts/quviz-figure.js
grep -n "export function parseDeepLink\|export function bindUrlState" web/src/state/urlState.ts
grep -n "state.playing && state.timeAu !== 0" web/src/state/urlState.ts
grep -n "runtimeMode() === 'static' && model.canPlay && model.playing" web/src/components/usePlayback.ts
grep -n "not_precomputed" web/src/api/capability.ts | head -3
grep -rn "role=\"dialog\"\|role: 'dialog'\|aria-modal" web/src/components | head -3
```

Expected: every command prints at least one line, and the `grep -c` prints `4` or more (one line per time-pill hook).
- The `data-representation` pattern matches both spellings: the object-literal key D11 emits (`'data-representation': id`) and today's JSX `data-representation={id}` (`ControlPanel.tsx:745`, measured). It excludes `data-representation-notice` and test files.
- The `urlState.ts` line is the B10 rule that T4 depends on: no `t` in the hash while playing.
- The `usePlayback.ts` line is the D10 rule that makes T4's paused-step provenance check meaningful: prefetch runs only while playing.

If a command prints nothing, the owning part shipped a different hook or rule. Read that component, and re-target the matching assertion below to what was shipped before continuing. Record the change in the task report.

- [ ] **Step 2: Write the failing guard test**

In `web/src/guards.test.ts`, after the line `const fullstackE2eSpecFiles = walk(FULLSTACK_E2E_ROOT).filter(isTestFile)`, add:

```ts
const PAGES_E2E_ROOT = fileURLToPath(new URL('../pages-e2e/', import.meta.url))
const pagesE2eSpecFiles = walk(PAGES_E2E_ROOT).filter(isTestFile)
```

In the doc comment above `const VISUAL_E2E_ROOT` (the block starting `The Playwright suites -- the OTHER trees of specs in this repository.`), replace the sentence `Its own authoritative gate is scripts/assert-visual-run.mjs (a skipped test, an uncollected spec or an --update-snapshots run all fail there), and this scan is its secondary guard` with:

```ts
 * The authoritative gates are scripts/assert-visual-run.mjs (web/e2e),
 * scripts/assert-fullstack-run.mjs (web/fullstack-e2e) and
 * scripts/assert-pages-run.mjs (web/pages-e2e) -- a skipped test or an uncollected
 * spec fails there -- and this scan is their secondary guard
```

Replace the test `it('reaches both Playwright suites, which no other guard in this file sees', () => {` with:

```ts
  it('reaches all three Playwright suites, which no other guard in this file sees', () => {
    // Named one at a time as well as counted, because this scan passes
    // VACUOUSLY over an empty list: a wrong root, a renamed directory or a
    // suite deleted wholesale would otherwise leave the skip scan below green
    // while covering nothing at all.
    expect(visualE2eSpecFiles).toContain('slice.spec.ts')
    expect(visualE2eSpecFiles).toContain('webgl.spec.ts')
    expect(visualE2eSpecFiles.length).toBeGreaterThanOrEqual(2)
    // e2e/fixtures.ts is a helper, not a spec: Playwright's default testMatch
    // collects `*.spec.ts` / `*.test.ts` only, and so does isTestFile.
    expect(visualE2eSpecFiles).not.toContain('fixtures.ts')
    expect(fullstackE2eSpecFiles).toEqual(['app.spec.ts'])
    expect(pagesE2eSpecFiles).toEqual(['site.spec.ts'])
  })
```

After the test `it('has no skipped, todo, focused or conditionally-run tests in the full-stack suite', …)`, add:

```ts
  it('has no skipped, todo, focused or conditionally-run tests in the Pages suite', () => {
    const hits = scan(pagesE2eSpecFiles, matchesForbiddenTestForm, PAGES_E2E_ROOT, withoutComments)
    expect(hits, `forbidden test modifiers under pages-e2e/:\n${describeHits(hits)}`).toEqual([])
  })
```

- [ ] **Step 3: Run the guard test and confirm it fails**

Run: `npm --prefix web run test:watch -- run src/guards.test.ts`
Expected: the file fails at module load with `ENOENT: no such file or directory, scandir '…\web\pages-e2e\'`. `walk` throws on a missing tree by design.

- [ ] **Step 4: Write the config**

Create `web/playwright.pages.config.ts`:

```ts
/**
 * The static GitHub Pages site, served the way GitHub Pages serves it.
 *
 * This suite needs a COMPLETE static build first: the precomputed scene data takes
 * minutes to render, so it is produced by a full `scripts/build_pages.py` run and then
 * reused. The web server below rebuilds only the lab and the textbook from this
 * checkout (`--skip-data`) and serves build/pages/ under the repository sub-path, and
 * nowhere else. No FastAPI process takes part: a request to /api/ is a defect.
 *
 * Runs on Windows as well as Linux: nothing here is a pixel comparison.
 */
import { defineConfig } from '@playwright/test'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const REPOSITORY_ROOT = fileURLToPath(new URL('..', import.meta.url))
const BUILD_INFO = fileURLToPath(new URL('../build/pages-build.json', import.meta.url))
const MANIFEST = fileURLToPath(new URL('../build/pages/data/manifest.json', import.meta.url))
const PORT = 4180
const ORIGIN = `http://127.0.0.1:${PORT}`

if (!existsSync(MANIFEST) || !existsSync(BUILD_INFO)) {
  throw new Error(
    `npm run test:pages needs a complete static build first: ${MANIFEST} or ${BUILD_INFO} ` +
      'is missing. Run `uv run --locked --no-sync python scripts/build_pages.py` from the ' +
      'repository root once (the precomputed data takes minutes); every later run of this ' +
      'suite rebuilds only the lab and the textbook.',
  )
}

interface BuildInfo {
  readonly format: string
  readonly site_url: string
  readonly base_path: string
}

const info = JSON.parse(readFileSync(BUILD_INFO, 'utf-8')) as BuildInfo
if (
  info.format !== 'quviz-pages-build/1' ||
  !info.base_path.startsWith('/') ||
  !info.base_path.endsWith('/')
) {
  throw new Error(`${BUILD_INFO} is not a quviz-pages-build/1 record: ${JSON.stringify(info)}`)
}

export default defineConfig({
  testDir: 'pages-e2e',
  outputDir: 'test-results/pages',
  timeout: 180_000,
  expect: { timeout: 30_000 },
  retries: 0,
  workers: 1,
  fullyParallel: false,
  forbidOnly: true,
  updateSnapshots: 'none',
  reporter: [
    ['list'],
    ['json', { outputFile: 'test-results/pages/results.json' }],
    ['html', { outputFolder: 'playwright-report/pages', open: 'never' }],
  ],
  use: {
    baseURL: `${ORIGIN}${info.base_path}`,
    browserName: 'chromium',
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 1,
    colorScheme: 'dark',
    locale: 'en-US',
    timezoneId: 'UTC',
    contextOptions: { reducedMotion: 'reduce' },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: {
      args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
    },
  },
  webServer: {
    name: 'QuViz Pages preview',
    command:
      'uv run --locked --no-sync python scripts/build_pages.py --skip-data ' +
      `--site-url ${info.site_url} --serve ${PORT}`,
    cwd: REPOSITORY_ROOT,
    url: `${ORIGIN}${info.base_path}`,
    reuseExistingServer: false,
    timeout: 600_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
})
```

- [ ] **Step 5: Write the spec**

Create `web/pages-e2e/site.spec.ts`:

```ts
/**
 * The published GitHub Pages site, exercised exactly as Pages serves it.
 *
 * playwright.pages.config.ts starts `scripts/build_pages.py --skip-data --serve 4180`:
 * the lab and the textbook are rebuilt from this checkout, the precomputed data of the
 * last full build is kept, and build/pages/ is served under the repository sub-path ONLY
 * -- a request outside it answers 404, as on Pages. No FastAPI process exists anywhere
 * in this suite: a request to /api/ is a defect, never a fallback.
 *
 * Every lab test holds the page to one ledger: zero /api requests, zero off-origin
 * requests, zero same-origin requests outside the sub-path, zero 4xx/5xx, zero failed
 * requests, zero page errors and zero console errors. The textbook test additionally
 * allows the jsDelivr packages mkdocs.yml pins (MathJax, Mermaid), so it needs network.
 *
 * Not asserted here: Material's instant navigation. It rebases sitemap URLs by protocol
 * and host but not port, so it degrades to full page loads on 127.0.0.1:4180; the
 * full-stack suite asserts it under `mkdocs serve`.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  expect,
  test,
  type APIRequestContext,
  type Locator,
  type Page,
  type Response,
} from '@playwright/test'

const REPOSITORY_ROOT = fileURLToPath(new URL('../../', import.meta.url))
const LEARN_ROOT = join(REPOSITORY_ROOT, 'build', 'pages', 'learn')
const MKDOCS_CONFIG = join(REPOSITORY_ROOT, 'mkdocs.yml')

const STATUS = 'span[data-status]'
const SETTLE = { timeout: 60_000 } as const
const TERMS_1S_2PZ = '1,0,0,0.7071067811865476;2,1,0,0.7071067811865476'
/**
 * 1s + 2p_z plays 28 frames per period (T = 16.755 a.u.): playbackFrames(T), which
 * snaps k·T/28 to the 0.2 a.u. grid and so lands exactly on k × 0.6 for k = 0..27.
 * Index k is the scrubber's value for that frame.
 */
const LATTICE_1S_2PZ: readonly number[] = Array.from({ length: 28 }, (_, frame) =>
  Number((frame * 0.6).toFixed(1)),
)

interface Ledger {
  readonly base: URL
  readonly responses: Response[]
  readonly apiRequests: string[]
  readonly offOrigin: string[]
  readonly outsidePrefix: string[]
  readonly failed: string[]
  readonly badStatus: string[]
  readonly pageErrors: string[]
  readonly consoleErrors: string[]
}

interface ManifestEntry {
  readonly file: string
  readonly status: number
  readonly content_type: string
}

interface StaticManifest {
  readonly format: string
  readonly entries: Readonly<Record<string, ManifestEntry>>
}

/** One consistent look at the time pill, taken inside a single render. */
interface PillReading {
  readonly readout: string | null
  readonly index: string | null
  readonly valuetext: string | null
  readonly text: string
}

function baseOf(baseURL: string | undefined): URL {
  expect(baseURL, 'playwright.pages.config.ts derives baseURL from build/pages-build.json')
    .toBeDefined()
  return new URL(baseURL as string)
}

function watch(page: Page, base: URL, allowedOffOrigin: readonly string[] = []): Ledger {
  const ledger: Ledger = {
    base,
    responses: [],
    apiRequests: [],
    offOrigin: [],
    outsidePrefix: [],
    failed: [],
    badStatus: [],
    pageErrors: [],
    consoleErrors: [],
  }
  page.on('request', (request) => {
    const url = new URL(request.url())
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return
    if (url.pathname.includes('/api/')) ledger.apiRequests.push(url.href)
    if (url.origin !== base.origin) {
      if (!allowedOffOrigin.some((prefix) => url.href.startsWith(prefix))) {
        ledger.offOrigin.push(url.href)
      }
    } else if (!url.pathname.startsWith(base.pathname)) {
      ledger.outsidePrefix.push(url.href)
    }
  })
  page.on('response', (response) => {
    ledger.responses.push(response)
    if (response.status() >= 400) ledger.badStatus.push(`${response.status()} ${response.url()}`)
  })
  page.on('requestfailed', (request) => {
    const reason = request.failure()?.errorText ?? 'failed'
    // An abort is the lab cancelling its own superseded request (useSceneAsset aborts on
    // a scene change); every other failure is a broken site.
    if (!reason.includes('ERR_ABORTED')) ledger.failed.push(`${request.url()}: ${reason}`)
  })
  page.on('pageerror', (error) => ledger.pageErrors.push(error.stack ?? error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') ledger.consoleErrors.push(message.text())
  })
  return ledger
}

function expectClean(ledger: Ledger): void {
  expect(ledger.apiRequests, 'the static site asked for /api/ -- Pages has no backend').toEqual([])
  expect(ledger.offOrigin, 'a request left the site origin').toEqual([])
  expect(ledger.outsidePrefix, 'a same-origin request escaped the repository sub-path').toEqual([])
  expect(ledger.failed, 'a request failed').toEqual([])
  expect(ledger.badStatus, 'a request answered 4xx/5xx').toEqual([])
  expect(ledger.pageErrors, 'the page threw').toEqual([])
  expect(ledger.consoleErrors, 'the page logged an error').toEqual([])
}

/** The scene with this identity (sceneIdentityKey fragments) is settled and current. */
async function sceneReady(page: Page, ...identity: string[]): Promise<void> {
  const selector = identity.map((part) => `[data-scene-ready*="${part}"]`).join('')
  await expect(page.locator(selector)).toBeAttached(SETTLE)
  await expect(page.locator(STATUS)).toHaveAttribute('data-status', 'ready', SETTLE)
}

/** The guide dialog opens once per fresh profile (spec §4.4); every context here is fresh. */
async function dismissGuide(page: Page): Promise<void> {
  const dialog = page.getByRole('dialog').first()
  if (await dialog.isVisible()) {
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
  }
}

function hashOf(url: string): URLSearchParams {
  return new URLSearchParams(new URL(url).hash.slice(1))
}

async function readManifest(request: APIRequestContext): Promise<StaticManifest> {
  const response = await request.get('data/manifest.json')
  expect(response.status(), 'data/manifest.json under the sub-path').toBe(200)
  const manifest = (await response.json()) as StaticManifest
  expect(manifest.format).toBe('quviz-static/1')
  return manifest
}

/** manifest entry file ("files/<hash>.json") -> every request key it answers. */
function keysByFile(manifest: StaticManifest): Map<string, string[]> {
  const byFile = new Map<string, string[]>()
  for (const [key, entry] of Object.entries(manifest.entries)) {
    byFile.set(entry.file, [...(byFile.get(entry.file) ?? []), key])
  }
  return byFile
}

/** The API questions this page answered from precomputed files, as manifest keys. */
function answeredKeys(ledger: Ledger, byFile: ReadonlyMap<string, readonly string[]>): string[] {
  const dataRoot = `${ledger.base.pathname}data/`
  const keys = new Set<string>()
  for (const response of ledger.responses) {
    const path = new URL(response.url()).pathname
    if (!path.startsWith(dataRoot)) continue
    for (const key of byFile.get(path.slice(dataRoot.length)) ?? []) keys.add(key)
  }
  return [...keys]
}

/** Keys for `route` whose decoded query carries every `expected` pair. */
function answered(
  keys: readonly string[],
  route: string,
  expected: Readonly<Record<string, string>>,
): URLSearchParams[] {
  const matches: URLSearchParams[] = []
  for (const key of keys) {
    const [keyRoute, query = ''] = key.split('?', 2)
    const params = new URLSearchParams(query)
    const agrees = Object.entries(expected).every(([name, value]) => params.get(name) === value)
    if (keyRoute === route && agrees) matches.push(params)
  }
  return matches
}

/** The data files (`files/<hash>.json`) that answer the 1s + 2p_z isosurface at `time`. */
function isosurfaceFrameFiles(manifest: StaticManifest, time: number): Set<string> {
  const files = new Set<string>()
  for (const [key, entry] of Object.entries(manifest.entries)) {
    const [route, query = ''] = key.split('?', 2)
    const params = new URLSearchParams(query)
    if (
      route === '/api/superposition/isosurface' &&
      params.get('terms') === TERMS_1S_2PZ &&
      Number(params.get('time')) === time
    ) {
      files.add(entry.file)
    }
  }
  return files
}

/**
 * Readout, scrubber position and meta line in ONE evaluate: separate locator reads
 * could straddle a 420 ms playback tick and pair one frame's time with the next
 * frame's index.
 */
async function readPill(pill: Locator): Promise<PillReading> {
  return pill.evaluate((section) => {
    const scrubber = section.querySelector<HTMLInputElement>('input[data-time-scrubber]')
    return {
      readout: section.querySelector('output[data-time-readout]')?.textContent ?? null,
      index: scrubber?.value ?? null,
      valuetext: scrubber?.getAttribute('aria-valuetext') ?? null,
      text: section.textContent ?? '',
    }
  })
}

/** The reading names one lattice frame the same way everywhere; returns its time. */
function expectOnLattice(reading: PillReading): number {
  // Number(null) is 0, a lattice frame: a missing readout or scrubber must fail here.
  expect(reading.readout, 'the pill shows no read-only time readout').not.toBeNull()
  expect(reading.index, 'the pill shows no frame scrubber').not.toBeNull()
  const time = Number(reading.readout)
  const index = Number(reading.index)
  expect(LATTICE_1S_2PZ.includes(time), `t=${reading.readout} is not a playback frame of 1s + 2p_z`)
    .toBe(true)
  expect(LATTICE_1S_2PZ[index], `the scrubber (frame ${reading.index}) disagrees with t=${reading.readout}`)
    .toBe(time)
  expect(reading.valuetext).toBe(`t = ${time.toFixed(1)} a.u.`)
  expect(reading.text).toContain(`帧 ${index + 1}/${LATTICE_1S_2PZ.length}`)
  return time
}

/** The hash's `t`, where an absent `t` means 0 (B10 omits it at t = 0). */
function hashTime(page: Page): number {
  return Number(hashOf(page.url()).get('t') ?? '0')
}

/** The jsDelivr package prefixes mkdocs.yml pins: the textbook's only off-origin loads. */
function textbookCdnPrefixes(): string[] {
  const text = readFileSync(MKDOCS_CONFIG, 'utf-8')
  const pinned = [
    ...text.matchAll(/^\s*-\s*(https:\/\/cdn\.jsdelivr\.net\/npm\/[^/\s]+@[^/\s]+\/)\S*\s*$/gm),
  ].map((match) => match[1] as string)
  return [...new Set(pinned)]
}

function htmlPages(directory: string): string[] {
  const pages: string[] = []
  for (const entry of readdirSync(directory)) {
    const full = join(directory, entry)
    if (statSync(full).isDirectory()) pages.push(...htmlPages(full))
    else if (entry === 'index.html') pages.push(full)
  }
  return pages.sort()
}

/** The first built textbook page that embeds a figure, as a path relative to baseURL. */
function firstFigurePage(): string {
  const textbook = join(LEARN_ROOT, 'textbook')
  const page = htmlPages(textbook).find((file) =>
    readFileSync(file, 'utf-8').includes('class="quviz-figure"'),
  )
  expect(page, `no built page under ${textbook} embeds a quviz-figure`).toBeDefined()
  const directory = relative(LEARN_ROOT, join(page as string, '..')).split(sep).join('/')
  return `learn/${directory}/`
}

test('opens the lab from precomputed static data with no API or off-origin request', async ({
  page,
  baseURL,
  request,
}) => {
  const base = baseOf(baseURL)
  const byFile = keysByFile(await readManifest(request))
  const ledger = watch(page, base)

  const landing = await page.goto('./')
  expect(landing?.status(), 'the lab index under the sub-path').toBe(200)
  expect(landing?.headers()['content-type']).toContain('text/html')
  await sceneReady(page, 'mode=eigenstate|representation=point_cloud|n=2|l=1|m=0|', '|basis=real|')
  await dismissGuide(page)
  await expect(page.locator('canvas')).toHaveCount(1)

  const keys = answeredKeys(ledger, byFile)
  expect(keys, 'the opening point cloud was not answered from its precomputed file').toContain(
    '/api/orbitals/point-cloud?n=2&l=1&m=0&z=1&basis=real&samples=28000&seed=7',
  )
  expect(
    answered(keys, '/api/orbitals/metadata', { n: '2', l: '1', m: '0', basis: 'real' }).length,
  ).toBeGreaterThan(0)
  const binary = ledger.responses.find((response) => new URL(response.url()).pathname.endsWith('.bin'))
  expect(binary?.headers()['content-type']).toBe('application/octet-stream')

  await expect(page.getByRole('link', { name: '查看 OpenAPI' })).toHaveCount(0)
  const textbook = page.getByRole('link', { name: '教材', exact: true })
  await expect(textbook).toBeVisible()
  const target = new URL((await textbook.getAttribute('href')) as string, page.url())
  expect(`${target.origin}${target.pathname}`).toBe(`${base.origin}${base.pathname}learn/`)
  expect((await request.get(target.href)).status()).toBe(200)
  await expect(page.locator('script[src*="/@vite/client"]')).toHaveCount(0)
  expectClean(ledger)
})

test('switches representation using only precomputed files', async ({ page, baseURL, request }) => {
  const base = baseOf(baseURL)
  const byFile = keysByFile(await readManifest(request))
  const ledger = watch(page, base)
  await page.goto('./')
  await sceneReady(page, 'mode=eigenstate|representation=point_cloud|n=2|l=1|m=0|')
  await dismissGuide(page)

  const isosurface = page.locator('button[data-representation="isosurface"]').first()
  await isosurface.click()
  await sceneReady(page, 'mode=eigenstate|representation=isosurface|n=2|l=1|m=0|')
  await expect(isosurface).toHaveAttribute('aria-pressed', 'true')
  const meshes = answered(answeredKeys(ledger, byFile), '/api/orbitals/isosurface', {
    n: '2',
    l: '1',
    m: '0',
    basis: 'real',
  })
  expect(meshes.length, 'the isosurface was not answered from its precomputed file').toBeGreaterThan(0)
  expectClean(ledger)
})

test('explains a combination the static catalog did not precompute instead of failing', async ({
  page,
  baseURL,
}) => {
  const base = baseOf(baseURL)
  const ledger = watch(page, base)
  // n = 5 is a physically valid point cloud (the route accepts n <= 12) inside the lab's
  // n range, but outside StaticCatalogSpec (n_max 4): the capability overlay must refuse
  // it as not_precomputed, say why in Chinese, and fetch nothing for it.
  await page.goto('./#mode=eigenstate&n=5&l=0&m=0&basis=real&rep=point_cloud')
  const status = page.locator(STATUS)
  await expect(status).toHaveAttribute('data-status', 'unavailable', SETTLE)
  await dismissGuide(page)

  // The refusal KIND, not its wording: the reason differs per spec limit (B8 words
  // this one as "静态教材版只预计算 n ≤ 4 的本征态…", with no 未预计算 in it). The
  // representation row carries D11's not_precomputed tag -- distinct from the
  // physics refusals' 不支持 / 未实现 -- and its title is the reason verbatim, which
  // the status line must repeat.
  const row = page.locator('button[data-representation="point_cloud"]').first()
  await expect(row).toHaveAttribute('data-unavailable', 'true')
  await expect(row).toContainText('未预计算')
  const reason = (await row.getAttribute('title')) ?? ''
  expect(reason, 'the refused row gives no reason').not.toBe('')
  expect(reason, 'the reason must be Chinese prose').toMatch(/\p{Script=Han}/u)
  expect(reason).not.toContain('/api')
  await expect(status).toContainText(reason)
  await expect(page.locator('[data-scene-ready]:not([data-scene-ready=""])')).toHaveCount(0)
  expect(hashOf(page.url()).get('n'), 'the refused state must stay addressable').toBe('5')
  expectClean(ledger)
})

test('plays the 1s + 2p_z superposition through its precomputed frames and shows the time', async ({
  page,
  baseURL,
  request,
}) => {
  const base = baseOf(baseURL)
  const manifest = await readManifest(request)
  const ledger = watch(page, base)
  await page.goto('./#mode=superposition&preset=1s-2pz&rep=isosurface')
  await sceneReady(page, 'mode=superposition|representation=isosurface|', `|terms=${TERMS_1S_2PZ}`)
  await dismissGuide(page)

  // The static overlay offers the exported frames as ParameterBound.values, so the pill
  // shows a read-only readout and a scrubber over exactly those frames -- never free
  // time entry, which could ask for an instant nobody precomputed.
  const pill = page.locator('section[data-chrome][data-time-kind="oscillating"]:visible')
  await expect(pill).toHaveCount(1)
  await expect(pill.locator('input[data-parameter="timeAu"]'), 'the static lab offers free time entry')
    .toHaveCount(0)
  await expect(pill.locator('input[data-time-scrubber]')).toHaveAttribute(
    'max',
    String(LATTICE_1S_2PZ.length - 1),
  )
  expect(expectOnLattice(await readPill(pill)), 'a preset link starts at t = 0').toBe(0)

  const playback = pill.locator('button[data-control="playback"]')
  await expect(playback).not.toHaveAttribute('aria-disabled', 'true')
  await playback.click()
  await expect(playback).toHaveAttribute('aria-pressed', 'true')

  // While the clock runs, the frames are read off the pill. The hash is no witness
  // here: B10 writes `t` only while paused, because a running clock is not a place
  // to link to and a 420 ms replaceState would trip browser rate limits.
  const readings: PillReading[] = []
  await expect
    .poll(
      async () => {
        readings.push(await readPill(pill))
        return new Set(readings.map((reading) => Number(reading.readout)).filter((t) => t > 0)).size
      },
      { message: 'the time pill never advanced through two frames', timeout: 30_000, intervals: [100] },
    )
    .toBeGreaterThanOrEqual(2)
  expect(hashOf(page.url()).has('t'), 'a playback tick rewrote the hash').toBe(false)
  for (const reading of readings) expectOnLattice(reading)

  // Pause: the pill holds one lattice frame, and the hash now records exactly it.
  await playback.click()
  await expect(playback).toHaveAttribute('aria-pressed', 'false')
  await expect(page.locator(STATUS)).toHaveAttribute('data-status', 'ready', SETTLE)
  const paused = expectOnLattice(await readPill(pill))
  await expect
    .poll(() => hashTime(page), { message: 'the paused instant is not in the hash' })
    .toBe(paused)

  // Step one frame while paused. useFramePrefetch runs only while playing and aborted
  // its warm-up on pause, so the only file this step can fetch is the frame the pill
  // now shows: that response is the provenance of what is on screen. (While playing,
  // the prefetch loads the whole period, which is why no check is made there.)
  const nextIndex = (LATTICE_1S_2PZ.indexOf(paused) + 1) % LATTICE_1S_2PZ.length
  const next = LATTICE_1S_2PZ[nextIndex] as number
  const nextFiles = isosurfaceFrameFiles(manifest, next)
  expect(nextFiles.size, `the manifest has no 1s + 2p_z isosurface for t=${next}`).toBeGreaterThan(0)
  const dataRoot = `${base.pathname}data/`
  const frameFile = page.waitForResponse(
    (response) => {
      const path = new URL(response.url()).pathname
      return path.startsWith(dataRoot) && nextFiles.has(path.slice(dataRoot.length))
    },
    { timeout: 60_000 },
  )
  await pill.locator('button[data-time-step="1"]').click()
  expect((await frameFile).status(), `the precomputed file for t=${next}`).toBe(200)
  await expect(page.locator(STATUS)).toHaveAttribute('data-status', 'ready', SETTLE)
  const stepped = await readPill(pill)
  expect(expectOnLattice(stepped), 'one step is one frame').toBe(next)
  expect(Number(stepped.index)).toBe(nextIndex)
  await expect
    .poll(() => hashTime(page), { message: 'the stepped-to instant is not in the hash' })
    .toBe(next)
  expectClean(ledger)
})

test('restores a deep link and writes state changes back without adding history', async ({
  page,
  baseURL,
  request,
}) => {
  const base = baseOf(baseURL)
  const byFile = keysByFile(await readManifest(request))
  const ledger = watch(page, base)
  const identity = ['mode=eigenstate|representation=isosurface|n=3|l=2|m=0|', '|basis=real|']
  await page.goto('./#mode=eigenstate&n=3&l=2&m=0&basis=real&rep=isosurface')
  await sceneReady(page, ...identity)
  await dismissGuide(page)
  expect(
    answered(answeredKeys(ledger, byFile), '/api/orbitals/isosurface', {
      n: '3',
      l: '2',
      m: '0',
      basis: 'real',
    }).length,
  ).toBeGreaterThan(0)

  const written = hashOf(page.url())
  const expected = { mode: 'eigenstate', n: '3', l: '2', m: '0', basis: 'real', rep: 'isosurface' }
  for (const [key, value] of Object.entries(expected)) {
    expect(written.get(key), `the hash lost ${key}`).toBe(value)
  }
  expect(written.has('embed')).toBe(false)

  await page.reload()
  await sceneReady(page, ...identity)

  const historyLength = await page.evaluate(() => window.history.length)
  await page.locator('button[data-representation="point_cloud"]').first().click()
  await sceneReady(page, 'mode=eigenstate|representation=point_cloud|n=3|l=2|m=0|')
  expect(hashOf(page.url()).get('rep')).toBe('point_cloud')
  expect(await page.evaluate(() => window.history.length), 'a state change pushed history').toBe(
    historyLength,
  )
  expectClean(ledger)
})

test('embed mode drops the lab chrome and links the same state back to the full lab', async ({
  page,
  baseURL,
}) => {
  const base = baseOf(baseURL)
  const ledger = watch(page, base)
  await page.goto('./#embed=1&mode=eigenstate&n=2&l=1&m=0&basis=real&rep=point_cloud')
  await sceneReady(page, 'mode=eigenstate|representation=point_cloud|n=2|l=1|m=0|')
  await expect(page.locator('canvas')).toHaveCount(1)
  await expect(page.getByRole('link', { name: '教材', exact: true })).toHaveCount(0)
  await expect(page.getByRole('navigation', { name: '控制上下文' })).toHaveCount(0)
  await expect(page.getByRole('dialog')).toHaveCount(0)

  const open = page.getByRole('link', { name: '在实验室中打开' })
  await expect(open).toBeVisible()
  await expect(open).toHaveAttribute('target', '_blank')
  const target = new URL((await open.getAttribute('href')) as string, page.url())
  expect(`${target.origin}${target.pathname}`).toBe(`${base.origin}${base.pathname}`)
  const state = hashOf(target.href)
  expect(state.has('embed')).toBe(false)
  const expected = { mode: 'eigenstate', n: '2', l: '1', m: '0', basis: 'real', rep: 'point_cloud' }
  for (const [key, value] of Object.entries(expected)) {
    expect(state.get(key), `the open-in-lab link lost ${key}`).toBe(value)
  }
  expectClean(ledger)
})

test('serves the textbook under learn/ with typeset math and a figure that loads the lab', async ({
  page,
  baseURL,
}) => {
  const base = baseOf(baseURL)
  const ledger = watch(page, base, textbookCdnPrefixes())
  const home = await page.goto('learn/')
  expect(home?.status()).toBe(200)
  expect(await page.locator('.arithmatex').count(), 'the textbook home lost its math')
    .toBeGreaterThan(0)
  await expect(page.locator('.arithmatex:not(:has(mjx-container))')).toHaveCount(0, SETTLE)

  await page.goto(firstFigurePage())
  const figure = page.locator('figure.quviz-figure').first()
  await expect(figure).toBeVisible()
  await expect(figure.locator('iframe'), 'figures load only on request (D12)').toHaveCount(0)
  await figure.getByRole('button', { name: /加载交互图/ }).click()
  const frame = figure.locator('iframe')
  await expect(frame).toHaveCount(1)
  await expect(
    frame.contentFrame().locator('[data-scene-ready]:not([data-scene-ready=""])'),
  ).toBeAttached(SETTLE)

  const embedded = new URL((await frame.getAttribute('src')) as string, page.url())
  expect(`${embedded.origin}${embedded.pathname}`).toBe(`${base.origin}${base.pathname}`)
  expect(hashOf(embedded.href).get('embed')).toBe('1')
  const open = figure.getByRole('link', { name: '在实验室中打开' })
  const lab = new URL((await open.getAttribute('href')) as string, page.url())
  expect(`${lab.origin}${lab.pathname}`).toBe(`${base.origin}${base.pathname}`)
  expect(hashOf(lab.href).has('embed')).toBe(false)
  expectClean(ledger)
})

test('answers only under the repository sub-path, with Pages content types', async ({
  request,
  baseURL,
}) => {
  const base = baseOf(baseURL)
  expect(base.pathname, 'the build was not given a project-site sub-path').not.toBe('/')

  const root = await request.get(`${base.origin}/`, { maxRedirects: 0 })
  expect(root.status()).toBe(302)
  expect(root.headers()['location']).toBe(base.pathname)
  const bare = await request.get(`${base.origin}${base.pathname.slice(0, -1)}`, { maxRedirects: 0 })
  expect(bare.status()).toBe(301)
  expect(bare.headers()['location']).toBe(base.pathname)
  for (const outside of ['/index.html', '/data/manifest.json', '/learn/', '/favicon.svg']) {
    const response = await request.get(`${base.origin}${outside}`, { maxRedirects: 0 })
    expect(response.status(), `${outside} must not be served outside ${base.pathname}`).toBe(404)
  }
  const learn = await request.get('learn', { maxRedirects: 0 })
  expect(learn.status()).toBe(301)
  expect(learn.headers()['location']).toBe(`${base.pathname}learn/`)

  const manifestResponse = await request.get('data/manifest.json')
  expect(manifestResponse.headers()['content-type']).toContain('application/json')
  const manifest = await readManifest(request)
  const binary = Object.values(manifest.entries).find((entry) => entry.file.endsWith('.bin'))
  expect(binary, 'the manifest lists no .bin file').toBeDefined()
  const binaryResponse = await request.get(`data/${(binary as ManifestEntry).file}`)
  expect(binaryResponse.status()).toBe(200)
  expect(binaryResponse.headers()['content-type']).toBe('application/octet-stream')
})
```

In `web/tsconfig.e2e.json`:
- replace the `include` array with `["playwright.config.ts", "playwright.fullstack.config.ts", "playwright.pages.config.ts", "e2e/**/*.ts", "fullstack-e2e/**/*.ts", "pages-e2e/**/*.ts"]`, one entry per line, following the existing style;
- in `$comment`, replace `cover both configs and both spec trees` with `cover every browser config and every spec tree`.

- [ ] **Step 6: Run the guard test and the typecheck, and confirm they pass**

Run: `npm --prefix web run test:watch -- run src/guards.test.ts`
Expected: `Test Files  1 passed`. The renamed scope test and the new Pages scan test are green.

Run: `npm --prefix web run typecheck`
Expected: exit 0 with no output. `tsc -b` covers the new config and spec through `tsconfig.e2e.json`.

- [ ] **Step 7: Run the Pages suite for real**

Requires E2 Step 7's full build. Run: `npm --prefix web exec --no -- playwright test --config=web/playwright.pages.config.ts`
Expected:
- The web server log shows `[1/2] build the lab in pages mode` and `[2/2] build the textbook`, then `previewing http://127.0.0.1:4180/Atmoic-quantum-visualization/`.
- Then `8 passed`.

The textbook test needs network access to `cdn.jsdelivr.net`. A failure message names the ledger bucket (`/api`, off-origin, outside sub-path, 4xx) or the missing scene identity. Fix the owning part (B transport/overlay, C figure, D hooks) rather than loosening an assertion.

- [ ] **Step 8: Pre-commit gate (CLAUDE.md), then commit**

Run: `npm --prefix web run test` then `npm --prefix web run typecheck`.
Expected: `assert-no-skips: … all passed, 0 skipped, 0 todo.` and the three `assert-coverage-scope:` lines; typecheck exit 0.

```bash
git add web/playwright.pages.config.ts web/pages-e2e/site.spec.ts web/tsconfig.e2e.json web/src/guards.test.ts
git commit -m "$(cat <<'EOF'
test(pages): drive the built static site through the real UI under the Pages sub-path

Claude-Session: https://claude.ai/code/session_01E44DEzsc7Av26fc7nZ5rSo
EOF
)"
```

---

### Task E5: `assert-pages-run.mjs` post-run audit, `npm run test:pages`, and the pins that bind them

**Files:**
- Create: `web/scripts/assert-pages-run.mjs`
- Create: `web/scripts/assert-pages-run.d.mts`
- Create: `web/src/pagesGate.test.ts`
- Modify: `web/package.json`: add `"test:pages"` after `"test:fullstack"` (line 16)
- Modify: `tests/test_check_script.py`:
  - `WEB_SCRIPTS` (lines 1844-1878);
  - add `PAGES_SCRIPT` and a test after `test_npm_fullstack_script_runs_the_pinned_config_then_audits_its_report` (lines 1540-1546).
- Modify: `docs/reference/quality-gates.md`:
  - the 🔗 status legend line (line 14);
  - append one bullet to `## 静态教材站与发布`.
- Modify: `docs/getting-started/development.md`:
  - the full-stack paragraph (lines 43-44);
  - append to `## 静态教材站（GitHub Pages）`.

**Interfaces:**
- Consumes: the 8 titles and the report path `web/test-results/pages/results.json` from E4.
- Produces:
  - `export const REQUIRED_PAGES_TESTS: Readonly<Record<string, readonly string[]>>`
  - `export function listPagesSpecFiles(webRoot: string): string[]`
  - `export function auditPagesSpecInventory(actualSpecs: readonly string[]): string[]`
  - `export function auditPagesRun(report: PagesPlaywrightReport, webRoot: string): string[]`
  - the npm script `"test:pages": "playwright test --config=playwright.pages.config.ts && node scripts/assert-pages-run.mjs"`.

- [ ] **Step 1: Write the failing tests**

Create `web/src/pagesGate.test.ts`:

```ts
/**
 * `npm run test:pages` exiting zero is not proof that the Pages suite ran. These tests
 * hold the post-run JSON auditor to the empty, skipped, duplicated, missing, extra and
 * malformed shapes Playwright itself accepts as a successful invocation.
 */
import { spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import {
  REQUIRED_PAGES_TESTS,
  auditPagesRun,
  auditPagesSpecInventory,
  listPagesSpecFiles,
} from '../scripts/assert-pages-run.mjs'
import type { PagesPlaywrightReport, PagesPlaywrightSpec } from '../scripts/assert-pages-run.mjs'

const WEB_ROOT = fileURLToPath(new URL('..', import.meta.url))
const REQUIRED_SPEC = 'pages-e2e/site.spec.ts'
const REPORTED_SPEC = 'site.spec.ts'
const REVIEWED_TITLES = [
  'opens the lab from precomputed static data with no API or off-origin request',
  'switches representation using only precomputed files',
  'explains a combination the static catalog did not precompute instead of failing',
  'plays the 1s + 2p_z superposition through its precomputed frames and shows the time',
  'restores a deep link and writes state changes back without adding history',
  'embed mode drops the lab chrome and links the same state back to the full lab',
  'serves the textbook under learn/ with typeset math and a figure that loads the lab',
  'answers only under the repository sub-path, with Pages content types',
]

function passingSpec(title: string): PagesPlaywrightSpec {
  return {
    title,
    file: REPORTED_SPEC,
    ok: true,
    tests: [{ status: 'expected', results: [{ status: 'passed' }] }],
  }
}

function passingReport(): PagesPlaywrightReport {
  return {
    config: {
      updateSnapshots: 'none',
      rootDir: join(WEB_ROOT, 'pages-e2e'),
      projects: [{ testDir: join(WEB_ROOT, 'pages-e2e') }],
    },
    errors: [],
    suites: [
      { title: REPORTED_SPEC, file: REPORTED_SPEC, specs: REVIEWED_TITLES.map(passingSpec) },
    ],
    stats: { expected: REVIEWED_TITLES.length, unexpected: 0, flaky: 0, skipped: 0 },
  }
}

function specs(report: PagesPlaywrightReport): PagesPlaywrightSpec[] {
  return report.suites![0]!.specs!
}

function first(report: PagesPlaywrightReport): PagesPlaywrightSpec {
  return specs(report)[0]!
}

describe('assert-pages-run: passing shape and inventory', () => {
  it('pins exactly the reviewed titles of the one Pages spec', () => {
    expect(Object.keys(REQUIRED_PAGES_TESTS)).toEqual([REQUIRED_SPEC])
    expect(REQUIRED_PAGES_TESTS[REQUIRED_SPEC]).toEqual(REVIEWED_TITLES)
  })

  it('accepts one passing execution of every required test', () => {
    expect(auditPagesRun(passingReport(), WEB_ROOT)).toEqual([])
  })

  it('accepts both reporter path spellings for the same bound test root', () => {
    const report = passingReport()
    for (const spec of specs(report)) spec.file = REQUIRED_SPEC
    expect(auditPagesRun(report, WEB_ROOT)).toEqual([])
    for (const spec of specs(report)) spec.file = REQUIRED_SPEC.replaceAll('/', '\\')
    expect(auditPagesRun(report, WEB_ROOT)).toEqual([])
  })

  it('binds the on-disk Pages suite to the closed manifest', () => {
    const discovered = listPagesSpecFiles(WEB_ROOT)
    expect(discovered).toEqual([REQUIRED_SPEC])
    expect(auditPagesSpecInventory(discovered)).toEqual([])
  })

  it('rejects a missing, duplicated, or unmanifested spec file', () => {
    expect(auditPagesSpecInventory([]).join('\n')).toContain('found 0 time(s)')
    expect(auditPagesSpecInventory([REQUIRED_SPEC, REQUIRED_SPEC]).join('\n')).toContain(
      'found 2 time(s)',
    )
    expect(
      auditPagesSpecInventory([REQUIRED_SPEC, 'pages-e2e/extra.spec.ts']).join('\n'),
    ).toContain('unmanifested Pages spec')
  })
})

const reportMutations: ReadonlyArray<
  readonly [string, (report: PagesPlaywrightReport) => void, string]
> = [
  ['snapshot-update mode', (report) => (report.config!.updateSnapshots = 'all'), 'updateSnapshots'],
  [
    'a same-named spec from another test root',
    (report) => {
      report.config!.rootDir = join(WEB_ROOT, 'e2e')
      report.config!.projects = [{ testDir: join(WEB_ROOT, 'e2e') }]
    },
    'config.rootDir',
  ],
  ['a top-level runner error', (report) => report.errors!.push('boom'), 'top-level error'],
  [
    'zero collected suites',
    (report) => {
      report.suites = []
      report.stats = { expected: 0, unexpected: 0, flaky: 0, skipped: 0 }
    },
    '0 test execution(s)',
  ],
  ['the wrong spec path', (report) => (first(report).file = 'other/site.spec.ts'), 'unmanifested test'],
  ['a renamed required title', (report) => (first(report).title = 'renamed'), 'unmanifested test'],
  [
    'a required test missing from the report',
    (report) => {
      specs(report).pop()
      report.stats!.expected = REVIEWED_TITLES.length - 1
    },
    'found 0 report entry',
  ],
  [
    'a duplicated required test',
    (report) => {
      specs(report).push(passingSpec(REVIEWED_TITLES[0]!))
      report.stats!.expected = REVIEWED_TITLES.length + 1
    },
    'found 2 report entry',
  ],
  ['a non-passing spec', (report) => (first(report).ok = false), 'did not pass'],
  ['no test execution', (report) => (first(report).tests = []), 'ran 0 execution(s)'],
  [
    'a skipped test',
    (report) => {
      first(report).tests![0]!.status = 'skipped'
      first(report).tests![0]!.results = [{ status: 'skipped' }]
      report.stats = { expected: REVIEWED_TITLES.length - 1, unexpected: 0, flaky: 0, skipped: 1 }
    },
    'test status is "skipped"',
  ],
  ['no attempt result', (report) => (first(report).tests![0]!.results = []), 'produced 0 result(s)'],
  [
    'a failed attempt',
    (report) => {
      first(report).tests![0]!.status = 'unexpected'
      first(report).tests![0]!.results = [{ status: 'failed' }]
      report.stats = { expected: REVIEWED_TITLES.length - 1, unexpected: 1, flaky: 0, skipped: 0 }
    },
    'result status is "failed"',
  ],
  [
    'two project executions',
    (report) => first(report).tests!.push({ status: 'expected', results: [{ status: 'passed' }] }),
    'ran 2 execution(s)',
  ],
  [
    'two retry results',
    (report) => first(report).tests![0]!.results!.push({ status: 'passed' }),
    'produced 2 result(s)',
  ],
  ['missing summary statistics', (report) => (report.stats = undefined), 'stats.expected'],
  [
    'a malformed suite tree',
    (report) => (report.suites = [null as unknown as NonNullable<typeof report.suites>[number]]),
    '0 test execution(s)',
  ],
  [
    'an extra passing test',
    (report) => {
      specs(report).push(passingSpec('unreviewed extra'))
      report.stats!.expected = REVIEWED_TITLES.length + 1
    },
    'unmanifested test',
  ],
]

describe('assert-pages-run: rejected report shapes', () => {
  it.each(reportMutations)('rejects %s', (_label, mutate, expectedProblem) => {
    const report = passingReport()
    mutate(report)
    expect(auditPagesRun(report, WEB_ROOT).join('\n')).toContain(expectedProblem)
  })
})

describe('assert-pages-run: command exit code', () => {
  const script = fileURLToPath(new URL('../scripts/assert-pages-run.mjs', import.meta.url))

  function run(report: PagesPlaywrightReport) {
    const directory = mkdtempSync(join(tmpdir(), 'quviz-pages-gate-'))
    const reportPath = join(directory, 'report.json')
    writeFileSync(reportPath, JSON.stringify(report), 'utf-8')
    return spawnSync(process.execPath, [script, reportPath], { encoding: 'utf-8' })
  }

  it('returns zero for a complete passing report', () => {
    const result = run(passingReport())
    expect(result.status).toBe(0)
    expect(result.stdout).toContain('required Pages tests ran exactly once')
  })

  it('returns nonzero for a green-but-empty report', () => {
    const report = passingReport()
    report.suites = []
    report.stats = { expected: 0, unexpected: 0, flaky: 0, skipped: 0 }
    const result = run(report)
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('0 test execution(s)')
  })

  it('returns nonzero when Playwright wrote no report', () => {
    const missing = join(mkdtempSync(join(tmpdir(), 'quviz-pages-gate-')), 'missing.json')
    const result = spawnSync(process.execPath, [script, missing], { encoding: 'utf-8' })
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('wrote no JSON report')
  })
})
```

In `tests/test_check_script.py`, insert into `WEB_SCRIPTS` between `"assert-no-skips.mjs",` and the comment block that precedes `"assert-visual-run.d.mts",`:

```python
    # The Pages suite's post-run gate (`npm run test:pages`), the counterpart of
    # ``assert-fullstack-run.mjs`` for web/pages-e2e/: Playwright exits 0 for a run
    # that skipped or collected nothing, so the JSON report is audited against a
    # closed manifest of reviewed titles. It runs in no ``npm test`` stage
    # (``NPM_TEST_STAGES`` above is exact) and reads only Playwright's own report;
    # web/src/pagesGate.test.ts exercises it in the ordinary vitest suite.
    "assert-pages-run.d.mts",
    "assert-pages-run.mjs",
```

After `test_npm_fullstack_script_runs_the_pinned_config_then_audits_its_report`, add:

```python
PAGES_SCRIPT = (
    "playwright test --config=playwright.pages.config.ts && node scripts/assert-pages-run.mjs"
)


def test_npm_pages_script_runs_the_pinned_config_then_audits_its_report() -> None:
    scripts = json.loads(WEB_PACKAGE_JSON.read_text(encoding="utf-8"))["scripts"]
    assert scripts.get("test:pages") == PAGES_SCRIPT, (
        "web/package.json's `test:pages` script must run exactly the reviewed Playwright "
        "config, then reject a skipped or empty report; found "
        f"{scripts.get('test:pages')!r}"
    )
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `npm --prefix web run test:watch -- run src/pagesGate.test.ts`
Expected: `Error: Failed to load url ../scripts/assert-pages-run.mjs … Does the file exist?`, and the file fails.

Run: `uv run --locked --group docs pytest tests/test_check_script.py -q -k "web_scripts_directory or npm_pages_script"`
Expected: `2 failed`. `found` lacks the two `assert-pages-run` files, and `test:pages` is `None`.

- [ ] **Step 3: Implement the auditor, its declaration and the npm script**

Create `web/scripts/assert-pages-run.mjs`:

```js
#!/usr/bin/env node
/**
 * Refuse a green-but-empty Playwright run of the static Pages suite.
 *
 * `npm run test:pages` is the release verdict for the GitHub Pages site -- the Actions
 * workflow only publishes -- so its exit code has to mean the suite ran. Playwright
 * exits zero when every collected test is skipped and when a grep/config change
 * collects nothing. The JSON report must therefore contain exactly the reviewed spec
 * and titles, each exactly once with one passing execution, and no skipped, flaky,
 * unexpected, or extra work.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { posix, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const TEST_DIR = 'pages-e2e'
const SPEC_FILE = /\.(test|spec)\.tsx?$/
const PASSING_TEST_STATUS = 'expected'
const PASSING_RESULT_STATUS = 'passed'

export const REQUIRED_PAGES_TESTS = Object.freeze({
  [`${TEST_DIR}/site.spec.ts`]: Object.freeze([
    'opens the lab from precomputed static data with no API or off-origin request',
    'switches representation using only precomputed files',
    'explains a combination the static catalog did not precompute instead of failing',
    'plays the 1s + 2p_z superposition through its precomputed frames and shows the time',
    'restores a deep link and writes state changes back without adding history',
    'embed mode drops the lab chrome and links the same state back to the full lab',
    'serves the textbook under learn/ with typeset math and a figure that loads the lab',
    'answers only under the repository sub-path, with Pages content types',
  ]),
})

const REQUIRED_EXECUTIONS = Object.values(REQUIRED_PAGES_TESTS).reduce(
  (count, titles) => count + titles.length,
  0,
)

function toPosix(path) {
  return String(path).split('\\').join('/').replace(/^\.\//, '')
}

function walk(dir) {
  const out = []
  for (const entry of readdirSync(dir)) {
    const full = `${dir}${sep}${entry}`
    if (statSync(full).isDirectory()) {
      out.push(...walk(full))
    } else {
      out.push(full)
    }
  }
  return out
}

export function listPagesSpecFiles(webRoot) {
  const root = toPosix(resolve(webRoot))
  return walk(resolve(webRoot, TEST_DIR))
    .map((file) => posix.relative(root, toPosix(file)))
    .filter((path) => SPEC_FILE.test(path))
    .sort()
}

export function auditPagesSpecInventory(actualSpecs) {
  const expected = Object.keys(REQUIRED_PAGES_TESTS).sort()
  const counts = new Map()
  const problems = []
  for (const path of actualSpecs) {
    const normalized = toPosix(path)
    counts.set(normalized, (counts.get(normalized) ?? 0) + 1)
  }
  for (const path of expected) {
    const count = counts.get(path) ?? 0
    if (count !== 1) {
      problems.push(`${path}: found ${count} time(s) on disk (expected exactly once)`)
    }
  }
  for (const [path, count] of counts) {
    if (!Object.hasOwn(REQUIRED_PAGES_TESTS, path)) {
      problems.push(`${path}: unmanifested Pages spec found ${count} time(s) on disk`)
    }
  }
  return problems
}

function collectSpecs(report) {
  const specs = []
  const queue = Array.isArray(report?.suites) ? [...report.suites] : []
  while (queue.length > 0) {
    const suite = queue.shift()
    if (suite === null || typeof suite !== 'object') continue
    if (Array.isArray(suite.specs)) {
      specs.push(...suite.specs.filter((spec) => spec !== null && typeof spec === 'object'))
    }
    if (Array.isArray(suite.suites)) queue.push(...suite.suites)
  }
  return specs
}

function reportedPathMatches(expected, reported) {
  const normalized = toPosix(reported)
  if (normalized === expected) return true
  const prefix = `${TEST_DIR}/`
  return expected.startsWith(prefix) && normalized === expected.slice(prefix.length)
}

function expectedEntry(file, title) {
  for (const [expectedFile, titles] of Object.entries(REQUIRED_PAGES_TESTS)) {
    if (reportedPathMatches(expectedFile, file) && titles.includes(title)) {
      return `${expectedFile}\u0000${title}`
    }
  }
  return undefined
}

/** Problems found in a Playwright JSON report; an empty list means acceptable. */
export function auditPagesRun(report, webRoot) {
  const problems = []
  const expectedTestDir = resolve(webRoot, TEST_DIR)

  if (report?.config?.updateSnapshots !== 'none') {
    problems.push(
      `config.updateSnapshots = ${JSON.stringify(report?.config?.updateSnapshots)} ` +
        '(expected "none")',
    )
  }
  if (
    typeof report?.config?.rootDir !== 'string' ||
    resolve(report.config.rootDir) !== expectedTestDir
  ) {
    problems.push(
      `config.rootDir = ${JSON.stringify(report?.config?.rootDir)} ` +
        `(expected ${JSON.stringify(expectedTestDir)})`,
    )
  }
  const projects = report?.config?.projects
  if (!Array.isArray(projects) || projects.length !== 1) {
    problems.push(
      `config.projects has ${Array.isArray(projects) ? projects.length : 0} ` +
        'project(s) (expected 1)',
    )
  } else if (
    typeof projects[0]?.testDir !== 'string' ||
    resolve(projects[0].testDir) !== expectedTestDir
  ) {
    problems.push(
      `config.projects[0].testDir = ${JSON.stringify(projects[0]?.testDir)} ` +
        `(expected ${JSON.stringify(expectedTestDir)})`,
    )
  }
  if (!Array.isArray(report?.errors)) {
    problems.push('the report has no top-level errors array')
  } else if (report.errors.length > 0) {
    problems.push(`the report contains ${report.errors.length} top-level error(s)`)
  }

  const specs = collectSpecs(report)
  const seenEntries = new Map()
  let executions = 0

  for (const spec of specs) {
    const file = toPosix(spec.file)
    const title = String(spec.title ?? '')
    const where = `${file || '<missing file>'} > ${JSON.stringify(title)}`
    const entry = expectedEntry(file, title)
    if (entry === undefined) {
      problems.push(`${where}: unmanifested test appeared in the report`)
    } else {
      seenEntries.set(entry, (seenEntries.get(entry) ?? 0) + 1)
    }

    if (spec.ok !== true) problems.push(`${where}: did not pass (ok = ${String(spec.ok)})`)
    const tests = Array.isArray(spec.tests) ? spec.tests : []
    executions += tests.length
    if (tests.length !== 1) {
      problems.push(`${where}: ran ${tests.length} execution(s) (expected exactly one)`)
    }
    for (const test of tests) {
      if (test.status !== PASSING_TEST_STATUS) {
        problems.push(`${where}: test status is ${JSON.stringify(test.status)}`)
      }
      const results = Array.isArray(test.results) ? test.results : []
      if (results.length !== 1) {
        problems.push(`${where}: produced ${results.length} result(s) (expected exactly one)`)
      }
      for (const result of results) {
        if (result.status !== PASSING_RESULT_STATUS) {
          problems.push(`${where}: result status is ${JSON.stringify(result.status)}`)
        }
      }
    }
  }

  for (const [file, titles] of Object.entries(REQUIRED_PAGES_TESTS)) {
    for (const title of titles) {
      const count = seenEntries.get(`${file}\u0000${title}`) ?? 0
      if (count !== 1) {
        problems.push(`${file} > ${JSON.stringify(title)}: found ${count} report entry/entries`)
      }
    }
  }
  if (executions !== REQUIRED_EXECUTIONS) {
    problems.push(
      `the report contains ${executions} test execution(s) (expected exactly ${REQUIRED_EXECUTIONS})`,
    )
  }

  const stats = report?.stats
  const expectedStats = { expected: REQUIRED_EXECUTIONS, unexpected: 0, flaky: 0, skipped: 0 }
  for (const [name, expected] of Object.entries(expectedStats)) {
    if (stats?.[name] !== expected) {
      problems.push(`stats.${name} = ${JSON.stringify(stats?.[name])} (expected ${expected})`)
    }
  }
  return problems
}

function main() {
  const webRoot = resolve(fileURLToPath(new URL('..', import.meta.url)))
  const reportPath = resolve(webRoot, process.argv[2] ?? 'test-results/pages/results.json')
  if (!existsSync(reportPath)) {
    console.error(`assert-pages-run: ${reportPath} does not exist; Playwright wrote no JSON report.`)
    process.exit(1)
  }

  const report = JSON.parse(readFileSync(reportPath, 'utf-8'))
  const problems = [
    ...auditPagesSpecInventory(listPagesSpecFiles(webRoot)),
    ...auditPagesRun(report, webRoot),
  ]
  if (problems.length > 0) {
    console.error(`assert-pages-run: ${problems.length} problem(s) in ${reportPath}:`)
    for (const problem of problems) console.error(`  - ${problem}`)
    process.exit(1)
  }
  console.log(
    `assert-pages-run: all ${REQUIRED_EXECUTIONS} required Pages tests ran exactly once and ` +
      'passed; 0 skipped, flaky, unexpected, missing, duplicate, or extra tests.',
  )
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main()
}
```

Create `web/scripts/assert-pages-run.d.mts`:

```ts
export interface PagesPlaywrightResult {
  status?: string
}

export interface PagesPlaywrightTest {
  status?: string
  results?: PagesPlaywrightResult[]
}

export interface PagesPlaywrightSpec {
  title?: string
  file?: string
  ok?: boolean
  tests?: PagesPlaywrightTest[]
}

export interface PagesPlaywrightSuite {
  title?: string
  file?: string
  specs?: PagesPlaywrightSpec[]
  suites?: PagesPlaywrightSuite[]
}

export interface PagesPlaywrightReport {
  config?: {
    updateSnapshots?: string
    rootDir?: string
    projects?: Array<{ testDir?: string }>
  }
  errors?: unknown[]
  suites?: PagesPlaywrightSuite[]
  stats?: {
    expected?: number
    unexpected?: number
    flaky?: number
    skipped?: number
  }
}

export const REQUIRED_PAGES_TESTS: Readonly<Record<string, readonly string[]>>

export function listPagesSpecFiles(webRoot: string): string[]

export function auditPagesSpecInventory(actualSpecs: readonly string[]): string[]

export function auditPagesRun(report: PagesPlaywrightReport, webRoot: string): string[]
```

In `web/package.json`, after the `"test:fullstack": …,` line, add:

```json
    "test:pages": "playwright test --config=playwright.pages.config.ts && node scripts/assert-pages-run.mjs",
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npm --prefix web run test:watch -- run src/pagesGate.test.ts`
Expected: `Tests  26 passed (26)`. That is 5 inventory/shape tests, 18 rejected shapes and 3 exit-code tests.

Run: `npm --prefix web exec --no -- tsc -p web/tsconfig.test.json --noEmit`
Expected: exit 0. The `.d.mts` types the import.

Run: `uv run --locked --group docs pytest tests/test_check_script.py -q -k "web_scripts_directory or npm_pages_script or npm_test_runs_exactly"`
Expected: `3 passed`. The `npm test` chain tuple is unchanged.

- [ ] **Step 5: Run the whole Pages gate**

Run: `npm --prefix web run test:pages`
Expected: `8 passed`, then `assert-pages-run: all 8 required Pages tests ran exactly once and passed; 0 skipped, flaky, unexpected, missing, duplicate, or extra tests.`

- [ ] **Step 6: Document**

In `docs/reference/quality-gates.md`, replace the 🔗 legend line (the one starting `    - 🔗 **仅 CI、全栈集成**`) with:

```markdown
    - 🔗 **本地浏览器集成**：把真实后端或真实构建产物、生产前端构建和 Chromium 接在同一进程树中执行，耗时长且需要先构建，所以**不在** `make check` / `check.ps1` 内；按项目原则（不依赖 CI）以本地运行结果为判据，CI 若也运行（`web-fullstack`）只作复核；
```

Then append after the E3 bullet, whose last line ends `可发布的判据是本地的完整构建与 `npm run test:pages`；`:

```markdown
- 🔗 静态站浏览器门禁 — `npm --prefix web run test:pages`。

    **前提与服务器**：`web/playwright.pages.config.ts` 要求先有一次完整构建；缺少 `build/pages/data/manifest.json` 时在加载阶段直接报错。随后以 `build_pages.py --skip-data --serve 4180` 重建实验室与教材、保留预计算数据，并严格按 Pages 子路径托管。

    **覆盖范围**：`web/pages-e2e/site.spec.ts` 的 8 项测试覆盖：

    - 开场场景只来自 `data/`（零 `/api` 请求、零离站请求）；
    - 切换表示法；
    - 未预计算的组合显示中文原因；
    - `1s + 2p_z` 按预计算帧格点播放并显示时间；
    - 深链接往返，且不产生历史记录；
    - embed 模式；
    - `learn/` 教材的公式排版，以及嵌入图 iframe 就绪；
    - 子路径外一律 404。

    教材页只允许 `mkdocs.yml` 固定的 jsDelivr 前缀作为离站请求，因此需要网络。

    **运行后审计**：Playwright 之后，`web/scripts/assert-pages-run.mjs` 以闭合集合审计 JSON 报告：固定 spec 与 8 个标题各恰好一次通过，拒绝 0 tests、skip、flaky、重复或额外测试。其正/负控在 `web/src/pagesGate.test.ts`；`web/src/guards.test.ts` 的零 skip 源码扫描同样覆盖 `web/pages-e2e/`。

    **未断言的部分**：Material 的 instant navigation 在本地端口上退化为整页跳转，所以不在这里断言；它由全栈门禁在 `mkdocs serve` 下断言；
```

In `docs/getting-started/development.md`, replace the two lines `这条门禁由 CI 的 `web-fullstack` job 执行，不在 `make check` / `check.ps1` 内。它验证源码` / `checkout 的生产挂载路径；当前 wheel 是否携带静态前端仍是独立的发布验证项。` with:

```markdown
本地运行即判据（本项目不依赖 CI）；CI 的 `web-fullstack` job 另行重跑。它不在 `make check` / `check.ps1` 内，
验证的是源码 checkout 的生产挂载路径；当前 wheel 是否携带静态前端仍是独立的发布验证项。
```

Then append at the end of `## 静态教材站（GitHub Pages）`:

````markdown
静态站的浏览器门禁在一次完整构建之后运行，每次只重建实验室与教材：

```bash
npm --prefix web run test:pages
```

它在上面的子路径下验证开场场景、表示法切换、未预计算提示、叠加态播放、深链接、嵌入模式与教材页（教材页需要网络以加载 MathJax），然后由 `assert-pages-run.mjs` 审计报告，只有恰好 8 项测试各运行一次且全部通过才算绿。
````

Run: `uv run --locked --group docs pytest tests/test_docs_integrity.py tests/test_mkdocs_system.py -q` and `uv run --locked --group docs mkdocs build --strict`.
Expected: all passed; `Documentation built`.

- [ ] **Step 7: Pre-commit gates (CLAUDE.md), then commit**

Run:
- `uv run --locked --group docs pytest --cov=quviz --cov-report=term-missing`. Expected: coverage ≥ 85%, 0 skipped.
- `npm --prefix web run test`. Expected: the `assert-no-skips` line now counts `pagesGate.test.ts`.
- `npm --prefix web run typecheck`. Expected: exit 0.

```bash
git add web/scripts/assert-pages-run.mjs web/scripts/assert-pages-run.d.mts web/src/pagesGate.test.ts web/package.json tests/test_check_script.py docs/reference/quality-gates.md docs/getting-started/development.md
git commit -m "$(cat <<'EOF'
test(pages): audit the Pages Playwright report against a closed title manifest

Claude-Session: https://claude.ai/code/session_01E44DEzsc7Av26fc7nZ5rSo
EOF
)"
```

---

### Task E6: Docker visual gate wrappers (`visual-docker.ps1` / `.sh` / container entry)

**Files:**
- Create: `scripts/visual-docker.ps1`
- Create: `scripts/visual-docker.sh`
- Create: `scripts/visual-docker-entry.sh`
- Create: `tests/test_visual_docker.py`
- Modify: `docs/reference/quality-gates.md`:
  - the 🖥️ legend line (line 13);
  - the paragraphs starting `**`check.ps1` / `make check` 完全不覆盖视觉映射。**` (line 104) and `**基线的产生方式是刻意昂贵的。**` (line 108).
- Modify: `docs/getting-started/development.md`: insert a section immediately before `## 提交前门禁`

**Interfaces:**
- Consumes:
  - `web/package.json` scripts `test:visual` (`playwright test && node scripts/assert-visual-run.mjs`) and `test:visual:update` (`playwright test --update-snapshots`).
  - `engines.node` and the exact `@playwright/test` version from `web/package.json`.
- Produces:
  - `pwsh scripts/visual-docker.ps1 [-Mode check|update] [-Fresh]`
  - `bash scripts/visual-docker.sh [check|update] [--fresh]`
  - `bash scripts/visual-docker-entry.sh <check|update>`, run inside the container with cwd `/work`.
  - Image `mcr.microsoft.com/playwright:v1.62.1-noble@sha256:dcc5531e97840b9b5e794f2814476b21571c5124a3fca2267d73041f56e7580e`.
  - Volume `quviz-visual-node-modules`.

- [ ] **Step 1: Write the failing tests**

Create `tests/test_visual_docker.py`:

```python
"""scripts/visual-docker.ps1 -- the supported way to run the pixel gate on a dev machine.

web/playwright.config.ts refuses to load off Linux, so the visual suite runs inside the
Playwright image pinned by digest. These tests shadow ``docker`` with a stub (the
technique tests/test_check_script.py uses for uv and npm), so they need pwsh but no
Docker: they pin that the wrapper checks the image's Node against web/package.json's
engines BEFORE anything is installed, passes the pinned mounts and mode through, and
returns the gate's own exit code. The text checks at the end pin that both wrappers run
the image of the exact @playwright/test version the lockfile installs.
"""

from __future__ import annotations

import json
import os
import re
import shutil
import stat
import subprocess
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
PS_WRAPPER = ROOT / "scripts" / "visual-docker.ps1"
SH_WRAPPER = ROOT / "scripts" / "visual-docker.sh"
ENTRY = ROOT / "scripts" / "visual-docker-entry.sh"
WEB_PACKAGE_JSON = ROOT / "web" / "package.json"
VOLUME = "quviz-visual-node-modules"
_IMAGE = re.compile(
    r"mcr\.microsoft\.com/playwright:v(?P<version>\d+\.\d+\.\d+)-noble@sha256:[0-9a-f]{64}"
)


def _write_docker_stub(directory: Path) -> None:
    if sys.platform == "win32":
        (directory / "docker.cmd").write_text(
            "@echo off\r\n"
            'if "%1"=="info" exit /b %STUB_INFO_EXIT%\r\n'
            'echo %* | findstr /C:"node --version" >nul\r\n'
            "if not errorlevel 1 (\r\n"
            "  echo %STUB_NODE_VERSION%\r\n"
            "  exit /b 0\r\n"
            ")\r\n"
            "echo [stub docker] %*\r\n"
            "exit /b %STUB_GATE_EXIT%\r\n",
            encoding="ascii",
        )
    else:
        stub = directory / "docker"
        stub.write_text(
            "#!/bin/sh\n"
            'if [ "$1" = info ]; then exit "$STUB_INFO_EXIT"; fi\n'
            'case "$*" in *"node --version"*) echo "$STUB_NODE_VERSION"; exit 0;; esac\n'
            'echo "[stub docker] $*"\n'
            'exit "$STUB_GATE_EXIT"\n',
            encoding="ascii",
        )
        stub.chmod(stub.stat().st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)


def _run(
    tmp_path: Path, *args: str, node: str = "v24.15.0", info_exit: int = 0, gate_exit: int = 0
) -> subprocess.CompletedProcess[str]:
    pwsh = shutil.which("pwsh")
    assert pwsh, "pwsh is required to exercise scripts/visual-docker.ps1 (as for check.ps1)"
    stubs = tmp_path / "stubs"
    stubs.mkdir(exist_ok=True)
    _write_docker_stub(stubs)
    env = dict(
        os.environ,
        PATH=os.pathsep.join([str(stubs), os.environ.get("PATH", "")]),
        STUB_NODE_VERSION=node,
        STUB_INFO_EXIT=str(info_exit),
        STUB_GATE_EXIT=str(gate_exit),
    )
    return subprocess.run(
        [pwsh, "-NoProfile", "-File", str(PS_WRAPPER), *args],
        cwd=tmp_path,
        env=env,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
    )


def _gate_invocations(stdout: str) -> list[str]:
    return [line.removeprefix("[stub docker] ") for line in stdout.splitlines() if line.startswith("[stub docker] ")]


def test_the_parametrized_node_versions_straddle_the_current_engines_range() -> None:
    engines = json.loads(WEB_PACKAGE_JSON.read_text(encoding="utf-8"))["engines"]["node"]
    assert engines == "^22.22.2 || ^24.15.0 || >=26.0.0", (
        "web/package.json engines changed: move the accepted and rejected versions below to "
        "the new boundaries -- the wrapper reads engines at run time, these cases do not"
    )


@pytest.mark.parametrize("node", ["v22.22.2", "v24.15.0", "v26.0.0"])
def test_a_supported_image_node_reaches_the_gate_with_the_pinned_mounts(
    tmp_path: Path, node: str
) -> None:
    run = _run(tmp_path, node=node)
    assert run.returncode == 0, run.stdout + run.stderr
    gates = _gate_invocations(run.stdout)
    assert len(gates) == 1, run.stdout
    (gate,) = gates
    image = _IMAGE.search(PS_WRAPPER.read_text(encoding="utf-8"))
    assert image is not None
    for expected in (
        "run --rm",
        "-e CI=1",
        "-e QUVIZ_FRESH=0",
        ":/work ",
        f"{VOLUME}:/work/web/node_modules",
        "-w /work ",
        image.group(0),
        "bash scripts/visual-docker-entry.sh check",
    ):
        assert expected in gate, f"{expected!r} missing from: {gate}"


@pytest.mark.parametrize("node", ["v24.14.1", "v22.22.1", "v25.9.0"])
def test_an_image_node_outside_the_engines_range_never_reaches_the_gate(
    tmp_path: Path, node: str
) -> None:
    run = _run(tmp_path, node=node)
    output = run.stdout + run.stderr
    assert run.returncode != 0, output
    assert _gate_invocations(run.stdout) == [], output
    assert node in output and "engines" in output, output


def test_update_mode_and_a_fresh_install_pass_through_and_the_exit_code_is_the_gates(
    tmp_path: Path,
) -> None:
    run = _run(tmp_path, "-Mode", "update", "-Fresh", gate_exit=3)
    assert run.returncode == 3, run.stdout + run.stderr
    (gate,) = _gate_invocations(run.stdout)
    assert "-e QUVIZ_FRESH=1" in gate
    assert gate.endswith("bash scripts/visual-docker-entry.sh update")


def test_a_stopped_docker_daemon_fails_before_any_container_runs(tmp_path: Path) -> None:
    run = _run(tmp_path, info_exit=1)
    output = run.stdout + run.stderr
    assert run.returncode != 0
    assert _gate_invocations(run.stdout) == []
    assert "Docker daemon is not running" in output, output


def test_an_unknown_mode_is_rejected(tmp_path: Path) -> None:
    run = _run(tmp_path, "-Mode", "bogus")
    assert run.returncode != 0
    assert _gate_invocations(run.stdout) == []
    # pwsh's ValidateSet error names the parameter; a missing script would not.
    assert "Mode" in run.stdout + run.stderr, run.stdout + run.stderr


def test_both_wrappers_run_the_image_of_the_locked_playwright() -> None:
    ps_image = _IMAGE.search(PS_WRAPPER.read_text(encoding="utf-8"))
    sh_image = _IMAGE.search(SH_WRAPPER.read_text(encoding="utf-8"))
    assert ps_image is not None and sh_image is not None
    assert ps_image.group(0) == sh_image.group(0)
    locked = json.loads(WEB_PACKAGE_JSON.read_text(encoding="utf-8"))["devDependencies"][
        "@playwright/test"
    ]
    assert re.fullmatch(r"\d+\.\d+\.\d+", locked), "@playwright/test must stay exactly pinned"
    assert ps_image.group("version") == locked, (
        f"the visual image is Playwright {ps_image.group('version')} but web/package.json pins "
        f"{locked}; browser builds differ per version, so the baselines would be drawn by a "
        "Chromium the suite does not install"
    )


def test_the_posix_twin_mirrors_the_powershell_wrapper() -> None:
    posix = SH_WRAPPER.read_text(encoding="utf-8")
    for fragment in (
        VOLUME,
        "bash scripts/visual-docker-entry.sh",
        "-e CI=1",
        "QUVIZ_FRESH",
        "node --version",
        "web/package.json",
    ):
        assert fragment in posix, fragment


def test_the_container_entry_runs_exactly_the_visual_npm_scripts() -> None:
    entry = ENTRY.read_text(encoding="utf-8")
    assert "npm ci --no-audit --no-fund" in entry
    assert "npm run test:visual || status=$?" in entry
    assert "{ npm run test:visual:update && npm run test:visual; } || status=$?" in entry
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `uv run --locked --group docs pytest tests/test_visual_docker.py -q`
Expected:
- `test_the_parametrized_node_versions_straddle_the_current_engines_range` passes.
- Every wrapper-run test fails: pwsh reports that `…\scripts\visual-docker.ps1` does not exist, with a nonzero exit, and the "supported" cases fail on `returncode == 0`.
- The three text tests fail with `FileNotFoundError`.

- [ ] **Step 3: Implement the three scripts**

Create `scripts/visual-docker.ps1`:

```powershell
<#
.SYNOPSIS
Run -- or deliberately regenerate -- the Linux/SwiftShader visual gate in the pinned
Playwright image.

.DESCRIPTION
web/playwright.config.ts refuses to load off Linux: the committed baselines are
SwiftShader's pixels in one image, and any other graphics stack draws different ones.
This wrapper runs the suite in exactly that image, pinned by digest, with the checkout
bind-mounted at /work and the container's own node_modules in a named volume (the host's
web/node_modules carries Windows-only native bindings).

  -Mode check    npm run test:visual                        (compare with the baselines)
  -Mode update   npm run test:visual:update, then test:visual (rewrite, compare again)
  -Fresh         force `npm ci` into the volume even when package-lock.json is unchanged

Before anything is installed, the image's own `node --version` is checked against
web/package.json's engines: under engine-strict an unsupported Node would only fail later,
inside `npm ci`, with a less useful message. The run writes web/dist and web/test-results
in the checkout, and (update mode) web/e2e/__screenshots__, which must be reviewed PNG by
PNG before committing. tests/test_visual_docker.py runs this script against a stub docker.
#>
[CmdletBinding()]
param(
    [ValidateSet('check', 'update')]
    [string] $Mode = 'check',
    [switch] $Fresh
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# The image of the exact @playwright/test version web/package.json pins, by digest, so a
# re-pushed tag cannot change the pixels under an unchanged script.
$Image = 'mcr.microsoft.com/playwright:v1.62.1-noble@sha256:dcc5531e97840b9b5e794f2814476b21571c5124a3fca2267d73041f56e7580e'
$Volume = 'quviz-visual-node-modules'
$repoRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path

function Test-NodeSatisfiesEngines {
    # Reads the two clause shapes web/package.json uses: ^X.Y.Z and >=X.Y.Z, joined by ||.
    param(
        [Parameter(Mandatory)] [string] $Version,
        [Parameter(Mandatory)] [string] $Range
    )
    if ($Version -notmatch '^v?(\d+)\.(\d+)\.(\d+)$') {
        return $false
    }
    $have = [version]::new([int]$Matches[1], [int]$Matches[2], [int]$Matches[3])
    foreach ($clause in ($Range -split '\|\|')) {
        $text = $clause.Trim()
        if ($text -notmatch '^(\^|>=)(\d+)\.(\d+)\.(\d+)$') {
            throw "visual-docker: engines clause '$text' is not ^X.Y.Z or >=X.Y.Z; teach this script the new shape"
        }
        $floor = [version]::new([int]$Matches[2], [int]$Matches[3], [int]$Matches[4])
        if ($Matches[1] -eq '^') {
            if ($have.Major -eq $floor.Major -and $have -ge $floor) {
                return $true
            }
        }
        elseif ($have -ge $floor) {
            return $true
        }
    }
    return $false
}

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    throw 'visual-docker: docker is not on PATH; install Docker Desktop (Linux containers).'
}
& docker info --format '{{.ServerVersion}}' *> $null
if ($LASTEXITCODE -ne 0) {
    throw 'visual-docker: the Docker daemon is not running; start Docker Desktop and retry.'
}

$packageJson = Join-Path $repoRoot 'web/package.json'
$engines = (Get-Content -Raw -LiteralPath $packageJson | ConvertFrom-Json).engines.node
$nodeVersion = ((& docker run --rm $Image node --version) | Out-String).Trim()
if ($LASTEXITCODE -ne 0) {
    throw "visual-docker: could not run 'node --version' in $Image."
}
if (-not (Test-NodeSatisfiesEngines -Version $nodeVersion -Range $engines)) {
    throw ("visual-docker: the image ships Node $nodeVersion, which web/package.json engines " +
        "'$engines' rejects; npm ci would fail under engine-strict. Pin an image whose Node " +
        'satisfies engines.')
}
Write-Host "visual-docker: image Node $nodeVersion satisfies engines '$engines'"

$fresh = if ($Fresh) { '1' } else { '0' }
$runArgs = @(
    'run', '--rm', '--init', '--ipc=host',
    '-e', 'CI=1',
    '-e', "QUVIZ_FRESH=$fresh",
    '-v', "${repoRoot}:/work",
    '-v', "${Volume}:/work/web/node_modules",
    '-w', '/work',
    $Image,
    'bash', 'scripts/visual-docker-entry.sh', $Mode
)
& docker @runArgs
exit $LASTEXITCODE
```

Create `scripts/visual-docker.sh`:

```bash
#!/usr/bin/env bash
# POSIX twin of scripts/visual-docker.ps1: run (check) or regenerate (update) the visual
# gate in the pinned Playwright image. Usage: bash scripts/visual-docker.sh [check|update] [--fresh]
# See the .ps1 header for why. tests/test_visual_docker.py pins that both wrappers use the
# same image, volume, entry script and engines source.
set -euo pipefail

IMAGE='mcr.microsoft.com/playwright:v1.62.1-noble@sha256:dcc5531e97840b9b5e794f2814476b21571c5124a3fca2267d73041f56e7580e'
VOLUME='quviz-visual-node-modules'
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

mode="${1:-check}"
fresh=0
if [ "${2:-}" = "--fresh" ]; then fresh=1; fi
case "$mode" in
  check|update) ;;
  *) echo "visual-docker: mode must be check or update, not '$mode'" >&2; exit 2 ;;
esac

command -v docker >/dev/null 2>&1 || { echo "visual-docker: docker is not on PATH" >&2; exit 1; }
docker info --format '{{.ServerVersion}}' >/dev/null 2>&1 \
  || { echo "visual-docker: the Docker daemon is not running" >&2; exit 1; }

version_ge() {  # $1 >= $2, both X.Y.Z
  local a1 a2 a3 b1 b2 b3
  IFS=. read -r a1 a2 a3 <<<"$1"
  IFS=. read -r b1 b2 b3 <<<"$2"
  (( a1 > b1 || (a1 == b1 && (a2 > b2 || (a2 == b2 && a3 >= b3))) ))
}

satisfies() {  # $1 = vX.Y.Z, $2 = engines range of ^X.Y.Z / >=X.Y.Z clauses joined by ||
  local have="${1#v}" clause floor
  [[ "$have" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || return 1
  IFS='|' read -ra clauses <<<"${2//||/|}"
  for clause in "${clauses[@]}"; do
    clause="${clause//[[:space:]]/}"
    [ -n "$clause" ] || continue
    case "$clause" in
      '^'*) floor="${clause#^}"; [ "${have%%.*}" = "${floor%%.*}" ] && version_ge "$have" "$floor" && return 0 ;;
      '>='*) floor="${clause#>=}"; version_ge "$have" "$floor" && return 0 ;;
      *) echo "visual-docker: unsupported engines clause '$clause'" >&2; exit 1 ;;
    esac
  done
  return 1
}

engines="$(sed -n 's/^[[:space:]]*"node":[[:space:]]*"\([^"]*\)".*/\1/p' "$repo_root/web/package.json" | head -n 1)"
node_version="$(docker run --rm "$IMAGE" node --version)"
if ! satisfies "$node_version" "$engines"; then
  echo "visual-docker: the image ships Node $node_version, which web/package.json engines '$engines' rejects" >&2
  exit 1
fi
echo "visual-docker: image Node $node_version satisfies engines '$engines'"

exec docker run --rm --init --ipc=host \
  -e CI=1 -e "QUVIZ_FRESH=$fresh" -e "HOST_UID=$(id -u)" -e "HOST_GID=$(id -g)" \
  -v "$repo_root:/work" -v "$VOLUME:/work/web/node_modules" -w /work \
  "$IMAGE" bash scripts/visual-docker-entry.sh "$mode"
```

Create `scripts/visual-docker-entry.sh`:

```bash
#!/usr/bin/env bash
# Runs INSIDE mcr.microsoft.com/playwright (started by scripts/visual-docker.ps1 or
# scripts/visual-docker.sh) with the checkout at /work. Installs the locked web
# dependencies into the node_modules volume when package-lock.json changed, then runs
# the visual gate in the requested mode. Never run it on a host: it expects /work.
set -euo pipefail

mode="${1:-check}"
cd /work/web

lock_hash="$(sha256sum package-lock.json | cut -d' ' -f1)"
marker="node_modules/.quviz-package-lock.sha256"
if [ "${QUVIZ_FRESH:-0}" = "1" ] || [ ! -f "$marker" ] || [ "$(cat "$marker")" != "$lock_hash" ]; then
  # npm ci empties node_modules' entries (not the mount point) and reinstalls the lockfile.
  npm ci --no-audit --no-fund
  printf '%s\n' "$lock_hash" > "$marker"
fi

status=0
case "$mode" in
  check)
    npm run test:visual || status=$?
    ;;
  update)
    { npm run test:visual:update && npm run test:visual; } || status=$?
    ;;
  *)
    echo "visual-docker-entry: unknown mode '$mode' (expected check or update)" >&2
    exit 2
    ;;
esac

# POSIX hosts pass their uid/gid so files written into the bind mount stay theirs.
if [ -n "${HOST_UID:-}" ] && [ -n "${HOST_GID:-}" ]; then
  for path in /work/web/dist /work/web/test-results /work/web/playwright-report /work/web/e2e/__screenshots__; do
    if [ -e "$path" ]; then chown -R "$HOST_UID:$HOST_GID" "$path"; fi
  done
fi
exit "$status"
```

- [ ] **Step 4: Run the tests and lint, and confirm they pass**

Run: `uv run --locked --group docs pytest tests/test_visual_docker.py -q`
Expected: `13 passed`. There are 9 pwsh runs; each takes about 1 s.

Run: `uv run --locked ruff check tests/test_visual_docker.py` and `uv run --locked ruff format --check tests/test_visual_docker.py`.
Expected: `All checks passed!`, `1 file already formatted`.

- [ ] **Step 5: Confirm the image's Node once, against real Docker**

Start Docker Desktop in Linux-containers mode, and wait until `docker info --format '{{.ServerVersion}}'` prints a version. Run:

`docker run --rm mcr.microsoft.com/playwright:v1.62.1-noble@sha256:dcc5531e97840b9b5e794f2814476b21571c5124a3fca2267d73041f56e7580e node --version`

Expected: `v24.x.y` with `x ≥ 15`. The image config records `NODE_VERSION=24`. If it prints `v24.14.x` or lower, stop. The pinned image cannot run `npm ci` under engine-strict. Report this to the user and do not change the engines.

- [ ] **Step 6: Document the Docker flow**

In `docs/reference/quality-gates.md`, replace the 🖥️ legend line (starting `    - 🖥️ **仅 CI、需 Linux/SwiftShader**`) with:

```markdown
    - 🖥️ **固定 Linux 镜像、需 Docker**：判据是像素，而像素由图形栈决定，所以只在按 digest 固定的 `mcr.microsoft.com/playwright:v1.62.1-noble` 容器里运行（`pwsh scripts/visual-docker.ps1`，POSIX 宿主用 `bash scripts/visual-docker.sh`），**不在** `make check` / `check.ps1` 内；按项目原则以本地容器结果为判据，CI 的 `web-visual` job 运行同一套件只作复核；与 🌐 的区别不是“需要网络”而是“需要那一个渲染环境”——它在 Windows/macOS 宿主上不是变慢或变不准，而是**根本不允许直接运行**；
```

Replace the whole paragraph beginning `    **`check.ps1` / `make check` 完全不覆盖视觉映射。**` with:

```markdown
    **`check.ps1` / `make check` 完全不覆盖视觉映射。** `web/playwright.config.ts` 在非 Linux 上于**模块加载时**直接抛错，所以这条门禁在 Windows/macOS 宿主上不是“没跑”，而是**不允许跑**，只能进入按 digest 固定的 Linux 容器：`pwsh scripts/visual-docker.ps1`（POSIX 宿主用 `bash scripts/visual-docker.sh`）。

    这不是洁癖：基线是该镜像里 SwiftShader（Chromium 的软件光栅化器）画出来的像素。Windows 与 macOS 的字体栅格化、次像素定位和可用的 ANGLE 后端都不同，同一份代码在那里会渲染出可见不同的图。真正的危险不是宿主上全红，而是全红之后有人顺手敲 `--update-snapshots`：那会**用这台机器的像素覆盖掉基线**，此后套件在宿主上绿、在固定镜像里红，并且不再描述任何回归。所以守卫是抛错而不是 `skip`：`skip` 之下 `--update-snapshots` 照样能写。

    容器脚本在 `npm ci` 之前先检查镜像自带的 Node 是否满足 `web/package.json` 的 `engines`；镜像版本号必须等于精确固定的 `@playwright/test`。`tests/test_visual_docker.py` 以桩 `docker` 执行脚本并钉住这两点。
```

Replace the whole paragraph beginning `    **基线的产生方式是刻意昂贵的。**` with:

```markdown
    **基线的产生方式是刻意昂贵的。** `updateSnapshots: 'none'` 让“缺失基线”成为失败，而不是被静默写入的答案键；Playwright 的默认值 `'missing'` 会把新断言的第一次运行变成它自己的答案键，包括 bug。

    有意改变画面时只走一条路：

    1. 在固定容器里运行 `pwsh scripts/visual-docker.ps1 -Mode update`，重写五张 PNG 并立即再比较一次。同一环境下刚画的图都对不上，说明渲染不确定，而不是基线问题。
    2. 由人逐张检查：节线水平且正瓣在上；相位逆时针缠绕一圈且原点是洞；简并态两时刻同图；1s + 2p_z 在 $t=0$ 与 $t=8.4$ 分别偏向 $+z$ 与 $-z$；画面里没有任何浮层。
    3. 重测 `web/e2e/slice.spec.ts` 的校准表。
    4. check 模式通过后才提交。

    `assert-visual-run.mjs` 拒绝 update 运行产生的报告，所以一次 update 永远不能冒充一次比较。
```

In `docs/getting-started/development.md`, insert immediately before `## 提交前门禁`:

````markdown
## 视觉像素门禁（Docker）

`web/playwright.config.ts` 在非 Linux 上直接拒绝加载：五张基线是固定镜像里 SwiftShader 的像素。本地运行需要 Docker Desktop（Linux 容器）：

```powershell
pwsh scripts/visual-docker.ps1                 # check：对照已提交基线（npm run test:visual）
pwsh scripts/visual-docker.ps1 -Mode update    # 仅在有意改变画面时：重写基线后立即再比较一次
pwsh scripts/visual-docker.ps1 -Fresh          # 忽略缓存，在容器内重新 npm ci
```

POSIX 宿主使用 `bash scripts/visual-docker.sh [check|update] [--fresh]`。

镜像按 digest 固定为 `mcr.microsoft.com/playwright:v1.62.1-noble`，其版本号必须等于 `web/package.json` 精确固定的 `@playwright/test`。脚本先在镜像里执行 `node --version`，不满足 `engines` 就在 `npm ci` 之前退出。

容器的 `node_modules` 放在名为 `quviz-visual-node-modules` 的 Docker 卷里，因为宿主的 `web/node_modules` 带有 Windows 原生绑定；锁文件未变时复用该卷。运行会在工作树里写入 `web/dist` 与 `web/test-results/`，`update` 模式还会改写 `web/e2e/__screenshots__/`。提交这些 PNG 之前必须逐张人工检查，标准见 `web/e2e/slice.spec.ts` 顶部。

````

Run: `uv run --locked --group docs pytest tests/test_docs_integrity.py tests/test_mkdocs_system.py -q` and `uv run --locked --group docs mkdocs build --strict`.
Expected: all passed; `Documentation built`.

- [ ] **Step 7: Pre-commit gate (CLAUDE.md), then commit**

Run: `uv run --locked --group docs pytest --cov=quviz --cov-report=term-missing`
Expected: coverage ≥ 85%, 0 skipped.

```bash
git add scripts/visual-docker.ps1 scripts/visual-docker.sh scripts/visual-docker-entry.sh tests/test_visual_docker.py docs/reference/quality-gates.md docs/getting-started/development.md
git commit -m "$(cat <<'EOF'
feat(visual): run the SwiftShader visual gate locally in a digest-pinned Playwright image

Claude-Session: https://claude.ai/code/session_01E44DEzsc7Av26fc7nZ5rSo
EOF
)"
```

---

### Task E7: Regenerate and review the five 1280×800 baselines; re-measure the calibration tables

**Files:**
- Modify: the 5 PNGs in `web/e2e/__screenshots__/slice.spec.ts/`: `1s2pz-t0-xz.png`, `1s2pz-t8-4-xz.png`, `2p-1-phase-xy.png`, `2pz-real-xz.png`, `degenerate-stationary-xz.png`
- Modify: `web/e2e/slice.spec.ts`, comments only:
  - the header block "HOW THE BASELINES GET HERE" (lines 35-62) and the paragraph at lines 139-142;
  - the timeout comment (line 199);
  - the `COMPARISON` comment (lines 211-216);
  - the calibration block above `HALF_PERIOD_REJECTION` (lines 256-282);
  - the geometry test comment (lines 794-800);
  - the half-period comment (lines 864-867);
  - the transposition comment (lines 912-919).
- Modify: `docs/reference/quality-gates.md`, the 🖥️ slice bullet (line 98)
- Scratch (not committed): `build/visual-measure/measure.config.ts`, and `measure-visual.cjs` in your scratchpad directory

**Interfaces:**
- Consumes:
  - E6's `scripts/visual-docker.ps1`.
  - Part D's full-bleed canvas (1280×800 viewport), with every floating panel carrying `data-chrome`.
  - Part D's adapted `web/e2e/slice.spec.ts`, which hides `[data-chrome]` before capture and keeps the 8 required titles and the AST-pinned assertions of `web/scripts/assert-visual-run.mjs:76-191,509-556`.
- Produces: five committed 1280×800 baselines and re-measured calibration comments. The code values are unchanged: `threshold: 0.02`, `maxDiffPixelRatio: 0.001`, and `rejectionComparison(0.05 | 0.1 | 0.1)`.

- [ ] **Step 1: Preconditions and the failing run**

```bash
grep -n "data-chrome" web/e2e/slice.spec.ts
node -e "const {PNG}=require(require.resolve('playwright-core/lib/utilsBundle',{paths:['web']}));const fs=require('fs');for(const f of fs.readdirSync('web/e2e/__screenshots__/slice.spec.ts')){const p=PNG.sync.read(fs.readFileSync('web/e2e/__screenshots__/slice.spec.ts/'+f));console.log(f,p.width+'x'+p.height)}"
```

Expected: the grep prints the capture-preparation line that hides `[data-chrome]` (Part D). The node probe prints `672x704` for all five files. If the grep prints nothing, stop: Part D's visual-suite adaptation is missing.

Run: `pwsh -NoProfile -File scripts/visual-docker.ps1`
Expected, and this is the failing state that justifies regeneration:
- `visual-docker: image Node v24.… satisfies engines …`;
- `npm ci` on the first run;
- the five positive screenshot comparisons fail with a size mismatch (`Expected an image 672px by 704px, received 1280px by 800px`). `renders through a software WebGL2 stack…` passes.
- `assert-visual-run` reports the failures, and the wrapper exits nonzero.

- [ ] **Step 2: Regenerate inside the container**

Run: `pwsh -NoProfile -File scripts/visual-docker.ps1 -Mode update`
Expected:
- the update run writes the five PNGs;
- the immediately following check run prints `8 passed` and `assert-visual-run: all 8 required tests in 2 e2e spec file(s) passed with their required visual assertions, compared against committed baselines (updateSnapshots = none).`

A failure in the follow-up check means the renderer is nondeterministic. Find what is still moving; do not widen any budget.

Run: `git status --short web/e2e/__screenshots__`
Expected: exactly the five PNGs, all ` M`.

- [ ] **Step 3: Human review of every PNG (explicit criteria)**

Open each PNG (for example with the Read tool, which renders images). Re-run the node probe from Step 1; it must now print `1280x800` for all five. Check each file against the frame table:

| Baseline | Must show |
|---|---|
| `2pz-real-xz.png` | Two lobes, one above the other. The upper lobe is on the red end of the diverging ramp (`#fa4646`, +A) and the lower lobe on the cyan end (`#46fafa`, −A). The nodal line between them is **horizontal**, meaning u = x runs across the screen and v = z runs up it. Near-zero amplitude is the neutral `#383838`. Nothing is masked. |
| `2p-1-phase-xy.png` | The hue winds **once, counter-clockwise** around the centre. Red (phase 0) is on the left (−u) and cyan (phase π) on the right (+u); the top is violet (between blue and magenta) and the bottom yellow-green. Exactly one centre texel is a hole: the background shows through, not red. |
| `degenerate-stationary-xz.png` | A density section on the sequential ramp `#383838` → `#4646fa` → `#acacfd` (dark = low, pale blue = high), asymmetric along z. The same file serves t = 0 and t = 8.4; the check run in Step 2 proves they are identical. |
| `1s2pz-t0-xz.png` | Density displaced towards **+z** (upper half brighter): the dipole ⟨z⟩ = +0.745 a₀ at t = 0. |
| `1s2pz-t8-4-xz.png` | Density displaced towards **−z** (lower half brighter): half a Bohr period later. Visibly different from `1s2pz-t0-xz.png`. |

Every file must also meet these criteria:
- it is exactly 1280×800;
- the slice quad's centre lies within 5% of the frame centre, horizontally and vertically;
- there is no DOM chrome anywhere: no text, glass panel, button, legend pill, header, time pill or backdrop blur;
- the background is the neutral scene colour;
- any ground grid is neutral grey and lies in the xy plane, so it is horizontal for the xz views;
- no starfield or coloured decorative light is visible.

Any mismatch is a rendering defect. Fix it in Part D's code and repeat Step 2; never commit a PNG that fails a criterion.

- [ ] **Step 4: Capture the two negative-control frames**

Create `build/visual-measure/measure.config.ts`. It lives in `build/`, which is gitignored.

```ts
// One-off measurement config -- lives in build/ (gitignored) and is deleted afterwards.
// It reuses the visual suite's pinned config unchanged and only adds an end-of-test
// viewport screenshot, so the two `.not.toHaveScreenshot` controls leave behind the frame
// they rejected. The canvas is full-bleed and every [data-chrome] panel is hidden before
// capture, so this viewport screenshot is the canvas screenshot.
import base from '../../web/playwright.config'

export default {
  ...base,
  testDir: '/work/web/e2e',
  outputDir: '/work/build/visual-measure/out',
  reporter: [['list']],
  use: { ...base.use, screenshot: 'on' },
  webServer: { ...base.webServer, cwd: '/work/web' },
}
```

Run from the repository root, in PowerShell. The `node_modules` volume was filled in Step 1.

```powershell
docker run --rm --init --ipc=host -e CI=1 -v "${PWD}:/work" -v quviz-visual-node-modules:/work/web/node_modules -w /work/web mcr.microsoft.com/playwright:v1.62.1-noble@sha256:dcc5531e97840b9b5e794f2814476b21571c5124a3fca2267d73041f56e7580e npx --no-install playwright test --config=/work/build/visual-measure/measure.config.ts --grep "transposed slice|two-percent"
```

Expected: `2 passed`, and two `test-finished-1.png` files under `build/visual-measure/out/`. One is in a directory whose name contains `transposed`, the other in one containing `two-percent`.

- [ ] **Step 5: Re-measure the calibration numbers**

Write `measure-visual.cjs` into your scratchpad directory (not the repository):

```js
// Scratch -- NOT committed. Re-measures every calibration number quoted in
// web/e2e/slice.spec.ts from the committed baselines and the two negative-control frames
// captured by build/visual-measure/measure.config.ts, through Playwright's own
// comparator. Run from the repository root:  node <scratchpad>/measure-visual.cjs
'use strict'
const fs = require('node:fs')
const path = require('node:path')

const repo = process.cwd()
const web = path.join(repo, 'web')
const { utils } = require(require.resolve('playwright-core/lib/coreBundle', { paths: [web] }))
const { PNG } = require(require.resolve('playwright-core/lib/utilsBundle', { paths: [web] }))
const compare = utils.getComparator('image/png')
const baselines = path.join(web, 'e2e', '__screenshots__', 'slice.spec.ts')
const captured = path.join(repo, 'build', 'visual-measure', 'out')
const LADDER = [0.2, 0.1, 0.05, 0.03, 0.02, 0.01, 0]
const RATIO = 0.001
const GEOMETRY_SCALE = 1.02

const decode = (file) => PNG.sync.read(fs.readFileSync(file))

function differing(actualFile, expectedFile, threshold) {
  const result = compare(fs.readFileSync(actualFile), fs.readFileSync(expectedFile), {
    threshold,
    maxDiffPixels: 0,
  })
  if (result === null) return 0
  const match = /^(\d+) pixels/.exec(result.errorMessage ?? '')
  if (!match) throw new Error(`unexpected comparator result for ${actualFile}: ${result.errorMessage}`)
  return Number(match[1])
}

function finished(fragment) {
  const found = []
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (entry.name === 'test-finished-1.png' && full.includes(fragment)) found.push(full)
    }
  }
  walk(captured)
  if (found.length !== 1) throw new Error(`expected one frame for "${fragment}", found ${found.length}`)
  return found[0]
}

function ladder(label, actualFile, expectedFile) {
  const { width, height } = decode(expectedFile)
  const budget = width * height * RATIO
  const rows = LADDER.map((threshold) => {
    const pixels = differing(actualFile, expectedFile, threshold)
    return { threshold, pixels, times: pixels / budget }
  })
  console.log(`\n${label}\n  frame ${width} x ${height} = ${width * height} px, budget ${budget} px`)
  for (const row of rows) {
    console.log(`  ${String(row.threshold).padEnd(5)} ${String(row.pixels).padStart(8)}  ${row.times.toFixed(2)}x`)
  }
  return { width, height, budget, rows, at: (t) => rows.find((row) => row.threshold === t) }
}

function changedBox(actualFile, expectedFile) {
  const a = decode(actualFile)
  const b = decode(expectedFile)
  let minX = Infinity
  let minY = Infinity
  let maxX = -1
  let maxY = -1
  for (let y = 0; y < a.height; y += 1) {
    for (let x = 0; x < a.width; x += 1) {
      const i = (y * a.width + x) * 4
      const delta = Math.max(
        Math.abs(a.data[i] - b.data[i]),
        Math.abs(a.data[i + 1] - b.data[i + 1]),
        Math.abs(a.data[i + 2] - b.data[i + 2]),
      )
      if (delta > 32) {
        minX = Math.min(minX, x)
        maxX = Math.max(maxX, x)
        minY = Math.min(minY, y)
        maxY = Math.max(maxY, y)
      }
    }
  }
  return { width: maxX - minX + 1, height: maxY - minY + 1 }
}

for (const name of ['1s2pz-t0-xz', '1s2pz-t8-4-xz', '2p-1-phase-xy', '2pz-real-xz', 'degenerate-stationary-xz']) {
  const { width, height } = decode(path.join(baselines, `${name}.png`))
  console.log(`${name}.png  ${width} x ${height}`)
}

const half = ladder('half-period: 1s2pz t=8.4 vs t=0', path.join(baselines, '1s2pz-t8-4-xz.png'), path.join(baselines, '1s2pz-t0-xz.png'))
const transposed = ladder('transposition: rejected frame vs 2pz-real-xz', finished('transposed'), path.join(baselines, '2pz-real-xz.png'))
const geometryFrame = finished('two-percent')
const geometry = ladder('geometry: rejected frame vs degenerate-stationary-xz', geometryFrame, path.join(baselines, 'degenerate-stationary-xz.png'))
const box = changedBox(geometryFrame, path.join(baselines, 'degenerate-stationary-xz.png'))
const quad = Math.round(Math.max(box.width, box.height) / GEOMETRY_SCALE)
const edge = ((quad * (GEOMETRY_SCALE - 1)) / 2).toFixed(2)
console.log(`\ngeometry: changed box ${box.width} x ${box.height} px -> baseline quad ~${quad} px, each edge moves ~${edge} px`)

const verdicts = [
  ['half-period 0.05 keeps >= 2x margin', half.at(0.05).times >= 2],
  ['transposition 0.1 clears the budget', transposed.at(0.1).times > 1],
  ['geometry 0.1 clears the budget', geometry.at(0.1).times > 1],
]
console.log('')
for (const [label, ok] of verdicts) console.log(`${ok ? 'OK  ' : 'STOP'} ${label}`)
if (verdicts.some(([, ok]) => !ok)) {
  console.log('\nSTOP: a mechanism control lost its margin on the new frame. Do not change the thresholds here; escalate.')
  process.exitCode = 1
}

const fx = (row) => row.times.toFixed(2)
const size = `${half.width} x ${half.height}`
console.log('\n=== (a) COMPARISON comment: replace the sentence "On the fixed 672 x 704 frame, ... pixel budget)." ===')
console.log(` * On the full-bleed ${size} frame, the same mutation leaves ${half.at(0.02).pixels}\n * differing pixels at 0.02 (${fx(half.at(0.02))}x the ${half.budget} pixel budget).`)
console.log('\n=== (b) calibration block: replace the frame sentence and the table rows ===')
console.log(` * ${size}, so \`maxDiffPixelRatio\` 0.001 is a budget of ${half.budget} pixels and an\n * assertion fires only above it:\n *\n *   threshold   surviving px   x budget`)
for (const row of half.rows) {
  const label = row.threshold === 0.05 ? '0.05 (reject)' : row.threshold === 0.02 ? '0.02 (accept)' : String(row.threshold)
  const note = row.threshold === 0.05 ? '   <- chosen: harder, with margin' : row.threshold === 0.02 ? '   <- positive mutation sensitivity' : ''
  console.log(` *   ${label.padEnd(14)}${String(row.pixels).padStart(8)}   ${fx(row).padStart(6)}${note}`)
}
console.log(` *\n * 0.05 is higher than the positive 0.02 and is therefore the stronger negated\n * assertion, but the physical displacement still clears its unchanged ratio\n * budget by ${fx(half.at(0.05))}x. The transposition control retains the still-harder 0.1\n * bar (measured: ${transposed.at(0.1).pixels} px, ${fx(transposed.at(0.1))}x the budget) and the geometry control\n * also uses 0.1 (measured: ${geometry.at(0.1).pixels} px, ${fx(geometry.at(0.1))}x): its two-percent scale error\n * moves each edge of the ~${quad}-pixel quad by ~${edge} pixels, leaving a solid non-AA\n * band after pixelmatch excludes the one-pixel antialiased fringe.`)
console.log('\n=== (c) geometry test comment: replace "moves each edge of this 456px quad by 4.56 pixels" ===')
console.log(`  // moves each edge of this ~${quad}px quad by ~${edge} pixels`)
console.log('\n=== (d) half-period test comment: replace its measurement sentence ===')
console.log(`  // The displacement here is a deep-blue lobe crossing a dark ground. At the\n  // 0.05 boundary ${half.at(0.05).pixels} pixels survive, or ${fx(half.at(0.05))}x the ${size} frame's\n  // ${half.budget}-pixel budget.`)
console.log('\n=== (e) transposition test comment: replace the frame/budget sentence ===')
console.log(`  // The committed ${size} baseline has ${half.width * half.height} pixels and therefore a ${half.budget}-pixel\n  // ratio budget. This control clears that budget at threshold 0.1 (measured:\n  // ${transposed.at(0.1).pixels} px, ${fx(transposed.at(0.1))}x) after antialiased edge pixels are excluded.`)
```

Run: `node <scratchpad>/measure-visual.cjs`
Expected:
- five `… 1280 x 800` lines;
- three ladders, each with budget `1024 px`;
- the geometry quad line;
- three `OK` verdicts;
- the five replacement snippets (a)–(e).

If any verdict prints `STOP`, the process exits 1. Do not edit thresholds. Report the ladders to the user. A threshold change also requires editing `web/scripts/assert-visual-run.mjs:535-537` and the matching pins in `web/src/visualGate.test.ts`, and needs its own reviewed decision.

- [ ] **Step 6: Update the comments in `web/e2e/slice.spec.ts`**

Replace the header paragraph from ` * Five Linux/SwiftShader PNGs are committed in `e2e/__screenshots__/`.` through the end of step `3. The second run must pass. …` with:

```ts
 * Five Linux/SwiftShader PNGs are committed in `e2e/__screenshots__/`. Every
 * file is 1280 x 800 = 1024000 pixels -- the full-bleed canvas IS the
 * viewport, and every floating panel carries `data-chrome` and is hidden
 * before capture -- so the 0.001 ratio budget is 1024 pixels. Panel content,
 * fonts and backdrop blur therefore never reach a baseline, and adding a
 * diagnostic to a panel cannot change the camera aspect ratio.
 *
 * playwright.config.ts refuses to load off Linux because any other graphics
 * stack renders different pixels. The one supported environment is the
 * Playwright image pinned by digest in scripts/visual-docker.ps1 (POSIX:
 * scripts/visual-docker.sh). A baseline enters the tree in three steps:
 *
 *   1. `pwsh scripts/visual-docker.ps1 -Mode update` rewrites the PNGs from
 *      what the container just rendered and immediately runs the ordinary
 *      comparison against them. A comparison that fails right after the
 *      rewrite is a nondeterministic renderer, not a baseline problem.
 *   2. A human reviews every rewritten PNG before committing it -- the node
 *      line of 2p_z horizontal with the positive (red) lobe on top, the
 *      2p(+1) phase winding once counter-clockwise from red at -u with the
 *      masked origin a hole, the degenerate section identical at both
 *      instants, the 1s + 2p_z lobe displaced towards +z at t = 0 and towards
 *      -z at t = 8.4, no DOM chrome in any frame -- and re-measures the
 *      calibration tables below from the committed files.
 *   3. `pwsh scripts/visual-docker.ps1` (check mode) must pass on the
 *      committed PNGs, and scripts/assert-visual-run.mjs must accept the
 *      report.
```

Replace the paragraph starting ` * `npm run test:visual:update` is not part of this procedure.` with:

```ts
 * `npm run test:visual:update` on a host is not part of this procedure: the
 * config refuses to load there, and inside the container it only ever runs as
 * step 1 above, followed by a human review. scripts/assert-visual-run.mjs
 * refuses the report an update run produces, so an update can never stand in
 * for the comparison.
```

Then:
- in the timeout comment, replace `these canvases are 672 x 704,` with `these canvases are 1280 x 800,`;
- apply the script's snippet (a) to the `COMPARISON` comment;
- snippet (b): replace the frame sentence, the whole 7-row table and the paragraph beneath it, up to and including `…one-pixel antialiased fringe.`; keep `All three share the positive test's timeout …` as is;
- snippet (c) goes into the geometry test comment, (d) into the half-period test comment and (e) into the transposition test comment.

Verify: `grep -n "672\|473\.088\|473088\|456px\|456-pixel\|4\.56\|6186\|3180" web/e2e/slice.spec.ts` prints nothing.

Verify: `npm --prefix web run typecheck`, then `npm --prefix web run test:watch -- run src/visualGate.test.ts`. Expected: exit 0, and the visual gate's AST pins still pass, since no code value changed.

- [ ] **Step 7: Update the quality-gates frame statement**

In `docs/reference/quality-gates.md`, in the bullet starting `- 🖥️ 切片渲染的截图回归`, make four substring replacements:
1. `五张已提交基线统一为 `672×704`：` → `五张已提交基线统一为 `1280×800`（全屏画布即视口；截图前隐藏全部 `[data-chrome]` 浮层，基线只含画布像素）：`
2. `；固定桌面壳把 canvas 尺寸与控制栏/Inspector 内容高度解耦）` → `）`
3. `正向像素比较使用 `threshold: 0.02` 与 `maxDiffPixelRatio: 0.001`；` → `正向像素比较使用 `threshold: 0.02` 与 `maxDiffPixelRatio: 0.001`（1280×800 帧即 1,024 像素预算，三个负控的实测余量记录在 `slice.spec.ts` 的校准注释中）；`
4. `运行方式：`npm run test:visual` = ` → `运行方式：`pwsh scripts/visual-docker.ps1`（POSIX 宿主用 `bash scripts/visual-docker.sh`）在按 digest 固定的 `mcr.microsoft.com/playwright:v1.62.1-noble` 容器中执行 `npm run test:visual` = `

Run: `uv run --locked --group docs pytest tests/test_docs_integrity.py tests/test_mkdocs_system.py -q` and `uv run --locked --group docs mkdocs build --strict`.
Expected: all passed; `Documentation built`.

- [ ] **Step 8: The committed state passes, and scratch is gone**

Run: `pwsh -NoProfile -File scripts/visual-docker.ps1`
Expected: `8 passed` and the `assert-visual-run: all 8 required tests …` line. The wrapper exits 0.

Run in PowerShell: `Remove-Item -Recurse -Force build/visual-measure`. Then `git status --short`.
Expected: only the five PNGs, `web/e2e/slice.spec.ts` and `docs/reference/quality-gates.md` are modified.

- [ ] **Step 9: Pre-commit gates (CLAUDE.md), then commit**

Run:
- `npm --prefix web run test`. Expected: the `assert-no-skips` and `assert-coverage-scope` lines.
- `npm --prefix web run typecheck`. Expected: exit 0.

The visual run in Step 8 is the rendering gate CLAUDE.md asks for.

```bash
git add web/e2e/__screenshots__/slice.spec.ts/1s2pz-t0-xz.png web/e2e/__screenshots__/slice.spec.ts/1s2pz-t8-4-xz.png web/e2e/__screenshots__/slice.spec.ts/2p-1-phase-xy.png web/e2e/__screenshots__/slice.spec.ts/2pz-real-xz.png web/e2e/__screenshots__/slice.spec.ts/degenerate-stationary-xz.png web/e2e/slice.spec.ts docs/reference/quality-gates.md
git commit -m "$(cat <<'EOF'
test(visual): regenerate the five full-bleed 1280x800 baselines in the pinned image

Each PNG was reviewed against the frame table, and the half-period,
transposition and geometry calibration numbers were re-measured with
Playwright's comparator on the committed files.

Claude-Session: https://claude.ai/code/session_01E44DEzsc7Av26fc7nZ5rSo
EOF
)"
```

---

### Task E8: Release docs — status checkpoint, capability ledger, roadmap, README, CONTRIBUTING

**Files:**
- Modify: `docs/project/status.md`:
  - new section before `## 能力账本` (line 17);
  - three new ledger rows after the React row (line 31);
  - two substring edits in the React row.
- Modify: `docs/project/roadmap.md`:
  - the info admonition (lines 5-8);
  - new section before `## M2：1D TISE / TDSE 数值实验室` (line 49), and that heading.
- Modify: `README.md`:
  - new section after line 23 (`请先阅读文档中的[当前状态]…`);
  - new paragraphs after line 139 (the fullstack audit sentence).
- Modify: `CONTRIBUTING.md`: after the `## 提交前` block (lines 25-29)

**Interfaces:**
- Consumes: the deliverables of A–D (verified in Step 1) and E1–E7.
- Produces: docs that keep these pins green:
  - `tests/test_docs_integrity.py:270-333`: `README.md` still contains `解析含时叠加态` and `平面切片`; README, CONTRIBUTING and `installation.md` keep `uv sync --locked --all-groups` and `npm --prefix web ci --no-audit --no-fund`; `status.md` keeps `12s 以及 1s+12s 即使在 513 上限仍明确 fail-closed` and `period_au`.
  - `tests/test_declared_versions.py:156-183`: the README commands, no `\ncd web`, and `--check` on generator lines.

- [ ] **Step 1: Evidence for every claim (read-only)**

```bash
grep -n "not_precomputed" web/src/api/capability.ts | head -2
grep -n "export function createStaticTransport" web/src/api/staticCatalog.ts
grep -n "export function parseDeepLink" web/src/state/urlState.ts
grep -n "radial_profile" src/quviz/scene/models.py | head -2
grep -rln "export-static" src/quviz/cli.py
ls docs/textbook | head -20
grep -rln "data-chrome" web/src/components | head -3
grep -rn "ErrorBoundary\|WebGL" web/src/components --include=*.tsx -l | head -3
grep -rn "DEFAULT_PLAYBACK_PERIOD_AU" web/src || echo "DEFAULT_PLAYBACK_PERIOD_AU removed"
grep -n "toneMapped" web/src/scene/CurrentStreamlines.tsx | head -2
grep -rln "2s-2pz\|2s+2p" tests/*.py | head -3
ls docs/adr
```

Expected: every line has a hit. The first "grep DEFAULT…" prints `DEFAULT_PLAYBACK_PERIOD_AU removed`. `docs/adr` lists an `0005-…` file. Note the exact paths. Wherever a bullet below cites a test or ADR, use the path printed here. If a deliverable has no evidence, delete its clause from the text below rather than claiming it.

- [ ] **Step 2: `docs/project/status.md`**

Insert immediately before `## 能力账本`:

```markdown
## 教材站 checkpoint（2026-09-25）

在 Phase 0 checkpoint 之上，本轮把 QuViz 做成一个无需后端即可阅读的公开教材站，同时保留本地 `quviz serve` 的实时计算。

**静态实验室**

- `quviz export-static` 按 `StaticCatalogSpec` 生成预计算目录：全部 $n\le4$ 本征态的实基与复基、四种表示法，以及服务端目录的四个叠加预设按播放帧格点展开。
- 导出器通过 ASGI 逐字回放前端的真实请求并写盘。请求清单由前端自己的请求构造代码经 vite-node 枚举，所以清单的键就是浏览器将要发出的字面 `route?query`。
- `pages` 构建模式把全部 `fetch` 换成静态传输层：命中时按 manifest 合成状态码与 `X-QuViz-*` 头；未命中时返回中文原因。
- 能力覆盖层把“物理允许但未预计算”的组合标为 `not_precomputed`，并如实显示原因。
- URL hash 深链接与 `embed=1` 让教材可以嵌入并打开任意预计算状态。

**Weather Lab 式界面**：全屏画布加玻璃浮层，z 轴朝上；径向分布 $P(r)$ 与能级图；指南弹窗、查找面板、错误边界与 WebGL 不可用提示，以及移动端抽屉。颜色语义只由图例承担：错误宣称“色彩表示 arg ψ”的视口说明已删除。

**教材**：MkDocs 新增 `docs/textbook/` 学习者章节。每章至少有一张“点击加载”的嵌入交互图，可一键在实验室中打开同一状态。静态托管与预计算目录的决定记录在 ADR-0005。

**构建与发布**：`scripts/build_pages.py` 在本地组装站点，并按仓库子路径预览与线上相同的站点；`npm run test:pages` 在该子路径下验证 8 条用户路径。`.github/workflows/pages.yml` 只在 master 上用同一脚本重建并部署，是发布器而不是门禁。视觉基线改在按 digest 固定的 Docker 镜像中本地生成：帧为 1280×800，五张基线已逐张人工检查，三个负控的校准余量已重测。

**同时修复**：

- `2s + 2p_z` 的默认视图不再是必然 422 的等值面，并有一条修复前失败的回归测试；
- 流线材质不再经过色调映射与雾；
- 数据切片不再经过 Vignette，Bloom 默认为 0；
- 删除残留的 `DEFAULT_PLAYBACK_PERIOD_AU` 默认实参；
- Pages 构建不再发布 sourcemap。

**尚未执行的对外动作**（需维护者确认）：推送分支；在仓库设置中启用 GitHub Pages，构建来源设为 GitHub Actions；合并到 master 以触发首次部署。另有两项待维护者决定：是否在首次发布前改正仓库名里的 `Atmoic`（站点地址会随之改变）；是否在公开站点保留指向私有 claude.ai artifact 的 `claude-fable-audit` 引用。
```

In the ledger table, in the row starting `| React/Three.js 场景 |`:
- replace `vitest 单测（34 个 spec 文件、1010 项）` with `vitest 单测（数量见教材站 checkpoint 的实测表）`;
- replace `CI job 接线受门禁，但本地结果不替代远端 runner 的实际执行；` with `视觉门禁改在按 digest 固定的 Linux 镜像中本地运行（`scripts/visual-docker.ps1`），本地结果即判据，CI job 只作复核；`;
- replace `主 bundle 1,261.33 kB（gzip 347.25 kB）尚待拆分` with `主 bundle 尚待拆分（体积见实测表）`.

Directly after that row, add:

```markdown
| 静态实验室（GitHub Pages） | 导出器单测（ASGI 回放与 TestClient 逐字节相同、422 照录、文件名哈希、manifest 结构）；前端静态传输、静态目录、能力覆盖层与 URL 状态单测；`npm run test:pages` 的 8 项浏览器测试：零 `/api`、零离站请求、只在仓库子路径下访问 | 只包含 `StaticCatalogSpec` 列出的组合：$n\le4$、$Z=1$，采样数、种子、分辨率、包围概率、种子线数固定，叠加态只有四个预设及其播放帧；任意参数仍需本地 `quviz serve`；预计算数据在构建时生成，不入库 |
| 教材（`learn/`） | MkDocs strict、全页入 nav 与引用门禁；`test:pages` 验证公式排版，以及嵌入图 iframe 到达 `data-scene-ready` | 章节的物理审校是人工门禁；MathJax 与 Mermaid 仍来自 jsDelivr；本地预览（非 80 端口）中 instant navigation 退化为整页跳转 |
| 构建与发布 | `tests/test_build_pages.py`、`tests/test_pages_workflow.py`；Node 版本由 `tests/test_declared_versions.py` 对所有 workflow 统一钉住；`scripts/visual-docker.ps1` 由 `tests/test_visual_docker.py` 以桩 `docker` 验证 | Pages 尚未启用；发布 workflow 是发布器而不是门禁；`build` 使用 `pages: read` 调用 `actions/configure-pages`，首次部署时才能实测 |
```

- [ ] **Step 3: `docs/project/roadmap.md`**

Replace the admonition (`!!! info "当前暂停点：Phase 0 checkpoint"` and its two indented lines) with:

```markdown
!!! info "当前 checkpoint：教材站（2026-09-25）"

    在 Phase 0 checkpoint（M0R、M1、切片、浏览器产品路径与文档系统收口）之上，教材站 checkpoint
    交付了 GitHub Pages 静态实验室、Weather Lab 式界面与 `learn/` 教材。下一步是 M2（一维 TISE/TDSE
    数值实验室），它将另立设计文档后开始；M3–M6 仍待开发。路线图描述的是目标，不是当前产品能力。
```

Insert immediately before `## M2：1D TISE / TDSE 数值实验室`:

```markdown
## 教材站：静态实验室与教材（2026-09-25 完成）

- 预计算场景目录：`quviz export-static` 通过 ASGI 逐字回放前端真实请求；请求清单由前端请求构造代码枚举，因此不存在第二份需要同步的参数拼写。
- 前端静态传输层与能力覆盖层：未预计算的组合如实显示原因；URL hash 深链接与嵌入模式。
- Weather Lab 式重设计：全屏画布、玻璃浮层、z 轴朝上、径向分布与能级图。
- `learn/` 教材：学习者章节，每章有可交互的嵌入图。
- 发布：`scripts/build_pages.py` 本地构建并按子路径预览，这是最终验证；`.github/workflows/pages.yml` 只负责部署。视觉基线在固定 Docker 镜像中本地生成并人工检查。
```

Replace the heading `## M2：1D TISE / TDSE 数值实验室` with `## M2：1D TISE / TDSE 数值实验室（下一步）`.

- [ ] **Step 4: `README.md` and `CONTRIBUTING.md`**

In `README.md`, insert after the line `请先阅读文档中的[当前状态](docs/project/status.md)；愿景或路线图中的能力不代表今天已经实现。` (and its blank line):

````markdown
## 在线教材站

教材站发布在 <https://longwarriors.github.io/Atmoic-quantum-visualization/>，由 `.github/workflows/pages.yml` 在 master 更新后部署。在仓库启用 GitHub Pages、并把构建来源设为 GitHub Actions 之前，该地址不可访问。

- 根路径是全屏 3D 实验室的**静态教学版**：只读取构建时预计算的场景数据，没有 Python 后端。预计算目录之外的组合会如实显示“未预计算”及原因；任意参数的实时计算仍需本地 `quviz serve`。
- `learn/` 是教材：按学习顺序排列的章节、公式、引用、思考题。每章的交互图都可以一键在实验室中打开。

仓库名里的 `Atmoic` 是历史拼写，会原样出现在这个地址里。站点内部全部使用相对路径；`site_url` 在构建时由 `git remote get-url origin` 推导，发布 workflow 中则取自 `actions/configure-pages`。所以在 GitHub 上重命名仓库之后，只需更新本段地址，构建脚本与配置都不用改。

在本地构建并按与线上相同的子路径预览。首次完整构建要预计算全部场景数据，耗时从数分钟到数十分钟不等：

```bash
uv run --locked --no-sync python scripts/build_pages.py
uv run --locked --no-sync python scripts/build_pages.py --skip-data --serve 4180
```

然后打开 `http://127.0.0.1:4180/Atmoic-quantum-visualization/`。
````

After the line `该命令在 Playwright 后审计 JSON 报告，0 tests、skip、重复/额外测试或错误测试目录都不会按绿色处理。`, add:

````markdown

静态教材站的浏览器门禁要求先完成一次完整构建。之后每次运行只重建实验室与教材、复用预计算数据，并在上面的子路径下验证开场场景、表示法切换、未预计算提示、叠加态播放、深链接、嵌入模式与教材页：

```bash
npm --prefix web run test:pages
```

视觉像素门禁只在按 digest 固定的 Linux 镜像中运行（在 Windows 上 `web/playwright.config.ts` 会直接拒绝加载），需要 Docker Desktop：

```bash
pwsh scripts/visual-docker.ps1
```

只有在有意改变画面时才运行 `pwsh scripts/visual-docker.ps1 -Mode update`，并在提交前逐张人工检查重写的五张基线。
````

In `CONTRIBUTING.md`, append after the `## 提交前` code block (the one containing `make check`):

````markdown

改动前端、教材或构建脚本时，提交前还要在本地运行以下命令（本项目不依赖 CI，本地结果即最终验证）：

```bash
uv run --locked --no-sync python scripts/build_pages.py
npm --prefix web run test:fullstack
npm --prefix web run test:pages
pwsh scripts/visual-docker.ps1
```

`pwsh scripts/visual-docker.ps1 -Mode update` 只用于有意改变画面：重写的基线必须逐张人工检查后才能提交。
````

- [ ] **Step 5: Run the docs gates**

Run: `uv run --locked --group docs pytest tests/test_docs_integrity.py tests/test_declared_versions.py tests/test_mkdocs_system.py tests/test_bibliography.py -q`
Expected: all passed. The README and CONTRIBUTING pins still hold, and no table row has `|` inside `$…$`.

Run: `uv run --locked --group docs python scripts/render_reference_index.py --check` and `uv run --locked --group docs mkdocs build --strict`.
Expected: exit 0; `Documentation built`.

Run: `git diff --stat`
Expected: exactly the four files. `grep -rn "github.io" docs/` prints nothing.

- [ ] **Step 6: Pre-commit gate (CLAUDE.md), then commit**

Run: `uv run --locked --group docs pytest --cov=quviz --cov-report=term-missing`
Expected: coverage ≥ 85%, 0 skipped. Docs pins are Python tests.

```bash
git add docs/project/status.md docs/project/roadmap.md README.md CONTRIBUTING.md
git commit -m "$(cat <<'EOF'
docs: record the textbook-site checkpoint, the Pages URL and the release commands

Claude-Session: https://claude.ai/code/session_01E44DEzsc7Av26fc7nZ5rSo
EOF
)"
```

---

### Task E9: Final verification — every gate, recorded results, whole-branch review, outward actions listed (not performed)

**Files:**
- Modify: `docs/project/status.md`: append the measured-results table at the end of the section `## 教材站 checkpoint（2026-09-25）`, after its last paragraph `**尚未执行的对外动作**…`

**Interfaces:**
- Consumes: everything above.
- Produces: a recorded, reproducible verdict; a review request; and the list of user-gated outward actions.

- [ ] **Step 1: Clean tree**

Run: `git status --short`
Expected: no output.

- [ ] **Step 2: Python, lint, type and docs gates (contract "Shared commands")**

Run each command and keep its output:

```bash
uv run --locked ruff check .
uv run --locked ruff format --check .
uv run --locked mypy
uv run --locked --group docs pytest --cov=quviz --cov-report=term-missing
uv run --locked --group docs python scripts/render_reference_index.py --check
uv run --locked --group docs python scripts/render_openapi_reference.py --check
uv run --locked --group docs mkdocs build --strict
```

Expected, in order:
- `All checks passed!`
- `N files already formatted`
- `Success: no issues found in N source files`
- pytest ends `N passed` with no `skipped`, and prints `Required test coverage of 85% reached. Total coverage: XX.XX%`
- both `--check` commands exit 0
- `INFO    -  Documentation built in … seconds`

- [ ] **Step 3: Web gates**

```bash
npm --prefix web run test
npm --prefix web run typecheck
npm --prefix web run build
npm --prefix web run test:fullstack
```

Expected:
- `npm run test` prints `assert-no-skips: N tests in M spec files, all passed, 0 skipped, 0 todo.` and the three `assert-coverage-scope:` lines, with every gated module meeting 90/85/90/90.
- `typecheck` exits 0.
- `build` prints `✓ built in` (the chunk-size warning is known).
- `test:fullstack` prints `1 passed` and `assert-fullstack-run: the required product-path test ran exactly once and passed; …`.

- [ ] **Step 4: Full Pages build, Pages suite and visual gate**

```bash
uv run --locked --no-sync python scripts/build_pages.py 2>&1 | tee build/pages-build.log
npm --prefix web run test:pages
pwsh -NoProfile -File scripts/visual-docker.ps1
```

Expected:
- The build prints `[1/5]` … `[5/5]`, the size report and `build_pages: site ready in …`.
- `test:pages` prints `8 passed` and `assert-pages-run: all 8 required Pages tests ran exactly once and passed; …`.
- The visual gate prints `visual-docker: image Node v24.… satisfies engines …`, `8 passed` and `assert-visual-run: all 8 required tests in 2 e2e spec file(s) passed …`.

If any gate fails, stop. Diagnose the root cause per CLAUDE.md, fix it in the owning task's files, and re-run from the failing gate. Never record a partial pass.

- [ ] **Step 5: Record the measured results**

Append to `docs/project/status.md`, at the end of `## 教材站 checkpoint（2026-09-25）`. Each value comes from the output named in the right-hand note; copy numbers verbatim.

```markdown
本树最终实测（2026-09-25，Windows 11、CPython 3.12、同一工作树）：

| 门禁 | 结果 |
|---|---|
| Ruff / mypy | ruff 与 format 通过；mypy strict 无问题（N 个源文件） |
| Python 全量 | N passed，0 skipped；总覆盖率 XX.XX%（门槛 85%） |
| 引用、HTTP schema 与 MkDocs | 两个 `--check` 与 `mkdocs build --strict` 通过 |
| 前端全量 | N 个 spec 文件、N passed，0 skipped、0 todo；N 个模块逐文件达标 |
| 类型检查与生产构建 | `typecheck` 通过；JS N kB（gzip N kB） |
| 全栈浏览器 | `npm run test:fullstack` 1/1 通过 |
| 静态站构建 | `build_pages.py` 完整构建通过：站点 N MB（`data/` N MB，`learn/` N MB，`assets/` N MB） |
| 静态站浏览器 | `npm run test:pages` 8/8 通过 |
| 视觉像素 | `scripts/visual-docker.ps1` 8/8 通过（1280×800 基线） |
```

Replace every `N`/`XX.XX` with the measured value:

| Value | Source |
|---|---|
| mypy source-file count | mypy's `Success: … in N source files` |
| pytest count and coverage | the pytest summary line and the `Total coverage` line |
| vitest file and test counts | the `assert-no-skips: N tests in M spec files` line |
| gated module count | the `assert-coverage-scope: the report lists N module(s)` line |
| JS and gzip sizes | vite's `dist/assets/index-*.js … kB │ gzip: … kB` line |
| site total | the `site size:` line of `build/pages-build.log` |
| per-directory sizes | the `by top-level entry:` rows of `build/pages-build.log` |

Run: `uv run --locked --group docs pytest tests/test_docs_integrity.py tests/test_mkdocs_system.py -q` and `uv run --locked --group docs mkdocs build --strict`.
Expected: all passed; `Documentation built`.

```bash
git add docs/project/status.md
git commit -m "$(cat <<'EOF'
docs(status): record the measured gate results of the textbook-site checkpoint

Claude-Session: https://claude.ai/code/session_01E44DEzsc7Av26fc7nZ5rSo
EOF
)"
```

- [ ] **Step 6: Whole-branch review**

Invoke `superpowers:requesting-code-review` for the range `master...feat/pages-textbook-lab`, covering all of Parts A–E. Handle the findings with `superpowers:receiving-code-review`: verify each claim with evidence before acting, and fix confirmed defects with a regression test that fails before the fix. After any fix, re-run the affected gates from Steps 2–4, re-record Step 5 if a number changed, and commit.

- [ ] **Step 7: Report, and list the outward-facing actions (do NOT perform them)**

Report to the user: every command run in Steps 2–4 with its result, what was not verified, and the review outcome. Nothing here is unverified locally except the first real deployment.

Then list these actions. Each needs the user's explicit confirmation before it is taken:

1. **Repository name.** Decide whether to rename the repository first to fix `Atmoic` (`gh repo rename <new-name>`). The site URL follows the name; if renamed, update the README URL. `build_pages.py` needs no change.
2. **Private citation.** Decide whether the public site keeps `references.bib`'s `claude-fable-audit` entry, which links a private claude.ai artifact. Removing it also means editing `docs/project/status.md` and `docs/references/source-audit.md`, the two citing lines.
3. **Push the branch.** `git push -u origin feat/pages-textbook-lab`. CI's `web-visual` job will compare the new baselines on `ubuntu-latest`. Per CLAUDE.md the local Docker result is the verdict; a CI mismatch would be a runner-versus-image difference to investigate, not a reason to regenerate.
4. **Enable Pages with the Actions build type, before merging.** `gh api -X POST repos/longwarriors/Atmoic-quantum-visualization/pages -f build_type=workflow`. Without it, `actions/configure-pages` fails on the first master push.
5. **Merge to master.** Open the pull request and merge; the push to master triggers `.github/workflows/pages.yml`.
6. **After the first deployment, verify the live site.** Open the URL, then:
   - `curl -sI https://longwarriors.github.io/Atmoic-quantum-visualization/data/manifest.json` should show `200` and `content-type: application/json`;
   - the lab should render the opening scene;
   - `learn/` should typeset its math.

   This first run is also where `pages: read` for `configure-pages` is proven.

---

## Self-review

### Spec coverage (spec section → task)

| Spec | Requirement | Task |
|---|---|---|
| §1 success criterion 1 | Root = full-screen lab without a backend; not-precomputed combinations say so | E2 (site layout), E4 T1/T3 |
| §1 success criterion 2 | `/<repo>/learn/` textbook; embedded figures load on click; "open in lab" | E2 (MkDocs Pages config), E4 T7 |
| §1 success criterion 3 | Visual unity (Part D); proven by the regenerated, reviewed baselines | E7 |
| §1 success criterion 4 | One local command builds and previews the identical site including the sub-path; Actions only publishes | E2, E3, E4 T8 |
| §1 success criterion 5 | Every gate green; affected tests updated with intent preserved | E4 (guards), E5 (pins), E7, E9 |
| §2 non-goal | Do not rename the repo, enable Pages or push | E9 Step 7 (listed, not performed) |
| §3 D1 | Root lab, `learn/`, data under `data/` | E1 (`PAGES_LAB_URL`), E2 |
| §3 D5 | Data generated at build time, never committed | E2 (`build/` is ignored; the Step 8 `git status` check) |
| §3 D6 | Local build + preview is the verdict; the workflow only reruns the script | E2, E3 |
| §3 D13 | Linux baselines in the fixed Docker image | E6, E7 |
| §4.5 | Pages build via a generated `mkdocs.pages.yml` (INHERIT + `site_url` + `lab_url`); `mkdocs.yml` itself without a sub-path | E1 (+ absolute `docs_dir`/`watch`/`custom_dir`, proven necessary) |
| §4.5 | Stale docs: `quality-gates.md` (frame size, Docker), status, roadmap, README | E2/E3/E5/E6/E7 (quality-gates), E8 |
| §4.6 | `build_pages.py [--site-url] [--workers] [--serve]` (+ `--skip-data`) | E1, E2 |
| §4.6 | `pages.yml`: `workflow_dispatch` + push master; checkout, setup-uv@v10.0.1, setup-node, `uv sync --locked --all-groups`, `npm --prefix web ci`, build with configure-pages URL, upload, deploy | E3 |
| §4.6 | `tests/test_pages_workflow.py`; Node check extended to every workflow | E3 |
| §5 | Pages build ships no sourcemap | E2 (`copy_web_build` refuses `*.map`; test) |
| §6 | pages-e2e: opening scene, representation switch, not-precomputed notice, superposition playback, deep link, embed, textbook + figure, no off-origin | E4 (8 tests), E5 (closed-manifest audit) |
| §6 | Update the `web/scripts` manifest and the assertion scripts | E5 (`WEB_SCRIPTS`, `test:pages` pin, `pagesGate.test.ts`) |
| §6 | Visual: regenerate the 5 baselines in Docker, review them by hand, re-measure the calibration tables; `quality-gates.md` frame size and Docker commands | E6, E7 |
| §6 | Full `build_pages.py` run + `--serve` + pages-e2e green = "releasable" | E2 Steps 7-8, E9 Step 4 |
| §7 | Request-enumeration mismatch caught through the real UI | E4 T1/T2/T4/T5 (manifest-key provenance) |
| §7 | `Atmoic` in the public URL; the private `claude-fable-audit` link | E8 (README note, status), E9 Step 7 (decisions for the user) |

### Placeholder scan

- None of the words "TBD", "TODO", "implement later", "add appropriate error handling" or "similar to Task" appears in any step.
- Every file created or edited is given in full, or as exact anchor → replacement text.
- Two places carry values that cannot exist until a measurement runs. Neither is a free-form placeholder:
  - E7 Step 6 applies snippets (a)–(e). They are printed verbatim by the scratch script in E7 Step 5, whose full code is in the plan, and a verification grep proves every old number is gone.
  - E9 Step 5's results table has `N`/`XX.XX` slots. Each is mapped to the exact output line that supplies it.
- E4 Step 1 and E8 Step 1 are evidence greps with a stated action when a hook or deliverable is missing. They are not deferred work.

### Interface consistency with `design/plans/2026-09-25-contracts.md`

- **A → E: exporter CLI.** `quviz export-static plan --out <data>` and `quviz export-static render --data <data> --requests <data>/requests.json --workers N` are used verbatim (E2 `build_site`). `--workers` follows Part A's bounds: `default_workers()` returns the same value as A's `default_worker_count()` (CPU count, at most 8), and `parse_args` rejects values outside A's Typer range 1..32 with exit 2, before any step runs. Both rules are pinned in `tests/test_build_pages.py`: `--workers 33` is rejected, and the defaults are 1, 1, 4 and 8 for CPU counts `None`, 1, 4 and 64.
- **A → E: data root and manifest.** `<data>` = `build/pages/data/`, passed explicitly. The manifest `format: "quviz-static/1"` and string `version` are validated (`read_manifest_version`). `entries[key].file` = `files/<hash>.(json|bin)` is read in E4 (`keysByFile`).
- **B → E: enumerator — deviation.** The contract's `npm --prefix web exec --no -- vite-node tools/static-requests.ts -- <data>` is run as `npm exec --no -- vite-node tools/static-requests.ts -- <abs data>` with cwd `web/`. Measured on this machine, `npm --prefix web exec` keeps cwd at the repository root, where `tools/static-requests.ts` does not exist. The tool, script path and arguments are otherwise identical.
- **B → E: `build:pages`.** Used as-is. E appends `-- --outDir <build/pages-web> --emptyOutDir` so `web/dist` stays the live build.
- **B → E: deep-link keys and the static catalog.**
  - Deep-link keys (`embed`, `mode`, `n`, `l`, `m`, `basis`, `preset`, `t`, `rep`) and `replaceState` write-back are relied on in E4 T3–T6.
  - **Deep links while playing.** The contract does not specify them. E4 follows B10 as planned: `t` is written only while paused, is omitted at 0, and is not rewritten on playback ticks. T4 asserts that the hash has no `t` while playing, and that it equals the pill's frame after the pause and after one paused step. It never expects a `t` per frame.
  - **`not_precomputed` wording.** No part owns one canonical sentence (`NOT_PRECOMPUTED_DETAIL`, `STATIC_MISS_REASON` and B8's per-limit reasons all differ), so E4 asserts no wording. T3 checks the refusal kind through D11's `未预计算` row tag and `data-unavailable`, and requires the status line to repeat the row's `title` reason verbatim, in Chinese, with no `/api`.
  - **Static frames.** The overlay offers the manifest's times as `ParameterBound.values`, so the pill shows `output[data-time-readout]` and a 28-step scrubber for 1s + 2p_z, with no `input[data-parameter="timeAu"]`. T4 pins that.
  - The static bootstrap loads `new URL('data/', document.baseURI)`, which E4 verifies through the `data/` request paths.
- **C → E: Pages MkDocs config — extension.** The generated config contains the contract's `INHERIT` (absolute), `site_url: <pages url>learn/` and `extra.quviz.lab_url: "../"`. It adds absolute `docs_dir`, `watch: []` and `theme.custom_dir`. The contract's four keys alone abort MkDocs; this was reproduced and is pinned by a negative-control test.
- **C → E: figures.** `<figure class="quviz-figure" data-lab="…">` → iframe `<lab>#embed=1&…` and link `<lab>#…` are asserted in E4 T7.
- **D → E.** E4 and E7 rely on:
  - `[data-chrome]` hides everything but the canvas;
  - there is exactly one `<canvas>`;
  - `[data-scene-ready]` and `span[data-status]` with the existing precedence;
  - the `教材` → `./learn/` link in static mode;
  - in embed mode, no header, control panel or guide, plus `在实验室中打开` with `target=_blank` and the deep link minus `embed`.

  E4 additionally assumes hooks the contract's "D produces" does not list (flagged in the summary). Each is named in D's own task Interfaces:
  - `button[data-representation]` with `aria-pressed`, `data-unavailable`, `title` = reason, and the `未预计算` refusal tag (D11). Today's JSX is at `web/src/components/ControlPanel.tsx:745`. D11 emits it as the object-literal key `'data-representation': id`, so the E4 Step 1 grep matches both spellings. The earlier `data-representation={` grep would have matched nothing after D11.
  - The D10 time pill: `section[data-chrome][data-time-kind]`, `button[data-control="playback"]` with `aria-pressed`/`aria-disabled` (today at `ControlPanel.tsx:696`; D10 moves it into `TimePill.tsx`), `input[data-time-scrubber]`, `button[data-time-step="1"]`, `output[data-time-readout]` and the `帧 i/N` meta line.
  - The D10 rule that `useFramePrefetch` runs only while playing in static mode.
  - A guide `role=dialog` that closes on Escape. It is new in Part D (spec §4.4, D19), and Escape-to-close is the WAI-ARIA modal-dialog pattern.

  E4 Step 1 greps every one of these, plus B10's paused-only `t` rule, before any test is written.

### Cross-part review fixes applied (2026-09-25)

- **Blocker, E4 T4.** The test polled the hash for `t` while playing, but B10 writes `t` only while paused, so the poll could never pass. It now reads the frames from the time pill in one `evaluate`: readout, scrubber index, `aria-valuetext` and `帧 i/N`, all checked against the 28-frame lattice. It checks the hash only after pausing and after one paused `data-time-step="1"`. The `fetched.has(time)` check was vacuous under D10's play-time prefetch and is gone. In its place, a `waitForResponse` registered before the paused step must see the stepped-to frame's own manifest file.
- **Minor, E2 workers.** The default was CPU count − 1, uncapped. It is now `min(8, cpu)`, Part A's own default, and `--workers` is bounded to A's 1..32. `development.md` and `quality-gates.md` state the same rule. The `test_build_pages.py` count goes from 66 to 71.
- **Minor, E4 Step 1.** `grep "data-representation={"` is replaced by `grep -E "data-representation['\"]?[:=]"`. This was checked against today's `ControlPanel.tsx:745` and against D11's object-literal line, and it does not match `data-representation-notice`.
- **Found while re-checking (spec gap "not_precomputed wording"), E4 T3.** `toContainText('未预计算')` on `span[data-status]` would have failed for `n = 5`. The status text is `…暂不可用 · <reason>`, and B8's reason for that limit is `静态教材版只预计算 n ≤ 4 的本征态；…`. T3 now asserts the refusal kind and the verbatim reason instead, as described above.
- **Shared commands.** Every gate in E9 uses the contract's exact commands. Single-file runs use the forms measured to resolve correctly from the repository root.
