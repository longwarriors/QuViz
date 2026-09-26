import type { ScenePlan, SceneRequestInputs } from './capability'
import { PRINCIPAL_PLANES, SLICE_OBSERVABLES } from './sliceContract'
import type { BasisKind, OrbitalParameters, PrincipalPlane, SliceObservable } from './types'

/**
 * Request formation, and nothing else: no I/O, no store, no transport.
 *
 * Every query below is spelled in exactly the order and form `client.ts`
 * spelled it with `URLSearchParams` + `String(value)` before this module
 * existed (client.test.ts pins the literal strings), because that string is
 * now two things at once: the URL the live transport fetches and the key the
 * static catalogue is looked up by. The build-time enumerator
 * (src/api/staticEnumeration.ts) and the static capability overlay call these
 * same functions, so the three can only disagree through a bug in one place.
 */

/** The orbital fields an eigenstate route reads. Wire order: n, l, m, z, basis. */
export type OrbitalRequestState = OrbitalParameters

export interface ApiRequest {
  route: string
  query: URLSearchParams | null
}

export const ORBITAL_POINT_CLOUD_ROUTE = '/api/orbitals/point-cloud'
export const ORBITAL_METADATA_ROUTE = '/api/orbitals/metadata'
export const ORBITAL_ISOSURFACE_ROUTE = '/api/orbitals/isosurface'
export const ORBITAL_CURRENT_FIELD_ROUTE = '/api/orbitals/current-field'
export const ORBITAL_SLICE_ROUTE = '/api/orbitals/slice'
export const ORBITAL_CATALOG_ROUTE = '/api/orbitals/catalog'
export const SUPERPOSITION_ISOSURFACE_ROUTE = '/api/superposition/isosurface'
export const SUPERPOSITION_CURRENT_FIELD_ROUTE = '/api/superposition/current-field'
export const SUPERPOSITION_SLICE_ROUTE = '/api/superposition/slice'
export const SUPERPOSITION_CATALOG_ROUTE = '/api/superposition/catalog'

type QueryEntry = readonly [string, string | number]

function query(entries: readonly QueryEntry[]): URLSearchParams {
  const search = new URLSearchParams()
  for (const [name, value] of entries) search.set(name, String(value))
  return search
}

/**
 * Spelled field by field rather than spread from the object: the old
 * `Object.entries(params)` sent whatever own properties the caller's object
 * carried, in its key order. Every caller passes `{ n, l, m, z, basis }` in
 * that order, so the bytes on the wire are unchanged; an object with a stray
 * property can no longer leak it into a query.
 */
function orbitalEntries(o: OrbitalRequestState): QueryEntry[] {
  return [
    ['n', o.n],
    ['l', o.l],
    ['m', o.m],
    ['z', o.z],
    ['basis', o.basis],
  ]
}

export function pointCloudRequest(o: OrbitalRequestState, samples: number, seed: number): ApiRequest {
  return {
    route: ORBITAL_POINT_CLOUD_ROUTE,
    query: query([...orbitalEntries(o), ['samples', samples], ['seed', seed]]),
  }
}

export function metadataRequest(o: OrbitalRequestState): ApiRequest {
  return { route: ORBITAL_METADATA_ROUTE, query: query(orbitalEntries(o)) }
}

export function isosurfaceRequest(
  o: OrbitalRequestState,
  resolution: number,
  probabilityMass: number,
): ApiRequest {
  return {
    route: ORBITAL_ISOSURFACE_ROUTE,
    query: query([
      ...orbitalEntries(o),
      ['resolution', resolution],
      ['probability_mass', probabilityMass],
    ]),
  }
}

export function currentFieldRequest(o: OrbitalRequestState, seedCount: number): ApiRequest {
  return {
    route: ORBITAL_CURRENT_FIELD_ROUTE,
    query: query([...orbitalEntries(o), ['seed_count', seedCount]]),
  }
}

export function sliceRequest(
  o: OrbitalRequestState,
  resolution: number,
  aMu: number,
  plane: PrincipalPlane,
  observable: SliceObservable,
): ApiRequest {
  return {
    route: ORBITAL_SLICE_ROUTE,
    query: query([
      ...orbitalEntries(o),
      ['resolution', resolution],
      ['a_mu', aMu],
      ['plane', plane],
      ['observable', observable],
    ]),
  }
}

