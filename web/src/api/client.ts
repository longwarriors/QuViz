import { parsePointCloud } from './qvpc'
import {
  currentFieldRequest,
  isosurfaceRequest,
  metadataRequest,
  ORBITAL_CATALOG_REQUEST,
  pointCloudRequest,
  sliceRequest,
  SUPERPOSITION_CATALOG_REQUEST,
  superpositionCurrentFieldRequest,
  superpositionIsosurfaceRequest,
  superpositionSliceRequest,
  type ApiRequest,
  type OrbitalRequestState,
} from './requests'
import {
  MAXIMUM_SLICE_RESOLUTION,
  MINIMUM_SLICE_RESOLUTION,
  parseSlicePayload,
  SliceContractError,
  type AnySlicePayload,
} from './sliceContract'
import { getTransport } from './transport'
import type {
  BasisKind,
  CurrentFieldPayload,
  IsosurfacePayload,
  OrbitalMetadata,
  OrbitalParameters,
  OrbitalPreset,
  PointCloudData,
  PrincipalPlane,
  SliceObservable,
  SlicePayload,
  SuperpositionCurrentPayload,
  SuperpositionIsosurfacePayload,
  SuperpositionPreset,
  SuperpositionSlicePayload,
} from './types'

export { parsePointCloud } from './qvpc'

/** OpenAPI bounds of SuperpositionCatalogEntry.streamline_seed_count_max. */
const MINIMUM_SUPERPOSITION_STREAMLINE_SEEDS = 1
const MAXIMUM_SUPERPOSITION_STREAMLINE_SEEDS = 40

/**
 * Every request leaves through the installed transport (src/api/transport.ts):
 * the live one issues the same `fetch('/api/...?...', { signal })` the ten
 * call sites used to, the static one answers from the precomputed catalogue.
 * The request itself is formed in src/api/requests.ts, which the static overlay
 * and the build-time enumerator call as well.
 */
