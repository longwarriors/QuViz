/** @vitest-environment jsdom */
import { act, createElement } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { OrbitalMetadata, SceneStatus, SuperpositionMetadata } from '../../api/types'
import { mount, type MountedTree } from '../../test/mount'

const fetchMetadata = vi.hoisted(() => vi.fn())
const playback = vi.hoisted(() => ({ periodAu: 16.755160819145562 as number | null }))
vi.mock('../../api/client', () => ({ fetchOrbitalMetadata: fetchMetadata }))
vi.mock('../usePlayback', () => ({ usePlaybackModel: () => ({ periodAu: playback.periodAu }) }))

import { ChartsPanel, highestTerm } from './ChartsPanel'

const LEVELS = [1, 2, 3, 4, 5].map((n) => -0.5 / (n * n))
const PROFILE = {
  r_bohr: [0, 2, 4, 6],
  radial_density: [0, 0.2, 0.1, 0.02],
  nodes_bohr: [],
  expectation_r_bohr: 5,
  most_probable_r_bohr: 2,
  energy_levels_hartree: LEVELS,
}

function eigen(withProfile: boolean): OrbitalMetadata {
  return {
    state: { n: 2, l: 1, m: 0, z: 1, a_mu: 1, basis: 'real' },
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

function mixture(aMu = 1): SuperpositionMetadata {
  return {
    terms: [
      { n: 1, l: 0, m: 0, coefficient_real: Math.SQRT1_2, coefficient_imag: 0 },
      { n: 2, l: 1, m: 0, coefficient_real: Math.SQRT1_2, coefficient_imag: 0 },
    ],
    label: '1s + 2p_z',
    basis: 'complex',
    z: 1,
    a_mu: aMu,
    reduced_mass_ratio: 1,
    time_au: 0,
    energy_expectation_hartree: -0.3125,
    is_stationary: false,
    length_unit: 'bohr',
    observable: 'probability_density',
    representation: 'isosurface',
    normalization: 'unit',
    coordinate_convention: 'physics',
    spherical_harmonic_convention: 'Condon-Shortley',
    geometry_semantics: 'surface',
    color_semantics: 'phase',
    references: [],
    warnings: [],
  }
}

async function panel(status: SceneStatus): Promise<MountedTree> {
  const tree = await mount(createElement(ChartsPanel, { status }))
  const scope = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  scope.IS_REACT_ACT_ENVIRONMENT = true
  try {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
  } finally {
    delete scope.IS_REACT_ACT_ENVIRONMENT
  }
  return tree
}

beforeEach(() => {
  fetchMetadata.mockReset()
  playback.periodAu = 16.755160819145562
})

describe('highestTerm', () => {
  it('picks the term with the largest n, whose levels cover every term', () => {
    expect(highestTerm(mixture().terms)?.n).toBe(2)
    expect(highestTerm([])).toBeUndefined()
  })
})

describe('ChartsPanel', () => {
  it('draws P(r) and the ladder from the arrived metadata, asking nothing more', async () => {
    const tree = await panel({ loading: false, metadata: eigen(true) })
    try {
      expect(tree.container.querySelector('[data-chart="radial"]')).not.toBeNull()
      expect(tree.container.querySelector('[data-chart="levels"] [data-current="true"]')?.closest('[data-level]')?.getAttribute('data-level')).toBe('2')
      expect(fetchMetadata).not.toHaveBeenCalled()
    } finally {
      await tree.unmount()
    }
  })

  it('fetches the profile when the arrived metadata has none', async () => {
    fetchMetadata.mockResolvedValue(eigen(true))
    const tree = await panel({ loading: false, metadata: eigen(false) })
    try {
      expect(fetchMetadata).toHaveBeenCalledWith({ n: 2, l: 1, m: 0, z: 1, basis: 'real' }, expect.any(AbortSignal))
      expect(tree.container.querySelector('[data-chart="radial"]')).not.toBeNull()
    } finally {
      await tree.unmount()
    }
  })

  it('says it is loading, failed, or was given no profile', async () => {
    fetchMetadata.mockImplementation(() => new Promise(() => undefined))
    const loading = await panel({ loading: false, metadata: eigen(false) })
    expect(loading.container.textContent).toContain('正在载入径向分布…')
    await loading.unmount()

    fetchMetadata.mockReset()
    fetchMetadata.mockRejectedValue(new Error('HTTP 404'))
    const failed = await panel({ loading: false, metadata: eigen(false) })
    expect(failed.container.querySelector('[role="alert"]')?.textContent).toBe('径向分布载入失败：HTTP 404')
    await failed.unmount()

    fetchMetadata.mockReset()
    fetchMetadata.mockResolvedValue(eigen(false))
    const missing = await panel({ loading: false, metadata: eigen(false) })
    expect(missing.container.textContent).toContain('服务端未提供径向分布。')
    await missing.unmount()
  })

  it('draws the superposition weights and both levels, with the beat period', async () => {
    fetchMetadata.mockResolvedValue(eigen(true))
    const tree = await panel({ loading: false, superposition: mixture() })
    try {
      expect(fetchMetadata).toHaveBeenCalledWith({ n: 2, l: 1, m: 0, z: 1, basis: 'complex' }, expect.any(AbortSignal))
      expect(tree.container.querySelector('[data-chart="terms"]')?.textContent).toContain('拍周期 T = 16.76 a.u.')
      expect(tree.container.querySelectorAll('[data-chart="levels"] [data-current="true"]')).toHaveLength(2)
    } finally {
      await tree.unmount()
    }
  })

  it('shows no energies for a reduced mass the level metadata does not describe', async () => {
    fetchMetadata.mockResolvedValue(eigen(true))
    const tree = await panel({ loading: false, superposition: mixture(0.5) })
    try {
      expect(tree.container.querySelector('[data-chart="levels"]')).toBeNull()
      expect(tree.container.textContent).toContain('能级需 a_μ = 1 的元数据')
    } finally {
      await tree.unmount()
    }
  })

  it('invites the reader to load a state when nothing has arrived', async () => {
    const tree = await panel({ loading: true })
    try {
      expect(tree.container.textContent).toContain('载入一个量子态后')
      expect(fetchMetadata).not.toHaveBeenCalled()
    } finally {
      await tree.unmount()
    }
  })
})
