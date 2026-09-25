"""scripts/visual-docker.ps1 -- the supported way to run the pixel gate on a dev machine.

web/playwright.config.ts refuses to load off Linux, so the visual suite runs inside the
Playwright image pinned by digest. These tests shadow ``docker`` with a stub (the
technique tests/test_check_script.py uses for uv and npm), so they need pwsh but no
Docker: they pin that the wrapper checks the image's Node against web/package.json's
engines BEFORE anything is installed, passes the pinned mounts and mode through, and
returns the gate's own exit code. The text checks at the end pin that both wrappers run
the image of the exact @playwright/test version the lockfile installs; that pin is a
module-level predicate, and its negative control feeds it sabotaged copies of the real
wrappers and lock (a tag without a digest, twins that disagree, a drifted image version,
a caret range).
"""

from __future__ import annotations

import json
import os
import re
import shutil
import stat
import subprocess
import sys
from collections.abc import Callable
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
PS_WRAPPER = ROOT / "scripts" / "visual-docker.ps1"
SH_WRAPPER = ROOT / "scripts" / "visual-docker.sh"
ENTRY = ROOT / "scripts" / "visual-docker-entry.sh"
WEB_PACKAGE_JSON = ROOT / "web" / "package.json"
VOLUME = "quviz-visual-node-modules"
_IMAGE = re.compile(
    r"mcr\.microsoft\.com/playwright:v(?P<version>\d+\.\d+\.\d+)-noble@sha256:[0-9a-f]{64}"
)


def _write_docker_stub(directory: Path) -> None:
    if sys.platform == "win32":
        (directory / "docker.cmd").write_text(
            "@echo off\r\n"
            'if "%1"=="info" exit /b %STUB_INFO_EXIT%\r\n'
            'echo %* | findstr /C:"node --version" >nul\r\n'
            "if not errorlevel 1 (\r\n"
            "  echo %STUB_NODE_VERSION%\r\n"
            "  exit /b 0\r\n"
            ")\r\n"
            "echo [stub docker] %*\r\n"
            "exit /b %STUB_GATE_EXIT%\r\n",
            encoding="ascii",
        )
    else:
        stub = directory / "docker"
        stub.write_text(
            "#!/bin/sh\n"
            'if [ "$1" = info ]; then exit "$STUB_INFO_EXIT"; fi\n'
            'case "$*" in *"node --version"*) echo "$STUB_NODE_VERSION"; exit 0;; esac\n'
            'echo "[stub docker] $*"\n'
            'exit "$STUB_GATE_EXIT"\n',
            encoding="ascii",
        )
        stub.chmod(stub.stat().st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)


def _run(
    tmp_path: Path, *args: str, node: str = "v24.15.0", info_exit: int = 0, gate_exit: int = 0
) -> subprocess.CompletedProcess[str]:
    pwsh = shutil.which("pwsh")
    assert pwsh, "pwsh is required to exercise scripts/visual-docker.ps1 (as for check.ps1)"
    stubs = tmp_path / "stubs"
    stubs.mkdir(exist_ok=True)
    _write_docker_stub(stubs)
    env = dict(
        os.environ,
        PATH=os.pathsep.join([str(stubs), os.environ.get("PATH", "")]),
        STUB_NODE_VERSION=node,
        STUB_INFO_EXIT=str(info_exit),
        STUB_GATE_EXIT=str(gate_exit),
    )
    return subprocess.run(
        [pwsh, "-NoProfile", "-File", str(PS_WRAPPER), *args],
        cwd=tmp_path,
        env=env,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
    )


def _gate_invocations(stdout: str) -> list[str]:
    return [
        line.removeprefix("[stub docker] ")
        for line in stdout.splitlines()
        if line.startswith("[stub docker] ")
    ]


def test_the_parametrized_node_versions_straddle_the_current_engines_range() -> None:
    engines = json.loads(WEB_PACKAGE_JSON.read_text(encoding="utf-8"))["engines"]["node"]
    assert engines == "^22.22.2 || ^24.15.0 || >=26.0.0", (
        "web/package.json engines changed: move the accepted and rejected versions below to "
        "the new boundaries -- the wrapper reads engines at run time, these cases do not"
    )


@pytest.mark.parametrize("node", ["v22.22.2", "v24.15.0", "v26.0.0"])
def test_a_supported_image_node_reaches_the_gate_with_the_pinned_mounts(
    tmp_path: Path, node: str
) -> None:
    run = _run(tmp_path, node=node)
    assert run.returncode == 0, run.stdout + run.stderr
    gates = _gate_invocations(run.stdout)
    assert len(gates) == 1, run.stdout
    (gate,) = gates
    image = _IMAGE.search(PS_WRAPPER.read_text(encoding="utf-8"))
    assert image is not None
    for expected in (
        "run --rm",
        "-e CI=1",
        "-e QUVIZ_FRESH=0",
        ":/work ",
        f"{VOLUME}:/work/web/node_modules",
        "-w /work ",
        image.group(0),
        "bash scripts/visual-docker-entry.sh check",
    ):
        assert expected in gate, f"{expected!r} missing from: {gate}"


