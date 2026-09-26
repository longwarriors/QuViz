import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it } from 'vitest'

import { nextTimeAu, selectSceneRequestInputs, type SceneInputSource } from '../components/sceneRequest'
import { useSceneStore } from '../state/useSceneStore'
import { playbackFrameCount, planSceneRequest, setStaticCatalog, STATIC_A_MU, type SceneRequestInputs } from './capability'
import { parseSuperpositionCatalog } from './client'
import { parseStaticSpec, type StaticManifest } from './staticCatalog'
import {
  buildStaticRequestsFile,
  enumerateStaticRequests,
  STATIC_REQUESTS_FORMAT,
  STATIC_SUPERPOSITION_BASIS,
} from './staticEnumeration'

const readJson = (relative: string): unknown =>
  JSON.parse(readFileSync(new URL(relative, import.meta.url), 'utf-8'))

const RAW_SPEC = readJson('../../tools/fixtures/spec.json')
const RAW_ORBITALS = readJson('../../../tests/fixtures/visual/catalog-orbitals.json')
const RAW_SUPERPOSITIONS = readJson('../../../tests/fixtures/visual/catalog-superposition.json')
const SPEC = parseStaticSpec(RAW_SPEC)
const SUPERPOSITIONS = parseSuperpositionCatalog(RAW_SUPERPOSITIONS)
const encoded = (terms: string): string => new URLSearchParams({ terms }).toString().slice('terms='.length)
const termsOf = (id: string): string => {
  const found = SUPERPOSITIONS.find((entry) => entry.id === id)
  if (found === undefined) throw new Error(`no preset ${id}`)
  return found.terms
}

const REQUESTS = enumerateStaticRequests(SPEC, SUPERPOSITIONS)

function manifestFor(keys: readonly string[]): StaticManifest {
  return {
    format: 'quviz-static/1',
    version: '0000000000000000',
    spec: SPEC,
    entries: Object.fromEntries(
      keys.map((key) => [
        key,
        { file: 'files/000000000000000000000000.json', status: 200, content_type: 'application/json', headers: {} },
      ]),
    ),
  }
}

/** What the running app would plan: the store's real defaults plus a patch. */
const STORE = useSceneStore.getInitialState()
const runtimeInputs = (patch: Partial<SceneInputSource>): SceneRequestInputs =>
  selectSceneRequestInputs({ ...STORE, ...patch })

afterEach(() => {
  setStaticCatalog(null)
})

describe('enumerateStaticRequests', () => {
  it('lists the catalogues, every metadata request and every precomputed cell, sorted and unique', () => {
    expect(REQUESTS).toEqual([...new Set(REQUESTS)].sort())
    // 2 catalogues + 60 metadata (30 states x 2 bases) + 60 point clouds
    // + 56 isosurfaces (3s and 4s refused in both bases) + 720 slices
    // (60 states x 3 planes x 4 observables) + 20 streamline sets (complex, m != 0)
    // + 324 superposition requests ((28 + 1 + 24 + 1) frames x (1 isosurface + 4 xz slices + 1 streamline set)).
    expect(REQUESTS).toHaveLength(1242)
  })

  it('spells the exact keys the static site will look up', () => {
    const iso3dz2 = encoded(termsOf('1s-3dz2'))
    const iso1s2pz = encoded(termsOf('1s-2pz'))
    for (const key of [
      '/api/orbitals/catalog',
      '/api/superposition/catalog',
      '/api/orbitals/point-cloud?n=2&l=1&m=0&z=1&basis=real&samples=28000&seed=7',
      '/api/orbitals/metadata?n=2&l=1&m=0&z=1&basis=real',
      '/api/orbitals/isosurface?n=4&l=3&m=0&z=1&basis=real&resolution=81&probability_mass=0.9',
      '/api/orbitals/slice?n=4&l=0&m=0&z=1&basis=complex&resolution=97&a_mu=1&plane=yz&observable=phase',
      `/api/superposition/slice?terms=${iso3dz2}&time=5.8&resolution=103&basis=complex&z=1&a_mu=1&plane=xz&observable=wavefunction_imag`,
      `/api/superposition/current-field?terms=${iso3dz2}&time=0&seed_count=24&basis=complex&z=1&a_mu=1`,
      `/api/superposition/isosurface?terms=${iso1s2pz}&time=16.2&resolution=65&basis=complex&z=1&a_mu=1&probability_mass=0.9`,
    ]) {
      expect(REQUESTS, key).toContain(key)
    }
  })

  it('skips what the physics refuses and what the spec leaves out', () => {
    expect(REQUESTS.filter((key) => key.startsWith('/api/orbitals/isosurface?n=3&l=0'))).toEqual([])
    expect(REQUESTS.filter((key) => key.startsWith('/api/orbitals/current-field?') && key.includes('basis=real'))).toEqual([])
    expect(REQUESTS.filter((key) => key.startsWith('/api/superposition/slice?') && !key.includes('plane=xz'))).toEqual([])
    const degenerate = REQUESTS.filter((key) => key.includes(encoded(termsOf('2s-2pz'))))
    expect(degenerate).toHaveLength(6)
    expect(degenerate.every((key) => key.includes('&time=0&'))).toBe(true)
  })

  it('refuses a spec preset the server catalogue does not list', () => {
    expect(() => enumerateStaticRequests(SPEC, SUPERPOSITIONS.slice(1))).toThrow(
      '静态目录规格引用了服务端目录中不存在的叠加态预设 1s-2pz。',
    )
  })

  it('uses the store defaults no control changes', () => {
    expect(STATIC_SUPERPOSITION_BASIS).toBe(STORE.superpositionBasis)
    expect(STATIC_A_MU).toBe(STORE.aMu)
  })
})

