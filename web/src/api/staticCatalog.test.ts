import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { nextTimeAu } from '../components/sceneRequest'
import { fetchCatalog, fetchIsosurface, fetchPointCloud } from './client'
import { isosurfaceRequest, metadataRequest, pointCloudRequest } from './requests'
import {
  createStaticTransport,
  loadStaticManifest,
  NOT_PRECOMPUTED_DETAIL,
  parseStaticManifest,
  parseStaticSpec,
  playbackFrames,
  type StaticManifest,
} from './staticCatalog'
import { requestKey, resetTransport, setTransport } from './transport'
import type { OrbitalMetadata, OrbitalParameters } from './types'

// eslint-free spec: `any` keeps the one-field mutations below readable.
type Mutable = Record<string, any>

const SPEC_TEXT = readFileSync(new URL('../../tools/fixtures/spec.json', import.meta.url), 'utf-8')
const rawSpec = (): Mutable => JSON.parse(SPEC_TEXT) as Mutable

const DATA_BASE = new URL('https://lab.example/QuViz/data/')
const JSON_FILE = 'files/0123456789abcdef01234567.json'
const BIN_FILE = 'files/89abcdef0123456789abcdef.bin'
const META_FILE = 'files/fedcba9876543210fedcba98.json'
const fileUrl = (file: string): string => new URL(file, DATA_BASE).href

const goldenBytes = (): ArrayBuffer => {
  const bytes = readFileSync(
    fileURLToPath(new URL('../../../tests/fixtures/qvpc_golden.bin', import.meta.url)),
  )
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
}

const ORBITAL: OrbitalParameters = { n: 2, l: 1, m: 0, z: 1, basis: 'real' }
const METADATA: OrbitalMetadata = {
  state: { ...ORBITAL, a_mu: 1 },
  label: '2p_z',
  energy_hartree: -0.125,
  length_unit: 'bohr',
  observable: 'probability_density',
  representation: 'point_cloud',
  normalization: 'unit',
  coordinate_convention: 'physics',
  spherical_harmonic_convention: 'condon-shortley',
  geometry_semantics: 'samples',
  color_semantics: 'phase',
  references: ['griffiths2018'],
  warnings: [],
}
const keyOf = (request: { route: string; query: URLSearchParams | null }): string =>
  requestKey(request.route, request.query)

function rawManifest(entries: Mutable = {}): Mutable {
  return { format: 'quviz-static/1', version: '0123456789abcdef', spec: rawSpec(), entries }
}

const entry = (patch: Mutable = {}): Mutable => ({
  file: JSON_FILE,
  status: 200,
  content_type: 'application/json',
  headers: {},
  ...patch,
})

function manifestOf(entries: Mutable): StaticManifest {
  return parseStaticManifest(rawManifest(entries))
}

