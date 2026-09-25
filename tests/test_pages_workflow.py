"""Pins on .github/workflows/pages.yml, the publisher of the static textbook site.

It is a publisher, not a gate: CLAUDE.md makes local verification final, and a site is
releasable once `scripts/build_pages.py` and `npm run test:pages` pass locally. What is
pinned here is therefore what makes a deployment *that* site: it runs only for master (or
by hand), rebuilds everything from the checkout with the same script (never --skip-data),
takes its public URL from actions/configure-pages, uploads exactly build/pages, and hands
write access only to the job that deploys. The workflow-wide rules (locked installs, one
setup-uv release) live in tests/test_ci_workflows.py and already glob this file; its
setup-node pin lives in tests/test_declared_versions.py.

As in the sibling modules, the predicate is a module-level function, and every rule has a
negative control that feeds it a sabotaged copy of the real workflow.
"""

from __future__ import annotations

import copy
import re
from collections.abc import Callable
from pathlib import Path
from typing import Any

import pytest
import yaml

ROOT = Path(__file__).resolve().parents[1]
PAGES_WORKFLOW = ROOT / ".github" / "workflows" / "pages.yml"

#: ``on:`` parses to the YAML 1.1 boolean ``True``.
_ON_KEY = True

BUILD_COMMAND = 'uv run --locked --no-sync python scripts/build_pages.py --site-url "$SITE_URL"'
SITE_URL_INPUT = "${{ steps.pages.outputs.base_url }}"
PAGE_URL_OUTPUT = "${{ steps.deployment.outputs.page_url }}"

#: The build job's steps, in order: ``uses`` entries match by action prefix, ``run``
#: entries match the whitespace-normalised script exactly.
BUILD_STEPS: tuple[tuple[str, str], ...] = (
    ("uses", "actions/checkout@"),
    ("uses", "astral-sh/setup-uv@"),
    ("uses", "actions/setup-node@"),
    ("run", "uv sync --locked --all-groups"),
    ("run", "npm --prefix web ci --no-audit --no-fund"),
    ("uses", "actions/configure-pages@"),
    ("run", BUILD_COMMAND),
    ("uses", "actions/upload-pages-artifact@"),
)

_RELEASE_TAG = re.compile(r"^[\w.-]+/[\w.-]+@v\d+(?:\.\d+\.\d+)?$")


def _load() -> dict[str, Any]:
    assert PAGES_WORKFLOW.is_file(), f"{PAGES_WORKFLOW} does not exist"
    parsed = yaml.safe_load(PAGES_WORKFLOW.read_text(encoding="utf-8"))
    assert isinstance(parsed, dict), f"{PAGES_WORKFLOW} does not parse as a mapping"
    return parsed


def _normalise(script: object) -> str:
    return " ".join(str(script).split())


def _steps(job: dict[str, Any]) -> list[dict[str, Any]]:
    steps = job.get("steps")
    return [step for step in steps if isinstance(step, dict)] if isinstance(steps, list) else []


def _matches(step: dict[str, Any], kind: str, value: str) -> bool:
    if kind == "uses":
        return str(step.get("uses", "")).startswith(value)
    return "uses" not in step and _normalise(step.get("run", "")) == value