@pytest.mark.parametrize("node", ["v24.14.1", "v22.22.1", "v25.9.0"])
def test_an_image_node_outside_the_engines_range_never_reaches_the_gate(
    tmp_path: Path, node: str
) -> None:
    run = _run(tmp_path, node=node)
    output = run.stdout + run.stderr
    assert run.returncode != 0, output
    assert _gate_invocations(run.stdout) == [], output
    assert node in output and "engines" in output, output


def test_update_mode_and_a_fresh_install_pass_through_and_the_exit_code_is_the_gates(
    tmp_path: Path,
) -> None:
    run = _run(tmp_path, "-Mode", "update", "-Fresh", gate_exit=3)
    assert run.returncode == 3, run.stdout + run.stderr
    (gate,) = _gate_invocations(run.stdout)
    assert "-e QUVIZ_FRESH=1" in gate
    assert gate.endswith("bash scripts/visual-docker-entry.sh update")


def test_a_stopped_docker_daemon_fails_before_any_container_runs(tmp_path: Path) -> None:
    run = _run(tmp_path, info_exit=1)
    output = run.stdout + run.stderr
    assert run.returncode != 0
    assert _gate_invocations(run.stdout) == []
    assert "Docker daemon is not running" in output, output


def test_an_unknown_mode_is_rejected(tmp_path: Path) -> None:
    run = _run(tmp_path, "-Mode", "bogus")
    output = run.stdout + run.stderr
    assert run.returncode != 0
    assert _gate_invocations(run.stdout) == []
    # pwsh's ValidateSet error quotes the rejected value and the accepted set; a missing
    # script's error would name neither.
    assert "bogus" in output and "check,update" in output, output


def image_pin_problems(ps_text: str, sh_text: str, locked: str) -> list[str]:
    """Why the wrappers' image is not the locked Playwright's, pinned by digest ([] if it is)."""
    if not re.fullmatch(r"\d+\.\d+\.\d+", locked):
        return ["@playwright/test must stay exactly pinned"]
    ps_image = _IMAGE.search(ps_text)
    sh_image = _IMAGE.search(sh_text)
    if ps_image is None or sh_image is None:
        return ["both wrappers must name the Playwright image by exact version and sha256 digest"]
    problems: list[str] = []
    if ps_image.group(0) != sh_image.group(0):
        problems.append(f"the wrappers run different images: {ps_image[0]} vs {sh_image[0]}")
    if ps_image.group("version") != locked:
        problems.append(
            f"the visual image is Playwright {ps_image.group('version')} but web/package.json "
            f"pins {locked}; browser builds differ per version, so the baselines would be drawn "
            "by a Chromium the suite does not install"
        )
    return problems


def _pinned_inputs() -> tuple[str, str, str]:
    locked = json.loads(WEB_PACKAGE_JSON.read_text(encoding="utf-8"))["devDependencies"][
        "@playwright/test"
    ]
    return (
        PS_WRAPPER.read_text(encoding="utf-8"),
        SH_WRAPPER.read_text(encoding="utf-8"),
        locked,
    )


def test_both_wrappers_run_the_image_of_the_locked_playwright() -> None:
    assert image_pin_problems(*_pinned_inputs()) == []


_DIGEST = re.compile(r"@sha256:[0-9a-f]{64}")


@pytest.mark.parametrize(
    ("sabotage", "expected"),
    [
        pytest.param(
            lambda ps, sh, locked: (_DIGEST.sub("", ps), sh, locked),
            "by exact version and sha256 digest",
            id="tag-only-image",
        ),
        pytest.param(
            lambda ps, sh, locked: (ps, _DIGEST.sub("@sha256:" + "0" * 64, sh), locked),
            "the wrappers run different images",
            id="twins-disagree",
        ),
        pytest.param(
            lambda ps, sh, locked: (
                ps.replace(f"v{locked}-noble", "v1.0.0-noble"),
                sh.replace(f"v{locked}-noble", "v1.0.0-noble"),
                locked,
            ),
            "the visual image is Playwright 1.0.0",
            id="image-version-drift",
        ),
        pytest.param(
            lambda ps, sh, locked: (ps, sh, f"^{locked}"),
            "must stay exactly pinned",
            id="caret-lock",
        ),
    ],
)
def test_a_drifted_image_pin_is_rejected(
    sabotage: Callable[[str, str, str], tuple[str, str, str]], expected: str
) -> None:
    real = _pinned_inputs()
    sabotaged = sabotage(*real)
    assert sabotaged != real, "the sabotage changed nothing, so this control proves nothing"
    problems = image_pin_problems(*sabotaged)
    assert any(expected in problem for problem in problems), problems


def test_the_posix_twin_mirrors_the_powershell_wrapper() -> None:
    posix = SH_WRAPPER.read_text(encoding="utf-8")
    for fragment in (
        VOLUME,
        "bash scripts/visual-docker-entry.sh",
        "-e CI=1",
        "QUVIZ_FRESH",
        "node --version",
        "web/package.json",
    ):
        assert fragment in posix, fragment


def test_the_container_entry_runs_exactly_the_visual_npm_scripts() -> None:
    entry = ENTRY.read_text(encoding="utf-8")
    assert "npm ci --no-audit --no-fund" in entry
    assert "npm run test:visual || status=$?" in entry
    assert "{ npm run test:visual:update && npm run test:visual; } || status=$?" in entry
