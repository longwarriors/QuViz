"""Contracts for the learner textbook under ``docs/textbook/``.

Every chapter embeds the lab through
``<figure class="quviz-figure" data-lab="<deep link>" markdown>``. On GitHub
Pages the lab has no backend and can show only what the static catalogue
precomputed (``design/plans/2026-09-25-contracts.md``, ``spec.json``). That
catalogue holds every eigenstate with ``n <= 4`` in both bases, plus the four
server superposition presets on their playback frames. A figure outside it
would show every reader "未预计算", so each ``data-lab`` is checked here in two
ways: against the lab's deep-link grammar (key order
``embed,mode,n,l,m,z,basis,preset,t,rep,plane,obs``,
``web/src/state/urlState.ts``) and against the catalogue content. Deep links a
page quotes as inline code for the reader to copy get the same check.

``CHAPTERS`` is the registry the textbook tasks fill in. It records the exact
level-2 section ids and figure deep links of each page, so a chapter cannot
silently lose a figure, change a deep-link anchor or drift from the plan.

Some chapters also describe what a catalogue asset looks like at the
catalogue's own settings (a mesh artifact, which samples a phase slice masks,
how the streamline figures are seeded and why two of them look alike, how
visibly a superposition slice changes between frames, where a degenerate
superposition's parabolic node cuts its slice). Those statements are
pinned against the builders at the end of this file, so a builder, grid or
seeding change cannot silently falsify the prose.
"""

from __future__ import annotations

import math
import re
from functools import cache
from html.parser import HTMLParser
from pathlib import Path
from typing import NamedTuple

import numpy as np
from scipy.sparse import coo_matrix
from scipy.sparse.csgraph import connected_components

from quviz.api.routes import _parse_superposition, superposition_catalog
from quviz.conventions import BasisKind, PrincipalPlane, SliceObservable
from quviz.physics.hydrogenic import hydrogenic_wavefunction
from quviz.physics.superposition import SuperpositionState
from quviz.scene.builders import (
    build_current_field,
    build_isosurface,
    build_superposition_current_field,
)
from quviz.scene.slices import build_slice, build_superposition_slice

ROOT = Path(__file__).resolve().parents[1]
TEXTBOOK = ROOT / "docs" / "textbook"

DEEP_LINK_KEY_ORDER = (
    "embed",
    "mode",
    "n",
    "l",
    "m",
    "z",
    "basis",
    "preset",
    "t",
    "rep",
    "plane",
    "obs",
)
OBSERVABLES = ("probability_density", "wavefunction_real", "wavefunction_imag", "phase")
EIGEN_N_MAX = 4
EIGEN_BASES = ("real", "complex")
EIGEN_REPRESENTATIONS = ("point_cloud", "isosurface", "slice", "streamlines")
EIGEN_PLANES = ("xy", "xz", "yz")
SUPERPOSITION_REPRESENTATIONS = ("isosurface", "slice", "streamlines")
SUPERPOSITION_PLANES = ("xz",)
# nextTimeAu in web/src/components/sceneRequest.ts: ceil(T / 0.6) frames per
# period, each snapped to the 0.2 a.u. time lattice (capability.ts).
TARGET_TIME_STEP_AU = 0.6
TIME_GRID_STEP_AU = 0.2
# Measured 2026-09-25: GET /api/superposition/isosurface for 2s-2pz at the
# UI's probability_mass 0.9 answers 422 (topology does not converge before
# the grid cap). A figure must not advertise a precomputed refusal.
KNOWN_REFUSED = frozenset({("2s-2pz", "isosurface")})


class Chapter(NamedTuple):
    sections: tuple[str, ...]
    figures: tuple[str, ...]


