/** @vitest-environment jsdom */
import { act, createElement } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { OrbitalMetadata, OrbitalParameters } from '../api/types'
import { mount } from '../test/mount'

const fetchMetadata = vi.hoisted(() => vi.fn<(orbital: OrbitalParameters, signal?: AbortSignal) => Promise<OrbitalMetadata>>())
vi.mock('../api/client', () => ({ fetchOrbitalMetadata: fetchMetadata }))

import { describes, orbitalKey, useOrbitalMetadata, type OrbitalMetadataState } from './useOrbitalMetadata'

const TWO_PZ: OrbitalParameters = { n: 2, l: 1, m: 0, z: 1, basis: 'real' }
const PROFILE = {
  r_bohr: [0, 1, 2],
  radial_density: [0, 0.3, 0.1],
  nodes_bohr: [],
  expectation_r_bohr: 5,
  most_probable_r_bohr: 4,
  energy_levels_hartree: [-0.5, -0.125, -0.0556, -0.03125, -0.02],
}

function metadata(state: OrbitalParameters, withProfile = true): OrbitalMetadata {
  return {
    state: { ...state, a_mu: 1 },
    label: '2p_z',
    energy_hartree: -0.125,
    length_unit: 'bohr',
    observable: 'probability_density',
    representation: 'point_cloud',
    normalization: 'unit',
    coordinate_convention: 'physics',
    spherical_harmonic_convention: 'Condon-Shortley',
    geometry_semantics: 'samples',
    color_semantics: 'phase',
    references: [],
    warnings: [],
    radial_profile: withProfile ? PROFILE : null,
  }
}

let seen: OrbitalMetadataState[] = []
function Probe({ orbital, preloaded }: { orbital: OrbitalParameters | null; preloaded?: OrbitalMetadata }) {
  seen.push(useOrbitalMetadata(orbital, preloaded))
  return null
}
const last = (): OrbitalMetadataState => seen[seen.length - 1]
const settle = async (): Promise<void> => {
  const scope = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  scope.IS_REACT_ACT_ENVIRONMENT = true
  try {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
  } finally {
    delete scope.IS_REACT_ACT_ENVIRONMENT
  }
}

beforeEach(() => {
  seen = []
  fetchMetadata.mockReset()
})

describe('orbitalKey / describes', () => {
  it('keys a state by every field the request carries', () => {
    expect(orbitalKey(null)).toBeNull()
    expect(orbitalKey(TWO_PZ)).toBe('2|1|0|1|real')
    expect(describes(metadata(TWO_PZ), TWO_PZ)).toBe(true)
    expect(describes(metadata(TWO_PZ), { ...TWO_PZ, basis: 'complex' })).toBe(false)
    expect(describes(undefined, TWO_PZ)).toBe(false)
    expect(describes(metadata(TWO_PZ), null)).toBe(false)
  })
})

describe('useOrbitalMetadata', () => {
  it('is idle without a state and asks nothing', async () => {
    const tree = await mount(createElement(Probe, { orbital: null }))
    expect(last()).toEqual({ status: 'idle' })
    expect(fetchMetadata).not.toHaveBeenCalled()
    await tree.unmount()
  })

  it('uses metadata that already carries the profile for the same state, without a request', async () => {
    const preloaded = metadata(TWO_PZ)
    const tree = await mount(createElement(Probe, { orbital: TWO_PZ, preloaded }))
    expect(last()).toEqual({ status: 'ready', metadata: preloaded })
    expect(fetchMetadata).not.toHaveBeenCalled()
    await tree.unmount()
  })

  it('fetches when the preloaded metadata has no profile, and reports ready', async () => {
    fetchMetadata.mockResolvedValue(metadata(TWO_PZ))
    const tree = await mount(createElement(Probe, { orbital: TWO_PZ, preloaded: metadata(TWO_PZ, false) }))
    await settle()
    expect(seen.some((state) => state.status === 'loading')).toBe(true)
    expect(fetchMetadata).toHaveBeenCalledWith(TWO_PZ, expect.any(AbortSignal))
    expect(last().status).toBe('ready')
    expect(last().metadata?.radial_profile?.expectation_r_bohr).toBe(5)
    await tree.unmount()
  })

  it('aborts the previous request when the state changes, and on unmount', async () => {
    fetchMetadata.mockImplementation(() => new Promise(() => undefined))
    const tree = await mount(createElement(Probe, { orbital: TWO_PZ }))
    const first = fetchMetadata.mock.calls[0][1]
    await tree.update(createElement(Probe, { orbital: { ...TWO_PZ, m: 1 } }))
    expect(first?.aborted).toBe(true)
    expect(last().status).toBe('loading')
    const second = fetchMetadata.mock.calls[1][1]
    await tree.unmount()
    expect(second?.aborted).toBe(true)
  })

  // A real fetch rejects an aborted request with AbortError after the next
  // state's request has started; a stale write would replace the one entry the
  // hook holds and leave the new state 'loading' for good.
  it.each(['resolves', 'rejects'] as const)(
    'ignores an aborted request that %s late',
    async (outcome) => {
      const first = {
        resolve: (value: OrbitalMetadata): void => void value,
        reject: (reason: unknown): void => void reason,
      }
      fetchMetadata.mockImplementationOnce(
        () =>
          new Promise<OrbitalMetadata>((resolve, reject) => {
            first.resolve = resolve
            first.reject = reject
          }),
      )
      const three = { ...TWO_PZ, n: 3 }
      fetchMetadata.mockResolvedValueOnce(metadata(three))
      const tree = await mount(createElement(Probe, { orbital: TWO_PZ }))
      await tree.update(createElement(Probe, { orbital: three }))
      await settle()
      expect(last()).toEqual({ status: 'ready', metadata: metadata(three) })
      if (outcome === 'resolves') first.resolve(metadata(TWO_PZ))
      else first.reject(new DOMException('The operation was aborted.', 'AbortError'))
      await settle()
      expect(last()).toEqual({ status: 'ready', metadata: metadata(three) })
      await tree.unmount()
    },
  )

  it('reports a failed request with its message', async () => {
    fetchMetadata.mockRejectedValueOnce(new Error('静态教材版未预计算这一组合。'))
    const tree = await mount(createElement(Probe, { orbital: TWO_PZ }))
    await settle()
    expect(last()).toEqual({ status: 'error', error: '静态教材版未预计算这一组合。' })
    fetchMetadata.mockRejectedValueOnce('plain')
    await tree.update(createElement(Probe, { orbital: { ...TWO_PZ, n: 3 } }))
    await settle()
    expect(last()).toEqual({ status: 'error', error: 'plain' })
    await tree.unmount()
  })
})
