/** @vitest-environment jsdom */
import { createElement } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { OrbitalPreset, SuperpositionPreset } from '../api/types'
import { mount } from '../test/mount'

const client = vi.hoisted(() => ({
  orbitals: vi.fn<(signal?: AbortSignal) => Promise<OrbitalPreset[]>>(),
  superpositions: vi.fn<(signal?: AbortSignal) => Promise<SuperpositionPreset[]>>(),
}))

vi.mock('../api/client', () => ({
  fetchCatalog: client.orbitals,
  fetchSuperpositionCatalog: client.superpositions,
}))

import { ensureCatalogsLoaded, resetCatalogs, useCatalogs, useCatalogStore } from './catalogs'
import { useSceneStore } from './useSceneStore'

const INITIAL_SCENE = useSceneStore.getState()
const BOHR_TERMS = '1,0,0,0.7071067811865476;2,1,0,0.7071067811865476'
const PRESETS: OrbitalPreset[] = [{ id: '2pz', label: '2p_z', n: 2, l: 1, m: 0, basis: 'real', z: 1 }]
const MIXTURE = (
  terms: string,
  default_representation: SuperpositionPreset['default_representation'] = 'isosurface',
): SuperpositionPreset => ({
  id: 'bohr',
  label: '1s + 2p_z',
  terms,
  period_au: 16.755160819145562,
  note: 'Bohr oscillation',
  slice_resolution_floor: 103,
  streamline_seed_count_max: 24,
  default_representation,
})

const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0))

beforeEach(() => {
  resetCatalogs()
  useSceneStore.setState(INITIAL_SCENE, true)
  client.orbitals.mockReset()
  client.superpositions.mockReset()
})

describe('ensureCatalogsLoaded', () => {
  it('fetches each catalogue once, however many callers ask', async () => {
    client.orbitals.mockResolvedValue(PRESETS)
    client.superpositions.mockResolvedValue([MIXTURE(BOHR_TERMS)])

    ensureCatalogsLoaded()
    ensureCatalogsLoaded()
    ensureCatalogsLoaded()
    expect(useCatalogStore.getState().orbitalStatus).toBe('loading')
    await flush()

    expect(client.orbitals).toHaveBeenCalledTimes(1)
    expect(client.superpositions).toHaveBeenCalledTimes(1)
    expect(useCatalogStore.getState()).toMatchObject({
      orbitals: PRESETS,
      orbitalStatus: 'ready',
      superpositionStatus: 'ready',
    })
  })

  it('syncs the selected mixture floor and seed ceiling into the scene store', async () => {
    client.orbitals.mockResolvedValue(PRESETS)
    client.superpositions.mockResolvedValue([MIXTURE(BOHR_TERMS)])

    ensureCatalogsLoaded()
    await flush()

    expect(useSceneStore.getState().superpositionSliceResolutionFloor).toBe(103)
    expect(useSceneStore.getState().superpositionStreamlineSeedCountMax).toBe(24)
  })

  it("records the selected mixture's published default without moving the picture (A11)", async () => {
    // The 2s-2pz fix: the catalogue says which picture a preset opens on. A
    // sync only records it; the representation on screen stays where it is.
    useSceneStore.setState({ mode: 'superposition', representation: 'isosurface' })
    client.orbitals.mockResolvedValue(PRESETS)
    client.superpositions.mockResolvedValue([MIXTURE(BOHR_TERMS, 'slice')])

    ensureCatalogsLoaded()
    await flush()

    expect(useSceneStore.getState().superpositionDefaultRepresentation).toBe('slice')
    expect(useSceneStore.getState().representation).toBe('isosurface')
  })

  it('fails closed when the catalogue omits the selected mixture', async () => {
    useSceneStore.setState({ superpositionStreamlineSeedCountMax: 40 })
    client.orbitals.mockResolvedValue(PRESETS)
    client.superpositions.mockResolvedValue([MIXTURE('9,0,0,1')])

    ensureCatalogsLoaded()
    await flush()

    expect(useSceneStore.getState().superpositionStreamlineSeedCountMax).toBeUndefined()
  })

  it('fails closed, and says error, when the superposition catalogue is unreachable', async () => {
    useSceneStore.setState({ superpositionStreamlineSeedCountMax: 40 })
    client.orbitals.mockResolvedValue(PRESETS)
    client.superpositions.mockRejectedValue(new Error('offline'))

    ensureCatalogsLoaded()
    await flush()

    expect(useCatalogStore.getState()).toMatchObject({
      superpositions: [],
      superpositionStatus: 'error',
    })
    expect(useSceneStore.getState().superpositionStreamlineSeedCountMax).toBeUndefined()
  })

  it('reports an unreachable orbital catalogue as an error, not as an empty success', async () => {
    client.orbitals.mockRejectedValue(new Error('offline'))
    client.superpositions.mockResolvedValue([])

    ensureCatalogsLoaded()
    await flush()

    expect(useCatalogStore.getState()).toMatchObject({ orbitals: [], orbitalStatus: 'error' })
  })

  it('drops answers that arrive after a reset, and aborts their requests', async () => {
    let resolveOrbitals: (value: OrbitalPreset[]) => void = () => undefined
    let rejectMixtures: (error: Error) => void = () => undefined
    client.orbitals.mockImplementation(
      () => new Promise((resolve) => {
        resolveOrbitals = resolve
      }),
    )
    client.superpositions.mockImplementation(
      () => new Promise((_resolve, reject) => {
        rejectMixtures = reject
      }),
    )
    ensureCatalogsLoaded()
    const signal = client.orbitals.mock.calls[0][0]

    resetCatalogs()
    resolveOrbitals(PRESETS)
    rejectMixtures(new Error('aborted'))
    await flush()

    expect(signal?.aborted).toBe(true)
    expect(useCatalogStore.getState()).toMatchObject({ orbitals: [], orbitalStatus: 'idle' })
    // A fresh load is allowed after a reset.
    client.orbitals.mockResolvedValue(PRESETS)
    client.superpositions.mockResolvedValue([])
    ensureCatalogsLoaded()
    await flush()
    expect(useCatalogStore.getState().orbitalStatus).toBe('ready')
  })
})

describe('useCatalogs', () => {
  it('starts the load on mount and re-renders when the catalogues arrive', async () => {
    client.orbitals.mockResolvedValue(PRESETS)
    client.superpositions.mockResolvedValue([MIXTURE(BOHR_TERMS)])
    function Probe() {
      const { orbitals, superpositions } = useCatalogs()
      return createElement('span', { 'data-count': orbitals.length + superpositions.length })
    }

    const tree = await mount(createElement(Probe))
    try {
      // No forced re-render: only the hook's store subscription can repaint the probe.
      await vi.waitFor(() => expect(tree.container.querySelector('span')?.dataset.count).toBe('2'))
    } finally {
      await tree.unmount()
    }
  })
})
