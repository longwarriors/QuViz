import { create } from 'zustand'

import {
  capabilityFor,
  chargeBound,
  clampToBound,
  declaredPlane,
  type ParameterBound,
} from '../api/capability'
import { MINIMUM_SLICE_RESOLUTION } from '../api/sliceContract'
import type {
  BasisKind,
  OrbitalParameters,
  PrincipalPlane,
  RepresentationKind,
  SliceObservable,
  SuperpositionDefaultRepresentation,
} from '../api/types'

export type SceneMode = 'eigenstate' | 'superposition'

interface SceneStore {
  mode: SceneMode
  superpositionTerms: string
  superpositionLabel: string
  /** Slice floor published by the selected server catalogue entry. */
  superpositionSliceResolutionFloor: number
  /** Workload-safe streamline ceiling published for the selected mixture. */
  superpositionStreamlineSeedCountMax: number | undefined
  /**
   * What the selected catalogue preset opens on, as the server probed it
   * (`SuperpositionCatalogEntry.default_representation`). `'isosurface'` until a
   * catalogue answers, which is what the initial 1s + 2p_z preset publishes.
   */
  superpositionDefaultRepresentation: SuperpositionDefaultRepresentation
  /**
   * The superposition's own basis, independent of `orbital.basis` on purpose:
   * they describe two different states, and sharing one field silently changed
   * the rendered physics of the time-dependent state when the eigenstate
   * toggle moved.
   */
  superpositionBasis: BasisKind
  /** Nuclear charge for the superposition request, in units of e. */
  superpositionZ: number
  /**
   * Reduced-mass ratio a_mu, carried in the store so the request states it
   * rather than letting the server default it. Read-only in the UI today.
   *
   * NOT `superpositionAMu` any more: four routes read this parameter and two of
   * them are eigenstate routes -- the eigenstate slice rescales both its derived
   * extent and the amplitude the phase mask is referenced to by this ratio. A
   * name that said "superposition" was the store asserting a mode-dependence the
   * capability matrix does not have.
   */
  aMu: number
  timeAu: number
  playing: boolean
  orbital: OrbitalParameters
  representation: RepresentationKind
  /**
   * Which principal plane a slice is cut on, and which scalar field it carries.
   *
   * Both start at the value routes.py declares as its own default, so a slice
   * requested before either picker is touched is the slice the route documents
   * rather than one this store invented.
   */
  plane: PrincipalPlane
  /**
   * The plane the learner (or a link) chose while the slice on screen cannot
   * be cut on it -- on the static site a superposition slice exists on xz only
   * -- and undefined whenever `plane` is that choice. `plane` always names the
   * plane that is drawn; this is what it returns to (see `reconcilePlane`).
   */
  displacedPlane: PrincipalPlane | undefined
  sliceObservable: SliceObservable
  samples: number
  seed: number
  resolution: number
  probabilityMass: number
  seedCount: number
  pointSize: number
  opacity: number
  bloom: number
  exposure: number
  fogStrength: number
  autoRotate: boolean
  showGrid: boolean
  setMode: (value: SceneMode) => void
  setSuperposition: (
    terms: string,
    label: string,
    sliceResolutionFloor: number,
    streamlineSeedCountMax: number,
    defaultRepresentation: SuperpositionDefaultRepresentation,
  ) => void
  syncSuperpositionCapabilities: (
    terms: string,
    sliceResolutionFloor: number,
    streamlineSeedCountMax: number,
    defaultRepresentation: SuperpositionDefaultRepresentation,
  ) => void
  /** Fail closed when the selected catalogue entry cannot be trusted. */
  invalidateSuperpositionStreamlineCapability: () => void
  setSuperpositionBasis: (value: BasisKind) => void
  setSuperpositionZ: (value: number) => void
  setAMu: (value: number) => void
  setTimeAu: (value: number) => void
  setPlaying: (value: boolean) => void
  setOrbital: (patch: Partial<OrbitalParameters>) => void
  setRepresentation: (value: RepresentationKind) => void
  setPlane: (value: PrincipalPlane) => void
  setSliceObservable: (value: SliceObservable) => void
  setSamples: (value: number) => void
  setSeed: (value: number) => void
  setResolution: (value: number) => void
  setProbabilityMass: (value: number) => void
  setSeedCount: (value: number) => void
  setPointSize: (value: number) => void
  setOpacity: (value: number) => void
  setBloom: (value: number) => void
  setExposure: (value: number) => void
  setFogStrength: (value: number) => void
  setAutoRotate: (value: boolean) => void
  setShowGrid: (value: boolean) => void
  applyPreset: (
    preset: Omit<OrbitalParameters, 'z'> & Partial<Pick<OrbitalParameters, 'z'>>,
  ) => void
}