export function superpositionIsosurfaceRequest(
  terms: string,
  basis: BasisKind,
  z: number,
  aMu: number,
  timeAu: number,
  resolution: number,
  probabilityMass: number,
): ApiRequest {
  return {
    route: SUPERPOSITION_ISOSURFACE_ROUTE,
    query: query([
      ['terms', terms],
      ['time', timeAu],
      ['resolution', resolution],
      ['basis', basis],
      ['z', z],
      ['a_mu', aMu],
      ['probability_mass', probabilityMass],
    ]),
  }
}

export function superpositionCurrentFieldRequest(
  terms: string,
  basis: BasisKind,
  z: number,
  aMu: number,
  timeAu: number,
  seedCount: number,
): ApiRequest {
  return {
    route: SUPERPOSITION_CURRENT_FIELD_ROUTE,
    query: query([
      ['terms', terms],
      ['time', timeAu],
      ['seed_count', seedCount],
      ['basis', basis],
      ['z', z],
      ['a_mu', aMu],
    ]),
  }
}

export function superpositionSliceRequest(
  terms: string,
  basis: BasisKind,
  z: number,
  aMu: number,
  timeAu: number,
  resolution: number,
  plane: PrincipalPlane,
  observable: SliceObservable,
): ApiRequest {
  return {
    route: SUPERPOSITION_SLICE_ROUTE,
    query: query([
      ['terms', terms],
      ['time', timeAu],
      ['resolution', resolution],
      ['basis', basis],
      ['z', z],
      ['a_mu', aMu],
      ['plane', plane],
      ['observable', observable],
    ]),
  }
}

export const ORBITAL_CATALOG_REQUEST: ApiRequest = Object.freeze({
  route: ORBITAL_CATALOG_ROUTE,
  query: null,
})

export const SUPERPOSITION_CATALOG_REQUEST: ApiRequest = Object.freeze({
  route: SUPERPOSITION_CATALOG_ROUTE,
  query: null,
})

/* ------------------------------------------------------------ scene dispatch */

/** What every superposition route reads besides its own tunables. */
export interface SuperpositionState {
  terms: string
  basis: BasisKind
  z: number
  aMu: number
  timeAu: number
}

/**
 * One scene request, decided once: which fetcher the plan's endpoint needs and
 * the exact arguments it gets. `executeSceneRequest`
 * (src/components/useSceneAsset.ts) fetches it; `requestsForCall` spells it as
 * the API requests it makes, and the static catalogue is enumerated and looked
 * up through that spelling -- so what is catalogued and what is fetched cannot
 * drift apart. The kinds are the `SceneAsset` kinds.
 */
export type SceneCall =
  | { kind: 'point_cloud'; orbital: OrbitalRequestState; samples: number; seed: number }
  | { kind: 'isosurface'; orbital: OrbitalRequestState; resolution: number; probabilityMass: number }
  | { kind: 'streamlines'; orbital: OrbitalRequestState; seedCount: number }
  | {
      kind: 'slice'
      orbital: OrbitalRequestState
      resolution: number
      aMu: number
      plane: PrincipalPlane
      observable: SliceObservable
    }
  | ({ kind: 'superposition_isosurface'; resolution: number; probabilityMass: number } & SuperpositionState)
  | ({
      kind: 'superposition_slice'
      resolution: number
      plane: PrincipalPlane
      observable: SliceObservable
    } & SuperpositionState)
  | ({ kind: 'superposition_streamlines'; seedCount: number } & SuperpositionState)

/**
 * A tunable the plan declares, taken from the plan rather than from the raw
 * inputs: `planSceneRequest` has already clamped it into the bound the route
 * accepts, and the unclamped input is exactly what used to produce 422s.
 *
 * A missing one is a contract break between the capability matrix and this
 * dispatcher, not something to paper over with a default -- a defaulted
 * resolution would render a different grid from the one the panel is showing.
 */
function requireNumber(plan: ScenePlan, name: string): number {
  const value = plan.params[name]
  if (typeof value !== 'number') {
    throw new Error(`The plan for ${plan.endpoint} carries no numeric ${name}.`)
  }
  return value
}

/**
 * An enumerated choice the plan declares, checked against the closed set the
 * contract names. A missing `plane` would not 422: the route substitutes `xz`
 * and returns a valid section of a plane nobody asked for.
 */
function requireChoice<T extends string>(
  plan: ScenePlan,
  name: string,
  declared: readonly T[],
): T {
  const value = plan.params[name]
  if (typeof value !== 'string') {
    throw new Error(`The plan for ${plan.endpoint} carries no ${name}.`)
  }
  if (!declared.includes(value as T)) {
    throw new Error(
      `The plan for ${plan.endpoint} names ${name}=${value}, which is not one of ` +
        `${declared.join(', ')}.`,
    )
  }
  return value as T
}

