/**
 * Build-time request enumerator for the static (GitHub Pages) catalogue.
 *
 * Run with the working directory set to web/ (npm exec keeps the caller's
 * working directory, and this path is relative to web/):
 *
 *   npm --prefix web exec --no -- vite-node tools/static-requests.ts -- <data dir>
 *
 * Reads <data>/spec.json, <data>/catalog-orbitals.json and
 * <data>/catalog-superpositions.json (written by `quviz export-static plan`)
 * and writes <data>/requests.json. All logic lives in
 * src/api/staticEnumeration.ts, which is unit-tested and coverage-gated; this
 * file only touches argv and the file system.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { buildStaticRequestsFile } from '../src/api/staticEnumeration'

const dataArgument = process.argv[2]
if (dataArgument === undefined || dataArgument === '') {
  console.error('用法：npm --prefix web exec --no -- vite-node tools/static-requests.ts -- <data 目录>')
  process.exit(2)
}
const dataDir = resolve(dataArgument)
const readJson = (name: string): unknown => JSON.parse(readFileSync(resolve(dataDir, name), 'utf-8')) as unknown

const file = buildStaticRequestsFile(
  readJson('spec.json'),
  readJson('catalog-orbitals.json'),
  readJson('catalog-superpositions.json'),
)
const target = resolve(dataDir, 'requests.json')
writeFileSync(target, `${JSON.stringify(file, null, 2)}\n`, 'utf-8')
console.log(`static-requests: 写出 ${file.requests.length} 个请求 -> ${target}`)
