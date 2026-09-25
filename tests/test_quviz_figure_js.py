"""Behaviour of ``docs/assets/javascripts/quviz-figure.js`` under a minimal fake DOM.

The script runs on every textbook page. No browser is needed to prove its URL
arithmetic and DOM contract: a small fake DOM in Node executes the real file.
Node is already a hard requirement of this repository (``web/``). As with
``pwsh`` in ``tests/test_check_script.py``, a missing ``node`` is a failure,
never a skip.
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "docs" / "assets" / "javascripts" / "quviz-figure.js"

HARNESS = r"""
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')

const SOURCE = fs.readFileSync(process.env.QUVIZ_FIGURE_JS, 'utf8')

function matches(node, selector) {
  const parsed = /^([a-z]+)?((?:\.[\w-]+)*)((?:\[[^\]]+\])*)$/.exec(selector)
  if (!parsed) throw new Error(`fake DOM: unsupported selector ${selector}`)
  const [, tag, classes, attributes] = parsed
  if (tag && node.tagName !== tag.toUpperCase()) return false
  const own = String(node.className || '').split(/\s+/)
  for (const name of classes.split('.').filter(Boolean)) if (!own.includes(name)) return false
  for (const raw of attributes.match(/\[[^\]]+\]/g) || []) {
    const [, name, value] = /^\[([\w-]+)(?:="([^"]*)")?\]$/.exec(raw)
    if (!node.hasAttribute(name)) return false
    if (value !== undefined && node.getAttribute(name) !== value) return false
  }
  return true
}

class FakeElement {
  constructor(tag) {
    this.tagName = tag.toUpperCase()
    this.className = ''
    this.hidden = false
    this.disabled = false
    this.children = []
    this.parentNode = null
    this.attributes = new Map()
    this.listeners = new Map()
    this.ownText = ''
  }
  get textContent() { return this.ownText + this.children.map((child) => child.textContent).join('') }
  set textContent(value) { this.ownText = String(value); this.children = [] }
  get firstChild() { return this.children[0] || null }
  setAttribute(name, value) { this.attributes.set(name, String(value)) }
  getAttribute(name) { return this.attributes.has(name) ? this.attributes.get(name) : null }
  hasAttribute(name) { return this.attributes.has(name) }
  removeAttribute(name) { this.attributes.delete(name) }
  appendChild(child) { child.parentNode = this; this.children.push(child); return child }
  insertBefore(child, reference) {
    child.parentNode = this
    const index = reference ? this.children.indexOf(reference) : -1
    if (index < 0) this.children.push(child)
    else this.children.splice(index, 0, child)
    return child
  }
  removeChild(child) { this.children = this.children.filter((node) => node !== child); child.parentNode = null; return child }
  addEventListener(type, listener) { this.listeners.set(type, [...(this.listeners.get(type) || []), listener]) }
  click() { if (!this.disabled) for (const listener of this.listeners.get('click') || []) listener({ type: 'click' }) }
  querySelectorAll(selector) {
    const found = []
    const walk = (node) => { for (const child of node.children) { if (matches(child, selector)) found.push(child); walk(child) } }
    walk(this)
    return found
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null }
}

function page({ href, config, lab, figures = [], labLinks = [] }) {
  const root = new FakeElement('html')
  const head = root.appendChild(new FakeElement('head'))
  const body = root.appendChild(new FakeElement('body'))
  if (lab !== undefined) {
    const meta = head.appendChild(new FakeElement('meta'))
    meta.setAttribute('name', 'quviz-lab')
    meta.setAttribute('content', lab)
  }
  const article = body.appendChild(new FakeElement('article'))
  for (const [deepLink, caption] of figures) {
    const figure = article.appendChild(new FakeElement('figure'))
    figure.className = 'quviz-figure'
    figure.setAttribute('data-lab', deepLink)
    const paragraph = figure.appendChild(new FakeElement('p'))
    paragraph.textContent = caption
  }
  for (const value of labLinks) {
    const anchor = article.appendChild(new FakeElement('a'))
    anchor.className = 'md-button'
    anchor.setAttribute('data-quviz-lab', value)
    anchor.hidden = true
  }
  if (config !== undefined) {
    const script = body.appendChild(new FakeElement('script'))
    script.setAttribute('id', '__config')
    script.textContent = config
  }
  const document = {
    readyState: 'complete',
    createElement: (tag) => new FakeElement(tag),
    getElementById: (id) => root.querySelectorAll(`[id="${id}"]`)[0] || null,
    querySelectorAll: (selector) => root.querySelectorAll(selector),
    querySelector: (selector) => root.querySelector(selector),
    addEventListener: () => { throw new Error('readyState is complete; no listener expected') },
  }
  const window = { location: { href } }
  vm.runInNewContext(SOURCE, { window, document, URL, JSON, String })
  return { window, document, article }
}