#: file name -> exact level-2 heading ids and figure deep links, in page order.
CHAPTERS: dict[str, Chapter] = {
    "00-how-to-use.md": Chapter(
        sections=(
            "goals",
            "reading-path",
            "lab-tour",
            "figures",
            "static-and-live",
            "reading-rules",
            "misconceptions",
            "exercises",
            "further-reading",
        ),
        figures=("mode=eigenstate&n=2&l=1&m=0&basis=real&rep=point_cloud",),
    ),
    "01-wavefunction.md": Chapter(
        sections=(
            "goals",
            "wavefunction",
            "schrodinger-equation",
            "born-rule",
            "normalization",
            "volume-element",
            "global-phase",
            "misconceptions",
            "exercises",
            "further-reading",
        ),
        figures=(
            "mode=eigenstate&n=1&l=0&m=0&basis=real&rep=point_cloud",
            "mode=eigenstate&n=1&l=0&m=0&basis=real&rep=slice&plane=xz&obs=probability_density",
        ),
    ),
    "02-hydrogen-levels.md": Chapter(
        sections=(
            "goals",
            "separation",
            "quantum-numbers",
            "energy-levels",
            "reduced-mass",
            "general-formula",
            "orbital-labels",
            "misconceptions",
            "exercises",
            "further-reading",
        ),
        figures=(
            "mode=eigenstate&n=2&l=0&m=0&basis=real&rep=slice&plane=xz&obs=probability_density",
            "mode=eigenstate&n=2&l=1&m=0&basis=real&rep=slice&plane=xz&obs=probability_density",
        ),
    ),
    "03-radial-nodes.md": Chapter(
        sections=(
            "goals",
            "radial-function",
            "radial-distribution",
            "most-probable-radius",
            "mean-radius",
            "radial-nodes",
            "angular-nodes",
            "radial-table",
            "misconceptions",
            "exercises",
            "further-reading",
        ),
        figures=(
            "mode=eigenstate&n=3&l=0&m=0&basis=real&rep=slice&plane=xz&obs=probability_density",
            "mode=eigenstate&n=3&l=1&m=0&basis=real&rep=slice&plane=xz&obs=wavefunction_real",
        ),
    ),
    "04-real-complex.md": Chapter(
        sections=(
            "goals",
            "complex-harmonics",
            "real-harmonics",
            "basis-change",
            "meaning-of-m",
            "phase-colour",
            "misconceptions",
            "exercises",
            "further-reading",
        ),
        figures=(
            "mode=eigenstate&n=2&l=1&m=1&basis=complex&rep=isosurface",
            "mode=eigenstate&n=2&l=1&m=1&basis=real&rep=isosurface",
            "mode=superposition&preset=2pplus-2pminus&t=0&rep=isosurface",
        ),
    ),
    "05-electron-cloud.md": Chapter(
        sections=(
            "goals",
            "samples",
            "separable-sampling",
            "density-and-counts",
            "finite-samples",
            "superposition-sampling",
            "misconceptions",
            "exercises",
            "further-reading",
        ),
        figures=(
            "mode=eigenstate&n=3&l=2&m=0&basis=real&rep=point_cloud",
            "mode=eigenstate&n=2&l=0&m=0&basis=real&rep=point_cloud",
        ),
    ),
    "06-isosurface.md": Chapter(
        sections=(
            "goals",
            "threshold",
            "enclosed-probability",
            "phase-colour",
            "finite-grid",
            "shapes",
            "misconceptions",
            "exercises",
            "further-reading",
        ),
        figures=(
            "mode=eigenstate&n=3&l=2&m=0&basis=real&rep=isosurface",
            "mode=eigenstate&n=3&l=2&m=-2&basis=real&rep=isosurface",
        ),
    ),
    "07-phase-slices.md": Chapter(
        sections=(
            "goals",
            "planes",
            "four-fields",
            "colour-maps",
            "phase-mask",
            "global-phase",
            "misconceptions",
            "exercises",
            "further-reading",
        ),
        figures=(
            "mode=eigenstate&n=2&l=1&m=0&basis=real&rep=slice&plane=xz&obs=wavefunction_real",
            "mode=eigenstate&n=3&l=2&m=2&basis=complex&rep=slice&plane=xy&obs=wavefunction_real",
            "mode=eigenstate&n=2&l=1&m=1&basis=complex&rep=slice&plane=xy&obs=phase",
            "mode=eigenstate&n=2&l=1&m=-1&basis=complex&rep=slice&plane=xy&obs=phase",
        ),
    ),
    "08-probability-current.md": Chapter(
        sections=(
            "goals",
            "current",
            "continuity",
            "real-states",
            "complex-states",
            "streamlines",
            "not-trajectories",
            "misconceptions",
            "exercises",
            "further-reading",
        ),
        figures=(
            "mode=eigenstate&n=2&l=1&m=1&basis=complex&rep=streamlines",
            "mode=eigenstate&n=2&l=1&m=-1&basis=complex&rep=streamlines",
            "mode=eigenstate&n=3&l=2&m=2&basis=complex&rep=streamlines",
        ),
    ),
    "09-superposition-time.md": Chapter(
        sections=(
            "goals",
            "time-evolution",
            "interference",
            "bohr-oscillation",
            "quadrupole-breathing",
            "degenerate-controls",
            "playback",
            "misconceptions",
            "exercises",
            "further-reading",
        ),
        figures=(
            "mode=superposition&preset=1s-2pz&t=0&rep=slice&plane=xz&obs=probability_density",
            "mode=superposition&preset=1s-2pz&t=8.4&rep=slice&plane=xz&obs=probability_density",
            "mode=superposition&preset=1s-2pz&t=4.2&rep=streamlines",
            "mode=superposition&preset=1s-3dz2&t=7&rep=slice&plane=xz&obs=probability_density",
            "mode=superposition&preset=2s-2pz&t=0&rep=slice&plane=xz&obs=probability_density",
        ),
    ),
    "10-experiment.md": Chapter(
        sections=(
            "goals",
            "measurement-chain",
            "stark-microscopy",
            "forward-model",
            "what-the-lab-shows",
            "repeated-measurements",
            "misconceptions",
            "exercises",
            "further-reading",
        ),
        figures=(
            "mode=superposition&preset=2s-2pz&t=0&rep=slice&plane=xz&obs=probability_density",
            "mode=eigenstate&n=3&l=1&m=0&basis=real&rep=point_cloud",
        ),
    ),
    "11-symmetry-hybridization.md": Chapter(
        sections=(
            "goals",
            "basis-freedom",
            "sp3",
            "tetrahedral-angle",
            "what-symmetry-decides",
            "what-symmetry-cannot",
            "hybrids-in-the-lab",
            "misconceptions",
            "exercises",
            "further-reading",
        ),
        figures=(
            "mode=eigenstate&n=2&l=1&m=0&basis=real&rep=isosurface",
            "mode=superposition&preset=2s-2pz&t=0&rep=slice&plane=xz&obs=wavefunction_real",
        ),
    ),
    "appendix-a-misconceptions.md": Chapter(
        sections=(
            "density-vs-radial",
            "nodes-and-kinetic-energy",
            "nodes-are-not-planes",
            "m-is-not-a-direction",
            "cloud-is-not-a-trajectory",
            "isosurface-is-not-a-boundary",
            "colour-is-not-charge",
            "stationary-is-not-still",
            "superposition-is-not-hopping",
            "detector-image-is-not-density",
            "hybrids-are-not-observables",
        ),
        figures=(
            "mode=eigenstate&n=2&l=0&m=0&basis=real&rep=slice&plane=xz&obs=probability_density",
        ),
    ),
    "appendix-b-notation-units.md": Chapter(
        sections=("atomic-units", "coordinates", "symbols", "representations", "deep-links"),
        figures=(
            "mode=superposition&preset=1s-2pz&t=8.4&rep=slice&plane=xz&obs=probability_density",
        ),
    ),
}


def js_number(value: float) -> str:
    """How ``String(number)`` spells a lattice time in JavaScript."""

    return str(int(value)) if float(value).is_integer() else repr(float(value))


def playback_frames(period_au: float) -> tuple[float, ...]:
    if not math.isfinite(period_au) or period_au <= 0:
        return (0.0,)
    frames = max(1, math.ceil(period_au / TARGET_TIME_STEP_AU))
    return tuple(
        round(math.floor(k * period_au / frames / TIME_GRID_STEP_AU + 0.5) * TIME_GRID_STEP_AU, 12)
        for k in range(frames)
    )


@cache
def superposition_periods() -> dict[str, float]:
    return {str(entry["id"]): float(entry["period_au"]) for entry in superposition_catalog()}


def _integer(value: str) -> int | None:
    return int(value) if re.fullmatch(r"-?(0|[1-9][0-9]*)", value) else None


def deep_link_problems(deep_link: str) -> list[str]:
    """Why ``deep_link`` is not a precomputed textbook state; empty when it is."""

    if not deep_link or deep_link.startswith("#"):
        return ["the deep link must be non-empty and carry no leading '#'"]
    pairs: list[tuple[str, str]] = []
    for part in deep_link.split("&"):
        key, sep, value = part.partition("=")
        if not sep or not key or not value:
            return [f"malformed pair {part!r}"]
        pairs.append((key, value))
    keys = [key for key, _ in pairs]
    problems: list[str] = []
    if len(set(keys)) != len(keys):
        problems.append(f"duplicate keys in {keys}")
    unknown = [key for key in keys if key not in DEEP_LINK_KEY_ORDER]
    if unknown:
        return [*problems, f"unknown keys {unknown}"]
    if keys != sorted(keys, key=DEEP_LINK_KEY_ORDER.index):
        problems.append(f"keys {keys} are not in the lab's serialisation order")
    if "embed" in keys:
        problems.append("embed=1 is added by quviz-figure.js; a figure must not carry it")
    if "z" in keys:
        problems.append("the static catalogue fixes Z = 1; do not spell z")
    state = dict(pairs)
    mode = state.get("mode")
    rep = state.get("rep")
    if mode == "eigenstate":
        problems.extend(_eigenstate_problems(state, rep))
    elif mode == "superposition":
        problems.extend(_superposition_problems(state, rep))
    else:
        problems.append(f"mode must be eigenstate or superposition, not {mode!r}")
    return problems


