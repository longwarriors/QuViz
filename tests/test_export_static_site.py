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
