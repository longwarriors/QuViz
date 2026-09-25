import {
  CAPABILITY_ROUTE_CONSTRAINTS,
  NOT_PRECOMPUTED_DETAIL,
  playbackFrameCount,
  playbackFrameTime,
  Z_CONSTRAINT,
} from './capability'
import { MAXIMUM_SLICE_RESOLUTION, PRINCIPAL_PLANES, SLICE_OBSERVABLES } from './sliceContract'
import { requestKey, type Transport } from './transport'
import type { BasisKind, PrincipalPlane, RepresentationKind, SliceObservable } from './types'

/**
 * The precomputed catalogue the static (GitHub Pages) build answers from.
 *
 * `quviz export-static render` replays every request the enumerator
 * (src/api/staticEnumeration.ts) listed through the real ASGI app and writes
 * each distinct body under data/files/, plus data/manifest.json mapping the
 * literal request string to its file, status, content type and `x-quviz-*`
 * headers (design/plans/2026-09-25-contracts.md, "A -> B/E"). This module
 * validates that manifest and turns it into a Transport, so the decoders behind
 * client.ts never learn which mode they run in.
 */

/** The contract's sentence for an uncatalogued combination (defined in capability.ts). */
export { NOT_PRECOMPUTED_DETAIL }

export interface StaticEigenstateSpec {
  n_max: number
  bases: readonly BasisKind[]
  z: number
  representations: readonly RepresentationKind[]
  samples: number
  seed: number
  resolution: number
  probability_mass: number
  seed_count: number
  planes: readonly PrincipalPlane[]
  observables: readonly SliceObservable[]
}

export interface StaticSuperpositionSpec {
  presets: readonly string[]
  representations: readonly RepresentationKind[]
  resolution: number
  probability_mass: number
  seed_count: number
  planes: readonly PrincipalPlane[]
  observables: readonly SliceObservable[]
  frames: 'playback-lattice'
}

/** spec.json, with its JSON keys as they are (contract). */
export interface StaticSpec {
  format: 'quviz-static-spec/1'
  eigenstates: StaticEigenstateSpec
  superpositions: StaticSuperpositionSpec
}

export interface StaticManifestEntry {
  file: string
  status: number
  content_type: string
  headers: Record<string, string>
}

export interface StaticManifest {
  format: 'quviz-static/1'
  version: string
  spec: StaticSpec
  entries: Record<string, StaticManifestEntry>
}

const SPEC_FORMAT = 'quviz-static-spec/1'
const MANIFEST_FORMAT = 'quviz-static/1'
const BASES: readonly BasisKind[] = ['real', 'complex']
const REPRESENTATIONS: readonly RepresentationKind[] = [
  'point_cloud',
  'isosurface',
  'slice',
  'streamlines',
]
/** The store's n ceiling (useSceneStore.ts normalizeOrbital clamps n to 1..8). */
const MAX_N = 8
const SAMPLES = CAPABILITY_ROUTE_CONSTRAINTS.pointCloud.parameters.samples.uiBound
const SEED = CAPABILITY_ROUTE_CONSTRAINTS.pointCloud.parameters.seed.uiBound
const MASS = CAPABILITY_ROUTE_CONSTRAINTS.eigenstateIsosurface.parameters.probabilityMass.uiBound
const SEED_COUNT_MAX = CAPABILITY_ROUTE_CONSTRAINTS.eigenstateCurrent.parameters.seedCount.uiBound.max
const RESOLUTION_MIN = CAPABILITY_ROUTE_CONSTRAINTS.eigenstateIsosurface.parameters.resolution.uiBound.min

const PRESET_ID = /^[a-z0-9][a-z0-9-]*$/
const VERSION = /^[0-9a-f]{16}$/
const FILE_NAME = /^files\/[0-9a-f]{24}\.(?:json|bin)$/
const REQUEST_KEY = /^\/api\/[a-z-]+\/[a-z-]+(?:\?\S*)?$/
const HEADER_NAME = /^x-quviz-[a-z0-9-]+$/
const HEADER_VALUE = /^[\x20-\x7e]*$/
const CONTENT_TYPE = /^[\x21-\x7e][\x20-\x7e]*$/
/** Statuses a Response may not carry a body with: its constructor throws. */
const NULL_BODY_STATUSES: ReadonlySet<number> = new Set([204, 205, 304])

function fail(path: string, expectation: string): never {
  throw new Error(`静态目录 ${path} ${expectation}`)
}

function objectAt(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    fail(path, '必须是 JSON 对象。')
  }
  return value as Record<string, unknown>
}

function integerAt(value: unknown, path: string, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
    fail(path, `必须是 ${min}..${max} 之间的整数。`)
  }
  return value
}

function numberAt(value: unknown, path: string, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
    fail(path, `必须是 ${min}..${max} 之间的有限数。`)
  }
  return value
}

