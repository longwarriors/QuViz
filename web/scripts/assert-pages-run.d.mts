export interface PagesPlaywrightResult {
  status?: string
}

export interface PagesPlaywrightTest {
  status?: string
  results?: PagesPlaywrightResult[]
}

export interface PagesPlaywrightSpec {
  title?: string
  file?: string
  ok?: boolean
  tests?: PagesPlaywrightTest[]
}

export interface PagesPlaywrightSuite {
  title?: string
  file?: string
  specs?: PagesPlaywrightSpec[]
  suites?: PagesPlaywrightSuite[]
}

export interface PagesPlaywrightReport {
  config?: {
    updateSnapshots?: string
    rootDir?: string
    projects?: Array<{ testDir?: string }>
  }
  errors?: unknown[]
  suites?: PagesPlaywrightSuite[]
  stats?: {
    expected?: number
    unexpected?: number
    flaky?: number
    skipped?: number
  }
}

export const REQUIRED_PAGES_TESTS: Readonly<Record<string, readonly string[]>>

export function listPagesSpecFiles(webRoot: string): string[]

export function auditPagesSpecInventory(actualSpecs: readonly string[]): string[]

export function auditPagesRun(report: PagesPlaywrightReport, webRoot: string): string[]
