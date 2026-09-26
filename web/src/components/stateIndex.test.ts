import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import type { OrbitalPreset, SuperpositionMetadata, SuperpositionPreset } from '../api/types'
import {
  buildSearchEntries,
  catalogueMixtureFor,
  MIXTURE_COPY,
  mixtureLabel,
  orbitalName,
  searchEntries,
} from './stateIndex'

/** A committed server response under tests/fixtures/visual/ (rebuilt by tests/test_visual_fixtures.py). */
const visualFixture = (name: string): unknown =>
  JSON.parse(readFileSync(new URL(`../../../tests/fixtures/visual/${name}`, import.meta.url), 'utf-8'))

describe('MIXTURE_COPY', () => {
  it('names every preset the server catalogue publishes', () => {
    // The committed catalogue fixture is the server's own response bytes
    // (tests/fixtures/visual/, rebuilt by tests/test_visual_fixtures.py).
    const catalogue = visualFixture('catalog-superposition.json') as { id: string }[]
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

describe('catalogueMixtureFor / mixtureLabel', () => {
  const catalogue = visualFixture('catalog-superposition.json') as SuperpositionPreset[]
  type Terms = SuperpositionMetadata['terms']
  const term = (n: number, l: number, m: number, re: number, im = 0): Terms[number] => ({
    n,
    l,
    m,
    coefficient_real: re,
    coefficient_imag: im,
  })
  const HALF = 0.7071067811865476

  it.each([
    ['1s2pz-t0-xz.json', '1s-2pz'],
    ['1s2pz-t8.4-xz.json', '1s-2pz'],
    ['degenerate-stationary-xz-t0.json', '2s-2pz'],
  ])('finds the preset the server built %s from, in the server bytes', (fixture, id) => {
    const payload = visualFixture(fixture) as { metadata: SuperpositionMetadata }
    expect(catalogueMixtureFor(payload.metadata.terms, catalogue)?.id).toBe(id)
  })

  it('titles a preset with the panel copy, or the server label for an id the copy deck lacks', () => {
    const preset = catalogue.find((entry) => entry.id === '1s-2pz')
    if (preset === undefined) throw new Error('no 1s-2pz in the catalogue fixture')
    expect(mixtureLabel(preset)).toBe('1s + 2p_z · Bohr 振荡')
    expect(mixtureLabel({ ...preset, id: 'not-in-the-copy-deck' })).toBe(preset.label)
  })

  it('matches no preset for a custom mixture', () => {
    const custom: Terms[] = [
      // Other weights.
      [term(1, 0, 0, 0.6), term(2, 1, 0, 0.8)],
      // The same kets in the other order: a different request, not the preset.
      [term(2, 1, 0, HALF), term(1, 0, 0, HALF)],
      // A relative sign, and a relative phase.
      [term(1, 0, 0, HALF), term(2, 1, 0, -HALF)],
      [term(1, 0, 0, HALF), term(2, 1, 0, 0, HALF)],
      // A term missing, a term extra, another m.
      [term(1, 0, 0, 1)],
      [term(1, 0, 0, HALF), term(2, 1, 0, HALF), term(3, 2, 0, 0)],
      [term(1, 0, 0, HALF), term(2, 1, 1, HALF)],
    ]
    for (const terms of custom) expect(catalogueMixtureFor(terms, catalogue), JSON.stringify(terms)).toBeUndefined()
    expect(catalogueMixtureFor([term(1, 0, 0, HALF), term(2, 1, 0, HALF)], [])).toBeUndefined()
  })

  it('reads an explicit imaginary part and drops zero amplitudes, as the server parses terms', () => {
    const preset = { ...catalogue[0], id: 'probe', terms: '1,0,0,0.6; 2,1,1,0,0.8;3,0,0,0' }
    expect(catalogueMixtureFor([term(1, 0, 0, 0.6), term(2, 1, 1, 0, 0.8)], [preset])?.id).toBe('probe')
    // A malformed entry is simply not a match.
    expect(catalogueMixtureFor([term(1, 0, 0, 1)], [{ ...preset, terms: '1,0,x,1' }])).toBeUndefined()
    expect(catalogueMixtureFor([term(1, 0, 0, 1)], [{ ...preset, terms: '1,0,0' }])).toBeUndefined()
  })
})
