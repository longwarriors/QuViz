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
``web/src/state/urlState.ts``) and against the catalogue content.

``CHAPTERS`` is the registry the textbook tasks fill in. It records the exact
level-2 section ids and figure deep links of each page, so a chapter cannot
silently lose a figure, change a deep-link anchor or drift from the plan.
"""

from __future__ import annotations

import math
import re
from functools import cache
from html.parser import HTMLParser
from pathlib import Path
from typing import NamedTuple

from quviz.api.routes import superposition_catalog

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
CHAPTERS: dict[str, Chapter] = {}


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


def test_textbook_index_links_every_chapter_in_order() -> None:
    index = (TEXTBOOK / "index.md").read_text(encoding="utf-8")
    positions = [index.find(f"]({name})") for name in CHAPTERS]
    assert all(position >= 0 for position in positions), dict(zip(CHAPTERS, positions, strict=True))
    assert positions == sorted(positions)
