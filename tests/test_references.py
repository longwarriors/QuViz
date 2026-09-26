"""The MkDocs citation extension renders known keys and rejects unknown ones.

``markdown`` is imported plainly, not via ``importorskip``: the docs dependency
group is mandatory on every runner, and ``tests/conftest.py`` fails the
session on any skip, so a missing group errors loudly here instead of
silently dropping the gate.
"""

from __future__ import annotations

from pathlib import Path

import pytest
from markdown import Markdown

from quviz.docs.citations import CitationExtension

ROOT = Path(__file__).resolve().parents[1]


def test_citation_extension_renders_known_key() -> None:
    markdown = Markdown(extensions=[CitationExtension(bib_file=str(ROOT / "references.bib"))])
    html = markdown.convert("See [@stodolna2013stark].")
    assert "Stodolna et al., 2013" in html
    assert 'data-cite-keys="stodolna2013stark"' in html
    assert 'href="/references/index.md#stodolna2013stark"' in html


def test_citation_extension_rejects_unknown_key() -> None:
    markdown = Markdown(extensions=[CitationExtension(bib_file=str(ROOT / "references.bib"))])
    with pytest.raises(ValueError, match="unknown citation"):
        markdown.convert("See [@not-a-real-source].")


def test_citation_extension_renders_a_page_or_section_locator() -> None:
    # source-policy.md requires core claims to record a page or section. The
    # syntax has to be able to express one before the policy is enforceable.
    markdown = Markdown(extensions=[CitationExtension(bib_file=str(ROOT / "references.bib"))])
    html = markdown.convert("See [@griffiths2018qm, §4.4.1].")
    assert "2018, §4.4.1" in html
    assert 'data-cite-keys="griffiths2018qm"' in html


def test_citation_extension_renders_locators_for_each_key_in_a_group() -> None:
    markdown = Markdown(extensions=[CitationExtension(bib_file=str(ROOT / "references.bib"))])
    html = markdown.convert("See [@griffiths2018qm, ch. 4; @stodolna2013stark, fig. 2].")
    assert "2018, ch. 4" in html
    assert "Stodolna et al., 2013, fig. 2" in html
    assert 'href="/references/index.md#griffiths2018qm"' in html
    assert 'href="/references/index.md#stodolna2013stark"' in html


def test_citation_extension_rejects_an_unknown_key_that_carries_a_locator() -> None:
    # Previously the strict key pattern simply failed to match a citation with
    # a locator, so it passed through as literal text and escaped validation.
    markdown = Markdown(extensions=[CitationExtension(bib_file=str(ROOT / "references.bib"))])
    with pytest.raises(ValueError, match="unknown citation"):
        markdown.convert("See [@not-a-real-source, p. 1].")


def test_citation_extension_rejects_a_malformed_key() -> None:
    markdown = Markdown(extensions=[CitationExtension(bib_file=str(ROOT / "references.bib"))])
    with pytest.raises(ValueError, match="malformed citation"):
        markdown.convert("See [@griffiths2018qm p. 4].")


def test_citation_extension_typesets_bibtex_ranges_as_en_dashes() -> None:
    # Locators are written the BibTeX way ("131--197"); a reader must see an en
    # dash, not two hyphens. The key, the anchor and the raw locator attribute
    # keep exactly what the source says.
    markdown = Markdown(extensions=[CitationExtension(bib_file=str(ROOT / "references.bib"))])
    html = markdown.convert(
        "See [@griffiths2018qm, ch. 4 (pp. 131--197); "
        "@stodolna2013stark, pp. 213001-1--213001-4, especially Figs. 2--3]."
    )
    assert "Griffiths &amp; Schroeter, 2018, ch. 4 (pp. 131\u2013197)" in html
    assert "Stodolna et al., 2013, pp. 213001-1\u2013213001-4, especially Figs. 2\u20133" in html
    assert 'data-cite-keys="griffiths2018qm;stodolna2013stark"' in html
    assert (
        'data-cite-locators="ch. 4 (pp. 131--197);pp. 213001-1--213001-4, especially Figs. 2--3"'
    ) in html
    assert 'href="/references/index.md#griffiths2018qm"' in html
    assert 'href="/references/index.md#stodolna2013stark"' in html