function normalizeOrbital(current: OrbitalParameters, patch: Partial<OrbitalParameters>): OrbitalParameters {
  const n = Math.max(1, Math.min(8, Math.round(patch.n ?? current.n)))
  const l = Math.max(0, Math.min(n - 1, Math.round(patch.l ?? current.l)))
  const m = Math.max(-l, Math.min(l, Math.round(patch.m ?? current.m)))
  // The route's charge range -- or, on the static site, the single Z the
  // catalogue was exported at: a charge the planner would send differently
  // from the one on screen is never stored.
  const charge = chargeBound()
  const z = Math.max(charge.min, Math.min(charge.max, patch.z ?? current.z))
  const basis: BasisKind = patch.basis ?? current.basis
  return { n, l, m, z, basis }
}

/**
 * The grid, moved into whatever range the cell that will actually be drawn
 * declares for it -- and left exactly alone when that cell has no grid.
 *
 * Both writers of `resolution` used to spell `Math.min(81, Math.max(value,
 * max(49, 16n + 17)))`, which is the EIGENSTATE ISOSURFACE row's bound written
 * down a second time and then applied to every row there is. A slice runs to
 * 513, so a 129-sample section was silently cut to 81 -- by a store that had
 * just been told, by the same matrix the panel's slider reads, that 129 was
 * fine. The point cloud has no grid at all, and had one edited anyway.
 *
 * `representation` is the RESOLVED one, not the requested one: a demoted cell's
 * abandoned bound can be empty (the isosurface at n = 5 declares min 97 > max
 * 81) and clamping into it would produce a number no route ever offered.
 */
function clampResolution(
  mode: SceneMode,
  orbital: OrbitalParameters,
  representation: RepresentationKind,
  resolution: number,
  superpositionSliceResolutionFloor?: number,
): number {
  const capability = capabilityFor({
    mode,
    orbital,
    representation,
    superpositionSliceResolutionFloor,
  })
  const bound: ParameterBound | undefined =
    capability.status === 'available' ? capability.parameters.resolution : undefined
  if (bound === undefined) return resolution
  return Math.min(bound.max, Math.max(bound.min, resolution))
}

/** Keep the displayed seed count equal to the value the selected route sends. */
function clampSeedCount(
  mode: SceneMode,
  orbital: OrbitalParameters,
  representation: RepresentationKind,
  seedCount: number,
  superpositionStreamlineSeedCountMax?: number,
): number {
  const capability = capabilityFor({
    mode,
    orbital,
    representation,
    superpositionStreamlineSeedCountMax,
  })
  const bound: ParameterBound | undefined =
    capability.status === 'available' ? capability.parameters.seedCount : undefined
  if (bound === undefined) return seedCount
  return Math.round(Math.min(bound.max, Math.max(bound.min, seedCount)))
}

/**
 * The time the store may hold.
 *
 * Live, any time passes through here: the time pill's entry clamps into the
 * cell's bound before it writes (usePlayback's `setTime`), a deep link's `t`
 * is parsed only inside the route range, and the planner clamps again what it
 * sends. The static catalogue holds only its
 * exported playback frames (the cell's `timeAu.values`), so a requested time
 * moves to the nearest one here -- otherwise the status would label the frame
 * on screen with a time it does not show.
 */
