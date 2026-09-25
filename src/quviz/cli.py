"""QuViz command-line interface."""

from __future__ import annotations

from pathlib import Path
from typing import Annotated

import numpy as np
import typer
import uvicorn

from quviz import __version__
from quviz.conventions import BasisKind
from quviz.sampling.point_cloud import sample_orbital_point_cloud

app = typer.Typer(no_args_is_help=True, pretty_exceptions_show_locals=False)


@app.command()
def version() -> None:
    """Print the installed QuViz version."""

    typer.echo(__version__)


@app.command()
def serve(
    host: Annotated[str, typer.Option(help="Bind address.")] = "127.0.0.1",
    port: Annotated[int, typer.Option(min=1, max=65535, help="HTTP port.")] = 8000,
    reload: Annotated[bool, typer.Option(help="Reload when Python files change.")] = False,
) -> None:
    """Run the scientific API and, when built, the production frontend."""

    reload_dirs = [str(Path(__file__).resolve().parent)] if reload else None
    uvicorn.run(
        "quviz.api.app:app",
        host=host,
        port=port,
        reload=reload,
        reload_dirs=reload_dirs,
    )


@app.command()
def sample(
    output: Annotated[Path, typer.Argument()] = Path("outputs/orbital_points.npz"),
    n: Annotated[int, typer.Option()] = 2,
    l: Annotated[int, typer.Option()] = 1,
    m: Annotated[int, typer.Option()] = 0,
    basis: Annotated[BasisKind, typer.Option()] = BasisKind.REAL,
    count: Annotated[int, typer.Option(min=100, max=200_000)] = 20_000,
    seed: Annotated[int, typer.Option(min=0)] = 7,
) -> None:
    """Export a reproducible point cloud for offline analysis."""

    cloud = sample_orbital_point_cloud(n, l, m, basis=basis, count=count, seed=seed)
    output.parent.mkdir(parents=True, exist_ok=True)
    np.savez_compressed(
        output,
        positions=cloud.positions,
        intensity=cloud.intensity,
        phase=cloud.phase,
        radial_mass_captured=cloud.radial_mass_captured,
    )
    typer.echo(str(output))


@app.command()
def doctor() -> None:
    """Check the repository's expected development assets."""

    root = Path(__file__).resolve().parents[2]
    checks = {
        "references.bib": root / "references.bib",
        "mkdocs.yml": root / "mkdocs.yml",
        "frontend package": root / "web" / "package.json",
        "frontend build": root / "web" / "dist" / "index.html",
    }
    for label, path in checks.items():
        status = "ok" if path.exists() else "missing"
        typer.echo(f"{label:20s} {status:8s} {path}")


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
