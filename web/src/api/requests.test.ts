import { describe, expect, it } from 'vitest'

import {
  CAPABILITY_ROUTE_CONSTRAINTS,
  planSceneRequest,
  type ScenePlan,
  type SceneRequestInputs,
} from './capability'
import {
  currentFieldRequest,
  isosurfaceRequest,
  metadataRequest,
  ORBITAL_CATALOG_REQUEST,
  ORBITAL_CURRENT_FIELD_ROUTE,
  ORBITAL_ISOSURFACE_ROUTE,
  ORBITAL_POINT_CLOUD_ROUTE,
  ORBITAL_SLICE_ROUTE,
  pointCloudRequest,
  requestsForPlan,
  sceneCallFor,
  sliceRequest,
  SUPERPOSITION_CATALOG_REQUEST,
  SUPERPOSITION_CURRENT_FIELD_ROUTE,
  SUPERPOSITION_ISOSURFACE_ROUTE,
  SUPERPOSITION_SLICE_ROUTE,
  superpositionCurrentFieldRequest,
  superpositionIsosurfaceRequest,
  superpositionSliceRequest,
  type ApiRequest,
} from './requests'
import { requestKey } from './transport'
import type { OrbitalParameters } from './types'

const key = (request: ApiRequest): string => requestKey(request.route, request.query)

const orbital: OrbitalParameters = { n: 3, l: 2, m: -1, z: 2, basis: 'complex' }

/** The terms string client.test.ts pins, and its encoded form. */
const terms = '2,0,0:1+0j;2,1,0:0+1j'
const encodedTerms = encodeURIComponent(terms).replace(/%20/g, '+')

describe('eigenstate request formation: the strings client.test.ts pins today', () => {
  it('point cloud (client.test.ts:205-208)', () => {
    expect(key(pointCloudRequest({ n: 1, l: 0, m: 0, z: 1, basis: 'real' }, 1000, 5))).toBe(
      '/api/orbitals/point-cloud?n=1&l=0&m=0&z=1&basis=real&samples=1000&seed=5',
    )
  })

  it('metadata (client.test.ts:419-422)', () => {
    expect(key(metadataRequest(orbital))).toBe('/api/orbitals/metadata?n=3&l=2&m=-1&z=2&basis=complex')
  })

  it('isosurface', () => {
    expect(key(isosurfaceRequest(orbital, 65, 0.9))).toBe(
      '/api/orbitals/isosurface?n=3&l=2&m=-1&z=2&basis=complex&resolution=65&probability_mass=0.9',
    )
  })

  it('current field', () => {
    expect(key(currentFieldRequest(orbital, 48))).toBe(
      '/api/orbitals/current-field?n=3&l=2&m=-1&z=2&basis=complex&seed_count=48',
    )
  })

  it('slice (client.test.ts:745-747)', () => {
    expect(key(sliceRequest(orbital, 65, 1.5, 'yz', 'phase'))).toBe(
      '/api/orbitals/slice?n=3&l=2&m=-1&z=2&basis=complex&resolution=65&a_mu=1.5&plane=yz&observable=phase',
    )
  })

  it('spells the orbital field by field, so a stray property cannot reach the query', () => {
    const stray = { ...orbital, id: '3d', label: '3d(-1)' }
    expect(key(metadataRequest(stray))).toBe(key(metadataRequest(orbital)))
  })
})

