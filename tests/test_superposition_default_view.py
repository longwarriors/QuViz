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

Fix: ``GET /api/superposition/catalog`` publishes ``default_representation``,
probed by running exactly that route-default request through the route's own
workload guard and builder (complex, then real; the first refusal publishes
``"slice"``; the answer is cached per process). 2s + 2p_z publishes
``"slice"``; the web store opens the published default instead of the
isosurface when a preset is applied or superposition mode is entered.
"""

from __future__ import annotations

from typing import Any

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from quviz.api import routes as routes_module
from quviz.api.app import create_app
from quviz.conventions import BasisKind

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