def _eigenstate_problems(state: dict[str, str], rep: str | None) -> list[str]:
    problems: list[str] = []
    for key in ("preset", "t"):
        if key in state:
            problems.append(f"{key} belongs to superposition figures")
    n, l, m = (_integer(state.get(key, "")) for key in ("n", "l", "m"))
    if n is None or l is None or m is None:
        return [*problems, "eigenstate figures spell integer n, l and m"]
    if not (1 <= n <= EIGEN_N_MAX and 0 <= l < n and -l <= m <= l):
        problems.append(f"(n, l, m) = ({n}, {l}, {m}) is not a precomputed eigenstate (n <= 4)")
    basis = state.get("basis")
    if basis not in EIGEN_BASES:
        problems.append(f"basis must be one of {EIGEN_BASES}, not {basis!r}")
    if rep not in EIGEN_REPRESENTATIONS:
        problems.append(f"rep must be one of {EIGEN_REPRESENTATIONS}, not {rep!r}")
    problems.extend(_slice_problems(state, rep, EIGEN_PLANES))
    if rep == "streamlines" and (basis != "complex" or m == 0):
        problems.append("only complex-basis m != 0 eigenstates carry a probability current")
    return problems


def _superposition_problems(state: dict[str, str], rep: str | None) -> list[str]:
    problems: list[str] = []
    for key in ("n", "l", "m", "basis"):
        if key in state:
            problems.append(f"{key} belongs to eigenstate figures")
    preset = state.get("preset")
    periods = superposition_periods()
    if preset not in periods:
        return [*problems, f"preset must be one of {sorted(periods)}, not {preset!r}"]
    # A missing t means the lab's own default of 0, exactly like an explicit
    # t=0 (contracts Part C controller ruling 4).
    raw_time = state.get("t")
    frames = playback_frames(periods[preset])
    if raw_time is None:
        time = 0.0
    else:
        try:
            time = float(raw_time)
        except ValueError:
            time = math.nan
    if not any(abs(time - frame) < 1e-9 for frame in frames):
        problems.append(f"t={raw_time!r} is not a playback frame of {preset}: {frames}")
    elif raw_time is not None and raw_time != js_number(time):
        problems.append(f"t={raw_time!r} must be spelled {js_number(time)!r} like the lab")
    if rep not in SUPERPOSITION_REPRESENTATIONS:
        problems.append(f"rep must be one of {SUPERPOSITION_REPRESENTATIONS}, not {rep!r}")
    problems.extend(_slice_problems(state, rep, SUPERPOSITION_PLANES))
    if (preset, rep) in KNOWN_REFUSED:
        problems.append(f"{preset} {rep} is a known server refusal at the catalogue defaults")
    if rep == "streamlines" and (periods[preset] <= 0 or time == 0):
        problems.append("streamlines need an oscillating preset at t != 0 (otherwise j = 0)")
    return problems


def _slice_problems(state: dict[str, str], rep: str | None, planes: tuple[str, ...]) -> list[str]:
    plane, obs = state.get("plane"), state.get("obs")
    if rep != "slice":
        return ["plane/obs only belong to slice figures"] if plane or obs else []
    problems = []
    if plane not in planes:
        problems.append(f"plane must be one of {planes}, not {plane!r}")
    if obs not in OBSERVABLES:
        problems.append(f"obs must be one of {OBSERVABLES}, not {obs!r}")
    return problems


