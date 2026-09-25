from __future__ import annotations

import json
from pathlib import Path

import numpy as np
from typer.testing import CliRunner

import quviz.cli as cli_module
from quviz import __version__
from quviz.cli import app

runner = CliRunner()


def test_version_command() -> None:
    result = runner.invoke(app, ["version"])
    assert result.exit_code == 0
    assert result.stdout.strip() == __version__


def test_sample_command_writes_reproducible_npz(tmp_path: Path) -> None:
    output = tmp_path / "nested" / "cloud.npz"
    result = runner.invoke(
        app,
        [
            "sample",
            str(output),
            "--n",
            "1",
            "--l",
            "0",
            "--m",
            "0",
            "--count",
            "100",
            "--seed",
            "4",
        ],
    )
    assert result.exit_code == 0, result.stdout
    assert output.exists()
    with np.load(output) as payload:
        assert payload["positions"].shape == (100, 3)
        assert payload["intensity"].shape == (100,)
        assert float(payload["radial_mass_captured"]) > 0.999


def test_serve_command_forwards_options(monkeypatch) -> None:
    calls: list[tuple[str, str, int, bool, list[str] | None]] = []

    def fake_run(
        target: str,
        *,
        host: str,
        port: int,
        reload: bool,
        reload_dirs: list[str] | None,
    ) -> None:
        calls.append((target, host, port, reload, reload_dirs))

    monkeypatch.setattr("quviz.cli.uvicorn.run", fake_run)
    result = runner.invoke(app, ["serve", "--host", "0.0.0.0", "--port", "8123", "--reload"])
    assert result.exit_code == 0, result.stdout
    source_package = str(Path(cli_module.__file__).resolve().parent)
    assert calls == [("quviz.api.app:app", "0.0.0.0", 8123, True, [source_package])]


def test_serve_without_reload_does_not_configure_a_watch_directory(monkeypatch) -> None:
    calls: list[tuple[bool, list[str] | None]] = []

    def fake_run(
        target: str,
        *,
        host: str,
        port: int,
        reload: bool,
        reload_dirs: list[str] | None,
    ) -> None:
        assert target == "quviz.api.app:app"
        assert host == "127.0.0.1"
        assert port == 8000
        calls.append((reload, reload_dirs))

    monkeypatch.setattr("quviz.cli.uvicorn.run", fake_run)
    result = runner.invoke(app, ["serve"])
    assert result.exit_code == 0, result.stdout
    assert calls == [(False, None)]


def test_doctor_reports_repository_assets() -> None:
    result = runner.invoke(app, ["doctor"])
    assert result.exit_code == 0
    for label in ("references.bib", "mkdocs.yml", "frontend package", "frontend build"):
        line = next(line for line in result.stdout.splitlines() if label in line)
        assert {"ok", "missing"} & set(line.split())


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


def test_export_static_render_defaults_requests_and_workers(tmp_path: Path, monkeypatch) -> None:
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


def test_export_static_render_workers_option_max_matches_static_site() -> None:
    """Controller ruling A5: the --workers ceiling must track static_site.MAXIMUM_WORKERS."""

    from typer.main import get_command

    from quviz.export import static_site

    command = get_command(app)
    render_command = command.commands["export-static"].commands["render"]
    workers_param = next(p for p in render_command.params if p.name == "workers")
    assert workers_param.type.max == static_site.MAXIMUM_WORKERS
