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