class _StartTag(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.attrs: dict[str, str | None] = {}

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        self.attrs = dict(attrs)


FIGURE_BLOCK = re.compile(r"(?P<tag><figure\b[^>]*>)(?P<body>.*?)</figure>", re.DOTALL)
HEADING = re.compile(r"^## .*?\{#(?P<id>[a-z0-9]+(?:-[a-z0-9]+)*)\}\s*$")
QUESTION = re.compile(r'^\?\?\? question "[^"“”]+"\s*$', re.MULTILINE)
DEVELOPER_JARGON = re.compile(r"/api/|tests/|web/src|\bPR-\d|Phase 0")
LEARNER_TAIL = ("misconceptions", "exercises", "further-reading")
HTML_TAG_LOOKALIKE = re.compile(r"</?(?!figure\b)[A-Za-z]")


def figures_in(text: str) -> list[tuple[dict[str, str | None], str]]:
    found = []
    for match in FIGURE_BLOCK.finditer(text):
        parser = _StartTag()
        parser.feed(match.group("tag"))
        parser.close()
        found.append((parser.attrs, match.group("body").strip()))
    return found


def _chapter_number(name: str) -> int | None:
    return int(name[:2]) if name[:2].isdigit() else None


def _figure_label(name: str) -> str | None:
    """The ``N`` of ``**图 N.k**``: the chapter number or the appendix letter."""

    number = _chapter_number(name)
    if number is not None:
        return str(number)
    appendix = re.fullmatch(r"appendix-([a-z])-[a-z0-9-]+\.md", name)
    return appendix.group(1).upper() if appendix else None


def _level_two_ids(name: str, text: str) -> tuple[list[str], list[str]]:
    ids: list[str] = []
    problems: list[str] = []
    for line in text.splitlines():
        if line.startswith("## "):
            match = HEADING.match(line)
            if match is None:
                problems.append(f"{name}: level-2 heading without an explicit ASCII id: {line!r}")
            else:
                ids.append(match.group("id"))
    return ids, problems


def test_playback_frames_mirror_the_lab_lattice() -> None:
    periods = superposition_periods()
    bohr = playback_frames(periods["1s-2pz"])
    assert len(bohr) == 28
    assert bohr[:3] == (0.0, 0.6, 1.2)
    assert bohr[14] == 8.4
    assert bohr[-1] == 16.2
    quadrupole = playback_frames(periods["1s-3dz2"])
    assert len(quadrupole) == 24
    assert quadrupole[9:11] == (5.4, 5.8)
    assert quadrupole[-1] == 13.6
    assert playback_frames(periods["2s-2pz"]) == (0.0,)
    assert playback_frames(periods["2pplus-2pminus"]) == (0.0,)
    assert [js_number(t) for t in (0.0, 3.0, 8.4, 12.0)] == ["0", "3", "8.4", "12"]


def test_deep_link_validator_accepts_catalogue_states_and_rejects_the_rest() -> None:
    valid = (
        "mode=eigenstate&n=2&l=1&m=0&basis=real&rep=point_cloud",
        "mode=eigenstate&n=4&l=3&m=-3&basis=complex&rep=isosurface",
        "mode=eigenstate&n=2&l=1&m=-1&basis=complex&rep=slice&plane=xy&obs=phase",
        "mode=eigenstate&n=3&l=2&m=2&basis=complex&rep=streamlines",
        "mode=superposition&preset=1s-2pz&t=8.4&rep=slice&plane=xz&obs=probability_density",
        "mode=superposition&preset=1s-2pz&t=4.2&rep=streamlines",
        "mode=superposition&preset=1s-3dz2&t=7&rep=isosurface",
        "mode=superposition&preset=2s-2pz&t=0&rep=slice&plane=xz&obs=wavefunction_real",
        "mode=superposition&preset=1s-2pz&rep=isosurface",
    )
    for deep_link in valid:
        assert deep_link_problems(deep_link) == [], deep_link
    invalid = (
        "",
        "#mode=eigenstate&n=1&l=0&m=0&basis=real&rep=point_cloud",
        "mode=eigenstate&n=1&l=0&m=0&basis=real&rep",
        "mode=eigenstate&n=5&l=0&m=0&basis=real&rep=point_cloud",
        "mode=eigenstate&n=2&l=2&m=0&basis=real&rep=point_cloud",
        "mode=eigenstate&n=2&l=1&m=2&basis=real&rep=point_cloud",
        "mode=eigenstate&n=2&l=1&m=0&basis=spherical&rep=point_cloud",
        "mode=eigenstate&n=2&l=1&m=0&basis=real&rep=volume",
        "mode=eigenstate&n=2&l=1&m=0&basis=real&rep=slice&plane=xz",
        "mode=eigenstate&n=2&l=1&m=0&basis=real&rep=isosurface&plane=xz",
        "mode=eigenstate&n=2&l=1&m=1&basis=real&rep=streamlines",
        "mode=eigenstate&n=2&l=1&m=0&basis=complex&rep=streamlines",
        "mode=eigenstate&n=1&l=0&m=0&z=1&basis=real&rep=point_cloud",
        "embed=1&mode=eigenstate&n=1&l=0&m=0&basis=real&rep=point_cloud",
        "n=1&mode=eigenstate&l=0&m=0&basis=real&rep=point_cloud",
        "mode=eigenstate&n=1&n=1&l=0&m=0&basis=real&rep=point_cloud",
        "mode=eigenstate&n=01&l=0&m=0&basis=real&rep=point_cloud",
        "mode=superposition&preset=1s-2p&t=0&rep=slice&plane=xz&obs=phase",
        "mode=superposition&preset=1s-2pz&t=3.5&rep=slice&plane=xz&obs=phase",
        "mode=superposition&preset=1s-2pz&t=3.0&rep=slice&plane=xz&obs=phase",
        "mode=superposition&preset=2s-2pz&t=0.6&rep=slice&plane=xz&obs=phase",
        "mode=superposition&preset=1s-2pz&t=0&rep=slice&plane=xy&obs=phase",
        "mode=superposition&preset=1s-2pz&t=0&rep=point_cloud",
        "mode=superposition&preset=2s-2pz&t=0&rep=isosurface",
        "mode=superposition&preset=1s-2pz&t=0&rep=streamlines",
        "mode=superposition&preset=2pplus-2pminus&t=0&rep=streamlines",
        "mode=superposition&preset=1s-2pz&basis=real&t=0&rep=isosurface",
        "mode=eigenstate&preset=1s-2pz&n=1&l=0&m=0&basis=real&rep=point_cloud",
        "mode=orbital&n=1&l=0&m=0&basis=real&rep=point_cloud",
    )
    for deep_link in invalid:
        assert deep_link_problems(deep_link), deep_link


def test_figures_in_reads_unescaped_attributes_and_the_caption() -> None:
    text = (
        '<figure class="quviz-figure" data-lab="mode=eigenstate&amp;n=1&l=0&m=0&basis=real'
        '&rep=point_cloud" markdown>\n**图 1.1** 正文\n</figure>'
    )
    [(attrs, body)] = figures_in(text)
    assert attrs["class"] == "quviz-figure"
    assert "markdown" in attrs
    assert attrs["data-lab"] == "mode=eigenstate&n=1&l=0&m=0&basis=real&rep=point_cloud"
    assert body == "**图 1.1** 正文"


def test_every_textbook_figure_is_a_precomputed_state() -> None:
    problems: list[str] = []
    for path in sorted(TEXTBOOK.glob("*.md")):
        for index, (attrs, caption) in enumerate(figures_in(path.read_text(encoding="utf-8")), 1):
            where = f"{path.name} figure {index}"
            if "quviz-figure" not in (attrs.get("class") or "").split():
                problems.append(f"{where}: class must include quviz-figure")
            if "markdown" not in attrs:
                problems.append(f"{where}: needs the markdown attribute so its caption renders")
            if not caption:
                problems.append(f"{where}: empty caption")
            problems.extend(
                f"{where}: {p}" for p in deep_link_problems(attrs.get("data-lab") or "")
            )
    assert problems == [], "\n".join(problems)


def test_textbook_pages_are_exactly_the_registered_chapters() -> None:
    present = {path.name for path in TEXTBOOK.glob("*.md")}
    assert present == {"index.md", *CHAPTERS}


def test_registered_chapters_match_their_sections_and_figures() -> None:
    problems: list[str] = []
    for name, chapter in CHAPTERS.items():
        text = (TEXTBOOK / name).read_text(encoding="utf-8")
        ids, heading_problems = _level_two_ids(name, text)
        problems.extend(heading_problems)
        if tuple(ids) != chapter.sections:
            problems.append(f"{name}: sections {tuple(ids)} != registered {chapter.sections}")
        figures = figures_in(text)
        links = tuple(attrs.get("data-lab") or "" for attrs, _ in figures)
        if links != chapter.figures:
            problems.append(f"{name}: figures {links} != registered {chapter.figures}")
        # Amendment 11: chapters 0-11 need >= 1 figure; the plan also gives each appendix one.
        if not chapter.figures:
            problems.append(f"{name}: every textbook page needs at least one interactive figure")
        label = _figure_label(name)
        if label is None:
            problems.append(f"{name}: name chapters NN-*.md and appendices appendix-<letter>-*.md")
        for index, (_, caption) in enumerate(figures, 1):
            expected = f"**图 {label}.{index}**"
            if not caption.startswith(expected):
                problems.append(f"{name}: figure {index} caption must start with {expected!r}")
    assert problems == [], "\n".join(problems)


def test_numbered_chapters_follow_the_learner_template() -> None:
    problems: list[str] = []
    for name, chapter in CHAPTERS.items():
        if _chapter_number(name) is None:
            continue
        text = (TEXTBOOK / name).read_text(encoding="utf-8")
        if chapter.sections[:1] != ("goals",) or chapter.sections[-3:] != LEARNER_TAIL:
            problems.append(f"{name}: sections must start with goals and end with {LEARNER_TAIL}")
        exercises = text.partition("{#exercises}")[2].partition("{#further-reading}")[0]
        if len(QUESTION.findall(exercises)) < 3:
            problems.append(f"{name}: needs at least three '??? question' blocks under exercises")
        for line in text.splitlines():
            if line.startswith("???") and ("“" in line or "”" in line):
                problems.append(f"{name}: typographic quotes in a ??? title: {line!r}")
        if "[@" not in text:
            problems.append(f"{name}: cites nothing")
        if match := DEVELOPER_JARGON.search(text):
            problems.append(f"{name}: developer jargon {match.group(0)!r} on a learner page")
    assert problems == [], "\n".join(problems)


def test_textbook_pages_use_raw_html_only_for_figures() -> None:
    r"""Nothing but the figure tags may look like raw HTML on a textbook page.

    Python-Markdown's HTML block parser runs before arithmatex protects the math,
    so ``$E_{2s}<E_{2p}$`` opens an unclosed ``<E_...`` tag. Every later
    ``<figure ... markdown>`` on the page then stays unparsed: it is wrapped in
    ``<p>`` with its ``markdown`` attribute left in, while the strict build and
    the figure checks above stay green. Write ``\lt`` instead.
    """

    problems = [
        f"{path.name}:{number}: {line.strip()[:80]!r}"
        for path in sorted(TEXTBOOK.glob("*.md"))
        for number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1)
        if HTML_TAG_LOOKALIKE.search(line)
    ]
    assert problems == [], "\n".join(problems)