const EIGEN = 'mode=eigenstate&n=1&l=0&m=0&basis=real&rep=point_cloud'
const SUPER = 'mode=superposition&preset=1s-2pz&t=8.4&rep=slice&plane=xz&obs=probability_density'

// 1. GitHub Pages layout: lab_url "../" is relative to the textbook root, not to the page.
{
  const { window, document, article } = page({
    href: 'https://example.test/repo/learn/textbook/01-wavefunction/',
    config: JSON.stringify({ base: '../..' }),
    lab: '../',
    figures: [[EIGEN, '图 1.1   1s  电子云'], [SUPER, '图 9.2 t=8.4']],
  })
  const [first, second] = article.querySelectorAll('figure.quviz-figure')
  assert.equal(first.firstChild.className, 'quviz-figure__stage')
  assert.ok(first.hasAttribute('data-quviz-ready'))
  const load = first.querySelector('.quviz-figure__load')
  const open = first.querySelector('.quviz-figure__open')
  assert.equal(load.textContent, '加载交互图')
  assert.equal(load.getAttribute('type'), 'button')
  assert.equal(open.textContent, '在实验室中打开')
  assert.equal(open.getAttribute('href'), `https://example.test/repo/#${EIGEN}`)
  assert.equal(open.getAttribute('target'), '_blank')
  assert.equal(open.getAttribute('rel'), 'noopener')
  assert.equal(document.querySelectorAll('iframe').length, 0, 'nothing loads before the reader asks')

  load.click()
  const frame = first.querySelector('.quviz-figure__frame')
  assert.equal(frame.tagName, 'IFRAME')
  assert.equal(frame.getAttribute('src'), `https://example.test/repo/#embed=1&${EIGEN}`)
  assert.equal(frame.getAttribute('loading'), 'lazy')
  assert.equal(frame.getAttribute('sandbox'), 'allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox')
  assert.equal(frame.getAttribute('allow'), 'fullscreen')
  assert.ok(frame.hasAttribute('allowfullscreen'))
  // Whitespace in the caption collapses; 0xff1a is the full-width colon.
  assert.equal(frame.getAttribute('title'), 'QuViz 交互图' + String.fromCharCode(0xff1a) + '图 1.1 1s 电子云')
  assert.equal(first.querySelector('.quviz-figure__placeholder').hidden, true)
  assert.ok(first.hasAttribute('data-quviz-active'))

  // One live WebGL context per page: loading the second figure unloads the first.
  second.querySelector('.quviz-figure__load').click()
  assert.equal(first.querySelector('iframe'), null)
  assert.equal(first.querySelector('.quviz-figure__placeholder').hidden, false)
  assert.ok(!first.hasAttribute('data-quviz-active'))
  assert.equal(second.querySelector('iframe').getAttribute('src'), `https://example.test/repo/#embed=1&${SUPER}`)
  second.querySelector('.quviz-figure__close').click()
  assert.equal(document.querySelectorAll('iframe').length, 0)

  // document$ emits again after every instant navigation: enhancing twice is a no-op.
  const before = first.children.length
  window.QuvizFigure.enhance()
  assert.equal(first.children.length, before)
  assert.equal(first.querySelectorAll('.quviz-figure__stage').length, 1)

  // After an instant navigation the location changes but the site root does not.
  // This target sits at a different depth (the textbook root itself) than the
  // original https://example.test/repo/learn/textbook/01-wavefunction/, so a
  // script that re-resolved __config.base per call (instead of once, at first
  // load) would compute a different, wrong root here.
  window.location.href = 'https://example.test/repo/learn/'
  const late = article.appendChild(new (first.constructor)('figure'))
  late.className = 'quviz-figure'
  late.setAttribute('data-lab', EIGEN)
  window.QuvizFigure.enhance()
  assert.equal(late.querySelector('.quviz-figure__open').getAttribute('href'), `https://example.test/repo/#${EIGEN}`)
}

