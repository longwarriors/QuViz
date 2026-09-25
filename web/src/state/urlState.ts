import { CAPABILITY_ROUTE_CONSTRAINTS, Z_CONSTRAINT } from '../api/capability'
import { fetchSuperpositionCatalog, lastSuperpositionCatalog } from '../api/client'
import { PRINCIPAL_PLANES, SLICE_OBSERVABLES } from '../api/sliceContract'
import { BASES, MAX_N, PRESET_ID, REPRESENTATIONS } from '../api/staticCatalog'
import type {
  BasisKind,
  OrbitalParameters,
  PrincipalPlane,
  RepresentationKind,
  SliceObservable,
  SuperpositionPreset,
} from '../api/types'
import { useSceneStore, type SceneMode } from './useSceneStore'

/**
 * The scene as a URL fragment: `#mode=eigenstate&n=2&l=1&m=0&basis=real&rep=point_cloud`
 * or `#mode=superposition&preset=1s-2pz&t=3.6&rep=isosurface`, plus `embed=1`
 * for textbook figures. The fragment is a convenience, never the source of
 * truth: the store is. Invalid values are dropped, never thrown on, and the
 * store's own actions re-validate whatever survives.
 */
export interface DeepLinkState {
  mode?: 'eigenstate' | 'superposition'
  n?: number
  l?: number
  m?: number
  z?: number
  basis?: BasisKind
  preset?: string
  t?: number
  rep?: RepresentationKind
  plane?: PrincipalPlane
  obs?: SliceObservable
  embed?: boolean
}

type SceneState = ReturnType<typeof useSceneStore.getState>

const KEY_ORDER = [
  'embed',
  'mode',
  'n',
  'l',
  'm',
  'z',
  'basis',
  'preset',
  't',
  'rep',
  'plane',
  'obs',
] as const satisfies readonly (keyof DeepLinkState)[]

const MODES: readonly SceneMode[] = ['eigenstate', 'superposition']
const INTEGER = /^-?\d+$/
const DECIMAL = /^-?\d+(?:\.\d+)?$/
const TIME_BOUND = CAPABILITY_ROUTE_CONSTRAINTS.superpositionIsosurface.parameters.timeAu.uiBound

function member<T extends string>(value: string | null, allowed: readonly T[]): T | undefined {
  return allowed.find((candidate) => candidate === value)
}

function numberIn(value: string | null, pattern: RegExp, min: number, max: number): number | undefined {
  if (value === null || !pattern.test(value)) return undefined
  const parsed = Number(value)
  return parsed >= min && parsed <= max ? parsed : undefined
}