describe('the running static site asks for exactly what was enumerated', () => {
  it('finds every eigenstate cell of the spec precomputed, or refused by the physics', () => {
    setStaticCatalog(manifestFor(REQUESTS))
    let precomputed = 0
    for (let n = 1; n <= SPEC.eigenstates.n_max; n += 1) {
      for (let l = 0; l < n; l += 1) {
        for (let m = -l; m <= l; m += 1) {
          for (const basis of SPEC.eigenstates.bases) {
            for (const representation of SPEC.eigenstates.representations) {
              const sections =
                representation === 'slice'
                  ? SPEC.eigenstates.planes.flatMap((plane) =>
                      SPEC.eigenstates.observables.map((sliceObservable) => ({ plane, sliceObservable })),
                    )
                  : [{ plane: STORE.plane, sliceObservable: STORE.sliceObservable }]
              for (const section of sections) {
                const plan = planSceneRequest(
                  runtimeInputs({ orbital: { n, l, m, z: 1, basis }, representation, ...section }),
                )
                expect(plan.status, JSON.stringify({ n, l, m, basis, representation, ...section })).not.toBe(
                  'not_precomputed',
                )
                if (plan.status === 'available') precomputed += 1
              }
            }
          }
        }
      }
    }
    // 60 point clouds + 56 isosurfaces + 720 slices + 20 streamline sets.
    expect(precomputed).toBe(856)
  })

  it('finds every playback frame of every precomputed superposition', () => {
    setStaticCatalog(manifestFor(REQUESTS))
    for (const id of SPEC.superpositions.presets) {
      const preset = SUPERPOSITIONS.find((entry) => entry.id === id)
      if (preset === undefined) throw new Error(`no preset ${id}`)
      for (const representation of SPEC.superpositions.representations) {
        const sections =
          representation === 'slice'
            ? SPEC.superpositions.planes.flatMap((plane) =>
                SPEC.superpositions.observables.map((sliceObservable) => ({ plane, sliceObservable })),
              )
            : [{ plane: STORE.plane, sliceObservable: STORE.sliceObservable }]
        for (const section of sections) {
          let time = 0
          const lap = Math.max(1, playbackFrameCount(preset.period_au))
          for (let frame = 0; frame < lap; frame += 1) {
            const plan = planSceneRequest(
              runtimeInputs({
                mode: 'superposition',
                representation,
                superpositionTerms: preset.terms,
                superpositionSliceResolutionFloor: preset.slice_resolution_floor,
                superpositionStreamlineSeedCountMax: preset.streamline_seed_count_max,
                timeAu: time,
                ...section,
              }),
            )
            expect(plan.status, `${id} ${representation} t=${time}`).toBe('available')
            time = nextTimeAu(time, preset.period_au)
          }
        }
      }
    }
  })

  it('refuses the opening scene when its metadata is missing (negative control)', () => {
    const metadata = '/api/orbitals/metadata?n=2&l=1&m=0&z=1&basis=real'
    setStaticCatalog(manifestFor(REQUESTS.filter((key) => key !== metadata)))
    expect(planSceneRequest(runtimeInputs({})).status).toBe('not_precomputed')
  })
})

describe('buildStaticRequestsFile', () => {
  it('parses the exporter files and writes the contract envelope', () => {
    const file = buildStaticRequestsFile(RAW_SPEC, RAW_ORBITALS, RAW_SUPERPOSITIONS)
    expect(file.format).toBe(STATIC_REQUESTS_FORMAT)
    expect(file.format).toBe('quviz-static-requests/1')
    expect(file.requests).toEqual(REQUESTS)
  })

  it('fails on a malformed spec or catalogue before enumerating anything', () => {
    expect(() => buildStaticRequestsFile({ format: 'x' }, RAW_ORBITALS, RAW_SUPERPOSITIONS)).toThrow('spec.json.format')
    expect(() => buildStaticRequestsFile(RAW_SPEC, { presets: [] }, RAW_SUPERPOSITIONS)).toThrow(
      'orbital catalog must be an array',
    )
    expect(() => buildStaticRequestsFile(RAW_SPEC, RAW_ORBITALS, null)).toThrow(
      'superposition catalog must be an array',
    )
  })
})
