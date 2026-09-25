import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it } from 'vitest'

import {
  capabilityFor,
  chargeBound,
  clampToBound,
  isPrecomputed,
  planForCapability,
  planSceneRequest,
  setStaticCatalog,
  STATIC_MISS_REASON,
  staticCapabilityFor,
  staticCatalogSpec,
  Z_CONSTRAINT,
  type Capability,
  type SceneKind,
  type SceneRequestInputs,
} from './capability'
import {
  metadataRequest,
  pointCloudRequest,
  sliceRequest,
  superpositionIsosurfaceRequest,
  type ApiRequest,
} from './requests'
import { NOT_PRECOMPUTED_DETAIL, parseStaticSpec, type StaticManifest, type StaticSpec } from './staticCatalog'
import { requestKey } from './transport'
import type { OrbitalParameters, RepresentationKind } from './types'

const SPEC = parseStaticSpec(
  JSON.parse(readFileSync(new URL('../../tools/fixtures/spec.json', import.meta.url), 'utf-8')),
)
const FILE = 'files/000000000000000000000000.json'
const TERMS = '1,0,0,0.7071067811865476;2,1,0,0.7071067811865476'
const key = (request: ApiRequest): string => requestKey(request.route, request.query)

function manifestWith(keys: readonly string[], spec: StaticSpec = SPEC): StaticManifest {
  return {
    format: 'quviz-static/1',
    version: '0000000000000000',
    spec,
    entries: Object.fromEntries(
      keys.map((entryKey) => [entryKey, { file: FILE, status: 200, content_type: 'application/json', headers: {} }]),
    ),
  }
}

function withSpec(patch: {
  eigenstates?: Partial<StaticSpec['eigenstates']>
  superpositions?: Partial<StaticSpec['superpositions']>
}): StaticSpec {
  return {
    ...SPEC,
    eigenstates: { ...SPEC.eigenstates, ...patch.eigenstates },
    superpositions: { ...SPEC.superpositions, ...patch.superpositions },
  }
}

const orbital = (patch: Partial<OrbitalParameters> = {}): OrbitalParameters => ({
  n: 2,
  l: 1,
  m: 0,
  z: 1,
  basis: 'real',
  ...patch,
})

const inputs = (patch: Partial<SceneRequestInputs> = {}): SceneRequestInputs => ({
  mode: 'eigenstate',
  representation: 'point_cloud',
  orbital: orbital(),
  samples: 28000,
  seed: 7,
  resolution: 65,
  probabilityMass: 0.9,
  seedCount: 48,
  superpositionTerms: TERMS,
  superpositionSliceResolutionFloor: 65,
  superpositionStreamlineSeedCountMax: 40,
  superpositionBasis: 'complex',
  aMu: 1,
  timeAu: 0,
  ...patch,
})

function available(capability: Capability) {
  if (capability.status !== 'available') throw new Error(JSON.stringify(capability))
  return capability
}

const frameKeys = (terms: string, times: readonly number[]): string[] =>
  times.map((time) => key(superpositionIsosurfaceRequest(terms, 'complex', 1, 1, time, 65, 0.9)))

afterEach(() => {
  setStaticCatalog(null)
})

describe('live mode: no catalogue installed', () => {
  it('is exactly the route matrix', () => {
    expect(staticCatalogSpec()).toBeNull()
    expect(chargeBound()).toBe(Z_CONSTRAINT.uiBound)
    expect(available(capabilityFor({ mode: 'eigenstate', orbital: orbital(), representation: 'point_cloud' })).parameters).toEqual({
      samples: { min: 1000, max: 120000, step: 1000 },
      seed: { min: 0, max: 2147483647, step: 1 },
    })
    const plan = planSceneRequest(inputs())
    if (plan.status !== 'available') throw new Error('expected a live plan')
    expect(isPrecomputed(plan, inputs())).toBe(false)
  })

  it('plans any time the route accepts, without snapping', () => {
    const plan = planSceneRequest(inputs({ mode: 'superposition', representation: 'isosurface', timeAu: 0.5 }))
    expect(plan).toMatchObject({ status: 'available', params: { time: 0.5 } })
  })
})

