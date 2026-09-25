import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import type { OrbitalPreset, SuperpositionPreset } from '../api/types'
import { buildSearchEntries, MIXTURE_COPY, orbitalName, searchEntries } from './stateIndex'

describe('MIXTURE_COPY', () => {
  it('names every preset the server catalogue publishes', () => {
    // The committed catalogue fixture is the server's own response bytes
    // (tests/fixtures/visual/, rebuilt by tests/test_visual_fixtures.py).
    const catalogue = JSON.parse(
      readFileSync(new URL('../../../tests/fixtures/visual/catalog-superposition.json', import.meta.url), 'utf-8'),
    ) as { id: string }[]
    for (const { id } of catalogue) {
      expect(MIXTURE_COPY[id]?.label, id).toBeTruthy()
      expect(MIXTURE_COPY[id]?.note, id).toBeTruthy()
    }
  })
})

const PRESETS: OrbitalPreset[] = [
  { id: '2pz', label: '2p_z', n: 2, l: 1, m: 0, basis: 'real', z: 1 },
  { id: '3d-complex', label: '3d, m=2', n: 3, l: 2, m: 2, basis: 'complex', z: 1 },
]
const MIXTURES: SuperpositionPreset[] = [
  {
    id: '1s-2pz',
    label: '1s + 2p_z (Bohr oscillation)',
    terms: '1,0,0,0.7071067811865476;2,1,0,0.7071067811865476',
    period_au: 16.755160819145562,
    note: 'Bohr',
    slice_resolution_floor: 65,
    streamline_seed_count_max: 40,
    default_representation: 'isosurface',
  },
  {
    id: '2s-2pz',
    label: '2s + 2p_z (degenerate, stationary)',
    terms: '2,0,0,0.7071067811865476;2,1,0,0.7071067811865476',
    period_au: 0,
    note: 'control',
    slice_resolution_floor: 65,
    streamline_seed_count_max: 40,
    // A10: the only preset whose route-default isosurface the server refuses.
    default_representation: 'slice',
  },
]

describe('orbitalName', () => {
  it('names real p and d orbitals by their Cartesian label, the rest by m', () => {
    expect(orbitalName(1, 0, 0, 'real')).toBe('1s')
    expect(orbitalName(2, 1, 1, 'real')).toBe('2p_x')
    expect(orbitalName(2, 1, -1, 'real')).toBe('2p_y')
    expect(orbitalName(2, 1, 0, 'real')).toBe('2p_z')
    expect(orbitalName(3, 2, 0, 'real')).toBe('3d_z²')
    expect(orbitalName(3, 2, 1, 'real')).toBe('3d_xz')
    expect(orbitalName(3, 2, -1, 'real')).toBe('3d_yz')
    expect(orbitalName(3, 2, 2, 'real')).toBe('3d_x²−y²')
    expect(orbitalName(3, 2, -2, 'real')).toBe('3d_xy')
    expect(orbitalName(4, 3, 1, 'real')).toBe('4f, m=+1')
    expect(orbitalName(2, 1, -1, 'complex')).toBe('2p, m=-1')
    expect(orbitalName(8, 7, 0, 'complex')).toBe('8k, m=0')
  })
})

describe('buildSearchEntries / searchEntries', () => {
  const entries = buildSearchEntries({ presets: PRESETS, mixtures: MIXTURES, maxN: 4, isAvailable: () => true })

  it('lists presets, then superpositions, then every n ≤ 4 state once', () => {
    // Σn² = 30 real states + 20 complex m ≠ 0 states, minus the two presets.
    expect(entries.filter((entry) => entry.kind === 'eigenstate')).toHaveLength(48)
    expect(entries.slice(0, 4).map((entry) => entry.kind)).toEqual(['preset', 'preset', 'superposition', 'superposition'])
    expect(entries[0].tags).toEqual(['预设', '实基'])
    expect(entries[3]).toMatchObject({ label: '2s + 2p_z · 简并定态', tags: ['叠加', '简并'] })
    expect(entries.some((entry) => entry.id === 'eig-2-1-0-real')).toBe(false)
    expect(entries.some((entry) => entry.id === 'eig-2-1-0-complex')).toBe(false)
  })

  it('gives an s state m = +0, never −0, so the store holds a plain zero', () => {
    // toEqual tells −0 from +0; a loop starting at `-l` hands l = 0 a −0.
    expect(entries.find((entry) => entry.id === 'eig-1-0-0-real')?.orbital).toEqual({ n: 1, l: 0, m: 0, basis: 'real' })
  })

  it('keeps only what the capability matrix can draw', () => {
    const onlyN1 = buildSearchEntries({
      presets: [],
      mixtures: [],
      maxN: 8,
      isAvailable: (orbital) => orbital.n === 1,
    })
    expect(onlyN1.map((entry) => entry.label)).toEqual(['1s'])
  })

  it('matches every typed token, ignoring case, spaces, underscores and superscripts', () => {
    expect(searchEntries(entries, '3dxy').map((entry) => entry.label)).toEqual(['3d_xy'])
    expect(searchEntries(entries, '3dz2').map((entry) => entry.label)).toEqual(['3d_z²'])
    expect(searchEntries(entries, 'BOHR').map((entry) => entry.id)).toEqual(['mix-1s-2pz'])
    expect(searchEntries(entries, '叠加').every((entry) => entry.kind === 'superposition')).toBe(true)
    expect(searchEntries(entries, 'complex n=2').map((entry) => entry.label)).toEqual(['2p, m=-1', '2p, m=+1'])
    expect(searchEntries(entries, '')).toHaveLength(40)
    expect(searchEntries(entries, '', 5)).toHaveLength(5)
    expect(searchEntries(entries, 'zzz')).toEqual([])
  })
})