/** A static file host: answers each absolute file URL, 404 for anything else. */
function serveFiles(files: Record<string, () => Response>) {
  const fetchMock = vi.fn<typeof fetch>(async (input) => {
    const handler = files[String(input)]
    return handler === undefined ? new Response('missing', { status: 404 }) : handler()
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

afterEach(() => {
  vi.unstubAllGlobals()
  resetTransport()
})

describe('parseStaticSpec', () => {
  it('accepts the contract spec verbatim', () => {
    expect(parseStaticSpec(rawSpec())).toEqual(rawSpec())
  })

  const mutations: [string, (spec: Mutable) => unknown, string][] = [
    ['not an object', () => null, '静态目录 spec.json 必须是 JSON 对象。'],
    ['wrong format', (s) => ({ ...s, format: 'quviz-static-spec/2' }), 'spec.json.format'],
    ['eigenstates missing', (s) => ({ ...s, eigenstates: 'none' }), 'spec.json.eigenstates 必须是 JSON 对象。'],
    ['superpositions an array', (s) => ({ ...s, superpositions: [] }), 'spec.json.superpositions 必须是 JSON 对象。'],
    ['frames', (s) => ((s.superpositions.frames = 'all'), s), 'spec.json.superpositions.frames'],
    ['n_max a string', (s) => ((s.eigenstates.n_max = '4'), s), 'spec.json.eigenstates.n_max 必须是 1..8'],
    ['n_max fractional', (s) => ((s.eigenstates.n_max = 4.5), s), 'spec.json.eigenstates.n_max'],
    ['n_max zero', (s) => ((s.eigenstates.n_max = 0), s), 'spec.json.eigenstates.n_max'],
    ['n_max above the store', (s) => ((s.eigenstates.n_max = 9), s), 'spec.json.eigenstates.n_max'],
    ['bases not an array', (s) => ((s.eigenstates.bases = 'real'), s), 'spec.json.eigenstates.bases 必须是非空数组。'],
    ['bases empty', (s) => ((s.eigenstates.bases = []), s), 'spec.json.eigenstates.bases 必须是非空数组。'],
    ['bases unknown', (s) => ((s.eigenstates.bases = ['real', 'quaternion']), s), 'spec.json.eigenstates.bases[1] 必须是 real、complex 之一。'],
    ['bases repeated', (s) => ((s.eigenstates.bases = ['real', 'real']), s), 'spec.json.eigenstates.bases[1] 重复出现 real。'],
    ['z a string', (s) => ((s.eigenstates.z = '1'), s), 'spec.json.eigenstates.z'],
    ['z infinite', (s) => ((s.eigenstates.z = Number.POSITIVE_INFINITY), s), 'spec.json.eigenstates.z'],
    ['z zero', (s) => ((s.eigenstates.z = 0), s), 'spec.json.eigenstates.z'],
    ['z above 20', (s) => ((s.eigenstates.z = 21), s), 'spec.json.eigenstates.z'],
    ['representation unknown', (s) => ((s.eigenstates.representations = ['hologram']), s), 'spec.json.eigenstates.representations[0]'],
    ['samples too few', (s) => ((s.eigenstates.samples = 999), s), 'spec.json.eigenstates.samples'],
    ['seed negative', (s) => ((s.eigenstates.seed = -1), s), 'spec.json.eigenstates.seed'],
    ['resolution even', (s) => ((s.eigenstates.resolution = 64), s), 'spec.json.eigenstates.resolution 必须是奇数'],
    ['resolution below 49', (s) => ((s.eigenstates.resolution = 47), s), 'spec.json.eigenstates.resolution'],
    ['probability mass', (s) => ((s.eigenstates.probability_mass = 0.3), s), 'spec.json.eigenstates.probability_mass'],
    ['seed count', (s) => ((s.eigenstates.seed_count = 0), s), 'spec.json.eigenstates.seed_count'],
    ['plane unknown', (s) => ((s.eigenstates.planes = ['xw']), s), 'spec.json.eigenstates.planes[0]'],
    ['observable unknown', (s) => ((s.eigenstates.observables = ['charge']), s), 'spec.json.eigenstates.observables[0]'],
    ['presets empty', (s) => ((s.superpositions.presets = []), s), 'spec.json.superpositions.presets 必须是非空数组。'],
    ['preset id not a string', (s) => ((s.superpositions.presets = [3]), s), 'spec.json.superpositions.presets[0]'],
    ['preset id uppercase', (s) => ((s.superpositions.presets = ['1S-2pz']), s), 'spec.json.superpositions.presets[0]'],
    ['preset repeated', (s) => ((s.superpositions.presets = ['1s-2pz', '1s-2pz']), s), 'spec.json.superpositions.presets[1] 重复出现 1s-2pz。'],
    ['superposition resolution above 513', (s) => ((s.superpositions.resolution = 515), s), 'spec.json.superpositions.resolution'],
    ['superposition planes', (s) => ((s.superpositions.planes = ['xw']), s), 'spec.json.superpositions.planes[0]'],
  ]

  it.each(mutations)('rejects %s with a Chinese message naming the field', (_label, mutate, message) => {
    expect(() => parseStaticSpec(mutate(rawSpec()))).toThrow(message)
  })
})

describe('parseStaticManifest', () => {
  it('accepts a contract manifest and ignores unknown top-level fields', () => {
    const raw: Mutable = {
      ...rawManifest({
        '/api/orbitals/catalog': entry(),
        '/api/orbitals/point-cloud?n=2&l=1&m=0&z=1&basis=real&samples=28000&seed=7': entry({
          file: BIN_FILE,
          content_type: 'application/vnd.quviz.point-cloud',
          headers: {
            'x-quviz-format': 'QVPC/1',
            'x-quviz-radial-mass': '1.000000000',
            'x-quviz-extent-bohr': '17.828133',
          },
        }),
      }),
      generated_by: 'quviz 0.1.0',
    }
    const parsed = parseStaticManifest(raw)
    expect(parsed.format).toBe('quviz-static/1')
    expect(parsed.version).toBe('0123456789abcdef')
    expect(parsed.spec).toEqual(rawSpec())
    expect(parsed.entries).toEqual(raw.entries)
    expect(parsed).not.toHaveProperty('generated_by')
  })

  const mutations: [string, () => unknown, string][] = [
    ['an array', () => [], '静态目录 manifest.json 必须是 JSON 对象。'],
    ['another format', () => ({ ...rawManifest(), format: 'quviz-static/2' }), 'manifest.json.format'],
    ['a short version', () => ({ ...rawManifest(), version: 'abc' }), 'manifest.json.version'],
    ['an invalid spec', () => ({ ...rawManifest(), spec: { ...rawSpec(), format: 'x' } }), 'manifest.json.spec.format'],
    ['entries null', () => ({ ...rawManifest(), entries: null }), 'manifest.json.entries 必须是 JSON 对象。'],
    ['a key without /api', () => rawManifest({ catalog: entry() }), '的键必须是以 /api/ 开头的请求字符串'],
    ['an entry that is a string', () => rawManifest({ '/api/orbitals/catalog': 'x' }), 'manifest.json.entries["/api/orbitals/catalog"] 必须是 JSON 对象。'],
    ['status 204', () => rawManifest({ '/api/orbitals/catalog': entry({ status: 204 }) }), '不能是无响应体的状态码'],
    ['status 199', () => rawManifest({ '/api/orbitals/catalog': entry({ status: 199 }) }), '.status 必须是 200..599'],
    ['status 600', () => rawManifest({ '/api/orbitals/catalog': entry({ status: 600 }) }), '.status 必须是 200..599'],
    ['a path traversal', () => rawManifest({ '/api/orbitals/catalog': entry({ file: '../secret.json' }) }), '.file'],
    ['an absolute URL', () => rawManifest({ '/api/orbitals/catalog': entry({ file: 'https://evil.example/x.json' }) }), '.file'],
    ['a file that is not a string', () => rawManifest({ '/api/orbitals/catalog': entry({ file: 7 }) }), '.file'],
    ['an empty content type', () => rawManifest({ '/api/orbitals/catalog': entry({ content_type: '' }) }), '.content_type'],
    ['headers an array', () => rawManifest({ '/api/orbitals/catalog': entry({ headers: [] }) }), '.headers 必须是 JSON 对象。'],
    ['an upper-case header name', () => rawManifest({ '/api/orbitals/catalog': entry({ headers: { 'X-QuViz-Format': 'QVPC/1' } }) }), '只能包含小写的 x-quviz-* 头'],
    ['a foreign header', () => rawManifest({ '/api/orbitals/catalog': entry({ headers: { 'content-type': 'x' } }) }), '只能包含小写的 x-quviz-* 头'],
    ['a numeric header value', () => rawManifest({ '/api/orbitals/catalog': entry({ headers: { 'x-quviz-format': 1 } }) }), '.headers.x-quviz-format'],
    ['a non-ASCII header value', () => rawManifest({ '/api/orbitals/catalog': entry({ headers: { 'x-quviz-format': 'é' } }) }), '.headers.x-quviz-format'],
  ]

  it.each(mutations)('rejects %s', (_label, build, message) => {
    expect(() => parseStaticManifest(build())).toThrow(message)
  })
})

describe('loadStaticManifest', () => {
  it('fetches manifest.json relative to the data base with no-cache and the signal', async () => {
    const fetchMock = serveFiles({
      [fileUrl('manifest.json')]: () => new Response(JSON.stringify(rawManifest())),
    })
    const controller = new AbortController()

    const manifest = await loadStaticManifest(DATA_BASE, controller.signal)

    expect(manifest.spec).toEqual(rawSpec())
    expect(String(fetchMock.mock.calls[0][0])).toBe('https://lab.example/QuViz/data/manifest.json')
    expect(fetchMock.mock.calls[0][1]).toEqual({ cache: 'no-cache', signal: controller.signal })
  })

  it('names the URL and status when the manifest is missing', async () => {
    serveFiles({})
    await expect(loadStaticManifest(DATA_BASE)).rejects.toThrow(
      '无法加载静态目录 https://lab.example/QuViz/data/manifest.json（HTTP 404）。',
    )
  })

  it('says so when manifest.json is not JSON', async () => {
    serveFiles({ [fileUrl('manifest.json')]: () => new Response('{') })
    await expect(loadStaticManifest(DATA_BASE)).rejects.toThrow('静态目录 manifest.json 不是合法的 JSON。')
  })
})

describe('createStaticTransport', () => {
  it('answers a catalogued JSON request with the stored status and content type', async () => {
    const presets = [{ id: '1s', label: '1s', n: 1, l: 0, m: 0, basis: 'real' }]
    serveFiles({
      [fileUrl(JSON_FILE)]: () =>
        new Response(JSON.stringify(presets), { headers: { 'content-type': 'application/octet-stream' } }),
    })
    const transport = createStaticTransport(manifestOf({ '/api/orbitals/catalog': entry() }), DATA_BASE)

    const response = await transport.request('/api/orbitals/catalog', null)
    expect(response.status).toBe(200)
    // The stored content type wins over whatever the file host said.
    expect(response.headers.get('content-type')).toBe('application/json')

    setTransport(transport)
    await expect(fetchCatalog()).resolves.toEqual(presets)
  })

  it('synthesises the QVPC headers GitHub Pages cannot send, so the shared decoder accepts the cloud', async () => {
    const cloudKey = keyOf(pointCloudRequest(ORBITAL, 28000, 7))
    const metaKey = keyOf(metadataRequest(ORBITAL))
    const qvpcHeaders = {
      'x-quviz-format': 'QVPC/1',
      'x-quviz-radial-mass': '0.999999000',
      'x-quviz-extent-bohr': '100.000000',
    }
    serveFiles({
      [fileUrl(BIN_FILE)]: () => new Response(goldenBytes()),
      [fileUrl(META_FILE)]: () => new Response(JSON.stringify(METADATA)),
    })
    const withHeaders = manifestOf({
      [cloudKey]: entry({ file: BIN_FILE, content_type: 'application/vnd.quviz.point-cloud', headers: qvpcHeaders }),
      [metaKey]: entry({ file: META_FILE }),
    })
    setTransport(createStaticTransport(withHeaders, DATA_BASE))

    const cloud = await fetchPointCloud(ORBITAL, 28000, 7)
    expect(cloud.count).toBe(4)
    expect(cloud.radialMass).toBeCloseTo(0.999999, 9)
    expect(cloud.extentBohr).toBe(100)
    expect(cloud.metadata).toEqual(METADATA)

    // Negative control: the same bytes without the stored headers fail in the decoder.
    const withoutHeaders = manifestOf({
      [cloudKey]: entry({ file: BIN_FILE, content_type: 'application/vnd.quviz.point-cloud' }),
      [metaKey]: entry({ file: META_FILE }),
    })
    setTransport(createStaticTransport(withoutHeaders, DATA_BASE))
    await expect(fetchPointCloud(ORBITAL, 28000, 7)).rejects.toThrow(
      'Point-cloud response header X-QuViz-Radial-Mass is missing.',
    )
  })

  it('replays a recorded fail-closed 422 with its server reason', async () => {
    const isoKey = keyOf(isosurfaceRequest(ORBITAL, 65, 0.9))
    serveFiles({
      [fileUrl(JSON_FILE)]: () => new Response(JSON.stringify({ detail: 'topology did not converge' })),
    })
    setTransport(createStaticTransport(manifestOf({ [isoKey]: entry({ status: 422 }) }), DATA_BASE))

    await expect(fetchIsosurface(ORBITAL, 65, 0.9)).rejects.toThrow(new Error('topology did not converge'))
  })

  it('answers an uncatalogued request with a readable 404 and touches no file', async () => {
    // The contract's one sentence for this case; chapter 0 of the textbook quotes it.
    expect(NOT_PRECOMPUTED_DETAIL).toBe('静态教材版未预计算这一组合。本地运行 quviz serve 可实时计算任意参数。')
    const fetchMock = serveFiles({})
    const transport = createStaticTransport(manifestOf({}), DATA_BASE)

    const response = await transport.request('/api/orbitals/isosurface', new URLSearchParams([['n', '9']]))
    expect(response.status).toBe(404)
    expect(response.headers.get('content-type')).toBe('application/json')
    expect(await response.json()).toEqual({ detail: NOT_PRECOMPUTED_DETAIL })

    setTransport(transport)
    await expect(fetchIsosurface(ORBITAL, 65, 0.9)).rejects.toThrow(new Error(NOT_PRECOMPUTED_DETAIL))
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('refuses a request whose signal is already aborted, before any lookup', async () => {
    const fetchMock = serveFiles({ [fileUrl(JSON_FILE)]: () => new Response('[]') })
    const transport = createStaticTransport(manifestOf({ '/api/orbitals/catalog': entry() }), DATA_BASE)
    const controller = new AbortController()
    controller.abort()

    await expect(transport.request('/api/orbitals/catalog', null, controller.signal)).rejects.toMatchObject({
      name: 'AbortError',
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('drops an answer whose caller aborted while the file was loading', async () => {
    const controller = new AbortController()
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>(async () => {
        controller.abort()
        return new Response('[]')
      }),
    )
    const transport = createStaticTransport(manifestOf({ '/api/orbitals/catalog': entry() }), DATA_BASE)

    await expect(transport.request('/api/orbitals/catalog', null, controller.signal)).rejects.toMatchObject({
      name: 'AbortError',
    })
  })

  it('names the file when the host cannot serve it', async () => {
    serveFiles({})
    const transport = createStaticTransport(manifestOf({ '/api/orbitals/catalog': entry() }), DATA_BASE)
    await expect(transport.request('/api/orbitals/catalog', null)).rejects.toThrow(
      `静态数据文件 ${JSON_FILE} 读取失败（HTTP 404）`,
    )
  })
})

describe('playbackFrames', () => {
  const PERIOD_1S_2PZ = 16.755160819145562
  const PERIOD_1S_3DZ2 = 14.137166941154069

  it('lists the 28 frames of 1s + 2p_z', () => {
    expect(playbackFrames(PERIOD_1S_2PZ)).toEqual([
      0, 0.6, 1.2, 1.8, 2.4, 3, 3.6, 4.2, 4.8, 5.4, 6, 6.6, 7.2, 7.8, 8.4, 9, 9.6, 10.2, 10.8, 11.4,
      12, 12.6, 13.2, 13.8, 14.4, 15, 15.6, 16.2,
    ])
  })

  it('lists the 24 uneven frames of 1s + 3d_z2 (5.4 -> 5.8)', () => {
    expect(playbackFrames(PERIOD_1S_3DZ2)).toEqual([
      0, 0.6, 1.2, 1.8, 2.4, 3, 3.6, 4.2, 4.8, 5.4, 5.8, 6.4, 7, 7.6, 8.2, 8.8, 9.4, 10, 10.6, 11.2,
      11.8, 12.4, 13, 13.6,
    ])
  })

  it.each([PERIOD_1S_2PZ, PERIOD_1S_3DZ2, 39.6, 12.1])(
    'is exactly the lap nextTimeAu walks from 0 for period %s',
    (period) => {
      const frames = playbackFrames(period)
      let time = 0
      for (const frame of frames) {
        expect(time).toBe(frame)
        time = nextTimeAu(time, period)
      }
      expect(time).toBe(0)
    },
  )

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])('holds a degenerate or invalid period %s at t = 0', (period) => {
    expect(playbackFrames(period)).toEqual([0])
  })
})
