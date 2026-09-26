/**
 * The static GitHub Pages site, served the way GitHub Pages serves it.
 *
 * This suite needs a COMPLETE static build first: the precomputed scene data takes
 * minutes to render, so it is produced by a full `scripts/build_pages.py` run and then
 * reused. The web server below rebuilds only the lab and the textbook from this
 * checkout (`--skip-data`) and serves build/pages/ under the repository sub-path, and
 * nowhere else. No FastAPI process takes part: a request to /api/ is a defect.
 *
 * Runs on Windows as well as Linux: nothing here is a pixel comparison.
 */
import { defineConfig } from '@playwright/test'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const REPOSITORY_ROOT = fileURLToPath(new URL('..', import.meta.url))
const BUILD_INFO = fileURLToPath(new URL('../build/pages-build.json', import.meta.url))
const MANIFEST = fileURLToPath(new URL('../build/pages/data/manifest.json', import.meta.url))
const PORT = 4180
const ORIGIN = `http://127.0.0.1:${PORT}`

if (!existsSync(MANIFEST) || !existsSync(BUILD_INFO)) {
  throw new Error(
    `npm run test:pages needs a complete static build first: ${MANIFEST} or ${BUILD_INFO} ` +
      'is missing. Run `uv run --locked --no-sync python scripts/build_pages.py` from the ' +
      'repository root once (the precomputed data takes minutes); every later run of this ' +
      'suite rebuilds only the lab and the textbook.',
  )
}

interface BuildInfo {
  readonly format: string
  readonly site_url: string
  readonly base_path: string
}

const info = JSON.parse(readFileSync(BUILD_INFO, 'utf-8')) as BuildInfo
if (
  info.format !== 'quviz-pages-build/1' ||
  !info.base_path.startsWith('/') ||
  !info.base_path.endsWith('/')
) {
  throw new Error(`${BUILD_INFO} is not a quviz-pages-build/1 record: ${JSON.stringify(info)}`)
}

export default defineConfig({
  testDir: 'pages-e2e',
  outputDir: 'test-results/pages',
  timeout: 180_000,
  expect: { timeout: 30_000 },
  retries: 0,
  workers: 1,
  fullyParallel: false,
  forbidOnly: true,
  updateSnapshots: 'none',
  reporter: [
    ['list'],
    ['json', { outputFile: 'test-results/pages/results.json' }],
    ['html', { outputFolder: 'playwright-report/pages', open: 'never' }],
  ],
  use: {
    baseURL: `${ORIGIN}${info.base_path}`,
    browserName: 'chromium',
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 1,
    colorScheme: 'dark',
    locale: 'en-US',
    timezoneId: 'UTC',
    contextOptions: { reducedMotion: 'reduce' },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: {
      args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
    },
  },
  webServer: {
    name: 'QuViz Pages preview',
    command:
      'uv run --locked --no-sync python scripts/build_pages.py --skip-data ' +
      `--site-url ${info.site_url} --serve ${PORT}`,
    cwd: REPOSITORY_ROOT,
    url: `${ORIGIN}${info.base_path}`,
    reuseExistingServer: false,
    timeout: 600_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
})
