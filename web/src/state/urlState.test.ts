/** @vitest-environment jsdom */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { setStaticCatalog } from '../api/capability'
import { rememberSuperpositionCatalog } from '../api/client'
import { parseStaticSpec } from '../api/staticCatalog'
import type { SuperpositionPreset } from '../api/types'
import {
  applyDeepLink,
  bindUrlState,
  deepLinkFromStore,
  isEmbedMode,
  parseDeepLink,
  serializeDeepLink,
  type DeepLinkState,
} from './urlState'
import { useSceneStore } from './useSceneStore'

const CATALOG_RAW: unknown = JSON.parse(
  readFileSync(resolve(process.cwd(), '..', 'tests', 'fixtures', 'visual', 'catalog-superposition.json'), 'utf-8'),
)
const CATALOG = CATALOG_RAW as SuperpositionPreset[]
const preset = (id: string): SuperpositionPreset => {
  const found = CATALOG.find((entry) => entry.id === id)
  if (found === undefined) throw new Error(`no preset ${id}`)
  return found
}

const INITIAL = useSceneStore.getState()
const read = () => useSceneStore.getState()
const setHash = (hash: string): void => {
  window.history.replaceState(null, '', hash === '' ? '/' : `/${hash}`)
}
const hashChanged = (): void => {
  window.dispatchEvent(new HashChangeEvent('hashchange'))
}
const hashOf = (): URLSearchParams => new URLSearchParams(window.location.hash.slice(1))
const flush = (): Promise<void> => new Promise((done) => setTimeout(done, 0))

interface Pending {
  resolve: (value: unknown) => void
  reject: (error: unknown) => void
}
let pending: Pending[] = []

/** Every catalogue fetch waits until the spec settles it by hand. */
function deferFetches() {
  pending = []
  const fetchMock = vi.fn(
    (_input: RequestInfo | URL, _init?: RequestInit) =>
      new Promise<unknown>((resolveFetch, rejectFetch) => {
        pending.push({ resolve: resolveFetch, reject: rejectFetch })
      }),
  )
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}
const catalogResponse = () => ({ ok: true, status: 200, json: async () => CATALOG_RAW })

let unbind: (() => void) | null = null

beforeEach(() => {
  useSceneStore.setState(INITIAL, true)
  rememberSuperpositionCatalog(null)
  setHash('')
})