describe('superposition request formation', () => {
  it('isosurface (client.test.ts:608-610)', () => {
    expect(key(superpositionIsosurfaceRequest(terms, 'real', 2, 1.5, 1.25, 64, 0.75))).toBe(
      `/api/superposition/isosurface?terms=${encodedTerms}&time=1.25&resolution=64&basis=real&z=2&a_mu=1.5&probability_mass=0.75`,
    )
  })

  it('current field (client.test.ts:663-665)', () => {
    expect(key(superpositionCurrentFieldRequest(terms, 'real', 2, 1.5, 1.25, 40))).toBe(
      `/api/superposition/current-field?terms=${encodedTerms}&time=1.25&seed_count=40&basis=real&z=2&a_mu=1.5`,
    )
  })

  it('slice (client.test.ts:859-862)', () => {
    expect(
      key(superpositionSliceRequest(terms, 'real', 2, 1.5, 1.25, 65, 'xy', 'wavefunction_real')),
    ).toBe(
      `/api/superposition/slice?terms=${encodedTerms}&time=1.25&resolution=65&basis=real&z=2&a_mu=1.5` +
        '&plane=xy&observable=wavefunction_real',
    )
  })

  it('spells lattice times the way String(number) does (3, not 3.0)', () => {
    const request = superpositionIsosurfaceRequest('1,0,0,1', 'complex', 1, 1, 3, 65, 0.9)
    expect(request.query?.get('time')).toBe('3')
    expect(request.query?.get('z')).toBe('1')
  })
})

describe('catalogue requests', () => {
  it('carry no query', () => {
    expect(key(ORBITAL_CATALOG_REQUEST)).toBe('/api/orbitals/catalog')
    expect(key(SUPERPOSITION_CATALOG_REQUEST)).toBe('/api/superposition/catalog')
    expect(ORBITAL_CATALOG_REQUEST.query).toBeNull()
    expect(Object.isFrozen(ORBITAL_CATALOG_REQUEST)).toBe(true)
    expect(Object.isFrozen(SUPERPOSITION_CATALOG_REQUEST)).toBe(true)
  })
})

describe('route table', () => {
  it('names exactly the scene endpoints the capability matrix plans', () => {
    const scene = [
      ORBITAL_POINT_CLOUD_ROUTE,
      ORBITAL_ISOSURFACE_ROUTE,
      ORBITAL_CURRENT_FIELD_ROUTE,
      ORBITAL_SLICE_ROUTE,
      SUPERPOSITION_ISOSURFACE_ROUTE,
      SUPERPOSITION_CURRENT_FIELD_ROUTE,
      SUPERPOSITION_SLICE_ROUTE,
    ].sort()
    const planned = Object.values(CAPABILITY_ROUTE_CONSTRAINTS)
      .map((route) => route.endpoint as string)
      .sort()
    expect(scene).toEqual(planned)
  })
})

/* ------------------------------------------------------------ scene dispatch */

const TERMS_1S2PZ = '1,0,0,0.7071067811865476;2,1,0,0.7071067811865476'
const ENCODED_1S2PZ = new URLSearchParams({ terms: TERMS_1S2PZ }).toString().slice('terms='.length)

const sceneInputs = (patch: Partial<SceneRequestInputs> = {}): SceneRequestInputs => ({
  mode: 'eigenstate',
  representation: 'point_cloud',
  orbital: { n: 2, l: 1, m: 1, z: 1, basis: 'complex' },
  samples: 28000,
  seed: 7,
  resolution: 65,
  probabilityMass: 0.9,
  seedCount: 48,
  superpositionTerms: TERMS_1S2PZ,
  superpositionStreamlineSeedCountMax: 40,
  superpositionBasis: 'complex',
  aMu: 1,
  timeAu: 0.6,
  ...patch,
})

function planFor(inputs: SceneRequestInputs): ScenePlan {
  const plan = planSceneRequest(inputs)
  if (plan.status !== 'available') throw new Error(`expected a plan: ${plan.reason}`)
  return plan
}