describe('static pinning', () => {
  it('pins the point-cloud samples and seed at the exported values', () => {
    setStaticCatalog(manifestWith([]))
    expect(staticCatalogSpec()).toEqual(SPEC)
    expect(available(capabilityFor({ mode: 'eigenstate', orbital: orbital(), representation: 'point_cloud' })).parameters).toEqual({
      samples: { min: 28000, max: 28000, step: 1000 },
      seed: { min: 7, max: 7, step: 1 },
    })
  })

  it('pins the isosurface grid at the lowest legal odd resolution for the state', () => {
    setStaticCatalog(manifestWith([]))
    const at = (patch: Partial<OrbitalParameters>) =>
      available(capabilityFor({ mode: 'eigenstate', orbital: orbital(patch), representation: 'isosurface' })).parameters
    expect(at({ n: 1, l: 0 }).resolution).toEqual({ min: 65, max: 65, step: 2 })
    expect(at({ n: 4, l: 3 }).resolution).toEqual({ min: 81, max: 81, step: 2 })
    expect(at({ n: 2 }).probabilityMass).toEqual({ min: 0.9, max: 0.9, step: 0.01 })
  })

  it('pins an eigenstate slice at its state floor and offers the catalogued planes', () => {
    setStaticCatalog(manifestWith([]))
    const slice = available(
      capabilityFor({ mode: 'eigenstate', orbital: orbital({ n: 4, l: 0 }), representation: 'slice' }),
    )
    expect(slice.parameters.resolution).toEqual({ min: 97, max: 97, step: 2 })
    expect(slice.parameters.aMu).toEqual({ min: 1, max: 1, step: 0.005 })
    expect(slice.planes).toEqual(['xy', 'xz', 'yz'])
    expect(slice.observables).toEqual(['probability_density', 'wavefunction_real', 'wavefunction_imag', 'phase'])
  })

  it('narrows superposition slices to the catalogued plane and the catalogue slice floor', () => {
    setStaticCatalog(manifestWith([]))
    const slice = available(
      capabilityFor({
        mode: 'superposition',
        orbital: orbital(),
        representation: 'slice',
        superpositionSliceResolutionFloor: 103,
      }),
    )
    expect(slice.planes).toEqual(['xz'])
    expect(slice.parameters.resolution).toEqual({ min: 103, max: 103, step: 2 })
    // No terms given: the clock keeps the route's interval.
    expect(slice.parameters.timeAu).toEqual({ min: -1000, max: 1000, step: 0.2 })
  })

  it('pins superposition streamlines under the catalogue ceiling', () => {
    setStaticCatalog(manifestWith([]))
    const streamlines = available(
      capabilityFor({
        mode: 'superposition',
        orbital: orbital(),
        representation: 'streamlines',
        superpositionStreamlineSeedCountMax: 24,
      }),
    )
    expect(streamlines.parameters.seedCount).toEqual({ min: 24, max: 24, step: 1 })
  })

  it('holds the charge at the catalogue Z', () => {
    setStaticCatalog(manifestWith([]))
    expect(chargeBound()).toEqual({ min: 1, max: 1, step: 0.1 })
  })

  it('offers the exported playback frames of the selected superposition as values', () => {
    setStaticCatalog(manifestWith([...frameKeys(TERMS, [1.2, 0, 0.6]), ...frameKeys('2,0,0,1', [0])]))
    const clock = available(
      capabilityFor({ mode: 'superposition', orbital: orbital(), representation: 'slice', superpositionTerms: TERMS }),
    ).parameters.timeAu
    expect(clock).toEqual({ min: 0, max: 1.2, step: 0.2, values: [0, 0.6, 1.2] })
  })

  it('finds no frames in keys that carry none', () => {
    setStaticCatalog(
      manifestWith([
        '/api/orbitals/catalog',
        key(pointCloudRequest(orbital(), 28000, 7)),
        '/api/superposition/slice?time=0',
        '/api/superposition/slice?terms=abc',
        '/api/superposition/slice?terms=abc&time=soon',
      ]),
    )
    const clock = available(
      capabilityFor({ mode: 'superposition', orbital: orbital(), representation: 'isosurface', superpositionTerms: 'abc' }),
    ).parameters.timeAu
    expect(clock).toEqual({ min: -1000, max: 1000, step: 0.2 })
  })
})

