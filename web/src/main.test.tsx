/** @vitest-environment jsdom */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createElement } from 'react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { setStaticCatalog, staticCatalogSpec } from './api/capability'
import { getTransport, liveTransport, resetTransport } from './api/transport'

/**
 * The entry point's claims: the host element is `#root`, the tree is mounted
 * with React 19's `createRoot` under `StrictMode`, the URL state is bound
 * before the first render, and a static build installs its catalogue first --
 * or shows a readable error instead of a blank lab.
 *
 * `App` is mocked (the real one drags the three.js canvas into jsdom), and so
 * is the URL binding (src/state/urlState.test.ts owns it). Both mocks record
 * what the data layer looks like *at the moment they run* -- which transport
 * `getTransport()` returns and what `staticCatalogSpec()` holds -- into a
 * shared, ordered log. That is the only way to pin the ordering the task
 * requires (install the static layer, then bind the URL, then render):
 * asserting on state *after* `bootstrap` has resolved cannot tell "installed
 * before bind" from "installed after render", since both leave the same
 * final state.
 */
const log = vi.hoisted(
  () => ({ order: [] as { who: 'bind' | 'app'; live: boolean; spec: unknown }[] }),
)

vi.mock('./App', () => ({
  default: () => {
    log.order.push({ who: 'app', live: getTransport() === liveTransport, spec: staticCatalogSpec() })
    return createElement('div', { 'data-app-mounted': 'true' })
  },
}))

const urlState = vi.hoisted(() => ({ bind: vi.fn(() => () => undefined) }))
vi.mock('./state/urlState', () => ({
  bindUrlState: () => {
    log.order.push({ who: 'bind', live: getTransport() === liveTransport, spec: staticCatalogSpec() })
    return urlState.bind()
  },
}))

/** Let React's scheduler flush the root it queued; `render` is not synchronous. */
const flush = (): Promise<void> => new Promise((done) => setTimeout(done, 0))

const SPEC: unknown = JSON.parse(readFileSync(resolve(process.cwd(), 'tools', 'fixtures', 'spec.json'), 'utf-8'))
const MANIFEST = { format: 'quviz-static/1', version: '0123456789abcdef', spec: SPEC, entries: {} }

function container(): HTMLElement {
  const element = document.createElement('div')
  document.body.appendChild(element)
  return element
}

let bootstrap: (typeof import('./main'))['bootstrap']

beforeAll(async () => {
  const root = document.createElement('div')
  root.id = 'root'
  document.body.appendChild(root)
  ;({ bootstrap } = await import('./main'))
  await flush()
})

afterEach(() => {
  vi.unstubAllGlobals()
  resetTransport()
  setStaticCatalog(null)
  urlState.bind.mockClear()
  log.order.length = 0
})

describe('main entry point', () => {
  it('mounts the app into #root in live mode after binding the URL state', () => {
    expect(document.getElementById('root')?.querySelector('[data-app-mounted="true"]')).not.toBeNull()
    expect(urlState.bind).toHaveBeenCalledTimes(1)
    expect(getTransport()).toBe(liveTransport)
    expect(staticCatalogSpec()).toBeNull()

    // Order pin: the URL state is bound before the app renders, in live mode too.
    const bindIndex = log.order.findIndex((entry) => entry.who === 'bind')
    const appIndex = log.order.findIndex((entry) => entry.who === 'app')
    expect(bindIndex).toBeGreaterThanOrEqual(0)
    expect(appIndex).toBeGreaterThan(bindIndex)
  })

  it('installs the static transport and catalogue before the first render', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => ({
      ok: true,
      status: 200,
      json: async () => MANIFEST,
    }))
    vi.stubGlobal('fetch', fetchMock)
    const target = container()

    await bootstrap(target, 'static')
    await flush()

    expect(String(fetchMock.mock.calls[0][0])).toBe(new URL('data/manifest.json', document.baseURI).href)
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ cache: 'no-cache' })
    expect(getTransport()).not.toBe(liveTransport)
    expect(staticCatalogSpec()).toEqual(SPEC)
    expect(urlState.bind).toHaveBeenCalledTimes(1)
    expect(target.querySelector('[data-app-mounted="true"]')).not.toBeNull()

    // Order pin (this task's main requirement): the static transport and
    // catalogue are installed before bindUrlState() and before the first
    // render. Checking only the state after `bootstrap` resolves cannot
    // distinguish "installed first" from "installed last" -- both leave the
    // same final getTransport()/staticCatalogSpec() -- so assert on what
    // each mock actually observed *when it ran*.
    const bindIndex = log.order.findIndex((entry) => entry.who === 'bind')
    const appIndex = log.order.findIndex((entry) => entry.who === 'app')
    expect(bindIndex).toBeGreaterThanOrEqual(0)
    expect(appIndex).toBeGreaterThan(bindIndex)
    expect(log.order[bindIndex]).toMatchObject({ live: false, spec: SPEC })
    expect(log.order[appIndex]).toMatchObject({ live: false, spec: SPEC })
  })

  it('shows a readable Chinese error instead of the lab when the catalogue cannot load', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 404, json: async () => ({}) })),
    )
    const target = container()

    await bootstrap(target, 'static')
    await flush()

    const alert = target.querySelector('[role="alert"]')
    expect(alert?.textContent).toContain('静态教材版无法启动')
    expect(alert?.textContent).toContain('HTTP 404')
    expect(alert?.textContent).toContain('quviz serve')
    expect(target.querySelector('[data-app-mounted="true"]')).toBeNull()
    expect(getTransport()).toBe(liveTransport)
    expect(urlState.bind).not.toHaveBeenCalled()
    expect(log.order).toEqual([])
  })

  it('reports a non-Error rejection as its own text', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject('offline')))
    const target = container()

    await bootstrap(target, 'static')
    await flush()

    expect(target.querySelector('[role="alert"]')?.textContent).toContain('offline')
    expect(log.order).toEqual([])
  })
})
