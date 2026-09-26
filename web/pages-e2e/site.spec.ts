/**
 * The published GitHub Pages site, exercised exactly as Pages serves it.
 *
 * playwright.pages.config.ts starts `scripts/build_pages.py --skip-data --serve 4180`:
 * the lab and the textbook are rebuilt from this checkout, the precomputed data of the
 * last full build is kept, and build/pages/ is served under the repository sub-path ONLY
 * -- a request outside it answers 404, as on Pages. No FastAPI process exists anywhere
 * in this suite: a request to /api/ is a defect, never a fallback.
 *
 * Every lab test holds the page to one ledger: zero /api requests, zero off-origin
 * requests, zero same-origin requests outside the sub-path, zero 4xx/5xx, zero failed
 * requests, zero page errors and zero console errors. The textbook test additionally
 * allows the jsDelivr packages mkdocs.yml pins (MathJax, Mermaid), so it needs network.
 *
 * Not asserted here: Material's instant navigation. It rebases sitemap URLs by protocol
 * and host but not port, so it degrades to full page loads on 127.0.0.1:4180; the
 * full-stack suite asserts it under `mkdocs serve`.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  expect,
  test,
  type APIRequestContext,
  type Locator,
  type Page,
  type Response,
} from '@playwright/test'

const REPOSITORY_ROOT = fileURLToPath(new URL('../../', import.meta.url))
const LEARN_ROOT = join(REPOSITORY_ROOT, 'build', 'pages', 'learn')
const MKDOCS_CONFIG = join(REPOSITORY_ROOT, 'mkdocs.yml')

const STATUS = 'span[data-status]'
const SETTLE = { timeout: 60_000 } as const
const TERMS_1S_2PZ = '1,0,0,0.7071067811865476;2,1,0,0.7071067811865476'
/**
 * The sentence every `not_precomputed` reason opens with (contracts Amendment 3,
 * `NOT_PRECOMPUTED_DETAIL` in src/api/capability.ts), up to its first full stop.
 */
const NOT_PRECOMPUTED_OPENING = '静态教材版未预计算这一组合。'
/**
 * 1s + 2p_z plays 28 frames per period (T = 16.755 a.u.): playbackFrames(T), which
 * snaps k·T/28 to the 0.2 a.u. grid and so lands exactly on k × 0.6 for k = 0..27.
 * Index k is the scrubber's value for that frame.
 */
const LATTICE_1S_2PZ: readonly number[] = Array.from({ length: 28 }, (_, frame) =>
  Number((frame * 0.6).toFixed(1)),
)

interface Ledger {
  readonly base: URL
  readonly responses: Response[]
  readonly apiRequests: string[]
  readonly offOrigin: string[]
  readonly outsidePrefix: string[]
  readonly failed: string[]
  readonly badStatus: string[]
  readonly pageErrors: string[]
  readonly consoleErrors: string[]
}

interface ManifestEntry {
  readonly file: string
  readonly status: number
  readonly content_type: string
}

interface StaticManifest {
  readonly format: string
  readonly entries: Readonly<Record<string, ManifestEntry>>
}

/** One consistent look at the time pill, taken inside a single render. */
interface PillReading {
  readonly readout: string | null
  readonly index: string | null
  readonly valuetext: string | null
  readonly text: string
}

function baseOf(baseURL: string | undefined): URL {
  expect(baseURL, 'playwright.pages.config.ts derives baseURL from build/pages-build.json')
    .toBeDefined()
  return new URL(baseURL as string)
}