def test_textbook_index_links_every_chapter_in_order() -> None:
    index = (TEXTBOOK / "index.md").read_text(encoding="utf-8")
    positions = [index.find(f"]({name})") for name in CHAPTERS]
    assert all(position >= 0 for position in positions), dict(zip(CHAPTERS, positions, strict=True))
    assert positions == sorted(positions)


class ReviewPin(NamedTuple):
    """One confirmed finding of the Task C15 physics review."""

    page: str
    wrong: str
    right: str


#: Fixed findings of the independent physics review. Each pin keeps the
#: reviewed error from coming back and keeps its correction on the page.
#: ``right`` is "" when the fix only deletes text.
PHYSICS_REVIEW_PINS: tuple[ReviewPin, ...] = (
    # One ReviewPin per finding being fixed, in review-record order, built from the
    # finding record:
    #   page:  the file name in the finding's "where";
    #   wrong: the shortest fragment of its "quote" that still contains the error
    #          and occurs exactly once on the unfixed page;
    #   right: the shortest fragment of its "correct" text that carries the fix.
    ReviewPin("00-how-to-use.md", "也就是 observable；", "这里取宽义"),  # noqa: RUF001
    ReviewPin("00-how-to-use.md", "对方打开的就是同一幅图", "视角不写入深链接"),
    ReviewPin("00-how-to-use.md", "时间胶囊和一个", "一条状态提示"),
    ReviewPin("00-how-to-use.md", "交互图连接的也是本机运行的", "要先构建前端"),
    ReviewPin("00-how-to-use.md", "控件是按这三层组织的", "控件怎样对应这三层"),
    ReviewPin(
        "01-wavefunction.md",
        "约化质量\n[@griffiths2018qm, ch. 4 (pp. 131--197)]",
        "普通 Bohr 半径",
    ),
    ReviewPin("01-wavefunction.md", "这个方程的解一般是复函数", "定态解总可以选成实函数"),
    ReviewPin("01-wavefunction.md", "实验室的电子云正是这样画出来的", "不是实测数据"),
    ReviewPin(
        "01-wavefunction.md",
        "第 7 章的相位切片和第 9 章的叠加态都依赖这种相对相位",
        "同一个波函数在不同点之间的相位差",
    ),
    ReviewPin("01-wavefunction.md", "相位约定和 QuViz 对实基的定义", "径向函数的符号约定"),
    ReviewPin("01-wavefunction.md", "对 $R$ 求导即可验证它等于被积函数", "且 $R=0$ 时右边为 0"),
    ReviewPin(
        "02-hydrogen-levels.md",
        "它也让 $\\psi$ 带上长度的 $-3/2$ 次方量纲",
        "这个常数的单位是 $a_0^{-3/2}$",
    ),
    ReviewPin(
        "02-hydrogen-levels.md",
        "的总公式\n[@griffiths2018qm, eq. (4.89), p. 151]",
        "Bohr 半径 $a$ 换成 $a_\\mu/Z$",
    ),
    ReviewPin(
        "03-radial-nodes.md",
        "对类氢态有闭合形式 [@griffiths2018qm, ch. 4 (pp. 131--197)]",
        "代入积分",
    ),
    ReviewPin(
        "03-radial-nodes.md",
        "也就是 Laguerre 多项式 $L_{n-\\ell-1}^{2\\ell+1}(\\rho)$ 的根",
        "节点就在 $r=na_\\mu\\rho_k/(2Z)$",
    ),
    ReviewPin("03-radial-nodes.md", "放大画面后更容易看清", "没有采样点正好落在 $1.90\\,a_0$ 上"),
    ReviewPin("03-radial-nodes.md", "$\\ell$ 越大的态越紧凑", "整体尺度小不等于更靠近原子核"),
    ReviewPin("04-real-complex.md", "只看一个方向分不出 $m$ 的正负", "只看 $+y$ 一个方向分不出"),
    ReviewPin("04-real-complex.md", "但它只是一个编号", "但它的正负号只是一个编号"),
    ReviewPin(
        "04-real-complex.md", "选哪组基只取决于想让什么有确定值", "对 $L_z$ 只确定了它的平方"
    ),
    ReviewPin(
        "04-real-complex.md",
        "只改变单个基函数的样子",
        "同一个态无论用哪组基展开",
    ),
    ReviewPin(
        "04-real-complex.md", "密度 $\\propto\\sin^2\\theta$", "r^2e^{-r}\\sin^2\\theta/(64\\pi)"
    ),
    ReviewPin(
        "05-electron-cloud.md",
        "描述按半径、极角、方位角分别求逆累积分布的分离采样",
        "方位角在复基中均匀抽取",
    ),
    ReviewPin("05-electron-cloud.md", "真实的分布却偏向一侧", "之后在 $+z$ 与 $-z$ 之间来回振荡"),
    ReviewPin(
        "05-electron-cloud.md",
        "28{,}000\\times0.3233\\approx9{,}053",
        "28{,}000\\times(1-5e^{-2})\\approx9{,}053",
    ),
    ReviewPin("05-electron-cloud.md", "$t=0$ 时两个函数都是实函数", "$t=0$ 时两项的系数也都是实数"),
    ReviewPin(
        "06-isosurface.md",
        "例如 $3p_z$ 在 $p=0.9$ 时是内外各两瓣",
        "实验室画出的曲面会把每一侧的内瓣与外瓣连在一起",
    ),
    ReviewPin(
        "06-isosurface.md",
        "$d_{xy}$、$d_{xz}$、$d_{yz}$、$d_{x^2-y^2}$ 是四瓣",
        "$4d_{xy}$ 在 $p=0.9$ 时是内外各四瓣",
    ),
    ReviewPin("06-isosurface.md", "改变数据颜色：同一种颜色在曲面的", "调低「透明度」后"),  # noqa: RUF001
    ReviewPin("07-phase-slices.md", "数值接近零就是深灰色", "残差也会被拉伸到整条色带"),
    ReviewPin("07-phase-slices.md", "所以两张切片的图案相同", "这只对 $xy$ 平面成立"),
    ReviewPin(
        "07-phase-slices.md",
        "相位约定也是这样一种全局相位的选择。",
        "它是不同 $m$ 分量之间的相对相位",
    ),
    ReviewPin("07-phase-slices.md", "节面不经过样本点，它的 $xz$ 相位切片上只有原点", "网格更密时"),  # noqa: RUF001
    ReviewPin("07-phase-slices.md", "所以它的实部、虚部切片随时间转动", "两张切片始终保持同一图案"),
    ReviewPin(
        "07-phase-slices.md",
        "$R_{21}\\propto r$",
        "$R_{21}\\propto r\\,e^{-r/(2a_0)}$ 在原点处为零",
    ),
    ReviewPin("08-probability-current.md", "给出实数", "乘上 $\\psi^*$ 后是实数"),
    ReviewPin("08-probability-current.md", "线速率是 $m/s=1$ a.u.", "$\\hbar m/(\\mu s)=2/2=1$"),
    ReviewPin(
        "08-probability-current.md",
        "流线是概率流 $\\mathbf j/\\rho$ 的积分曲线",
        "流线是速度场 $\\mathbf v=\\mathbf j/\\rho$ 的积分曲线",
    ),
    ReviewPin(
        "08-probability-current.md",
        "「定态」只说明密度 $\\rho$ 不随时间变化",
        "概率流 $\\mathbf j$ 也不变",
    ),
    ReviewPin("08-probability-current.md", "绕着盆心匀速旋转", "绕着盆心稳定地打转"),
    ReviewPin("08-probability-current.md", "只有相位颜色和概率流能区分", "流线图本身也区分不了"),
    ReviewPin(
        "09-superposition-time.md",
        "它的密度随时间连续变化",
        "能量不同的两项叠加",
    ),
    ReviewPin(
        "09-superposition-time.md",
        "要看 $\\lvert\\Psi\\rvert^2$ 或 $\\langle z\\rangle$ 这样",
        "$\\langle z\\rangle$ 不变并不说明态不变",
    ),
    ReviewPin(
        "09-superposition-time.md",
        "它们怎样变化、以什么频率变化",
        "怎样变化则取决于各项的空间形状与系数",
    ),
    ReviewPin(
        "10-experiment.md", "实验记录的是它经电离与传播后", "能量接近电离阈的高激发 Stark 态"
    ),
    ReviewPin(
        "10-experiment.md", "探测效率、背景与 Poisson 计数噪声", "有限点数本身已经带有计数涨落"
    ),
    ReviewPin(
        "10-experiment.md",
        "还要叠加 PSF、效率、背景与计数噪声",
        "点数的随机涨落已经包含在有限样本里",
    ),
    ReviewPin("10-experiment.md", "直接算出的内禀的量", "会随全局相位的约定转动"),
    ReviewPin("10-experiment.md", "哪些画面是内禀的物理量", "哪些画面是由量子态直接算出的量"),
    ReviewPin("10-experiment.md", "在本书忽略精细结构的模型里", "忽略自旋与精细结构的模型里"),
    ReviewPin("11-symmetry-hybridization.md", "杂化轨道不是新的量子态", "并不是子空间之外的新态"),
    ReviewPin(
        "11-symmetry-hybridization.md",
        "例如上一节的 $\\Gamma_{\\mathrm{tetrahedral}}",
        "例如「sp³ 杂化」一节的",
    ),
    ReviewPin(
        "11-symmetry-hybridization.md",
        "上一节的矩阵就是这样一组定向基",
        "「sp³ 杂化」一节的系数矩阵",
    ),
    ReviewPin(
        "11-symmetry-hybridization.md",
        "对称性不说明哪种描述让能量最低",
        "用哪些轨道、以什么比例组合",
    ),
    ReviewPin("11-symmetry-hybridization.md", "以内的一小块", "向 $+z$ 张开"),
    ReviewPin("appendix-a-misconceptions.md", "它的密度随时间连续变化", "只要其中有能量不同的项"),
    ReviewPin(
        "appendix-a-misconceptions.md",
        "所以 $d_{z^2}$ 的等值面是两瓣加一个环",
        "所以 $3d_{z^2}$ 的等值面",
    ),
    ReviewPin("appendix-a-misconceptions.md", "## 磁量子数不是朝向", "## 磁量子数不是轨道朝向"),
    ReviewPin("appendix-b-notation-units.md", "换算成国际单位制时用下表", "换算成常用单位时用下表"),
    ReviewPin(
        "appendix-b-notation-units.md",
        "没有写出的部分取实验室的默认值。",
        "实验室只应用写出的键",
    ),
    ReviewPin(
        "appendix-b-notation-units.md",
        "| point_cloud、isosurface、slice、streamlines |",
        "本征态只有复基 m≠0 有 streamlines",
    ),
)