function snapTimeAu(state: SceneStore, timeAu: number): number {
  const capability = capabilityFor({
    mode: state.mode,
    orbital: state.orbital,
    representation: state.representation,
    superpositionTerms: state.superpositionTerms,
    superpositionSliceResolutionFloor: state.superpositionSliceResolutionFloor,
    superpositionStreamlineSeedCountMax: state.superpositionStreamlineSeedCountMax,
  })
  const bound = capability.status === 'available' ? capability.parameters.timeAu : undefined
  return bound?.values === undefined ? timeAu : clampToBound(bound, timeAu)
}

/**
 * The store update, with the slice plane moved onto the planes the cell that
 * will be drawn declares.
 *
 * The planner only ever sends a declared plane (`declaredPlane` falls back to
 * the route default xz), and on the static site a superposition slice declares
 * xz alone, because the catalogue exported no other. A store that kept the xy
 * or yz of the eigenstate slice the learner came from -- or of a link -- made
 * the plane chips, the scene identity and the shared link all name a plane
 * that was not the one drawn. The learner's own plane is put aside in
 * `displacedPlane` rather than lost, and comes back as soon as a cell declares
 * it again. A cell that cuts no plane leaves both alone.
 */
function reconcilePlane(state: SceneStore, next: Partial<SceneStore>): Partial<SceneStore> {
  const merged = { ...state, ...next }
  const capability = capabilityFor({
    mode: merged.mode,
    orbital: merged.orbital,
    representation: merged.representation,
    superpositionSliceResolutionFloor: merged.superpositionSliceResolutionFloor,
    superpositionStreamlineSeedCountMax: merged.superpositionStreamlineSeedCountMax,
  })
  const planes = capability.status === 'available' ? capability.planes : undefined
  if (planes === undefined) return next
  const wanted = merged.displacedPlane ?? merged.plane
  const plane = declaredPlane(planes, wanted)
  return { ...next, plane, displacedPlane: plane === wanted ? undefined : wanted }
}

/**
 * The representation each mode can always serve, and therefore the last resort
 * when neither the requested nor the standing one is available.
 *
 * Both entries are total, not defaults of convenience: the eigenstate point
 * cloud is unconditional (its route bounds only `samples` and `seed`), and the
 * superposition isosurface is unconditional too (no single n, so no 16n + 17
 * floor and no n <= 4 ceiling). That is why this resolver never has to answer
 * "nothing is available" -- and why superposition's fallback is the isosurface
 * rather than the point cloud, which has no time-dependent route at all.
 *
 * "Always available" means always PLANNABLE, not always BUILT: the catalogue
 * probes each preset's route-default isosurface and publishes
 * `default_representation`, which `openingRepresentation` below honours when a
 * preset or a mode switch opens a picture. The resolver's last resort stays
 * total either way.
 */
const ALWAYS_AVAILABLE: Record<SceneMode, RepresentationKind> = {
  eigenstate: 'point_cloud',
  superposition: 'isosurface',
}

/**
 * The representation actually shown for a requested one.
 *
 * This used to be a local predicate that knew two of the availability rules --
 * isosurface n <= 4, and streamlines needing a complex m != 0 orbital -- and
 * did not know the mode at all. So `setMode('superposition')` left
 * `point_cloud` standing even though no route samples a time-dependent state
 * that way, and the canvas short-circuited on a representation the store had
 * called supported. The answer now comes from `capabilityFor`, the one matrix
 * transcribed from the routes, so the store cannot hold an opinion the fetch
 * layer disagrees with.
 *
 * `current` is kept when the request is refused but the standing representation
 * still works: a user asking for something unavailable should not also lose the
 * picture they already had.
 * The catalogue ceiling travels with this decision. A superposition streamline
 * row without valid workload metadata is not "one safe seed"; it is a row whose
 * safety cannot be established, so the resolver must not leave it selected.
 */
