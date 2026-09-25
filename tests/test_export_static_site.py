"""``quviz.export.static_site``: catalogue planning and request replay."""

from __future__ import annotations

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


@pytest.mark.parametrize("status", [500, 503])
def test_a_5xx_replay_fails_naming_the_key_status_and_body(status: int) -> None:
    replay = static_site._Replay(METADATA, status, "text/plain", (), b"boom", 0.0, None)
    assert static_site._failure(replay) == f"{METADATA}: HTTP {status}: boom"


@pytest.mark.parametrize("status", [499, 405])
def test_a_non_5xx_non_404_replay_is_publishable(status: int) -> None:
    replay = static_site._Replay(METADATA, status, "text/plain", (), b"ok", 0.0, None)
    assert static_site._failure(replay) is None


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
    same = static_site._store_body(tmp_path, b'{"a":1}', "application/json; charset=utf-8", written)
    assert same == name
    (tmp_path / name).write_bytes(b"tampered")
    with pytest.raises(StaticExportError, match="collision"):
        static_site._store_body(tmp_path, b'{"a":1}', "application/json", written)
