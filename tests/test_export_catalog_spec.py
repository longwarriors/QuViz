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


def test_json_list_values_are_plain_strings_not_enum_members() -> None:
    """Every serialised StrEnum list holds ``str``, not an enum member.

    ``StrEnum`` members already equal their value under ``==`` and JSON-encode
    identically, so a substring check on the dumped text cannot tell a plain
    string from an enum member that slipped through ``to_json()`` unconverted.
    Checking ``type(v) is str`` on each list element can.
    """

    serialised = DEFAULT_SPEC.to_json()
    eigenstates = serialised["eigenstates"]
    superpositions = serialised["superpositions"]
    checked_lists = [
        eigenstates["bases"],
        eigenstates["representations"],
        eigenstates["planes"],
        eigenstates["observables"],
        superpositions["representations"],
        superpositions["planes"],
        superpositions["observables"],
    ]
    for values in checked_lists:
        for value in values:
            assert type(value) is str


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
        eigenstates=dataclasses.replace(DEFAULT_SPEC.eigenstates, n_max=2, bases=(BasisKind.REAL,)),
        superpositions=dataclasses.replace(DEFAULT_SPEC.superpositions, presets=("1s-2pz",)),
    )
    payload = narrow.to_json()
    assert payload["eigenstates"]["n_max"] == 2
    assert payload["eigenstates"]["bases"] == ["real"]
    assert payload["superpositions"]["presets"] == ["1s-2pz"]
    assert payload["superpositions"]["frames"] == PLAYBACK_LATTICE
