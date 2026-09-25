"""Backend-free export of the scene API for the GitHub Pages textbook site.

``quviz.export.catalog_spec`` says what is precomputed, ``quviz.export.asgi``
replays one request through the real application in-process, and
``quviz.export.static_site`` turns a request list into content-addressed files
plus ``manifest.json``. The package re-exports nothing on purpose: importing the
specification must not import FastAPI.
"""
