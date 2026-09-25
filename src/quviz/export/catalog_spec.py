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
        _require_kind("superpositions.representations", self.representations, RepresentationKind)
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
