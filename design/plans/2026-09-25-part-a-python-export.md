# Part A: Python Static Exporter, Radial Profile and 2s-2pz Default View Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the GitHub Pages lab a backend-free data source by replaying the real FastAPI app
into a content-addressed static catalogue (`quviz export-static plan|render`). Add a
`radial_profile` block to eigenstate metadata so the Weather-Lab detail panel can draw P(r)
without doing physics in the browser. Fix the 2s + 2p_z preset, which today opens on an
isosurface request the server always refuses with a 422.

**Architecture:** A new `quviz.export` package with three modules. `catalog_spec` holds the v1
specification as data. `asgi` is a minimal in-process ASGI `GET` client that returns the same
bytes as `TestClient`, so no `httpx` is needed at runtime. `static_site` has `plan()` (catalogues
and `spec.json`) and `render()` (process-pool replay into `files/<sha256(body)[:24]>.json|.bin`
plus `manifest.json`). `radial_profile()` lives in `quviz.scene.builders` next to
`radial_extent_for_mass`. It computes P(r) once per (n, l) at Z = a_mu = 1 and rescales exactly,
and every eigenstate `OrbitalMetadata` gets it through the single constructor, `orbital_metadata()`.
The 2s-2pz fix is a server-probed `SuperpositionCatalogEntry.default_representation`, consumed by
the web store when a preset or a mode switch opens a picture.

**Tech Stack:** Python 3.12, FastAPI 0.141.1 / Starlette 1.6.0 (driven in-process over ASGI),
pydantic 2.13, numpy 2.5 / scipy 1.18 / scikit-image 0.26, typer 0.27 / click 8.4, pytest with
`fastapi.testclient` (httpx 0.28, dev group only), TypeScript 5.9 / vitest 3 / zustand 5,
openapi-typescript 7.13 (`npm --prefix web run codegen`).

**Spec:** `design/specs/2026-09-25-pages-textbook-lab-design.md` (§4.1, §4.2, §5 row 1, §6, §7).
Cross-part contracts (binding): `design/plans/2026-09-25-contracts.md`.

## Global Constraints

- **Worktree.** Part A runs in its own git worktree branched from `feat/pages-textbook-lab`, in
  parallel with Parts B and C (contracts, "Execution order"). The only files outside `src/`, `tests/`,
  `scripts/`-generated fixtures and `docs/reference/` that Part A touches are the web files the API
  contract change forces: `web/src/api/{schema.gen.ts,types.ts,client.ts,client.test.ts}`,
  `web/src/state/useSceneStore{,.test}.ts` and `web/src/components/ControlPanel{,.test}.tsx`.
  Part B also edits `client.ts` and `client.test.ts`, so expect textual merge conflicts there.
  Keep both sides when resolving: B changes the fetch transport, A changes the catalogue parser.
- **Contracts win over the spec** wherever they differ. The spec is stale in four places that
  touch Part A, and this plan implements the contracts in each:
  - file names: spec §4.1 (line 97) says `sha256(key)[:20]`; the contracts fix
    `files/<sha256(body)[:24]>.json|.bin`;
  - manifest fields: spec §4.1 (line 99) adds `generated_by`; the contracts fix exactly
    `format, version, spec, entries`;
  - `requests.json`: spec §4.1 (line 94) describes `[{route, query}]` objects; the contracts fix
    `{"format": "quviz-static-requests/1", "requests": [<string>, …]}`, each string being `route`
    or `route?query`;
  - output root: spec §3 D1 and lines 73/77/120 say `data/v1/`; the contracts fix `<data>`
    (`build/pages/data/`, passed explicitly). Part A hard-codes no output path at all.
- **Working directory for web tools.** Run `git`, `uv` and `npm --prefix web run <script>` from
  the repository root (`npm run` executes the script inside `web/`). Run every direct `vitest` or
  `tsc -p` invocation **with the working directory `web/`**, spelled
  `(cd web && npm exec --no -- vitest run <spec>)` and
  `(cd web && npm exec --no -- tsc -p tsconfig.test.json --noEmit)` in Git Bash. The shorter
  `npm --prefix web exec -- …` keeps the caller's working directory: from the repo root
  `npm --prefix web exec --no -- tsc --showConfig` fails with `error TS5081: Cannot find a
  tsconfig.json file at the current directory: C:/Users/SchrodingerFeiFei/Documents/GitHub/QuViz`
  (checked 2026-09-25), so `tsc -p tsconfig.test.json` would not find its project and vitest would
  run without `web/vitest.config.ts` (no `include`, no `allowOnly: false`, no `globalSetup`). The
  subshell leaves the caller in the repo root.
- **Contract additions owned by Part A.** `design/plans/2026-09-25-contracts.md` does not list
  the following, and Parts B, D and E depend on them. They are binding for every part exactly as
  written here (Tasks A4, A10 and A11 produce them):
  - Python API: `SuperpositionCatalogEntry.default_representation: Literal["isosurface",
    "slice"]`, **required** (no default), so the generated TS field is non-optional:
    `default_representation: "isosurface" | "slice"`.
  - `web/src/api/types.ts`: `export type SuperpositionDefaultRepresentation =
    SuperpositionPreset['default_representation']`.
  - `web/src/api/client.ts`: `parseSuperpositionPreset` rejects a missing or unknown value with
    `Error('<location>.default_representation must be "isosurface" or "slice"')`.
  - `web/src/state/useSceneStore.ts`: `SceneStore.superpositionDefaultRepresentation:
    SuperpositionDefaultRepresentation` (initially `'isosurface'`);
    `setSuperposition(terms: string, label: string, sliceResolutionFloor: number,
    streamlineSeedCountMax: number, defaultRepresentation: SuperpositionDefaultRepresentation):
    void` and `syncSuperpositionCapabilities(terms: string, sliceResolutionFloor: number,
    streamlineSeedCountMax: number, defaultRepresentation: SuperpositionDefaultRepresentation):
    void`. Both are **breaking**: the new last argument is required, so every caller in B and D
    passes `entry.default_representation` from the catalogue entry it applies.
  - `quviz export-static render` failure rule: a 5xx, **a 404** or a transport exception aborts
    with exit code 1, names the request key, and leaves no `manifest.json`. Every other status
    (for example 422) is stored like a 200. The contracts' "non-2xx (e.g. 422) are stored" is
    narrowed accordingly: a 404 means the enumerator produced a route the app does not have.
- **Runtime dependencies.** No new Python dependencies. `src/quviz/**` must not import `httpx` or
  `starlette` by name: `tests/test_declared_dependencies.py` requires every imported third-party
  root to be in `[project] dependencies`, and only `fastapi` is declared. No new npm dependencies
  either: local Node is 24.14.1 and engine-strict blocks installs. `npm run` still works.
- **Typing and lint.** mypy strict (`packages = ["quviz"]`), ruff rules `E F I B UP SIM RUF` with
  line length 100. Before every gate, run `uv run --locked ruff check --fix <touched .py files>`
  (import sorting) and then `uv run --locked ruff format <touched .py files>`. The code blocks in
  this plan were extracted and checked in a scratch copy on 2026-09-25:
  - mypy `--strict` is clean on the three `quviz.export` modules;
  - the 63 export tests of Tasks A1-A4 pass;
  - the radial builder and model of Task A7 pass their 69 tests;
  - ruff's only findings were formatting that `ruff format` rewrites and one `RUF043` (an
    unescaped `match=` regex), which is fixed in this text.
- **Tests.** Zero skips (`tests/conftest.py`) and `xfail_strict`. Never bypass either. A test that
  pins a defect fix must be shown failing before the fix.
- **Web latch.** Part A adds **no** new module under `web/src/`, so `web/coverage-scope.json`,
  `web/vitest.config.ts` and the `src/guards.test.ts` latch stay untouched. The per-file 90/85/90/90
  thresholds still apply to the modified modules (`client.ts`, `useSceneStore.ts`,
  `ControlPanel.tsx`). `web/scripts/` is not touched: the 13-file pin is in
  `tests/test_check_script.py`.
- **Docs.** No new `docs/**/*.md` page, so the nav is unchanged. Docs edits must contain only LF
  control bytes: no TAB, no CR (`tests/test_docs_integrity.py`). `mkdocs build --strict` must stay
  green.
- **Pre-commit gate (CLAUDE.md, user rule).** Every commit that touches `src/`, `tests/` or
  `scripts/` first runs:
  `uv run --locked ruff check .`, `uv run --locked ruff format --check .`, `uv run --locked mypy`,
  and `uv run --locked --group docs pytest --cov=quviz --cov-report=term-missing -q` (coverage at
  least 85%). A commit that also touches `web/` first runs `npm --prefix web run test` and
  `npm --prefix web run typecheck`. While developing inside a task, run only the affected tests.
  The docs, build and fullstack gates run in Task A12 and in the tasks that edit docs.
- **Commit trailer.** Every commit message ends with a blank line followed by
  `Claude-Session: https://claude.ai/code/session_01E44DEzsc7Av26fc7nZ5rSo`. Each commit step does
  this with a second `-m` flag.
- **Budget.** The full `DEFAULT_SPEC` is about 1.2k requests:
  - Eigenstates (about 908): 60 states × (point cloud + metadata), about 56 isosurfaces,
    720 slices and 12 current fields.
  - Superpositions (about 324): 54 frames × 6 requests.

  The maps measured the superposition frames alone at about 6 minutes single-threaded (1s-2pz 108 s,
  1s-3dz2 213 s; one current-field frame takes up to 25 s). The estimated total is 9–10 minutes in
  one process and 1.5–2 minutes with 8 workers. Neither total is measured end to end, because
  that needs Part B's enumerator. Estimated peak memory is 0.3–0.4 GB per worker, from the size of
  a 137³ grid. `render` submits the slow routes first so the long frames don't all land at the end.

## Review Focus

1. **Byte identity.** `AsgiGetClient` must return the same status, body and lower-cased headers as
   `TestClient` (Task A2). Every manifest body must be served bytes, and 422 bodies are included.
2. **Determinism.** Entries are sorted by key and file names come from content hashes, so the
   output doesn't depend on worker completion order. `version` is the SHA-256 over sorted
   `(key, file, status)` lines, each `key\tfile\tstatus\n`. Output with 1 worker and with 2 must be
   byte-identical.
3. **Failure policy.** A 5xx, a transport exception or a 404 aborts with exit 1 and names the
   request key, and no `manifest.json` is left behind. The 404 rule is stricter than the brief's
   "5xx": a route the app doesn't know can only be an enumerator bug. Other non-2xx responses,
   such as 422, are stored.
4. **Radial numerics.**
   - Grid: r = r_max·s² (quadratic in s) so the inner lobes are resolved; r̃ rounded to 6 decimals.
   - P(r) is serialised to 9 significant digits, about 6 kB per profile. Rounding also keeps the
     byte-compared `slice_golden.json` stable across libm versions.
   - Z and a_mu enter only through an exact rescale.
   - An unrepresentable scale gives `null` plus a warning, never a 500.
5. **2s-2pz decision.**
   - The gate is correct: at mass 0.90 the level set sits near a saddle, and the discrete topology
     changes with the grid.
   - The chosen fix is `default_representation` probed at the route defaults (t = 0, both bases),
     cached per process. The first catalogue request pays about 4 s.
   - Rejected alternatives: loosening the gate; a global mass of 0.8; a per-preset "safe mass"
     (the passing masses form islands, not a range).
6. **Store semantics.**
   - The published default applies only when a preset is applied or the mode switches.
   - A catalogue sync records the default but never moves the picture.
   - An explicit `setRepresentation('isosurface')` is honoured.

---

### Task A1: Static catalogue specification (`quviz.export.catalog_spec`)

**Files:**
- Create: `src/quviz/export/__init__.py`
- Create: `src/quviz/export/catalog_spec.py`
- Test: `tests/test_export_catalog_spec.py` (create)

**Interfaces:**
- Consumes: `quviz.conventions.BasisKind`, `PrincipalPlane`, `RepresentationKind`, `SliceObservable`
  (`src/quviz/conventions.py:10-61`, all `StrEnum`).
- Produces:
  - `SPEC_FORMAT: Final = "quviz-static-spec/1"`, `PLAYBACK_LATTICE: Final = "playback-lattice"`
  - `@dataclass(frozen=True, slots=True) class EigenstateCatalogSpec` (fields `n_max, bases, z,
    representations, samples, seed, resolution, probability_mass, seed_count, planes,
    observables`; `to_json() -> dict[str, Any]`)
  - `@dataclass(frozen=True, slots=True) class SuperpositionCatalogSpec` (fields `presets,
    representations, resolution, probability_mass, seed_count, planes, observables, frames`;
    `to_json() -> dict[str, Any]`)
  - `@dataclass(frozen=True, slots=True) class StaticCatalogSpec(eigenstates, superpositions)`
    with `to_json() -> dict[str, Any]` equal to the contract's `spec.json`
  - `DEFAULT_SPEC: Final[StaticCatalogSpec]`
  - `def spec_json_text(spec: StaticCatalogSpec) -> str`

- [ ] **Step 1: Write the failing test** — create `tests/test_export_catalog_spec.py`:

```python
"""The v1 static catalogue specification is the cross-part contract, key for key.

``design/plans/2026-09-25-contracts.md`` fixes ``spec.json``: the web request
enumerator reads it and ``manifest.json`` embeds it. ``CONTRACT_SPEC`` below is
copied from that file, so a drift on either side fails here.
"""

from __future__ import annotations

import dataclasses
import json
from typing import Any

import pytest

from quviz.conventions import BasisKind, PrincipalPlane, RepresentationKind
from quviz.export.catalog_spec import (
    DEFAULT_SPEC,
    PLAYBACK_LATTICE,
    SPEC_FORMAT,
    StaticCatalogSpec,
    spec_json_text,
)

SLICE_OBSERVABLES = ["probability_density", "wavefunction_real", "wavefunction_imag", "phase"]

CONTRACT_SPEC: dict[str, Any] = {
    "format": "quviz-static-spec/1",
    "eigenstates": {
        "n_max": 4,
        "bases": ["real", "complex"],
        "z": 1,
        "representations": ["point_cloud", "isosurface", "slice", "streamlines"],
        "samples": 28000,
        "seed": 7,
        "resolution": 65,
        "probability_mass": 0.9,
        "seed_count": 48,
        "planes": ["xy", "xz", "yz"],
        "observables": SLICE_OBSERVABLES,
    },
    "superpositions": {
        "presets": ["1s-2pz", "2s-2pz", "1s-3dz2", "2pplus-2pminus"],
        "representations": ["isosurface", "slice", "streamlines"],
        "resolution": 65,
        "probability_mass": 0.9,
        "seed_count": 48,
        "planes": ["xz"],
        "observables": SLICE_OBSERVABLES,
        "frames": "playback-lattice",
    },
}


def test_default_spec_is_the_cross_part_contract_including_key_order() -> None:
    serialised = DEFAULT_SPEC.to_json()
    assert serialised == CONTRACT_SPEC
    # Dict equality ignores order; a reviewer diffing spec.json does not.
    assert json.dumps(serialised) == json.dumps(CONTRACT_SPEC)
    assert serialised["format"] == SPEC_FORMAT


def test_spec_json_text_is_indented_utf8_with_one_trailing_newline() -> None:
    text = spec_json_text(DEFAULT_SPEC)
    assert text.startswith('{\n  "format": "quviz-static-spec/1",\n')
    assert text.endswith("}\n")
    assert not text.endswith("\n\n")
    assert json.loads(text) == CONTRACT_SPEC


def test_json_values_are_plain_strings_not_enum_reprs() -> None:
    text = spec_json_text(DEFAULT_SPEC)
    assert "BasisKind" not in text
    assert "RepresentationKind" not in text


@pytest.mark.parametrize(
    ("change", "message"),
    [
        ({"n_max": 0}, "n_max"),
        ({"n_max": 13}, "n_max"),
        ({"bases": ()}, "bases must not be empty"),
        ({"bases": (BasisKind.REAL, BasisKind.REAL)}, "bases must not repeat"),
        ({"bases": ("real",)}, "only BasisKind members"),
        ({"z": 0}, "z must be an integer charge"),
        ({"samples": 999}, "samples"),
        ({"seed": -1}, "seed"),
        ({"resolution": 64}, "odd integer"),
        ({"resolution": 515}, "odd integer"),
        ({"probability_mass": 0.995}, "probability_mass"),
        ({"seed_count": 0}, "seed_count"),
        ({"planes": ()}, "planes must not be empty"),
        ({"observables": ()}, "observables must not be empty"),
    ],
)
def test_eigenstate_spec_rejects_values_no_route_can_serve(
    change: dict[str, Any], message: str
) -> None:
    with pytest.raises(ValueError, match=message):
        dataclasses.replace(DEFAULT_SPEC.eigenstates, **change)


@pytest.mark.parametrize(
    ("change", "message"),
    [
        ({"presets": ()}, "presets must not be empty"),
        ({"presets": ("1s-2pz", "1s-2pz")}, "presets must not repeat"),
        ({"presets": ("",)}, "non-empty preset ids"),
        ({"representations": (RepresentationKind.POINT_CLOUD,)}, "point_cloud"),
        ({"planes": (PrincipalPlane.XZ, PrincipalPlane.XZ)}, "planes must not repeat"),
        ({"frames": "every-0.2-au"}, "frames"),
    ],
)
def test_superposition_spec_rejects_selections_the_player_cannot_use(
    change: dict[str, Any], message: str
) -> None:
    with pytest.raises(ValueError, match=message):
        dataclasses.replace(DEFAULT_SPEC.superpositions, **change)


def test_a_custom_spec_serialises_its_own_choices() -> None:
    narrow = StaticCatalogSpec(
        eigenstates=dataclasses.replace(
            DEFAULT_SPEC.eigenstates, n_max=2, bases=(BasisKind.REAL,)
        ),
        superpositions=dataclasses.replace(DEFAULT_SPEC.superpositions, presets=("1s-2pz",)),
    )
    payload = narrow.to_json()
    assert payload["eigenstates"]["n_max"] == 2
    assert payload["eigenstates"]["bases"] == ["real"]
    assert payload["superpositions"]["presets"] == ["1s-2pz"]
    assert payload["superpositions"]["frames"] == PLAYBACK_LATTICE
```

- [ ] **Step 2: Run it and see it fail**

Run: `uv run --locked --no-sync pytest tests/test_export_catalog_spec.py -q`
Expected: a collection error, `ModuleNotFoundError: No module named 'quviz.export'`.

- [ ] **Step 3: Implement.** Create `src/quviz/export/__init__.py`:

```python
"""Backend-free export of the scene API for the GitHub Pages textbook site.

``quviz.export.catalog_spec`` says what is precomputed, ``quviz.export.asgi``
replays one request through the real application in-process, and
``quviz.export.static_site`` turns a request list into content-addressed files
plus ``manifest.json``. The package re-exports nothing on purpose: importing the
specification must not import FastAPI.
"""
```

Create `src/quviz/export/catalog_spec.py`:

```python
"""The v1 static catalogue specification: what the GitHub Pages site precomputes.

The specification is data, not a request list. It names the states, the
representations and the UI-default tunables; the browser's own request
formation (``web/tools/static-requests.ts``) expands it into literal
``route?query`` keys, so Python never re-spells a query the client sends.
:func:`spec_json_text` is the ``spec.json`` that enumerator reads, and
``manifest.json`` embeds the same object so the static capability overlay can
say what was left out.

``resolution`` and ``seed_count`` are UI defaults, not per-state values: the
client clamps them per state exactly as the live UI does (isosurface and slice
floors, catalogue seed ceilings). ``frames = "playback-lattice"`` exports every
oscillating preset on the live player's own 0.2 a.u. frame lattice and a
degenerate preset only at ``t = 0``.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from enum import StrEnum
from typing import Any, Final, Literal

from quviz.conventions import BasisKind, PrincipalPlane, RepresentationKind, SliceObservable

#: ``format`` of ``spec.json``; bump it when a reader must reject older files.
SPEC_FORMAT: Final = "quviz-static-spec/1"
#: The only frame policy v1 knows: the live player's own time lattice.
PLAYBACK_LATTICE: Final = "playback-lattice"

_MAXIMUM_N: Final = 12
_MAXIMUM_Z: Final = 20
_MINIMUM_SAMPLES: Final = 1_000
_MAXIMUM_SAMPLES: Final = 120_000
_MAXIMUM_SEED: Final = 2_147_483_647
_MINIMUM_RESOLUTION: Final = 49
_MAXIMUM_RESOLUTION: Final = 513
_MINIMUM_PROBABILITY_MASS: Final = 0.50
_MAXIMUM_PROBABILITY_MASS: Final = 0.99


def _require_distinct(name: str, values: tuple[object, ...]) -> None:
    """Reject an empty or repeating selection before it reaches ``spec.json``."""

    if not values:
        raise ValueError(f"{name} must not be empty")
    if len(set(values)) != len(values):
        raise ValueError(f"{name} must not repeat a value, got {[str(v) for v in values]}")


def _require_kind(name: str, values: tuple[object, ...], kind: type[StrEnum]) -> None:
    """Like :func:`_require_distinct`, and every value must be a ``kind`` member."""

    _require_distinct(name, values)
    foreign = [value for value in values if not isinstance(value, kind)]
    if foreign:
        raise ValueError(f"{name} accepts only {kind.__name__} members, got {foreign!r}")


def _require_tunables(
    scope: str, *, resolution: int, probability_mass: float, seed_count: int
) -> None:
    """The UI-default tunables every scene row shares, inside the widest route range."""

    if not _MINIMUM_RESOLUTION <= resolution <= _MAXIMUM_RESOLUTION or resolution % 2 == 0:
        raise ValueError(
            f"{scope}.resolution must be an odd integer in "
            f"{_MINIMUM_RESOLUTION}..{_MAXIMUM_RESOLUTION}, got {resolution}"
        )
    if not _MINIMUM_PROBABILITY_MASS <= probability_mass <= _MAXIMUM_PROBABILITY_MASS:
        raise ValueError(
            f"{scope}.probability_mass must lie in [{_MINIMUM_PROBABILITY_MASS}, "
            f"{_MAXIMUM_PROBABILITY_MASS}], got {probability_mass}"
        )
    if seed_count < 1:
        raise ValueError(f"{scope}.seed_count must be a positive integer, got {seed_count}")


@dataclass(frozen=True, slots=True)
class EigenstateCatalogSpec:
    """Every ``(n, l, m)`` with ``n <= n_max``, in each basis, at one integer charge ``z``."""

    n_max: int
    bases: tuple[BasisKind, ...]
    z: int
    representations: tuple[RepresentationKind, ...]
    samples: int
    seed: int
    resolution: int
    probability_mass: float
    seed_count: int
    planes: tuple[PrincipalPlane, ...]
    observables: tuple[SliceObservable, ...]

    def __post_init__(self) -> None:
        if not 1 <= self.n_max <= _MAXIMUM_N:
            raise ValueError(f"eigenstates.n_max must lie in 1..{_MAXIMUM_N}, got {self.n_max}")
        _require_kind("eigenstates.bases", self.bases, BasisKind)
        if not 1 <= self.z <= _MAXIMUM_Z:
            raise ValueError(
                f"eigenstates.z must be an integer charge in 1..{_MAXIMUM_Z}, got {self.z}"
            )
        _require_kind("eigenstates.representations", self.representations, RepresentationKind)
        if not _MINIMUM_SAMPLES <= self.samples <= _MAXIMUM_SAMPLES:
            raise ValueError(
                f"eigenstates.samples must lie in {_MINIMUM_SAMPLES}..{_MAXIMUM_SAMPLES}, "
                f"got {self.samples}"
            )
        if not 0 <= self.seed <= _MAXIMUM_SEED:
            raise ValueError(f"eigenstates.seed must lie in 0..{_MAXIMUM_SEED}, got {self.seed}")
        _require_tunables(
            "eigenstates",
            resolution=self.resolution,
            probability_mass=self.probability_mass,
            seed_count=self.seed_count,
        )
        _require_kind("eigenstates.planes", self.planes, PrincipalPlane)
        _require_kind("eigenstates.observables", self.observables, SliceObservable)

    def to_json(self) -> dict[str, Any]:
        """The ``eigenstates`` object of ``spec.json``, in contract key order."""

        return {
            "n_max": self.n_max,
            "bases": [basis.value for basis in self.bases],
            "z": self.z,
            "representations": [kind.value for kind in self.representations],
            "samples": self.samples,
            "seed": self.seed,
            "resolution": self.resolution,
            "probability_mass": self.probability_mass,
            "seed_count": self.seed_count,
            "planes": [plane.value for plane in self.planes],
            "observables": [observable.value for observable in self.observables],
        }


@dataclass(frozen=True, slots=True)
class SuperpositionCatalogSpec:
    """Server-catalogue presets, exported over the live player's frame lattice."""

    presets: tuple[str, ...]
    representations: tuple[RepresentationKind, ...]
    resolution: int
    probability_mass: float
    seed_count: int
    planes: tuple[PrincipalPlane, ...]
    observables: tuple[SliceObservable, ...]
    frames: Literal["playback-lattice"]

    def __post_init__(self) -> None:
        _require_distinct("superpositions.presets", self.presets)
        if any(not isinstance(preset, str) or not preset.strip() for preset in self.presets):
            raise ValueError(
                f"superpositions.presets must be non-empty preset ids, got {list(self.presets)}"
            )
        _require_kind(
            "superpositions.representations", self.representations, RepresentationKind
        )
        if RepresentationKind.POINT_CLOUD in self.representations:
            raise ValueError(
                "superpositions.representations cannot include point_cloud: no route samples "
                "a time-dependent state"
            )
        _require_tunables(
            "superpositions",
            resolution=self.resolution,
            probability_mass=self.probability_mass,
            seed_count=self.seed_count,
        )
        _require_kind("superpositions.planes", self.planes, PrincipalPlane)
        _require_kind("superpositions.observables", self.observables, SliceObservable)
        if self.frames != PLAYBACK_LATTICE:
            raise ValueError(
                f"superpositions.frames must be {PLAYBACK_LATTICE!r}, got {self.frames!r}"
            )

    def to_json(self) -> dict[str, Any]:
        """The ``superpositions`` object of ``spec.json``, in contract key order."""

        return {
            "presets": list(self.presets),
            "representations": [kind.value for kind in self.representations],
            "resolution": self.resolution,
            "probability_mass": self.probability_mass,
            "seed_count": self.seed_count,
            "planes": [plane.value for plane in self.planes],
            "observables": [observable.value for observable in self.observables],
            "frames": self.frames,
        }


@dataclass(frozen=True, slots=True)
class StaticCatalogSpec:
    """What the static site precomputes; serialised as ``spec.json``."""

    eigenstates: EigenstateCatalogSpec
    superpositions: SuperpositionCatalogSpec

    def to_json(self) -> dict[str, Any]:
        """The whole ``spec.json`` object, ``format`` first."""

        return {
            "format": SPEC_FORMAT,
            "eigenstates": self.eigenstates.to_json(),
            "superpositions": self.superpositions.to_json(),
        }


def spec_json_text(spec: StaticCatalogSpec) -> str:
    """``spec.json`` exactly as written: two-space indent, UTF-8, one trailing newline."""

    return json.dumps(spec.to_json(), indent=2, ensure_ascii=False) + "\n"


_SLICE_OBSERVABLES: Final = (
    SliceObservable.PROBABILITY_DENSITY,
    SliceObservable.WAVEFUNCTION_REAL,
    SliceObservable.WAVEFUNCTION_IMAG,
    SliceObservable.PHASE,
)

#: The v1 catalogue (contracts file, "A -> B/E").
DEFAULT_SPEC: Final = StaticCatalogSpec(
    eigenstates=EigenstateCatalogSpec(
        n_max=4,
        bases=(BasisKind.REAL, BasisKind.COMPLEX),
        z=1,
        representations=(
            RepresentationKind.POINT_CLOUD,
            RepresentationKind.ISOSURFACE,
            RepresentationKind.SLICE,
            RepresentationKind.STREAMLINES,
        ),
        samples=28_000,
        seed=7,
        resolution=65,
        probability_mass=0.9,
        seed_count=48,
        planes=(PrincipalPlane.XY, PrincipalPlane.XZ, PrincipalPlane.YZ),
        observables=_SLICE_OBSERVABLES,
    ),
    superpositions=SuperpositionCatalogSpec(
        presets=("1s-2pz", "2s-2pz", "1s-3dz2", "2pplus-2pminus"),
        representations=(
            RepresentationKind.ISOSURFACE,
            RepresentationKind.SLICE,
            RepresentationKind.STREAMLINES,
        ),
        resolution=65,
        probability_mass=0.9,
        seed_count=48,
        planes=(PrincipalPlane.XZ,),
        observables=_SLICE_OBSERVABLES,
        frames=PLAYBACK_LATTICE,
    ),
)
```

- [ ] **Step 4: Run it and see it pass**

Run: `uv run --locked --no-sync pytest tests/test_export_catalog_spec.py -q`
Expected: `24 passed`.

- [ ] **Step 5: Pre-commit gate and commit**

```
uv run --locked ruff format src/quviz/export tests/test_export_catalog_spec.py
uv run --locked ruff check .
uv run --locked ruff format --check .
uv run --locked mypy
uv run --locked --group docs pytest --cov=quviz --cov-report=term-missing -q
git add src/quviz/export/__init__.py src/quviz/export/catalog_spec.py tests/test_export_catalog_spec.py
git commit -m "feat(export): add the v1 static catalogue specification" -m "Claude-Session: https://claude.ai/code/session_01E44DEzsc7Av26fc7nZ5rSo"
```

Expected: ruff and mypy clean, pytest all green, coverage at least 85%.

---

### Task A2: In-process ASGI GET client (`quviz.export.asgi`)

**Files:**
- Create: `src/quviz/export/asgi.py`
- Test: `tests/test_export_asgi.py` (create)

**Interfaces:**
- Consumes: `quviz.api.app.create_app(*, mount_frontend: bool = True) -> FastAPI`
  (`src/quviz/api/app.py:19-49`).
- Produces:
  - `type AsgiApp = Callable[[Scope, Receive, Send], Awaitable[None]]` (with `Scope`, `Message`,
    `Receive` and `Send` as structural aliases, so no `starlette` import is needed)
  - `@dataclass(frozen=True, slots=True) class AsgiResponse(status: int, headers: tuple[tuple[str,
    str], ...], body: bytes)` with `header(name: str) -> str | None` and property
    `content_type -> str`
  - `class AsgiGetClient(app: AsgiApp | None = None)` with `get(target: str) -> AsgiResponse`,
    where `target` is `"/path"` or `"/path?query"` (ASCII)

- [ ] **Step 1: Write the failing test** — create `tests/test_export_asgi.py`:

```python
"""The exporter's in-process ASGI client must answer exactly like the live app.

``quviz export-static render`` stores whatever this client returns, so any
difference from what ``TestClient`` (and therefore uvicorn) serves would ship to
GitHub Pages. Each case compares status, body bytes and the lower-cased header
list against the dev-only ``TestClient``.
"""

from __future__ import annotations

from typing import Any

import pytest
from fastapi.testclient import TestClient

from quviz.api import routes as routes_module
from quviz.api.app import create_app
from quviz.export.asgi import AsgiGetClient

live = TestClient(create_app(mount_frontend=False))
replay = AsgiGetClient()

POINT_CLOUD = "/api/orbitals/point-cloud?n=2&l=1&m=0&z=1&basis=real&samples=1000&seed=7"
ISOSURFACE = (
    "/api/orbitals/isosurface?n=1&l=0&m=0&z=1&basis=real&resolution=49&probability_mass=0.8"
)
REFUSED = "/api/orbitals/metadata?n=2&l=1&m=2&z=1&basis=real"
ENCODED_SUPERPOSITION = (
    "/api/superposition/slice?terms=1%2C0%2C0%2C0.7071067811865476%3B2%2C1%2C0%2C0.7071067811865476"
    "&time=3.6&basis=complex&z=1&a_mu=1&resolution=65&plane=xz&observable=phase"
)


@pytest.mark.parametrize("target", [POINT_CLOUD, ISOSURFACE, REFUSED, ENCODED_SUPERPOSITION])
def test_replay_is_byte_identical_to_the_test_client(target: str) -> None:
    ours = replay.get(target)
    theirs = live.get(target)

    assert ours.status == theirs.status_code
    assert ours.body == theirs.content
    assert sorted(ours.headers) == sorted(theirs.headers.multi_items())
    assert ours.content_type == theirs.headers["content-type"]


def test_the_qvpc_headers_survive_and_lookup_is_case_insensitive() -> None:
    response = replay.get(POINT_CLOUD)
    assert response.status == 200
    assert response.header("X-QuViz-Format") == "QVPC/1"
    assert response.header("x-quviz-radial-mass") is not None
    assert response.header("x-no-such-header") is None


@pytest.mark.parametrize(
    "target", ["api/orbitals/catalog", "/api/orbitals/catalog#frag", "/api/x?label=ψ"]
)
def test_targets_must_be_absolute_ascii_paths_without_fragments(target: str) -> None:
    with pytest.raises(ValueError, match="target must be"):
        replay.get(target)


def test_a_server_exception_reaches_the_caller(monkeypatch: pytest.MonkeyPatch) -> None:
    def broken(*args: object, **kwargs: object) -> None:
        raise AssertionError("programming sentinel")

    monkeypatch.setattr(routes_module, "_point_cloud_bytes", broken)
    with pytest.raises(AssertionError, match="programming sentinel"):
        AsgiGetClient().get(POINT_CLOUD)


def test_an_application_that_never_answers_is_an_error() -> None:
    async def silent(scope: Any, receive: Any, send: Any) -> None:
        return None

    with pytest.raises(RuntimeError, match="without starting an HTTP response"):
        AsgiGetClient(silent).get("/anything")


def test_scope_and_a_streamed_body_follow_the_asgi_http_protocol() -> None:
    seen: dict[str, Any] = {}

    async def streamed(scope: Any, receive: Any, send: Any) -> None:
        seen.update(scope)
        assert (await receive())["type"] == "http.request"
        await send(
            {
                "type": "http.response.start",
                "status": 207,
                "headers": [(b"Content-Type", b"text/plain"), (b"X-QuViz-Test", b"1")],
            }
        )
        await send({"type": "http.response.body", "body": b"ab", "more_body": True})
        await send({"type": "http.response.body", "body": b"cd"})
        seen["after"] = (await receive())["type"]

    response = AsgiGetClient(streamed).get("/api/demo%20path?a=1&b=x%2Cy")

    assert response.status == 207
    assert response.body == b"abcd"
    assert response.headers == (("content-type", "text/plain"), ("x-quviz-test", "1"))
    assert seen["method"] == "GET"
    assert seen["path"] == "/api/demo path"
    assert seen["raw_path"] == b"/api/demo%20path"
    assert seen["query_string"] == b"a=1&b=x%2Cy"
    assert seen["after"] == "http.disconnect"
```

- [ ] **Step 2: Run it and see it fail**

Run: `uv run --locked --no-sync pytest tests/test_export_asgi.py -q`
Expected: a collection error, `ModuleNotFoundError: No module named 'quviz.export.asgi'`.

- [ ] **Step 3: Implement** — create `src/quviz/export/asgi.py`:

```python
"""A minimal in-process ASGI ``GET`` client for replaying the scene API.

The static exporter must store exactly the bytes a live ``quviz serve``
answers with -- status, body and the ``X-QuViz-*`` headers the QVPC parser
requires. Driving the ASGI application in-process gives that byte identity
without a socket or a server, and without ``httpx``, which is only a
development dependency: a runtime command must not import it.

Only what the exporter needs is implemented: ``GET`` with an optional query,
no request body, one response. Header names come back lower-cased, the way
Starlette writes them and the manifest stores them.
"""

from __future__ import annotations

import asyncio
from collections.abc import Awaitable, Callable, MutableMapping
from dataclasses import dataclass, field
from typing import Any, Final
from urllib.parse import unquote

from quviz.api.app import create_app

type Scope = MutableMapping[str, Any]
type Message = MutableMapping[str, Any]
type Receive = Callable[[], Awaitable[Message]]
type Send = Callable[[Message], Awaitable[None]]
type AsgiApp = Callable[[Scope, Receive, Send], Awaitable[None]]

_HOST: Final = "quviz-export"


@dataclass(frozen=True, slots=True)
class AsgiResponse:
    """One complete HTTP response: status, lower-cased headers in wire order, body."""

    status: int
    headers: tuple[tuple[str, str], ...]
    body: bytes

    def header(self, name: str) -> str | None:
        """The first value of header ``name`` (case-insensitive), or ``None``."""

        wanted = name.lower()
        return next((value for key, value in self.headers if key == wanted), None)

    @property
    def content_type(self) -> str:
        """The ``content-type`` header, or ``""`` when the response has none."""

        return self.header("content-type") or ""


@dataclass(slots=True)
class _Collected:
    status: int | None = None
    headers: list[tuple[str, str]] = field(default_factory=list)
    chunks: list[bytes] = field(default_factory=list)


class AsgiGetClient:
    """Issue ``GET route?query`` against an ASGI application, in this process.

    ``app`` defaults to ``create_app(mount_frontend=False)`` -- the application
    the API tests and the OpenAPI fixture use -- so whether ``web/dist`` exists
    cannot change a replayed response.
    """

    def __init__(self, app: AsgiApp | None = None) -> None:
        self._app: AsgiApp = app if app is not None else create_app(mount_frontend=False)

    def get(self, target: str) -> AsgiResponse:
        """Replay ``target`` (``/path`` or ``/path?query``, ASCII, percent-encoded).

        The query string is passed through byte for byte, so the application
        parses exactly the key the browser sends. An exception the application
        raises after answering (Starlette re-raises server errors) propagates.
        """

        if not target.startswith("/") or "#" in target:
            raise ValueError(
                f"target must be an absolute path with an optional query, got {target!r}"
            )
        path, _, query = target.partition("?")
        try:
            raw_path = path.encode("ascii")
            query_string = query.encode("ascii")
        except UnicodeEncodeError as error:
            raise ValueError(
                f"target must be ASCII (percent-encode it first), got {target!r}"
            ) from error
        scope: Scope = {
            "type": "http",
            "asgi": {"version": "3.0", "spec_version": "2.3"},
            "http_version": "1.1",
            "method": "GET",
            "scheme": "http",
            "path": unquote(path),
            "raw_path": raw_path,
            "root_path": "",
            "query_string": query_string,
            "headers": [(b"host", _HOST.encode("ascii"))],
            "client": ("127.0.0.1", 0),
            "server": (_HOST, 80),
            "extensions": {},
            "state": {},
        }
        return asyncio.run(self._exchange(scope))

    async def _exchange(self, scope: Scope) -> AsgiResponse:
        collected = _Collected()
        finished = asyncio.Event()
        request_delivered = False

        async def receive() -> Message:
            nonlocal request_delivered
            if not request_delivered:
                request_delivered = True
                return {"type": "http.request", "body": b"", "more_body": False}
            await finished.wait()
            return {"type": "http.disconnect"}

        async def send(message: Message) -> None:
            if message["type"] == "http.response.start":
                collected.status = int(message["status"])
                collected.headers.extend(
                    (bytes(name).decode("latin-1").lower(), bytes(value).decode("latin-1"))
                    for name, value in message.get("headers", ())
                )
            elif message["type"] == "http.response.body":
                collected.chunks.append(bytes(message.get("body", b"")))
                if not message.get("more_body", False):
                    finished.set()

        await self._app(scope, receive, send)
        if collected.status is None:
            raise RuntimeError(f"{scope['path']} returned without starting an HTTP response")
        return AsgiResponse(
            status=collected.status,
            headers=tuple(collected.headers),
            body=b"".join(collected.chunks),
        )
```

- [ ] **Step 4: Run it and see it pass**

Run: `uv run --locked --no-sync pytest tests/test_export_asgi.py tests/test_declared_dependencies.py -q`
Expected: `14 passed` (11 new, plus the 3 dependency-declaration tests, which prove no undeclared
import slipped in).

A read-only probe of this design on 2026-09-25 gave identical status, body and headers for the
catalogue, a point cloud, an isosurface, both 422 shapes (an `HTTPException` string and a
validation list) and a percent-encoded superposition slice. 300 sequential replays took 0.43 s and
leaked no threads.

- [ ] **Step 5: Pre-commit gate and commit**

```
uv run --locked ruff format src/quviz/export/asgi.py tests/test_export_asgi.py
uv run --locked ruff check .
uv run --locked ruff format --check .
uv run --locked mypy
uv run --locked --group docs pytest --cov=quviz --cov-report=term-missing -q
git add src/quviz/export/asgi.py tests/test_export_asgi.py
git commit -m "feat(export): replay API requests in-process with byte-identical ASGI responses" -m "Claude-Session: https://claude.ai/code/session_01E44DEzsc7Av26fc7nZ5rSo"
```

---

### Task A3: Catalogue planning (`static_site.plan`)

**Files:**
- Create: `src/quviz/export/static_site.py`
- Test: `tests/test_export_static_site.py` (create)

**Interfaces:**
- Consumes: `AsgiGetClient`, `AsgiResponse` (Task A2); `DEFAULT_SPEC`, `StaticCatalogSpec`,
  `spec_json_text` (Task A1); `GET /api/orbitals/catalog` (`src/quviz/api/routes.py:73-109`) and
  `GET /api/superposition/catalog` (`routes.py:574-607`).