function resolutionAt(value: unknown, path: string): number {
  const resolution = integerAt(value, path, RESOLUTION_MIN, MAXIMUM_SLICE_RESOLUTION)
  if (resolution % 2 === 0) fail(path, '必须是奇数（网格需要以原点为采样点）。')
  return resolution
}

function stringAt(value: unknown, path: string, pattern: RegExp, expectation: string): string {
  if (typeof value !== 'string' || !pattern.test(value)) fail(path, expectation)
  return value
}

function nonEmptyArrayAt(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value) || value.length === 0) fail(path, '必须是非空数组。')
  return value
}

function choicesAt<T extends string>(value: unknown, path: string, allowed: readonly T[]): readonly T[] {
  const chosen: T[] = []
  nonEmptyArrayAt(value, path).forEach((item, index) => {
    const match = allowed.find((candidate) => candidate === item)
    if (match === undefined) fail(`${path}[${index}]`, `必须是 ${allowed.join('、')} 之一。`)
    if (chosen.includes(match)) fail(`${path}[${index}]`, `重复出现 ${match}。`)
    chosen.push(match)
  })
  return chosen
}

function presetIdsAt(value: unknown, path: string): readonly string[] {
  const ids: string[] = []
  nonEmptyArrayAt(value, path).forEach((item, index) => {
    const id = stringAt(item, `${path}[${index}]`, PRESET_ID, '必须是由小写字母、数字和连字符组成的预设 id。')
    if (ids.includes(id)) fail(`${path}[${index}]`, `重复出现 ${id}。`)
    ids.push(id)
  })
  return ids
}

function specAt(raw: unknown, path: string): StaticSpec {
  const spec = objectAt(raw, path)
  if (spec.format !== SPEC_FORMAT) fail(`${path}.format`, `必须是 "${SPEC_FORMAT}"。`)
  const eigen = objectAt(spec.eigenstates, `${path}.eigenstates`)
  const superposed = objectAt(spec.superpositions, `${path}.superpositions`)
  const e = (key: string): string => `${path}.eigenstates.${key}`
  const s = (key: string): string => `${path}.superpositions.${key}`
  if (superposed.frames !== 'playback-lattice') fail(s('frames'), '必须是 "playback-lattice"。')
  return {
    format: SPEC_FORMAT,
    eigenstates: {
      n_max: integerAt(eigen.n_max, e('n_max'), 1, MAX_N),
      bases: choicesAt(eigen.bases, e('bases'), BASES),
      z: numberAt(eigen.z, e('z'), Z_CONSTRAINT.uiBound.min, Z_CONSTRAINT.uiBound.max),
      representations: choicesAt(eigen.representations, e('representations'), REPRESENTATIONS),
      samples: integerAt(eigen.samples, e('samples'), SAMPLES.min, SAMPLES.max),
      seed: integerAt(eigen.seed, e('seed'), SEED.min, SEED.max),
      resolution: resolutionAt(eigen.resolution, e('resolution')),
      probability_mass: numberAt(eigen.probability_mass, e('probability_mass'), MASS.min, MASS.max),
      seed_count: integerAt(eigen.seed_count, e('seed_count'), 1, SEED_COUNT_MAX),
      planes: choicesAt(eigen.planes, e('planes'), PRINCIPAL_PLANES),
      observables: choicesAt(eigen.observables, e('observables'), SLICE_OBSERVABLES),
    },
    superpositions: {
      presets: presetIdsAt(superposed.presets, s('presets')),
      representations: choicesAt(superposed.representations, s('representations'), REPRESENTATIONS),
      resolution: resolutionAt(superposed.resolution, s('resolution')),
      probability_mass: numberAt(superposed.probability_mass, s('probability_mass'), MASS.min, MASS.max),
      seed_count: integerAt(superposed.seed_count, s('seed_count'), 1, SEED_COUNT_MAX),
      planes: choicesAt(superposed.planes, s('planes'), PRINCIPAL_PLANES),
      observables: choicesAt(superposed.observables, s('observables'), SLICE_OBSERVABLES),
      frames: 'playback-lattice',
    },
  }
}

/** spec.json as `quviz export-static plan` writes it. */
export function parseStaticSpec(raw: unknown): StaticSpec {
  return specAt(raw, 'spec.json')
}