export function resolveRepresentation(
  mode: SceneMode,
  orbital: OrbitalParameters,
  requested: RepresentationKind,
  current: RepresentationKind,
  superpositionStreamlineSeedCountMax?: number,
): RepresentationKind {
  const available = (representation: RepresentationKind): boolean =>
    capabilityFor({
      mode,
      orbital,
      representation,
      superpositionStreamlineSeedCountMax,
    }).status === 'available'
  if (available(requested)) return requested
  if (available(current)) return current
  return ALWAYS_AVAILABLE[mode]
}

/**
 * The representation a preset choice or a mode switch OPENS on.
 *
 * `ALWAYS_AVAILABLE` says the superposition isosurface can always be planned;
 * it cannot say the server will build it. The catalogue probes the
 * route-default isosurface of every preset and publishes
 * `default_representation` -- `'slice'` when that request is refused (today
 * 2s + 2p_z: its 0.90 level set is two balls, but the gap between them across
 * the nodal paraboloid r = 2 + z is ~0.21 bohr, narrower than the capped grid
 * spacing, so marching cubes on |Psi|^2 bridges the lobes on some grids and the
 * two-grid topology gate refuses). So when the store would otherwise open such a preset
 * on the isosurface, it asks for the published default instead, through
 * `resolveRepresentation` so the capability matrix keeps the last word.
 *
 * Only openings go through here: an explicit `setRepresentation('isosurface')`
 * is honoured and the server answers with its reason, and a catalogue sync
 * records the default without moving a picture the user already has.
 */
function openingRepresentation(
  mode: SceneMode,
  orbital: OrbitalParameters,
  resolved: RepresentationKind,
  superpositionDefault: SuperpositionDefaultRepresentation,
  superpositionStreamlineSeedCountMax?: number,
): RepresentationKind {
  const requested =
    mode === 'superposition' && resolved === 'isosurface' ? superpositionDefault : resolved
  return resolveRepresentation(
    mode,
    orbital,
    requested,
    resolved,
    superpositionStreamlineSeedCountMax,
  )
}