const requirePlane = (plan: ScenePlan): PrincipalPlane =>
  requireChoice(plan, 'plane', PRINCIPAL_PLANES)

const requireObservable = (plan: ScenePlan): SliceObservable =>
  requireChoice(plan, 'observable', SLICE_OBSERVABLES)

/** The superposition state: basis and charge from the inputs, a_mu and time from the plan. */
function superpositionState(plan: ScenePlan, inputs: SceneRequestInputs): SuperpositionState {
  return {
    terms: inputs.superpositionTerms,
    basis: inputs.superpositionBasis,
    z: inputs.orbital.z,
    aMu: requireNumber(plan, 'a_mu'),
    timeAu: requireNumber(plan, 'time'),
  }
}

/**
 * The call a plan makes. One dispatch on the endpoint the capability matrix
 * chose; an endpoint without a fetcher throws rather than silently rendering
 * nothing.
 */
export function sceneCallFor(plan: ScenePlan, inputs: SceneRequestInputs): SceneCall {
  const { orbital } = inputs
  switch (plan.endpoint) {
    case ORBITAL_POINT_CLOUD_ROUTE:
      return {
        kind: 'point_cloud',
        orbital,
        samples: requireNumber(plan, 'samples'),
        seed: requireNumber(plan, 'seed'),
      }
    case ORBITAL_ISOSURFACE_ROUTE:
      return {
        kind: 'isosurface',
        orbital,
        resolution: requireNumber(plan, 'resolution'),
        probabilityMass: requireNumber(plan, 'probability_mass'),
      }
    case ORBITAL_CURRENT_FIELD_ROUTE:
      return { kind: 'streamlines', orbital, seedCount: requireNumber(plan, 'seed_count') }
    case ORBITAL_SLICE_ROUTE:
      // `a_mu` comes from the plan: its copy is clamped into the route's bound.
      return {
        kind: 'slice',
        orbital,
        resolution: requireNumber(plan, 'resolution'),
        aMu: requireNumber(plan, 'a_mu'),
        plane: requirePlane(plan),
        observable: requireObservable(plan),
      }
    case SUPERPOSITION_ISOSURFACE_ROUTE:
      return {
        kind: 'superposition_isosurface',
        ...superpositionState(plan, inputs),
        resolution: requireNumber(plan, 'resolution'),
        probabilityMass: requireNumber(plan, 'probability_mass'),
      }
    case SUPERPOSITION_SLICE_ROUTE:
      return {
        kind: 'superposition_slice',
        ...superpositionState(plan, inputs),
        resolution: requireNumber(plan, 'resolution'),
        plane: requirePlane(plan),
        observable: requireObservable(plan),
      }
    case SUPERPOSITION_CURRENT_FIELD_ROUTE:
      return {
        kind: 'superposition_streamlines',
        ...superpositionState(plan, inputs),
        seedCount: requireNumber(plan, 'seed_count'),
      }
    default:
      throw new Error(`No client fetcher serves ${plan.endpoint}.`)
  }
}

/** The API requests a call makes, in the order its fetcher issues them. */
export function requestsForCall(call: SceneCall): readonly ApiRequest[] {
  switch (call.kind) {
    case 'point_cloud':
      return [pointCloudRequest(call.orbital, call.samples, call.seed), metadataRequest(call.orbital)]
    case 'isosurface':
      return [isosurfaceRequest(call.orbital, call.resolution, call.probabilityMass)]
    case 'streamlines':
      return [currentFieldRequest(call.orbital, call.seedCount)]
    case 'slice':
      return [sliceRequest(call.orbital, call.resolution, call.aMu, call.plane, call.observable)]
    case 'superposition_isosurface':
      return [
        superpositionIsosurfaceRequest(
          call.terms,
          call.basis,
          call.z,
          call.aMu,
          call.timeAu,
          call.resolution,
          call.probabilityMass,
        ),
      ]
    case 'superposition_slice':
      return [
        superpositionSliceRequest(
          call.terms,
          call.basis,
          call.z,
          call.aMu,
          call.timeAu,
          call.resolution,
          call.plane,
          call.observable,
        ),
      ]
    default:
      return [
        superpositionCurrentFieldRequest(
          call.terms,
          call.basis,
          call.z,
          call.aMu,
          call.timeAu,
          call.seedCount,
        ),
      ]
  }
}

/** Contract: every API request a plan makes (a point cloud makes two). */
export function requestsForPlan(plan: ScenePlan, inputs: SceneRequestInputs): readonly ApiRequest[] {
  return requestsForCall(sceneCallFor(plan, inputs))
}