describe('static refusals', () => {
  const refusal = (capability: Capability) => {
    if (capability.status === 'available') throw new Error('expected a refusal')
    return capability
  }

  it('refuses n above the catalogue, naming the limit and the live alternative', () => {
    setStaticCatalog(manifestWith([]))
    const refused = refusal(capabilityFor({ mode: 'eigenstate', orbital: orbital({ n: 5 }), representation: 'point_cloud' }))
    expect(refused.status).toBe('not_precomputed')
    expect(refused.reason).toContain('n ≤ 4')
    expect(refused.reason).toContain('quviz serve')
  })

  it('refuses a charge the catalogue was not exported at, in both modes', () => {
    setStaticCatalog(manifestWith([]))
    for (const mode of ['eigenstate', 'superposition'] as const) {
      const refused = refusal(capabilityFor({ mode, orbital: orbital({ z: 2 }), representation: 'slice' }))
      expect(refused.status).toBe('not_precomputed')
      expect(refused.reason).toContain('Z = 1')
    }
  })

  it('refuses a basis the catalogue left out, naming it', () => {
    setStaticCatalog(manifestWith([], withSpec({ eigenstates: { bases: ['complex'] } })))
    expect(refusal(capabilityFor({ mode: 'eigenstate', orbital: orbital(), representation: 'point_cloud' })).reason).toContain('实基')
    setStaticCatalog(manifestWith([], withSpec({ eigenstates: { bases: ['real'] } })))
    expect(
      refusal(capabilityFor({ mode: 'eigenstate', orbital: orbital({ basis: 'complex' }), representation: 'point_cloud' })).reason,
    ).toContain('复基')
  })

  it('refuses a representation the catalogue left out, per mode', () => {
    setStaticCatalog(manifestWith([], withSpec({ eigenstates: { representations: ['point_cloud'] } })))
    const eigen = refusal(capabilityFor({ mode: 'eigenstate', orbital: orbital(), representation: 'isosurface' }))
    expect(eigen).toMatchObject({ status: 'not_precomputed' })
    expect(eigen.reason).toContain('本征态')
    setStaticCatalog(manifestWith([], withSpec({ superpositions: { representations: ['isosurface'] } })))
    const superposed = refusal(capabilityFor({ mode: 'superposition', orbital: orbital(), representation: 'slice' }))
    expect(superposed).toMatchObject({ status: 'not_precomputed' })
    expect(superposed.reason).toContain('叠加态')
  })

  it('keeps a physics or route refusal first, reworded without route paths', () => {
    setStaticCatalog(manifestWith([]))
    const realFlow = refusal(capabilityFor({ mode: 'eigenstate', orbital: orbital(), representation: 'streamlines' }))
    expect(realFlow.status).toBe('unsupported')
    const threeS = refusal(capabilityFor({ mode: 'eigenstate', orbital: orbital({ n: 3, l: 0 }), representation: 'isosurface' }))
    expect(threeS.status).toBe('unsupported')
    expect(threeS.reason).toContain('等值面计算')
    const highN = refusal(capabilityFor({ mode: 'eigenstate', orbital: orbital({ n: 5 }), representation: 'isosurface' }))
    expect(highN.status).toBe('unsupported')
    expect(highN.reason).toContain('等值面计算 仅接受 n ≤ 4')
    const cloud = refusal(capabilityFor({ mode: 'superposition', orbital: orbital(), representation: 'point_cloud' }))
    expect(cloud.status).toBe('not_implemented')
    expect(cloud.reason).toContain('电子云采样')
  })

  it('opens every not_precomputed reason with the contract sentence the textbook quotes', () => {
    // One user-visible wording: chapter 0 quotes it verbatim, the status chip
    // prints the reason verbatim, and the pages e2e suite matches "未预计算".
    expect(NOT_PRECOMPUTED_DETAIL).toContain('未预计算')
    expect(STATIC_MISS_REASON).toBe(NOT_PRECOMPUTED_DETAIL)
    const reasons: string[] = []
    const collect = (capability: Capability): void => {
      expect(capability.status).toBe('not_precomputed')
      if (capability.status !== 'available') reasons.push(capability.reason)
    }
    setStaticCatalog(manifestWith([]))
    // n above n_max, and a charge the catalogue was not exported at.
    collect(capabilityFor({ mode: 'eigenstate', orbital: orbital({ n: 5 }), representation: 'point_cloud' }))
    collect(capabilityFor({ mode: 'superposition', orbital: orbital({ z: 2 }), representation: 'slice' }))
    // A basis, and an eigenstate representation, the specification left out.
    setStaticCatalog(manifestWith([], withSpec({ eigenstates: { bases: ['complex'], representations: ['point_cloud'] } })))
    collect(capabilityFor({ mode: 'eigenstate', orbital: orbital(), representation: 'point_cloud' }))
    collect(capabilityFor({ mode: 'eigenstate', orbital: orbital({ basis: 'complex' }), representation: 'isosurface' }))
    // A superposition representation the specification left out.
    setStaticCatalog(manifestWith([], withSpec({ superpositions: { representations: ['isosurface'] } })))
    collect(
      capabilityFor({
        mode: 'superposition',
        orbital: orbital(),
        representation: 'streamlines',
        superpositionStreamlineSeedCountMax: 40,
      }),
    )
    // A cell the specification covers whose request the manifest lacks.
    const miss = planSceneRequest(inputs())
    if (miss.status === 'available') throw new Error('expected a catalogue miss')
    reasons.push(miss.reason)

    expect(reasons).toHaveLength(6)
    for (const reason of reasons) {
      expect(reason.startsWith(NOT_PRECOMPUTED_DETAIL), reason).toBe(true)
    }
    expect(reasons[0]).toBe(`${NOT_PRECOMPUTED_DETAIL}目录只收录 n ≤ 4 的本征态；当前态 n = 5。`)
    expect(reasons[5]).toBe(NOT_PRECOMPUTED_DETAIL)
  })

  it('never shows a /api path in any static refusal', () => {
    setStaticCatalog(manifestWith([]))
    const modes: SceneKind[] = ['eigenstate', 'superposition']
    const representations: RepresentationKind[] = ['point_cloud', 'isosurface', 'slice', 'streamlines']
    const reasons: string[] = []
    for (const mode of modes) {
      for (const representation of representations) {
        for (let n = 1; n <= 8; n += 1) {
          for (let l = 0; l < n; l += 1) {
            for (const m of [0, l]) {
              for (const basis of ['real', 'complex'] as const) {
                for (const z of [1, 2]) {
                  const capability = capabilityFor({
                    mode,
                    orbital: { n, l, m, z, basis },
                    representation,
                    superpositionStreamlineSeedCountMax: n % 2 === 0 ? 40 : undefined,
                  })
                  if (capability.status !== 'available') reasons.push(capability.reason)
                }
              }
            }
          }
        }
      }
    }
    expect(reasons.length).toBeGreaterThan(100)
    expect(reasons.filter((reason) => reason.includes('/api'))).toEqual([])
    expect(STATIC_MISS_REASON).not.toContain('/api')
  })
})