// 2. Local default: an absolute lab_url is used verbatim; lab links are revealed.
{
  const { article } = page({
    href: 'http://127.0.0.1:8001/textbook/01-wavefunction/',
    config: JSON.stringify({ base: '../..' }),
    lab: 'http://127.0.0.1:8000/',
    figures: [[EIGEN, '图 1.1']],
    labLinks: ['', 'mode=eigenstate&n=2&l=1&m=0&basis=real&rep=isosurface'],
  })
  assert.equal(article.querySelector('.quviz-figure__open').getAttribute('href'), `http://127.0.0.1:8000/#${EIGEN}`)
  const [rootLink, deepLink] = article.querySelectorAll('a[data-quviz-lab]')
  assert.equal(rootLink.getAttribute('href'), 'http://127.0.0.1:8000/')
  assert.equal(rootLink.hidden, false)
  assert.equal(deepLink.getAttribute('href'), 'http://127.0.0.1:8000/#mode=eigenstate&n=2&l=1&m=0&basis=real&rep=isosurface')
}

// 3. Missing meta, invalid deep links and non-http labs fail visibly and never load.
for (const [lab, deepLink] of [
  [undefined, EIGEN],
  ['', EIGEN],
  ['javascript:alert(1)', EIGEN],
  ['../', `embed=1&${EIGEN}`],
  ['../', 'mode=eigenstate&n=1 l=0'],
  ['../', ''],
]) {
  const { document, article } = page({
    href: 'https://example.test/repo/learn/textbook/01-wavefunction/',
    config: JSON.stringify({ base: '../..' }),
    lab,
    figures: [[deepLink, '图']],
    labLinks: [''],
  })
  const figure = article.querySelector('figure.quviz-figure')
  const load = figure.querySelector('.quviz-figure__load')
  assert.equal(load.disabled, true, `${lab} ${deepLink}`)
  assert.equal(figure.querySelector('.quviz-figure__open').hidden, true)
  assert.equal(figure.getAttribute('data-quviz-state'), 'error')
  load.click()
  assert.equal(document.querySelectorAll('iframe').length, 0)
  if (lab === undefined || lab === '' || lab.startsWith('javascript')) {
    const anchor = article.querySelector('a[data-quviz-lab]')
    assert.equal(anchor.hidden, true)
    assert.equal(anchor.getAttribute('href'), null)
  }
}

// 4. Without Material's __config the page directory is the fallback root.
{
  const { window } = page({ href: 'https://example.test/a/b/page.html', lab: '../' })
  assert.equal(window.QuvizFigure.siteRootFrom('not json', 'https://example.test/a/b/page.html'), 'https://example.test/a/b/')
  assert.equal(window.QuvizFigure.labRoot('../', 'https://example.test/a/b/'), 'https://example.test/a/')
  assert.equal(window.QuvizFigure.labRoot('http://127.0.0.1:8000/#stale', 'https://example.test/'), 'http://127.0.0.1:8000/')
}

console.log('quviz-figure.js: ok')
"""


def test_quviz_figure_script_behaviour_in_a_fake_dom() -> None:
    node = shutil.which("node")
    assert node, "node is required to exercise docs/assets/javascripts/quviz-figure.js"
    run = subprocess.run(
        [node, "-"],
        input=HARNESS,
        env={**os.environ, "QUVIZ_FIGURE_JS": str(SCRIPT)},
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        timeout=60,
    )
    assert run.returncode == 0, run.stdout + run.stderr
    assert run.stdout.strip().splitlines()[-1] == "quviz-figure.js: ok", json.dumps(run.stdout)