- Produces:
  - `class StaticExportError(RuntimeError)`
  - `type ProgressLog = Callable[[str], None]`
  - constants `MANIFEST_FORMAT, REQUESTS_FORMAT, ORBITAL_CATALOG_ROUTE, SUPERPOSITION_CATALOG_ROUTE,
    ORBITAL_CATALOG_FILE = "catalog-orbitals.json", SUPERPOSITION_CATALOG_FILE =
    "catalog-superpositions.json", SPEC_FILE = "spec.json", REQUESTS_FILE = "requests.json",
    MANIFEST_FILE = "manifest.json", FILES_DIRECTORY = "files"`
  - `def plan(out: Path, *, spec: StaticCatalogSpec = DEFAULT_SPEC, client: AsgiGetClient | None =
    None, log: ProgressLog = _silent) -> tuple[Path, ...]`, which writes exactly the three files
    listed in the contracts ("A -> B/E", item 1)

- [ ] **Step 1: Write the failing test** — create `tests/test_export_static_site.py`:

```python
"""``quviz.export.static_site``: catalogue planning and request replay."""

from __future__ import annotations

import dataclasses
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from quviz.api.app import create_app
from quviz.export.asgi import AsgiResponse
from quviz.export.catalog_spec import DEFAULT_SPEC, spec_json_text
from quviz.export.static_site import StaticExportError, plan

live = TestClient(create_app(mount_frontend=False))


def test_plan_writes_both_catalogues_verbatim_and_the_spec(tmp_path: Path) -> None:
    out = tmp_path / "data"
    messages: list[str] = []

    written = plan(out, log=messages.append)

    assert [path.name for path in written] == [
        "catalog-orbitals.json",
        "catalog-superpositions.json",
        "spec.json",
    ]
    assert (out / "catalog-orbitals.json").read_bytes() == live.get("/api/orbitals/catalog").content
    assert (out / "catalog-superpositions.json").read_bytes() == live.get(
        "/api/superposition/catalog"
    ).content
    assert (out / "spec.json").read_bytes() == spec_json_text(DEFAULT_SPEC).encode("utf-8")
    assert len(messages) == 3
    assert all(message.startswith("wrote ") for message in messages)


def test_plan_refuses_a_spec_that_names_an_unpublished_preset(tmp_path: Path) -> None:
    ghost = dataclasses.replace(
        DEFAULT_SPEC,
        superpositions=dataclasses.replace(
            DEFAULT_SPEC.superpositions, presets=("1s-2pz", "no-such-preset")
        ),
    )
    with pytest.raises(StaticExportError, match="no-such-preset"):
        plan(tmp_path / "data", spec=ghost)
    assert not (tmp_path / "data").exists()


class _FailingCatalogue:
    def get(self, target: str) -> AsgiResponse:
        return AsgiResponse(
            status=500, headers=(("content-type", "text/plain"),), body=b"catalogue exploded"
        )


def test_plan_reports_a_catalogue_that_does_not_answer_200(tmp_path: Path) -> None:
    with pytest.raises(
        StaticExportError, match="/api/orbitals/catalog answered HTTP 500: catalogue exploded"
    ):
        plan(tmp_path / "data", client=_FailingCatalogue())
```

- [ ] **Step 2: Run it and see it fail**

Run: `uv run --locked --no-sync pytest tests/test_export_static_site.py -q`
Expected: a collection error, `ModuleNotFoundError: No module named 'quviz.export.static_site'`.

- [ ] **Step 3: Implement** — create `src/quviz/export/static_site.py`:

```python
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
```

- [ ] **Step 4: Run it and see it pass**

Run: `uv run --locked --no-sync pytest tests/test_export_static_site.py -q`
Expected: `3 passed`.

- [ ] **Step 5: Pre-commit gate and commit**

```
uv run --locked ruff format src/quviz/export/static_site.py tests/test_export_static_site.py
uv run --locked ruff check .
uv run --locked ruff format --check .
uv run --locked mypy
uv run --locked --group docs pytest --cov=quviz --cov-report=term-missing -q
git add src/quviz/export/static_site.py tests/test_export_static_site.py
git commit -m "feat(export): plan the static catalogue from live catalogue responses" -m "Claude-Session: https://claude.ai/code/session_01E44DEzsc7Av26fc7nZ5rSo"
```

---

### Task A4: Request replay, content-addressed files and `manifest.json` (`static_site.render`)

**Files:**
- Modify: `src/quviz/export/static_site.py` (imports block at the top; append the replay machinery
  after `plan`)
- Test: `tests/test_export_static_site.py` (modify the import block; append the render tests)

**Interfaces:**
- Consumes: `requests.json` = `{"format": "quviz-static-requests/1", "requests": [str, ...]}`
  (contracts, "B -> A/E"); `<data>/spec.json` written by `plan`; `AsgiGetClient` (Task A2).
- Produces:
  - `FILE_HASH_LENGTH: Final = 24`, `VERSION_LENGTH: Final = 16`, `MAXIMUM_WORKERS: Final = 32`
  - `def default_worker_count() -> int`, which is `max(1, min(8, os.cpu_count() or 1))`
  - `def read_requests(path: Path) -> tuple[str, ...]`
  - `def manifest_version(entries: Mapping[str, Mapping[str, Any]]) -> str`
  - `@dataclass(frozen=True, slots=True) class RenderSummary(version: str, entries: int, files: int,
    total_bytes: int, status_counts: dict[int, int], route_seconds: dict[str, float])`
  - `def render(data: Path, requests: Path, *, workers: int = 1, log: ProgressLog = _silent) ->
    RenderSummary`. It writes `<data>/files/<sha256(body)[:24]>.json|.bin` and
    `<data>/manifest.json` exactly per the contracts (`format`, `version`, `spec`, `entries`; each
    entry has `file`, `status`, `content_type`, and `headers` limited to lower-cased `x-quviz-*`).
  - Failure policy: a 5xx, a 404 or a transport exception raises `StaticExportError` naming the
    key, and leaves no `manifest.json`.

- [ ] **Step 1: Write the failing tests.** In `tests/test_export_static_site.py`, replace the import
  block (from `import dataclasses` through the `from quviz.export.static_site import
  StaticExportError, plan` line) with:

```python
import dataclasses
import hashlib
import json
from concurrent.futures import Future
from concurrent.futures.process import BrokenProcessPool
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient

from quviz.api import routes as routes_module
from quviz.api.app import create_app
from quviz.export import static_site
from quviz.export.asgi import AsgiResponse
from quviz.export.catalog_spec import DEFAULT_SPEC, spec_json_text
from quviz.export.static_site import (
    StaticExportError,
    default_worker_count,
    manifest_version,
    plan,
    read_requests,
    render,
)
```

Then append to the end of the file:

```python
POINT_CLOUD = "/api/orbitals/point-cloud?n=2&l=1&m=0&z=1&basis=real&samples=1000&seed=7"
METADATA = "/api/orbitals/metadata?n=2&l=1&m=0&z=1&basis=real"
METADATA_REORDERED = "/api/orbitals/metadata?n=2&l=1&m=0&basis=real&z=1"
REFUSED = "/api/orbitals/metadata?n=2&l=1&m=2&z=1&basis=real"
REQUESTS = ("/api/orbitals/catalog", METADATA, METADATA_REORDERED, REFUSED, POINT_CLOUD)


def _write_requests(path: Path, keys: tuple[str, ...]) -> Path:
    path.write_text(
        json.dumps({"format": "quviz-static-requests/1", "requests": list(keys)}),
        encoding="utf-8",
    )
    return path


def _manifest(data: Path) -> dict[str, Any]:
    return json.loads((data / "manifest.json").read_text(encoding="utf-8"))


@pytest.fixture
def data_dir(tmp_path: Path) -> Path:
    data = tmp_path / "data"
    plan(data)
    _write_requests(data / "requests.json", REQUESTS)
    return data


def test_render_stores_every_response_verbatim_under_its_content_hash(data_dir: Path) -> None:
    summary = render(data_dir, data_dir / "requests.json")

    manifest = _manifest(data_dir)
    assert list(manifest) == ["format", "version", "spec", "entries"]
    assert manifest["format"] == "quviz-static/1"
    assert manifest["spec"] == json.loads((data_dir / "spec.json").read_text(encoding="utf-8"))
    assert list(manifest["entries"]) == sorted(REQUESTS)
    for key, entry in manifest["entries"].items():
        expected = live.get(key)
        body = (data_dir / entry["file"]).read_bytes()
        assert body == expected.content, key
        assert entry["status"] == expected.status_code
        assert entry["content_type"] == expected.headers["content-type"]
        assert entry["headers"] == {
            name: value
            for name, value in expected.headers.multi_items()
            if name.startswith("x-quviz-")
        }
        suffix = ".json" if entry["content_type"] == "application/json" else ".bin"
        assert entry["file"] == f"files/{hashlib.sha256(body).hexdigest()[:24]}{suffix}"
    entries = manifest["entries"]
    # Two spellings of one question share one body and therefore one file.
    assert entries[METADATA]["file"] == entries[METADATA_REORDERED]["file"]
    referenced = {entry["file"].removeprefix("files/") for entry in entries.values()}
    assert sorted(path.name for path in (data_dir / "files").iterdir()) == sorted(referenced)
    assert summary.entries == len(REQUESTS)
    assert summary.files == len(referenced) == 4
    assert summary.version == manifest["version"]


def test_manifest_version_digests_the_sorted_key_file_status_triples(data_dir: Path) -> None:
    render(data_dir, data_dir / "requests.json")
    manifest = _manifest(data_dir)
    lines = "".join(
        f"{key}\t{entry['file']}\t{entry['status']}\n"
        for key, entry in sorted(manifest["entries"].items())
    )
    assert manifest["version"] == hashlib.sha256(lines.encode("utf-8")).hexdigest()[:16]
    assert manifest_version(manifest["entries"]) == manifest["version"]
    changed = {**manifest["entries"], REFUSED: {**manifest["entries"][REFUSED], "status": 400}}
    assert manifest_version(changed) != manifest["version"]


def test_point_cloud_entry_carries_the_qvpc_headers_pages_cannot_send(data_dir: Path) -> None:
    render(data_dir, data_dir / "requests.json")
    entry = _manifest(data_dir)["entries"][POINT_CLOUD]
    assert entry["content_type"] == "application/vnd.quviz.point-cloud"
    assert entry["file"].endswith(".bin")
    assert set(entry["headers"]) == {"x-quviz-format", "x-quviz-radial-mass", "x-quviz-extent-bohr"}
    assert entry["headers"]["x-quviz-format"] == "QVPC/1"


def test_a_scientific_refusal_is_stored_with_its_detail(data_dir: Path) -> None:
    render(data_dir, data_dir / "requests.json")
    entry = _manifest(data_dir)["entries"][REFUSED]
    assert entry["status"] == 422
    assert entry["file"].endswith(".json")
    assert "|m| <= l" in json.loads((data_dir / entry["file"]).read_bytes())["detail"]


def test_rerender_is_byte_identical_and_drops_only_stale_export_files(data_dir: Path) -> None:
    files = data_dir / "files"
    files.mkdir()
    stale = files / f"{'0' * 24}.bin"
    stale.write_bytes(b"left over from an older catalogue")
    foreign = files / "README.txt"
    foreign.write_text("not written by the exporter", encoding="utf-8")

    render(data_dir, data_dir / "requests.json")
    first = (data_dir / "manifest.json").read_bytes()
    render(data_dir, data_dir / "requests.json")

    assert (data_dir / "manifest.json").read_bytes() == first
    assert not stale.exists()
    assert foreign.exists()


def test_a_process_pool_writes_the_same_catalogue_as_one_process(tmp_path: Path) -> None:
    keys = ("/api/orbitals/catalog", METADATA, REFUSED, POINT_CLOUD)
    outputs = []
    for workers in (1, 2):
        data = tmp_path / f"workers-{workers}"
        plan(data)
        _write_requests(data / "requests.json", keys)
        render(data, data / "requests.json", workers=workers)
        outputs.append(
            (
                (data / "manifest.json").read_bytes(),
                sorted((path.name, path.read_bytes()) for path in (data / "files").iterdir()),
            )
        )
    assert outputs[0] == outputs[1]


def test_a_server_error_aborts_the_export_and_names_the_request(
    data_dir: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    def broken(*args: object, **kwargs: object) -> None:
        raise AssertionError("programming sentinel")

    monkeypatch.setattr(routes_module, "_point_cloud_bytes", broken)
    (data_dir / "manifest.json").write_text("{}", encoding="utf-8")

    with pytest.raises(StaticExportError) as failure:
        render(data_dir, data_dir / "requests.json")

    message = str(failure.value)
    assert POINT_CLOUD in message
    assert "AssertionError: programming sentinel" in message
    assert "no manifest was written" in message
    assert not (data_dir / "manifest.json").exists()


def test_a_request_for_an_unknown_route_aborts(tmp_path: Path) -> None:
    data = tmp_path / "data"
    plan(data)
    requests = _write_requests(data / "requests.json", ("/api/orbitals/no-such-route",))
    with pytest.raises(StaticExportError, match="HTTP 404"):
        render(data, requests)


def test_a_crashed_worker_is_reported_as_a_transport_failure_of_its_key() -> None:
    future: Future[static_site._Replay] = Future()
    future.set_exception(BrokenProcessPool("worker died"))
    replayed = static_site._result_or_failure(future, METADATA)
    assert replayed.key == METADATA
    assert replayed.error == "BrokenProcessPool: worker died"
    assert static_site._failure(replayed) == (
        f"{METADATA}: transport failure: BrokenProcessPool: worker died"
    )


@pytest.mark.parametrize(
    ("document", "message"),
    [
        (
            {"format": "quviz-static-requests/0", "requests": ["/api/orbitals/catalog"]},
            "is not a quviz-static-requests/1 document",
        ),
        ({"format": "quviz-static-requests/1", "requests": []}, "at least one request"),
        ({"format": "quviz-static-requests/1", "requests": [7]}, r"requests\[0\]"),
        ({"format": "quviz-static-requests/1", "requests": ["/docs"]}, r"requests\[0\]"),
        (
            {"format": "quviz-static-requests/1", "requests": ["/api/orbitals/metadata?n=1 "]},
            r"requests\[0\]",
        ),
        (
            {"format": "quviz-static-requests/1", "requests": ["/api/orbitals/catalog#x"]},
            r"requests\[0\]",
        ),
        (
            {
                "format": "quviz-static-requests/1",
                "requests": ["/api/orbitals/catalog", "/api/orbitals/catalog"],
            },
            r"requests\[1\] repeats",
        ),
    ],
)
def test_requests_json_is_validated_before_anything_is_replayed(
    tmp_path: Path, document: dict[str, Any], message: str
) -> None:
    path = tmp_path / "requests.json"
    path.write_text(json.dumps(document), encoding="utf-8")
    with pytest.raises(StaticExportError, match=message):
        read_requests(path)


def test_an_unreadable_requests_file_is_reported(tmp_path: Path) -> None:
    with pytest.raises(StaticExportError, match="cannot read"):
        read_requests(tmp_path / "missing.json")


def test_render_needs_the_spec_written_by_plan(tmp_path: Path) -> None:
    requests = _write_requests(tmp_path / "requests.json", ("/api/orbitals/catalog",))
    with pytest.raises(StaticExportError, match="export-static plan --out"):
        render(tmp_path, requests)
    (tmp_path / "spec.json").write_text('{"format": "something-else"}', encoding="utf-8")
    with pytest.raises(StaticExportError, match="is not a quviz-static-spec/1 document"):
        render(tmp_path, requests)


def test_render_logs_every_request_and_a_per_route_summary(data_dir: Path) -> None:
    messages: list[str] = []
    render(data_dir, data_dir / "requests.json", log=messages.append)
    assert messages[0].startswith("export-static render: 5 requests, 1 worker(s)")
    for key in REQUESTS:
        assert any(message.endswith(f"s {key}") for message in messages), key
    assert any(message.startswith("  /api/orbitals/metadata: 3 requests") for message in messages)
    assert messages[-1].startswith("manifest.json: version ")


def test_submission_order_starts_the_slowest_routes_first() -> None:
    keys = [
        "/api/orbitals/catalog",
        "/api/orbitals/isosurface?n=1",
        "/api/superposition/current-field?t=0",
        "/api/superposition/isosurface?t=0",
        "/api/orbitals/current-field?n=2",
    ]
    assert static_site._submission_order(keys) == [
        "/api/superposition/current-field?t=0",
        "/api/superposition/isosurface?t=0",
        "/api/orbitals/isosurface?n=1",
        "/api/orbitals/current-field?n=2",
        "/api/orbitals/catalog",
    ]


def test_worker_entry_points_replay_in_process(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(static_site, "_worker_client", None)
    with pytest.raises(RuntimeError, match="not initialised"):
        static_site._replay("/api/orbitals/catalog")
    static_site._initialise_worker()
    replayed = static_site._replay("/api/orbitals/catalog")
    assert (replayed.status, replayed.error) == (200, None)
    assert replayed.body == live.get("/api/orbitals/catalog").content


def test_default_worker_count_is_the_cpu_count_capped_at_eight(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    for reported, expected in ((None, 1), (1, 1), (4, 4), (64, 8)):
        monkeypatch.setattr(static_site.os, "cpu_count", lambda reported=reported: reported)
        assert default_worker_count() == expected


@pytest.mark.parametrize("workers", [0, 33])
def test_render_rejects_a_worker_count_outside_the_pool_limits(
    data_dir: Path, workers: int
) -> None:
    with pytest.raises(ValueError, match=r"workers must lie in 1\.\.32"):
        render(data_dir, data_dir / "requests.json", workers=workers)


def test_a_hash_prefix_collision_is_refused_not_overwritten(tmp_path: Path) -> None:
    written: dict[str, int] = {}
    name = static_site._store_body(tmp_path, b'{"a":1}', "application/json", written)
    assert name.endswith(".json")
    assert written == {name: 7}
    same = static_site._store_body(
        tmp_path, b'{"a":1}', "application/json; charset=utf-8", written
    )
    assert same == name
    (tmp_path / name).write_bytes(b"tampered")
    with pytest.raises(StaticExportError, match="collision"):
        static_site._store_body(tmp_path, b'{"a":1}', "application/json", written)
```

- [ ] **Step 2: Run them and see them fail**

Run: `uv run --locked --no-sync pytest tests/test_export_static_site.py -q`
Expected: a collection error, `ImportError: cannot import name 'default_worker_count' from
'quviz.export.static_site'`.

- [ ] **Step 3: Implement.** In `src/quviz/export/static_site.py`, replace the import block (from
  `import json` through `from quviz.export.catalog_spec import ...`) with:

```python
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
```

Directly under the `FILES_DIRECTORY` constant, add:

```python
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
```

Extend the module docstring by adding this paragraph after its last paragraph:

```text
A 5xx, a 404 (a request the routes do not know, which can only mean the
enumerator and ``routes.py`` disagree) or a transport exception aborts the run
before ``manifest.json`` exists: a half-built catalogue must not be
publishable. The manifest is the cross-part contract::

    {"format": "quviz-static/1", "version": "<16 hex>", "spec": {...},
     "entries": {"<route?query>": {"file": "files/<24 hex>.json",
                                   "status": 200,
                                   "content_type": "application/json",
                                   "headers": {"x-quviz-...": "..."}}}}
```

Then append to the end of the module:

```python
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
            f"{replay.key}: HTTP 404: no such route "
            "(the request enumerator and routes.py disagree)"
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
```

- [ ] **Step 4: Run them and see them pass**

Run: `uv run --locked --no-sync pytest tests/test_export_static_site.py -q`
Expected: `28 passed`. The process-pool test takes a few seconds, since it spawns two workers that
each import the app; a read-only spawn probe on this machine took 1.1 s.

- [ ] **Step 5: Pre-commit gate and commit**

```
uv run --locked ruff format src/quviz/export/static_site.py tests/test_export_static_site.py
uv run --locked ruff check .
uv run --locked ruff format --check .
uv run --locked mypy
uv run --locked --group docs pytest --cov=quviz --cov-report=term-missing -q
git add src/quviz/export/static_site.py tests/test_export_static_site.py
git commit -m "feat(export): render requests into content-addressed files and manifest.json" -m "Claude-Session: https://claude.ai/code/session_01E44DEzsc7Av26fc7nZ5rSo"
```

---

### Task A5: `quviz export-static plan|render` CLI

**Files:**
- Modify: `src/quviz/cli.py` (append after `doctor`, line 81)
- Test: `tests/test_cli.py` (add `import json` to the import block at lines 1-10; append tests)

**Interfaces:**
- Consumes: `static_site.plan`, `render`, `default_worker_count`, `StaticExportError` and
  `REQUESTS_FILE` (Tasks A3 and A4).
- Produces:
  - `quviz export-static plan --out PATH`
  - `quviz export-static render --data PATH [--requests PATH] [--workers N]`. `--requests`
    defaults to `DATA/requests.json`; `--workers` defaults to `default_worker_count()` and must be
    in 1..32. The command exits 1 with the failing key on stderr.

- [ ] **Step 1: Write the failing tests.** Add `import json` as the first line after
  `from __future__ import annotations` in `tests/test_cli.py`, keeping isort order. Then append:

```python
def _write_requests(path: Path, keys: list[str]) -> None:
    path.write_text(
        json.dumps({"format": "quviz-static-requests/1", "requests": keys}), encoding="utf-8"
    )


def test_export_static_help_names_both_steps() -> None:
    result = runner.invoke(app, ["export-static", "--help"])
    assert result.exit_code == 0
    assert "plan" in result.output
    assert "render" in result.output


def test_export_static_plan_then_render_writes_a_manifest(tmp_path: Path) -> None:
    data = tmp_path / "data"
    planned = runner.invoke(app, ["export-static", "plan", "--out", str(data)])
    assert planned.exit_code == 0, planned.output
    assert (data / "spec.json").is_file()
    assert "catalog-superpositions.json" in planned.output

    keys = ["/api/orbitals/catalog", "/api/orbitals/metadata?n=1&l=0&m=0&z=1&basis=real"]
    _write_requests(data / "requests.json", keys)
    rendered = runner.invoke(
        app,
        [
            "export-static",
            "render",
            "--data",
            str(data),
            "--requests",
            str(data / "requests.json"),
            "--workers",
            "1",
        ],
    )
    assert rendered.exit_code == 0, rendered.output
    assert "manifest.json: version " in rendered.output
    manifest = json.loads((data / "manifest.json").read_text(encoding="utf-8"))
    assert sorted(manifest["entries"]) == sorted(keys)


def test_export_static_render_defaults_requests_and_workers(
    tmp_path: Path, monkeypatch
) -> None:
    calls: list[tuple[Path, Path, int]] = []

    def fake_render(data: Path, requests: Path, *, workers: int, log: object) -> None:
        calls.append((data, requests, workers))

    monkeypatch.setattr("quviz.export.static_site.render", fake_render)
    monkeypatch.setattr("quviz.export.static_site.default_worker_count", lambda: 3)
    result = runner.invoke(app, ["export-static", "render", "--data", str(tmp_path)])
    assert result.exit_code == 0, result.output
    assert calls == [(tmp_path, tmp_path / "requests.json", 3)]


def test_export_static_render_failure_exits_non_zero_and_names_the_request(
    tmp_path: Path,
) -> None:
    data = tmp_path / "data"
    assert runner.invoke(app, ["export-static", "plan", "--out", str(data)]).exit_code == 0
    _write_requests(data / "requests.json", ["/api/orbitals/no-such-route"])

    result = runner.invoke(app, ["export-static", "render", "--data", str(data), "--workers", "1"])

    assert result.exit_code == 1
    assert "export-static render failed" in result.stderr
    assert "/api/orbitals/no-such-route" in result.stderr
    assert not (data / "manifest.json").exists()


def test_export_static_plan_failure_exits_non_zero(tmp_path: Path, monkeypatch) -> None:
    from quviz.export.static_site import StaticExportError

    def failing_plan(out: Path, *, log: object) -> None:
        raise StaticExportError("catalogue unavailable")

    monkeypatch.setattr("quviz.export.static_site.plan", failing_plan)
    result = runner.invoke(app, ["export-static", "plan", "--out", str(tmp_path)])
    assert result.exit_code == 1
    assert "export-static plan failed: catalogue unavailable" in result.stderr
```

- [ ] **Step 2: Run them and see them fail**

Run: `uv run --locked --no-sync pytest tests/test_cli.py -q`
Expected: the 5 new tests fail. Click reports `No such command 'export-static'` with exit code 2,
so `assert result.exit_code == 0` fails. The 5 existing tests pass.

- [ ] **Step 3: Implement** — append to `src/quviz/cli.py`:

```python
export_static_app = typer.Typer(
    no_args_is_help=True,
    help=(
        "Precompute the backend-free scene catalogue for the GitHub Pages site: `plan` writes "
        "the catalogues and spec.json, the web enumerator writes requests.json, `render` "
        "replays it."
    ),
)
app.add_typer(export_static_app, name="export-static")


@export_static_app.command("plan")
def export_static_plan(
    out: Annotated[
        Path, typer.Option("--out", help="Data directory for the catalogues and spec.json.")
    ],
) -> None:
    """Write both catalogue responses verbatim and spec.json into --out."""

    from quviz.export.static_site import StaticExportError, plan

    try:
        plan(out, log=typer.echo)
    except StaticExportError as error:
        typer.echo(f"export-static plan failed: {error}", err=True)
        raise typer.Exit(code=1) from error


@export_static_app.command("render")
def export_static_render(
    data: Annotated[Path, typer.Option("--data", help="Data directory written by `plan`.")],
    requests: Annotated[
        Path | None,
        typer.Option("--requests", help="requests.json to replay (default: DATA/requests.json)."),
    ] = None,
    workers: Annotated[
        int | None,
        typer.Option(
            "--workers",
            min=1,
            max=32,
            help="Worker processes (default: CPU count, at most 8).",
        ),
    ] = None,
) -> None:
    """Replay every request into DATA/files/ and DATA/manifest.json.

    A 5xx, a 404 or a transport failure exits with code 1, names the request
    and leaves no manifest. The full v1 specification is about 1.2k requests:
    an estimated 9-10 minutes in one process, 1.5-2 minutes with eight workers.
    """

    from quviz.export.static_site import (
        REQUESTS_FILE,
        StaticExportError,
        default_worker_count,
        render,
    )

    try:
        render(
            data,
            requests if requests is not None else data / REQUESTS_FILE,
            workers=workers if workers is not None else default_worker_count(),
            log=typer.echo,
        )
    except StaticExportError as error:
        typer.echo(f"export-static render failed: {error}", err=True)
        raise typer.Exit(code=1) from error
```

The imports are deferred on purpose: `quviz version` and `quviz serve` must not import the export
package, and the tests monkeypatch module attributes that are resolved at call time. The help text
uses round brackets because Typer's rich markup would read `[default: ...]` as a tag.

- [ ] **Step 4: Run them and see them pass**

Run: `uv run --locked --no-sync pytest tests/test_cli.py -q`
Expected: `10 passed`.

- [ ] **Step 5: Pre-commit gate and commit**

```
uv run --locked ruff format src/quviz/cli.py tests/test_cli.py
uv run --locked ruff check .
uv run --locked ruff format --check .
uv run --locked mypy
uv run --locked --group docs pytest --cov=quviz --cov-report=term-missing -q
git add src/quviz/cli.py tests/test_cli.py
git commit -m "feat(cli): add quviz export-static plan and render" -m "Claude-Session: https://claude.ai/code/session_01E44DEzsc7Av26fc7nZ5rSo"
```

---

### Task A6: Reference docs for `quviz.export`

**Files:**
- Modify: `tests/test_mkdocs_system.py:115-140` (the pinned `modules` set)
- Modify: `docs/reference/physics-api.md` (append a section after `::: quviz.solvers.grid`, the
  last line)
- Modify: `docs/reference/quality-gates.md` (insert one bullet after line 85, the last bullet of
  `## API 数值失败与缓存`)

**Interfaces:**
- Consumes: the modules from Tasks A1-A4.
- Produces: mkdocstrings sections with ids `quviz.export.catalog_spec`, `quviz.export.asgi` and
  `quviz.export.static_site`.

- [ ] **Step 1: Write the failing test.** In `tests/test_mkdocs_system.py`, inside
  `test_phase_zero_python_api_reference_covers_public_modules`, change the `modules` set so it
  reads:

```python
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
```

The test's intent is kept: the documented set must still equal an explicit, reviewed set.

- [ ] **Step 2: Run it and see it fail**

Run: `uv run --locked --no-sync --group docs pytest tests/test_mkdocs_system.py -q`
Expected: `test_phase_zero_python_api_reference_covers_public_modules` fails with
`AssertionError: assert {...} == {...}`, reporting the three `quviz.export.*` modules as missing on
the documented side.

- [ ] **Step 3: Implement.** Append to `docs/reference/physics-api.md`:

```markdown

## Static export

教材站（GitHub Pages）没有 Python 后端。`quviz export-static plan|render` 在构建时把前端将要发出的每个字面请求经进程内 ASGI 逐字回放成内容寻址文件与 `manifest.json`；请求键由前端自己的请求构造枚举，Python 不重新拼写查询串。

::: quviz.export.catalog_spec

::: quviz.export.asgi

::: quviz.export.static_site
```

Insert after line 85 of `docs/reference/quality-gates.md`, the bullet that begins
`- ✅ 两类 slice 只保留私有 builder LRU`:

```markdown
- ✅ 静态目录导出逐字节等于实时服务：进程内 ASGI 回放与 FastAPI `TestClient` 对点云（含 `X-QuViz-*` 头）、等值面、两种 422 与百分号编码的叠加态切片逐字节相同；响应体按 SHA-256 前 24 位去重命名，`manifest.json` 条目按键排序、`version` 为排序后 `(key, file, status)` 三元组摘要，单进程与进程池输出逐字节相同；5xx、404 或传输异常中止且不留下 manifest — `tests/test_export_asgi.py`、`tests/test_export_static_site.py`、`tests/test_cli.py`；
```

- [ ] **Step 4: Run it and see it pass; build the docs strictly**

```
uv run --locked --no-sync --group docs pytest tests/test_mkdocs_system.py tests/test_docs_integrity.py -q
uv run --locked --group docs mkdocs build --strict
```

Expected: all tests pass, and `mkdocs build --strict` exits 0 with no warnings. The
`site/reference/physics-api/index.html` it writes (gitignored) contains
`id="quviz.export.static_site"`.

- [ ] **Step 5: Pre-commit gate and commit**

```
uv run --locked ruff format tests/test_mkdocs_system.py
uv run --locked ruff check .
uv run --locked ruff format --check .
uv run --locked mypy
uv run --locked --group docs pytest --cov=quviz --cov-report=term-missing -q
git add tests/test_mkdocs_system.py docs/reference/physics-api.md docs/reference/quality-gates.md
git commit -m "docs(reference): document the static export modules and their gates" -m "Claude-Session: https://claude.ai/code/session_01E44DEzsc7Av26fc7nZ5rSo"
```

---

### Task A7: `RadialProfile` model and `radial_profile()` builder with numerical gates

**Files:**
- Modify: `src/quviz/scene/models.py`: add `from itertools import pairwise` to the imports
  (lines 3-8); insert `class RadialProfile` between `SliceDetail` (ends at line 152) and
  `OrbitalMetadata` (line 155).
- Modify: `src/quviz/scene/builders.py`:
  - imports: add `from functools import lru_cache` to lines 3-8, `radial_node_radii` to the
    `quviz.physics.hydrogenic` import (lines 29-36), and `RadialProfile` to the
    `quviz.scene.models` import (lines 47-57);
  - new code after `radial_extent_for_mass` (ends at line 297).
- Test: `tests/test_radial_profile.py` (create)

**Interfaces:**
- Consumes: `radial_wavefunction`, `radial_node_radii`, `hydrogenic_energy_hartree` and
  `validate_quantum_numbers` (`src/quviz/physics/hydrogenic.py:39-238`);
  `radial_extent_for_mass(n, l, z, *, a_mu=1.0, target_mass=0.9999, grid_size=32_769)`
  (`builders.py:272-297`).
- Produces (the contracts, "A produces (API contract change)"):
  - `class RadialProfile(BaseModel)` with fields `r_bohr: list[float]`, `radial_density:
    list[float]`, `nodes_bohr: list[float]`, `expectation_r_bohr: float`, `most_probable_r_bohr:
    float` and `energy_levels_hartree: list[float]`
  - `RADIAL_PROFILE_POINTS = 256`
  - `def radial_profile(n: int, l: int, *, z: float, a_mu: float = 1.0) -> RadialProfile | None`

- [ ] **Step 1: Write the failing test** — create `tests/test_radial_profile.py`:

```python
"""Numerical gates for the published radial distribution ``P(r) = r^2 |R_nl|^2``.

Every expected value comes from an independent route, never from the builder
under test: closed-form Laguerre roots, the analytic incomplete-gamma radial
tail in :mod:`quviz.physics.finite_box`, direct evaluations of ``R_nl`` for the
sign changes, and textbook maxima of ``P(r)``.
"""

from __future__ import annotations

from math import sqrt
from typing import Any

import numpy as np
import pytest
from pydantic import ValidationError

from quviz.physics.finite_box import _component_radial_tail
from quviz.physics.hydrogenic import (
    hydrogenic_energy_hartree,
    radial_node_radii,
    radial_wavefunction,
)
from quviz.scene.builders import RADIAL_PROFILE_POINTS, radial_profile
from quviz.scene.models import RadialProfile

STATES_N_LE_4 = [(n, l) for n in range(1, 5) for l in range(n)]


def _profile(n: int, l: int, *, z: float = 1.0, a_mu: float = 1.0) -> RadialProfile:
    profile = radial_profile(n, l, z=z, a_mu=a_mu)
    assert profile is not None
    return profile


@pytest.mark.parametrize(("n", "l"), STATES_N_LE_4)
def test_grid_starts_at_the_nucleus_ascends_and_covers_the_radial_mass(n: int, l: int) -> None:
    profile = _profile(n, l)
    radius = np.asarray(profile.r_bohr)
    assert radius.size == RADIAL_PROFILE_POINTS == 256
    assert radius[0] == 0.0
    assert np.all(np.diff(radius) > 0.0)
    assert _component_radial_tail(n, l, 1.0, 1.0, float(radius[-1])) <= 1e-3


@pytest.mark.parametrize(("n", "l"), STATES_N_LE_4)
def test_trapezoid_normalisation_is_within_one_part_per_thousand(n: int, l: int) -> None:
    profile = _profile(n, l)
    assert abs(float(np.trapezoid(profile.radial_density, profile.r_bohr)) - 1.0) <= 1e-3


@pytest.mark.parametrize(("n", "l"), STATES_N_LE_4)
def test_node_count_and_sign_changes_match_the_radial_function(n: int, l: int) -> None:
    profile = _profile(n, l)
    assert len(profile.nodes_bohr) == n - l - 1
    for node in profile.nodes_bohr:
        left, right = radial_wavefunction(n, l, [node * (1 - 1e-6), node * (1 + 1e-6)])
        assert left * right < 0.0, node
    samples = radial_wavefunction(n, l, np.asarray(profile.r_bohr[1:]))
    assert int(np.sum(np.sign(samples[1:]) * np.sign(samples[:-1]) < 0)) == n - l - 1


@pytest.mark.parametrize(
    ("n", "l", "closed_form"),
    [
        (2, 0, (2.0,)),
        (3, 0, ((9.0 - 3.0 * sqrt(3.0)) / 2.0, (9.0 + 3.0 * sqrt(3.0)) / 2.0)),
        (3, 1, (6.0,)),
    ],
)
def test_node_radii_equal_the_closed_form_laguerre_roots(
    n: int, l: int, closed_form: tuple[float, ...]
) -> None:
    np.testing.assert_allclose(_profile(n, l).nodes_bohr, closed_form, rtol=1e-12)


@pytest.mark.parametrize(("n", "l"), STATES_N_LE_4)
def test_expectation_radius_is_analytic_and_agrees_with_quadrature(n: int, l: int) -> None:
    profile = _profile(n, l)
    analytic = 0.5 * (3 * n * n - l * (l + 1))
    assert profile.expectation_r_bohr == pytest.approx(analytic, rel=1e-15)
    radius = np.asarray(profile.r_bohr)
    quadrature = float(np.trapezoid(radius * np.asarray(profile.radial_density), radius))
    # The grid stops once >= 99.9 % of the radial mass is inside, so the missing
    # tail makes the quadrature low by a few parts per thousand at most
    # (measured worst case 2.7e-3, for 1s).
    assert quadrature == pytest.approx(analytic, rel=5e-3)


@pytest.mark.parametrize(
    ("n", "l", "maximum"),
    [(1, 0, 1.0), (2, 1, 4.0), (3, 2, 9.0), (4, 3, 16.0), (2, 0, 3.0 + sqrt(5.0))],
)
def test_most_probable_radius_matches_textbook_maxima(n: int, l: int, maximum: float) -> None:
    assert _profile(n, l).most_probable_r_bohr == pytest.approx(maximum, rel=1e-8)


def test_lengths_scale_by_a_mu_over_z_and_the_density_by_its_inverse() -> None:
    base = _profile(2, 1)
    scaled = _profile(2, 1, z=2.0, a_mu=0.5)
    np.testing.assert_array_equal(np.asarray(scaled.r_bohr), np.asarray(base.r_bohr) * 0.25)
    # Both sides are rounded to 9 significant digits independently, so they may
    # differ by up to two half-units in the ninth digit (1e-8 relative).
    np.testing.assert_allclose(
        scaled.radial_density, np.asarray(base.radial_density) * 4.0, rtol=2e-8
    )
    assert scaled.most_probable_r_bohr == pytest.approx(1.0, rel=1e-8)
    assert scaled.expectation_r_bohr == pytest.approx(1.25, rel=1e-15)
    for n, l in ((2, 0), (3, 0), (4, 1)):
        np.testing.assert_allclose(
            _profile(n, l, z=2.0, a_mu=0.5).nodes_bohr,
            radial_node_radii(n, l, z=2.0, a_mu=0.5),
            rtol=1e-14,
        )


@pytest.mark.parametrize(("n", "levels"), [(1, 5), (2, 5), (3, 5), (4, 6)])
def test_energy_ladder_uses_the_metadata_reduced_mass_convention(n: int, levels: int) -> None:
    profile = _profile(n, 0, z=2.0, a_mu=0.5)
    expected = [
        hydrogenic_energy_hartree(k, z=2.0, reduced_mass_ratio=2.0) for k in range(1, levels + 1)
    ]
    assert profile.energy_levels_hartree == expected
    assert expected[0] == pytest.approx(-4.0)


def test_a_scale_that_leaves_float64_yields_no_profile() -> None:
    assert radial_profile(1, 0, z=1e-310) is None
    assert radial_profile(1, 0, z=1.0, a_mu=1e-310) is None


def test_invalid_inputs_are_rejected() -> None:
    with pytest.raises(ValueError, match="l must be"):
        radial_profile(2, 2, z=1.0)
    with pytest.raises(ValueError, match="z must be positive"):
        radial_profile(1, 0, z=0.0)
    with pytest.raises(ValueError, match="a_mu must be positive"):
        radial_profile(1, 0, z=1.0, a_mu=float("nan"))


def test_a_profile_serialises_to_a_few_kilobytes() -> None:
    assert len(_profile(4, 0).model_dump_json()) < 8_000


VALID_PROFILE: dict[str, Any] = {
    "r_bohr": [0.0, 1.0, 2.0],
    "radial_density": [0.0, 0.5, 0.1],
    "nodes_bohr": [1.5],
    "expectation_r_bohr": 1.2,
    "most_probable_r_bohr": 1.0,
    "energy_levels_hartree": [-0.5, -0.125],
}


def test_a_well_formed_profile_validates() -> None:
    assert RadialProfile.model_validate(VALID_PROFILE).nodes_bohr == [1.5]


@pytest.mark.parametrize(
    ("change", "message"),
    [
        ({"r_bohr": [0.0]}, "at least two radii"),
        ({"radial_density": [0.0, 0.5]}, "one value per radius"),
        ({"r_bohr": [0.5, 1.0, 2.0]}, "start at the nucleus"),
        ({"r_bohr": [0.0, 2.0, 1.0]}, "r_bohr must be strictly ascending"),
        ({"radial_density": [0.0, -0.5, 0.1]}, "cannot be negative"),
        ({"radial_density": [0.0, float("inf"), 0.1]}, "only finite numbers"),
        ({"nodes_bohr": [1.5, 1.0]}, "nodes_bohr must be strictly ascending"),
        ({"nodes_bohr": [2.5]}, "inside the sampled range"),
        ({"energy_levels_hartree": [-0.125, -0.5]}, "rise toward the ionization limit"),
        ({"energy_levels_hartree": []}, "at least 1 item"),
        ({"expectation_r_bohr": 0.0}, "greater than 0"),
        ({"unexpected": 1}, "Extra inputs are not permitted"),
    ],
)
def test_radial_profile_model_rejects_malformed_profiles(
    change: dict[str, Any], message: str
) -> None:
    with pytest.raises(ValidationError, match=message):
        RadialProfile.model_validate({**VALID_PROFILE, **change})
```

- [ ] **Step 2: Run it and see it fail**

Run: `uv run --locked --no-sync pytest tests/test_radial_profile.py -q`
Expected: a collection error, `ImportError: cannot import name 'RADIAL_PROFILE_POINTS' from
'quviz.scene.builders'`.

- [ ] **Step 3: Implement.** In `src/quviz/scene/models.py`, add `from itertools import pairwise`
  after `from collections.abc import Mapping`. Insert this class immediately before
  `class OrbitalMetadata`:

```python
class RadialProfile(BaseModel):
    """Radial probability distribution ``P(r) = r^2 |R_nl(r)|^2`` of one eigenstate.

    Computed in Python from the analytic hydrogenic radial function with the
    same ``Z`` and ``a_mu`` as the metadata it is attached to; the browser only
    draws it. ``radial_density`` integrates to one over ``[0, inf)``; the
    sampled range stops once at least 99.9 % of that mass is inside.
    """

    model_config = ConfigDict(extra="forbid", frozen=True)

    r_bohr: list[float] = Field(
        description=(
            "Ascending radii in bohr, r_bohr[0] == 0; the last radius encloses at least "
            "99.9% of the radial probability. Denser near the nucleus (quadratic spacing)."
        )
    )
    radial_density: list[float] = Field(
        description="P(r) = r^2 |R_nl(r)|^2 in bohr^-1 at each radius, 9 significant digits."
    )
    nodes_bohr: list[float] = Field(
        description="The n - l - 1 radial node radii in bohr (Laguerre roots), ascending."
    )
    expectation_r_bohr: float = Field(
        gt=0.0, description="<r> = (a_mu / (2 Z)) [3 n^2 - l (l + 1)] in bohr, analytic."
    )
    most_probable_r_bohr: float = Field(
        gt=0.0, description="Radius of the global maximum of P(r) in bohr, grid-refined."
    )
    energy_levels_hartree: list[float] = Field(
        min_length=1,
        description=(
            "E_k = -(Z^2 / a_mu) / (2 k^2) in hartree for k = 1 .. max(n + 2, 5), the same "
            "reduced-mass convention as energy_hartree."
        ),
    )

    @model_validator(mode="after")
    def validate_profile(self) -> Self:
        radius, density = self.r_bohr, self.radial_density
        if len(radius) < 2:
            raise ValueError("r_bohr must hold at least two radii")
        if len(density) != len(radius):
            raise ValueError(
                f"radial_density must have one value per radius, got {len(density)} "
                f"for {len(radius)} radii"
            )
        if radius[0] != 0.0:
            raise ValueError("r_bohr must start at the nucleus, r = 0")
        values = [
            *radius,
            *density,
            *self.nodes_bohr,
            *self.energy_levels_hartree,
            self.expectation_r_bohr,
            self.most_probable_r_bohr,
        ]
        if not all(isfinite(value) for value in values):
            raise ValueError("a radial profile must contain only finite numbers")
        if any(later <= earlier for earlier, later in pairwise(radius)):
            raise ValueError("r_bohr must be strictly ascending")
        if any(value < 0.0 for value in density):
            raise ValueError("radial_density is a probability density and cannot be negative")
        if any(later <= earlier for earlier, later in pairwise(self.nodes_bohr)):
            raise ValueError("nodes_bohr must be strictly ascending")
        if any(not 0.0 < node < radius[-1] for node in self.nodes_bohr):
            raise ValueError("every radial node must lie inside the sampled range")
        if any(later < earlier for earlier, later in pairwise(self.energy_levels_hartree)):
            raise ValueError("energy_levels_hartree must rise toward the ionization limit")
        return self
```

In `src/quviz/scene/builders.py`, make these import changes:
- add `from functools import lru_cache` after `from dataclasses import dataclass`;
- add `radial_node_radii,` to the `from quviz.physics.hydrogenic import (...)` list, in
  alphabetical position after `orbital_label,`;
- add `RadialProfile,` to the `from quviz.scene.models import (...)` list after
  `QuantumStateSpec,`.

Then insert after `radial_extent_for_mass`, which ends with the `raise ScientificComputationError(...)`
at line 295-297:

```python
#: Samples in every published radial profile: about 6 kB of JSON, and enough to
#: resolve the innermost lobe of every n <= 12 state on the quadratic grid.
RADIAL_PROFILE_POINTS = 256
_RADIAL_PROFILE_MASS = 0.999
_RADIAL_PROFILE_REFINEMENT_POINTS = 2_049
_RADIAL_PROFILE_DENSITY_DIGITS = 9
_RADIAL_PROFILE_SCALE_TOLERANCE = 1e-6
_RADIAL_PROFILE_MINIMUM_LEVELS = 5
_RADIAL_PROFILE_LEVELS_ABOVE_STATE = 2


@dataclass(frozen=True, slots=True)
class _DimensionlessRadialProfile:
    radius: tuple[float, ...]
    density: tuple[float, ...]
    nodes: tuple[float, ...]
    most_probable: float
    integral: float


def _radial_probability(n: int, l: int, radius: np.ndarray) -> np.ndarray:
    radial = radial_wavefunction(n, l, radius)
    return np.asarray(radius * radius * radial * radial, dtype=np.float64)


@lru_cache(maxsize=256)
def _dimensionless_radial_profile(n: int, l: int) -> _DimensionlessRadialProfile:
    """``P(r)`` at ``Z = a_mu = 1`` on ``r = r_max s^2``, ``s`` uniform in ``[0, 1]``.

    Quadratic spacing puts the finest samples at the nucleus, where excited s
    states keep their narrow inner lobes. Radii are rounded to six decimals
    before ``P`` is evaluated on them, so every published pair is consistent
    and platform last-digit noise in ``r_max`` cannot reach the payload. The
    maximum is refined on a 2049-point sub-grid around the coarse argmax, then
    by the vertex of the parabola through its three best samples.
    """

    r_max = radial_extent_for_mass(n, l, 1.0, target_mass=_RADIAL_PROFILE_MASS)
    fraction = np.linspace(0.0, 1.0, RADIAL_PROFILE_POINTS, dtype=np.float64)
    radius = np.round(r_max * fraction * fraction, _PAYLOAD_DIMENSIONLESS_DECIMALS)
    density = _radial_probability(n, l, radius)
    peak = int(np.argmax(density))
    lower = float(radius[max(peak - 1, 0)])
    upper = float(radius[min(peak + 1, RADIAL_PROFILE_POINTS - 1)])
    fine = np.linspace(lower, upper, _RADIAL_PROFILE_REFINEMENT_POINTS, dtype=np.float64)
    fine_density = _radial_probability(n, l, fine)
    index = min(max(int(np.argmax(fine_density)), 1), _RADIAL_PROFILE_REFINEMENT_POINTS - 2)
    left = float(fine_density[index - 1])
    centre = float(fine_density[index])
    right = float(fine_density[index + 1])
    curvature = left - 2.0 * centre + right
    step = float(fine[1] - fine[0])
    offset = 0.0 if curvature == 0.0 else 0.5 * step * (left - right) / curvature
    return _DimensionlessRadialProfile(
        radius=tuple(float(value) for value in radius),
        density=tuple(float(value) for value in density),
        nodes=tuple(float(value) for value in radial_node_radii(n, l)),
        most_probable=float(fine[index]) + offset,
        integral=float(np.trapezoid(density, radius)),
    )


def radial_profile(n: int, l: int, *, z: float, a_mu: float = 1.0) -> RadialProfile | None:
    """Return the radial distribution ``P(r) = r^2 |R_nl(r)|^2`` of one hydrogenic state.

    The profile is computed once per ``(n, l)`` at ``Z = a_mu = 1`` and rescaled
    exactly: lengths by ``a_mu / Z`` and ``P`` by its reciprocal, so no charge
    or reduced mass can push the Laguerre evaluation onto its overflow path.
    ``<r>`` is the analytic ``(a_mu / 2Z)[3n^2 - l(l + 1)]``; the energy ladder
    uses the same reduced-mass convention as :func:`orbital_metadata`.

    ``None`` means the rescaled numbers themselves leave float64 (for example
    ``Z = 1e-310``): the caller must say so rather than publish a profile whose
    density underflowed or whose radii overflowed.
    """

    validate_quantum_numbers(n, l, 0)
    if z <= 0.0 or not np.isfinite(z):
        raise ValueError("z must be positive and finite")
    if a_mu <= 0.0 or not np.isfinite(a_mu):
        raise ValueError("a_mu must be positive and finite")
    base = _dimensionless_radial_profile(n, l)
    scale = a_mu / z
    with np.errstate(over="ignore", under="ignore", invalid="ignore", divide="ignore"):
        radius = np.asarray(base.radius, dtype=np.float64) * scale
        density = np.asarray(base.density, dtype=np.float64) / scale
        nodes = np.asarray(base.nodes, dtype=np.float64) * scale
    expectation = scale * 0.5 * (3 * n * n - l * (l + 1))
    most_probable = scale * base.most_probable
    if not (
        bool(np.all(np.isfinite(radius)))
        and bool(np.all(np.diff(radius) > 0.0))
        and bool(np.all(np.isfinite(density)))
        and bool(np.all(np.isfinite(nodes)))
        and all(np.isfinite(value) and value > 0.0 for value in (expectation, most_probable))
    ):
        return None
    published_density = [
        float(format(float(value), f".{_RADIAL_PROFILE_DENSITY_DIGITS}g")) for value in density
    ]
    integral = float(np.trapezoid(published_density, radius))
    if not abs(integral - base.integral) <= _RADIAL_PROFILE_SCALE_TOLERANCE * base.integral:
        return None
    level_count = max(n + _RADIAL_PROFILE_LEVELS_ABOVE_STATE, _RADIAL_PROFILE_MINIMUM_LEVELS)
    return RadialProfile(
        r_bohr=radius.tolist(),
        radial_density=published_density,
        nodes_bohr=nodes.tolist(),
        expectation_r_bohr=expectation,
        most_probable_r_bohr=most_probable,
        energy_levels_hartree=[
            hydrogenic_energy_hartree(k, z=z, reduced_mass_ratio=1.0 / a_mu)
            for k in range(1, level_count + 1)
        ],
    )
```

- [ ] **Step 4: Run it and see it pass**

Run: `uv run --locked --no-sync pytest tests/test_radial_profile.py tests/test_scene_contract.py -q`
Expected: `69 passed` in `test_radial_profile.py`, and `test_scene_contract.py` unchanged and
green (nothing attaches the profile yet).

A read-only prototype of this algorithm on 2026-09-25 gave these numbers:
- worst `|trapz - 1|` over all 78 (n, l) states with n ≤ 12: 6.24e-4;
- correct sign-change count for every state;
- `<r>` quadrature low by at most 2.69e-3;
- 1s, 2p and 3d maxima within 5e-10 of 1, 4 and 9;
- 5.9 kB of JSON for 4s;
- 1.5 ms per profile.

- [ ] **Step 5: Pre-commit gate and commit**

```
uv run --locked ruff format src/quviz/scene/models.py src/quviz/scene/builders.py tests/test_radial_profile.py
uv run --locked ruff check .
uv run --locked ruff format --check .
uv run --locked mypy
uv run --locked --group docs pytest --cov=quviz --cov-report=term-missing -q
git add src/quviz/scene/models.py src/quviz/scene/builders.py tests/test_radial_profile.py
git commit -m "feat(scene): compute the radial distribution P(r) with numerical gates" -m "Claude-Session: https://claude.ai/code/session_01E44DEzsc7Av26fc7nZ5rSo"
```

---

### Task A8: Attach `radial_profile` to every eigenstate `OrbitalMetadata` and refresh the contract chain

**Files:**
- Modify: `src/quviz/scene/models.py`, `OrbitalMetadata` (currently lines 155-172, shifted down by
  Task A7): add the field after `warnings`.
- Modify: `src/quviz/scene/builders.py`, `orbital_metadata` (lines 201-269, before Task A7's
  insertion): build `QuantumStateSpec` first, attach the profile, copy the caller's warnings.
- Regenerate: `tests/fixtures/openapi.json` (`uv run --locked python scripts/write_openapi.py`),
  `web/src/api/schema.gen.ts` (`npm --prefix web run codegen`), `tests/fixtures/slice_golden.json`
  (`uv run --locked python scripts/write_slice_golden.py`) and `tests/fixtures/visual/*.json`
  (`uv run --locked python scripts/write_visual_fixtures.py`; only `2pz-real-xz.json` and
  `2p+1-phase-xy.json` change).
- Verify unchanged: `docs/reference/http-schema.md`. `scripts/render_openapi_reference.py:91-133`
  renders only query parameters and 200 media types, not response schemas, so a response field
  cannot change it.
- Modify: `web/src/api/types.ts`: add a `RadialProfile` alias and `OrbitalMetadata.radial_profile`
  (lines 44-58).
- Modify: `docs/reference/api.md:19` and `docs/reference/quality-gates.md`: insert after line 30,
  the last bullet of `## 解析态`.
- Test: `tests/test_radial_profile.py` (append).

**Interfaces:**
- Consumes: `radial_profile()` and `RadialProfile` (Task A7). The call sites of `orbital_metadata()`
  are `routes.py:128` (`/api/orbitals/metadata`), `builders.py:712` (`build_isosurface`),
  `builders.py:1017` (`build_current_field`) and `slices.py:397` (`build_slice`). This is the only
  constructor of `OrbitalMetadata` in `src/` (`builders.py:252`).
- Produces:
  - `OrbitalMetadata.radial_profile: RadialProfile | None = None`. In OpenAPI it is `anyOf
    [RadialProfile, null]` with default null; in TS, `radial_profile?:
    components["schemas"]["RadialProfile"] | null`.
  - `web/src/api/types.ts`: `export type RadialProfile = components['schemas']['RadialProfile']`
    and `OrbitalMetadata.radial_profile?: RadialProfile | null`.

- [ ] **Step 1: Write the failing tests.** Append to `tests/test_radial_profile.py`, and add these
  imports to the file's import block in isort order:
  - `from fastapi.testclient import TestClient`
  - `from quviz.api.app import create_app`
  - `from quviz.conventions import BasisKind, ObservableKind, PrincipalPlane, RepresentationKind,
    SliceObservable`
  - `build_isosurface` and `orbital_metadata` added to the existing `quviz.scene.builders` import
  - `from quviz.scene.slices import build_slice`

```python
client = TestClient(create_app(mount_frontend=False))


def test_metadata_route_publishes_the_profile_of_the_requested_state() -> None:
    response = client.get(
        "/api/orbitals/metadata", params={"n": 3, "l": 1, "m": 0, "z": 2, "basis": "real"}
    )
    assert response.status_code == 200
    payload = response.json()
    profile = payload["radial_profile"]
    assert len(profile["r_bohr"]) == len(profile["radial_density"]) == 256
    assert profile["nodes_bohr"] == pytest.approx([3.0], rel=1e-12)  # 6 a / Z with Z = 2
    assert profile["expectation_r_bohr"] == pytest.approx(6.25, rel=1e-15)
    assert profile["energy_levels_hartree"][2] == payload["energy_hartree"]
    assert len(response.content) < 12_000


def test_every_eigenstate_payload_carries_the_profile_of_its_own_state() -> None:
    surface = build_isosurface(1, 0, 0, resolution=49, probability_mass=0.8)
    assert surface.metadata.radial_profile == radial_profile(1, 0, z=1.0)

    section = build_slice(
        2,
        1,
        0,
        a_mu=0.5,
        plane=PrincipalPlane.XZ,
        observable=SliceObservable.PROBABILITY_DENSITY,
        resolution=65,
    )
    assert section.metadata.radial_profile is not None
    assert section.metadata.radial_profile.most_probable_r_bohr == pytest.approx(2.0, rel=1e-8)

    flow = client.get(
        "/api/orbitals/current-field",
        params={"n": 2, "l": 1, "m": 1, "basis": "complex", "seed_count": 4},
    )
    assert flow.status_code == 200
    assert flow.json()["metadata"]["radial_profile"]["nodes_bohr"] == []


def test_an_unrepresentable_scale_publishes_null_and_says_why() -> None:
    response = client.get("/api/orbitals/metadata", params={"n": 1, "l": 0, "m": 0, "z": 1e-310})
    assert response.status_code == 200
    payload = response.json()
    assert payload["radial_profile"] is None
    assert any(warning.startswith("radial_profile omitted") for warning in payload["warnings"])


def test_caller_warnings_are_copied_not_mutated() -> None:
    notes = ["caller note"]
    metadata = orbital_metadata(
        1,
        0,
        0,
        z=1e-310,
        basis=BasisKind.REAL,
        observable=ObservableKind.PROBABILITY_DENSITY,
        representation=RepresentationKind.POINT_CLOUD,
        warnings=notes,
    )
    assert notes == ["caller note"]
    assert metadata.warnings[0] == "caller note"
    assert len(metadata.warnings) == 2
```

- [ ] **Step 2: Run them and see them fail**

Run: `uv run --locked --no-sync pytest tests/test_radial_profile.py -q`
Expected: the 4 new tests fail. The route test raises `KeyError: 'radial_profile'`; the builder
test raises `AttributeError: 'OrbitalMetadata' object has no attribute 'radial_profile'`; the
unrepresentable-scale test raises `KeyError: 'radial_profile'`; the warning-copy test fails
`len(metadata.warnings) == 2`, because nothing is appended yet.

- [ ] **Step 3: Implement.** In `src/quviz/scene/models.py`, add this field to `OrbitalMetadata`
  directly after `warnings: list[str] = Field(default_factory=list)`:

```python
    radial_profile: RadialProfile | None = Field(
        default=None,
        description=(
            "Radial distribution P(r) of this eigenstate, computed from the analytic R_nl with "
            "the same Z and a_mu; null only when those scales cannot represent it in float64, "
            "in which case a warning says so."
        ),
    )
```

In `src/quviz/scene/builders.py`, replace the body of `orbital_metadata` from
`basis_kind = BasisKind(basis)` to the end of the function with:

```python
    basis_kind = BasisKind(basis)
    validate_quantum_numbers(n, l, m)
    _validate_slice_detail(representation, slice_detail)
    state = QuantumStateSpec(n=n, l=l, m=m, z=z, a_mu=a_mu, basis=basis_kind)
    # One branch per representation. A default that silently reuses another
    # asset's wording makes the Scene Contract describe a picture that is not
    # on screen, which is worse than having no description at all.
    geometry_by_representation = {
        RepresentationKind.POINT_CLOUD: (
            "independent samples from |psi|^2 dV; marker weight is uniform"
        ),
        RepresentationKind.ISOSURFACE: "level set of probability density |psi|^2",
        RepresentationKind.STREAMLINES: (
            "streamlines of probability flow v = j / rho, sampled at equal arc length; "
            "these are flow lines, not electron trajectories"
        ),
        # Reached only if the slice guard above is ever loosened: a slice with a
        # SliceDetail names its plane and field instead of this generic wording.
        RepresentationKind.SLICE: "plane section of the scalar field",
    }
    if slice_detail is not None:
        # Guaranteed by _validate_slice_detail to be exactly the slice case, so
        # the generic wording below never overwrites a named plane.
        geometry_semantics, color_semantics = _slice_semantics(slice_detail)
    else:
        geometry_semantics = geometry_by_representation[representation]
        if representation is RepresentationKind.STREAMLINES:
            color_semantics = "flow speed |j|/rho normalized to the reported maximum"
        elif basis_kind is BasisKind.REAL:
            color_semantics = "wavefunction sign encoded as phase 0 or pi"
        else:
            color_semantics = "principal wavefunction phase in [-pi, pi]"
    # Every eigenstate asset carries its own P(r), so a detail panel never has
    # to fetch a second payload to chart the state it is already showing.
    profile = radial_profile(n, l, z=state.z, a_mu=state.a_mu)
    notes = list(warnings or [])
    if profile is None:
        notes.append(
            f"radial_profile omitted: the a_mu/Z length scale {state.a_mu / state.z:.6g} bohr "
            "cannot carry P(r) in float64 without overflow or underflow"
        )
    return OrbitalMetadata(
        state=state,
        label=orbital_label(n, l, m, basis=basis_kind),
        energy_hartree=hydrogenic_energy_hartree(n, z=z, reduced_mass_ratio=1.0 / a_mu),
        observable=observable,
        representation=representation,
        coordinate_convention=ANGLE_CONVENTION,
        spherical_harmonic_convention=SPHERICAL_HARMONIC_CONVENTION,
        geometry_semantics=geometry_semantics,
        color_semantics=color_semantics,
        references=[
            "dlmf-spherical-harmonics",
            "dlmf-laguerre",
            "scipy-sph-harm-y",
            "solara-hydrogen-derivation",
        ],
        warnings=notes,
        radial_profile=profile,
    )
```

This ordering matches today's error behaviour: `QuantumStateSpec` was already the first keyword
argument evaluated, so out-of-range `z` and `a_mu` still raise the same `ValidationError` before any
new code runs.

- [ ] **Step 4: Run the new tests and see them pass, then see the contract gates fail**

```
uv run --locked --no-sync pytest tests/test_radial_profile.py -q
uv run --locked --no-sync pytest tests/test_openapi_contract.py tests/test_slice_contract.py tests/test_visual_fixtures.py -q
```

Expected:
- `tests/test_radial_profile.py`: `73 passed`.
- `tests/test_openapi_contract.py`: `test_committed_openapi_fixture_is_the_live_schema_byte_for_byte`
  fails because the live schema now has `RadialProfile`.
- `tests/test_slice_contract.py`: `test_the_builder_reproduces_the_committed_slice_golden_bytes`
  fails.
- `tests/test_visual_fixtures.py`: the structural key-set comparison fails for `2pz-real-xz` and
  `2p+1-phase-xy` (a new `metadata.radial_profile` key). This is the intended API change.

- [ ] **Step 5: Regenerate the contract chain and the fixtures**

