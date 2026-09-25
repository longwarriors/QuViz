"""Numerical gates for the published radial distribution ``P(r) = r^2 |R_nl|^2``.

Every expected value comes from an independent route, never from the builder
under test: closed-form Laguerre roots, the analytic incomplete-gamma radial
tail in :mod:`quviz.physics.finite_box`, direct evaluations of ``R_nl`` for the
sign changes, and textbook maxima of ``P(r)``.
"""

from __future__ import annotations

import warnings
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


def test_an_energy_ladder_or_normalisation_check_that_leaves_float64_yields_no_profile() -> None:
    # In every case below the radii and P(r) values themselves are finite, and
    # the answer must still be a quiet None, never an exception or a warning.
    with warnings.catch_warnings():
        warnings.simplefilter("error")
        # 1 / a_mu overflows, so no reduced-mass ratio exists for the ladder.
        assert radial_profile(12, 0, z=1.0, a_mu=1e-309) is None
        # 1 / a_mu fits, but the deepest level E_1 = -Z^2 / (2 a_mu) does not.
        assert radial_profile(12, 0, z=20.0, a_mu=1e-307) is None
        # P(r) of 1s peaks near 9e307: every value fits, the trapezoid sum does not.
        assert radial_profile(1, 0, z=1.0, a_mu=6e-309) is None


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