def _build_problems(job: dict[str, Any]) -> list[str]:
    problems: list[str] = []
    if job.get("runs-on") != "ubuntu-latest":
        problems.append(f"build job must run on ubuntu-latest, found {job.get('runs-on')!r}")
    if job.get("permissions") != {"contents": "read", "pages": "read"}:
        problems.append(
            "build job permissions must be exactly contents: read and pages: read "
            f"(configure-pages only reads the site); found {job.get('permissions')!r}"
        )
    steps = _steps(job)
    for step in steps:
        script = _normalise(step.get("run", ""))
        if "build_pages.py" in script and ("--skip-data" in script or "--serve" in script):
            problems.append(
                "the deploy build must regenerate the data from this checkout: "
                "no --skip-data or --serve"
            )
    if len(steps) != len(BUILD_STEPS) or not all(
        _matches(step, kind, value) for step, (kind, value) in zip(steps, BUILD_STEPS, strict=False)
    ):
        shape = [str(step.get("uses") or _normalise(step.get("run", ""))) for step in steps]
        problems.append(f"build steps must be, in order, {BUILD_STEPS}; found {shape}")
    configure = [s for s in steps if str(s.get("uses", "")).startswith("actions/configure-pages@")]
    if not configure or configure[0].get("id") != "pages":
        problems.append("the actions/configure-pages step must have id `pages`")
    build = [s for s in steps if "build_pages.py" in _normalise(s.get("run", ""))]
    if not build or build[0].get("env") != {"SITE_URL": SITE_URL_INPUT}:
        problems.append(f"the build step must take SITE_URL from {SITE_URL_INPUT} (base_url)")
    upload = [
        s for s in steps if str(s.get("uses", "")).startswith("actions/upload-pages-artifact@")
    ]
    if not upload or (upload[0].get("with") or {}).get("path") != "build/pages":
        problems.append("actions/upload-pages-artifact must upload exactly build/pages")
    return problems


def _deploy_problems(job: dict[str, Any]) -> list[str]:
    problems: list[str] = []
    if job.get("needs") != "build":
        problems.append(f"deploy needs build, found needs = {job.get('needs')!r}")
    if job.get("runs-on") != "ubuntu-latest":
        problems.append(f"deploy job must run on ubuntu-latest, found {job.get('runs-on')!r}")
    if job.get("permissions") != {"pages": "write", "id-token": "write"}:
        problems.append(
            "deploy job permissions must be exactly pages: write and id-token: write; "
            f"found {job.get('permissions')!r}"
        )
    if job.get("environment") != {"name": "github-pages", "url": PAGE_URL_OUTPUT}:
        problems.append(
            f"deploy must use the github-pages environment with url {PAGE_URL_OUTPUT}; "
            f"found {job.get('environment')!r}"
        )
    steps = _steps(job)
    if (
        len(steps) != 1
        or not str(steps[0].get("uses", "")).startswith("actions/deploy-pages@")
        or steps[0].get("id") != "deployment"
    ):
        problems.append("deploy must be exactly one actions/deploy-pages step with id deployment")
    return problems


def _escape_problems(name: str, job: dict[str, Any]) -> list[str]:
    problems = [
        f"`{name}` job carries `{escape}`; a publisher step must not be conditional or advisory"
        for escape in ("if", "continue-on-error")
        if escape in job
    ]
    for index, step in enumerate(_steps(job)):
        problems += [
            f"`{name}` job step {index} carries `{escape}`"
            for escape in ("if", "continue-on-error")
            if escape in step
        ]
    return problems


def _pin_problems(name: str, job: dict[str, Any]) -> list[str]:
    return [
        f"`{name}` job uses {step['uses']!r}, which is not pinned to a release tag"
        for step in _steps(job)
        if "uses" in step and not _RELEASE_TAG.match(str(step["uses"]))
    ]


def pages_workflow_problems(workflow: dict[str, Any]) -> list[str]:
    """Every way ``workflow`` differs from the reviewed Pages publisher."""

    problems: list[str] = []
    triggers = workflow.get(_ON_KEY)
    if not isinstance(triggers, dict) or set(triggers) != {"push", "workflow_dispatch"}:
        problems.append(
            "triggers must be exactly push and workflow_dispatch; a pull request must never "
            f"deploy. Found {triggers!r}"
        )
    elif triggers["push"] != {"branches": ["master"]}:
        problems.append(f"push must be limited to branches [master]; found {triggers['push']!r}")
    if workflow.get("permissions") != {"contents": "read"}:
        problems.append(
            "top-level permissions must be exactly contents: read, so no job inherits write "
            f"access; found {workflow.get('permissions')!r}"
        )
    if workflow.get("concurrency") != {"group": "pages", "cancel-in-progress": False}:
        problems.append(
            "concurrency must be group `pages` with cancel-in-progress false, so a running "
            f"deployment is never cut off; found {workflow.get('concurrency')!r}"
        )
    jobs = workflow.get("jobs")
    if not isinstance(jobs, dict) or set(jobs) != {"build", "deploy"}:
        found = sorted(jobs) if isinstance(jobs, dict) else jobs
        problems.append(f"jobs must be exactly build and deploy; found {found!r}")
        return problems
    problems += _build_problems(jobs["build"])
    problems += _deploy_problems(jobs["deploy"])
    for name, job in jobs.items():
        problems += _escape_problems(str(name), job)
        problems += _pin_problems(str(name), job)
    return problems