```
uv run --locked python scripts/write_openapi.py
uv run --locked python scripts/write_slice_golden.py
uv run --locked python scripts/write_visual_fixtures.py
npm --prefix web run codegen
uv run --locked --group docs python scripts/render_openapi_reference.py --check
git diff --stat
```

Expected:
- `render_openapi_reference.py --check` prints `docs/reference/http-schema.md is current`.
- `git diff --stat` lists exactly `tests/fixtures/openapi.json`, `tests/fixtures/slice_golden.json`,
  `tests/fixtures/visual/2pz-real-xz.json`, `tests/fixtures/visual/2p+1-phase-xy.json`,
  `web/src/api/schema.gen.ts`, and the two source files and the test file. The other six visual
  fixtures must not change: the Windows regeneration reproduces them byte for byte.
- Read the `schema.gen.ts` diff. It must add a `RadialProfile` schema with the six fields and
  `radial_profile?: components["schemas"]["RadialProfile"] | null;` in `OrbitalMetadata`, and
  nothing else.

- [ ] **Step 6: Update the hand-written TS type.** In `web/src/api/types.ts`, add
  `radial_profile?: RadialProfile | null` as the last member of `interface OrbitalMetadata`
  (after `warnings: string[]`), with this doc comment:

```ts
  /**
   * Radial distribution of this eigenstate, computed by Python and only drawn
   * here. `null` when the server could not represent it at the requested a_mu/Z
   * scale (a warning says so); optional so fixtures built before the field
   * existed still type-check.
   */
  radial_profile?: RadialProfile | null
```

Then append at the end of the file, after the slice aliases:

```ts
/**
 * `P(r) = r^2 |R_nl(r)|^2` on 256 radii, with the radial nodes, <r>, the most
 * probable radius and the energy ladder -- RE-EXPORTED from the generated
 * schema for the reason given above: an alias cannot drift from the API.
 */
export type RadialProfile = components['schemas']['RadialProfile']
```

- [ ] **Step 7: Document the field.** In `docs/reference/api.md`, replace line 19,
  `返回 Scene metadata，不生成大数组。`, with the following paragraph. Write it as one physical line
  like the rest of `api.md`: a line break inside a Chinese paragraph renders as a stray space.

```markdown
返回 Scene metadata，不生成大数组。其中 `radial_profile` 是该本征态的径向分布：`r_bohr` 为 256 个递增半径（从 $r=0$ 起，靠近原子核处更密，末点外的径向概率不超过 $10^{-3}$），`radial_density` 为 $P(r)=r^2|R_{n\ell}(r)|^2$（单位 bohr⁻¹，9 位有效数字），`nodes_bohr` 为 $n-\ell-1$ 个 Laguerre 根径向节点，`expectation_r_bohr` 为解析值 $\langle r\rangle=\tfrac{a_\mu}{2Z}[3n^2-\ell(\ell+1)]$，`most_probable_r_bohr` 为 $P(r)$ 全局极大（网格内细化），`energy_levels_hartree` 为 $k=1,\dots,\max(n+2,5)$ 的 $E_k$，与 `energy_hartree` 同一约化质量约定。它在 $Z=a_\mu=1$ 下计算一次，再按 $a_\mu/Z$ 精确缩放；缩放后的数字超出 float64 时为 `null`，并在 `warnings` 中说明。同一块也随等值面、流线与切片 payload 的本征态 metadata 一起下发。
```

In `docs/reference/quality-gates.md`, insert after line 30 (the bullet beginning
`- ✅ Condon–Shortley 相位与实轨道 Cartesian 形式`):

```markdown
- ✅ 径向分布 `radial_profile`：256 点梯形积分与 1 相差不超过 $10^{-3}$，末点外解析尾概率不超过 $10^{-3}$，节点数为 $n-\ell-1$ 且 2s/3s/3p 节点等于闭式根、每个节点两侧 $R_{n\ell}$ 变号，$\langle r\rangle$ 为解析值且与数值积分相差小于 0.5%，1s/2p/3d/4f/2s 的最可几半径分别对照 $a/Z$、$4a/Z$、$9a/Z$、$16a/Z$、$(3+\sqrt5)a/Z$，能级梯与 metadata 同一约化质量约定，$a_\mu/Z$ 缩放逐位协变；缩放溢出时为 `null` 并附 warning — `tests/test_radial_profile.py`；
```

- [ ] **Step 8: Run the affected suites and see them pass**

```
uv run --locked --no-sync pytest tests/test_radial_profile.py tests/test_openapi_contract.py tests/test_openapi_reference.py tests/test_slice_contract.py tests/test_visual_fixtures.py tests/test_scene_contract.py tests/test_api.py tests/test_docs_integrity.py -q
(cd web && npm exec --no -- vitest run src/api/schema.gen.test.ts)
npm --prefix web run typecheck
uv run --locked --group docs mkdocs build --strict
```

Expected: all green. `schema.gen.test.ts` gives 4 passed under `web/vitest.config.ts`, because the
committed file equals the regenerated one. `typecheck` exits 0, and `mkdocs build --strict` exits 0.

- [ ] **Step 9: Pre-commit gate and commit**

```
uv run --locked ruff format src/quviz/scene/models.py src/quviz/scene/builders.py tests/test_radial_profile.py
uv run --locked ruff check .
uv run --locked ruff format --check .
uv run --locked mypy
uv run --locked --group docs pytest --cov=quviz --cov-report=term-missing -q
npm --prefix web run test
npm --prefix web run typecheck
git add src/quviz/scene/models.py src/quviz/scene/builders.py tests/test_radial_profile.py tests/fixtures/openapi.json tests/fixtures/slice_golden.json tests/fixtures/visual/2pz-real-xz.json "tests/fixtures/visual/2p+1-phase-xy.json" web/src/api/schema.gen.ts web/src/api/types.ts docs/reference/api.md docs/reference/quality-gates.md
git commit -m "feat(api): publish radial_profile in every eigenstate metadata" -m "Claude-Session: https://claude.ai/code/session_01E44DEzsc7Av26fc7nZ5rSo"
```

---

### Task A9: Reproduce the 2s-2pz default-view 422 and find its root cause

**Files:**
- Test: `tests/test_superposition_default_view.py` (create)
- Investigation scratch (not committed): `build/probes/probe_2s2pz.py`. `build/` is gitignored.

**Interfaces:**
- Consumes: `GET /api/superposition/isosurface` (`routes.py:622-674`);
  `estimate_superposition_isosurface_workload` (`builders.py:1151-1239`), which schedules
  `(129, 137)` for any multi-term state with an excited-s component; the finest-two gate
  `_general_meshes_have_stable_topology` (`builders.py:485-497`), applied in
  `build_superposition_isosurface` (`builders.py:1318-1352`); `ALWAYS_AVAILABLE.superposition =
  'isosurface'` (`web/src/state/useSceneStore.ts:185-188`).
- Produces: a committed reproduction that pins the fail-closed gate. The decision it records is
  implemented in Task A10.

- [ ] **Step 1: Write the reproduction test** — create `tests/test_superposition_default_view.py`:

```python
"""Why the 2s + 2p_z catalogue preset must not open on its isosurface.

Reproduction (2026-09-25; numpy 2.5.2, scikit-image 0.26.0). Picking this
preset from the default superposition view -- whose fallback representation
is the isosurface (``web/src/state/useSceneStore.ts`` ``ALWAYS_AVAILABLE``) --
sends the route-default request ``resolution=65, probability_mass=0.90,
time=0, basis=complex, Z = a_mu = 1``, and the server refuses it with 422.

Root cause, measured on the finest-two schedule (129, 137) that the workload
estimator selects for any multi-term state with an excited-s component:

* the per-component Euler-characteristic signature of the 0.90 level set
  changes with the grid -- (2, 2) at 129 and 145, (-14,) at 137, (-12,) at
  161, (-4,) at 181 -- because the level lies close to a saddle value of
  ``|Psi|^2`` where the two lobes nearly touch, and marching cubes opens and
  closes spurious handles there;
* the route answers 200 at 0.85 and below and inside the isolated 0.911-0.912
  window, 422 from the two-grid gate on 0.86-0.91 and at 0.915, and 422 before
  building from 0.92 upwards (the radial oracle asks for more than the 137 cap).

So the gate is right and the builder has no bug: there is no converged
topology at 0.90 to publish, and a "safe" mass would be an island rather than
a range. These tests pin the gate so that it cannot be loosened by accident.
"""

from __future__ import annotations

from fastapi.testclient import TestClient

from quviz.api.app import create_app

client = TestClient(create_app(mount_frontend=False))

DEGENERATE_TERMS = "2,0,0,0.7071067811865476;2,1,0,0.7071067811865476"
ROUTE_DEFAULT_ISOSURFACE = {
    "terms": DEGENERATE_TERMS,
    "time": 0,
    "basis": "complex",
    "z": 1,
    "a_mu": 1,
    "resolution": 65,
}


def test_route_default_isosurface_of_the_degenerate_preset_is_refused_by_the_gate() -> None:
    response = client.get(
        "/api/superposition/isosurface",
        params={**ROUTE_DEFAULT_ISOSURFACE, "probability_mass": 0.9},
    )
    assert response.status_code == 422
    detail = response.json()["detail"]
    assert detail.startswith("the general superposition isosurface topology did not converge")
    assert "the validated grid cap 137" in detail


def test_the_same_gate_accepts_a_level_away_from_the_saddle() -> None:
    response = client.get(
        "/api/superposition/isosurface",
        params={**ROUTE_DEFAULT_ISOSURFACE, "probability_mass": 0.8},
    )
    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload["grid_resolution"] == 137
    assert any(
        "finest-two-grid convergence gate at resolutions 129 and 137" in warning
        for warning in payload["metadata"]["warnings"]
    )
```

- [ ] **Step 2: Run the reproduction**

Run: `uv run --locked --no-sync pytest tests/test_superposition_default_view.py -q`
Expected: `2 passed` (about 3.5 s). This is the reproduction, so it must pass before any change:
it proves the defect is stable and pins the refusal. The regression tests that must fail before the
fix arrive in Tasks A10 (server) and A11 (store).

- [ ] **Step 3: Investigate: measure which masses succeed and which criterion fails.** Create
  `build/probes/probe_2s2pz.py` (gitignored) with:

```python
"""Investigation only: where the 2s + 2p_z superposition isosurface gate passes."""

from fastapi.testclient import TestClient

from quviz.api import routes
from quviz.api.app import create_app
from quviz.conventions import BasisKind
from quviz.scene import builders

TERMS = "2,0,0,0.7071067811865476;2,1,0,0.7071067811865476"
client = TestClient(create_app(mount_frontend=False))
params = {"terms": TERMS, "time": 0, "basis": "complex", "z": 1, "a_mu": 1, "resolution": 65}

print("route outcome per probability_mass:")
for mass in (0.8, 0.85, 0.86, 0.88, 0.9, 0.91, 0.911, 0.912, 0.915, 0.92, 0.95):
    response = client.get("/api/superposition/isosurface", params={**params, "probability_mass": mass})
    body = response.json()
    outcome = f"grid {body['grid_resolution']}" if response.status_code == 200 else body["detail"][:60]
    print(f"  {mass:<6} {response.status_code} {outcome}")

state = routes._parse_superposition(TERMS, BasisKind.COMPLEX, maximum_n=4)
extent = builders.superposition_extent(state)
print("Euler-characteristic signature of the 0.90 level set per grid:")
for resolution in (129, 137, 145, 161, 181):
    mesh = builders._build_density_mesh(
        lambda r, th, ph: state.evaluate(r, th, ph, time=0.0),
        extent=extent,
        resolution=resolution,
        probability_mass=0.9,
    )
    print(f"  {resolution}: {builders._mesh_component_euler_characteristics(mesh.faces)}")
```

Run: `uv run --locked --no-sync python build/probes/probe_2s2pz.py`
Expected output, as measured on 2026-09-25 (timings omitted):

```
route outcome per probability_mass:
  0.8    200 grid 137
  0.85   200 grid 137
  0.86   422 the general superposition isosurface topology did not conver
  0.88   422 the general superposition isosurface topology did not conver
  0.9    422 the general superposition isosurface topology did not conver
  0.91   422 the general superposition isosurface topology did not conver
  0.911  200 grid 137
  0.912  200 grid 137
  0.915  422 the general superposition isosurface topology did not conver
  0.92   422 the active excited-s component requires general superpositio
  0.95   422 the active excited-s component requires general superpositio
Euler-characteristic signature of the 0.90 level set per grid:
  129: (2, 2)
  137: (-14,)
  145: (2, 2)
  161: (-12,)
  181: (-4,)
```

The 129/137 comparison was also measured criterion by criterion, and only the topology fails:
- level: relative difference 5.3e-3 against a tolerance of 2e-2;
- finite-grid integral: 2.4e-5 against 2e-3;
- captured mass: 1.2e-6 against 5e-4;
- Euler signature: `(2, 2)` against `(-14,)`, and it does not settle as the grid is refined.

At 0.88 the signature goes from `(2, 2)` at 129 to `(2,)` at 137, so the lobes merge right at
the cap.

- [ ] **Step 4: Decide the fix** (recorded here; implemented in Tasks A10 and A11):
  - **Rejected:** loosening `_general_meshes_have_stable_topology`. The signature never converges,
    so there is no correct surface to publish, and the project is fail-closed.
  - **Rejected:** lowering the global default mass to 0.8. That changes the meaning of every
    eigenstate and preset isosurface to fix one preset.
  - **Rejected:** a per-preset "safe mass". The passing set is `≤ 0.85 ∪ {0.911, 0.912}`, an
    island that a library upgrade can move. The store's single shared `probabilityMass` and its
    slider would make 0.90 reachable again anyway.
  - **Chosen:** the catalogue publishes a server-probed `default_representation`: `isosurface` if
    the route-default isosurface request builds in both bases, otherwise `slice`, which the
    published `slice_resolution_floor` always admits. The web store opens a preset or enters
    superposition mode on that representation, and an explicit isosurface request is still sent
    and answered honestly.

- [ ] **Step 5: Pre-commit gate and commit** (only the test file; the probe stays in `build/`)

```
uv run --locked ruff format tests/test_superposition_default_view.py
uv run --locked ruff check .
uv run --locked ruff format --check .
uv run --locked mypy
uv run --locked --group docs pytest --cov=quviz --cov-report=term-missing -q
git add tests/test_superposition_default_view.py
git commit -m "test(api): reproduce the 2s-2pz default isosurface refusal and pin its gate" -m "Claude-Session: https://claude.ai/code/session_01E44DEzsc7Av26fc7nZ5rSo"
```

---

### Task A10: Server-probed `SuperpositionCatalogEntry.default_representation`

**Files:**
- Modify: `src/quviz/api/routes.py`:
  - imports (lines 3-9): add `from typing import Literal`;
  - constants after line 348: add `_DEFAULT_ISOSURFACE_RESOLUTION` and
    `_DEFAULT_ISOSURFACE_PROBABILITY_MASS`;
  - `SuperpositionCatalogEntry` (lines 427-452): add the field;
  - `_superposition_catalog_entry` (lines 535-571): publish the field;
  - after `_cached_superposition_isosurface` (lines 610-619): add `_superposition_isosurface_payload`
    and `_superposition_default_representation`;
  - route `superposition_isosurface` (lines 622-674): use the helper, with the Query defaults from
    the constants.
- Regenerate: `tests/fixtures/openapi.json`, `tests/fixtures/visual/catalog-superposition.json` and
  `web/src/api/schema.gen.ts`. `docs/reference/http-schema.md` must stay unchanged (`--check`).
- Modify: `web/src/api/types.ts` (after line 171) and `web/src/api/client.ts` (imports at lines
  9-24; `parseSuperpositionPreset` at lines 110-167).
- Modify: `docs/reference/api.md:44` and `docs/reference/api.md:119`.
- Test: `tests/test_superposition_default_view.py` (append, and extend the module docstring) and
  `web/src/api/client.test.ts` (fixture at lines 507-518; new tests after line 562).

**Interfaces:**
- Consumes: `_parse_superposition` (`routes.py:455-532`), `_enforce_request_workload`
  (`routes.py:351-370`) and `_cached_superposition_isosurface` (`routes.py:610-619`).
- Produces:
  - Python: `SuperpositionCatalogEntry.default_representation: Literal["isosurface", "slice"]`,
    required. In OpenAPI it is `enum: ["isosurface", "slice"]` and listed in `required`.
  - Python: `def _superposition_isosurface_payload(state: SuperpositionState, *, time: float,
    resolution: int, probability_mass: float) -> SuperpositionIsosurfacePayload`, which raises
    `HTTPException(422)`.
  - Python: `@lru_cache(maxsize=16) def _superposition_default_representation(terms: str) ->
    Literal["isosurface", "slice"]`.
  - TS: `SuperpositionPreset.default_representation: "isosurface" | "slice"`, from
    `schema.gen.ts`.
  - TS: `export type SuperpositionDefaultRepresentation =
    SuperpositionPreset['default_representation']` in `types.ts`.
  - TS: `fetchSuperpositionCatalog` rejects any other value, with the message `superposition
    catalog[i].default_representation must be "isosurface" or "slice"`.

- [ ] **Step 1: Write the failing regression tests.** Append to
  `tests/test_superposition_default_view.py`, and add these imports to its import block:
  `from fastapi import HTTPException`, `from quviz.api import routes as routes_module` and
  `from quviz.conventions import BasisKind`.

```python
BOHR_TERMS = "1,0,0,0.7071067811865476;2,1,0,0.7071067811865476"


def test_every_catalogue_preset_opens_on_a_request_the_server_builds() -> None:
    entries = client.get("/api/superposition/catalog").json()
    assert {entry["id"]: entry["default_representation"] for entry in entries} == {
        "1s-2pz": "isosurface",
        "2s-2pz": "slice",
        "1s-3dz2": "isosurface",
        "2pplus-2pminus": "isosurface",
    }
    for entry in entries:
        common = {"terms": entry["terms"], "time": 0, "basis": "complex", "z": 1, "a_mu": 1}
        if entry["default_representation"] == "isosurface":
            response = client.get(
                "/api/superposition/isosurface",
                params={**common, "resolution": 65, "probability_mass": 0.9},
            )
        else:
            response = client.get(
                "/api/superposition/slice",
                params={
                    **common,
                    "resolution": entry["slice_resolution_floor"],
                    "plane": "xz",
                    "observable": "probability_density",
                },
            )
        assert response.status_code == 200, (entry["id"], response.text)


def test_the_probe_runs_the_route_default_request_in_both_bases(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    calls: list[tuple[BasisKind, dict[str, object]]] = []

    def recording_payload(state: Any, **kwargs: object) -> None:
        calls.append((state.basis, kwargs))

    monkeypatch.setattr(routes_module, "_superposition_isosurface_payload", recording_payload)
    routes_module._superposition_default_representation.cache_clear()
    try:
        assert routes_module._superposition_default_representation(BOHR_TERMS) == "isosurface"
    finally:
        routes_module._superposition_default_representation.cache_clear()
    route_defaults = {"time": 0.0, "resolution": 65, "probability_mass": 0.9}
    assert calls == [(BasisKind.COMPLEX, route_defaults), (BasisKind.REAL, route_defaults)]


def test_a_refusal_in_either_basis_publishes_the_slice(monkeypatch: pytest.MonkeyPatch) -> None:
    def real_basis_refused(state: Any, **kwargs: object) -> None:
        if state.basis is BasisKind.REAL:
            raise HTTPException(status_code=422, detail="probe refusal")

    monkeypatch.setattr(routes_module, "_superposition_isosurface_payload", real_basis_refused)
    routes_module._superposition_default_representation.cache_clear()
    try:
        assert routes_module._superposition_default_representation(BOHR_TERMS) == "slice"
    finally:
        routes_module._superposition_default_representation.cache_clear()


def test_a_preset_beyond_the_isosurface_ceiling_publishes_the_slice() -> None:
    routes_module._superposition_default_representation.cache_clear()
    try:
        beyond = "1,0,0,0.7071067811865476;5,0,0,0.7071067811865476"
        assert routes_module._superposition_default_representation(beyond) == "slice"
    finally:
        routes_module._superposition_default_representation.cache_clear()


def test_openapi_publishes_the_default_representation_contract() -> None:
    schemas = client.get("/openapi.json").json()["components"]["schemas"]
    entry = schemas["SuperpositionCatalogEntry"]
    assert "default_representation" in entry["required"]
    assert entry["properties"]["default_representation"]["enum"] == ["isosurface", "slice"]
```

Also add `from typing import Any` and `import pytest` to the import block, in isort order. Then
append this paragraph to the end of the module docstring:

```text
Fix: ``GET /api/superposition/catalog`` publishes ``default_representation``,
probed by running exactly that route-default request through the route's own
workload guard and builder (both bases; the answer is cached per process).
2s + 2p_z publishes ``"slice"``; the web store opens the published default
when a preset is applied or superposition mode is entered.
```

