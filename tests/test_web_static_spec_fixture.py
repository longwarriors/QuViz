"""The web's spec.json fixture is Part A's DEFAULT_SPEC, byte for byte.

``web/tools/fixtures/spec.json`` feeds the web specs (the static capability
overlay, the static catalogue, the store pins, the entry point) and the
1242-request enumeration smoke. ``quviz export-static plan`` writes the real
``spec.json`` from ``DEFAULT_SPEC``. Nothing else ties the two, so a change on
either side fails here instead of letting the web specs pass against a
specification the exporter no longer writes.

After an intended change to ``DEFAULT_SPEC``, regenerate the fixture from the
repository root and review the web specs that read it::

    uv run --locked --no-sync python -c "from pathlib import Path; from quviz.export.catalog_spec import DEFAULT_SPEC, spec_json_text; Path('web/tools/fixtures/spec.json').write_bytes(spec_json_text(DEFAULT_SPEC).encode('utf-8'))"
"""

from __future__ import annotations

from pathlib import Path

from quviz.export.catalog_spec import DEFAULT_SPEC, spec_json_text

ROOT = Path(__file__).resolve().parents[1]
WEB_SPEC_FIXTURE = ROOT / "web" / "tools" / "fixtures" / "spec.json"


def test_web_spec_fixture_is_the_exported_default_spec_byte_for_byte() -> None:
    expected = spec_json_text(DEFAULT_SPEC).encode("utf-8")
    assert WEB_SPEC_FIXTURE.read_bytes() == expected, (
        "web/tools/fixtures/spec.json differs from spec_json_text(DEFAULT_SPEC); regenerate it "
        "with the command in this module's docstring"
    )