def test_physics_review_corrections_stay_fixed() -> None:
    problems: list[str] = []
    for pin in PHYSICS_REVIEW_PINS:
        assert pin.page in CHAPTERS, pin.page
        # A wrong fragment inside its own correction could never be absent.
        assert pin.wrong and pin.wrong not in pin.right, pin
        text = (TEXTBOOK / pin.page).read_text(encoding="utf-8")
        if pin.wrong in text:
            problems.append(f"{pin.page}: the reviewed error is back: {pin.wrong!r}")
        if pin.right not in text:
            problems.append(f"{pin.page}: the correction is missing: {pin.right!r}")
    assert problems == [], "\n".join(problems)


def test_quoted_deep_links_are_catalogue_states_in_the_lab_key_order() -> None:
    """Deep links quoted as inline code (chapter 0, appendix B) must open a
    precomputed state too, and appendix B must spell the lab's key order."""

    quoted = {
        path.name: re.findall(r"`#(mode=[^`]*)`", path.read_text(encoding="utf-8"))
        for path in sorted(TEXTBOOK.glob("*.md"))
    }
    problems = [
        f"{name}: {link}: {problem}"
        for name, links in quoted.items()
        for link in links
        for problem in deep_link_problems(link)
    ]
    assert problems == [], "\n".join(problems)
    appendix = "appendix-b-notation-units.md"
    assert len(quoted[appendix]) == 2
    order = f"`{', '.join(DEEP_LINK_KEY_ORDER)}`"
    assert order in (TEXTBOOK / appendix).read_text(encoding="utf-8")