- [ ] **Step 2: Run them and see them fail**

Run: `uv run --locked --no-sync pytest tests/test_superposition_default_view.py -q`
Expected:
- `test_every_catalogue_preset_opens_on_a_request_the_server_builds` fails with
  `KeyError: 'default_representation'`;
- the three probe tests fail with `AttributeError: <module 'quviz.api.routes' ...> has no attribute
  '_superposition_isosurface_payload'` (or `'_superposition_default_representation'`);
- the OpenAPI test fails with `AssertionError: assert 'default_representation' in [...]`;
- the 2 reproduction tests from Task A9 still pass.

- [ ] **Step 3: Implement the server side** in `src/quviz/api/routes.py`.

(a) Add `from typing import Literal` after `from math import tau`.

(b) After `_MAXIMUM_SUPERPOSITION_CURRENT_SEEDS = 40` (line 348), add:

```python
#: Route defaults of the superposition isosurface. The catalogue probe uses the
#: same two numbers, so the published default representation is a statement
#: about the request a client sends before touching any control.
_DEFAULT_ISOSURFACE_RESOLUTION = 65
_DEFAULT_ISOSURFACE_PROBABILITY_MASS = 0.90
```

(c) In `class SuperpositionCatalogEntry`, after the `streamline_seed_count_max` field, add:

```python
    default_representation: Literal["isosurface", "slice"] = Field(
        description=(
            "Representation a client opens this preset with: 'isosurface' when the route-default "
            "superposition isosurface request (resolution 65, probability_mass 0.90, time 0, "
            "Z = 1, a_mu = 1) builds in both bases, otherwise 'slice', which "
            "slice_resolution_floor always admits. Derived by running that request through the "
            "route's own workload guard and builder, not by a duplicated rule."
        ),
    )
```

(d) In `_superposition_catalog_entry`, add this key to the returned dict after
`"streamline_seed_count_max": min(...)`:

```python
        "default_representation": _superposition_default_representation(terms),
```

(e) After `_cached_superposition_isosurface` (it ends at line 619), add:

```python
def _superposition_isosurface_payload(
    state: SuperpositionState,
    *,
    time: float,
    resolution: int,
    probability_mass: float,
) -> SuperpositionIsosurfacePayload:
    """Workload guard plus cached builder, shared by the route and the catalogue probe."""

    try:
        work_estimate = estimate_superposition_isosurface_workload(
            state,
            resolution=resolution,
            probability_mass=probability_mass,
        )
        work_limit = (
            _ADAPTIVE_ISOSURFACE_WORK_LIMIT
            if work_estimate.uses_adaptive_isosurface_budget
            else _ISOSURFACE_WORK_LIMIT
        )
        _enforce_request_workload(
            "superposition isosurface",
            active_terms=work_estimate.active_terms,
            work_per_term=sum(value**3 for value in work_estimate.resolutions),
            limit=work_limit,
            unit="term-voxel evaluations",
        )
        return _isolated_cached_payload(
            _cached_superposition_isosurface(state, time, resolution, probability_mass)
        )
    except _SCIENTIFIC_REQUEST_ERRORS as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@lru_cache(maxsize=16)
def _superposition_default_representation(terms: str) -> Literal["isosurface", "slice"]:
    """Open a preset on its isosurface only if the route-default request for it builds.

    The probe is the request a client sends before touching any control: the
    route-default ``resolution`` and ``probability_mass`` at ``time=0`` with
    ``Z = a_mu = 1``, through the same workload guard and cached builder as the
    route, in both bases -- the published answer is their safe intersection,
    like ``streamline_seed_count_max``. A refusal publishes ``"slice"``, which
    the preset's ``slice_resolution_floor`` always admits. Catalogue terms are
    fixed, so the answer is cached per process; the first catalogue request
    pays about 4 s on the reference machine, almost all of it the two refused
    2s + 2p_z builds.

    Only ``t = 0`` is probed. Today's presets are either stationary or free of
    excited-s components, and only an excited-s component triggers the
    general topology gate; a future oscillating preset with an excited-s term
    would need its playback frames probed as well.
    """

    for basis in (BasisKind.COMPLEX, BasisKind.REAL):
        try:
            state = _parse_superposition(
                terms,
                basis,
                maximum_n=_MAXIMUM_ISOSURFACE_N,
                operation="superposition catalogue isosurface probe",
            )
            _superposition_isosurface_payload(
                state,
                time=0.0,
                resolution=_DEFAULT_ISOSURFACE_RESOLUTION,
                probability_mass=_DEFAULT_ISOSURFACE_PROBABILITY_MASS,
            )
        except HTTPException:
            return "slice"
    return "isosurface"
```

(f) Replace the `superposition_isosurface` route (lines 622-674) with:

```python
@router.get("/superposition/isosurface")
def superposition_isosurface(
    terms: str = Query(
        _DEFAULT_SUPERPOSITION_TERMS,
        min_length=1,
        max_length=_MAXIMUM_TERM_SPEC_LENGTH,
        description=_TERM_SPEC_HELP,
    ),
    time: float = Query(0.0, ge=-1_000.0, le=1_000.0),
    basis: BasisKind = BasisKind.COMPLEX,
    z: float = Query(1.0, gt=0.0, le=20.0),
    a_mu: float = Query(1.0, gt=0.0, le=20.0),
    resolution: int = Query(_DEFAULT_ISOSURFACE_RESOLUTION, ge=49, le=81),
    probability_mass: float = Query(_DEFAULT_ISOSURFACE_PROBABILITY_MASS, ge=0.50, le=0.99),
) -> SuperpositionIsosurfacePayload:
    r"""The :math:`|\Psi(t)|^2` level set of a superposition at one instant."""

    state = _parse_superposition(
        terms,
        basis,
        z=z,
        a_mu=a_mu,
        maximum_n=_MAXIMUM_ISOSURFACE_N,
        operation="superposition isosurface",
    )
    return _superposition_isosurface_payload(
        state, time=time, resolution=resolution, probability_mass=probability_mass
    )
```

The Query defaults are the same numbers as before (65 and 0.90), so neither OpenAPI parameters nor
`http-schema.md` change. The existing `tests/test_api.py` tests that monkeypatch
`_cached_superposition_isosurface` (lines 138-151, 891-921 and 981-1004) keep working, because the
helper looks the name up at call time.

- [ ] **Step 4: Run the server tests and see them pass**

Run: `uv run --locked --no-sync pytest tests/test_superposition_default_view.py tests/test_api.py -q`
Expected: `test_superposition_default_view.py` gives `7 passed`, and every `test_api.py` test
passes. The first catalogue request in the session costs about 4 s for the probe.

- [ ] **Step 5: Regenerate the contract chain**

```
uv run --locked python scripts/write_openapi.py
uv run --locked python scripts/write_visual_fixtures.py
npm --prefix web run codegen
uv run --locked --group docs python scripts/render_openapi_reference.py --check
git diff --stat
npm --prefix web run typecheck
```

Expected:
- `--check` prints `docs/reference/http-schema.md is current`.
- `git diff --stat` shows `tests/fixtures/openapi.json`, `tests/fixtures/visual/catalog-superposition.json`
  (each entry gains `default_representation`, with `"slice"` only for `2s-2pz`) and
  `web/src/api/schema.gen.ts` (`default_representation: "isosurface" | "slice";` in
  `SuperpositionCatalogEntry`). No other visual fixture changes.
- `npm --prefix web run typecheck` now **fails** in `src/api/client.ts`, because
  `parseSuperpositionPreset`'s returned object lacks `default_representation`. The next step
  fixes that.

- [ ] **Step 6: Write the failing web parser tests.** In `web/src/api/client.test.ts`, give the
  fixture its published field. Inside `describe('fetchSuperpositionCatalog', ...)`, the
  `presets[0]` literal (lines 509-517) gains one line after `streamline_seed_count_max: 24,`:

```ts
      default_representation: 'isosurface',
```

(This keeps the intent of `'requests the superposition catalog with no query'`, which asserts
`toEqual(presets)`: the parser must return what the server sent.) Then add after the
`streamline_seed_count_max` `it.each` block (ending line 562):

```ts
  it.each(['isosurface', 'slice'] as const)(
    'carries the published default representation %s through unchanged',
    async (default_representation) => {
      routeFetch({
        '/api/superposition/catalog': () =>
          jsonResponse([{ ...presets[0], default_representation }]),
      })

      const [preset] = await fetchSuperpositionCatalog()

      expect(preset.default_representation).toBe(default_representation)
    },
  )

  it.each([undefined, 'point_cloud', 'streamlines', 'SLICE', 1])(
    'rejects a catalogue default representation outside the generated enum: %s',
    async (default_representation) => {
      routeFetch({
        '/api/superposition/catalog': () =>
          jsonResponse([{ ...presets[0], default_representation }]),
      })

      await expect(fetchSuperpositionCatalog()).rejects.toThrow(
        /default_representation must be "isosurface" or "slice"/,
      )
    },
  )
```

Run: `(cd web && npm exec --no -- vitest run src/api/client.test.ts)`
Expected, because the parser still drops the field:
- the 5 rejection cases fail (the promise resolves instead of rejecting);
- both round-trip cases fail with `expected undefined to be 'isosurface'` or `'slice'`;
- the existing `'requests the superposition catalog with no query'` fails its `toEqual(presets)`.

Vitest does not type-check, so these are runtime failures.

- [ ] **Step 7: Implement the web parser.** In `web/src/api/types.ts`, after
  `export type SuperpositionPreset = components['schemas']['SuperpositionCatalogEntry']`
  (line 171), add:

```ts
/**
 * What a catalogue preset opens on, as the server probed it: `'slice'` when the
 * route-default isosurface request for that preset is refused (today 2s + 2p_z).
 */
export type SuperpositionDefaultRepresentation = SuperpositionPreset['default_representation']
```

In `web/src/api/client.ts`, add `SuperpositionDefaultRepresentation,` to the `import type { ... }
from './types'` list after `SuperpositionCurrentPayload,`, and add this helper directly above
`function parseSuperpositionPreset`:

```ts
/** The generated enum of SuperpositionCatalogEntry.default_representation. */
function isSuperpositionDefaultRepresentation(
  value: unknown,
): value is SuperpositionDefaultRepresentation {
  return value === 'isosurface' || value === 'slice'
}
```

In `parseSuperpositionPreset`, add `default_representation,` to the destructuring list after
`streamline_seed_count_max,`, add this check after the `streamline_seed_count_max` check, and add
`default_representation,` as the last property of the returned object:

```ts
  if (!isSuperpositionDefaultRepresentation(default_representation)) {
    throw new Error(`${location}.default_representation must be "isosurface" or "slice"`)
  }
```

- [ ] **Step 8: Document the field.** In `docs/reference/api.md`, append this sentence to the end
  of line 44 (after `默认 0.90 因最细两级拓扑不稳定而 fail-closed。`):

```markdown
目录因此为该预设发布 `default_representation` 为 `slice`（见下文 `GET /api/superposition/catalog`）。
```

Append to the end of line 119 (after `必须重新消费对应步长的服务端能力结果。`):

```markdown
每项还带 `default_representation`：目录构建时对 route 默认等值面请求（`resolution=65`、`probability_mass=0.90`、`time=0`、$Z=a_\mu=1$）在 complex 与 real 两种 basis 下各跑一次同一 workload guard 与 builder，都成功才发布 `isosurface`，否则发布 `slice`（`slice_resolution_floor` 保证可建）。当前只有 `2s-2pz` 发布 `slice`：其 $|\Psi|^2$ 的 0.90 水平集贴近一个鞍点临界值，129/145 点网格的逐分量 Euler 特征签名为 (2, 2)，137、161、181 点分别为 (−14)、(−12)、(−4)，最细双网格门禁如实拒绝。结果按 `terms` 在进程内缓存，首个目录请求约多 4 s（本机测得）。
```

- [ ] **Step 9: Run the affected suites and see them pass**

```
(cd web && npm exec --no -- vitest run src/api/client.test.ts src/api/schema.gen.test.ts)
npm --prefix web run typecheck
uv run --locked --no-sync pytest tests/test_superposition_default_view.py tests/test_openapi_contract.py tests/test_openapi_reference.py tests/test_visual_fixtures.py tests/test_api.py tests/test_docs_integrity.py -q
uv run --locked --group docs mkdocs build --strict
```

Expected: all green. `client.test.ts` gains 7 passing cases, and typecheck exits 0.

- [ ] **Step 10: Pre-commit gate and commit**

```
uv run --locked ruff format src/quviz/api/routes.py tests/test_superposition_default_view.py
uv run --locked ruff check .
uv run --locked ruff format --check .
uv run --locked mypy
uv run --locked --group docs pytest --cov=quviz --cov-report=term-missing -q
npm --prefix web run test
npm --prefix web run typecheck
git add src/quviz/api/routes.py tests/test_superposition_default_view.py tests/fixtures/openapi.json tests/fixtures/visual/catalog-superposition.json web/src/api/schema.gen.ts web/src/api/types.ts web/src/api/client.ts web/src/api/client.test.ts docs/reference/api.md
git commit -m "fix(api): publish a server-probed default representation per superposition preset" -m "Claude-Session: https://claude.ai/code/session_01E44DEzsc7Av26fc7nZ5rSo"
```

---

### Task A11: Open presets and superposition mode on the published default (web store)

**Files:**
- Modify: `web/src/state/useSceneStore.ts`:
  - imports (lines 5-11);
  - `interface SceneStore` (lines 15-106): the new field and the two action signatures;
  - the `ALWAYS_AVAILABLE` doc comment (lines 174-184);
  - a new `openingRepresentation`, after `resolveRepresentation` (ends at line 226);
  - defaults (lines 229-258), `setMode` (259-291), `setSuperposition` (292-329) and
    `syncSuperpositionCapabilities` (330-363).
- Modify: `web/src/components/ControlPanel.tsx:333-339` (catalogue sync) and `:654-661` (mixture
  click).
- Modify: `docs/reference/quality-gates.md` (insert one bullet after line 78, the last ✅ bullet
  of `## 几何与等值面`).
- Test: `web/src/state/useSceneStore.test.ts`:
  - existing calls at lines 370-375, 415, 432, 437-441, 455-460, 479 and 498 gain the new argument;
  - one new `describe`.
- Test: `web/src/components/ControlPanel.test.tsx`: the `CATALOGUE.mixtures` fixture (lines 64-92)
  gains `default_representation`; two new tests go after line 1375.

**Interfaces:**
- Consumes: `SuperpositionPreset.default_representation` and `SuperpositionDefaultRepresentation`
  (Task A10); `resolveRepresentation(mode, orbital, requested, current,
  superpositionStreamlineSeedCountMax?)` (`useSceneStore.ts:209-226`).
- Produces:
  - `SceneStore.superpositionDefaultRepresentation: SuperpositionDefaultRepresentation`, initially
    `'isosurface'`.
  - `setSuperposition(terms: string, label: string, sliceResolutionFloor: number,
    streamlineSeedCountMax: number, defaultRepresentation: SuperpositionDefaultRepresentation) =>
    void`. This is **breaking**: the fifth argument is required.
  - `syncSuperpositionCapabilities(terms: string, sliceResolutionFloor: number,
    streamlineSeedCountMax: number, defaultRepresentation: SuperpositionDefaultRepresentation) =>
    void`. Also **breaking**: the fourth argument is required.
  - Rule: applying a preset or switching to superposition mode opens the published default when
    the store would otherwise open the isosurface. An explicit `setRepresentation` is honoured, and
    a catalogue sync only records the default.

- [ ] **Step 1: Write the failing regression tests.** In `web/src/state/useSceneStore.test.ts`,
  update the existing calls so they pass the default their preset publishes (all `'isosurface'`).
  Their intent is unchanged:
  - line 370-375: `read().setSuperposition('1,0,0,0.7071067811865476;3,2,0,0.7071067811865476',
    '1s + 3d_z²', 103, 24, 'isosurface')`
  - line 415: `read().setSuperposition('1,0,0,1', '1s', 65, 40, 'isosurface')`
  - line 432: `read().syncSuperpositionCapabilities(terms, 103, 24, 'isosurface')`
  - line 437-441: `read().syncSuperpositionCapabilities('a mixture selected after this fetch
    began', 201, 7, 'isosurface')`
  - line 455-460: `read().setSuperposition('1,0,0,0.7071067811865476;3,2,0,0.7071067811865476',
    '1s + 3d_z²', 103, 24, 'isosurface')`
  - line 479: `read().syncSuperpositionCapabilities(terms, 65, 17, 'isosurface')`
  - line 498: `read().syncSuperpositionCapabilities(terms, 65, 0, 'isosurface')`

Append a new block at the end of the file:

```ts
describe('catalogue default representation', () => {
  const DEGENERATE_TERMS = '2,0,0,0.7071067811865476;2,1,0,0.7071067811865476'
  const BOHR_TERMS = '1,0,0,0.7071067811865476;2,1,0,0.7071067811865476'

  it('opens a preset whose published default is a slice on the slice (2s-2pz regression)', () => {
    read().setMode('superposition')
    expect(read().representation).toBe('isosurface')

    read().setSuperposition(DEGENERATE_TERMS, '2s + 2p_z (degenerate, stationary)', 65, 40, 'slice')

    expect(read().superpositionDefaultRepresentation).toBe('slice')
    expect(read().representation).toBe('slice')
    expect(planSceneRequest(selectSceneRequestInputs(read()))).toMatchObject({
      status: 'available',
      endpoint: '/api/superposition/slice',
      params: { resolution: 65 },
    })
  })

  it('keeps the isosurface for a preset that publishes it as its default', () => {
    read().setMode('superposition')

    read().setSuperposition(BOHR_TERMS, '1s + 2p_z (Bohr oscillation)', 65, 40, 'isosurface')

    expect(read().representation).toBe('isosurface')
  })

  it('keeps a representation other than the isosurface when such a preset is chosen', () => {
    useSceneStore.setState({ superpositionStreamlineSeedCountMax: 40 })
    read().setMode('superposition')
    read().setRepresentation('streamlines')

    read().setSuperposition(DEGENERATE_TERMS, '2s + 2p_z', 65, 40, 'slice')

    expect(read().representation).toBe('streamlines')
  })

  it('enters superposition mode on the selected preset default', () => {
    useSceneStore.setState({ representation: 'isosurface', superpositionDefaultRepresentation: 'slice' })

    read().setMode('superposition')

    expect(read().representation).toBe('slice')
  })

  it('still honours an explicit isosurface request for such a preset', () => {
    read().setMode('superposition')
    read().setSuperposition(DEGENERATE_TERMS, '2s + 2p_z', 65, 40, 'slice')

    read().setRepresentation('isosurface')

    expect(read().representation).toBe('isosurface')
  })

  it('records the published default on a catalogue sync without moving the picture', () => {
    useSceneStore.setState({ mode: 'superposition', representation: 'isosurface' })

    read().syncSuperpositionCapabilities(read().superpositionTerms, 65, 40, 'slice')

    expect(read().superpositionDefaultRepresentation).toBe('slice')
    expect(read().representation).toBe('isosurface')
  })
})
```

In `web/src/components/ControlPanel.test.tsx`, add `default_representation: 'isosurface',` after
each `streamline_seed_count_max: ...,` line of the three `CATALOGUE.mixtures` entries (lines 72, 81
and 90). Then add two tests after `it('does not offer motion for a degenerate catalogue state', ...)`
(ends line 1375):

```tsx
  it('opens a mixture on the representation its catalogue entry publishes', async () => {
    const mixture = CATALOGUE.mixtures[1]
    const original = mixture.default_representation
    mixture.default_representation = 'slice'
    useSceneStore.setState({ mode: 'superposition', representation: 'isosurface' })
    const tree = await mount(createElement(ControlPanel))
    try {
      const mixtures = tree.container.querySelectorAll<HTMLButtonElement>('.mixture-list .preset')
      await press(mixtures[1], 'the second mixture')

      const state = useSceneStore.getState()
      expect(state.superpositionDefaultRepresentation).toBe('slice')
      expect(state.representation).toBe('slice')
      expect(planSceneRequest(selectSceneRequestInputs(state))).toMatchObject({
        status: 'available',
        endpoint: '/api/superposition/slice',
      })
    } finally {
      await tree.unmount()
      mixture.default_representation = original
    }
  })

  it('records the selected mixture default from the catalogue without moving the picture', async () => {
    const mixture = CATALOGUE.mixtures[0]
    const original = mixture.default_representation
    mixture.default_representation = 'slice'
    useSceneStore.setState({ mode: 'superposition', representation: 'isosurface' })
    const tree = await mount(createElement(ControlPanel))
    try {
      const state = useSceneStore.getState()
      expect(state.superpositionDefaultRepresentation).toBe('slice')
      expect(state.representation).toBe('isosurface')
    } finally {
      await tree.unmount()
      mixture.default_representation = original
    }
  })
```

- [ ] **Step 2: Run them and see them fail**

```
(cd web && npm exec --no -- vitest run src/state/useSceneStore.test.ts src/components/ControlPanel.test.tsx)
(cd web && npm exec --no -- tsc -p tsconfig.test.json --noEmit)
```