function watch(page: Page, base: URL, allowedOffOrigin: readonly string[] = []): Ledger {
  const ledger: Ledger = {
    base,
    responses: [],
    apiRequests: [],
    offOrigin: [],
    outsidePrefix: [],
    failed: [],
    badStatus: [],
    pageErrors: [],
    consoleErrors: [],
  }
  page.on('request', (request) => {
    const url = new URL(request.url())
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return
    if (url.pathname.includes('/api/')) ledger.apiRequests.push(url.href)
    if (url.origin !== base.origin) {
      if (!allowedOffOrigin.some((prefix) => url.href.startsWith(prefix))) {
        ledger.offOrigin.push(url.href)
      }
    } else if (!url.pathname.startsWith(base.pathname)) {
      ledger.outsidePrefix.push(url.href)
    }
  })
  page.on('response', (response) => {
    ledger.responses.push(response)
    if (response.status() >= 400) ledger.badStatus.push(`${response.status()} ${response.url()}`)
  })
  page.on('requestfailed', (request) => {
    const reason = request.failure()?.errorText ?? 'failed'
    // An abort is the lab cancelling its own superseded request (useSceneAsset aborts on
    // a scene change); every other failure is a broken site.
    if (!reason.includes('ERR_ABORTED')) ledger.failed.push(`${request.url()}: ${reason}`)
  })
  page.on('pageerror', (error) => ledger.pageErrors.push(error.stack ?? error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') ledger.consoleErrors.push(message.text())
  })
  return ledger
}

function expectClean(ledger: Ledger): void {
  expect(ledger.apiRequests, 'the static site asked for /api/ -- Pages has no backend').toEqual([])
  expect(ledger.offOrigin, 'a request left the site origin').toEqual([])
  expect(ledger.outsidePrefix, 'a same-origin request escaped the repository sub-path').toEqual([])
  expect(ledger.failed, 'a request failed').toEqual([])
  expect(ledger.badStatus, 'a request answered 4xx/5xx').toEqual([])
  expect(ledger.pageErrors, 'the page threw').toEqual([])
  expect(ledger.consoleErrors, 'the page logged an error').toEqual([])
}

/** The scene with this identity (sceneIdentityKey fragments) is settled and current. */
async function sceneReady(page: Page, ...identity: string[]): Promise<void> {
  const selector = identity.map((part) => `[data-scene-ready*="${part}"]`).join('')
  await expect(page.locator(selector)).toBeAttached(SETTLE)
  await expect(page.locator(STATUS)).toHaveAttribute('data-status', 'ready', SETTLE)
}

/** The guide dialog opens once per fresh profile (spec §4.4); every context here is fresh. */
async function dismissGuide(page: Page): Promise<void> {
  const dialog = page.getByRole('dialog').first()
  if (await dialog.isVisible()) {
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
  }
}

function hashOf(url: string): URLSearchParams {
  return new URLSearchParams(new URL(url).hash.slice(1))
}

async function readManifest(request: APIRequestContext): Promise<StaticManifest> {
  const response = await request.get('data/manifest.json')
  expect(response.status(), 'data/manifest.json under the sub-path').toBe(200)
  const manifest = (await response.json()) as StaticManifest
  expect(manifest.format).toBe('quviz-static/1')
  return manifest
}

/** manifest entry file ("files/<hash>.json") -> every request key it answers. */
function keysByFile(manifest: StaticManifest): Map<string, string[]> {
  const byFile = new Map<string, string[]>()
  for (const [key, entry] of Object.entries(manifest.entries)) {
    byFile.set(entry.file, [...(byFile.get(entry.file) ?? []), key])
  }
  return byFile
}

/** The API questions this page answered from precomputed files, as manifest keys. */
function answeredKeys(ledger: Ledger, byFile: ReadonlyMap<string, readonly string[]>): string[] {
  const dataRoot = `${ledger.base.pathname}data/`
  const keys = new Set<string>()
  for (const response of ledger.responses) {
    const path = new URL(response.url()).pathname
    if (!path.startsWith(dataRoot)) continue
    for (const key of byFile.get(path.slice(dataRoot.length)) ?? []) keys.add(key)
  }
  return [...keys]
}

/** Keys for `route` whose decoded query carries every `expected` pair. */
function answered(
  keys: readonly string[],
  route: string,
  expected: Readonly<Record<string, string>>,
): URLSearchParams[] {
  const matches: URLSearchParams[] = []
  for (const key of keys) {
    const [keyRoute, query = ''] = key.split('?', 2)
    const params = new URLSearchParams(query)
    const agrees = Object.entries(expected).every(([name, value]) => params.get(name) === value)
    if (keyRoute === route && agrees) matches.push(params)
  }
  return matches
}