def _catalogue_resolution(n: int) -> int:
    """spec.json's resolution 65, clamped up to the per-state floor 16n + 17."""

    return max(65, 16 * n + 17)


def _mesh_components(faces: np.ndarray, vertex_count: int) -> list[np.ndarray]:
    edges = np.concatenate((faces[:, [0, 1]], faces[:, [1, 2]], faces[:, [2, 0]]))
    graph = coo_matrix(
        (np.ones(len(edges)), (edges[:, 0], edges[:, 1])), shape=(vertex_count, vertex_count)
    )
    _, labels = connected_components(graph, directed=False)
    return [np.flatnonzero(labels == label) for label in np.unique(labels[np.unique(faces)])]


def test_chapter_6_describes_the_catalogue_isosurface_meshes() -> None:
    """Chapter 6 describes what the catalogue meshes look like, one grid artifact included.

    At the textbook grid the real 3d_z2 mesh bridges its nodal cones about
    2-5 bohr from the nucleus, where the true sub-threshold gap is narrower than
    a grid step; the 3d_xy nodal planes lie on grid nodes, so its four lobes stay
    apart; and the 1s sphere sits at 2.64-2.66 bohr against the analytic 2.661.
    If the exporter's grid or the mesh builder changes, the "finite-grid"
    section, figure 6.1 and exercise 6.1 must be revisited.
    """

    d_z2 = build_isosurface(3, 2, 0, basis="real", resolution=_catalogue_resolution(3))
    assert d_z2.grid_resolution == 65
    assert round(d_z2.grid_spacing_bohr, 2) == 1.05
    faces, vertices = np.asarray(d_z2.faces), np.asarray(d_z2.vertices)
    negative = np.abs(np.abs(np.asarray(d_z2.phase)) - np.pi) < 1e-3
    assert np.all(negative | (np.abs(np.asarray(d_z2.phase)) < 1e-3)), "a real state has two phases"
    bridges = faces[negative[faces].any(axis=1) & ~negative[faces].all(axis=1)]
    assert len(bridges) > 0, "the lobes and the ring are no longer joined across the cones"
    bridge_radii = np.linalg.norm(vertices[bridges].mean(axis=1), axis=1)
    assert bridge_radii.min() > 1.5 and bridge_radii.max() < 5.5
    cone = math.acos(1 / math.sqrt(3))
    theta = np.linspace(cone - 0.5, cone + 0.5, 20001)
    for radius in (2.0, 3.0, 4.0, 5.0):
        density = (
            np.abs(
                hydrogenic_wavefunction(
                    3, 2, 0, np.full_like(theta, radius), theta, np.zeros_like(theta), basis="real"
                )
            )
            ** 2
        )
        gap = theta[density < d_z2.density_level]
        assert 0 < radius * (gap.max() - gap.min()) < 1.0 < d_z2.grid_spacing_bohr, radius

    d_xy = build_isosurface(3, 2, -2, basis="real", resolution=_catalogue_resolution(3))
    lobes = _mesh_components(np.asarray(d_xy.faces), len(d_xy.vertices))
    assert len(lobes) == 4
    assert all(len(np.unique(np.round(np.asarray(d_xy.phase)[lobe], 3))) == 1 for lobe in lobes)

    one_s = build_isosurface(1, 0, 0, basis="real", resolution=_catalogue_resolution(1))
    radii = np.linalg.norm(np.asarray(one_s.vertices), axis=1)
    assert (round(float(radii.min()), 2), round(float(radii.max()), 2)) == (2.64, 2.66)


def _masked(n: int, l: int, m: int, basis: str, plane: str) -> tuple[np.ndarray, float]:
    payload = build_slice(
        n,
        l,
        m,
        basis=BasisKind(basis),
        plane=PrincipalPlane(plane),
        observable=SliceObservable.PHASE,
        resolution=_catalogue_resolution(n),
    )
    size = payload.resolution
    valid = np.asarray(payload.valid_mask, dtype=bool).reshape(size, size)
    return np.argwhere(~valid) - size // 2, payload.max_amplitude_on_plane


def test_chapter_7_mask_examples_match_the_slice_builder() -> None:
    """Chapter 7's phase-mask examples, stated as offsets (row = v, col = u) from the centre."""

    for m in (1, -1):
        masked, _ = _masked(2, 1, m, "complex", "xy")
        assert masked.tolist() == [[0, 0]], m
    masked, _ = _masked(2, 1, 0, "real", "xz")
    assert set(masked[:, 0].tolist()) == {0} and len(masked) == 65
    masked, _ = _masked(3, 2, 0, "real", "xz")
    assert masked.tolist() == [[0, 0]]
    masked, _ = _masked(2, 0, 0, "real", "xz")
    assert masked.size == 0
    masked, residue = _masked(2, 1, 0, "real", "xy")
    assert len(masked) == 65 * 65 and residue < 1e-17


def test_chapter_8_streamline_figures_match_the_current_field_builder() -> None:
    """Chapter 8's streamline figures, checked on the catalogue's current fields.

    Each figure state gets 48 seeds (spec.json) and 48 lines. Every line is a
    horizontal circle about z, turning counter-clockwise seen from +z for m > 0,
    with one speed |m|/s and so one colour. The m = -1 lines are the y-mirror
    images of the m = +1 lines, so with no arrows drawn figures 8.1 and 8.2 look
    identical. If the seeding or the seed count changes, the "streamlines"
    section and the captions of figures 8.1-8.3 must be revisited.
    """

    fields = {
        (n, l, m): build_current_field(n, l, m, basis=BasisKind.COMPLEX, seed_count=48)
        for n, l, m in ((2, 1, 1), (2, 1, -1), (3, 2, 2))
    }
    for (_, _, m), field in fields.items():
        assert len(field.lines) == 48, m
        for line, speed in zip(field.lines, field.speed, strict=True):
            x, y, z = np.asarray(line).T
            s = np.hypot(x, y)
            assert np.ptp(s) / s[0] < 1e-4 and np.ptp(z) == 0.0
            assert np.all(np.sign(x[:-1] * np.diff(y) - y[:-1] * np.diff(x)) == np.sign(m))
            assert np.allclose(np.asarray(speed) * s, abs(m), rtol=1e-5)
    plus, minus = fields[(2, 1, 1)], fields[(2, 1, -1)]
    for forward, reverse, forward_speed, reverse_speed in zip(
        plus.lines, minus.lines, plus.speed, minus.speed, strict=True
    ):
        assert np.array_equal(np.asarray(reverse), np.asarray(forward) * [1.0, -1.0, 1.0])
        # Equal up to the last serialised digit (measured: 5 of 15487 vertices, 1e-12).
        assert np.allclose(reverse_speed, forward_speed, rtol=1e-9, atol=0.0)