describe('static planning', () => {
  const openingKeys = [key(pointCloudRequest(orbital(), 28000, 7)), key(metadataRequest(orbital()))]

  it('plans a catalogued cell exactly as the live planner would', () => {
    setStaticCatalog(manifestWith(openingKeys))
    const plan = planSceneRequest(inputs())
    expect(plan).toEqual({
      status: 'available',
      endpoint: '/api/orbitals/point-cloud',
      params: { n: 2, l: 1, m: 0, basis: 'real', z: 1, samples: 28000, seed: 7 },
      latency: 'fast',
    })
    if (plan.status !== 'available') throw new Error('unreachable')
    expect(isPrecomputed(plan, inputs())).toBe(true)
  })

  it('refuses a cell whose request the catalogue lacks, with the catalogue reason', () => {
    setStaticCatalog(manifestWith([]))
    expect(planSceneRequest(inputs())).toEqual({ status: 'not_precomputed', reason: STATIC_MISS_REASON })
  })

  it('needs the metadata request as well as the cloud', () => {
    setStaticCatalog(manifestWith([openingKeys[0]]))
    expect(planSceneRequest(inputs()).status).toBe('not_precomputed')
  })

  it('sends the pinned tunables even when the store still holds other values', () => {
    setStaticCatalog(manifestWith(openingKeys))
    expect(planSceneRequest(inputs({ samples: 50000, seed: 99 }))).toMatchObject({
      status: 'available',
      params: { samples: 28000, seed: 7 },
    })
  })

  it('snaps a superposition time to the nearest exported frame', () => {
    setStaticCatalog(manifestWith(frameKeys(TERMS, [0, 0.6, 1.2])))
    const at = (timeAu: number) =>
      planSceneRequest(inputs({ mode: 'superposition', representation: 'isosurface', timeAu }))
    expect(at(0.5)).toMatchObject({ status: 'available', params: { time: 0.6 } })
    expect(at(7)).toMatchObject({ status: 'available', params: { time: 1.2 } })
  })

  it('plans an eigenstate slice on a catalogued plane', () => {
    setStaticCatalog(manifestWith([key(sliceRequest(orbital(), 65, 1, 'xy', 'phase'))]))
    expect(planSceneRequest(inputs({ representation: 'slice', plane: 'xy', sliceObservable: 'phase' })).status).toBe('available')
  })
})