/** The data files (`files/<hash>.json`) that answer the 1s + 2p_z isosurface at `time`. */
function isosurfaceFrameFiles(manifest: StaticManifest, time: number): Set<string> {
  const files = new Set<string>()
  for (const [key, entry] of Object.entries(manifest.entries)) {
    const [route, query = ''] = key.split('?', 2)
    const params = new URLSearchParams(query)
    if (
      route === '/api/superposition/isosurface' &&
      params.get('terms') === TERMS_1S_2PZ &&
      Number(params.get('time')) === time
    ) {
      files.add(entry.file)
    }
  }
  return files
}

/**
 * Readout, scrubber position and meta line in ONE evaluate: separate locator reads
 * could straddle a 420 ms playback tick and pair one frame's time with the next
 * frame's index.
 */
async function readPill(pill: Locator): Promise<PillReading> {
  return pill.evaluate((section) => {
    const scrubber = section.querySelector<HTMLInputElement>('input[data-time-scrubber]')
    return {
      readout: section.querySelector('output[data-time-readout]')?.textContent ?? null,
      index: scrubber?.value ?? null,
      valuetext: scrubber?.getAttribute('aria-valuetext') ?? null,
      text: section.textContent ?? '',
    }
  })
}

/** The reading names one lattice frame the same way everywhere; returns its time. */
function expectOnLattice(reading: PillReading): number {
  // Number(null) is 0, a lattice frame: a missing readout or scrubber must fail here.
  expect(reading.readout, 'the pill shows no read-only time readout').not.toBeNull()
  expect(reading.index, 'the pill shows no frame scrubber').not.toBeNull()
  const time = Number(reading.readout)
  const index = Number(reading.index)
  expect(LATTICE_1S_2PZ.includes(time), `t=${reading.readout} is not a playback frame of 1s + 2p_z`)
    .toBe(true)
  expect(LATTICE_1S_2PZ[index], `the scrubber (frame ${reading.index}) disagrees with t=${reading.readout}`)
    .toBe(time)
  expect(reading.valuetext).toBe(`t = ${time.toFixed(1)} a.u.`)
  expect(reading.text).toContain(`帧 ${index + 1}/${LATTICE_1S_2PZ.length}`)
  return time
}

/** The hash's `t`, where an absent `t` means 0 (B10 omits it at t = 0). */
function hashTime(page: Page): number {
  return Number(hashOf(page.url()).get('t') ?? '0')
}

/** The jsDelivr package prefixes mkdocs.yml pins: the textbook's only off-origin loads. */
function textbookCdnPrefixes(): string[] {
  const text = readFileSync(MKDOCS_CONFIG, 'utf-8')
  const pinned = [
    ...text.matchAll(/^\s*-\s*(https:\/\/cdn\.jsdelivr\.net\/npm\/[^/\s]+@[^/\s]+\/)\S*\s*$/gm),
  ].map((match) => match[1] as string)
  return [...new Set(pinned)]
}

function htmlPages(directory: string): string[] {
  const pages: string[] = []
  for (const entry of readdirSync(directory)) {
    const full = join(directory, entry)
    if (statSync(full).isDirectory()) pages.push(...htmlPages(full))
    else if (entry === 'index.html') pages.push(full)
  }
  return pages.sort()
}

/** Every built textbook page -- the index and each chapter -- as paths relative to baseURL. */
function textbookPages(): string[] {
  return htmlPages(join(LEARN_ROOT, 'textbook')).map((file) => {
    const directory = relative(LEARN_ROOT, join(file, '..')).split(sep).join('/')
    return `learn/${directory}/`
  })
}