describe('requestsForPlan', () => {
  it.each([
    [
      'point cloud: the cloud and its metadata, in fetch order',
      sceneInputs(),
      [
        '/api/orbitals/point-cloud?n=2&l=1&m=1&z=1&basis=complex&samples=28000&seed=7',
        '/api/orbitals/metadata?n=2&l=1&m=1&z=1&basis=complex',
      ],
    ],
    [
      'eigenstate isosurface',
      sceneInputs({ representation: 'isosurface' }),
      ['/api/orbitals/isosurface?n=2&l=1&m=1&z=1&basis=complex&resolution=65&probability_mass=0.9'],
    ],
    [
      'eigenstate streamlines',
      sceneInputs({ representation: 'streamlines' }),
      ['/api/orbitals/current-field?n=2&l=1&m=1&z=1&basis=complex&seed_count=48'],
    ],
    [
      'eigenstate slice',
      sceneInputs({ representation: 'slice', plane: 'yz', sliceObservable: 'phase' }),
      ['/api/orbitals/slice?n=2&l=1&m=1&z=1&basis=complex&resolution=65&a_mu=1&plane=yz&observable=phase'],
    ],
    [
      'superposition isosurface',
      sceneInputs({ mode: 'superposition', representation: 'isosurface' }),
      [
        `/api/superposition/isosurface?terms=${ENCODED_1S2PZ}&time=0.6&resolution=65&basis=complex&z=1&a_mu=1&probability_mass=0.9`,
      ],
    ],
    [
      'superposition streamlines (seed count clamped to the catalogue 40)',
      sceneInputs({ mode: 'superposition', representation: 'streamlines' }),
      [
        `/api/superposition/current-field?terms=${ENCODED_1S2PZ}&time=0.6&seed_count=40&basis=complex&z=1&a_mu=1`,
      ],
    ],
    [
      'superposition slice (route default plane and observable)',
      sceneInputs({ mode: 'superposition', representation: 'slice' }),
      [
        `/api/superposition/slice?terms=${ENCODED_1S2PZ}&time=0.6&resolution=65&basis=complex&z=1&a_mu=1&plane=xz&observable=probability_density`,
      ],
    ],
  ] as const)('%s', (_label, inputs, expected) => {
    expect(requestsForPlan(planFor(inputs), inputs).map(key)).toEqual(expected)
  })
})

describe('sceneCallFor', () => {
  it('takes the state from the inputs and every tunable from the clamped plan', () => {
    const inputs = sceneInputs({ mode: 'superposition', representation: 'isosurface' })
    const clamped = planFor({ ...inputs, aMu: 100, resolution: 999 })
    expect(sceneCallFor(clamped, inputs)).toEqual({
      kind: 'superposition_isosurface',
      terms: TERMS_1S2PZ,
      basis: 'complex',
      z: 1,
      aMu: 20,
      timeAu: 0.6,
      resolution: 81,
      probabilityMass: 0.9,
    })
  })

  it('refuses an endpoint no fetcher serves', () => {
    expect(() =>
      sceneCallFor(
        { status: 'available', endpoint: '/api/orbitals/hologram', params: {}, latency: 'fast' },
        sceneInputs(),
      ),
    ).toThrow('No client fetcher serves /api/orbitals/hologram.')
  })

  it('refuses a plan missing a number its endpoint needs', () => {
    expect(() =>
      sceneCallFor(
        {
          status: 'available',
          endpoint: '/api/orbitals/isosurface',
          params: { probability_mass: 0.9 },
          latency: 'slow',
        },
        sceneInputs(),
      ),
    ).toThrow('The plan for /api/orbitals/isosurface carries no numeric resolution.')
  })

  it('refuses a slice plan with no plane, or a plane outside the principal set', () => {
    expect(() =>
      sceneCallFor(
        {
          status: 'available',
          endpoint: '/api/orbitals/slice',
          params: { resolution: 65, a_mu: 1, observable: 'phase' },
          latency: 'slow',
        },
        sceneInputs(),
      ),
    ).toThrow('The plan for /api/orbitals/slice carries no plane.')
    expect(() =>
      sceneCallFor(
        {
          status: 'available',
          endpoint: '/api/superposition/slice',
          params: { resolution: 65, a_mu: 1, time: 0, plane: 'xw', observable: 'phase' },
          latency: 'slow',
        },
        sceneInputs({ mode: 'superposition' }),
      ),
    ).toThrow('names plane=xw')
  })
})
