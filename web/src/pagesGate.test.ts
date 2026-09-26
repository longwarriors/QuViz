/**
 * `npm run test:pages` exiting zero is not proof that the Pages suite ran. These tests
 * hold the post-run JSON auditor to the empty, skipped, duplicated, missing, extra and
 * malformed shapes Playwright itself accepts as a successful invocation.
 */
import { spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import {
  REQUIRED_PAGES_TESTS,
  auditPagesRun,
  auditPagesSpecInventory,
  listPagesSpecFiles,
} from '../scripts/assert-pages-run.mjs'
import type { PagesPlaywrightReport, PagesPlaywrightSpec } from '../scripts/assert-pages-run.mjs'

const WEB_ROOT = fileURLToPath(new URL('..', import.meta.url))
const REQUIRED_SPEC = 'pages-e2e/site.spec.ts'
const REPORTED_SPEC = 'site.spec.ts'
const REVIEWED_TITLES = [
  'opens the lab from precomputed static data with no API or off-origin request',
  'switches representation using only precomputed files',
  'explains a combination the static catalog did not precompute instead of failing',
  'plays the 1s + 2p_z superposition through its precomputed frames and shows the time',
  'restores a deep link and writes state changes back without adding history',
  'embed mode drops the lab chrome and links the same state back to the full lab',
  'serves the textbook under learn/ with typeset math and a figure that loads the lab',
  'reflows every textbook page at phone width, long citations included',
  'answers only under the repository sub-path, with Pages content types',
]

function passingSpec(title: string): PagesPlaywrightSpec {
  return {
    title,
    file: REPORTED_SPEC,
    ok: true,
    tests: [{ status: 'expected', results: [{ status: 'passed' }] }],
  }
}

function passingReport(): PagesPlaywrightReport {
  return {
    config: {
      updateSnapshots: 'none',
      rootDir: join(WEB_ROOT, 'pages-e2e'),
      projects: [{ testDir: join(WEB_ROOT, 'pages-e2e') }],
    },
    errors: [],
    suites: [
      { title: REPORTED_SPEC, file: REPORTED_SPEC, specs: REVIEWED_TITLES.map(passingSpec) },
    ],
    stats: { expected: REVIEWED_TITLES.length, unexpected: 0, flaky: 0, skipped: 0 },
  }
}

function specs(report: PagesPlaywrightReport): PagesPlaywrightSpec[] {
  return report.suites![0]!.specs!
}

function first(report: PagesPlaywrightReport): PagesPlaywrightSpec {
  return specs(report)[0]!
}

describe('assert-pages-run: passing shape and inventory', () => {
  it('pins exactly the reviewed titles of the one Pages spec', () => {
    expect(Object.keys(REQUIRED_PAGES_TESTS)).toEqual([REQUIRED_SPEC])
    expect(REQUIRED_PAGES_TESTS[REQUIRED_SPEC]).toEqual(REVIEWED_TITLES)
  })

  it('accepts one passing execution of every required test', () => {
    expect(auditPagesRun(passingReport(), WEB_ROOT)).toEqual([])
  })

  it('accepts both reporter path spellings for the same bound test root', () => {
    const report = passingReport()
    for (const spec of specs(report)) spec.file = REQUIRED_SPEC
    expect(auditPagesRun(report, WEB_ROOT)).toEqual([])
    for (const spec of specs(report)) spec.file = REQUIRED_SPEC.replaceAll('/', '\\')
    expect(auditPagesRun(report, WEB_ROOT)).toEqual([])
  })

  it('binds the on-disk Pages suite to the closed manifest', () => {
    const discovered = listPagesSpecFiles(WEB_ROOT)
    expect(discovered).toEqual([REQUIRED_SPEC])
    expect(auditPagesSpecInventory(discovered)).toEqual([])
  })

  it('rejects a missing, duplicated, or unmanifested spec file', () => {
    expect(auditPagesSpecInventory([]).join('\n')).toContain('found 0 time(s)')
    expect(auditPagesSpecInventory([REQUIRED_SPEC, REQUIRED_SPEC]).join('\n')).toContain(
      'found 2 time(s)',
    )
    expect(
      auditPagesSpecInventory([REQUIRED_SPEC, 'pages-e2e/extra.spec.ts']).join('\n'),
    ).toContain('unmanifested Pages spec')
  })
})

const reportMutations: ReadonlyArray<
  readonly [string, (report: PagesPlaywrightReport) => void, string]
> = [
  ['snapshot-update mode', (report) => (report.config!.updateSnapshots = 'all'), 'updateSnapshots'],
  [
    'a same-named spec from another test root',
    (report) => {
      report.config!.rootDir = join(WEB_ROOT, 'e2e')
      report.config!.projects = [{ testDir: join(WEB_ROOT, 'e2e') }]
    },
    'config.rootDir',
  ],
  ['a top-level runner error', (report) => report.errors!.push('boom'), 'top-level error'],
  [
    'zero collected suites',
    (report) => {
      report.suites = []
      report.stats = { expected: 0, unexpected: 0, flaky: 0, skipped: 0 }
    },
    '0 test execution(s)',
  ],
  ['the wrong spec path', (report) => (first(report).file = 'other/site.spec.ts'), 'unmanifested test'],
  ['a renamed required title', (report) => (first(report).title = 'renamed'), 'unmanifested test'],
  [
    'a required test missing from the report',
    (report) => {
      specs(report).pop()
      report.stats!.expected = REVIEWED_TITLES.length - 1
    },
    'found 0 report entry',
  ],
  [
    'a duplicated required test',
    (report) => {
      specs(report).push(passingSpec(REVIEWED_TITLES[0]!))
      report.stats!.expected = REVIEWED_TITLES.length + 1
    },
    'found 2 report entry',
  ],
  ['a non-passing spec', (report) => (first(report).ok = false), 'did not pass'],
  ['no test execution', (report) => (first(report).tests = []), 'ran 0 execution(s)'],
  [
    'a skipped test',
    (report) => {
      first(report).tests![0]!.status = 'skipped'
      first(report).tests![0]!.results = [{ status: 'skipped' }]
      report.stats = { expected: REVIEWED_TITLES.length - 1, unexpected: 0, flaky: 0, skipped: 1 }
    },
    'test status is "skipped"',
  ],
  ['no attempt result', (report) => (first(report).tests![0]!.results = []), 'produced 0 result(s)'],
  [
    'a failed attempt',
    (report) => {
      first(report).tests![0]!.status = 'unexpected'
      first(report).tests![0]!.results = [{ status: 'failed' }]
      report.stats = { expected: REVIEWED_TITLES.length - 1, unexpected: 1, flaky: 0, skipped: 0 }
    },
    'result status is "failed"',
  ],
  [
    'two project executions',
    (report) => first(report).tests!.push({ status: 'expected', results: [{ status: 'passed' }] }),
    'ran 2 execution(s)',
  ],
  [
    'two retry results',
    (report) => first(report).tests![0]!.results!.push({ status: 'passed' }),
    'produced 2 result(s)',
  ],
  ['missing summary statistics', (report) => (report.stats = undefined), 'stats.expected'],
  [
    'a malformed suite tree',
    (report) => (report.suites = [null as unknown as NonNullable<typeof report.suites>[number]]),
    '0 test execution(s)',
  ],
  [
    'an extra passing test',
    (report) => {
      specs(report).push(passingSpec('unreviewed extra'))
      report.stats!.expected = REVIEWED_TITLES.length + 1
    },
    'unmanifested test',
  ],
]

describe('assert-pages-run: rejected report shapes', () => {
  it.each(reportMutations)('rejects %s', (_label, mutate, expectedProblem) => {
    const report = passingReport()
    mutate(report)
    expect(auditPagesRun(report, WEB_ROOT).join('\n')).toContain(expectedProblem)
  })
})

describe('assert-pages-run: command exit code', () => {
  const script = fileURLToPath(new URL('../scripts/assert-pages-run.mjs', import.meta.url))

  function run(report: PagesPlaywrightReport) {
    const directory = mkdtempSync(join(tmpdir(), 'quviz-pages-gate-'))
    const reportPath = join(directory, 'report.json')
    writeFileSync(reportPath, JSON.stringify(report), 'utf-8')
    return spawnSync(process.execPath, [script, reportPath], { encoding: 'utf-8' })
  }

  it('returns zero for a complete passing report', () => {
    const result = run(passingReport())
    expect(result.status).toBe(0)
    expect(result.stdout).toContain('required Pages tests ran exactly once')
  })

  it('returns nonzero for a green-but-empty report', () => {
    const report = passingReport()
    report.suites = []
    report.stats = { expected: 0, unexpected: 0, flaky: 0, skipped: 0 }
    const result = run(report)
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('0 test execution(s)')
  })

  it('returns nonzero when Playwright wrote no report', () => {
    const missing = join(mkdtempSync(join(tmpdir(), 'quviz-pages-gate-')), 'missing.json')
    const result = spawnSync(process.execPath, [script, missing], { encoding: 'utf-8' })
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('wrote no JSON report')
  })
})