/** The first built textbook page that embeds a figure, as a path relative to baseURL. */
function firstFigurePage(): string {
  const textbook = join(LEARN_ROOT, 'textbook')
  const page = htmlPages(textbook).find((file) =>
    readFileSync(file, 'utf-8').includes('class="quviz-figure"'),
  )
  expect(page, `no built page under ${textbook} embeds a quviz-figure`).toBeDefined()
  const directory = relative(LEARN_ROOT, join(page as string, '..')).split(sep).join('/')
  return `learn/${directory}/`
}

test('opens the lab from precomputed static data with no API or off-origin request', async ({
  page,
  baseURL,
  request,
}) => {
  const base = baseOf(baseURL)
  const byFile = keysByFile(await readManifest(request))
  const ledger = watch(page, base)

  const landing = await page.goto('./')
  expect(landing?.status(), 'the lab index under the sub-path').toBe(200)
  expect(landing?.headers()['content-type']).toContain('text/html')
  await sceneReady(page, 'mode=eigenstate|representation=point_cloud|n=2|l=1|m=0|', '|basis=real|')
  await dismissGuide(page)
  await expect(page.locator('canvas')).toHaveCount(1)

  const keys = answeredKeys(ledger, byFile)
  expect(keys, 'the opening point cloud was not answered from its precomputed file').toContain(
    '/api/orbitals/point-cloud?n=2&l=1&m=0&z=1&basis=real&samples=28000&seed=7',
  )
  expect(
    answered(keys, '/api/orbitals/metadata', { n: '2', l: '1', m: '0', basis: 'real' }).length,
  ).toBeGreaterThan(0)
  const binary = ledger.responses.find((response) => new URL(response.url()).pathname.endsWith('.bin'))
  expect(binary?.headers()['content-type']).toBe('application/octet-stream')

  await expect(page.getByRole('link', { name: '查看 OpenAPI' })).toHaveCount(0)
  const textbook = page.getByRole('link', { name: '教材', exact: true })
  await expect(textbook).toBeVisible()
  const target = new URL((await textbook.getAttribute('href')) as string, page.url())
  expect(`${target.origin}${target.pathname}`).toBe(`${base.origin}${base.pathname}learn/`)
  expect((await request.get(target.href)).status()).toBe(200)
  await expect(page.locator('script[src*="/@vite/client"]')).toHaveCount(0)
  expectClean(ledger)
})

test('switches representation using only precomputed files', async ({ page, baseURL, request }) => {
  const base = baseOf(baseURL)
  const byFile = keysByFile(await readManifest(request))
  const ledger = watch(page, base)
  await page.goto('./')
  await sceneReady(page, 'mode=eigenstate|representation=point_cloud|n=2|l=1|m=0|')
  await dismissGuide(page)

  const isosurface = page.locator('button[data-representation="isosurface"]').first()
  await isosurface.click()
  await sceneReady(page, 'mode=eigenstate|representation=isosurface|n=2|l=1|m=0|')
  await expect(isosurface).toHaveAttribute('aria-pressed', 'true')
  const meshes = answered(answeredKeys(ledger, byFile), '/api/orbitals/isosurface', {
    n: '2',
    l: '1',
    m: '0',
    basis: 'real',
  })
  expect(meshes.length, 'the isosurface was not answered from its precomputed file').toBeGreaterThan(0)
  expectClean(ledger)
})