Expected from vitest:
- the 2s-2pz regression test fails with `expected 'isosurface' to be 'slice'`;
- the other new store tests that read `superpositionDefaultRepresentation` fail with
  `expected undefined to be 'slice'`;
- `'enters superposition mode on the selected preset default'` fails with
  `expected 'isosurface' to be 'slice'`;
- both new ControlPanel tests fail, because ControlPanel does not yet forward the field.

Expected from `tsc -p tsconfig.test.json` (exit 2), in `src/state/useSceneStore.test.ts`:
- `TS2554: Expected 4 arguments, but got 5.` at each updated `setSuperposition(...)` call (today's
  signature, `useSceneStore.ts:69-74`, takes four);
- `TS2554: Expected 3 arguments, but got 4.` at each updated `syncSuperpositionCapabilities(...)`
  call (`useSceneStore.ts:75-79` takes three);
- errors naming `superpositionDefaultRepresentation`, which `SceneStore` does not declare yet.

- [ ] **Step 3: Implement the store.** In `web/src/state/useSceneStore.ts`:

(a) Add `SuperpositionDefaultRepresentation,` to the `import type { ... } from '../api/types'`
list after `SliceObservable,`.

(b) In `interface SceneStore`, add after `superpositionStreamlineSeedCountMax: number | undefined`:

```ts
  /**
   * What the selected catalogue preset opens on, as the server probed it
   * (`SuperpositionCatalogEntry.default_representation`). `'isosurface'` until a
   * catalogue answers, which is what the initial 1s + 2p_z preset publishes.
   */
  superpositionDefaultRepresentation: SuperpositionDefaultRepresentation
```

Then change the two action signatures to:

```ts
  setSuperposition: (
    terms: string,
    label: string,
    sliceResolutionFloor: number,
    streamlineSeedCountMax: number,
    defaultRepresentation: SuperpositionDefaultRepresentation,
  ) => void
  syncSuperpositionCapabilities: (
    terms: string,
    sliceResolutionFloor: number,
    streamlineSeedCountMax: number,
    defaultRepresentation: SuperpositionDefaultRepresentation,
  ) => void
```

(c) Append this paragraph to the `ALWAYS_AVAILABLE` doc comment, before its closing `*/`:

```ts
 *
 * "Always available" means always PLANNABLE, not always BUILT: the catalogue
 * probes each preset's route-default isosurface and publishes
 * `default_representation`, which `openingRepresentation` below honours when a
 * preset or a mode switch opens a picture. The resolver's last resort stays
 * total either way.
```

(d) Insert after `resolveRepresentation` (after line 226):

```ts
/**
 * The representation a preset choice or a mode switch OPENS on.
 *
 * `ALWAYS_AVAILABLE` says the superposition isosurface can always be planned;
 * it cannot say the server will build it. The catalogue probes the
 * route-default isosurface of every preset and publishes
 * `default_representation` -- `'slice'` when that request is refused (today
 * 2s + 2p_z, whose 0.90 level set sits on a saddle of |Psi|^2 and fails the
 * two-grid topology gate). So when the store would otherwise open such a preset
 * on the isosurface, it asks for the published default instead, through
 * `resolveRepresentation` so the capability matrix keeps the last word.
 *
 * Only openings go through here: an explicit `setRepresentation('isosurface')`
 * is honoured and the server answers with its reason, and a catalogue sync
 * records the default without moving a picture the user already has.
 */
function openingRepresentation(
  mode: SceneMode,
  orbital: OrbitalParameters,
  resolved: RepresentationKind,
  superpositionDefault: SuperpositionDefaultRepresentation,
  superpositionStreamlineSeedCountMax?: number,
): RepresentationKind {
  const requested =
    mode === 'superposition' && resolved === 'isosurface' ? superpositionDefault : resolved
  return resolveRepresentation(
    mode,
    orbital,
    requested,
    resolved,
    superpositionStreamlineSeedCountMax,
  )
}
```

(e) In the store defaults, add after `superpositionStreamlineSeedCountMax: undefined,`:

```ts
  // The initial 1s + 2p_z preset publishes 'isosurface'; the catalogue sync
  // replaces this with the server's answer.
  superpositionDefaultRepresentation: 'isosurface',
```

(f) In `setMode`, replace the `const representation = resolveRepresentation(...)` statement with:

```ts
      const representation = openingRepresentation(
        mode,
        state.orbital,
        resolveRepresentation(
          mode,
          state.orbital,
          state.representation,
          state.representation,
          state.superpositionStreamlineSeedCountMax,
        ),
        state.superpositionDefaultRepresentation,
        state.superpositionStreamlineSeedCountMax,
      )
```

(g) Replace `setSuperposition` with:

```ts
  setSuperposition: (
    superpositionTerms,
    superpositionLabel,
    superpositionSliceResolutionFloor,
    superpositionStreamlineSeedCountMax,
    superpositionDefaultRepresentation,
  ) =>
    set((state) => {
      const representation = openingRepresentation(
        state.mode,
        state.orbital,
        resolveRepresentation(
          state.mode,
          state.orbital,
          state.representation,
          state.representation,
          superpositionStreamlineSeedCountMax,
        ),
        superpositionDefaultRepresentation,
        superpositionStreamlineSeedCountMax,
      )
      return {
        superpositionTerms,
        superpositionLabel,
        superpositionSliceResolutionFloor,
        superpositionStreamlineSeedCountMax,
        superpositionDefaultRepresentation,
        representation,
        timeAu: 0,
        playing: false,
        resolution: clampResolution(
          state.mode,
          state.orbital,
          representation,
          state.resolution,
          superpositionSliceResolutionFloor,
        ),
        seedCount: clampSeedCount(
          state.mode,
          state.orbital,
          representation,
          state.seedCount,
          superpositionStreamlineSeedCountMax,
        ),
      }
    }),
```

(h) In `syncSuperpositionCapabilities`, add the fourth parameter `superpositionDefaultRepresentation`
after `superpositionStreamlineSeedCountMax`, and add `superpositionDefaultRepresentation,` to the
returned object after `superpositionStreamlineSeedCountMax,`. The representation logic is
deliberately unchanged, so a sync never moves the picture.

(i) In `web/src/components/ControlPanel.tsx`, add `selected.default_representation,` as the last
argument of `syncSuperpositionCapabilities(...)` (lines 335-339), and
`mixture.default_representation,` as the last argument of `store.setSuperposition(...)`
(lines 655-660).

(j) In `docs/reference/quality-gates.md`, insert after line 78 (the bullet beginning
`- ✅ 有限盒真实质量变化与 render-grid alias 分开报告`):

```markdown
- ✅ 叠加态预设的开场表示法由服务端实测：目录对 route 默认等值面请求（65、0.90、$t=0$、$Z=a_\mu=1$，complex 与 real 两种 basis）实际运行同一 workload guard 与 builder，被拒则发布 `default_representation` 为 `slice`；`2s-2pz` 当前发布 `slice`（0.86–0.91 与 0.915 被最细双网格拓扑门禁拒绝，0.85 以下与孤立的 0.911/0.912 通过）。前端选择该预设或切入叠加态时不再默认发出必然 422 的等值面请求，用户显式选择等值面仍照发 — `tests/test_superposition_default_view.py`、`web/src/api/client.test.ts`、`web/src/state/useSceneStore.test.ts`、`web/src/components/ControlPanel.test.tsx`；
```

- [ ] **Step 4: Run them and see them pass**

```
(cd web && npm exec --no -- vitest run src/state/useSceneStore.test.ts src/components/ControlPanel.test.tsx)
(cd web && npm exec --no -- tsc -p tsconfig.test.json --noEmit)
npm --prefix web run typecheck
uv run --locked --no-sync --group docs pytest tests/test_docs_integrity.py -q
uv run --locked --group docs mkdocs build --strict
```

Expected: every store and ControlPanel test passes (6 new store cases and 2 new ControlPanel
cases), both type checks exit 0, and the docs build is strict-clean.

- [ ] **Step 5: Pre-commit gate and commit**

```
uv run --locked ruff check .
uv run --locked ruff format --check .
uv run --locked mypy
uv run --locked --group docs pytest --cov=quviz --cov-report=term-missing -q
npm --prefix web run test
npm --prefix web run typecheck
git add web/src/state/useSceneStore.ts web/src/state/useSceneStore.test.ts web/src/components/ControlPanel.tsx web/src/components/ControlPanel.test.tsx docs/reference/quality-gates.md
git commit -m "fix(web): open presets and superposition mode on the server-published default" -m "Claude-Session: https://claude.ai/code/session_01E44DEzsc7Av26fc7nZ5rSo"
```

Expected: `npm --prefix web run test` passes all five stages, including `assert-coverage-scope`.
`useSceneStore.ts`, `ControlPanel.tsx` and `client.ts` stay at or above 90/85/90/90.

---

### Task A12: Part A full gates, exporter smoke run and budget check

**Files:**
- No source changes expected. Smoke output goes to `build/part-a-smoke/`, which is gitignored.

**Interfaces:**
- Consumes: everything produced in Tasks A1-A11.
- Produces: the verified hand-off for Parts B, D and E. The CLI and file formats match the
  contracts; `radial_profile` and `default_representation` are in the regenerated
  `schema.gen.ts`.

- [ ] **Step 1: Python and docs gates** (the same nine gates `scripts/check.ps1` runs, in the
  contracts' spelling)

```
uv run --locked ruff check .
uv run --locked ruff format --check .
uv run --locked mypy
uv run --locked --group docs pytest --cov=quviz --cov-report=term-missing
uv run --locked --group docs python scripts/render_reference_index.py --check
uv run --locked --group docs python scripts/render_openapi_reference.py --check
uv run --locked --group docs mkdocs build --strict
```

Expected:
- every command exits 0;
- pytest reports 0 skipped and coverage of at least 85%, and the `quviz/export/*` modules and the
  new `builders.py` lines appear in the report as covered;
- `render_reference_index.py --check` reports the references index is current;
- `render_openapi_reference.py --check` reports `docs/reference/http-schema.md is current`.

Record the pytest wall time and total coverage for the hand-off.

- [ ] **Step 2: Web gates for the codegen-touched and store-touched files**

```
npm --prefix web run test
npm --prefix web run typecheck
npm --prefix web run build
```

Expected: `test` passes all stages (clean, `tsc -p tsconfig.test.json`, vitest with coverage,
assert-no-skips, assert-coverage-scope). `typecheck` and `build` exit 0; the existing >500 kB
chunk warning is expected and unchanged.

- [ ] **Step 3: Fullstack gate.** The superposition catalogue and eigenstate metadata changed on
  the wire, and ControlPanel's wiring changed.

Run: `npm --prefix web run test:fullstack`
Expected: the real FastAPI + MkDocs journey passes, followed by `assert-fullstack-run.mjs`. The
superposition step of `web/fullstack-e2e/app.spec.ts` (lines 228-250) still sees the 1s + 2p_z
isosurface: that preset publishes `isosurface`, so the store opens it as before. The first catalogue
request is about 4 s slower (the probe), which is inside the spec's 30 s expect timeout.

- [ ] **Step 4: Exporter smoke run** (Part B's enumerator does not exist in this worktree, so write
  a small `requests.json` by hand)

```
uv run --locked quviz export-static plan --out build/part-a-smoke/data
uv run --locked python -c "import json, pathlib; keys = ['/api/orbitals/catalog', '/api/superposition/catalog', '/api/orbitals/metadata?n=2&l=1&m=0&z=1&basis=real', '/api/orbitals/point-cloud?n=2&l=1&m=0&z=1&basis=real&samples=28000&seed=7', '/api/superposition/isosurface?terms=2%2C0%2C0%2C0.7071067811865476%3B2%2C1%2C0%2C0.7071067811865476&time=0&basis=complex&z=1&a_mu=1&resolution=65&probability_mass=0.9']; pathlib.Path('build/part-a-smoke/data/requests.json').write_text(json.dumps({'format': 'quviz-static-requests/1', 'requests': sorted(keys)}), encoding='utf-8')"
uv run --locked quviz export-static render --data build/part-a-smoke/data --requests build/part-a-smoke/data/requests.json --workers 2
uv run --locked python -c "import json; m = json.load(open('build/part-a-smoke/data/manifest.json', encoding='utf-8')); print(m['format'], m['version'], len(m['entries'])); [print(e['status'], e['content_type'], e['file'], sorted(e['headers']), k[:70]) for k, e in m['entries'].items()]"
```

Expected:
- `plan` prints three `wrote ...` lines, and `catalog-superpositions.json` contains
  `"default_representation":"slice"` for `2s-2pz`;
- `render` prints `export-static render: 5 requests, 2 worker(s)`, five progress lines, a
  per-route summary and `manifest.json: version <16 hex>, 5 entries, 5 files, ...`;
- the manifest listing shows format `quviz-static/1` and these five entries:

| Request | Status | Content type | File |
|---|---|---|---|
| 2s-2pz isosurface | 422 | `application/json` | `files/<24 hex>.json` |
| point cloud | 200 | `application/vnd.quviz.point-cloud` | `files/<24 hex>.bin` |
| metadata | 200 | `application/json` | `files/<24 hex>.json` |
| orbital catalogue | 200 | `application/json` | `files/<24 hex>.json` |
| superposition catalogue | 200 | `application/json` | `files/<24 hex>.json` |

  The point cloud's headers are `['x-quviz-extent-bohr', 'x-quviz-format',
  'x-quviz-radial-mass']`, and its file is 560,016 bytes. The metadata body contains
  `"radial_profile":{"r_bohr":[0.0,`.
- Record the per-route seconds from the log. They are the first measured data points for the full
  `DEFAULT_SPEC` budget: about 1.2k requests, estimated at 9-10 minutes in one process and
  1.5-2 minutes with eight workers.

- [ ] **Step 5: Confirm a clean tree**

Run: `git status --short`
Expected: no output. `build/` and `site/` are gitignored, and every change landed in the commits of
Tasks A1-A11, so this task has nothing to commit. If any gate above failed, fix it in the task that
owns the file, re-run that task's gate, and repeat this task.

---

## Self-review

**Spec coverage (spec section → task):**

| Spec requirement | Tasks |
|---|---|
| §4.1 `catalog_spec.py`, `StaticCatalogSpec` with the v1 contents, written as `spec.json` and embedded in the manifest | A1, A3, A4 |
| §4.1 `static_site.plan(out_dir)`: both catalogue responses via ASGI, plus `spec.json` | A3 |
| §4.1 `render(out_dir, requests, workers)`: process pool, hand-written ASGI scope/receive/send, no httpx at runtime, `status` / `content-type` / `X-QuViz-*` / body written verbatim, content-hash file names, 422 recorded, `manifest.json` with a content-hash `version` | A2, A4 |
| §4.1 CLI `quviz export-static plan\|render` | A5 |
| §4.1 generated data not committed | A12 writes only to gitignored `build/` |
| §4.2 `OrbitalMetadata.radial_profile`: 256 points covering 99.9% mass, P(r) normalised, nodes, `<r>`, most probable r, energy ladder k = 1..max(n+2, 5) | A7, A8 |
| §4.2 refresh `tests/fixtures/openapi.json`, `schema.gen.ts` (codegen) and `http-schema.md` (generator) | A8 and A10 regenerate. The generator is re-run with `--check` and is correctly unchanged, because it renders only query parameters and media types (`scripts/render_openapi_reference.py:91-133`). |
| §4.2 numerical gates: normalisation, node count, `<r>` analytic, plus most-probable r (1s = a/Z, 2p = 4a/Z) and the energy ladder | A7, A8 |
| §5 row 1: reproduce the 2s + 2p_z 422, locate the root cause, then fix; the regression test fails before the fix | A9 reproduction and root cause; A10 server fix, with a Python regression test shown failing first; A11 web fix, with a store regression test shown failing first |
| §6 Python tests: exporter (ASGI identity, 422 recorded, file hash, manifest structure), radial gates, 2s-2pz regression | A2, A4, A7, A8, A9, A10 |
| §6 "pages workflow structure test" | Part E, out of scope |
| §7 risk: precompute cost | A4 (per-route timing log, slow-first submission, spawn pool), A12 (measured smoke numbers and the budget statement), Global Constraints "Budget" |
| Brief item (3): `physics-api.md` `:::` entries and the pinned set `tests/test_mkdocs_system.py:115-140` | A6 |
| Brief item (6): full Python gate, docs gates, npm test and typecheck | A12, plus the per-commit gates |

**Placeholder scan:** none of `TBD`, `TODO`, "add appropriate", "similar to Task" or "write tests
for the above" appears. Every step carries its code or its exact command. Two uses of `<...>` are
not placeholders: `<16 hex>` and `<24 hex>` describe outputs that depend on content hashes, and
`<data>` is the contracts' own name for the output root.

**Interface consistency with `design/plans/2026-09-25-contracts.md`:**
- `quviz export-static plan --out <data>` writes `catalog-orbitals.json`,
  `catalog-superpositions.json` (exact bytes) and `spec.json`. Matches (A3, A5).
- The `spec.json` object matches the contract literal key for key and in key order (A1 test pins
  it).
- `quviz export-static render --data <data> --requests <data>/requests.json [--workers N]`.
  Matches, with `--requests` optionally defaulting to `<data>/requests.json` (A5).
- File naming: `files/<sha256(body)[:24]>.json` for `application/json` bodies, `.bin` otherwise.
  Matches (A4).
- `manifest.json` has exactly `{format: "quviz-static/1", version, spec, entries}`. `version` is
  the first 16 hex of SHA-256 over the sorted (key, file, status) triples, serialised as
  `key\tfile\tstatus\n`; the contract leaves the serialisation open, so this plan fixes it and
  exposes `manifest_version()`. Entries hold `{file, status, content_type, headers}`, where
  `headers` keeps only lower-cased `x-quviz-*`. Keys are copied verbatim from `requests.json`.
  Matches (A4).
- `requests.json` has format `quviz-static-requests/1` and holds a list of strings. Consumed
  as-is, with validation (A4).
- The contract `class RadialProfile` has fields `r_bohr`, `radial_density`, `nodes_bohr`,
  `expectation_r_bohr`, `most_probable_r_bohr` and `energy_levels_hartree`, and
  `OrbitalMetadata.radial_profile: RadialProfile | null`. Matches (A7, A8). The TS type comes from
  the regenerated `schema.gen.ts`, re-exported as `RadialProfile` in `types.ts`.
- Additions not in the contracts, defined here as the contracts file requires. They are listed
  with exact signatures in Global Constraints, "Contract additions owned by Part A", so that the
  contracts file can be amended from one place, and they match Tasks A10 and A11 word for word:
  - `SuperpositionCatalogEntry.default_representation: "isosurface" | "slice"`, required (A10);
  - `SuperpositionDefaultRepresentation` in `types.ts` (A10);
  - the required fifth argument of `setSuperposition` and fourth of
    `syncSuperpositionCapabilities` (A11);
  - `SceneStore.superpositionDefaultRepresentation`, initially `'isosurface'` (A11).

  Parts B and D must pass `entry.default_representation` wherever they apply a preset.
- Deliberate deviations from the spec text (the contracts win), all listed in Global Constraints:
  - the file hash is `sha256(body)[:24]`, not `sha256(key)[:20]`, so identical bodies are
    deduplicated;
  - the manifest has no `generated_by`;
  - `requests.json` holds strings, not `[{route, query}]` objects;
  - the output root is the caller's `<data>` (`build/pages/data/`), not `data/v1/`.
- 404 is fatal. The render aborts on a 404, in addition to 5xx and transport failures (A4
  `_failure`, pinned by the `match="HTTP 404"` test). The contracts' "non-2xx (e.g. 422) are stored"
  is narrower in practice: every status except 404 and 5xx is stored. This is recorded as a binding
  rule in Global Constraints, "Contract additions owned by Part A", because a 404 can only come
  from an enumerator bug.

**Command check (cross-part review fix):** every direct `vitest` and `tsc -p` invocation runs with
the working directory `web/`, spelled `(cd web && npm exec --no -- …)` (A8 Step 8, A10 Steps 6
and 9, A11 Steps 2 and 4), so `web/vitest.config.ts` and `web/tsconfig.test.json` are the ones in
effect. `npm --prefix web exec` keeps the repo root as its working directory (checked with
`npm --prefix web exec --no -- tsc --showConfig`, which fails with TS5081 from the root and prints
the config from `web/`). A10 Step 5 now also runs the `npm --prefix web run typecheck` whose
failure it predicts. `npm --prefix web run <script>` is unchanged because `npm run` executes inside
`web/`.

**Spec gaps outside Part A** (reported by the cross-part review; they belong to other parts and
are not handled here): the enumerator's working directory (B, E), the generated Pages MkDocs
config (C, E), `ParameterBound.step` optionality (B), D's test hooks, the `not_precomputed`
wording (B), the per-chapter physics review and whether appendices count as chapters (C), and
deep-link `t` while playing (B, E).