/** Tolerant: an invalid key is dropped and the rest is kept. Never throws. */
export function parseDeepLink(hash: string): DeepLinkState {
  const params = new URLSearchParams(hash.replace(/^#/, ''))
  const n = numberIn(params.get('n'), INTEGER, 1, MAX_N)
  const lMax = (n ?? MAX_N) - 1
  const l = numberIn(params.get('l'), INTEGER, 0, lMax)
  const mMax = l ?? lMax
  const presetId = params.get('preset') ?? ''
  const embed = params.get('embed')
  const candidate: DeepLinkState = {
    embed: embed === '1' ? true : embed === '0' ? false : undefined,
    mode: member(params.get('mode'), MODES),
    n,
    l,
    m: numberIn(params.get('m'), INTEGER, -mMax, mMax),
    z: numberIn(params.get('z'), DECIMAL, Z_CONSTRAINT.uiBound.min, Z_CONSTRAINT.uiBound.max),
    basis: member(params.get('basis'), BASES),
    preset: PRESET_ID.test(presetId) ? presetId : undefined,
    t: numberIn(params.get('t'), DECIMAL, TIME_BOUND.min, TIME_BOUND.max),
    rep: member(params.get('rep'), REPRESENTATIONS),
    plane: member(params.get('plane'), PRINCIPAL_PLANES),
    obs: member(params.get('obs'), SLICE_OBSERVABLES),
  }
  return Object.fromEntries(
    Object.entries(candidate).filter(([, value]) => value !== undefined),
  ) as DeepLinkState
}

/** Stable key order (embed, mode, n, l, m, z, basis, preset, t, rep, plane, obs); no leading '#'. */
export function serializeDeepLink(state: DeepLinkState): string {
  const params = new URLSearchParams()
  for (const key of KEY_ORDER) {
    const value = state[key]
    if (value === undefined || value === false) continue
    params.set(key, value === true ? '1' : String(value))
  }
  return params.toString()
}

/** The link that reproduces the scene on screen. */
export function deepLinkFromStore(
  state: SceneState,
  presetId: string | undefined,
  embed: boolean,
): DeepLinkState {
  const link: DeepLinkState = { mode: state.mode, rep: state.representation }
  if (embed) link.embed = true
  if (state.mode === 'eigenstate') {
    link.n = state.orbital.n
    link.l = state.orbital.l
    link.m = state.orbital.m
    if (state.orbital.z !== 1) link.z = state.orbital.z
    link.basis = state.orbital.basis
  } else {
    link.preset = presetId
    // A running clock is not a place to link to, and rewriting the URL on
    // every 420 ms tick would trip browsers' replaceState rate limits.
    if (!state.playing && state.timeAu !== 0) link.t = state.timeAu
  }
  if (state.representation === 'slice') {
    link.plane = state.plane
    link.obs = state.sliceObservable
  }
  return link
}

/** Apply a link through the store's own actions, which clamp and resolve availability. */
export function applyDeepLink(
  link: DeepLinkState,
  catalog: readonly SuperpositionPreset[] | null,
): void {
  const store = useSceneStore.getState()
  const orbital: Partial<OrbitalParameters> = {}
  if (link.n !== undefined) orbital.n = link.n
  if (link.l !== undefined) orbital.l = link.l
  if (link.m !== undefined) orbital.m = link.m
  if (link.z !== undefined) orbital.z = link.z
  if (link.basis !== undefined) orbital.basis = link.basis
  if (Object.keys(orbital).length > 0) store.setOrbital(orbital)
  const preset = catalog?.find((entry) => entry.id === link.preset)
  if (preset !== undefined) {
    store.setSuperposition(
      preset.terms,
      preset.label,
      preset.slice_resolution_floor,
      preset.streamline_seed_count_max,
    )
  }
  if (link.mode !== undefined) store.setMode(link.mode)
  if (link.plane !== undefined) store.setPlane(link.plane)
  if (link.obs !== undefined) store.setSliceObservable(link.obs)
  if (link.rep !== undefined) store.setRepresentation(link.rep)
  // After setSuperposition, which rewinds the clock to 0.
  if (link.t !== undefined && useSceneStore.getState().mode === 'superposition') {
    store.setTimeAu(link.t)
  }
}

/** True when this page is a textbook figure (`#embed=1`). Read at call time. */
export function isEmbedMode(): boolean {
  return parseDeepLink(window.location.hash).embed === true
}

/**
 * Hash -> store at start and on every hashchange; store -> hash through
 * `history.replaceState`, which adds no history entry. Returns the unbinder.
 */
export function bindUrlState(): () => void {
  const controller = new AbortController()
  let applying = false
  let pendingPreset = false
  let generation = 0

  const write = (): void => {
    if (applying || pendingPreset) return
    const state = useSceneStore.getState()
    const presetId = lastSuperpositionCatalog()?.find(
      (entry) => entry.terms === state.superpositionTerms,
    )?.id
    const next = `#${serializeDeepLink(deepLinkFromStore(state, presetId, isEmbedMode()))}`
    if (next === window.location.hash) return
    try {
      window.history.replaceState(window.history.state, '', next)
    } catch {
      // Safari throws a SecurityError past ~100 replaceState calls in 30 s. The
      // hash is a convenience; the next store change writes it again.
    }
  }

  const apply = (link: DeepLinkState): void => {
    applying = true
    try {
      applyDeepLink(link, lastSuperpositionCatalog())
    } finally {
      applying = false
    }
    write()
  }

  const follow = (): void => {
    if (window.location.hash === '') return
    const link = parseDeepLink(window.location.hash)
    const current = (generation += 1)
    // Only a preset link needs the catalogue, and only when none is known yet:
    // an ordinary page load adds no request.
    pendingPreset =
      link.mode === 'superposition' && link.preset !== undefined && lastSuperpositionCatalog() === null
    apply(link)
    if (!pendingPreset) return
    const resume = (): void => {
      if (controller.signal.aborted || current !== generation) return
      pendingPreset = false
      // Resolved: the preset applies. Failed: it stays unresolvable, is dropped,
      // and the default superposition is what the hash then says.
      apply(link)
    }
    fetchSuperpositionCatalog(controller.signal).then(resume, resume)
  }

  follow()
  const unsubscribe = useSceneStore.subscribe(write)
  window.addEventListener('hashchange', follow)
  return () => {
    controller.abort()
    unsubscribe()
    window.removeEventListener('hashchange', follow)
  }
}