test('explains a combination the static catalog did not precompute instead of failing', async ({
  page,
  baseURL,
}) => {
  const base = baseOf(baseURL)
  const ledger = watch(page, base)
  // n = 5 is a physically valid point cloud (the route accepts n <= 12) inside the lab's
  // n range, but outside StaticCatalogSpec (n_max 4): the capability overlay must refuse
  // it as not_precomputed, say why in Chinese, and fetch nothing for it.
  await page.goto('./#mode=eigenstate&n=5&l=0&m=0&basis=real&rep=point_cloud')
  const status = page.locator(STATUS)
  await expect(status).toHaveAttribute('data-status', 'unavailable', SETTLE)
  await dismissGuide(page)

  // The refusal KIND through D11's tag on the representation row -- `未预计算`, distinct
  // from the physics refusals' 不支持 / 未实现 -- and its wording through the one rule
  // every not_precomputed reason keeps: it opens with NOT_PRECOMPUTED_DETAIL (contracts
  // Amendment 3) and then names the limit, which differs per spec limit. The row's
  // title is the reason verbatim, and the status line must repeat it.
  const row = page.locator('button[data-representation="point_cloud"]').first()
  await expect(row).toHaveAttribute('data-unavailable', 'true')
  await expect(row).toContainText('未预计算')
  const reason = (await row.getAttribute('title')) ?? ''
  expect(
    reason.startsWith(NOT_PRECOMPUTED_OPENING),
    `the refusal reason "${reason}" does not open with "${NOT_PRECOMPUTED_OPENING}"`,
  ).toBe(true)
  expect(reason).not.toContain('/api')
  await expect(status).toContainText(reason)
  await expect(page.locator('[data-scene-ready]:not([data-scene-ready=""])')).toHaveCount(0)
  expect(hashOf(page.url()).get('n'), 'the refused state must stay addressable').toBe('5')
  expectClean(ledger)
})

test('plays the 1s + 2p_z superposition through its precomputed frames and shows the time', async ({
  page,
  baseURL,
  request,
}) => {
  const base = baseOf(baseURL)
  const manifest = await readManifest(request)
  const ledger = watch(page, base)
  await page.goto('./#mode=superposition&preset=1s-2pz&rep=isosurface')
  await sceneReady(page, 'mode=superposition|representation=isosurface|', `|terms=${TERMS_1S_2PZ}`)
  await dismissGuide(page)

  // The static overlay offers the exported frames as ParameterBound.values, so the pill
  // shows a read-only readout and a scrubber over exactly those frames -- never free
  // time entry, which could ask for an instant nobody precomputed.
  const pill = page.locator('section[data-chrome][data-time-kind="oscillating"]:visible')
  await expect(pill).toHaveCount(1)
  await expect(pill.locator('input[data-parameter="timeAu"]'), 'the static lab offers free time entry')
    .toHaveCount(0)
  await expect(pill.locator('input[data-time-scrubber]')).toHaveAttribute(
    'max',
    String(LATTICE_1S_2PZ.length - 1),
  )
  expect(expectOnLattice(await readPill(pill)), 'a preset link starts at t = 0').toBe(0)

  const playback = pill.locator('button[data-control="playback"]')
  await expect(playback).not.toHaveAttribute('aria-disabled', 'true')
  await playback.click()
  await expect(playback).toHaveAttribute('aria-pressed', 'true')

  // While the clock runs, the frames are read off the pill. The hash is no witness
  // here: B10 writes `t` only while paused, because a running clock is not a place
  // to link to and a 420 ms replaceState would trip browser rate limits.
  const readings: PillReading[] = []
  await expect
    .poll(
      async () => {
        readings.push(await readPill(pill))
        return new Set(readings.map((reading) => Number(reading.readout)).filter((t) => t > 0)).size
      },
      { message: 'the time pill never advanced through two frames', timeout: 30_000, intervals: [100] },
    )
    .toBeGreaterThanOrEqual(2)
  expect(hashOf(page.url()).has('t'), 'a playback tick rewrote the hash').toBe(false)
  for (const reading of readings) expectOnLattice(reading)

  // Pause: the pill holds one lattice frame, and the hash now records exactly it.
  await playback.click()
  await expect(playback).toHaveAttribute('aria-pressed', 'false')
  await expect(page.locator(STATUS)).toHaveAttribute('data-status', 'ready', SETTLE)
  const paused = expectOnLattice(await readPill(pill))
  await expect
    .poll(() => hashTime(page), { message: 'the paused instant is not in the hash' })
    .toBe(paused)

  // Step one frame while paused. useFramePrefetch runs only while playing and aborted
  // its warm-up on pause, so the only file this step can fetch is the frame the pill
  // now shows: that response is the provenance of what is on screen. (While playing,
  // the prefetch loads the whole period, which is why no check is made there.)
  const nextIndex = (LATTICE_1S_2PZ.indexOf(paused) + 1) % LATTICE_1S_2PZ.length
  const next = LATTICE_1S_2PZ[nextIndex] as number
  const nextFiles = isosurfaceFrameFiles(manifest, next)
  expect(nextFiles.size, `the manifest has no 1s + 2p_z isosurface for t=${next}`).toBeGreaterThan(0)
  const dataRoot = `${base.pathname}data/`
  const frameFile = page.waitForResponse(
    (response) => {
      const path = new URL(response.url()).pathname
      return path.startsWith(dataRoot) && nextFiles.has(path.slice(dataRoot.length))
    },
    { timeout: 60_000 },
  )
  await pill.locator('button[data-time-step="1"]').click()
  expect((await frameFile).status(), `the precomputed file for t=${next}`).toBe(200)
  await expect(page.locator(STATUS)).toHaveAttribute('data-status', 'ready', SETTLE)
  const stepped = await readPill(pill)
  expect(expectOnLattice(stepped), 'one step is one frame').toBe(next)
  expect(Number(stepped.index)).toBe(nextIndex)
  await expect
    .poll(() => hashTime(page), { message: 'the stepped-to instant is not in the hash' })
    .toBe(next)
  expectClean(ledger)
})

