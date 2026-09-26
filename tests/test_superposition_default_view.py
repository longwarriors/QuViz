"""Why the 2s + 2p_z catalogue preset must not open on its isosurface.

Reproduction (2026-09-25; numpy 2.5.2, scikit-image 0.26.0). Picking this
preset from the default superposition view -- whose fallback representation
is the isosurface (``web/src/state/useSceneStore.ts`` ``ALWAYS_AVAILABLE``) --
sends the route-default request ``resolution=65, probability_mass=0.90,
time=0, basis=complex, Z = a_mu = 1``, and the server refuses it with 422.

Root cause (corrected 2026-09-26: an earlier account blamed a saddle of
``|Psi|^2`` near the 0.90 level; there is none). At t = 0 the state is real,
``Psi = (psi_2s + psi_2p0) / sqrt(2) = (2 - r + z) exp(-r/2) / (8 sqrt(pi))``
with Z = a_mu = 1. ``grad Psi`` vanishes only at (0, 0, -3), the extremum of
the negative lobe (``|Psi|^2 = e^-3 / (4 pi) = 3.96e-3 bohr^-3``), and the
origin is a cusp maximum (1.99e-2). ``|Psi|^2`` therefore has no saddle at any
positive level: every level below 3.96e-3 bounds exactly two ball-like
components, and the converged per-component Euler-characteristic signature
is (2, 2).

What the capped grid sees is a different matter. ``|Psi|^2`` has a double
zero on the nodal paraboloid ``r = 2 + z`` (vertex (0, 0, -1)). At the 0.90
level (``c = 8.07e-5 bohr^-3`` on the 137 grid) the two components are
separated at that vertex by a gap of only ``sqrt(64 pi e c)`` ~ 0.21 bohr,
narrower than both spacings of the finest-two schedule (129, 137) that the
workload estimator selects for any multi-term state with an excited-s
component: 0.310 and 0.292 bohr. Whether a sample lands inside the gap depends
on how the grid falls, so marching cubes on ``|Psi|^2`` bridges the lobes on
some grids and not on others: (2, 2) at 129 and 145, (-14,) at 137, (-12,) at
161, (-4,) at 181, and (2, 2) again at 201 and 257, whose spacings (0.198 and
0.155 bohr) are below the gap. Contouring the signed real wavefunction at
``+/-sqrt(c)`` gives (2, 2) on every one of those grids, 137 included.

The route answers 200 at 0.85 and below and inside the isolated 0.911-0.912
window, 422 from the two-grid gate on 0.86-0.91 and at 0.915, and 422 before
building from 0.92 upwards (the radial oracle asks for more than the 137 cap).

So the gate is right: the topology at 0.90 is well defined and converges, but
the capped ``|Psi|^2`` builder cannot deliver it, and a "safe" mass would be an
island rather than a range. A builder that contoured ``Re(exp(-i phi) Psi)`` at
``+/-sqrt(c)`` for a state that is real up to one global phase, or refined the
grid near nodal surfaces, could publish it. These tests pin the gate so that
it cannot be loosened by accident, and pin the mechanism so that this account
is checked by code rather than asserted in prose.

Fix: ``GET /api/superposition/catalog`` publishes ``default_representation``,
probed by running exactly that route-default request through the route's own
workload guard and builder (complex, then real; the first refusal publishes
``"slice"``; the answer is cached per process). 2s + 2p_z publishes
``"slice"``; the web store opens the published default instead of the
isosurface when a preset is applied or superposition mode is entered.
"""

from __future__ import annotations

from typing import Any

import numpy as np
import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from skimage.measure import marching_cubes

from quviz.api import routes as routes_module
from quviz.api.app import create_app
from quviz.conventions import BasisKind
from quviz.physics.hydrogenic import cartesian_to_spherical
from quviz.physics.observables import probability_density
from quviz.scene import builders as scene_builders

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


def _component_signature(field: np.ndarray, level: float, spacing: float) -> tuple[int, ...]:
    _, faces, _, _ = marching_cubes(field.astype(np.float32), level=level, spacing=(spacing,) * 3)
    return scene_builders._mesh_component_euler_characteristics(faces)


def test_the_refusal_is_a_sub_grid_gap_across_the_nodal_paraboloid_not_a_topology_change() -> None:
    state = routes_module._parse_superposition(DEGENERATE_TERMS, BasisKind.COMPLEX, maximum_n=4)
    extent = scene_builders.superposition_extent(state)
    axis = np.linspace(-extent, extent, 137)
    spacing = float(axis[1] - axis[0])
    x, y, z = np.meshgrid(axis, axis, axis, indexing="ij")
    radius, theta, phi = cartesian_to_spherical(x, y, z)
    psi = state.evaluate(radius, theta, phi, time=0.0)
    density = probability_density(psi)
    level, _, _ = scene_builders._density_threshold_for_mass(
        density, scene_builders._simpson_weights_3d(137, spacing), 0.9
    )

    # Real up to one global phase, and exactly the closed form the docstring uses.
    aligned = psi * np.exp(-1j * np.angle(psi.flat[np.argmax(np.abs(psi))]))
    assert float(np.max(np.abs(aligned.imag))) <= 1e-12 * float(np.max(np.abs(psi)))
    closed_form = (2.0 - radius + z) * np.exp(-radius / 2.0) / (8.0 * np.sqrt(np.pi))
    np.testing.assert_allclose(aligned.real, closed_form, rtol=0.0, atol=1e-12)

    # The gap the level leaves at the paraboloid vertex (0, 0, -1) is below the spacing...
    assert 0.20 < np.sqrt(64.0 * np.pi * np.e * level) < 0.22 < spacing
    # ...so |Psi|^2 bridges the two lobes on this grid, while the signed wavefunction,
    # contoured at the same level on the same grid, has the true two-ball topology.
    assert _component_signature(density, level, spacing) != (2, 2)
    root = float(np.sqrt(level))
    signed = _component_signature(aligned.real, root, spacing) + _component_signature(
        aligned.real, -root, spacing
    )
    assert tuple(sorted(signed)) == (2, 2)


def test_the_same_gate_accepts_a_level_whose_nodal_gap_the_grid_resolves() -> None:
    # At 0.80 the gap across the nodal paraboloid is ~0.34 bohr, wider than both
    # scheduled spacings (0.310 and 0.292 bohr).
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