function send(request: ApiRequest, signal?: AbortSignal): Promise<Response> {
  return getTransport().request(request.route, request.query, signal)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Turn FastAPI's string or validation-list `detail` into readable UI copy. */
function formatFastApiDetail(detail: unknown): string | null {
  if (typeof detail === 'string') return detail.trim() || null
  if (!Array.isArray(detail)) return null

  const messages = detail.flatMap((entry) => {
    if (typeof entry === 'string') return entry.trim() ? [entry.trim()] : []
    if (!isRecord(entry) || typeof entry.msg !== 'string') return []
    const location = Array.isArray(entry.loc)
      ? entry.loc.map((part) => String(part)).join('.')
      : ''
    return [location ? `${location}: ${entry.msg}` : entry.msg]
  })
  return messages.length === 0 ? null : messages.join('; ')
}

/**
 * Preserve plain-text/proxy errors, while unwrapping the JSON envelope used by
 * FastAPI (`{"detail": ...}`). This is shared by every route so a fail-closed
 * numerical 422 reaches the panel as an explanation instead of raw JSON.
 */
async function responseError(response: Response): Promise<Error> {
  const body = (await response.text()).trim()
  const status = `HTTP ${response.status}${response.statusText ? ` ${response.statusText}` : ''}`
  if (!body) return new Error(`Request failed with ${status}.`)

  try {
    const payload: unknown = JSON.parse(body)
    if (isRecord(payload)) {
      const detail = formatFastApiDetail(payload.detail)
      if (detail !== null) return new Error(detail)
    }
    if (typeof payload === 'string' && payload.trim()) return new Error(payload.trim())
  } catch {
    // A reverse proxy or development server may return text/HTML. Preserve it.
  }
  return new Error(body)
}

function parseOrbitalPreset(value: unknown, index: number): OrbitalPreset {
  const location = `orbital catalog[${index}]`
  if (!isRecord(value)) throw new Error(`${location} must be an object`)

  const { id, label, n, l, m, basis, z } = value
  if (typeof id !== 'string' || !id.trim()) throw new Error(`${location}.id must be a string`)
  if (typeof label !== 'string' || !label.trim()) {
    throw new Error(`${location}.label must be a string`)
  }
  if (typeof n !== 'number' || !Number.isInteger(n) || n < 1) {
    throw new Error(`${location}.n must be a positive integer`)
  }
  if (typeof l !== 'number' || !Number.isInteger(l) || l < 0 || l >= n) {
    throw new Error(`${location}.l must be an integer in 0..n-1`)
  }
  if (typeof m !== 'number' || !Number.isInteger(m) || Math.abs(m) > l) {
    throw new Error(`${location}.m must be an integer with |m| <= l`)
  }
  if (basis !== 'real' && basis !== 'complex') {
    throw new Error(`${location}.basis must be "real" or "complex"`)
  }
  if (z !== undefined && (typeof z !== 'number' || !Number.isFinite(z) || z <= 0)) {
    throw new Error(`${location}.z must be a positive finite number when present`)
  }

  const preset: Omit<OrbitalPreset, 'z'> = { id, label, n, l, m, basis }
  return z === undefined ? preset : { ...preset, z }
}

function parseSuperpositionPreset(value: unknown, index: number): SuperpositionPreset {
  const location = `superposition catalog[${index}]`
  if (!isRecord(value)) throw new Error(`${location} must be an object`)

  const {
    id,
    label,
    terms,
    period_au,
    note,
    slice_resolution_floor,
    streamline_seed_count_max,
  } = value
  if (typeof id !== 'string' || !id.trim()) throw new Error(`${location}.id must be a string`)
  if (typeof label !== 'string' || !label.trim()) {
    throw new Error(`${location}.label must be a string`)
  }
  if (typeof terms !== 'string' || !terms.trim()) {
    throw new Error(`${location}.terms must be a string`)
  }
  if (typeof period_au !== 'number' || !Number.isFinite(period_au) || period_au < 0) {
    throw new Error(`${location}.period_au must be a finite non-negative number`)
  }
  if (typeof note !== 'string') throw new Error(`${location}.note must be a string`)
  if (
    typeof slice_resolution_floor !== 'number' ||
    !Number.isInteger(slice_resolution_floor) ||
    slice_resolution_floor < MINIMUM_SLICE_RESOLUTION ||
    slice_resolution_floor > MAXIMUM_SLICE_RESOLUTION ||
    slice_resolution_floor % 2 === 0
  ) {
    throw new Error(
      `${location}.slice_resolution_floor must be an odd integer in ` +
      `${MINIMUM_SLICE_RESOLUTION}..${MAXIMUM_SLICE_RESOLUTION}`,
    )
  }
  if (
    typeof streamline_seed_count_max !== 'number' ||
    !Number.isInteger(streamline_seed_count_max) ||
    streamline_seed_count_max < MINIMUM_SUPERPOSITION_STREAMLINE_SEEDS ||
    streamline_seed_count_max > MAXIMUM_SUPERPOSITION_STREAMLINE_SEEDS
  ) {
    throw new Error(
      `${location}.streamline_seed_count_max must be an integer in ` +
        `${MINIMUM_SUPERPOSITION_STREAMLINE_SEEDS}..${MAXIMUM_SUPERPOSITION_STREAMLINE_SEEDS}`,
    )
  }

  return {
    id,
    label,
    terms,
    period_au,
    note,
    slice_resolution_floor,
    streamline_seed_count_max,
  }
}

export async function fetchPointCloud(
  params: OrbitalParameters,
  samples: number,
  seed: number,
  signal?: AbortSignal,
): Promise<PointCloudData> {
  const [response, metadata] = await Promise.all([
    send(pointCloudRequest(params, samples, seed), signal),
    fetchOrbitalMetadata(params, signal),
  ])
  if (!response.ok) {
    throw await responseError(response)
  }
  const buffer = await response.arrayBuffer()
  return { ...parsePointCloud(buffer, response.headers), metadata }
}

export async function fetchIsosurface(
  params: OrbitalParameters,
  resolution: number,
  probabilityMass: number,
  signal?: AbortSignal,
): Promise<IsosurfacePayload> {
  const response = await send(isosurfaceRequest(params, resolution, probabilityMass), signal)
  if (!response.ok) {
    throw await responseError(response)
  }
  return (await response.json()) as IsosurfacePayload
}

export async function fetchCurrentField(
  params: OrbitalParameters,
  seedCount: number,
  signal?: AbortSignal,
): Promise<CurrentFieldPayload> {
  const response = await send(currentFieldRequest(params, seedCount), signal)
  if (!response.ok) {
    throw await responseError(response)
  }
  return (await response.json()) as CurrentFieldPayload
}

/** The orbital's diagnostics and, for eigenstates, its radial profile. */
export async function fetchOrbitalMetadata(
  orbital: OrbitalRequestState,
  signal?: AbortSignal,
): Promise<OrbitalMetadata> {
  const response = await send(metadataRequest(orbital), signal)
  if (!response.ok) {
    throw await responseError(response)
  }
  return (await response.json()) as OrbitalMetadata
}

/** The name the point-cloud path and the existing specs use; the same function. */
export const fetchMetadata = fetchOrbitalMetadata

/** Validate an orbital catalogue at the wire boundary. The enumerator reuses it. */
export function parseOrbitalCatalog(payload: unknown): OrbitalPreset[] {
  if (!Array.isArray(payload)) throw new Error('orbital catalog must be an array')
  return payload.map(parseOrbitalPreset)
}

export async function fetchCatalog(signal?: AbortSignal): Promise<OrbitalPreset[]> {
  const response = await send(ORBITAL_CATALOG_REQUEST, signal)
  if (!response.ok) {
    throw await responseError(response)
  }
  return parseOrbitalCatalog(await response.json())
}

/** The last superposition catalogue this page parsed successfully, or null before the first. */
let knownSuperpositionCatalog: readonly SuperpositionPreset[] | null = null

/**
 * The superposition catalogue already on hand, without a request.
 *
 * The URL-state binding needs it to spell a preset id into the hash. Fetching
 * the catalogue again for that would put a second /api/superposition/catalog
 * request on every page load, which the visual gate's exact request ledger
 * (web/e2e/slice.spec.ts:559-562) would rightly reject.
 */
export function lastSuperpositionCatalog(): readonly SuperpositionPreset[] | null {
  return knownSuperpositionCatalog
}

/** Replace the remembered catalogue: the fetcher does after every successful parse; specs reset it. */
export function rememberSuperpositionCatalog(catalog: readonly SuperpositionPreset[] | null): void {
  knownSuperpositionCatalog = catalog
}

/** Validate a superposition catalogue at the wire boundary. The enumerator reuses it. */
export function parseSuperpositionCatalog(payload: unknown): SuperpositionPreset[] {
  if (!Array.isArray(payload)) throw new Error('superposition catalog must be an array')
  return payload.map(parseSuperpositionPreset)
}

export async function fetchSuperpositionCatalog(
  signal?: AbortSignal,
): Promise<SuperpositionPreset[]> {
  const response = await send(SUPERPOSITION_CATALOG_REQUEST, signal)
  if (!response.ok) {
    throw await responseError(response)
  }
  const presets = parseSuperpositionCatalog(await response.json())
  rememberSuperpositionCatalog(presets)
  return presets
}

/**
 * The `|Psi(t)|^2` level set of a superposition.
 *
 * Every parameter `/superposition/isosurface` accepts is sent explicitly.
 * A parameter left off the query is not an error the caller sees: the server
 * substitutes its own default (`basis=complex`, `z=1`, `a_mu=1`,
 * `probability_mass=0.90` on `/api/superposition/isosurface`) and returns a
 * perfectly valid picture of a state nobody asked for.
 */
export async function fetchSuperpositionIsosurface(
  terms: string,
  time: number,
  resolution: number,
  basis: BasisKind,
  z: number,
  aMu: number,
  probabilityMass: number,
  signal?: AbortSignal,
): Promise<SuperpositionIsosurfacePayload> {
  const response = await send(
    superpositionIsosurfaceRequest(terms, basis, z, aMu, time, resolution, probabilityMass),
    signal,
  )
  if (!response.ok) {
    throw await responseError(response)
  }
  return (await response.json()) as SuperpositionIsosurfacePayload
}

/**
 * Probability-flow streamlines of a superposition at one instant, with the
 * continuity residual that says how far the rendered flow is from satisfying
 * `d(rho)/dt + div j = 0`.
 *
 * Same full-query rule as the isosurface route, over the parameter names
 * `/superposition/current-field` declares. `arc_step` is
 * deliberately not sent: the server's `None` default lets it choose a step
 * from the state's own extent, and a client-side number would override that
 * with a worse one.
 */
export async function fetchSuperpositionCurrentField(
  terms: string,
  time: number,
  seedCount: number,
  basis: BasisKind,
  z: number,
  aMu: number,
  signal?: AbortSignal,
): Promise<SuperpositionCurrentPayload> {
  const response = await send(
    superpositionCurrentFieldRequest(terms, basis, z, aMu, time, seedCount),
    signal,
  )
  if (!response.ok) {
    throw await responseError(response)
  }
  return (await response.json()) as SuperpositionCurrentPayload
}

/**
 * Which state a slice describes, decided by the metadata it carries.
 *
 * `parseSlicePayload` proves the payload has metadata identifying an
 * eigenstate or a superposition, but it returns the union: only the caller
 * knows which route it asked. These two predicates close that gap without an
 * `as`, and they are worth having because the two payloads are otherwise
 * *identical* -- same grid, same frame, same samples -- so a superposition
 * answer served from the eigenstate route would render as a flawless picture
 * and only surface much later, as a missing `state` in the Inspector.
 */
function isEigenstateSlice(payload: AnySlicePayload): payload is SlicePayload {
  return 'state' in payload.metadata
}

function isSuperpositionSlice(payload: AnySlicePayload): payload is SuperpositionSlicePayload {
  return 'terms' in payload.metadata
}

/**
 * Decode, validate, and confirm the payload is the kind the route promised.
 *
 * The validation is not optional decoration: `src/api/schema.gen.ts` types the
 * wire format and cannot check it, so a transposed grid, a mirrored normal or
 * a mask that disagrees with its own reported fraction all type-check and then
 * render as a picture nobody can tell is wrong. `parseSlicePayload` is that
 * check, and this is the boundary it belongs at -- once past here the payload
 * is a scene.
 */
async function decodeSlice<T extends AnySlicePayload>(
  response: Response,
  kind: (payload: AnySlicePayload) => payload is T,
  expected: string,
): Promise<T> {
  if (!response.ok) {
    throw await responseError(response)
  }
  const payload = parseSlicePayload(await response.json())
  if (!kind(payload)) {
    throw new SliceContractError(
      'metadata',
      `must describe ${expected}, which is what this route returns`,
    )
  }
  return payload
}

/**
 * One scalar field of an eigenstate on a principal plane through the origin.
 *
 * Every parameter `/api/orbitals/slice` accepts is sent explicitly, for the
 * reason the superposition routes send theirs: a parameter left off the query
 * is not an error the caller sees. `plane` and `observable` both carry
 * server-side defaults (`xz`, `probability_density`), so a
 * dropped one returns a valid section of a different field with no complaint
 * at all. `a_mu` is here too -- this is the only eigenstate route that reads
 * it, and it rescales the derived extent and the amplitude scale the phase
 * mask is referenced to.
 *
 * The extent is derived from the state and reported back; it is deliberately
 * not a parameter.
 */
export async function fetchSlice(
  params: OrbitalParameters,
  resolution: number,
  aMu: number,
  plane: PrincipalPlane,
  observable: SliceObservable,
  signal?: AbortSignal,
): Promise<SlicePayload> {
  const response = await send(sliceRequest(params, resolution, aMu, plane, observable), signal)
  return decodeSlice(response, isEigenstateSlice, 'an eigenstate (a "state" field)')
}

/**
 * One scalar field of a superposition on a principal plane at one instant.
 *
 * Same full-query rule, over the names declared by `/api/superposition/slice`.
 */
export async function fetchSuperpositionSlice(
  terms: string,
  time: number,
  resolution: number,
  basis: BasisKind,
  z: number,
  aMu: number,
  plane: PrincipalPlane,
  observable: SliceObservable,
  signal?: AbortSignal,
): Promise<SuperpositionSlicePayload> {
  const response = await send(
    superpositionSliceRequest(terms, basis, z, aMu, time, resolution, plane, observable),
    signal,
  )
  return decodeSlice(response, isSuperpositionSlice, 'a superposition (a "terms" field)')
}