test('restores a deep link and writes state changes back without adding history', async ({
  page,
  baseURL,
  request,
}) => {
  const base = baseOf(baseURL)
  const byFile = keysByFile(await readManifest(request))
  const ledger = watch(page, base)
  const identity = ['mode=eigenstate|representation=isosurface|n=3|l=2|m=0|', '|basis=real|']
  await page.goto('./#mode=eigenstate&n=3&l=2&m=0&basis=real&rep=isosurface')
  await sceneReady(page, ...identity)
  await dismissGuide(page)
  expect(
    answered(answeredKeys(ledger, byFile), '/api/orbitals/isosurface', {
      n: '3',
      l: '2',
      m: '0',
      basis: 'real',
    }).length,
  ).toBeGreaterThan(0)

  const written = hashOf(page.url())
  const expected = { mode: 'eigenstate', n: '3', l: '2', m: '0', basis: 'real', rep: 'isosurface' }
  for (const [key, value] of Object.entries(expected)) {
    expect(written.get(key), `the hash lost ${key}`).toBe(value)
  }
  expect(written.has('embed')).toBe(false)

  await page.reload()
  await sceneReady(page, ...identity)

  const historyLength = await page.evaluate(() => window.history.length)
  await page.locator('button[data-representation="point_cloud"]').first().click()
  await sceneReady(page, 'mode=eigenstate|representation=point_cloud|n=3|l=2|m=0|')
  expect(hashOf(page.url()).get('rep')).toBe('point_cloud')
  expect(await page.evaluate(() => window.history.length), 'a state change pushed history').toBe(
    historyLength,
  )
  expectClean(ledger)
})

test('embed mode drops the lab chrome and links the same state back to the full lab', async ({
  page,
  baseURL,
}) => {
  const base = baseOf(baseURL)
  const ledger = watch(page, base)
  await page.goto('./#embed=1&mode=eigenstate&n=2&l=1&m=0&basis=real&rep=point_cloud')
  await sceneReady(page, 'mode=eigenstate|representation=point_cloud|n=2|l=1|m=0|')
  await expect(page.locator('canvas')).toHaveCount(1)
  await expect(page.getByRole('link', { name: '教材', exact: true })).toHaveCount(0)
  await expect(page.getByRole('navigation', { name: '控制上下文' })).toHaveCount(0)
  await expect(page.getByRole('dialog')).toHaveCount(0)

  const open = page.getByRole('link', { name: '在实验室中打开' })
  await expect(open).toBeVisible()
  await expect(open).toHaveAttribute('target', '_blank')
  const target = new URL((await open.getAttribute('href')) as string, page.url())
  expect(`${target.origin}${target.pathname}`).toBe(`${base.origin}${base.pathname}`)
  const state = hashOf(target.href)
  expect(state.has('embed')).toBe(false)
  const expected = { mode: 'eigenstate', n: '2', l: '1', m: '0', basis: 'real', rep: 'point_cloud' }
  for (const [key, value] of Object.entries(expected)) {
    expect(state.get(key), `the open-in-lab link lost ${key}`).toBe(value)
  }
  expectClean(ledger)
})