export const useSceneStore = create<SceneStore>()((set) => ({
  mode: 'eigenstate',
  superpositionTerms: '1,0,0,0.7071067811865476;2,1,0,0.7071067811865476',
  superpositionLabel: '1s + 2p_z (Bohr oscillation)',
  superpositionSliceResolutionFloor: MINIMUM_SLICE_RESOLUTION,
  // No local route-bound guess: the selected server catalogue entry must
  // arrive before a superposition current-field request can be proven safe.
  superpositionStreamlineSeedCountMax: undefined,
  // The initial 1s + 2p_z preset publishes 'isosurface'; the catalogue sync
  // replaces this with the server's answer.
  superpositionDefaultRepresentation: 'isosurface',
  superpositionBasis: 'complex',
  superpositionZ: 1.0,
  aMu: 1.0,
  timeAu: 0,
  playing: false,
  orbital: { n: 2, l: 1, m: 0, z: 1, basis: 'real' },
  representation: 'point_cloud',
  // routes.py: `plane: PrincipalPlane = PrincipalPlane.XZ`,
  // `observable: SliceObservable = SliceObservable.PROBABILITY_DENSITY`.
  plane: 'xz',
  displacedPlane: undefined,
  sliceObservable: 'probability_density',
  samples: 28000,
  seed: 7,
  resolution: 65,
  probabilityMass: 0.9,
  seedCount: 48,
  pointSize: 2.8,
  opacity: 1.0,
  bloom: 0,
  exposure: 0.9,
  fogStrength: 0.18,
  autoRotate: false,
  showGrid: true,
  setMode: (mode) =>
    set((state) => {
      // The two modes do not serve the same representations, so the standing
      // one has to be re-resolved here or the canvas is asked for a picture no
      // route can draw. Resolution follows that resolved row in the SAME write;
      // otherwise the panel can show 129 while the request planner sends 81.
      const resolved = resolveRepresentation(
        mode,
        state.orbital,
        state.representation,
        state.representation,
        state.superpositionStreamlineSeedCountMax,
      )
      // openingRepresentation only applies when this call actually SWITCHES the
      // mode: the 叠加态 toggle stays clickable while already active, and
      // re-clicking it must be a no-op, not a second "opening" that can
      // override an explicit setRepresentation made since the last switch.
      const representation =
        state.mode === mode
          ? resolved
          : openingRepresentation(
              mode,
              state.orbital,
              resolved,
              state.superpositionDefaultRepresentation,
              state.superpositionStreamlineSeedCountMax,
            )
      return reconcilePlane(state, {
        mode,
        playing: false,
        representation,
        resolution: clampResolution(
          mode,
          state.orbital,
          representation,
          state.resolution,
          state.superpositionSliceResolutionFloor,
        ),
        seedCount: clampSeedCount(
          mode,
          state.orbital,
          representation,
          state.seedCount,
          state.superpositionStreamlineSeedCountMax,
        ),
      })
    }),
  setSuperposition: (
    superpositionTerms,
    superpositionLabel,
    superpositionSliceResolutionFloor,
    superpositionStreamlineSeedCountMax,
    superpositionDefaultRepresentation,
  ) =>
    set((state) => {
      const representation = openingRepresentation(
        state.mode,
        state.orbital,
        resolveRepresentation(
          state.mode,
          state.orbital,
          state.representation,
          state.representation,
          superpositionStreamlineSeedCountMax,
        ),
        superpositionDefaultRepresentation,
        superpositionStreamlineSeedCountMax,
      )
      return reconcilePlane(state, {
        superpositionTerms,
        superpositionLabel,
        superpositionSliceResolutionFloor,
        superpositionStreamlineSeedCountMax,
        superpositionDefaultRepresentation,
        representation,
        timeAu: 0,
        playing: false,
        resolution: clampResolution(
          state.mode,
          state.orbital,
          representation,
          state.resolution,
          superpositionSliceResolutionFloor,
        ),
        seedCount: clampSeedCount(
          state.mode,
          state.orbital,
          representation,
          state.seedCount,
          superpositionStreamlineSeedCountMax,
        ),
      })
    }),
  syncSuperpositionCapabilities: (
    terms,
    superpositionSliceResolutionFloor,
    superpositionStreamlineSeedCountMax,
    superpositionDefaultRepresentation,
  ) =>
    set((state) => {
      if (state.superpositionTerms !== terms) return state
      const representation = resolveRepresentation(
        state.mode,
        state.orbital,
        state.representation,
        state.representation,
        superpositionStreamlineSeedCountMax,
      )
      return reconcilePlane(state, {
        superpositionSliceResolutionFloor,
        superpositionStreamlineSeedCountMax,
        superpositionDefaultRepresentation,
        representation,
        resolution: clampResolution(
          state.mode,
          state.orbital,
          representation,
          state.resolution,
          superpositionSliceResolutionFloor,
        ),
        seedCount: clampSeedCount(
          state.mode,
          state.orbital,
          representation,
          state.seedCount,
          superpositionStreamlineSeedCountMax,
        ),
      })
    }),
  invalidateSuperpositionStreamlineCapability: () =>
    set((state) => {
      const representation = resolveRepresentation(
        state.mode,
        state.orbital,
        state.representation,
        state.representation,
        undefined,
      )
      return reconcilePlane(state, {
        superpositionStreamlineSeedCountMax: undefined,
        representation,
        playing: false,
        resolution: clampResolution(
          state.mode,
          state.orbital,
          representation,
          state.resolution,
          state.superpositionSliceResolutionFloor,
        ),
        seedCount: clampSeedCount(
          state.mode,
          state.orbital,
          representation,
          state.seedCount,
          undefined,
        ),
      })
    }),
  setSuperpositionBasis: (superpositionBasis) => set({ superpositionBasis }),
  setSuperpositionZ: (superpositionZ) => {
    const charge = chargeBound()
    set({ superpositionZ: Math.max(charge.min, Math.min(charge.max, superpositionZ)) })
  },
  setAMu: (aMu) => set({ aMu }),
  setTimeAu: (timeAu) => set((state) => ({ timeAu: snapTimeAu(state, timeAu) })),
  setPlaying: (playing) => set({ playing }),
  setOrbital: (patch) =>
    set((state) => {
      const orbital = normalizeOrbital(state.orbital, patch)
      const representation = resolveRepresentation(
        state.mode,
        orbital,
        state.representation,
        state.representation,
        state.superpositionStreamlineSeedCountMax,
      )
      return reconcilePlane(state, {
        orbital,
        representation,
        resolution: clampResolution(
          state.mode,
          orbital,
          representation,
          state.resolution,
          state.superpositionSliceResolutionFloor,
        ),
        seedCount: clampSeedCount(
          state.mode,
          orbital,
          representation,
          state.seedCount,
          state.superpositionStreamlineSeedCountMax,
        ),
      })
    }),
  setRepresentation: (representation) =>
    set((state) => {
      const resolved = resolveRepresentation(
        state.mode,
        state.orbital,
        representation,
        state.representation,
        state.superpositionStreamlineSeedCountMax,
      )
      return reconcilePlane(state, {
        representation: resolved,
        resolution: clampResolution(
          state.mode,
          state.orbital,
          resolved,
          state.resolution,
          state.superpositionSliceResolutionFloor,
        ),
        seedCount: clampSeedCount(
          state.mode,
          state.orbital,
          resolved,
          state.seedCount,
          state.superpositionStreamlineSeedCountMax,
        ),
      })
    }),
  setPlane: (plane) => set((state) => reconcilePlane(state, { plane, displacedPlane: undefined })),
  setSliceObservable: (sliceObservable) => set({ sliceObservable }),
  setSamples: (samples) => set({ samples }),
  setSeed: (seed) => set({ seed }),
  setResolution: (resolution) =>
    set((state) => ({
      resolution: clampResolution(
        state.mode,
        state.orbital,
        state.representation,
        resolution,
        state.superpositionSliceResolutionFloor,
      ),
    })),
  setProbabilityMass: (probabilityMass) => set({ probabilityMass }),
  setSeedCount: (seedCount) =>
    set((state) => ({
      seedCount: clampSeedCount(
        state.mode,
        state.orbital,
        state.representation,
        seedCount,
        state.superpositionStreamlineSeedCountMax,
      ),
    })),
  setPointSize: (pointSize) => set({ pointSize }),
  setOpacity: (opacity) => set({ opacity }),
  setBloom: (bloom) => set({ bloom }),
  setExposure: (exposure) => set({ exposure }),
  setFogStrength: (fogStrength) => set({ fogStrength }),
  setAutoRotate: (autoRotate) => set({ autoRotate }),
  setShowGrid: (showGrid) => set({ showGrid }),
  applyPreset: (preset) =>
    set((state) => {
      const orbital = normalizeOrbital(state.orbital, preset)
      const representation = resolveRepresentation(
        state.mode,
        orbital,
        state.representation,
        state.representation,
        state.superpositionStreamlineSeedCountMax,
      )
      return reconcilePlane(state, {
        orbital,
        representation,
        resolution: clampResolution(
          state.mode,
          orbital,
          representation,
          state.resolution,
          state.superpositionSliceResolutionFloor,
        ),
        seedCount: clampSeedCount(
          state.mode,
          orbital,
          representation,
          state.seedCount,
          state.superpositionStreamlineSeedCountMax,
        ),
      })
    }),
}))