function entryAt(value: unknown, path: string): StaticManifestEntry {
  const entry = objectAt(value, path)
  const status = integerAt(entry.status, `${path}.status`, 200, 599)
  if (NULL_BODY_STATUSES.has(status)) fail(`${path}.status`, '不能是无响应体的状态码。')
  const stored = objectAt(entry.headers, `${path}.headers`)
  const headers: Record<string, string> = {}
  for (const [name, value] of Object.entries(stored)) {
    if (!HEADER_NAME.test(name)) fail(`${path}.headers`, `只能包含小写的 x-quviz-* 头，发现 ${name}。`)
    headers[name] = stringAt(value, `${path}.headers.${name}`, HEADER_VALUE, '必须是可打印 ASCII 字符串。')
  }
  return {
    file: stringAt(entry.file, `${path}.file`, FILE_NAME, '必须是 files/ 下以 24 位十六进制哈希命名的 .json 或 .bin 文件。'),
    status,
    content_type: stringAt(entry.content_type, `${path}.content_type`, CONTENT_TYPE, '必须是非空的可打印 ASCII 媒体类型。'),
    headers,
  }
}

/** Validate data/manifest.json. Throws an Error with a Chinese message naming the field. */
export function parseStaticManifest(raw: unknown): StaticManifest {
  const manifest = objectAt(raw, 'manifest.json')
  if (manifest.format !== MANIFEST_FORMAT) {
    fail('manifest.json.format', `必须是 "${MANIFEST_FORMAT}"；请用同一版本的 quviz export-static 重新生成。`)
  }
  const version = stringAt(manifest.version, 'manifest.json.version', VERSION, '必须是 16 位十六进制内容哈希。')
  const spec = specAt(manifest.spec, 'manifest.json.spec')
  const stored = objectAt(manifest.entries, 'manifest.json.entries')
  const entries: Record<string, StaticManifestEntry> = {}
  for (const [key, value] of Object.entries(stored)) {
    const path = `manifest.json.entries["${key}"]`
    if (!REQUEST_KEY.test(key)) fail(path, '的键必须是以 /api/ 开头的请求字符串。')
    entries[key] = entryAt(value, path)
  }
  return { format: MANIFEST_FORMAT, version, spec, entries }
}

/**
 * Fetch and validate `<dataBase>/manifest.json`. `no-cache` revalidates it on
 * every load: GitHub Pages serves everything with max-age=600, and a stale
 * manifest must not be paired with a new deploy's files.
 */
export async function loadStaticManifest(dataBase: URL, signal?: AbortSignal): Promise<StaticManifest> {
  const url = new URL('manifest.json', dataBase)
  const response = await fetch(url, { cache: 'no-cache', signal })
  if (!response.ok) {
    throw new Error(`无法加载静态目录 ${url.href}（HTTP ${response.status}）。`)
  }
  let raw: unknown
  try {
    raw = await response.json()
  } catch {
    throw new Error('静态目录 manifest.json 不是合法的 JSON。')
  }
  return parseStaticManifest(raw)
}

function abortError(): DOMException {
  return new DOMException('静态目录请求已取消。', 'AbortError')
}

/**
 * A Transport answering from the catalogue.
 *
 * A hit fetches the stored file and returns a real `Response` carrying the
 * stored status, the stored content type and the stored `x-quviz-*` headers --
 * GitHub Pages cannot send custom headers, and the QVPC decoder requires two
 * (qvpc.ts:193-194). A miss returns 404 with a JSON `detail`, which the
 * existing `responseError` turns into readable UI copy.
 */
export function createStaticTransport(manifest: StaticManifest, dataBase: URL): Transport {
  return {
    async request(route, query, signal) {
      if (signal?.aborted) throw abortError()
      const key = requestKey(route, query)
      const entry = Object.hasOwn(manifest.entries, key) ? manifest.entries[key] : undefined
      if (entry === undefined) {
        return new Response(JSON.stringify({ detail: NOT_PRECOMPUTED_DETAIL }), {
          status: 404,
          headers: { 'content-type': 'application/json' },
        })
      }
      const file = await fetch(new URL(entry.file, dataBase), { signal })
      if (!file.ok) {
        throw new Error(
          `静态数据文件 ${entry.file} 读取失败（HTTP ${file.status}）；请刷新页面或重新构建静态站点。`,
        )
      }
      const body = await file.arrayBuffer()
      // A caller that moved on while the file loaded gets no late answer.
      if (signal?.aborted) throw abortError()
      return new Response(body, {
        status: entry.status,
        headers: { ...entry.headers, 'content-type': entry.content_type },
      })
    },
  }
}

/**
 * Every time one playback lap of a `periodAu` period visits, in order: exactly
 * the values `nextTimeAu` steps through from 0, because both are built from
 * `playbackFrameCount` / `playbackFrameTime`. A degenerate preset (period 0)
 * never moves, so its only frame is t = 0; an invalid period fails closed the
 * same way.
 */
export function playbackFrames(periodAu: number): readonly number[] {
  const frames = playbackFrameCount(periodAu)
  if (frames === 0) return [0]
  return Array.from({ length: frames }, (_, frame) => playbackFrameTime(frame, frames, periodAu))
}