test('serves the textbook under learn/ with typeset math and a figure that loads the lab', async ({
  page,
  baseURL,
}) => {
  const base = baseOf(baseURL)
  const ledger = watch(page, base, textbookCdnPrefixes())
  const home = await page.goto('learn/')
  expect(home?.status()).toBe(200)
  expect(await page.locator('.arithmatex').count(), 'the textbook home lost its math')
    .toBeGreaterThan(0)
  await expect(page.locator('.arithmatex:not(:has(mjx-container))')).toHaveCount(0, SETTLE)

  await page.goto(firstFigurePage())
  const figure = page.locator('figure.quviz-figure').first()
  await expect(figure).toBeVisible()
  await expect(figure.locator('iframe'), 'figures load only on request (D12)').toHaveCount(0)

  // The placeholder card's own link, read while the card is showing: loading the figure
  // hides the card, and the embedded lab then offers the link itself (checked below).
  const open = figure.getByRole('link', { name: '在实验室中打开' })
  await expect(open).toBeVisible()
  await expect(open).toHaveAttribute('target', '_blank')
  const lab = new URL((await open.getAttribute('href')) as string, page.url())
  expect(`${lab.origin}${lab.pathname}`).toBe(`${base.origin}${base.pathname}`)
  expect(hashOf(lab.href).has('embed')).toBe(false)

  await figure.getByRole('button', { name: /加载交互图/ }).click()
  const frame = figure.locator('iframe')
  await expect(frame).toHaveCount(1)
  // The load button hides with its card, so focus moves to the close control, which
  // sits under the stage rather than over the lab it embeds.
  const close = figure.getByRole('button', { name: '关闭交互图' })
  await expect(close).toBeFocused()
  const embeddedLab = frame.contentFrame()
  await expect(embeddedLab.locator('[data-scene-ready]:not([data-scene-ready=""])')).toBeAttached(
    SETTLE,
  )

  const embedded = new URL((await frame.getAttribute('src')) as string, page.url())
  expect(`${embedded.origin}${embedded.pathname}`).toBe(`${base.origin}${base.pathname}`)
  const embeddedState = hashOf(embedded.href)
  expect(embeddedState.get('embed')).toBe('1')
  // The iframe opens the card's deep link, plus `embed` and nothing else.
  embeddedState.delete('embed')
  const cardState = Object.fromEntries(hashOf(lab.href))
  expect(Object.fromEntries(embeddedState)).toEqual(cardState)

  // Inside the frame the embedded lab links the same state back to the full lab.
  const reopen = embeddedLab.getByRole('link', { name: '在实验室中打开' })
  await expect(reopen).toBeVisible()
  const fromFrame = new URL((await reopen.getAttribute('href')) as string, embedded.href)
  expect(`${fromFrame.origin}${fromFrame.pathname}`).toBe(`${base.origin}${base.pathname}`)
  expect(Object.fromEntries(hashOf(fromFrame.href))).toEqual(cardState)

  // Nothing on the textbook page covers that link: a pointer at its centre reaches the
  // figure's iframe (the close button used to sit exactly there and turn the click into
  // "close"), and a real click opens the full lab on the same state in a new tab.
  await reopen.scrollIntoViewIfNeeded()
  const box = await reopen.boundingBox()
  expect(box, 'the embedded 在实验室中打开 has no layout box').not.toBeNull()
  const hit = await page.evaluate(
    ({ x, y }) => document.elementFromPoint(x, y)?.className ?? null,
    { x: box!.x + box!.width / 2, y: box!.y + box!.height / 2 },
  )
  expect(hit, 'the textbook page covers the embedded 在实验室中打开').toBe('quviz-figure__frame')
  const opened = page.context().waitForEvent('page')
  await reopen.click({ timeout: 15_000 })
  const fullLab = await opened
  await fullLab.waitForURL((url) => url.hash.length > 1)
  const openedAt = new URL(fullLab.url())
  expect(`${openedAt.origin}${openedAt.pathname}`).toBe(`${base.origin}${base.pathname}`)
  expect(Object.fromEntries(hashOf(openedAt.href))).toEqual(cardState)
  await fullLab.close()

  // Closing unloads the lab and hands focus back to the button that loaded it.
  await close.click()
  await expect(frame).toHaveCount(0)
  await expect(figure.getByRole('button', { name: /加载交互图/ })).toBeFocused()
  expectClean(ledger)
})

