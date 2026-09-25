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
