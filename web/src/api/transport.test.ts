import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  getTransport,
  liveTransport,
  requestKey,
  resetTransport,
  setTransport,
  type Transport,
} from './transport'

afterEach(() => {
  vi.unstubAllGlobals()
  resetTransport()
})

describe('requestKey', () => {
  it('is the bare route when there is no query', () => {
    expect(requestKey('/api/orbitals/catalog', null)).toBe('/api/orbitals/catalog')
  })

  it('adds no "?" for an empty query, so a catalogue request has one key', () => {
    expect(requestKey('/api/orbitals/catalog', new URLSearchParams())).toBe('/api/orbitals/catalog')
  })

  it('keeps insertion order and URLSearchParams encoding', () => {
    const query = new URLSearchParams()
    query.set('terms', '1,0,0,0.5;2,1,0,0.5')
    query.set('time', '0.6')
    expect(requestKey('/api/superposition/slice', query)).toBe(
      '/api/superposition/slice?terms=1%2C0%2C0%2C0.5%3B2%2C1%2C0%2C0.5&time=0.6',
    )
  })
})

describe('liveTransport', () => {
  it('reads the global fetch at call time and sends the literal request with { signal }', async () => {
    const answer = new Response('ok')
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(answer)
    // Stubbed AFTER the module loaded: a reference captured at import would miss this.
    vi.stubGlobal('fetch', fetchMock)
    const controller = new AbortController()
    const query = new URLSearchParams([
      ['n', '1'],
      ['l', '0'],
    ])

    await expect(
      liveTransport.request('/api/orbitals/metadata', query, controller.signal),
    ).resolves.toBe(answer)
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith('/api/orbitals/metadata?n=1&l=0', {
      signal: controller.signal,
    })
  })

  it('passes { signal: undefined } without a signal, as the ten client.ts call sites did', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response('ok'))
    vi.stubGlobal('fetch', fetchMock)

    await liveTransport.request('/api/orbitals/catalog', null)

    expect(fetchMock.mock.calls[0][0]).toBe('/api/orbitals/catalog')
    expect(fetchMock.mock.calls[0][1]).toStrictEqual({ signal: undefined })
  })

  it('propagates a network failure unchanged', async () => {
    const failure = new TypeError('fetch failed')
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockRejectedValue(failure))
    await expect(liveTransport.request('/api/orbitals/catalog', null)).rejects.toBe(failure)
  })
})

describe('the installed transport', () => {
  it('is the live one by default, can be replaced, and resetTransport restores it', () => {
    expect(getTransport()).toBe(liveTransport)
    const other: Transport = {
      request: () => Promise.resolve(new Response(null, { status: 404 })),
    }
    setTransport(other)
    expect(getTransport()).toBe(other)
    resetTransport()
    expect(getTransport()).toBe(liveTransport)
  })
})