test('reflows every textbook page at phone width, long citations included', async ({
  page,
  baseURL,
}) => {
  // Multi-source citations such as "[NIST ..., eq. 18.5.12 ; ...]" were white-space:
  // nowrap and pushed 13 of 15 pages sideways at 390 px (WCAG 1.4.10), and over the
  // table of contents on desktop.
  const base = baseOf(baseURL)
  const ledger = watch(page, base, textbookCdnPrefixes())
  const pages = textbookPages()
  expect(pages.length, 'the textbook index and its fourteen chapters').toBe(15)
  const failures: string[] = []
  for (const path of pages) {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto(path)
    await expect(page.locator('.arithmatex:not(:has(mjx-container))')).toHaveCount(0, SETTLE)
    const phone = await page.evaluate(() => {
      const root = document.documentElement
      return root.scrollWidth > root.clientWidth ? root.scrollWidth : null
    })
    if (phone !== null) failures.push(`${path} at 390 px scrolls sideways to ${phone} px`)

    await page.setViewportSize({ width: 1280, height: 800 })
    const desktop = await page.evaluate(() => {
      const article = document.querySelector('article')?.getBoundingClientRect()
      if (article === undefined) return ['(no article)']
      return [...document.querySelectorAll('.quviz-citation')]
        .filter((citation) =>
          [...citation.getClientRects()].some((line) => line.right > article.right + 0.5),
        )
        .map((citation) => (citation.textContent ?? '').slice(0, 60))
    })
    for (const citation of desktop) failures.push(`${path} at 1280 px: ${citation} crosses the article`)
  }
  expect(failures).toEqual([])
  expectClean(ledger)
})

test('answers only under the repository sub-path, with Pages content types', async ({
  request,
  baseURL,
}) => {
  const base = baseOf(baseURL)
  expect(base.pathname, 'the build was not given a project-site sub-path').not.toBe('/')

  const root = await request.get(`${base.origin}/`, { maxRedirects: 0 })
  expect(root.status()).toBe(302)
  expect(root.headers()['location']).toBe(base.pathname)
  const bare = await request.get(`${base.origin}${base.pathname.slice(0, -1)}`, { maxRedirects: 0 })
  expect(bare.status()).toBe(301)
  expect(bare.headers()['location']).toBe(base.pathname)
  for (const outside of ['/index.html', '/data/manifest.json', '/learn/', '/favicon.svg']) {
    const response = await request.get(`${base.origin}${outside}`, { maxRedirects: 0 })
    expect(response.status(), `${outside} must not be served outside ${base.pathname}`).toBe(404)
  }
  const learn = await request.get('learn', { maxRedirects: 0 })
  expect(learn.status()).toBe(301)
  expect(learn.headers()['location']).toBe(`${base.pathname}learn/`)

  const manifestResponse = await request.get('data/manifest.json')
  expect(manifestResponse.headers()['content-type']).toContain('application/json')
  const manifest = await readManifest(request)
  const binary = Object.values(manifest.entries).find((entry) => entry.file.endsWith('.bin'))
  expect(binary, 'the manifest lists no .bin file').toBeDefined()
  const binaryResponse = await request.get(`data/${(binary as ManifestEntry).file}`)
  expect(binaryResponse.status()).toBe(200)
  expect(binaryResponse.headers()['content-type']).toBe('application/octet-stream')
})