def test_the_pages_workflow_publishes_only_the_locally_verified_build() -> None:
    assert pages_workflow_problems(_load()) == []


def _step(workflow: dict[str, Any], job: str, needle: str) -> dict[str, Any]:
    return next(
        step
        for step in workflow["jobs"][job]["steps"]
        if needle in str(step.get("uses", "")) or needle in _normalise(step.get("run", ""))
    )


def _remove_configure_pages(workflow: dict[str, Any]) -> None:
    workflow["jobs"]["build"]["steps"].remove(_step(workflow, "build", "configure-pages"))


MUTATIONS: list[tuple[str, Callable[[dict[str, Any]], object], str]] = [
    ("pull_request trigger", lambda wf: wf[_ON_KEY].update({"pull_request": None}), "triggers"),
    ("push to every branch", lambda wf: wf[_ON_KEY].update({"push": None}), "push must be limited"),
    (
        "write access for every job",
        lambda wf: wf.update({"permissions": {"contents": "read", "pages": "write", "id-token": "write"}}),
        "top-level permissions",
    ),
    (
        "OIDC token in the build job",
        lambda wf: wf["jobs"]["build"]["permissions"].update({"id-token": "write"}),
        "build job permissions",
    ),
    ("no concurrency group", lambda wf: wf.pop("concurrency"), "concurrency"),
    (
        "cancel an in-flight deployment",
        lambda wf: wf["concurrency"].update({"cancel-in-progress": True}),
        "concurrency",
    ),
    ("deploy without needs", lambda wf: wf["jobs"]["deploy"].pop("needs"), "needs"),
    (
        "another environment",
        lambda wf: wf["jobs"]["deploy"]["environment"].update({"name": "production"}),
        "github-pages",
    ),
    (
        "skip-data deploy",
        lambda wf: _step(wf, "build", "build_pages.py").update({"run": BUILD_COMMAND + " --skip-data"}),
        "--skip-data",
    ),
    (
        "site URL not from configure-pages",
        lambda wf: _step(wf, "build", "build_pages.py").update({"env": {"SITE_URL": "https://example.org/"}}),
        "base_url",
    ),
    (
        "wrong artifact path",
        lambda wf: _step(wf, "build", "upload-pages-artifact").update({"with": {"path": "build"}}),
        "build/pages",
    ),
    (
        "conditional build step",
        lambda wf: _step(wf, "build", "build_pages.py").update({"if": "always()"}),
        "`if`",
    ),
    (
        "advisory deploy job",
        lambda wf: wf["jobs"]["deploy"].update({"continue-on-error": True}),
        "continue-on-error",
    ),
    (
        "floating action ref",
        lambda wf: _step(wf, "deploy", "deploy-pages").update({"uses": "actions/deploy-pages@main"}),
        "release tag",
    ),
    ("configure-pages removed", _remove_configure_pages, "build steps must be"),
    (
        "an extra job",
        lambda wf: wf["jobs"].update({"lint": {"runs-on": "ubuntu-latest", "steps": [{"run": "true"}]}}),
        "jobs must be exactly",
    ),
]  # fmt: skip


@pytest.mark.parametrize(
    ("label", "mutate", "expected"), MUTATIONS, ids=[label for label, _, _ in MUTATIONS]
)
def test_a_drifted_pages_workflow_is_rejected(
    label: str, mutate: Callable[[dict[str, Any]], object], expected: str
) -> None:
    workflow = copy.deepcopy(_load())
    mutate(workflow)
    problems = pages_workflow_problems(workflow)
    assert any(expected in problem for problem in problems), f"{label}: {problems}"