describe('build-time helpers', () => {
  it('pin from a spec without an installed catalogue', () => {
    const capability = available(
      staticCapabilityFor({ mode: 'eigenstate', orbital: orbital({ n: 4, l: 3 }), representation: 'isosurface' }, SPEC),
    )
    expect(staticCatalogSpec()).toBeNull()
    expect(capability.parameters.resolution).toEqual({ min: 81, max: 81, step: 2 })
  })

  it('plan exactly what the installed catalogue plans', () => {
    const request = inputs({ orbital: orbital({ n: 3, l: 2, m: 2, basis: 'complex' }), representation: 'streamlines' })
    const built = planForCapability(available(staticCapabilityFor(request, SPEC)), request)
    setStaticCatalog(manifestWith(['/api/orbitals/current-field?n=3&l=2&m=2&z=1&basis=complex&seed_count=48']))
    expect(planSceneRequest(request)).toEqual(built)
  })
})

describe('clampToBound', () => {
  const frames = { min: 0, max: 1.2, step: 0.2, values: [0, 0.6, 1.2] }

  it('moves to the nearest listed value, the earlier one on a tie, the first one for NaN', () => {
    expect(clampToBound(frames, 0.25)).toBe(0)
    expect(clampToBound(frames, 0.35)).toBe(0.6)
    expect(clampToBound(frames, 0.3)).toBe(0)
    expect(clampToBound(frames, 99)).toBe(1.2)
    expect(clampToBound(frames, Number.NaN)).toBe(0)
  })

  it('falls back to the interval when the value list is empty', () => {
    expect(clampToBound({ min: 1, max: 3, step: 1, values: [] }, 7.4)).toBe(3)
  })

  it('rounds counts but never a fractional increment', () => {
    expect(clampToBound({ min: 1000, max: 120000, step: 1000 }, 20000.4)).toBe(20000)
    expect(clampToBound({ min: 0.5, max: 0.99, step: 0.01 }, 0.905)).toBe(0.905)
  })
})

describe('setStaticCatalog(null)', () => {
  it('restores the live matrix', () => {
    setStaticCatalog(manifestWith([]))
    setStaticCatalog(null)
    expect(staticCatalogSpec()).toBeNull()
    expect(
      available(capabilityFor({ mode: 'eigenstate', orbital: orbital(), representation: 'point_cloud' })).parameters.samples,
    ).toEqual({ min: 1000, max: 120000, step: 1000 })
  })
})