def _preset(preset: str) -> tuple[SuperpositionState, int, int]:
    """A catalogue preset as the lab asks for it: complex basis, the slice
    resolution raised to the preset's floor, the seed count clamped to its maximum."""

    entry = next(entry for entry in superposition_catalog() if entry["id"] == preset)
    state = _parse_superposition(str(entry["terms"]), BasisKind.COMPLEX)
    resolution = max(65, int(str(entry["slice_resolution_floor"])))
    return state, resolution, min(48, int(str(entry["streamline_seed_count_max"])))


def _xz_slice(
    state: SuperpositionState,
    time: float,
    resolution: int,
    observable: SliceObservable = SliceObservable.PROBABILITY_DENSITY,
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    payload = build_superposition_slice(
        state,
        time=time,
        plane=PrincipalPlane.XZ,
        observable=observable,
        resolution=resolution,
    )
    assert (payload.u_axis, payload.v_axis) == ([1.0, 0.0, 0.0], [0.0, 0.0, 1.0])
    size = payload.resolution
    axis = (np.arange(size) - size // 2) * payload.spacing_bohr
    z, x = np.meshgrid(axis, axis, indexing="ij")  # rows are v = z, columns u = x
    return np.asarray(payload.values).reshape(size, size), x, z


def test_chapter_9_figures_match_the_superposition_builders() -> None:
    """Chapter 9's superposition figures, checked on the catalogue's own assets.

    Figures 9.1 and 9.2 lean to +z and -z and are near mirror images. Every line
    of figure 9.3 lies in one plane containing the z axis, runs towards -z and
    never crosses z = 0 upwards. Between t = 0 and figure 9.4's t = 7 the
    1s + 3d_z2 slice fades inside the nodal cones and brightens outside them, by
    at most about 7 % of the sqrt(rho / rho_max) colour ramp (chapter 7),
    almost all of it 1-5 bohr from the nucleus; beyond 2 bohr its density is
    under 3 % of the peak. Figure 9.5 leans to -z and is the same at any t. If a builder,
    the slice floor or the seed clamp changes, revisit the "bohr-oscillation",
    "quadrupole-breathing" and "degenerate-controls" sections and the captions.
    """

    bohr, resolution, seeds = _preset("1s-2pz")
    up, _, z = _xz_slice(bohr, 0.0, resolution)
    down, _, _ = _xz_slice(bohr, 8.4, resolution)
    assert up[z > 0].sum() > 2 * up[z < 0].sum()
    assert np.max(np.abs(down[::-1] - up)) < 1e-5 * up.max()

    field = build_superposition_current_field(bohr, time=4.2, seed_count=seeds)
    assert len(field.lines) == seeds
    for line in field.lines:
        x_line, y_line, z_line = np.asarray(line).T
        far = int(np.argmax(np.hypot(x_line, y_line)))
        assert np.allclose(x_line * y_line[far] - y_line * x_line[far], 0.0, atol=1e-9)
        assert z_line[-1] < z_line[0]
        assert not np.any((z_line[:-1] < 0) & (z_line[1:] > 0))

    quad, resolution, _ = _preset("1s-3dz2")
    before, x, z = _xz_slice(quad, 0.0, resolution)
    after, _, _ = _xz_slice(quad, 7.0, resolution)
    assert np.max(np.abs(after - after[::-1])) <= 1e-12 * after.max()
    change = np.sqrt(after / after.max()) - np.sqrt(before / before.max())
    radius = np.hypot(x, z)
    in_cones = np.abs(z) > radius / math.sqrt(3)
    assert np.all(change[in_cones] <= 1e-12)
    assert np.all(change[~in_cones] >= -1e-12)
    band = (radius > 1) & (radius < 5)
    assert 0.06 < np.max(np.abs(change[band])) < 0.08
    assert np.max(np.abs(change[~band])) < 0.02
    for density in (before, after):
        assert np.max(density[radius >= 2]) < 0.03 * density.max()

    degenerate, resolution, _ = _preset("2s-2pz")
    still, _, z = _xz_slice(degenerate, 0.0, resolution)
    later, _, _ = _xz_slice(degenerate, 5.0, resolution)
    assert still[z < 0].sum() > 3 * still[z > 0].sum()
    assert np.max(np.abs(later - still)) <= 1e-12 * still.max()


def test_chapters_10_and_11_figures_match_the_degenerate_slice_builder() -> None:
    """Figures 10.1 and 11.2 show (psi_2s + psi_2pz) / sqrt 2 on the catalogue's xz slice.

    Its only node is the paraboloid r - z = 2 bohr, which the xz plane cuts in the
    parabola z = x^2 / 4 - 1 cupping the nucleus from below: Re psi is positive
    inside it and negative outside. Both the density and Re psi peak at the
    nucleus, and the deepest negative Re psi, about 3 bohr down the -z axis, is
    only about 45 % of that peak. If the preset, the slice builder or its floor
    changes, revisit the "stark-microscopy" and "hybrids-in-the-lab" sections and
    the captions of figures 10.1 and 11.2.
    """

    degenerate, resolution, _ = _preset("2s-2pz")
    density, x, z = _xz_slice(degenerate, 0.0, resolution)
    real, _, _ = _xz_slice(degenerate, 0.0, resolution, SliceObservable.WAVEFUNCTION_REAL)
    peak = np.unravel_index(np.argmax(density), density.shape)
    assert (x[peak], z[peak]) == (0.0, 0.0)
    assert np.unravel_index(np.argmax(real), real.shape) == peak

    spacing = x[0, 1] - x[0, 0]
    above_node = z - (x**2 / 4 - 1)
    clear = np.abs(above_node) > spacing
    assert np.all(real[clear & (above_node > 0)] > 0)
    assert np.all(real[clear & (above_node < 0)] < 0)

    deepest = np.unravel_index(np.argmin(real), real.shape)
    assert x[deepest] == 0.0 and -3.5 < z[deepest] < -2.5
    assert 0.40 < -real.min() / real.max() < 0.50
