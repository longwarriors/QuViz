import {
  planForCapability,
  STATIC_A_MU,
  staticCapabilityFor,
  type SceneRequestInputs,
} from './capability'
import { parseOrbitalCatalog, parseSuperpositionCatalog } from './client'
import {
  metadataRequest,
  ORBITAL_CATALOG_REQUEST,
  requestsForPlan,
  SUPERPOSITION_CATALOG_REQUEST,
  type ApiRequest,
} from './requests'
import { parseStaticSpec, playbackFrames, type StaticSpec } from './staticCatalog'
import { requestKey } from './transport'
import type { BasisKind, OrbitalParameters, SuperpositionPreset } from './types'

/**
 * Every request the static site can make, listed by the same code that makes
 * them.
 *
 * The keys are produced by `staticCapabilityFor` -> `planForCapability` ->
 * `requestsForPlan` -> `requestKey`, which is exactly the path the running
 * static site takes through `capabilityFor` and `planSceneRequest`; Python
 * replays these strings verbatim (design/plans/2026-09-25-contracts.md,
 * "B -> A/E") and never re-spells a query.
 */

export const STATIC_REQUESTS_FORMAT = 'quviz-static-requests/1'

export interface StaticRequestsFile {
  format: typeof STATIC_REQUESTS_FORMAT
  requests: string[]
}

/** The superposition basis every static request carries: the store's default, which no control changes. */
export const STATIC_SUPERPOSITION_BASIS: BasisKind = 'complex'

const keyOf = (request: ApiRequest): string => requestKey(request.route, request.query)

/** The request inputs the enumeration varies; tunables are pinned from the spec anyway. */
function baseInputs(spec: StaticSpec): SceneRequestInputs {
  const eigen = spec.eigenstates
  return {
    mode: 'eigenstate',
    orbital: { n: 1, l: 0, m: 0, z: eigen.z, basis: eigen.bases[0] },
    representation: 'point_cloud',
    samples: eigen.samples,
    seed: eigen.seed,
    resolution: eigen.resolution,
    probabilityMass: eigen.probability_mass,
    seedCount: eigen.seed_count,
    superpositionTerms: '',
    superpositionBasis: STATIC_SUPERPOSITION_BASIS,
    aMu: STATIC_A_MU,
    timeAu: 0,
  }
}

export function enumerateStaticRequests(
  spec: StaticSpec,
  superpositionCatalog: readonly SuperpositionPreset[],
): string[] {
  const keys = new Set<string>([keyOf(ORBITAL_CATALOG_REQUEST), keyOf(SUPERPOSITION_CATALOG_REQUEST)])

  /** One cell: skipped when refused, fanned out over planes x observables for a slice. */
  const walk = (inputs: SceneRequestInputs): void => {
    const capability = staticCapabilityFor(inputs, spec)
    if (capability.status !== 'available') return
    const { planes, observables } = capability
    const variants =
      planes === undefined || observables === undefined
        ? [inputs]
        : planes.flatMap((plane) =>
            observables.map((sliceObservable) => ({ ...inputs, plane, sliceObservable })),
          )
    for (const variant of variants) {
      for (const request of requestsForPlan(planForCapability(capability, variant), variant)) {
        keys.add(keyOf(request))
      }
    }
  }

  const base = baseInputs(spec)
  const eigen = spec.eigenstates
  for (let n = 1; n <= eigen.n_max; n += 1) {
    for (let l = 0; l < n; l += 1) {
      for (let m = -l; m <= l; m += 1) {
        for (const basis of eigen.bases) {
          const orbital: OrbitalParameters = { n, l, m, z: eigen.z, basis }
          // The detail panel asks for metadata whatever is drawn.
          keys.add(keyOf(metadataRequest(orbital)))
          for (const representation of eigen.representations) {
            walk({ ...base, mode: 'eigenstate', orbital, representation })
          }
        }
      }
    }
  }

  for (const id of spec.superpositions.presets) {
    const preset = superpositionCatalog.find((entry) => entry.id === id)
    if (preset === undefined) {
      throw new Error(`静态目录规格引用了服务端目录中不存在的叠加态预设 ${id}。`)
    }
    // ControlPanel's playback period: catalogue period x a_mu / Z^2 (ControlPanel.tsx:457-464).
    const frames = playbackFrames((preset.period_au * STATIC_A_MU) / eigen.z ** 2)
    for (const representation of spec.superpositions.representations) {
      for (const timeAu of frames) {
        walk({
          ...base,
          mode: 'superposition',
          representation,
          superpositionTerms: preset.terms,
          superpositionSliceResolutionFloor: preset.slice_resolution_floor,
          superpositionStreamlineSeedCountMax: preset.streamline_seed_count_max,
          timeAu,
        })
      }
    }
  }
  return [...keys].sort()
}

/** Parse the three exporter files and enumerate; the tool writes the result as requests.json. */
export function buildStaticRequestsFile(
  rawSpec: unknown,
  rawOrbitalCatalog: unknown,
  rawSuperpositionCatalog: unknown,
): StaticRequestsFile {
  const spec = parseStaticSpec(rawSpec)
  // Validated even though the eigenstate walk comes from the spec: the SPA
  // parses this file at runtime, so a catalogue it would reject must fail here.
  parseOrbitalCatalog(rawOrbitalCatalog)
  return {
    format: STATIC_REQUESTS_FORMAT,
    requests: enumerateStaticRequests(spec, parseSuperpositionCatalog(rawSuperpositionCatalog)),
  }
}