afterEach(() => {
  unbind?.()
  unbind = null
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('parseDeepLink', () => {
  it('reads the spec eigenstate example', () => {
    expect(
      parseDeepLink('#mode=eigenstate&n=2&l=1&m=0&basis=real&rep=point_cloud&plane=xz&obs=probability_density'),
    ).toEqual({
      mode: 'eigenstate',
      n: 2,
      l: 1,
      m: 0,
      basis: 'real',
      rep: 'point_cloud',
      plane: 'xz',
      obs: 'probability_density',
    })
  })

  it('reads the spec superposition example, with or without "#"', () => {
    const expected = { mode: 'superposition', preset: '1s-2pz', t: 3.6, rep: 'isosurface' }
    expect(parseDeepLink('#mode=superposition&preset=1s-2pz&t=3.6&rep=isosurface')).toEqual(expected)
    expect(parseDeepLink('mode=superposition&preset=1s-2pz&t=3.6&rep=isosurface')).toEqual(expected)
  })

  it('reads the embed flag both ways', () => {
    expect(parseDeepLink('#embed=1&z=2.5')).toEqual({ embed: true, z: 2.5 })
    expect(parseDeepLink('#embed=0')).toEqual({ embed: false })
  })

  it.each([
    ['mode=hologram', 'mode'],
    ['n=0', 'n'],
    ['n=9', 'n'],
    ['n=2.5', 'n'],
    ['n=2&l=2', 'l'],
    ['l=1&m=2', 'm'],
    ['z=0', 'z'],
    ['z=abc', 'z'],
    ['z=1e1', 'z'],
    ['basis=quaternion', 'basis'],
    ['preset=../etc', 'preset'],
    ['preset=1S-2pz', 'preset'],
    ['t=2000', 't'],
    ['t=.5', 't'],
    ['rep=hologram', 'rep'],
    ['plane=xw', 'plane'],
    ['obs=charge', 'obs'],
    ['embed=yes', 'embed'],
  ])('drops an invalid value: %s', (hash, dropped) => {
    expect(parseDeepLink(hash)).not.toHaveProperty(dropped)
  })

  it.each(['%E0%A4%A', '&&&', '=1', '#', 'n=%ZZ'])('never throws on %s', (hash) => {
    expect(parseDeepLink(hash)).toEqual({})
  })
})

describe('serializeDeepLink', () => {
  it('writes keys in the contract order whatever order the object has', () => {
    const state: DeepLinkState = {
      obs: 'phase',
      plane: 'xy',
      rep: 'slice',
      basis: 'complex',
      z: 2,
      m: -1,
      l: 2,
      n: 3,
      mode: 'eigenstate',
      embed: true,
    }
    expect(serializeDeepLink(state)).toBe('embed=1&mode=eigenstate&n=3&l=2&m=-1&z=2&basis=complex&rep=slice&plane=xy&obs=phase')
  })

  it('omits absent keys and a false embed flag', () => {
    expect(serializeDeepLink({ embed: false, mode: 'superposition', preset: undefined, t: 0.6 })).toBe('mode=superposition&t=0.6')
  })

  it.each([
    'mode=eigenstate&n=2&l=1&m=0&basis=real&rep=point_cloud&plane=xz&obs=probability_density',
    'mode=superposition&preset=1s-2pz&t=3.6&rep=isosurface',
    'embed=1&mode=superposition&preset=1s-3dz2&t=5.8&rep=slice&plane=xz&obs=phase',
  ])('round-trips %s', (link) => {
    expect(serializeDeepLink(parseDeepLink(link))).toBe(link)
    expect(parseDeepLink(serializeDeepLink(parseDeepLink(link)))).toEqual(parseDeepLink(link))
  })
})

describe('deepLinkFromStore', () => {
  it('writes the default eigenstate without z, plane or observable', () => {
    expect(serializeDeepLink(deepLinkFromStore(read(), undefined, false))).toBe(
      'mode=eigenstate&n=2&l=1&m=0&basis=real&rep=point_cloud',
    )
  })

  it('writes a charge other than 1 and the plane of a slice', () => {
    useSceneStore.setState({
      orbital: { n: 3, l: 2, m: -1, z: 2, basis: 'complex' },
      representation: 'slice',
      plane: 'xy',
      sliceObservable: 'phase',
    })
    expect(serializeDeepLink(deepLinkFromStore(read(), undefined, true))).toBe(
      'embed=1&mode=eigenstate&n=3&l=2&m=-1&z=2&basis=complex&rep=slice&plane=xy&obs=phase',
    )
  })

  it('writes a superposition by preset id, with its time only while paused and non-zero', () => {
    useSceneStore.setState({ mode: 'superposition', representation: 'isosurface', timeAu: 3.6, playing: false })
    expect(serializeDeepLink(deepLinkFromStore(read(), '1s-2pz', false))).toBe(
      'mode=superposition&preset=1s-2pz&t=3.6&rep=isosurface',
    )
    useSceneStore.setState({ playing: true })
    expect(serializeDeepLink(deepLinkFromStore(read(), '1s-2pz', false))).toBe('mode=superposition&preset=1s-2pz&rep=isosurface')
    useSceneStore.setState({ playing: false, timeAu: 0 })
    expect(serializeDeepLink(deepLinkFromStore(read(), undefined, false))).toBe('mode=superposition&rep=isosurface')
  })
})

describe('applyDeepLink', () => {
  it('applies an eigenstate link through the store actions', () => {
    applyDeepLink(parseDeepLink('mode=eigenstate&n=3&l=2&m=-1&basis=complex&rep=slice&plane=xy&obs=phase'), null)
    expect(read()).toMatchObject({
      mode: 'eigenstate',
      orbital: { n: 3, l: 2, m: -1, z: 1, basis: 'complex' },
      representation: 'slice',
      plane: 'xy',
      sliceObservable: 'phase',
    })
  })

  it('resolves a superposition preset through the catalogue, then its time', () => {
    applyDeepLink(parseDeepLink('mode=superposition&preset=1s-3dz2&t=5.8&rep=streamlines'), CATALOG)
    expect(read()).toMatchObject({
      mode: 'superposition',
      superpositionTerms: preset('1s-3dz2').terms,
      superpositionLabel: preset('1s-3dz2').label,
      superpositionSliceResolutionFloor: 103,
      superpositionStreamlineSeedCountMax: 24,
      representation: 'streamlines',
      timeAu: 5.8,
    })
  })

  it('opens a preset on the representation its catalogue entry publishes (2s-2pz regression)', () => {
    expect(preset('2s-2pz').default_representation).toBe('slice')
    expect(preset('1s-2pz').default_representation).toBe('isosurface')

    applyDeepLink(parseDeepLink('mode=superposition&preset=2s-2pz'), CATALOG)
    expect(read()).toMatchObject({
      mode: 'superposition',
      superpositionTerms: preset('2s-2pz').terms,
      superpositionDefaultRepresentation: 'slice',
      representation: 'slice',
    })

    // An explicit representation in the link is honoured, as a click would be.
    useSceneStore.setState(INITIAL, true)
    applyDeepLink(parseDeepLink('mode=superposition&preset=2s-2pz&rep=isosurface'), CATALOG)
    expect(read().representation).toBe('isosurface')

    // A preset that publishes the isosurface opens on it.
    useSceneStore.setState(INITIAL, true)
    applyDeepLink(parseDeepLink('mode=superposition&preset=1s-2pz'), CATALOG)
    expect(read()).toMatchObject({ superpositionDefaultRepresentation: 'isosurface', representation: 'isosurface' })
  })

  it('ignores an unknown preset, a missing catalogue and an eigenstate time', () => {
    applyDeepLink({ mode: 'superposition', preset: 'nope' }, CATALOG)
    expect(read().superpositionTerms).toBe(INITIAL.superpositionTerms)
    applyDeepLink({ preset: '1s-3dz2' }, null)
    expect(read().superpositionTerms).toBe(INITIAL.superpositionTerms)
    useSceneStore.setState(INITIAL, true)
    applyDeepLink({ t: 3 }, null)
    expect(read().timeAu).toBe(0)
  })

  it('changes nothing for an empty link', () => {
    applyDeepLink({}, CATALOG)
    expect(read()).toBe(INITIAL)
  })
})

describe('bindUrlState', () => {
  it('applies an eigenstate link at start, canonicalises it, and fetches nothing', () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    setHash('#n=3&l=2&m=-1&basis=complex')

    unbind = bindUrlState()

    expect(read().orbital).toEqual({ n: 3, l: 2, m: -1, z: 1, basis: 'complex' })
    expect(window.location.hash).toBe('#mode=eigenstate&n=3&l=2&m=-1&basis=complex&rep=point_cloud')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('leaves an empty hash alone until the store changes', () => {
    const replace = vi.spyOn(window.history, 'replaceState')
    unbind = bindUrlState()
    expect(replace).not.toHaveBeenCalled()
    expect(window.location.hash).toBe('')

    read().setOrbital({ n: 3 })
    expect(window.location.hash).toBe('#mode=eigenstate&n=3&l=1&m=0&basis=real&rep=point_cloud')
  })

  it('rewrites the hash with replaceState, never adding a history entry', () => {
    const push = vi.spyOn(window.history, 'pushState')
    const length = window.history.length
    unbind = bindUrlState()

    read().setRepresentation('slice')
    read().setPlane('xy')

    expect(push).not.toHaveBeenCalled()
    expect(window.history.length).toBe(length)
    expect(window.location.hash).toBe('#mode=eigenstate&n=2&l=1&m=0&basis=real&rep=slice&plane=xy&obs=probability_density')
  })

  it('does not rewrite the hash on playback ticks, and records the time on pause', () => {
    unbind = bindUrlState()
    read().setMode('superposition')
    read().setPlaying(true)
    const replace = vi.spyOn(window.history, 'replaceState')

    read().setTimeAu(0.6)
    read().setTimeAu(1.2)
    expect(replace).not.toHaveBeenCalled()

    read().setPlaying(false)
    expect(window.location.hash).toBe('#mode=superposition&t=1.2&rep=isosurface')
  })

  it('writes no preset id for a superposition the catalogue does not list', () => {
    rememberSuperpositionCatalog(CATALOG)
    unbind = bindUrlState()
    useSceneStore.setState({ mode: 'superposition', superpositionTerms: '3,0,0,1', representation: 'isosurface' })
    expect(window.location.hash).toBe('#mode=superposition&rep=isosurface')
    useSceneStore.setState({ superpositionTerms: preset('2s-2pz').terms })
    expect(window.location.hash).toBe('#mode=superposition&preset=2s-2pz&rep=isosurface')
  })

  it('follows a hashchange', () => {
    unbind = bindUrlState()
    setHash('#mode=eigenstate&n=4&l=3&m=2&basis=complex')
    hashChanged()
    expect(read().orbital).toEqual({ n: 4, l: 3, m: 2, z: 1, basis: 'complex' })
  })

  it('keeps the embed flag in every rewrite', () => {
    setHash('#embed=1&n=3')
    unbind = bindUrlState()
    expect(isEmbedMode()).toBe(true)
    read().setRepresentation('isosurface')
    expect(window.location.hash.startsWith('#embed=1&mode=eigenstate&n=3')).toBe(true)
  })

  it('resolves a preset link once the catalogue arrives, and writes the hash only then', async () => {
    const fetchMock = deferFetches()
    setHash('#mode=superposition&preset=1s-3dz2&t=5.8&rep=slice&plane=xz&obs=phase')
    const replace = vi.spyOn(window.history, 'replaceState')

    unbind = bindUrlState()
    expect(read().mode).toBe('superposition')
    expect(read().superpositionTerms).toBe(INITIAL.superpositionTerms)
    expect(replace).not.toHaveBeenCalled()
    expect(String(fetchMock.mock.calls[0][0])).toBe('/api/superposition/catalog')

    pending[0].resolve(catalogResponse())
    await flush()

    expect(read()).toMatchObject({
      superpositionTerms: preset('1s-3dz2').terms,
      superpositionSliceResolutionFloor: 103,
      superpositionStreamlineSeedCountMax: 24,
      representation: 'slice',
      plane: 'xz',
      sliceObservable: 'phase',
      timeAu: 5.8,
    })
    expect(window.location.hash).toBe('#mode=superposition&preset=1s-3dz2&t=5.8&rep=slice&plane=xz&obs=phase')
  })

  it('uses a catalogue it already has without fetching', () => {
    rememberSuperpositionCatalog(CATALOG)
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    setHash('#mode=superposition&preset=2s-2pz')

    unbind = bindUrlState()

    expect(fetchMock).not.toHaveBeenCalled()
    expect(read().superpositionTerms).toBe(preset('2s-2pz').terms)
    // 2s-2pz publishes 'slice' (its route-default isosurface is refused), so
    // the link opens the slice and says so, with the slice's plane and field.
    expect(read().superpositionDefaultRepresentation).toBe('slice')
    expect(window.location.hash).toBe('#mode=superposition&preset=2s-2pz&rep=slice&plane=xz&obs=probability_density')
  })

  it('falls back to the default superposition when the catalogue cannot load', async () => {
    deferFetches()
    setHash('#mode=superposition&preset=1s-3dz2')
    unbind = bindUrlState()

    pending[0].reject(new TypeError('offline'))
    await flush()

    expect(read().mode).toBe('superposition')
    expect(read().superpositionTerms).toBe(INITIAL.superpositionTerms)
    expect(window.location.hash).toBe('#mode=superposition&rep=isosurface')
  })

  it('lets a newer hash win over a stale catalogue answer', async () => {
    deferFetches()
    setHash('#mode=superposition&preset=1s-3dz2')
    unbind = bindUrlState()

    setHash('#mode=eigenstate&n=3&l=0&m=0')
    hashChanged()
    pending[0].resolve(catalogResponse())
    await flush()

    expect(read().mode).toBe('eigenstate')
    expect(read().orbital.n).toBe(3)
    expect(window.location.hash).toBe('#mode=eigenstate&n=3&l=0&m=0&basis=real&rep=point_cloud')
  })

  it('stops following, writing and applying after unbind', async () => {
    deferFetches()
    setHash('#mode=superposition&preset=1s-3dz2')
    const stop = bindUrlState()
    stop()

    pending[0].resolve(catalogResponse())
    await flush()
    expect(read().superpositionTerms).toBe(INITIAL.superpositionTerms)

    const before = window.location.hash
    read().setOrbital({ n: 4 })
    expect(window.location.hash).toBe(before)
    setHash('#n=1')
    hashChanged()
    expect(read().orbital.n).toBe(4)
  })

  describe('on the static site, where superposition slices exist on xz only', () => {
    beforeEach(() => {
      setStaticCatalog({
        format: 'quviz-static/1',
        version: '0000000000000000',
        spec: parseStaticSpec(
          JSON.parse(readFileSync(resolve(process.cwd(), 'tools', 'fixtures', 'spec.json'), 'utf-8')),
        ),
        entries: {},
      })
      rememberSuperpositionCatalog(CATALOG)
      vi.stubGlobal('fetch', vi.fn())
    })

    afterEach(() => {
      setStaticCatalog(null)
    })

    it('links the plane that is drawn when the learner switches to a superposition from an xy slice', () => {
      unbind = bindUrlState()
      read().setRepresentation('slice')
      read().setPlane('xy')
      expect(hashOf().get('plane')).toBe('xy')

      read().setMode('superposition')

      expect(hashOf().get('mode')).toBe('superposition')
      expect(hashOf().get('rep')).toBe('slice')
      expect(hashOf().get('plane')).toBe('xz')
    })

    it('rewrites a link that asks for another plane to the one drawn', () => {
      setHash('#mode=superposition&preset=1s-3dz2&rep=slice&plane=yz&obs=phase')

      unbind = bindUrlState()

      expect(read().plane).toBe('xz')
      expect(window.location.hash).toBe('#mode=superposition&preset=1s-3dz2&rep=slice&plane=xz&obs=phase')
    })
  })

  it('swallows a replaceState rate-limit error', () => {
    unbind = bindUrlState()
    vi.spyOn(window.history, 'replaceState').mockImplementation(() => {
      throw new DOMException('rate limited', 'SecurityError')
    })
    expect(() => read().setOrbital({ n: 3 })).not.toThrow()
    expect(read().orbital.n).toBe(3)
  })
})

describe('isEmbedMode', () => {
  it('reads the flag from the current hash', () => {
    setHash('#embed=1&n=2')
    expect(isEmbedMode()).toBe(true)
    setHash('#n=2')
    expect(isEmbedMode()).toBe(false)
    setHash('')
    expect(isEmbedMode()).toBe(false)
  })
})
