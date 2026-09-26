# Part B — Web Data Layer (Transport, Static Catalogue, Deep Links, Pages Build) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the React lab one data seam that answers either from the live FastAPI server (`quviz serve`, unchanged bytes on the wire) or from a precomputed static catalogue (GitHub Pages), plus hash deep links with an embed flag, a `pages` build mode, and a build-time enumerator that lists exactly the requests the running static site will make.

**Architecture:** Every API request becomes `getTransport().request(route, query, signal)`; the query is built by pure functions in `src/api/requests.ts` that reproduce today's `client.ts` spelling byte for byte. One dispatch (`sceneCallFor`) feeds both the fetchers (`executeSceneRequest`) and the request enumeration (`requestsForPlan`), so the static catalogue is built from the same code that later reads it. `src/api/staticCatalog.ts` validates `data/manifest.json` and turns it into a `Transport` that synthesises real WHATWG `Response`s (including the `x-quviz-*` headers QVPC needs). A static overlay inside `capability.ts` pins every tunable to the exported value, narrows planes/observables, offers the exported playback frames as `ParameterBound.values`, and refuses anything the manifest lacks with the new refusal `not_precomputed`. `src/state/urlState.ts` binds `location.hash` to the zustand store with `history.replaceState`. `src/main.tsx` installs the static layer before the first render when `import.meta.env.MODE === 'pages'`. B1–B13 run in Part B's own worktree against the pre-A tree; B14 merges Part B onto Part A (conflict union, and deep links pass Part A's `default_representation`), B15 pins the web `spec.json` fixture to Part A's `DEFAULT_SPEC`, and B16 runs every gate on the merged tree before Part D starts.

**Tech Stack:** TypeScript 5.9 (strict, `noUnusedLocals`/`noUnusedParameters`), React 19, zustand 5, Vite 8.2.1, vite-node 3.2.4 (already in `web/node_modules` as a vitest dependency — verified `web/node_modules/.bin/vite-node`, no new npm dependency), vitest 3.2 (node + per-file jsdom 30, v8 coverage).

**Spec:** `design/specs/2026-09-25-pages-textbook-lab-design.md` (§3 D1–D4, §4.3, §5 rows "DEFAULT_PLAYBACK_PERIOD_AU" and "发布 6 MB sourcemap", §5 row 1 "2s+2p_z" for deep links after the merge with Part A, §6 "Web 单测", §7 row 1, §8 step 2 "合并 A+B+C，跑受影响门禁" for the A+B half) and the binding contracts `design/plans/2026-09-25-contracts.md` ("B produces", "B → A/E", "A → B/E", "Shared commands").

## Global Constraints

- **Working directory.** Run `git`, `uv` and `npm --prefix web run …` from the repository root. Run every `vitest`, `tsc -p` and `vite-node` command **with the working directory `web/`**. `npm --prefix web exec` keeps the caller's working directory (verified: from the repo root it runs in the repo root, so `tools/…` would not resolve and vitest would miss `web/vitest.config.ts`), and several specs resolve fixtures from `process.cwd()` (e.g. `web/src/components/useSceneAsset.test.tsx:104`). The plan therefore writes `(cd web && npm exec --no -- vitest run <spec>)`. The contract command `npm --prefix web exec --no -- vite-node tools/static-requests.ts -- <data>` works when run from `web/` (verified: npm still finds the bin and the command runs in `web/`).
- **No new npm dependencies** (local Node v24.14.1 fails `engine-strict`; `npm run`/`npm exec` work). No new `.d.ts`, `.js`, `.mjs`, `.mts` under `web/src/`. `web/scripts/` stays exactly the 13 files pinned by `tests/test_check_script.py:1844-1912` — Part B adds nothing there.
- **Coverage latch.** Every new `web/src` module is added in the task that creates it to **both** arrays of `web/coverage-scope.json`, in JavaScript default sort order (`[...files].sort()`, pinned by `web/src/guards.test.ts:1047-1068`), and must reach 90/85/90/90 per file (`web/vitest.config.ts:109`). New gated modules in this part: `src/api/transport.ts`, `src/api/requests.ts`, `src/api/runtimeMode.ts`, `src/api/staticCatalog.ts`, `src/api/staticEnumeration.ts`, `src/state/urlState.ts`. `tools/static-requests.ts` lives outside `src/` (not gated) and holds only file-system I/O.
- **Zero skips, xfail_strict, no `.only`.** No `it.skip`/`describe.skip`/`it.todo`/conditional tests anywhere (`web/src/guards.test.ts` scans; `scripts/assert-no-skips.mjs` audits the run). No vitest `-t` filters in committed scripts.
- **Wire bytes are frozen.** Every exact-URL assertion that exists today stays green unmodified: `web/src/api/client.test.ts:205-211, 419-422, 447-449, 526-528, 608-610, 663-665, 745-747, 859-862`, the `startsWith('/api/…')` checks in `web/src/components/useSceneAsset.test.tsx:441, 534, 580, 608` and `web/src/components/OrbitalCanvas.test.tsx:414-419`. `liveTransport` calls the **global** `fetch` at call time with `(requestString, { signal })` so `vi.stubGlobal('fetch', …)` keeps working.
- **Do not touch presentation components** (`App.tsx`, `ControlPanel.tsx`, `Header.tsx`, `Inspector.tsx`, `Legend.tsx`, `LoadingOverlay.tsx`, `OrbitalCanvas.tsx`, `src/scene/**`, CSS). Part B edits only data modules (`src/api/**`, `src/state/**`, `src/components/sceneRequest.ts`, `src/components/useSceneAsset.ts`), `src/main.tsx`, their specs, `vite.config.ts`, `tsconfig*.json`, `package.json`, `coverage-scope.json`, `src/guards.test.ts` (one added pin), and the new `web/tools/`.
- **`EIGENSTATE_S_SLICE_FLOORS`** (`web/src/api/capability.ts:344-350`) stays byte-identical; `tests/test_slice_builders.py:178-190` regex-parses it.
- **Decision — runtime validators for the five unchecked payloads (`client.ts:198, 211, 222, 279, 307`): not added in Part B.** Not cheap: each needs a hand-written validator of 15–40 fields and the existing specs feed partial payloads (`client.test.ts:284, 377, 581`; `useSceneAsset.test.tsx:205-244`; `OrbitalCanvas.test.tsx` fixtures), so every fixture would have to grow. The risk they mitigate (a stale exporter) is bounded by construction here: the static bodies are the server's own bytes replayed through the same ASGI app, the manifest is content-versioned, and Part E's pages-e2e renders them. Recorded as an open follow-up.
- **Pre-commit gate (CLAUDE.md "提交前").** Every task that commits a change under `web/` runs `npm --prefix web run test` **and** `npm --prefix web run typecheck` immediately before its commit (the step is written out in each task; targeted vitest runs during the task do not replace it). Tasks that touch the front-end↔back-end connection or the app's startup (B3 transport routing, B5 relative `base`, B11 bootstrap, B14 merge) also run `npm --prefix web run test:fullstack`. B5 edits `web/package.json` and `web/src/guards.test.ts`, which Python pins read, so it also runs `tests/test_check_script.py` and `tests/test_declared_versions.py`. Commits that bring in or change Python (B14 merge, B15) run the Python gate `uv run --locked --group docs pytest --cov=quviz --cov-report=term-missing` (fail_under 85) plus ruff and mypy. `npm --prefix web run test:visual` is Linux/Docker-only (`web/playwright.config.ts:50-58`) and is run by Part E; each task that would otherwise need it says so.
- **Commits.** One commit per task, conventional subject, a blank line, then `Claude-Session: https://claude.ai/code/session_01E44DEzsc7Av26fc7nZ5rSo`. `git add` only the listed paths.
- **Canonical wording for `not_precomputed`.** The only user-visible sentence for "the static catalogue does not hold this" is `NOT_PRECOMPUTED_DETAIL` = `静态教材版未预计算这一组合。本地运行 quviz serve 可实时计算任意参数。` (contract text). Every `not_precomputed` reason **starts with it verbatim**; a refusal the specification explains appends one sentence naming the limit (`目录只收录 n ≤ 4 的本征态；当前态 n = 5。`), and a planner miss is the sentence alone (`STATIC_MISS_REASON === NOT_PRECOMPUTED_DETAIL`). The static transport's 404 `detail` is the same sentence. So Part C's chapter 0 may quote it verbatim, Part D's status chip (`{表示法}暂不可用 · {reason}`) always shows it, and Part E's `toContainText('未预计算')` holds. It is defined in `capability.ts` (B7) and re-exported from `staticCatalog.ts`, where the contract names it, because `capability.ts` may import `staticCatalog.ts` only for types.
- **Parallel edits by Part A (same files, other worktree).** Part B is written against the pre-A tree; Part A edits these B-shared files in parallel: `web/src/api/client.ts` (A10: `SuperpositionDefaultRepresentation` in the `import type {…} from './types'` list at lines 9-24, a helper above `parseSuperpositionPreset`, and the field check inside it, 110-167), `web/src/api/client.test.ts` (A10: fixture 507-518, tests after 562), `web/src/api/types.ts` (A8: `OrbitalMetadata` 44-58 and end of file; A10: after 171), `web/src/state/useSceneStore.ts` (A11: imports 5-11, interface 15-106, `ALWAYS_AVAILABLE` doc 174-184, `openingRepresentation` after 226, defaults/`setMode`/`setSuperposition`/`syncSuperpositionCapabilities` 229-363), `web/src/state/useSceneStore.test.ts` (A11: calls at 370-498, one `describe` appended), `web/src/components/ControlPanel{,.test}.tsx` (A11 only), `web/src/api/schema.gen.ts` and `tests/fixtures/visual/catalog-superposition.json` (A10 regenerates; every entry gains `default_representation`, `"slice"` only for `2s-2pz`). A11 makes `setSuperposition`'s fifth argument (`defaultRepresentation`) required. Task B14 performs the merge: two textual conflicts (the `client.ts` import block, the end of `useSceneStore.test.ts`) and one semantic one (B10's four-argument `setSuperposition` call), all resolved there and verified on the merged tree before Part D starts.

## Review Focus

1. **Byte identity of live requests** (Tasks B2–B4): builders must reproduce `client.ts`'s `URLSearchParams` order and `String(value)` spelling; the anti-drift spec in B4 compares what `executeSceneRequest` fetches with what `requestsForPlan` enumerates for all seven cells.
2. **Static transport fidelity** (B7): hit → real `Response` with the stored status and `content-type` + `x-quviz-*` headers (QVPC decodes); miss → 404 JSON `detail` surfaced by the existing `responseError`; abort honoured before and after the file read.
3. **Overlay layering** (B8): physics/route refusals first (reworded without `/api/…`), then spec refusals (`not_precomputed`), then pinning; the planner refuses any concrete request the manifest lacks. The round-trip spec in B12 proves the runtime planner hits exactly the enumerated keys.
4. **No new network traffic on a plain page load** (B10–B11): `bindUrlState` fetches the superposition catalogue only for a preset link when none is known. The visual gate's served-fixture multiset (`web/e2e/slice.spec.ts:559-562`) is exact, so a second catalogue request would break it.
5. **`base: './'`** (B5) must keep the FastAPI `/` mount (fullstack gate) and the Pages sub-path working; run `npm --prefix web run test:fullstack` in B13.
6. **Import graph has no runtime cycle:** `capability.ts → requests.ts, transport.ts` (runtime) and `→ staticCatalog.ts` (type only); `staticCatalog.ts → capability.ts, transport.ts, sliceContract.ts`; `requests.ts → capability.ts` (type only).
7. **`nextTimeAu(time, periodAu)`** loses its default (spec §5); every caller passes a period.
8. **One `not_precomputed` sentence** (B7, B8, B9): every refusal of that kind starts with `NOT_PRECOMPUTED_DETAIL`, pinned in `capability.static.test.ts` over all five specification limits and the planner miss, and end to end in `useSceneAsset.test.tsx`.
9. **The merge with Part A** (B14): conflicts resolved as the union of both sides; `applyDeepLink` passes `preset.default_representation`, so a `#…preset=2s-2pz` link opens the slice (spec §5 row 1) instead of the 422 isosurface; `npm run test`, `typecheck` and `test:fullstack` pass on the merged tree before Part D starts. B15 ties the hand-copied `web/tools/fixtures/spec.json` to Part A's `DEFAULT_SPEC` byte for byte.

---

### Task B1: Transport seam

**Files:**
- Create: `web/src/api/transport.ts`
- Test: `web/src/api/transport.test.ts`
- Modify: `web/coverage-scope.json` (line 2 `$comment` wording; `coverageGated` lines 3-34; `pragmaScanned` lines 35-68)

**Interfaces:**
- Consumes: global `fetch` (read at call time).
- Produces (contract "B produces"):
  - `export interface Transport { request(route: string, query: URLSearchParams | null, signal?: AbortSignal): Promise<Response> }`
  - `export function requestKey(route: string, query: URLSearchParams | null): string`
  - `export const liveTransport: Transport`
  - `export function getTransport(): Transport`
  - `export function setTransport(transport: Transport): void`
  - `export function resetTransport(): void`

- [ ] **Step 1: Write the failing test** — create `web/src/api/transport.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  getTransport,
  liveTransport,
  requestKey,
  resetTransport,
  setTransport,
  type Transport,
} from './transport'

afterEach(() => {
  vi.unstubAllGlobals()
  resetTransport()
})

describe('requestKey', () => {
  it('is the bare route when there is no query', () => {
    expect(requestKey('/api/orbitals/catalog', null)).toBe('/api/orbitals/catalog')
  })

  it('adds no "?" for an empty query, so a catalogue request has one key', () => {
    expect(requestKey('/api/orbitals/catalog', new URLSearchParams())).toBe('/api/orbitals/catalog')
  })

  it('keeps insertion order and URLSearchParams encoding', () => {
    const query = new URLSearchParams()
    query.set('terms', '1,0,0,0.5;2,1,0,0.5')
    query.set('time', '0.6')
    expect(requestKey('/api/superposition/slice', query)).toBe(
      '/api/superposition/slice?terms=1%2C0%2C0%2C0.5%3B2%2C1%2C0%2C0.5&time=0.6',
    )
  })
})

describe('liveTransport', () => {
  it('reads the global fetch at call time and sends the literal request with { signal }', async () => {
    const answer = new Response('ok')
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(answer)
    // Stubbed AFTER the module loaded: a reference captured at import would miss this.
    vi.stubGlobal('fetch', fetchMock)
    const controller = new AbortController()
    const query = new URLSearchParams([
      ['n', '1'],
      ['l', '0'],
    ])

    await expect(
      liveTransport.request('/api/orbitals/metadata', query, controller.signal),
    ).resolves.toBe(answer)
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith('/api/orbitals/metadata?n=1&l=0', {
      signal: controller.signal,
    })
  })

  it('passes { signal: undefined } without a signal, as the ten client.ts call sites did', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response('ok'))
    vi.stubGlobal('fetch', fetchMock)

    await liveTransport.request('/api/orbitals/catalog', null)

    expect(fetchMock.mock.calls[0][0]).toBe('/api/orbitals/catalog')
    expect(fetchMock.mock.calls[0][1]).toStrictEqual({ signal: undefined })
  })

  it('propagates a network failure unchanged', async () => {
    const failure = new TypeError('fetch failed')
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockRejectedValue(failure))
    await expect(liveTransport.request('/api/orbitals/catalog', null)).rejects.toBe(failure)
  })
})

describe('the installed transport', () => {
  it('is the live one by default, can be replaced, and resetTransport restores it', () => {
    expect(getTransport()).toBe(liveTransport)
    const other: Transport = {
      request: () => Promise.resolve(new Response(null, { status: 404 })),
    }
    setTransport(other)
    expect(getTransport()).toBe(other)
    resetTransport()
    expect(getTransport()).toBe(liveTransport)
  })
})
```

- [ ] **Step 2: Run it and see it fail**

Run: `(cd web && npm exec --no -- vitest run src/api/transport.test.ts)`
Expected: FAIL — `Failed to resolve import "./transport" from "src/api/transport.test.ts". Does the file exist?`

- [ ] **Step 3: Implement** — create `web/src/api/transport.ts`:

```ts
/**
 * The one door every API request leaves through.
 *
 * `client.ts` used to call `fetch('/api/...')` at ten sites, so the only way to
 * answer a request without a server was to stub the global. A transport makes
 * that door explicit: the live one issues exactly the request the ten sites
 * issued (same string, same `{ signal }` init), and the static one
 * (src/api/staticCatalog.ts) answers from a precomputed catalogue with a real
 * WHATWG `Response`, so every decoder downstream -- QVPC, the slice contract,
 * FastAPI error unwrapping -- runs unchanged in both modes.
 */
export interface Transport {
  request(route: string, query: URLSearchParams | null, signal?: AbortSignal): Promise<Response>
}

/**
 * The literal request string: `route`, or `route?query` in insertion order.
 *
 * It is also the static catalogue's lookup key, so it is spelled here once. An
 * empty query adds no `?`: the catalogue routes carry none, and `route?` would
 * be a second key for the same request.
 */
export function requestKey(route: string, query: URLSearchParams | null): string {
  const search = query === null ? '' : query.toString()
  return search === '' ? route : `${route}?${search}`
}

/**
 * `fetch` is looked up on every call rather than captured at import: specs
 * replace the global with `vi.stubGlobal` after this module has loaded, and a
 * captured reference would reach the network instead.
 */
export const liveTransport: Transport = {
  request(route, query, signal) {
    return fetch(requestKey(route, query), { signal })
  },
}

let current: Transport = liveTransport

export function getTransport(): Transport {
  return current
}

/** Install another transport: the static bootstrap in src/main.tsx, and specs. */
export function setTransport(transport: Transport): void {
  current = transport
}

export function resetTransport(): void {
  current = liveTransport
}
```

Then edit `web/coverage-scope.json`:
- In the `$comment` string (line 2) replace `It is not the only pin on today's 30 modules:` with `It is not the only pin on the gated modules:` and replace `-- 32 entries, the 30 gated modules plus src/api/types.ts and src/api/schema.gen.ts, the two excluded modules,` with `-- the gated modules plus src/api/types.ts and src/api/schema.gen.ts, the two excluded modules,` (the counts go stale with every part; nothing reads them).
- In `coverageGated` insert `"src/api/transport.ts",` directly after `"src/api/sliceContract.ts",` (line 8).
- In `pragmaScanned` insert `"src/api/transport.ts",` directly after `"src/api/sliceContract.ts",` (line 41, before `"src/api/types.ts",`).

- [ ] **Step 4: Run and see it pass**

Run: `(cd web && npm exec --no -- vitest run src/api/transport.test.ts src/guards.test.ts)`
Expected: PASS (transport: 7 tests; guards green, including `coverage-gates exactly the modules coverage-scope.json lists` and `keeps coverage-scope.json sorted, duplicate-free, and a superset chain`).

Coverage spot check: `(cd web && npm exec --no -- vitest run src/api/transport.test.ts --coverage --coverage.thresholds.perFile=false --coverage.thresholds.statements=0 --coverage.thresholds.branches=0 --coverage.thresholds.functions=0 --coverage.thresholds.lines=0) | grep -E "transport\.ts"`
Expected: the `transport.ts` row reads `100 | 100 | 100 | 100`.

- [ ] **Step 5: Pre-commit gate (CLAUDE.md "提交前")**

Run: `npm --prefix web run test`
Expected: exit 0 — the pinned chain (`clean-coverage`, `tsc -p tsconfig.test.json --noEmit`, vitest with coverage, `assert-no-skips`, `assert-coverage-scope`) passes with 0 skipped and 0 todo, and every module in `web/coverage-scope.json` is at ≥ 90/85/90/90.

Run: `npm --prefix web run typecheck`
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add web/src/api/transport.ts web/src/api/transport.test.ts web/coverage-scope.json
git commit -m "$(cat <<'EOF'
feat(web): add the transport seam for API requests

Claude-Session: https://claude.ai/code/session_01E44DEzsc7Av26fc7nZ5rSo
EOF
)"
```

---

### Task B2: Pure request formation (`requests.ts` builders)

**Files:**
- Create: `web/src/api/requests.ts`
- Test: `web/src/api/requests.test.ts`
- Modify: `web/coverage-scope.json` (`coverageGated` after `"src/api/qvpc.ts"`; `pragmaScanned` after `"src/api/qvpc.ts"`)

**Interfaces:**
- Consumes: `requestKey` (tests only), types from `web/src/api/types.ts`.
- Produces (contract): `ApiRequest`, `OrbitalRequestState`, `pointCloudRequest`, `metadataRequest`, `isosurfaceRequest`, `currentFieldRequest`, `sliceRequest`, `superpositionIsosurfaceRequest`, `superpositionCurrentFieldRequest`, `superpositionSliceRequest`, `ORBITAL_CATALOG_REQUEST`, `SUPERPOSITION_CATALOG_REQUEST`, with exactly the contract signatures:

```ts
export interface ApiRequest { route: string; query: URLSearchParams | null }
export type OrbitalRequestState = OrbitalParameters
export function pointCloudRequest(o: OrbitalRequestState, samples: number, seed: number): ApiRequest
export function metadataRequest(o: OrbitalRequestState): ApiRequest
export function isosurfaceRequest(o: OrbitalRequestState, resolution: number, probabilityMass: number): ApiRequest
export function currentFieldRequest(o: OrbitalRequestState, seedCount: number): ApiRequest
export function sliceRequest(o: OrbitalRequestState, resolution: number, aMu: number, plane: PrincipalPlane, observable: SliceObservable): ApiRequest
export function superpositionIsosurfaceRequest(terms: string, basis: BasisKind, z: number, aMu: number, timeAu: number, resolution: number, probabilityMass: number): ApiRequest
export function superpositionCurrentFieldRequest(terms: string, basis: BasisKind, z: number, aMu: number, timeAu: number, seedCount: number): ApiRequest
export function superpositionSliceRequest(terms: string, basis: BasisKind, z: number, aMu: number, timeAu: number, resolution: number, plane: PrincipalPlane, observable: SliceObservable): ApiRequest
export const ORBITAL_CATALOG_REQUEST: ApiRequest
export const SUPERPOSITION_CATALOG_REQUEST: ApiRequest
```
  Plus route constants `ORBITAL_POINT_CLOUD_ROUTE`, `ORBITAL_METADATA_ROUTE`, `ORBITAL_ISOSURFACE_ROUTE`, `ORBITAL_CURRENT_FIELD_ROUTE`, `ORBITAL_SLICE_ROUTE`, `ORBITAL_CATALOG_ROUTE`, `SUPERPOSITION_ISOSURFACE_ROUTE`, `SUPERPOSITION_CURRENT_FIELD_ROUTE`, `SUPERPOSITION_SLICE_ROUTE`, `SUPERPOSITION_CATALOG_ROUTE`.

Query orders reproduced from today's `web/src/api/client.ts` (`queryString` at 32-36 iterates object-literal insertion order with `String(value)`):
point-cloud `{...params, samples, seed}` (175); isosurface `{...params, resolution, probability_mass}` (193); current-field `{...params, seed_count}` (206); metadata `params` (218); superposition isosurface `{terms, time, resolution, basis, z, a_mu, probability_mass}` (266-274); superposition current `{terms, time, seed_count, basis, z, a_mu}` (302); slice `{...params, resolution, a_mu, plane, observable}` (380); superposition slice `{terms, time, resolution, basis, z, a_mu, plane, observable}` (401-410). `params` is always `{ n, l, m, z, basis }` in that order (`useSceneStore.ts:108-118` builds it).

- [ ] **Step 1: Write the failing test** — create `web/src/api/requests.test.ts`:

```ts
import { describe, expect, it } from 'vitest'

import { CAPABILITY_ROUTE_CONSTRAINTS } from './capability'
import {
  currentFieldRequest,
  isosurfaceRequest,
  metadataRequest,
  ORBITAL_CATALOG_REQUEST,
  ORBITAL_CURRENT_FIELD_ROUTE,
  ORBITAL_ISOSURFACE_ROUTE,
  ORBITAL_POINT_CLOUD_ROUTE,
  ORBITAL_SLICE_ROUTE,
  pointCloudRequest,
  sliceRequest,
  SUPERPOSITION_CATALOG_REQUEST,
  SUPERPOSITION_CURRENT_FIELD_ROUTE,
  SUPERPOSITION_ISOSURFACE_ROUTE,
  SUPERPOSITION_SLICE_ROUTE,
  superpositionCurrentFieldRequest,
  superpositionIsosurfaceRequest,
  superpositionSliceRequest,
  type ApiRequest,
} from './requests'
import { requestKey } from './transport'
import type { OrbitalParameters } from './types'

const key = (request: ApiRequest): string => requestKey(request.route, request.query)

const orbital: OrbitalParameters = { n: 3, l: 2, m: -1, z: 2, basis: 'complex' }

/** The terms string client.test.ts pins, and its encoded form. */
const terms = '2,0,0:1+0j;2,1,0:0+1j'
const encodedTerms = encodeURIComponent(terms).replace(/%20/g, '+')

describe('eigenstate request formation: the strings client.test.ts pins today', () => {
  it('point cloud (client.test.ts:205-208)', () => {
    expect(key(pointCloudRequest({ n: 1, l: 0, m: 0, z: 1, basis: 'real' }, 1000, 5))).toBe(
      '/api/orbitals/point-cloud?n=1&l=0&m=0&z=1&basis=real&samples=1000&seed=5',
    )
  })

  it('metadata (client.test.ts:419-422)', () => {
    expect(key(metadataRequest(orbital))).toBe('/api/orbitals/metadata?n=3&l=2&m=-1&z=2&basis=complex')
  })

  it('isosurface', () => {
    expect(key(isosurfaceRequest(orbital, 65, 0.9))).toBe(
      '/api/orbitals/isosurface?n=3&l=2&m=-1&z=2&basis=complex&resolution=65&probability_mass=0.9',
    )
  })

  it('current field', () => {
    expect(key(currentFieldRequest(orbital, 48))).toBe(
      '/api/orbitals/current-field?n=3&l=2&m=-1&z=2&basis=complex&seed_count=48',
    )
  })

  it('slice (client.test.ts:745-747)', () => {
    expect(key(sliceRequest(orbital, 65, 1.5, 'yz', 'phase'))).toBe(
      '/api/orbitals/slice?n=3&l=2&m=-1&z=2&basis=complex&resolution=65&a_mu=1.5&plane=yz&observable=phase',
    )
  })

  it('spells the orbital field by field, so a stray property cannot reach the query', () => {
    const stray = { ...orbital, id: '3d', label: '3d(-1)' }
    expect(key(metadataRequest(stray))).toBe(key(metadataRequest(orbital)))
  })
})

describe('superposition request formation', () => {
  it('isosurface (client.test.ts:608-610)', () => {
    expect(key(superpositionIsosurfaceRequest(terms, 'real', 2, 1.5, 1.25, 64, 0.75))).toBe(
      `/api/superposition/isosurface?terms=${encodedTerms}&time=1.25&resolution=64&basis=real&z=2&a_mu=1.5&probability_mass=0.75`,
    )
  })

  it('current field (client.test.ts:663-665)', () => {
    expect(key(superpositionCurrentFieldRequest(terms, 'real', 2, 1.5, 1.25, 40))).toBe(
      `/api/superposition/current-field?terms=${encodedTerms}&time=1.25&seed_count=40&basis=real&z=2&a_mu=1.5`,
    )
  })

  it('slice (client.test.ts:859-862)', () => {
    expect(
      key(superpositionSliceRequest(terms, 'real', 2, 1.5, 1.25, 65, 'xy', 'wavefunction_real')),
    ).toBe(
      `/api/superposition/slice?terms=${encodedTerms}&time=1.25&resolution=65&basis=real&z=2&a_mu=1.5` +
        '&plane=xy&observable=wavefunction_real',
    )
  })

  it('spells lattice times the way String(number) does (3, not 3.0)', () => {
    const request = superpositionIsosurfaceRequest('1,0,0,1', 'complex', 1, 1, 3, 65, 0.9)
    expect(request.query?.get('time')).toBe('3')
    expect(request.query?.get('z')).toBe('1')
  })
})

describe('catalogue requests', () => {
  it('carry no query', () => {
    expect(key(ORBITAL_CATALOG_REQUEST)).toBe('/api/orbitals/catalog')
    expect(key(SUPERPOSITION_CATALOG_REQUEST)).toBe('/api/superposition/catalog')
    expect(ORBITAL_CATALOG_REQUEST.query).toBeNull()
    expect(Object.isFrozen(ORBITAL_CATALOG_REQUEST)).toBe(true)
    expect(Object.isFrozen(SUPERPOSITION_CATALOG_REQUEST)).toBe(true)
  })
})

describe('route table', () => {
  it('names exactly the scene endpoints the capability matrix plans', () => {
    const scene = [
      ORBITAL_POINT_CLOUD_ROUTE,
      ORBITAL_ISOSURFACE_ROUTE,
      ORBITAL_CURRENT_FIELD_ROUTE,
      ORBITAL_SLICE_ROUTE,
      SUPERPOSITION_ISOSURFACE_ROUTE,
      SUPERPOSITION_CURRENT_FIELD_ROUTE,
      SUPERPOSITION_SLICE_ROUTE,
    ].sort()
    const planned = Object.values(CAPABILITY_ROUTE_CONSTRAINTS)
      .map((route) => route.endpoint as string)
      .sort()
    expect(scene).toEqual(planned)
  })
})
```

- [ ] **Step 2: Run it and see it fail**

Run: `(cd web && npm exec --no -- vitest run src/api/requests.test.ts)`
Expected: FAIL — `Failed to resolve import "./requests" from "src/api/requests.test.ts"`.

- [ ] **Step 3: Implement** — create `web/src/api/requests.ts`:

```ts
import type { BasisKind, OrbitalParameters, PrincipalPlane, SliceObservable } from './types'

/**
 * Request formation, and nothing else: no I/O, no store, no transport.
 *
 * Every query below is spelled in exactly the order and form `client.ts`
 * spelled it with `URLSearchParams` + `String(value)` before this module
 * existed (client.test.ts pins the literal strings), because that string is
 * now two things at once: the URL the live transport fetches and the key the
 * static catalogue is looked up by. The build-time enumerator
 * (src/api/staticEnumeration.ts) and the static capability overlay call these
 * same functions, so the three can only disagree through a bug in one place.
 */

/** The orbital fields an eigenstate route reads. Wire order: n, l, m, z, basis. */
export type OrbitalRequestState = OrbitalParameters

export interface ApiRequest {
  route: string
  query: URLSearchParams | null
}

export const ORBITAL_POINT_CLOUD_ROUTE = '/api/orbitals/point-cloud'
export const ORBITAL_METADATA_ROUTE = '/api/orbitals/metadata'
export const ORBITAL_ISOSURFACE_ROUTE = '/api/orbitals/isosurface'
export const ORBITAL_CURRENT_FIELD_ROUTE = '/api/orbitals/current-field'
export const ORBITAL_SLICE_ROUTE = '/api/orbitals/slice'
export const ORBITAL_CATALOG_ROUTE = '/api/orbitals/catalog'
export const SUPERPOSITION_ISOSURFACE_ROUTE = '/api/superposition/isosurface'
export const SUPERPOSITION_CURRENT_FIELD_ROUTE = '/api/superposition/current-field'
export const SUPERPOSITION_SLICE_ROUTE = '/api/superposition/slice'
export const SUPERPOSITION_CATALOG_ROUTE = '/api/superposition/catalog'

type QueryEntry = readonly [string, string | number]

function query(entries: readonly QueryEntry[]): URLSearchParams {
  const search = new URLSearchParams()
  for (const [name, value] of entries) search.set(name, String(value))
  return search
}

/**
 * Spelled field by field rather than spread from the object: the old
 * `Object.entries(params)` sent whatever own properties the caller's object
 * carried, in its key order. Every caller passes `{ n, l, m, z, basis }` in
 * that order, so the bytes on the wire are unchanged; an object with a stray
 * property can no longer leak it into a query.
 */
function orbitalEntries(o: OrbitalRequestState): QueryEntry[] {
  return [
    ['n', o.n],
    ['l', o.l],
    ['m', o.m],
    ['z', o.z],
    ['basis', o.basis],
  ]
}

export function pointCloudRequest(o: OrbitalRequestState, samples: number, seed: number): ApiRequest {
  return {
    route: ORBITAL_POINT_CLOUD_ROUTE,
    query: query([...orbitalEntries(o), ['samples', samples], ['seed', seed]]),
  }
}

export function metadataRequest(o: OrbitalRequestState): ApiRequest {
  return { route: ORBITAL_METADATA_ROUTE, query: query(orbitalEntries(o)) }
}

export function isosurfaceRequest(
  o: OrbitalRequestState,
  resolution: number,
  probabilityMass: number,
): ApiRequest {
  return {
    route: ORBITAL_ISOSURFACE_ROUTE,
    query: query([
      ...orbitalEntries(o),
      ['resolution', resolution],
      ['probability_mass', probabilityMass],
    ]),
  }
}

export function currentFieldRequest(o: OrbitalRequestState, seedCount: number): ApiRequest {
  return {
    route: ORBITAL_CURRENT_FIELD_ROUTE,
    query: query([...orbitalEntries(o), ['seed_count', seedCount]]),
  }
}

export function sliceRequest(
  o: OrbitalRequestState,
  resolution: number,
  aMu: number,
  plane: PrincipalPlane,
  observable: SliceObservable,
): ApiRequest {
  return {
    route: ORBITAL_SLICE_ROUTE,
    query: query([
      ...orbitalEntries(o),
      ['resolution', resolution],
      ['a_mu', aMu],
      ['plane', plane],
      ['observable', observable],
    ]),
  }
}

export function superpositionIsosurfaceRequest(
  terms: string,
  basis: BasisKind,
  z: number,
  aMu: number,
  timeAu: number,
  resolution: number,
  probabilityMass: number,
): ApiRequest {
  return {
    route: SUPERPOSITION_ISOSURFACE_ROUTE,
    query: query([
      ['terms', terms],
      ['time', timeAu],
      ['resolution', resolution],
      ['basis', basis],
      ['z', z],
      ['a_mu', aMu],
      ['probability_mass', probabilityMass],
    ]),
  }
}

export function superpositionCurrentFieldRequest(
  terms: string,
  basis: BasisKind,
  z: number,
  aMu: number,
  timeAu: number,
  seedCount: number,
): ApiRequest {
  return {
    route: SUPERPOSITION_CURRENT_FIELD_ROUTE,
    query: query([
      ['terms', terms],
      ['time', timeAu],
      ['seed_count', seedCount],
      ['basis', basis],
      ['z', z],
      ['a_mu', aMu],
    ]),
  }
}

export function superpositionSliceRequest(
  terms: string,
  basis: BasisKind,
  z: number,
  aMu: number,
  timeAu: number,
  resolution: number,
  plane: PrincipalPlane,
  observable: SliceObservable,
): ApiRequest {
  return {
    route: SUPERPOSITION_SLICE_ROUTE,
    query: query([
      ['terms', terms],
      ['time', timeAu],
      ['resolution', resolution],
      ['basis', basis],
      ['z', z],
      ['a_mu', aMu],
      ['plane', plane],
      ['observable', observable],
    ]),
  }
}

export const ORBITAL_CATALOG_REQUEST: ApiRequest = Object.freeze({
  route: ORBITAL_CATALOG_ROUTE,
  query: null,
})

export const SUPERPOSITION_CATALOG_REQUEST: ApiRequest = Object.freeze({
  route: SUPERPOSITION_CATALOG_ROUTE,
  query: null,
})
```

Edit `web/coverage-scope.json`: insert `"src/api/requests.ts",` directly after `"src/api/qvpc.ts",` in `coverageGated` and in `pragmaScanned`.

- [ ] **Step 4: Run and see it pass**

Run: `(cd web && npm exec --no -- vitest run src/api/requests.test.ts src/guards.test.ts)`
Expected: PASS (requests: 12 tests).

- [ ] **Step 5: Pre-commit gate (CLAUDE.md "提交前")**

Run: `npm --prefix web run test`
Expected: exit 0 — the pinned chain (`clean-coverage`, `tsc -p tsconfig.test.json --noEmit`, vitest with coverage, `assert-no-skips`, `assert-coverage-scope`) passes with 0 skipped and 0 todo, and every module in `web/coverage-scope.json` is at ≥ 90/85/90/90.

Run: `npm --prefix web run typecheck`
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add web/src/api/requests.ts web/src/api/requests.test.ts web/coverage-scope.json
git commit -m "$(cat <<'EOF'
feat(web): pure request formation for every API route

Claude-Session: https://claude.ai/code/session_01E44DEzsc7Av26fc7nZ5rSo
EOF
)"
```

---

### Task B3: Route every `client.ts` fetch through the transport

**Files:**
- Modify: `web/src/api/client.ts` (imports + `queryString` 1-36; `fetchPointCloud` 169-185; `fetchIsosurface` 187-199; `fetchCurrentField` 201-212; `fetchMetadata` 214-223; `fetchCatalog` 225-233; `fetchSuperpositionCatalog` 235-245; `fetchSuperpositionIsosurface` 256-280; `fetchSuperpositionCurrentField` 293-308; `fetchSlice` 372-383; `fetchSuperpositionSlice` 390-413)
- Test: `web/src/api/client.test.ts` (extend the import at 20-32; append two `describe` blocks after line 998)

**Interfaces:**
- Consumes: `getTransport` (B1), all builders (B2).
- Produces: every existing fetcher keeps its signature; new
  - `export async function fetchOrbitalMetadata(orbital: OrbitalRequestState, signal?: AbortSignal): Promise<OrbitalMetadata>`
  - `export const fetchMetadata = fetchOrbitalMetadata`
  - `export function parseOrbitalCatalog(payload: unknown): OrbitalPreset[]`
  - `export function parseSuperpositionCatalog(payload: unknown): SuperpositionPreset[]`

- [ ] **Step 1: Write the failing tests** — in `web/src/api/client.test.ts` extend the import block (lines 20-32) to:

```ts
import {
  fetchCatalog,
  fetchCurrentField,
  fetchIsosurface,
  fetchMetadata,
  fetchOrbitalMetadata,
  fetchPointCloud,
  fetchSlice,
  fetchSuperpositionCatalog,
  fetchSuperpositionCurrentField,
  fetchSuperpositionIsosurface,
  fetchSuperpositionSlice,
  parseOrbitalCatalog,
  parsePointCloud,
  parseSuperpositionCatalog,
} from './client'
import { requestKey, resetTransport, setTransport, type Transport } from './transport'
```

and append at the end of the file:

```ts
/* --------------------------------------------------------------- transport */

const SUPERPOSITION_CATALOG_FIXTURE: unknown = JSON.parse(
  readFileSync(
    fileURLToPath(new URL('../../../tests/fixtures/visual/catalog-superposition.json', import.meta.url)),
    'utf-8',
  ),
)

describe('the transport seam', () => {
  afterEach(() => {
    resetTransport()
  })

  it('sends every fetcher through the installed transport, never the global fetch', async () => {
    const seen: string[] = []
    const signals: (AbortSignal | undefined)[] = []
    const refusing: Transport = {
      request(route, query, signal) {
        seen.push(requestKey(route, query))
        signals.push(signal)
        return Promise.resolve(errorResponse('{"detail":"stop"}', 422))
      },
    }
    setTransport(refusing)
    const { signal } = new AbortController()

    const outcomes = await Promise.allSettled([
      fetchPointCloud(params, 20000, 7, signal),
      fetchIsosurface(params, 65, 0.9, signal),
      fetchCurrentField(params, 48, signal),
      fetchMetadata(params, signal),
      fetchOrbitalMetadata(params, signal),
      fetchCatalog(signal),
      fetchSuperpositionCatalog(signal),
      fetchSuperpositionIsosurface(terms, 1.25, 64, 'real', 2, 1.5, 0.75, signal),
      fetchSuperpositionCurrentField(terms, 1.25, 40, 'real', 2, 1.5, signal),
      fetchSlice(params, 65, 1.5, 'yz', 'phase', signal),
      fetchSuperpositionSlice(terms, 1.25, 65, 'real', 2, 1.5, 'xy', 'wavefunction_real', signal),
    ])

    expect(outcomes.map((outcome) => outcome.status)).toEqual(Array(11).fill('rejected'))
    expect(fetchMock).not.toHaveBeenCalled()
    expect(signals.every((each) => each === signal)).toBe(true)
    expect(seen).toEqual([
      '/api/orbitals/point-cloud?n=3&l=2&m=-1&z=2&basis=complex&samples=20000&seed=7',
      '/api/orbitals/metadata?n=3&l=2&m=-1&z=2&basis=complex',
      '/api/orbitals/isosurface?n=3&l=2&m=-1&z=2&basis=complex&resolution=65&probability_mass=0.9',
      '/api/orbitals/current-field?n=3&l=2&m=-1&z=2&basis=complex&seed_count=48',
      '/api/orbitals/metadata?n=3&l=2&m=-1&z=2&basis=complex',
      '/api/orbitals/metadata?n=3&l=2&m=-1&z=2&basis=complex',
      '/api/orbitals/catalog',
      '/api/superposition/catalog',
      `/api/superposition/isosurface?terms=${encodedTerms}&time=1.25&resolution=64&basis=real&z=2&a_mu=1.5&probability_mass=0.75`,
      `/api/superposition/current-field?terms=${encodedTerms}&time=1.25&seed_count=40&basis=real&z=2&a_mu=1.5`,
      '/api/orbitals/slice?n=3&l=2&m=-1&z=2&basis=complex&resolution=65&a_mu=1.5&plane=yz&observable=phase',
      `/api/superposition/slice?terms=${encodedTerms}&time=1.25&resolution=65&basis=real&z=2&a_mu=1.5&plane=xy&observable=wavefunction_real`,
    ])
  })
})

describe('catalogue parsers and the metadata fetcher', () => {
  it('validate a catalogue without a request, exactly as the fetchers do', () => {
    expect(parseSuperpositionCatalog(SUPERPOSITION_CATALOG_FIXTURE).map((entry) => entry.id)).toEqual([
      '1s-2pz',
      '2s-2pz',
      '1s-3dz2',
      '2pplus-2pminus',
    ])
    const presets = [{ id: '1s', label: '1s', n: 1, l: 0, m: 0, basis: 'real' }]
    expect(parseOrbitalCatalog(presets)).toEqual(presets)
    expect(() => parseOrbitalCatalog({ presets })).toThrow('orbital catalog must be an array')
    expect(() => parseSuperpositionCatalog(null)).toThrow('superposition catalog must be an array')
  })

  it('names the orbital metadata fetcher both ways', () => {
    expect(fetchMetadata).toBe(fetchOrbitalMetadata)
  })
})
```

- [ ] **Step 2: Run and see it fail**

Run: `(cd web && npm exec --no -- vitest run src/api/client.test.ts)`
Expected: FAIL — the import of `fetchOrbitalMetadata`, `parseOrbitalCatalog`, `parseSuperpositionCatalog` is undefined (`TypeError: parseSuperpositionCatalog is not a function`), and `the transport seam` fails with `expected "spy" to not be called` because the fetchers still call the global `fetch`.

- [ ] **Step 3: Implement** — in `web/src/api/client.ts`:

Replace lines 1-36 (imports through `queryString`) with:

```ts
import { parsePointCloud } from './qvpc'
import {
  currentFieldRequest,
  isosurfaceRequest,
  metadataRequest,
  ORBITAL_CATALOG_REQUEST,
  pointCloudRequest,
  sliceRequest,
  SUPERPOSITION_CATALOG_REQUEST,
  superpositionCurrentFieldRequest,
  superpositionIsosurfaceRequest,
  superpositionSliceRequest,
  type ApiRequest,
  type OrbitalRequestState,
} from './requests'
import {
  MAXIMUM_SLICE_RESOLUTION,
  MINIMUM_SLICE_RESOLUTION,
  parseSlicePayload,
  SliceContractError,
  type AnySlicePayload,
} from './sliceContract'
import { getTransport } from './transport'
import type {
  BasisKind,
  CurrentFieldPayload,
  IsosurfacePayload,
  OrbitalMetadata,
  OrbitalParameters,
  OrbitalPreset,
  PointCloudData,
  PrincipalPlane,
  SliceObservable,
  SlicePayload,
  SuperpositionCurrentPayload,
  SuperpositionIsosurfacePayload,
  SuperpositionPreset,
  SuperpositionSlicePayload,
} from './types'

export { parsePointCloud } from './qvpc'

/** OpenAPI bounds of SuperpositionCatalogEntry.streamline_seed_count_max. */
const MINIMUM_SUPERPOSITION_STREAMLINE_SEEDS = 1
const MAXIMUM_SUPERPOSITION_STREAMLINE_SEEDS = 40

/**
 * Every request leaves through the installed transport (src/api/transport.ts):
 * the live one issues the same `fetch('/api/...?...', { signal })` the ten
 * call sites used to, the static one answers from the precomputed catalogue.
 * The request itself is formed in src/api/requests.ts, which the static overlay
 * and the build-time enumerator call as well.
 */
function send(request: ApiRequest, signal?: AbortSignal): Promise<Response> {
  return getTransport().request(request.route, request.query, signal)
}
```

Replace `fetchPointCloud` through `fetchSuperpositionCatalog` (lines 169-245) with:

```ts
export async function fetchPointCloud(
  params: OrbitalParameters,
  samples: number,
  seed: number,
  signal?: AbortSignal,
): Promise<PointCloudData> {
  const [response, metadata] = await Promise.all([
    send(pointCloudRequest(params, samples, seed), signal),
    fetchOrbitalMetadata(params, signal),
  ])
  if (!response.ok) {
    throw await responseError(response)
  }
  const buffer = await response.arrayBuffer()
  return { ...parsePointCloud(buffer, response.headers), metadata }
}

export async function fetchIsosurface(
  params: OrbitalParameters,
  resolution: number,
  probabilityMass: number,
  signal?: AbortSignal,
): Promise<IsosurfacePayload> {
  const response = await send(isosurfaceRequest(params, resolution, probabilityMass), signal)
  if (!response.ok) {
    throw await responseError(response)
  }
  return (await response.json()) as IsosurfacePayload
}

export async function fetchCurrentField(
  params: OrbitalParameters,
  seedCount: number,
  signal?: AbortSignal,
): Promise<CurrentFieldPayload> {
  const response = await send(currentFieldRequest(params, seedCount), signal)
  if (!response.ok) {
    throw await responseError(response)
  }
  return (await response.json()) as CurrentFieldPayload
}

/** The orbital's diagnostics and, for eigenstates, its radial profile. */
export async function fetchOrbitalMetadata(
  orbital: OrbitalRequestState,
  signal?: AbortSignal,
): Promise<OrbitalMetadata> {
  const response = await send(metadataRequest(orbital), signal)
  if (!response.ok) {
    throw await responseError(response)
  }
  return (await response.json()) as OrbitalMetadata
}

/** The name the point-cloud path and the existing specs use; the same function. */
export const fetchMetadata = fetchOrbitalMetadata

/** Validate an orbital catalogue at the wire boundary. The enumerator reuses it. */
export function parseOrbitalCatalog(payload: unknown): OrbitalPreset[] {
  if (!Array.isArray(payload)) throw new Error('orbital catalog must be an array')
  return payload.map(parseOrbitalPreset)
}

export async function fetchCatalog(signal?: AbortSignal): Promise<OrbitalPreset[]> {
  const response = await send(ORBITAL_CATALOG_REQUEST, signal)
  if (!response.ok) {
    throw await responseError(response)
  }
  return parseOrbitalCatalog(await response.json())
}

/** Validate a superposition catalogue at the wire boundary. The enumerator reuses it. */
export function parseSuperpositionCatalog(payload: unknown): SuperpositionPreset[] {
  if (!Array.isArray(payload)) throw new Error('superposition catalog must be an array')
  return payload.map(parseSuperpositionPreset)
}

export async function fetchSuperpositionCatalog(
  signal?: AbortSignal,
): Promise<SuperpositionPreset[]> {
  const response = await send(SUPERPOSITION_CATALOG_REQUEST, signal)
  if (!response.ok) {
    throw await responseError(response)
  }
  return parseSuperpositionCatalog(await response.json())
}
```

In `fetchSuperpositionIsosurface` replace lines 266-275 (the `queryString` call and the `fetch`) with:

```ts
  const response = await send(
    superpositionIsosurfaceRequest(terms, basis, z, aMu, time, resolution, probabilityMass),
    signal,
  )
```

In `fetchSuperpositionCurrentField` replace lines 302-303 with:

```ts
  const response = await send(
    superpositionCurrentFieldRequest(terms, basis, z, aMu, time, seedCount),
    signal,
  )
```

In `fetchSlice` replace lines 380-381 with:

```ts
  const response = await send(sliceRequest(params, resolution, aMu, plane, observable), signal)
```

In `fetchSuperpositionSlice` replace lines 401-411 with:

```ts
  const response = await send(
    superpositionSliceRequest(terms, basis, z, aMu, time, resolution, plane, observable),
    signal,
  )
```

The doc comments above each fetcher stay; `queryString` is deleted (it has no caller left and `noUnusedLocals` would reject it).

- [ ] **Step 4: Run and see it pass**

Run: `(cd web && npm exec --no -- vitest run src/api/client.test.ts src/components/useSceneAsset.test.tsx src/components/OrbitalCanvas.test.tsx src/api/capability.test.ts)`
Expected: PASS — every pre-existing exact-URL assertion (`client.test.ts:205-211, 419-422, 447-449, 526-528, 608-610, 663-665, 745-747, 859-862`) unchanged and green, plus the two new blocks.

Run: `npm --prefix web run typecheck`
Expected: exit 0.

- [ ] **Step 5: Pre-commit gate (CLAUDE.md "提交前")**

Run: `npm --prefix web run test`
Expected: exit 0 — the pinned chain (`clean-coverage`, `tsc -p tsconfig.test.json --noEmit`, vitest with coverage, `assert-no-skips`, `assert-coverage-scope`) passes with 0 skipped and 0 todo, and every module in `web/coverage-scope.json` is at ≥ 90/85/90/90.

Run: `npm --prefix web run typecheck`
Expected: exit 0.

Run: `npm --prefix web run test:fullstack` (every live request now leaves through `liveTransport`; CLAUDE.md: a change that touches the front-end↔back-end connection runs the fullstack gate before commit)
Expected: exit 0 — the real FastAPI server answers every scene the fullstack journeys open, and `assert-fullstack-run.mjs` passes.

`test:visual` is not run here (Linux/Docker only; Part E). The wire bytes it depends on are pinned unchanged by the exact-URL assertions above.

- [ ] **Step 6: Commit**

```bash
git add web/src/api/client.ts web/src/api/client.test.ts
git commit -m "$(cat <<'EOF'
refactor(web): route every client fetch through the transport

Adds fetchOrbitalMetadata and exports the catalogue parsers.

Claude-Session: https://claude.ai/code/session_01E44DEzsc7Av26fc7nZ5rSo
EOF
)"
```

---

### Task B4: One scene dispatch for fetching and enumeration (`sceneCallFor`, `requestsForPlan`)

**Files:**
- Modify: `web/src/api/requests.ts` (imports at top; append the dispatch section)
- Modify: `web/src/components/useSceneAsset.ts` (imports 1-31; constants and `require*` helpers 70-141; `executeSceneRequest` 143-243)
- Test: `web/src/api/requests.test.ts` (append), `web/src/components/useSceneAsset.test.tsx` (imports 22-40; add one test in `describe('executeSceneRequest')` after line 784)

**Interfaces:**
- Consumes: `ScenePlan`, `SceneRequestInputs` (type-only, `web/src/api/capability.ts:119-156`); `PRINCIPAL_PLANES`, `SLICE_OBSERVABLES` (`web/src/api/sliceContract.ts:76-78`).
- Produces:
  - `export function requestsForPlan(plan: ScenePlan, inputs: SceneRequestInputs): readonly ApiRequest[]` (contract; point cloud → `[pointCloud, metadata]`)
  - `export interface SuperpositionState { terms: string; basis: BasisKind; z: number; aMu: number; timeAu: number }`
  - `export type SceneCall` (seven kinds, names equal to `SceneAsset` kinds)
  - `export function sceneCallFor(plan: ScenePlan, inputs: SceneRequestInputs): SceneCall`
  - `export function requestsForCall(call: SceneCall): readonly ApiRequest[]`

- [ ] **Step 1: Write the failing tests** — append to `web/src/api/requests.test.ts` (and add `planSceneRequest`, `type ScenePlan`, `type SceneRequestInputs` to a new import from `./capability`, plus `requestsForPlan`, `sceneCallFor` to the `./requests` import):

```ts
import { planSceneRequest, type ScenePlan, type SceneRequestInputs } from './capability'
```

```ts
/* ------------------------------------------------------------ scene dispatch */

const TERMS_1S2PZ = '1,0,0,0.7071067811865476;2,1,0,0.7071067811865476'
const ENCODED_1S2PZ = new URLSearchParams({ terms: TERMS_1S2PZ }).toString().slice('terms='.length)

const sceneInputs = (patch: Partial<SceneRequestInputs> = {}): SceneRequestInputs => ({
  mode: 'eigenstate',
  representation: 'point_cloud',
  orbital: { n: 2, l: 1, m: 1, z: 1, basis: 'complex' },
  samples: 28000,
  seed: 7,
  resolution: 65,
  probabilityMass: 0.9,
  seedCount: 48,
  superpositionTerms: TERMS_1S2PZ,
  superpositionStreamlineSeedCountMax: 40,
  superpositionBasis: 'complex',
  aMu: 1,
  timeAu: 0.6,
  ...patch,
})

function planFor(inputs: SceneRequestInputs): ScenePlan {
  const plan = planSceneRequest(inputs)
  if (plan.status !== 'available') throw new Error(`expected a plan: ${plan.reason}`)
  return plan
}

describe('requestsForPlan', () => {
  it.each([
    [
      'point cloud: the cloud and its metadata, in fetch order',
      sceneInputs(),
      [
        '/api/orbitals/point-cloud?n=2&l=1&m=1&z=1&basis=complex&samples=28000&seed=7',
        '/api/orbitals/metadata?n=2&l=1&m=1&z=1&basis=complex',
      ],
    ],
    [
      'eigenstate isosurface',
      sceneInputs({ representation: 'isosurface' }),
      ['/api/orbitals/isosurface?n=2&l=1&m=1&z=1&basis=complex&resolution=65&probability_mass=0.9'],
    ],
    [
      'eigenstate streamlines',
      sceneInputs({ representation: 'streamlines' }),
      ['/api/orbitals/current-field?n=2&l=1&m=1&z=1&basis=complex&seed_count=48'],
    ],
    [
      'eigenstate slice',
      sceneInputs({ representation: 'slice', plane: 'yz', sliceObservable: 'phase' }),
      ['/api/orbitals/slice?n=2&l=1&m=1&z=1&basis=complex&resolution=65&a_mu=1&plane=yz&observable=phase'],
    ],
    [
      'superposition isosurface',
      sceneInputs({ mode: 'superposition', representation: 'isosurface' }),
      [
        `/api/superposition/isosurface?terms=${ENCODED_1S2PZ}&time=0.6&resolution=65&basis=complex&z=1&a_mu=1&probability_mass=0.9`,
      ],
    ],
    [
      'superposition streamlines (seed count clamped to the catalogue 40)',
      sceneInputs({ mode: 'superposition', representation: 'streamlines' }),
      [
        `/api/superposition/current-field?terms=${ENCODED_1S2PZ}&time=0.6&seed_count=40&basis=complex&z=1&a_mu=1`,
      ],
    ],
    [
      'superposition slice (route default plane and observable)',
      sceneInputs({ mode: 'superposition', representation: 'slice' }),
      [
        `/api/superposition/slice?terms=${ENCODED_1S2PZ}&time=0.6&resolution=65&basis=complex&z=1&a_mu=1&plane=xz&observable=probability_density`,
      ],
    ],
  ] as const)('%s', (_label, inputs, expected) => {
    expect(requestsForPlan(planFor(inputs), inputs).map(key)).toEqual(expected)
  })
})

describe('sceneCallFor', () => {
  it('takes the state from the inputs and every tunable from the clamped plan', () => {
    const inputs = sceneInputs({ mode: 'superposition', representation: 'isosurface' })
    const clamped = planFor({ ...inputs, aMu: 100, resolution: 999 })
    expect(sceneCallFor(clamped, inputs)).toEqual({
      kind: 'superposition_isosurface',
      terms: TERMS_1S2PZ,
      basis: 'complex',
      z: 1,
      aMu: 20,
      timeAu: 0.6,
      resolution: 81,
      probabilityMass: 0.9,
    })
  })

  it('refuses an endpoint no fetcher serves', () => {
    expect(() =>
      sceneCallFor(
        { status: 'available', endpoint: '/api/orbitals/hologram', params: {}, latency: 'fast' },
        sceneInputs(),
      ),
    ).toThrow('No client fetcher serves /api/orbitals/hologram.')
  })

  it('refuses a plan missing a number its endpoint needs', () => {
    expect(() =>
      sceneCallFor(
        {
          status: 'available',
          endpoint: '/api/orbitals/isosurface',
          params: { probability_mass: 0.9 },
          latency: 'slow',
        },
        sceneInputs(),
      ),
    ).toThrow('The plan for /api/orbitals/isosurface carries no numeric resolution.')
  })

  it('refuses a slice plan with no plane, or a plane outside the principal set', () => {
    expect(() =>
      sceneCallFor(
        {
          status: 'available',
          endpoint: '/api/orbitals/slice',
          params: { resolution: 65, a_mu: 1, observable: 'phase' },
          latency: 'slow',
        },
        sceneInputs(),
      ),
    ).toThrow('The plan for /api/orbitals/slice carries no plane.')
    expect(() =>
      sceneCallFor(
        {
          status: 'available',
          endpoint: '/api/superposition/slice',
          params: { resolution: 65, a_mu: 1, time: 0, plane: 'xw', observable: 'phase' },
          latency: 'slow',
        },
        sceneInputs({ mode: 'superposition' }),
      ),
    ).toThrow('names plane=xw')
  })
})
```

In `web/src/components/useSceneAsset.test.tsx` add to the imports (after line 22):

```ts
import { requestsForPlan } from '../api/requests'
import { requestKey } from '../api/transport'
```

and add this test inside `describe('executeSceneRequest', …)` right after the first test (after line 784):

```ts
  it('fetches exactly the requests requestsForPlan enumerates, for every cell', () => {
    // The static catalogue is built from requestsForPlan; this is what keeps the
    // catalogue and the requests the app really makes the same list.
    const cells: SceneAssetInputs[] = [
      { ...baseInputs, representation: 'point_cloud' },
      { ...baseInputs, representation: 'isosurface' },
      { ...baseInputs, representation: 'streamlines' },
      { ...baseInputs, representation: 'slice', plane: 'yz', sliceObservable: 'phase' },
      { ...superpositionInputs, representation: 'isosurface' },
      { ...superpositionInputs, representation: 'streamlines' },
      { ...superpositionInputs, representation: 'slice', plane: 'xz', sliceObservable: 'wavefunction_imag' },
    ]
    for (const inputs of cells) {
      calls = []
      const plan = planSceneRequest(inputs)
      if (plan.status !== 'available') throw new Error(`expected a plan for ${inputs.representation}`)
      void executeSceneRequest(plan, inputs, new AbortController().signal).catch(() => undefined)
      expect(
        calls.map((call) => call.url),
        `${inputs.mode} x ${inputs.representation}`,
      ).toEqual(requestsForPlan(plan, inputs).map((request) => requestKey(request.route, request.query)))
    }
  })
```

- [ ] **Step 2: Run and see it fail**

Run: `(cd web && npm exec --no -- vitest run src/api/requests.test.ts src/components/useSceneAsset.test.tsx)`
Expected: FAIL — `requestsForPlan is not a function` / `sceneCallFor is not a function` (the exports do not exist yet).

- [ ] **Step 3: Implement**

In `web/src/api/requests.ts` replace the first line (the `./types` import) with:

```ts
import type { ScenePlan, SceneRequestInputs } from './capability'
import { PRINCIPAL_PLANES, SLICE_OBSERVABLES } from './sliceContract'
import type { BasisKind, OrbitalParameters, PrincipalPlane, SliceObservable } from './types'
```

and append at the end of the file:

```ts
/* ------------------------------------------------------------ scene dispatch */

/** What every superposition route reads besides its own tunables. */
export interface SuperpositionState {
  terms: string
  basis: BasisKind
  z: number
  aMu: number
  timeAu: number
}

/**
 * One scene request, decided once: which fetcher the plan's endpoint needs and
 * the exact arguments it gets. `executeSceneRequest`
 * (src/components/useSceneAsset.ts) fetches it; `requestsForCall` spells it as
 * the API requests it makes, and the static catalogue is enumerated and looked
 * up through that spelling -- so what is catalogued and what is fetched cannot
 * drift apart. The kinds are the `SceneAsset` kinds.
 */
export type SceneCall =
  | { kind: 'point_cloud'; orbital: OrbitalRequestState; samples: number; seed: number }
  | { kind: 'isosurface'; orbital: OrbitalRequestState; resolution: number; probabilityMass: number }
  | { kind: 'streamlines'; orbital: OrbitalRequestState; seedCount: number }
  | {
      kind: 'slice'
      orbital: OrbitalRequestState
      resolution: number
      aMu: number
      plane: PrincipalPlane
      observable: SliceObservable
    }
  | ({ kind: 'superposition_isosurface'; resolution: number; probabilityMass: number } & SuperpositionState)
  | ({
      kind: 'superposition_slice'
      resolution: number
      plane: PrincipalPlane
      observable: SliceObservable
    } & SuperpositionState)
  | ({ kind: 'superposition_streamlines'; seedCount: number } & SuperpositionState)

/**
 * A tunable the plan declares, taken from the plan rather than from the raw
 * inputs: `planSceneRequest` has already clamped it into the bound the route
 * accepts, and the unclamped input is exactly what used to produce 422s.
 *
 * A missing one is a contract break between the capability matrix and this
 * dispatcher, not something to paper over with a default -- a defaulted
 * resolution would render a different grid from the one the panel is showing.
 */
function requireNumber(plan: ScenePlan, name: string): number {
  const value = plan.params[name]
  if (typeof value !== 'number') {
    throw new Error(`The plan for ${plan.endpoint} carries no numeric ${name}.`)
  }
  return value
}

/**
 * An enumerated choice the plan declares, checked against the closed set the
 * contract names. A missing `plane` would not 422: the route substitutes `xz`
 * and returns a valid section of a plane nobody asked for.
 */
function requireChoice<T extends string>(
  plan: ScenePlan,
  name: string,
  declared: readonly T[],
): T {
  const value = plan.params[name]
  if (typeof value !== 'string') {
    throw new Error(`The plan for ${plan.endpoint} carries no ${name}.`)
  }
  if (!declared.includes(value as T)) {
    throw new Error(
      `The plan for ${plan.endpoint} names ${name}=${value}, which is not one of ` +
        `${declared.join(', ')}.`,
    )
  }
  return value as T
}

const requirePlane = (plan: ScenePlan): PrincipalPlane =>
  requireChoice(plan, 'plane', PRINCIPAL_PLANES)

const requireObservable = (plan: ScenePlan): SliceObservable =>
  requireChoice(plan, 'observable', SLICE_OBSERVABLES)

/** The superposition state: basis and charge from the inputs, a_mu and time from the plan. */
function superpositionState(plan: ScenePlan, inputs: SceneRequestInputs): SuperpositionState {
  return {
    terms: inputs.superpositionTerms,
    basis: inputs.superpositionBasis,
    z: inputs.orbital.z,
    aMu: requireNumber(plan, 'a_mu'),
    timeAu: requireNumber(plan, 'time'),
  }
}

/**
 * The call a plan makes. One dispatch on the endpoint the capability matrix
 * chose; an endpoint without a fetcher throws rather than silently rendering
 * nothing.
 */
export function sceneCallFor(plan: ScenePlan, inputs: SceneRequestInputs): SceneCall {
  const { orbital } = inputs
  switch (plan.endpoint) {
    case ORBITAL_POINT_CLOUD_ROUTE:
      return {
        kind: 'point_cloud',
        orbital,
        samples: requireNumber(plan, 'samples'),
        seed: requireNumber(plan, 'seed'),
      }
    case ORBITAL_ISOSURFACE_ROUTE:
      return {
        kind: 'isosurface',
        orbital,
        resolution: requireNumber(plan, 'resolution'),
        probabilityMass: requireNumber(plan, 'probability_mass'),
      }
    case ORBITAL_CURRENT_FIELD_ROUTE:
      return { kind: 'streamlines', orbital, seedCount: requireNumber(plan, 'seed_count') }
    case ORBITAL_SLICE_ROUTE:
      // `a_mu` comes from the plan: its copy is clamped into the route's bound.
      return {
        kind: 'slice',
        orbital,
        resolution: requireNumber(plan, 'resolution'),
        aMu: requireNumber(plan, 'a_mu'),
        plane: requirePlane(plan),
        observable: requireObservable(plan),
      }
    case SUPERPOSITION_ISOSURFACE_ROUTE:
      return {
        kind: 'superposition_isosurface',
        ...superpositionState(plan, inputs),
        resolution: requireNumber(plan, 'resolution'),
        probabilityMass: requireNumber(plan, 'probability_mass'),
      }
    case SUPERPOSITION_SLICE_ROUTE:
      return {
        kind: 'superposition_slice',
        ...superpositionState(plan, inputs),
        resolution: requireNumber(plan, 'resolution'),
        plane: requirePlane(plan),
        observable: requireObservable(plan),
      }
    case SUPERPOSITION_CURRENT_FIELD_ROUTE:
      return {
        kind: 'superposition_streamlines',
        ...superpositionState(plan, inputs),
        seedCount: requireNumber(plan, 'seed_count'),
      }
    default:
      throw new Error(`No client fetcher serves ${plan.endpoint}.`)
  }
}

/** The API requests a call makes, in the order its fetcher issues them. */
export function requestsForCall(call: SceneCall): readonly ApiRequest[] {
  switch (call.kind) {
    case 'point_cloud':
      return [pointCloudRequest(call.orbital, call.samples, call.seed), metadataRequest(call.orbital)]
    case 'isosurface':
      return [isosurfaceRequest(call.orbital, call.resolution, call.probabilityMass)]
    case 'streamlines':
      return [currentFieldRequest(call.orbital, call.seedCount)]
    case 'slice':
      return [sliceRequest(call.orbital, call.resolution, call.aMu, call.plane, call.observable)]
    case 'superposition_isosurface':
      return [
        superpositionIsosurfaceRequest(
          call.terms,
          call.basis,
          call.z,
          call.aMu,
          call.timeAu,
          call.resolution,
          call.probabilityMass,
        ),
      ]
    case 'superposition_slice':
      return [
        superpositionSliceRequest(
          call.terms,
          call.basis,
          call.z,
          call.aMu,
          call.timeAu,
          call.resolution,
          call.plane,
          call.observable,
        ),
      ]
    default:
      return [
        superpositionCurrentFieldRequest(
          call.terms,
          call.basis,
          call.z,
          call.aMu,
          call.timeAu,
          call.seedCount,
        ),
      ]
  }
}

/** Contract: every API request a plan makes (a point cloud makes two). */
export function requestsForPlan(plan: ScenePlan, inputs: SceneRequestInputs): readonly ApiRequest[] {
  return requestsForCall(sceneCallFor(plan, inputs))
}
```

In `web/src/components/useSceneAsset.ts`:

Replace the imports (lines 1-31) with:

```ts
import { useEffect, useRef, useState } from 'react'

import { planSceneRequest, type ScenePlan, type SceneRequestInputs } from '../api/capability'
import {
  fetchCurrentField,
  fetchIsosurface,
  fetchPointCloud,
  fetchSlice,
  fetchSuperpositionCurrentField,
  fetchSuperpositionIsosurface,
  fetchSuperpositionSlice,
} from '../api/client'
import { sceneCallFor } from '../api/requests'
import type {
  CurrentFieldPayload,
  IsosurfacePayload,
  PointCloudData,
  SceneStatus,
  SlicePayload,
  SuperpositionCurrentPayload,
  SuperpositionIsosurfacePayload,
  SuperpositionSlicePayload,
} from '../api/types'
import { createFetchCoordinator, sceneIdentityKey, type ResponseDecision } from './sceneRequest'
import {
  statusFromCurrentField,
  statusFromSlice,
  statusFromSuperpositionIsosurface,
} from './sceneStatus'
```

Replace lines 70-141 (param-name constants, endpoint constants, `requireNumber`, `requireChoice`, `requirePlane`, `requireObservable`) with:

```ts
/** The query parameter a time-dependent plan carries; a plan without it is stationary. */
const TIME_PARAM = 'time'
```

Replace `executeSceneRequest` (lines 143-243, doc comment included) with:

```ts
/**
 * Issue the request the plan describes.
 *
 * The dispatch itself is `sceneCallFor` (src/api/requests.ts), shared with
 * `requestsForPlan`: the static catalogue is enumerated from the same decision
 * this function fetches, so a cell cannot be fetched one way and catalogued
 * another. Every cell the matrix can plan is covered; an endpoint without a
 * fetcher throws rather than silently rendering nothing.
 */
export async function executeSceneRequest(
  plan: ScenePlan,
  inputs: SceneAssetInputs,
  signal: AbortSignal,
): Promise<SceneAsset> {
  const call = sceneCallFor(plan, inputs)
  switch (call.kind) {
    case 'point_cloud':
      return {
        kind: 'point_cloud',
        data: await fetchPointCloud(call.orbital, call.samples, call.seed, signal),
      }
    case 'isosurface':
      return {
        kind: 'isosurface',
        data: await fetchIsosurface(call.orbital, call.resolution, call.probabilityMass, signal),
      }
    case 'streamlines':
      return { kind: 'streamlines', data: await fetchCurrentField(call.orbital, call.seedCount, signal) }
    case 'slice':
      return {
        kind: 'slice',
        data: await fetchSlice(call.orbital, call.resolution, call.aMu, call.plane, call.observable, signal),
      }
    case 'superposition_isosurface':
      return {
        kind: 'superposition_isosurface',
        data: await fetchSuperpositionIsosurface(
          call.terms,
          call.timeAu,
          call.resolution,
          call.basis,
          call.z,
          call.aMu,
          call.probabilityMass,
          signal,
        ),
      }
    case 'superposition_slice':
      return {
        kind: 'superposition_slice',
        data: await fetchSuperpositionSlice(
          call.terms,
          call.timeAu,
          call.resolution,
          call.basis,
          call.z,
          call.aMu,
          call.plane,
          call.observable,
          signal,
        ),
      }
    default:
      return {
        kind: 'superposition_streamlines',
        data: await fetchSuperpositionCurrentField(
          call.terms,
          call.timeAu,
          call.seedCount,
          call.basis,
          call.z,
          call.aMu,
          signal,
        ),
      }
  }
}
```

`TIME_PARAM` keeps serving line 408 (`plan.params[TIME_PARAM] === undefined`).

- [ ] **Step 4: Run and see it pass**

Run: `(cd web && npm exec --no -- vitest run src/api/requests.test.ts src/components/useSceneAsset.test.tsx src/api/capability.test.ts src/components/OrbitalCanvas.test.tsx)`
Expected: PASS — including the unchanged `refuses an endpoint no client fetcher serves` (`useSceneAsset.test.tsx:808-816`), `refuses a plan that is missing a parameter its endpoint needs` (818-831), the two slice-choice refusals (840-871) and `capability.test.ts`'s `would notice a missing fetcher` (1079-1088).

Run: `npm --prefix web run typecheck`
Expected: exit 0.

- [ ] **Step 5: Pre-commit gate (CLAUDE.md "提交前")**

Run: `npm --prefix web run test`
Expected: exit 0 — the pinned chain (`clean-coverage`, `tsc -p tsconfig.test.json --noEmit`, vitest with coverage, `assert-no-skips`, `assert-coverage-scope`) passes with 0 skipped and 0 todo, and every module in `web/coverage-scope.json` is at ≥ 90/85/90/90.

Run: `npm --prefix web run typecheck`
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add web/src/api/requests.ts web/src/api/requests.test.ts web/src/components/useSceneAsset.ts web/src/components/useSceneAsset.test.tsx
git commit -m "$(cat <<'EOF'
refactor(web): one scene dispatch shared by fetching and request enumeration

Claude-Session: https://claude.ai/code/session_01E44DEzsc7Av26fc7nZ5rSo
EOF
)"
```

---

### Task B5: Runtime mode, `vite/client` types, relative base, `build:pages`

**Files:**
- Create: `web/src/api/runtimeMode.ts`
- Test: `web/src/api/runtimeMode.test.ts`
- Modify: `web/tsconfig.app.json` (compilerOptions 2-26), `web/tsconfig.test.json` (types 5-8), `web/vite.config.ts` (4-20), `web/package.json` (scripts 9-19), `web/src/guards.test.ts` (inside `describe('development server contract')` 785-798), `web/coverage-scope.json` (both arrays, after `"src/api/requests.ts"`)

**Interfaces:**
- Consumes: `import.meta.env.MODE` (typed by `vite/client`).
- Produces (contract): `export type RuntimeMode = 'live' | 'static'`, `export function runtimeMode(): RuntimeMode`; npm script `build:pages` = `tsc -b && vite build --mode pages --sourcemap false`; `vite.config.ts` `base: './'`.

Verified facts for this task: `web/src/guards.test.ts:785-798` pins only `server.strictPort` and `server.proxy` (not `base`); no test pins the full `scripts` object of `web/package.json` (`tests/test_check_script.py` pins `test`, `test:fullstack` and forbids `pretest`/`posttest`); Vite 8's CLI maps `--sourcemap false` to `false` (`web/node_modules/vite/dist/node/cli.js:674-676`); a probe build with `--base ./ --mode pages --sourcemap false` into a scratch directory produced `href="./favicon.svg"`, `src="./assets/index-….js"` and no `.map` file; `tsc -p` over the app and test projects with `vite/client` added to `types` exits 0 (no production module under `src/` relies on implicit `@types/node`).

- [ ] **Step 1: Write the failing tests**

Create `web/src/api/runtimeMode.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest'

import { runtimeMode } from './runtimeMode'

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('runtimeMode', () => {
  it('is live in every build mode but pages (vitest itself runs in "test")', () => {
    expect(import.meta.env.MODE).toBe('test')
    expect(runtimeMode()).toBe('live')
  })

  it('is static only for the pages build mode', () => {
    vi.stubEnv('MODE', 'pages')
    expect(runtimeMode()).toBe('static')
  })

  it('does not mistake a production build for the static site', () => {
    vi.stubEnv('MODE', 'production')
    expect(runtimeMode()).toBe('live')
  })
})
```

In `web/src/guards.test.ts`, inside `describe('development server contract', …)` after the existing `it` (after line 797), add:

```ts
  it('builds with a relative base, so one bundle serves FastAPI "/" and a Pages sub-path', () => {
    // An absolute base ('/QuViz/') breaks the fullstack gate, which serves
    // web/dist at "/" through FastAPI; no base at all breaks every asset URL
    // under /<repo>/ on GitHub Pages. The app has no router, so './' is safe.
    expect(viteConfig.base).toBe('./')
  })
```

- [ ] **Step 2: Run and see them fail**

Run: `(cd web && npm exec --no -- vitest run src/api/runtimeMode.test.ts src/guards.test.ts)`
Expected: FAIL — `Failed to resolve import "./runtimeMode"`; guards: `expected undefined to be './'`.

- [ ] **Step 3: Implement**

Create `web/src/api/runtimeMode.ts`:

```ts
/**
 * Which data layer this bundle was built for.
 *
 * Decided at build time by Vite's mode: `npm run build:pages` builds with
 * `--mode pages`, and only that bundle answers from the precomputed static
 * catalogue. Every other build -- `npm run build` for `quviz serve`, the dev
 * server, vitest -- talks to the live API. A runtime probe ("is there a
 * manifest?") was rejected: a live server that happened to serve a stale
 * data/manifest.json would silently switch a local user to precomputed answers.
 */
export type RuntimeMode = 'live' | 'static'

export function runtimeMode(): RuntimeMode {
  return import.meta.env.MODE === 'pages' ? 'static' : 'live'
}
```

Replace `web/tsconfig.app.json` with (only `types` is new):

```json
{
  "compilerOptions": {
    "tsBuildInfoFile": "./node_modules/.tmp/tsconfig.app.tsbuildinfo",
    "target": "ES2022",
    "useDefineForClassFields": true,
    "lib": [
      "ES2022",
      "DOM",
      "DOM.Iterable"
    ],
    "allowJs": false,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,
    "strict": true,
    "forceConsistentCasingInFileNames": true,
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "types": [
      "vite/client"
    ]
  },
  "include": [
    "src"
  ],
  "exclude": [
    "src/**/*.test.ts",
    "src/**/*.test.tsx",
    "src/**/*.spec.ts",
    "src/**/*.spec.tsx",
    "src/**/__tests__/**"
  ]
}
```

In `web/tsconfig.test.json` replace the `types` array (lines 5-8) with:

```json
    "types": [
      "node",
      "vitest/globals",
      "vite/client"
    ]
```

Replace `web/vite.config.ts` with:

```ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  // Relative asset URLs: the same bundle is served at "/" by FastAPI
  // (`quviz serve`, the fullstack gate), by `vite preview` (the visual gate)
  // and under /<repo>/ by GitHub Pages. The app has no client-side router, so
  // no URL ever needs an absolute base.
  base: './',
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': 'http://127.0.0.1:8000',
      '/docs': 'http://127.0.0.1:8000',
      '/openapi.json': 'http://127.0.0.1:8000',
      '/redoc': 'http://127.0.0.1:8000',
    },
  },
  build: {
    target: 'es2022',
    sourcemap: true,
  },
})
```

In `web/package.json` add after the `"build"` line (line 10):

```json
    "build:pages": "tsc -b && vite build --mode pages --sourcemap false",
```

In `web/coverage-scope.json` insert `"src/api/runtimeMode.ts",` directly after `"src/api/requests.ts",` in both arrays.

- [ ] **Step 4: Run and see it pass**

Run: `(cd web && npm exec --no -- vitest run src/api/runtimeMode.test.ts src/guards.test.ts)`
Expected: PASS.

Run: `npm --prefix web run typecheck && (cd web && npm exec --no -- tsc -p tsconfig.test.json --noEmit)`
Expected: both exit 0.

Run: `npm --prefix web run build:pages && grep -c 'src="./assets/' web/dist/index.html && grep -c 'href="./favicon.svg"' web/dist/index.html && ls web/dist/assets | grep -c '\.map$'`
Expected: build succeeds (the pre-existing >500 kB chunk warning is expected), then `1`, `1`, `0` (the last `grep -c` prints `0` and exits 1 — that is the pass condition: no sourcemap).

Run: `npm --prefix web run build && ls web/dist/assets | grep -c '\.map$'`
Expected: `1` — the live build keeps its sourcemap and restores `web/dist` for `quviz serve`.

- [ ] **Step 5: Pre-commit gate (CLAUDE.md "提交前")**

Run: `npm --prefix web run test`
Expected: exit 0 — the pinned chain (`clean-coverage`, `tsc -p tsconfig.test.json --noEmit`, vitest with coverage, `assert-no-skips`, `assert-coverage-scope`) passes with 0 skipped and 0 todo, and every module in `web/coverage-scope.json` is at ≥ 90/85/90/90.

Run: `npm --prefix web run typecheck`
Expected: exit 0.

Run: `uv run --locked --no-sync pytest tests/test_check_script.py tests/test_declared_versions.py -q` (they read `web/package.json` and `web/src/guards.test.ts`, both edited here)
Expected: all pass — the pinned `test` / `test:fullstack` scripts are unchanged, no `pretest`/`posttest` hook exists, the guard spec still carries its anchor names.

Run: `npm --prefix web run test:fullstack` (the relative `base` changes how FastAPI's `/` mount serves the bundle; the fullstack config's web server runs `npm --prefix web run build` itself, `web/playwright.fullstack.config.ts:54-58`, so it serves the live build, not the `build:pages` probe above)
Expected: exit 0 — the bundle loads from `/` with `./assets/…` URLs and `assert-fullstack-run.mjs` passes.

`test:visual` is not run here (Linux/Docker only; Part E).

- [ ] **Step 6: Commit**

```bash
git add web/src/api/runtimeMode.ts web/src/api/runtimeMode.test.ts web/tsconfig.app.json web/tsconfig.test.json web/vite.config.ts web/package.json web/src/guards.test.ts web/coverage-scope.json
git commit -m "$(cat <<'EOF'
build(web): relative base, pages build mode and runtime mode switch

build:pages ships no sourcemap (spec section 5).

Claude-Session: https://claude.ai/code/session_01E44DEzsc7Av26fc7nZ5rSo
EOF
)"
```

---

### Task B6: Require the catalogue period; share the playback lattice

**Files:**
- Modify: `web/src/api/capability.ts` (insert after line 190, i.e. after `TIME_GRID_STEP_AU`)
- Modify: `web/src/components/sceneRequest.ts` (import line 8; lattice 162-194)
- Test: `web/src/components/sceneRequest.test.ts` (`describe('nextTimeAu')` 170-273; coordinator simulation line 429), `web/src/components/useSceneAsset.test.tsx` (lines 319 and 743)

**Interfaces:**
- Produces (in `capability.ts`): `export const TARGET_TIME_STEP_AU = 0.6`, `export function playbackFrameCount(periodAu: number): number`, `export function playbackFrameTime(frame: number, frames: number, periodAu: number): number`.
- Changes: `export function nextTimeAu(time: number, periodAu: number): number` — the `periodAu = DEFAULT_PLAYBACK_PERIOD_AU` (39.6) default is removed (spec §5). Production caller `web/src/components/ControlPanel.tsx:486` already passes the catalogue period; no other production caller exists (grep).

This is a defect fix: the regression test below must fail before the change (`nextTimeAu.length` is `1` while the period has a default, and the `@ts-expect-error` is unused, which `tsc -p tsconfig.test.json` reports as TS2578).

- [ ] **Step 1: Write the failing test and update the pinned callers**

In `web/src/components/sceneRequest.test.ts`:
- Below the imports (after line 10) add:

```ts
/**
 * The fixed period the removed default carried. Still a valid period to walk
 * the lattice on (ceil(39.6 / 0.6) = 66 frames), so the lattice specs below keep
 * their meaning; what changed is that every caller now has to say it.
 */
const LEGACY_PERIOD_AU = 39.6
```

- Inside `describe('nextTimeAu', …)` replace every call `nextTimeAu(x)` that has a single argument with `nextTimeAu(x, LEGACY_PERIOD_AU)` — lines 175, 176, 179, 188, 198, 201, 206, 212, 213, 233 — and at line 429 (`fetch coordinator` simulation) replace `time = nextTimeAu(time)` with `time = nextTimeAu(time, LEGACY_PERIOD_AU)`. The assertions (0.6/1.2/1.8, 66 frames, wrap at 39, 12.4 → 13.2, the modulo-40 negative control) stay as they are.
- Add as the first test inside `describe('nextTimeAu', …)` (after line 172):

```ts
  it('requires the catalogue period: there is no 39.6 a.u. fallback (spec section 5)', () => {
    // Function.length counts the parameters before the first default. With
    // `periodAu = 39.6` it was 1, and a caller that forgot the period walked a
    // 66-frame lattice no catalogue period produces.
    expect(nextTimeAu.length).toBe(2)
    // @ts-expect-error -- the period is required; a missing one fails closed at t = 0
    expect(nextTimeAu(0.6)).toBe(0)
  })
```

In `web/src/components/useSceneAsset.test.tsx` add after the imports (after line 40):

```ts
/** A valid catalogue period for the playback host: 66 frames of 0.6 a.u. */
const PLAYBACK_PERIOD_AU = 39.6
```

and replace line 319 `setTimeAu((previous) => nextTimeAu(previous))` with `setTimeAu((previous) => nextTimeAu(previous, PLAYBACK_PERIOD_AU))`, and line 743 `time = nextTimeAu(time)` with `time = nextTimeAu(time, PLAYBACK_PERIOD_AU)`.

- [ ] **Step 2: Run and see it fail**

Run: `(cd web && npm exec --no -- vitest run src/components/sceneRequest.test.ts)`
Expected: FAIL — `requires the catalogue period…`: `expected 1 to be 2`.

Run: `(cd web && npm exec --no -- tsc -p tsconfig.test.json --noEmit)`
Expected: FAIL — `src/components/sceneRequest.test.ts(…): error TS2578: Unused '@ts-expect-error' directive.`

- [ ] **Step 3: Implement**

In `web/src/api/capability.ts` insert after line 190 (`export const TIME_GRID_STEP_AU = 0.2`):

```ts

/** Target spacing of the playback clock; one physical period is divided into whole frames. */
export const TARGET_TIME_STEP_AU = 0.6

/**
 * Frames per period on the playback lattice, or 0 when there is nothing to
 * play: a degenerate preset (period 0) or a period that is not a positive
 * finite number. Shared by `nextTimeAu` (src/components/sceneRequest.ts) and
 * `playbackFrames` (src/api/staticCatalog.ts), so the frames the static
 * catalogue exports are the frames playback visits.
 */
export function playbackFrameCount(periodAu: number): number {
  if (!Number.isFinite(periodAu) || periodAu <= 0) return 0
  return Math.max(1, Math.ceil(periodAu / TARGET_TIME_STEP_AU))
}

/**
 * Frame `frame` of `frames`, evenly spaced across the exact physical period
 * and snapped to the same 0.2 a.u. lattice the time slider shows; otherwise a
 * catalogue period such as 16.755... produces long binary decimals, range-step
 * mismatches and cache keys the UI cannot reproduce. Rounding each absolute
 * frame independently distributes the small timing error instead of
 * accumulating it.
 */
export function playbackFrameTime(frame: number, frames: number, periodAu: number): number {
  const ticks = Math.round((frame * periodAu) / frames / TIME_GRID_STEP_AU)
  return Number((ticks * TIME_GRID_STEP_AU).toFixed(12))
}
```

In `web/src/components/sceneRequest.ts` replace line 8 with:

```ts
import { playbackFrameCount, playbackFrameTime, type SceneRequestInputs } from '../api/capability'
```

and replace lines 162-194 (`TARGET_TIME_STEP_AU`, `DEFAULT_PLAYBACK_PERIOD_AU`, `nextTimeAu`) with:

```ts
/**
 * The next playback time, as a frame index rather than an accumulated sum.
 *
 * Adding 0.6 to a float and taking it modulo 40 does two damaging things: 40 is
 * not a whole number of steps, so the loop walks 200 distinct times before it
 * repeats, and the sum drifts off the grid (1.2 + 0.6 is 1.7999999999999998).
 * Every distinct time is a cache-missing request for a frame nobody will see
 * again. Counting frames instead means a lap revisits bit-identical values.
 *
 * `periodAu` is required: it is the selected catalogue entry's period scaled by
 * a_mu/Z^2 (ControlPanel.tsx:457-464). The old 39.6 a.u. default walked a
 * lattice no catalogue period produces, and on the static site those times are
 * requests nobody exported (spec section 5). A missing or invalid period fails
 * closed at t = 0, like a degenerate preset.
 */
export function nextTimeAu(time: number, periodAu: number): number {
  const frames = playbackFrameCount(periodAu)
  if (!Number.isFinite(time) || frames === 0) return 0
  const normalized = ((time % periodAu) + periodAu) % periodAu
  const frame = Math.round((normalized * frames) / periodAu) % frames
  return playbackFrameTime((frame + 1) % frames, frames, periodAu)
}
```

- [ ] **Step 4: Run and see it pass**

Run: `(cd web && npm exec --no -- vitest run src/components/sceneRequest.test.ts src/components/useSceneAsset.test.tsx src/components/ControlPanel.test.tsx)`
Expected: PASS (ControlPanel's playback spec at `ControlPanel.test.tsx:1319-1320` already passes periods explicitly).

Run: `npm --prefix web run typecheck && (cd web && npm exec --no -- tsc -p tsconfig.test.json --noEmit)`
Expected: both exit 0.

- [ ] **Step 5: Pre-commit gate (CLAUDE.md "提交前")**

Run: `npm --prefix web run test`
Expected: exit 0 — the pinned chain (`clean-coverage`, `tsc -p tsconfig.test.json --noEmit`, vitest with coverage, `assert-no-skips`, `assert-coverage-scope`) passes with 0 skipped and 0 todo, and every module in `web/coverage-scope.json` is at ≥ 90/85/90/90.

Run: `npm --prefix web run typecheck`
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add web/src/api/capability.ts web/src/components/sceneRequest.ts web/src/components/sceneRequest.test.ts web/src/components/useSceneAsset.test.tsx
git commit -m "$(cat <<'EOF'
fix(web): require the catalogue period for playback, share the frame lattice

Removes the 39.6 a.u. default of nextTimeAu (spec section 5).

Claude-Session: https://claude.ai/code/session_01E44DEzsc7Av26fc7nZ5rSo
EOF
)"
```

---

### Task B7: Static catalogue — manifest, transport, playback frames

**Files:**
- Create: `web/src/api/staticCatalog.ts`
- Create: `web/tools/fixtures/spec.json` (the contract's `spec.json` text verbatim; used by specs and the enumerator smoke. Part A's exporter cannot run in this worktree; after the merge, B15 regenerates this file from `DEFAULT_SPEC` and pins it byte for byte)
- Modify: `web/src/api/capability.ts` (insert `NOT_PRECOMPUTED_DETAIL` directly after `playbackFrameTime`, which B6 inserted after line 190)
- Test: `web/src/api/staticCatalog.test.ts`
- Modify: `web/coverage-scope.json` (both arrays, directly after `"src/api/sliceContract.ts"`)

**Interfaces:**
- Consumes: `CAPABILITY_ROUTE_CONSTRAINTS`, `Z_CONSTRAINT`, `playbackFrameCount`, `playbackFrameTime`, `NOT_PRECOMPUTED_DETAIL` (capability.ts), `MAXIMUM_SLICE_RESOLUTION`, `PRINCIPAL_PLANES`, `SLICE_OBSERVABLES` (sliceContract.ts), `requestKey`, `Transport` (transport.ts); files written by Part A (`data/manifest.json`, `data/files/<24 hex>.json|.bin`).
- Produces (contract):
  - `export interface StaticSpec` (JSON keys as-is; with `StaticEigenstateSpec`, `StaticSuperpositionSpec`)
  - `export interface StaticManifestEntry { file: string; status: number; content_type: string; headers: Record<string, string> }`
  - `export interface StaticManifest { format: 'quviz-static/1'; version: string; spec: StaticSpec; entries: Record<string, StaticManifestEntry> }`
  - `export function parseStaticManifest(raw: unknown): StaticManifest`
  - `export async function loadStaticManifest(dataBase: URL, signal?: AbortSignal): Promise<StaticManifest>`
  - `export function createStaticTransport(manifest: StaticManifest, dataBase: URL): Transport`
  - `export const NOT_PRECOMPUTED_DETAIL = '静态教材版未预计算这一组合。本地运行 quviz serve 可实时计算任意参数。'` — re-exported here, where the contract names it; defined in `capability.ts` (a runtime import from `capability.ts` into this module would be a cycle, since this module already imports `capability.ts` at runtime). It is the canonical `not_precomputed` wording (Global Constraints): the transport's 404 `detail` here, and the opening sentence of every overlay refusal in B8.
  - `export function playbackFrames(periodAu: number): readonly number[]`
  - extra: `export function parseStaticSpec(raw: unknown): StaticSpec` (the enumerator reads `spec.json` with it)

Validation rules (strict; unknown top-level keys such as `generated_by` are ignored): `format`; `version` = 16 lowercase hex (contract); `entries` keys start with `/api/`; `file` = `files/<24 lowercase hex>.json|.bin` (contract, and it blocks `../` or absolute URLs); `status` integer 200..599 and not 204/205/304 (the `Response` constructor rejects a body there); `content_type` non-empty printable ASCII; `headers` names `x-quviz-[a-z0-9-]+` (lowercase, contract), values printable ASCII. Spec numbers are held to the route ranges in `CAPABILITY_ROUTE_CONSTRAINTS` (samples 1000..120000, seed 0..2147483647, probability mass 0.5..0.99, seed count 1..96, resolution odd 49..513, z 0.1..20, n_max 1..8 — the store's n ceiling at `useSceneStore.ts:109`).

- [ ] **Step 1: Write the fixture and the failing test**

Create `web/tools/fixtures/spec.json`:

```json
{
  "format": "quviz-static-spec/1",
  "eigenstates": {
    "n_max": 4,
    "bases": ["real", "complex"],
    "z": 1,
    "representations": ["point_cloud", "isosurface", "slice", "streamlines"],
    "samples": 28000,
    "seed": 7,
    "resolution": 65,
    "probability_mass": 0.9,
    "seed_count": 48,
    "planes": ["xy", "xz", "yz"],
    "observables": ["probability_density", "wavefunction_real", "wavefunction_imag", "phase"]
  },
  "superpositions": {
    "presets": ["1s-2pz", "2s-2pz", "1s-3dz2", "2pplus-2pminus"],
    "representations": ["isosurface", "slice", "streamlines"],
    "resolution": 65,
    "probability_mass": 0.9,
    "seed_count": 48,
    "planes": ["xz"],
    "observables": ["probability_density", "wavefunction_real", "wavefunction_imag", "phase"],
    "frames": "playback-lattice"
  }
}
```

Create `web/src/api/staticCatalog.test.ts`:

```ts
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
    const raw = {
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
```

- [ ] **Step 2: Run and see it fail**

Run: `(cd web && npm exec --no -- vitest run src/api/staticCatalog.test.ts)`
Expected: FAIL — `Failed to resolve import "./staticCatalog" from "src/api/staticCatalog.test.ts"`.

- [ ] **Step 3: Implement**

In `web/src/api/capability.ts` insert directly after the closing brace of `playbackFrameTime` (added by B6 after line 190):

```ts

/**
 * What the static (GitHub Pages) site says about a combination its precomputed
 * catalogue does not hold (contracts, "B produces"). It is the ONE user-visible
 * wording for that case: the static transport answers a miss with it
 * (staticCatalog.ts), and every `not_precomputed` refusal of the capability
 * overlay below begins with it verbatim, so the textbook can quote it and the
 * status line always shows it.
 *
 * Defined here rather than in staticCatalog.ts, which re-exports it where the
 * contract names it: staticCatalog.ts imports this module at runtime, so this
 * module may import staticCatalog.ts only for types.
 */
export const NOT_PRECOMPUTED_DETAIL =
  '静态教材版未预计算这一组合。本地运行 quviz serve 可实时计算任意参数。'
```

Create `web/src/api/staticCatalog.ts`:

```ts
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
```

Edit `web/coverage-scope.json`: insert `"src/api/staticCatalog.ts",` directly after `"src/api/sliceContract.ts",` in both arrays (it sorts before `"src/api/transport.ts"`).

- [ ] **Step 4: Run and see it pass**

Run: `(cd web && npm exec --no -- vitest run src/api/staticCatalog.test.ts src/guards.test.ts)`
Expected: PASS.

Coverage spot check: `(cd web && npm exec --no -- vitest run src/api/staticCatalog.test.ts --coverage --coverage.thresholds.perFile=false --coverage.thresholds.statements=0 --coverage.thresholds.branches=0 --coverage.thresholds.functions=0 --coverage.thresholds.lines=0) | grep -E "staticCatalog\.ts"`
Expected: statements, functions, lines ≥ 90 and branches ≥ 85 on the `staticCatalog.ts` row.

Run: `npm --prefix web run typecheck`
Expected: exit 0.

- [ ] **Step 5: Pre-commit gate (CLAUDE.md "提交前")**

Run: `npm --prefix web run test`
Expected: exit 0 — the pinned chain (`clean-coverage`, `tsc -p tsconfig.test.json --noEmit`, vitest with coverage, `assert-no-skips`, `assert-coverage-scope`) passes with 0 skipped and 0 todo, and every module in `web/coverage-scope.json` is at ≥ 90/85/90/90.

Run: `npm --prefix web run typecheck`
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add web/src/api/capability.ts web/src/api/staticCatalog.ts web/src/api/staticCatalog.test.ts web/tools/fixtures/spec.json web/coverage-scope.json
git commit -m "$(cat <<'EOF'
feat(web): static catalogue manifest, transport and playback frames

Claude-Session: https://claude.ai/code/session_01E44DEzsc7Av26fc7nZ5rSo
EOF
)"
```

---

### Task B8: Static capability overlay (`not_precomputed`, pinning, frame values)

**Files:**
- Modify: `web/src/api/capability.ts` — imports 1-13; `ParameterBound` 60-65; refusals 94-107; `CapabilityInputs` 109-117; insert the static-overlay section between `superpositionCapability` (ends line 685) and `capabilityFor` (687-702, replaced); `clampParameter` + `planSceneRequest` 750-824 (replaced). Line numbers are before Task B6's insertion; after B6 they shift by +28 — locate by the quoted code. `EIGENSTATE_S_SLICE_FLOORS` (344-350) is not touched.
- Test: `web/src/api/capability.static.test.ts` (new spec file; spec files are not coverage-gated)

**Interfaces:**
- Consumes: `requestsForPlan` (B4), `requestKey` (B1), `StaticManifest`, `StaticSpec` (B7, type-only import).
- Produces (contract): `ParameterBound.values?: readonly number[]`; refusal status `'not_precomputed'` (`NotPrecomputedCapability`, in the `Refusal` union); `export function setStaticCatalog(manifest: StaticManifest | null): void`; `export function isPrecomputed(plan: ScenePlan, inputs: SceneRequestInputs): boolean`.
- Produces (extra, used by B9/B10/B12 and Part D): `CapabilityInputs.superpositionTerms?: string`; `export function clampToBound(bound: ParameterBound, value: number): number`; `export function chargeBound(): ParameterBound`; `export function staticCatalogSpec(): StaticSpec | null`; `export function staticCapabilityFor(inputs: CapabilityInputs, spec: StaticSpec): Capability`; `export function planForCapability(capability: AvailableCapability, inputs: SceneRequestInputs): ScenePlan`; `export const STATIC_MISS_REASON: string` (`=== NOT_PRECOMPUTED_DETAIL`); `export const STATIC_A_MU = 1`.
- Wording rule (Global Constraints, "Canonical wording"): every `not_precomputed` reason starts with `NOT_PRECOMPUTED_DETAIL` (B7) verbatim; a specification limit appends one sentence naming it. Pinned below by `opens every not_precomputed reason with the contract sentence the textbook quotes`.
- Kept: `ParameterBound.step` stays optional (`step?: number`). The contract prints `step: number`, but `ControlPanel.tsx:63` compares `bound.step === undefined`, which TS rejects (TS2367) for a required `number`, and ControlPanel belongs to Part D. Every bound the matrix emits carries a step.

Frame values: the overlay indexes the manifest's superposition keys by `terms` and offers their sorted `time` values. `capabilityFor` cannot see the catalogue period (`CapabilityInputs` carries none; `setStaticCatalog` receives only the manifest), and the manifest keys are exactly `playbackFrames(period)` because the enumerator (B12) wrote them with it — B12's round-trip spec proves it against the real catalogue fixture.

No production code switches exhaustively on `Capability['status']` (grep: only `status === 'available'` / `!== 'available'` guards in `App.tsx`, `ControlPanel.tsx`, `Legend.tsx`, `useSceneStore.ts`, `useSceneAsset.ts`), and no status→label map exists; `unavailable.reason` is rendered verbatim. `web/src/api/capability.test.ts:1016` is a live-mode sweep and keeps its accepted set `['available', 'unsupported', 'not_implemented']` on purpose: live mode must never produce `not_precomputed`.

- [ ] **Step 1: Write the failing test** — create `web/src/api/capability.static.test.ts`:

```ts
import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it } from 'vitest'

import {
  capabilityFor,
  chargeBound,
  clampToBound,
  isPrecomputed,
  planForCapability,
  planSceneRequest,
  setStaticCatalog,
  STATIC_MISS_REASON,
  staticCapabilityFor,
  staticCatalogSpec,
  Z_CONSTRAINT,
  type Capability,
  type SceneKind,
  type SceneRequestInputs,
} from './capability'
import {
  metadataRequest,
  pointCloudRequest,
  sliceRequest,
  superpositionIsosurfaceRequest,
  type ApiRequest,
} from './requests'
import { NOT_PRECOMPUTED_DETAIL, parseStaticSpec, type StaticManifest, type StaticSpec } from './staticCatalog'
import { requestKey } from './transport'
import type { OrbitalParameters, RepresentationKind } from './types'

const SPEC = parseStaticSpec(
  JSON.parse(readFileSync(new URL('../../tools/fixtures/spec.json', import.meta.url), 'utf-8')),
)
const FILE = 'files/000000000000000000000000.json'
const TERMS = '1,0,0,0.7071067811865476;2,1,0,0.7071067811865476'
const key = (request: ApiRequest): string => requestKey(request.route, request.query)

function manifestWith(keys: readonly string[], spec: StaticSpec = SPEC): StaticManifest {
  return {
    format: 'quviz-static/1',
    version: '0000000000000000',
    spec,
    entries: Object.fromEntries(
      keys.map((entryKey) => [entryKey, { file: FILE, status: 200, content_type: 'application/json', headers: {} }]),
    ),
  }
}

function withSpec(patch: {
  eigenstates?: Partial<StaticSpec['eigenstates']>
  superpositions?: Partial<StaticSpec['superpositions']>
}): StaticSpec {
  return {
    ...SPEC,
    eigenstates: { ...SPEC.eigenstates, ...patch.eigenstates },
    superpositions: { ...SPEC.superpositions, ...patch.superpositions },
  }
}

const orbital = (patch: Partial<OrbitalParameters> = {}): OrbitalParameters => ({
  n: 2,
  l: 1,
  m: 0,
  z: 1,
  basis: 'real',
  ...patch,
})

const inputs = (patch: Partial<SceneRequestInputs> = {}): SceneRequestInputs => ({
  mode: 'eigenstate',
  representation: 'point_cloud',
  orbital: orbital(),
  samples: 28000,
  seed: 7,
  resolution: 65,
  probabilityMass: 0.9,
  seedCount: 48,
  superpositionTerms: TERMS,
  superpositionSliceResolutionFloor: 65,
  superpositionStreamlineSeedCountMax: 40,
  superpositionBasis: 'complex',
  aMu: 1,
  timeAu: 0,
  ...patch,
})

function available(capability: Capability) {
  if (capability.status !== 'available') throw new Error(JSON.stringify(capability))
  return capability
}

const frameKeys = (terms: string, times: readonly number[]): string[] =>
  times.map((time) => key(superpositionIsosurfaceRequest(terms, 'complex', 1, 1, time, 65, 0.9)))

afterEach(() => {
  setStaticCatalog(null)
})

describe('live mode: no catalogue installed', () => {
  it('is exactly the route matrix', () => {
    expect(staticCatalogSpec()).toBeNull()
    expect(chargeBound()).toBe(Z_CONSTRAINT.uiBound)
    expect(available(capabilityFor({ mode: 'eigenstate', orbital: orbital(), representation: 'point_cloud' })).parameters).toEqual({
      samples: { min: 1000, max: 120000, step: 1000 },
      seed: { min: 0, max: 2147483647, step: 1 },
    })
    const plan = planSceneRequest(inputs())
    if (plan.status !== 'available') throw new Error('expected a live plan')
    expect(isPrecomputed(plan, inputs())).toBe(false)
  })

  it('plans any time the route accepts, without snapping', () => {
    const plan = planSceneRequest(inputs({ mode: 'superposition', representation: 'isosurface', timeAu: 0.5 }))
    expect(plan).toMatchObject({ status: 'available', params: { time: 0.5 } })
  })
})

describe('static pinning', () => {
  it('pins the point-cloud samples and seed at the exported values', () => {
    setStaticCatalog(manifestWith([]))
    expect(staticCatalogSpec()).toEqual(SPEC)
    expect(available(capabilityFor({ mode: 'eigenstate', orbital: orbital(), representation: 'point_cloud' })).parameters).toEqual({
      samples: { min: 28000, max: 28000, step: 1000 },
      seed: { min: 7, max: 7, step: 1 },
    })
  })

  it('pins the isosurface grid at the lowest legal odd resolution for the state', () => {
    setStaticCatalog(manifestWith([]))
    const at = (patch: Partial<OrbitalParameters>) =>
      available(capabilityFor({ mode: 'eigenstate', orbital: orbital(patch), representation: 'isosurface' })).parameters
    expect(at({ n: 1, l: 0 }).resolution).toEqual({ min: 65, max: 65, step: 2 })
    expect(at({ n: 4, l: 3 }).resolution).toEqual({ min: 81, max: 81, step: 2 })
    expect(at({ n: 2 }).probabilityMass).toEqual({ min: 0.9, max: 0.9, step: 0.01 })
  })

  it('pins an eigenstate slice at its state floor and offers the catalogued planes', () => {
    setStaticCatalog(manifestWith([]))
    const slice = available(
      capabilityFor({ mode: 'eigenstate', orbital: orbital({ n: 4, l: 0 }), representation: 'slice' }),
    )
    expect(slice.parameters.resolution).toEqual({ min: 97, max: 97, step: 2 })
    expect(slice.parameters.aMu).toEqual({ min: 1, max: 1, step: 0.005 })
    expect(slice.planes).toEqual(['xy', 'xz', 'yz'])
    expect(slice.observables).toEqual(['probability_density', 'wavefunction_real', 'wavefunction_imag', 'phase'])
  })

  it('narrows superposition slices to the catalogued plane and the catalogue slice floor', () => {
    setStaticCatalog(manifestWith([]))
    const slice = available(
      capabilityFor({
        mode: 'superposition',
        orbital: orbital(),
        representation: 'slice',
        superpositionSliceResolutionFloor: 103,
      }),
    )
    expect(slice.planes).toEqual(['xz'])
    expect(slice.parameters.resolution).toEqual({ min: 103, max: 103, step: 2 })
    // No terms given: the clock keeps the route's interval.
    expect(slice.parameters.timeAu).toEqual({ min: -1000, max: 1000, step: 0.2 })
  })

  it('pins superposition streamlines under the catalogue ceiling', () => {
    setStaticCatalog(manifestWith([]))
    const streamlines = available(
      capabilityFor({
        mode: 'superposition',
        orbital: orbital(),
        representation: 'streamlines',
        superpositionStreamlineSeedCountMax: 24,
      }),
    )
    expect(streamlines.parameters.seedCount).toEqual({ min: 24, max: 24, step: 1 })
  })

  it('holds the charge at the catalogue Z', () => {
    setStaticCatalog(manifestWith([]))
    expect(chargeBound()).toEqual({ min: 1, max: 1, step: 0.1 })
  })

  it('offers the exported playback frames of the selected superposition as values', () => {
    setStaticCatalog(manifestWith([...frameKeys(TERMS, [1.2, 0, 0.6]), ...frameKeys('2,0,0,1', [0])]))
    const clock = available(
      capabilityFor({ mode: 'superposition', orbital: orbital(), representation: 'slice', superpositionTerms: TERMS }),
    ).parameters.timeAu
    expect(clock).toEqual({ min: 0, max: 1.2, step: 0.2, values: [0, 0.6, 1.2] })
  })

  it('finds no frames in keys that carry none', () => {
    setStaticCatalog(
      manifestWith([
        '/api/orbitals/catalog',
        key(pointCloudRequest(orbital(), 28000, 7)),
        '/api/superposition/slice?time=0',
        '/api/superposition/slice?terms=abc',
        '/api/superposition/slice?terms=abc&time=soon',
      ]),
    )
    const clock = available(
      capabilityFor({ mode: 'superposition', orbital: orbital(), representation: 'isosurface', superpositionTerms: 'abc' }),
    ).parameters.timeAu
    expect(clock).toEqual({ min: -1000, max: 1000, step: 0.2 })
  })
})

describe('static refusals', () => {
  const refusal = (capability: Capability) => {
    if (capability.status === 'available') throw new Error('expected a refusal')
    return capability
  }

  it('refuses n above the catalogue, naming the limit and the live alternative', () => {
    setStaticCatalog(manifestWith([]))
    const refused = refusal(capabilityFor({ mode: 'eigenstate', orbital: orbital({ n: 5 }), representation: 'point_cloud' }))
    expect(refused.status).toBe('not_precomputed')
    expect(refused.reason).toContain('n ≤ 4')
    expect(refused.reason).toContain('quviz serve')
  })

  it('refuses a charge the catalogue was not exported at, in both modes', () => {
    setStaticCatalog(manifestWith([]))
    for (const mode of ['eigenstate', 'superposition'] as const) {
      const refused = refusal(capabilityFor({ mode, orbital: orbital({ z: 2 }), representation: 'slice' }))
      expect(refused.status).toBe('not_precomputed')
      expect(refused.reason).toContain('Z = 1')
    }
  })

  it('refuses a basis the catalogue left out, naming it', () => {
    setStaticCatalog(manifestWith([], withSpec({ eigenstates: { bases: ['complex'] } })))
    expect(refusal(capabilityFor({ mode: 'eigenstate', orbital: orbital(), representation: 'point_cloud' })).reason).toContain('实基')
    setStaticCatalog(manifestWith([], withSpec({ eigenstates: { bases: ['real'] } })))
    expect(
      refusal(capabilityFor({ mode: 'eigenstate', orbital: orbital({ basis: 'complex' }), representation: 'point_cloud' })).reason,
    ).toContain('复基')
  })

  it('refuses a representation the catalogue left out, per mode', () => {
    setStaticCatalog(manifestWith([], withSpec({ eigenstates: { representations: ['point_cloud'] } })))
    const eigen = refusal(capabilityFor({ mode: 'eigenstate', orbital: orbital(), representation: 'isosurface' }))
    expect(eigen).toMatchObject({ status: 'not_precomputed' })
    expect(eigen.reason).toContain('本征态')
    setStaticCatalog(manifestWith([], withSpec({ superpositions: { representations: ['isosurface'] } })))
    const superposed = refusal(capabilityFor({ mode: 'superposition', orbital: orbital(), representation: 'slice' }))
    expect(superposed).toMatchObject({ status: 'not_precomputed' })
    expect(superposed.reason).toContain('叠加态')
  })

  it('keeps a physics or route refusal first, reworded without route paths', () => {
    setStaticCatalog(manifestWith([]))
    const realFlow = refusal(capabilityFor({ mode: 'eigenstate', orbital: orbital(), representation: 'streamlines' }))
    expect(realFlow.status).toBe('unsupported')
    const threeS = refusal(capabilityFor({ mode: 'eigenstate', orbital: orbital({ n: 3, l: 0 }), representation: 'isosurface' }))
    expect(threeS.status).toBe('unsupported')
    expect(threeS.reason).toContain('等值面计算')
    const highN = refusal(capabilityFor({ mode: 'eigenstate', orbital: orbital({ n: 5 }), representation: 'isosurface' }))
    expect(highN.status).toBe('unsupported')
    expect(highN.reason).toContain('等值面计算 仅接受 n ≤ 4')
    const cloud = refusal(capabilityFor({ mode: 'superposition', orbital: orbital(), representation: 'point_cloud' }))
    expect(cloud.status).toBe('not_implemented')
    expect(cloud.reason).toContain('电子云采样')
  })

  it('opens every not_precomputed reason with the contract sentence the textbook quotes', () => {
    // One user-visible wording: chapter 0 quotes it verbatim, the status chip
    // prints the reason verbatim, and the pages e2e suite matches "未预计算".
    expect(NOT_PRECOMPUTED_DETAIL).toContain('未预计算')
    expect(STATIC_MISS_REASON).toBe(NOT_PRECOMPUTED_DETAIL)
    const reasons: string[] = []
    const collect = (capability: Capability): void => {
      expect(capability.status).toBe('not_precomputed')
      if (capability.status !== 'available') reasons.push(capability.reason)
    }
    setStaticCatalog(manifestWith([]))
    // n above n_max, and a charge the catalogue was not exported at.
    collect(capabilityFor({ mode: 'eigenstate', orbital: orbital({ n: 5 }), representation: 'point_cloud' }))
    collect(capabilityFor({ mode: 'superposition', orbital: orbital({ z: 2 }), representation: 'slice' }))
    // A basis, and an eigenstate representation, the specification left out.
    setStaticCatalog(manifestWith([], withSpec({ eigenstates: { bases: ['complex'], representations: ['point_cloud'] } })))
    collect(capabilityFor({ mode: 'eigenstate', orbital: orbital(), representation: 'point_cloud' }))
    collect(capabilityFor({ mode: 'eigenstate', orbital: orbital({ basis: 'complex' }), representation: 'isosurface' }))
    // A superposition representation the specification left out.
    setStaticCatalog(manifestWith([], withSpec({ superpositions: { representations: ['isosurface'] } })))
    collect(
      capabilityFor({
        mode: 'superposition',
        orbital: orbital(),
        representation: 'streamlines',
        superpositionStreamlineSeedCountMax: 40,
      }),
    )
    // A cell the specification covers whose request the manifest lacks.
    const miss = planSceneRequest(inputs())
    if (miss.status === 'available') throw new Error('expected a catalogue miss')
    reasons.push(miss.reason)

    expect(reasons).toHaveLength(6)
    for (const reason of reasons) {
      expect(reason.startsWith(NOT_PRECOMPUTED_DETAIL), reason).toBe(true)
    }
    expect(reasons[0]).toBe(`${NOT_PRECOMPUTED_DETAIL}目录只收录 n ≤ 4 的本征态；当前态 n = 5。`)
    expect(reasons[5]).toBe(NOT_PRECOMPUTED_DETAIL)
  })

  it('never shows a /api path in any static refusal', () => {
    setStaticCatalog(manifestWith([]))
    const modes: SceneKind[] = ['eigenstate', 'superposition']
    const representations: RepresentationKind[] = ['point_cloud', 'isosurface', 'slice', 'streamlines']
    const reasons: string[] = []
    for (const mode of modes) {
      for (const representation of representations) {
        for (let n = 1; n <= 8; n += 1) {
          for (let l = 0; l < n; l += 1) {
            for (const m of [0, l]) {
              for (const basis of ['real', 'complex'] as const) {
                for (const z of [1, 2]) {
                  const capability = capabilityFor({
                    mode,
                    orbital: { n, l, m, z, basis },
                    representation,
                    superpositionStreamlineSeedCountMax: n % 2 === 0 ? 40 : undefined,
                  })
                  if (capability.status !== 'available') reasons.push(capability.reason)
                }
              }
            }
          }
        }
      }
    }
    expect(reasons.length).toBeGreaterThan(100)
    expect(reasons.filter((reason) => reason.includes('/api'))).toEqual([])
    expect(STATIC_MISS_REASON).not.toContain('/api')
  })
})

describe('static planning', () => {
  const openingKeys = [key(pointCloudRequest(orbital(), 28000, 7)), key(metadataRequest(orbital()))]

  it('plans a catalogued cell exactly as the live planner would', () => {
    setStaticCatalog(manifestWith(openingKeys))
    const plan = planSceneRequest(inputs())
    expect(plan).toEqual({
      status: 'available',
      endpoint: '/api/orbitals/point-cloud',
      params: { n: 2, l: 1, m: 0, basis: 'real', z: 1, samples: 28000, seed: 7 },
      latency: 'fast',
    })
    if (plan.status !== 'available') throw new Error('unreachable')
    expect(isPrecomputed(plan, inputs())).toBe(true)
  })

  it('refuses a cell whose request the catalogue lacks, with the catalogue reason', () => {
    setStaticCatalog(manifestWith([]))
    expect(planSceneRequest(inputs())).toEqual({ status: 'not_precomputed', reason: STATIC_MISS_REASON })
  })

  it('needs the metadata request as well as the cloud', () => {
    setStaticCatalog(manifestWith([openingKeys[0]]))
    expect(planSceneRequest(inputs()).status).toBe('not_precomputed')
  })

  it('sends the pinned tunables even when the store still holds other values', () => {
    setStaticCatalog(manifestWith(openingKeys))
    expect(planSceneRequest(inputs({ samples: 50000, seed: 99 }))).toMatchObject({
      status: 'available',
      params: { samples: 28000, seed: 7 },
    })
  })

  it('snaps a superposition time to the nearest exported frame', () => {
    setStaticCatalog(manifestWith(frameKeys(TERMS, [0, 0.6, 1.2])))
    const at = (timeAu: number) =>
      planSceneRequest(inputs({ mode: 'superposition', representation: 'isosurface', timeAu }))
    expect(at(0.5)).toMatchObject({ status: 'available', params: { time: 0.6 } })
    expect(at(7)).toMatchObject({ status: 'available', params: { time: 1.2 } })
  })

  it('plans an eigenstate slice on a catalogued plane', () => {
    setStaticCatalog(manifestWith([key(sliceRequest(orbital(), 65, 1, 'xy', 'phase'))]))
    expect(planSceneRequest(inputs({ representation: 'slice', plane: 'xy', sliceObservable: 'phase' })).status).toBe('available')
  })
})

describe('build-time helpers', () => {
  it('pin from a spec without an installed catalogue', () => {
    const capability = available(
      staticCapabilityFor({ mode: 'eigenstate', orbital: orbital({ n: 4, l: 3 }), representation: 'isosurface' }, SPEC),
    )
    expect(staticCatalogSpec()).toBeNull()
    expect(capability.parameters.resolution).toEqual({ min: 81, max: 81, step: 2 })
  })

  it('plan exactly what the installed catalogue plans', () => {
    const request = inputs({ orbital: orbital({ n: 3, l: 2, m: 2, basis: 'complex' }), representation: 'streamlines' })
    const built = planForCapability(available(staticCapabilityFor(request, SPEC)), request)
    setStaticCatalog(manifestWith(['/api/orbitals/current-field?n=3&l=2&m=2&z=1&basis=complex&seed_count=48']))
    expect(planSceneRequest(request)).toEqual(built)
  })
})

describe('clampToBound', () => {
  const frames = { min: 0, max: 1.2, step: 0.2, values: [0, 0.6, 1.2] }

  it('moves to the nearest listed value, the earlier one on a tie, the first one for NaN', () => {
    expect(clampToBound(frames, 0.25)).toBe(0)
    expect(clampToBound(frames, 0.35)).toBe(0.6)
    expect(clampToBound(frames, 0.3)).toBe(0)
    expect(clampToBound(frames, 99)).toBe(1.2)
    expect(clampToBound(frames, Number.NaN)).toBe(0)
  })

  it('falls back to the interval when the value list is empty', () => {
    expect(clampToBound({ min: 1, max: 3, step: 1, values: [] }, 7.4)).toBe(3)
  })

  it('rounds counts but never a fractional increment', () => {
    expect(clampToBound({ min: 1000, max: 120000, step: 1000 }, 20000.4)).toBe(20000)
    expect(clampToBound({ min: 0.5, max: 0.99, step: 0.01 }, 0.905)).toBe(0.905)
  })
})

describe('setStaticCatalog(null)', () => {
  it('restores the live matrix', () => {
    setStaticCatalog(manifestWith([]))
    setStaticCatalog(null)
    expect(staticCatalogSpec()).toBeNull()
    expect(
      available(capabilityFor({ mode: 'eigenstate', orbital: orbital(), representation: 'point_cloud' })).parameters.samples,
    ).toEqual({ min: 1000, max: 120000, step: 1000 })
  })
})
```

- [ ] **Step 2: Run and see it fail**

Run: `(cd web && npm exec --no -- vitest run src/api/capability.static.test.ts)`
Expected: FAIL — `setStaticCatalog is not a function` (and the other new exports are undefined).

- [ ] **Step 3: Implement** — in `web/src/api/capability.ts`:

Replace the imports (lines 1-13) with:

```ts
import { requestsForPlan } from './requests'
import {
  MAXIMUM_SLICE_RESOLUTION,
  MINIMUM_SLICE_RESOLUTION,
  PRINCIPAL_PLANES,
  SLICE_OBSERVABLES,
} from './sliceContract'
import type { StaticManifest, StaticSpec } from './staticCatalog'
import { requestKey } from './transport'
import type {
  BasisKind,
  OrbitalParameters,
  PrincipalPlane,
  RepresentationKind,
  SliceObservable,
} from './types'
```

Replace `ParameterBound` (lines 60-65) with:

```ts
export interface ParameterBound {
  min: number
  max: number
  /** Slider increment. A UI convenience; the routes accept any value in range. */
  step?: number
  /**
   * The only values this cell can answer, ascending, when it cannot answer
   * the whole interval. Static mode alone sets it: the superposition clock of
   * a precomputed catalogue holds only the exported playback frames, which are
   * not evenly spaced (1s + 3d_z2 steps 5.4 -> 5.8). `min`/`max` still bracket
   * them, so a consumer that ignores `values` stays in range; `clampToBound`
   * snaps to the nearest one.
   */
  values?: readonly number[]
}
```

Replace lines 100-107 (`NotImplementedCapability` through the `Capability` alias) with:

```ts
/** Nothing forbids this cell; it does not exist yet. */
export interface NotImplementedCapability {
  status: 'not_implemented'
  reason: string
}

/**
 * The physics and the route allow this cell, but the static (GitHub Pages)
 * catalogue holds no precomputed answer for it. A third promise, distinct from
 * both others: a live server (`quviz serve`) would answer it.
 */
export interface NotPrecomputedCapability {
  status: 'not_precomputed'
  reason: string
}

export type Refusal = UnsupportedCapability | NotImplementedCapability | NotPrecomputedCapability
export type Capability = AvailableCapability | Refusal
```

In `CapabilityInputs` (lines 109-117) add after `superpositionStreamlineSeedCountMax?: number`:

```ts
  /**
   * The selected superposition, read only by the static overlay: the
   * catalogue's playback frames are indexed by these terms. Optional because
   * the store's clamping calls do not need the clock.
   */
  superpositionTerms?: string
```

Insert, directly after the closing brace of `superpositionCapability` (line 685) and before the `capabilityFor` doc comment, the static-overlay section:

```ts
/* ------------------------------------------------------------ static overlay */

/**
 * The static (GitHub Pages) build answers from a precomputed catalogue, and
 * this overlay is how the matrix says so. It sits on top of the route rows,
 * never instead of them:
 *
 *   1. a refusal the routes or the physics make stays that refusal -- only its
 *      wording loses the `/api/...` paths, which name nothing on a site with
 *      no API;
 *   2. a cell the catalogue specification (spec.json) never covered becomes
 *      `not_precomputed`, with a reason naming the limit;
 *   3. every tunable the catalogue fixed is pinned `min = max` at the value the
 *      live UI would have sent for the specification's default, so the store's
 *      clamps, the panel and the planner all hold the one exported value; the
 *      superposition clock offers the exported frames as `values`;
 *   4. `planSceneRequest` refuses any concrete request whose literal key the
 *      manifest lacks (`STATIC_MISS_REASON`).
 *
 * Every `not_precomputed` reason opens with `NOT_PRECOMPUTED_DETAIL` verbatim,
 * so what a reader sees for "not in the catalogue" is one sentence wherever it
 * comes from: this planner, a spec limit, or the static transport's 404.
 */

/**
 * Why the planner refuses a request the catalogue has no entry for: the
 * contract sentence alone. The build exported every request this matrix plans
 * for the specification, so a miss names no particular limit.
 */
export const STATIC_MISS_REASON: string = NOT_PRECOMPUTED_DETAIL

/** A refusal the specification explains: the contract sentence, then the limit. */
function notPrecomputed(limit: string): string {
  return `${NOT_PRECOMPUTED_DETAIL}${limit}`
}

/** The reduced-mass ratio every static request carries: hydrogen. No control changes it. */
export const STATIC_A_MU = 1

/** Readable names for the routes, used instead of `/api/...` paths on the static site. */
const STATIC_ROUTE_NAMES: readonly (readonly [string, string])[] = [
  [POINT_CLOUD_ENDPOINT, '电子云采样'],
  [ISOSURFACE_ENDPOINT, '等值面计算'],
  [CURRENT_FIELD_ENDPOINT, '概率流计算'],
  [SLICE_ENDPOINT, '平面切片计算'],
  [SUPERPOSITION_ISOSURFACE_ENDPOINT, '叠加态等值面计算'],
  [SUPERPOSITION_CURRENT_FIELD_ENDPOINT, '叠加态概率流计算'],
  [SUPERPOSITION_SLICE_ENDPOINT, '叠加态切片计算'],
]

/** The routes whose requests carry a playback time. */
const TIMED_ENDPOINTS: ReadonlySet<string> = new Set<string>([
  SUPERPOSITION_ISOSURFACE_ENDPOINT,
  SUPERPOSITION_CURRENT_FIELD_ENDPOINT,
  SUPERPOSITION_SLICE_ENDPOINT,
])

interface StaticOverlay {
  spec: StaticSpec
  keys: ReadonlySet<string>
  framesByTerms: ReadonlyMap<string, readonly number[]>
}

let staticOverlay: StaticOverlay | null = null

function withoutRoutePaths(reason: string): string {
  return STATIC_ROUTE_NAMES.reduce((text, [path, name]) => text.split(path).join(name), reason)
}

/** The exported playback times of each superposition, read off the manifest keys. */
function indexFrames(keys: readonly string[]): ReadonlyMap<string, readonly number[]> {
  const frames = new Map<string, Set<number>>()
  for (const key of keys) {
    const mark = key.indexOf('?')
    if (mark < 0 || !TIMED_ENDPOINTS.has(key.slice(0, mark))) continue
    const query = new URLSearchParams(key.slice(mark + 1))
    const terms = query.get('terms')
    const time = Number(query.get('time') ?? Number.NaN)
    if (terms === null || !Number.isFinite(time)) continue
    const times = frames.get(terms) ?? new Set<number>()
    times.add(time)
    frames.set(terms, times)
  }
  return new Map(
    [...frames].map(([terms, times]): [string, readonly number[]] => [
      terms,
      [...times].sort((a, b) => a - b),
    ]),
  )
}

/** The specification's own limits, checked after the physics has had its say. */
function staticRefusal(inputs: CapabilityInputs, spec: StaticSpec): string | null {
  const eigen = spec.eigenstates
  if (inputs.orbital.z !== eigen.z) {
    return notPrecomputed(`目录只收录 Z = ${eigen.z} 的类氢态；当前 Z = ${inputs.orbital.z}。`)
  }
  if (inputs.mode === 'superposition') {
    return spec.superpositions.representations.includes(inputs.representation)
      ? null
      : notPrecomputed('目录没有为叠加态收录这种表示法。')
  }
  if (inputs.orbital.n > eigen.n_max) {
    return notPrecomputed(`目录只收录 n ≤ ${eigen.n_max} 的本征态；当前态 n = ${inputs.orbital.n}。`)
  }
  if (!eigen.bases.includes(inputs.orbital.basis)) {
    return notPrecomputed(`目录没有收录${inputs.orbital.basis === 'real' ? '实基' : '复基'}本征态。`)
  }
  return eigen.representations.includes(inputs.representation)
    ? null
    : notPrecomputed('目录没有为本征态收录这种表示法。')
}

function staticCapability(
  live: Capability,
  inputs: CapabilityInputs,
  spec: StaticSpec,
  frames: readonly number[] | undefined,
): Capability {
  if (live.status !== 'available') return { ...live, reason: withoutRoutePaths(live.reason) }
  const refusal = staticRefusal(inputs, spec)
  if (refusal !== null) return { status: 'not_precomputed', reason: refusal }
  const section = inputs.mode === 'superposition' ? spec.superpositions : spec.eigenstates
  const exported: Record<Exclude<ParameterId, 'timeAu'>, number> = {
    samples: spec.eigenstates.samples,
    seed: spec.eigenstates.seed,
    resolution: section.resolution,
    probabilityMass: section.probability_mass,
    seedCount: section.seed_count,
    aMu: STATIC_A_MU,
  }
  const parameters: Partial<Record<ParameterId, ParameterBound>> = {}
  for (const [id, bound] of Object.entries(live.parameters) as [ParameterId, ParameterBound][]) {
    if (id === 'timeAu') {
      parameters.timeAu =
        frames === undefined
          ? bound
          : { min: frames[0], max: frames[frames.length - 1], step: bound.step, values: frames }
    } else {
      // The value the live planner would send for the specification's default:
      // exactly what the enumerator exported for this state.
      const value = clampToBound(bound, exported[id])
      parameters[id] = { min: value, max: value, step: bound.step }
    }
  }
  return {
    ...live,
    parameters,
    ...(live.planes === undefined
      ? {}
      : { planes: live.planes.filter((plane) => section.planes.includes(plane)) }),
    ...(live.observables === undefined
      ? {}
      : { observables: live.observables.filter((observable) => section.observables.includes(observable)) }),
  }
}

/** Install the static catalogue (src/main.tsx does, before the first render); null = live. */
export function setStaticCatalog(manifest: StaticManifest | null): void {
  if (manifest === null) {
    staticOverlay = null
    return
  }
  const keys = Object.keys(manifest.entries)
  staticOverlay = { spec: manifest.spec, keys: new Set(keys), framesByTerms: indexFrames(keys) }
}

/** The installed catalogue's specification, or null in live mode. */
export function staticCatalogSpec(): StaticSpec | null {
  return staticOverlay === null ? null : staticOverlay.spec
}

/** The charge range: the route's, or the one Z the static catalogue was exported at. */
export function chargeBound(): ParameterBound {
  if (staticOverlay === null) return Z_CONSTRAINT.uiBound
  const z = staticOverlay.spec.eigenstates.z
  return { min: z, max: z, step: Z_CONSTRAINT.uiBound.step }
}

/** The static answer for a spec, without an installed catalogue: the enumerator's view. */
export function staticCapabilityFor(inputs: CapabilityInputs, spec: StaticSpec): Capability {
  return staticCapability(liveCapabilityFor(inputs), inputs, spec, undefined)
}

/** True when every request this plan makes has a catalogue entry. Live mode: false. */
export function isPrecomputed(plan: ScenePlan, inputs: SceneRequestInputs): boolean {
  if (staticOverlay === null) return false
  const { keys } = staticOverlay
  return requestsForPlan(plan, inputs).every((request) => keys.has(requestKey(request.route, request.query)))
}
```

Replace `capabilityFor` (the doc line 687 and the function 688-702) with:

```ts
/** The route matrix alone, before any static-catalogue overlay. */
function liveCapabilityFor({
  mode,
  orbital,
  representation,
  superpositionSliceResolutionFloor,
  superpositionStreamlineSeedCountMax,
}: CapabilityInputs): Capability {
  return mode === 'superposition'
    ? superpositionCapability(
        representation,
        superpositionSliceResolutionFloor,
        superpositionStreamlineSeedCountMax,
      )
    : eigenstateCapability(orbital, representation)
}

/** What this state-kind x representation cell can do, and at what cost. */
export function capabilityFor(inputs: CapabilityInputs): Capability {
  const live = liveCapabilityFor(inputs)
  if (staticOverlay === null) return live
  const frames =
    inputs.mode === 'superposition' && inputs.superpositionTerms !== undefined
      ? staticOverlay.framesByTerms.get(inputs.superpositionTerms)
      : undefined
  return staticCapability(live, inputs, staticOverlay.spec, frames)
}
```

Replace lines 750-824 (the `clampParameter` doc + function, and the `planSceneRequest` doc + function) with:

```ts
/**
 * A value the declared bound admits.
 *
 * An integer `step` marks a count the route parses as an int, so a slider that
 * hands us 20000.4 is rounded rather than sent to be rejected. A fractional
 * step (a mass, a clock) is a display increment only and never snaps the value.
 * A bound that lists `values` admits those alone (the static catalogue's
 * playback frames): the value moves to the nearest one -- the earlier one on a
 * tie, the first one for a value that is not a number.
 */
export function clampToBound(bound: ParameterBound, value: number): number {
  if (bound.values !== undefined && bound.values.length > 0) {
    return bound.values.reduce((best, candidate) =>
      Math.abs(candidate - value) < Math.abs(best - value) ? candidate : best,
    )
  }
  const integral = bound.step !== undefined && Number.isInteger(bound.step)
  const candidate = integral ? Math.round(value) : value
  return Math.min(bound.max, Math.max(bound.min, candidate))
}

/**
 * The concrete request an available cell makes for these inputs.
 *
 * The parameters sent are exactly the ones the capability declares -- there is
 * no second list here that could drift from the matrix -- and every one of them
 * is clamped into its declared bound before it leaves.
 *
 * Superposition requests spell out `basis` and `z` even when they equal the
 * route's defaults. Omitting them is what let the server quietly render a
 * different state from the one the panel was describing.
 *
 * `a_mu` used to be spelled into that same block by hand, which put it outside
 * the one mechanism that keeps a sent value inside a declared bound, and sent
 * it to two routes at a time when four read it. It is a declared parameter
 * now, on those four rows and nowhere else.
 *
 * Exported for the build-time enumerator (src/api/staticEnumeration.ts), which
 * plans from `staticCapabilityFor` exactly as the static site plans from
 * `capabilityFor`.
 */
export function planForCapability(
  capability: AvailableCapability,
  inputs: SceneRequestInputs,
): ScenePlan {
  const { orbital } = inputs
  const params: Record<string, string | number> =
    inputs.mode === 'superposition'
      ? {
          terms: inputs.superpositionTerms,
          basis: inputs.superpositionBasis,
        }
      : {
          n: orbital.n,
          l: orbital.l,
          m: orbital.m,
          basis: orbital.basis,
        }
  // Charge is present on every scene route but is not a generic slider. Its
  // range comes from the route table -- or, on the static site, from the one Z
  // the catalogue was exported at -- so the input and the planner agree.
  params[Z_CONSTRAINT.wireName] = clampToBound(chargeBound(), orbital.z)
  for (const [id, bound] of Object.entries(capability.parameters) as [
    ParameterId,
    ParameterBound,
  ][]) {
    params[WIRE_NAME[id]] = clampToBound(bound, parameterValue(inputs, id))
  }
  if (capability.planes !== undefined) {
    params[PLANE_PARAM] = declaredChoice(capability.planes, inputs.plane, DEFAULT_PLANE)
  }
  if (capability.observables !== undefined) {
    params[OBSERVABLE_PARAM] = declaredChoice(
      capability.observables,
      inputs.sliceObservable,
      DEFAULT_SLICE_OBSERVABLE,
    )
  }
  return {
    status: 'available',
    endpoint: capability.endpoint,
    params,
    latency: capability.latency,
  }
}

/**
 * The concrete request for these inputs, or the refusal that says why there
 * isn't one. On the static site a cell the matrix allows is still refused when
 * the catalogue has no answer for the exact request it would make.
 */
export function planSceneRequest(inputs: SceneRequestInputs): ScenePlanResult {
  const capability = capabilityFor(inputs)
  if (capability.status !== 'available') {
    return capability
  }
  const plan = planForCapability(capability, inputs)
  if (staticOverlay === null || isPrecomputed(plan, inputs)) {
    return plan
  }
  return { status: 'not_precomputed', reason: STATIC_MISS_REASON }
}
```

- [ ] **Step 4: Run and see it pass**

Run: `(cd web && npm exec --no -- vitest run src/api/capability.static.test.ts src/api/capability.test.ts src/state/useSceneStore.test.ts src/components/ControlPanel.test.tsx src/components/useSceneAsset.test.tsx src/api/requests.test.ts)`
Expected: PASS (live behaviour unchanged; `capability.test.ts:1016` still sees only live statuses).

Run: `uv run --locked --no-sync pytest tests/test_slice_builders.py -q`
Expected: PASS — `test_frontend_high_s_floor_table_is_derived_from_the_python_physics` still parses the untouched `EIGENSTATE_S_SLICE_FLOORS` block.

Run: `npm --prefix web run typecheck`
Expected: exit 0 (`ControlPanel.tsx` compiles against the widened `Refusal` union and `ParameterBound`).

Coverage spot check: `(cd web && npm exec --no -- vitest run src/api/capability.static.test.ts src/api/capability.test.ts src/components/sceneRequest.test.ts src/api/staticCatalog.test.ts --coverage --coverage.thresholds.perFile=false --coverage.thresholds.statements=0 --coverage.thresholds.branches=0 --coverage.thresholds.functions=0 --coverage.thresholds.lines=0) | grep -E "capability\.ts"`
Expected: ≥ 90/85/90/90.

- [ ] **Step 5: Pre-commit gate (CLAUDE.md "提交前")**

Run: `npm --prefix web run test`
Expected: exit 0 — the pinned chain (`clean-coverage`, `tsc -p tsconfig.test.json --noEmit`, vitest with coverage, `assert-no-skips`, `assert-coverage-scope`) passes with 0 skipped and 0 todo, and every module in `web/coverage-scope.json` is at ≥ 90/85/90/90.

Run: `npm --prefix web run typecheck`
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add web/src/api/capability.ts web/src/api/capability.static.test.ts
git commit -m "$(cat <<'EOF'
feat(web): static capability overlay with not_precomputed refusals

Pins the exported tunables, narrows planes and observables, offers the
exported playback frames as bound values, and rewords route refusals
without /api paths in static mode.

Claude-Session: https://claude.ai/code/session_01E44DEzsc7Av26fc7nZ5rSo
EOF
)"
```

---

### Task B9: Store and scene status honour the static catalogue

**Files:**
- Modify: `web/src/state/useSceneStore.ts` (import line 3; `normalizeOrbital` 108-118; insert `snapTimeAu` after `clampSeedCount` (ends line 172); `setSuperpositionZ` 394-400; `setTimeAu` 402)
- Modify: `web/src/api/types.ts` (`SceneStatus.unavailable`, line 286)
- Modify: `web/src/components/useSceneAsset.ts` (the refusal `emit`, lines 398-401 before B4 — the block `unavailable: { kind: inputs.representation, reason: plan.reason }`)
- Test: `web/src/state/useSceneStore.test.ts` (imports 1-5; append a `describe`), `web/src/components/useSceneAsset.test.tsx` (imports; test at 458-470; one new test after it)

**Interfaces:**
- Consumes: `chargeBound`, `clampToBound`, `capabilityFor`, `setStaticCatalog` (B8).
- Produces: `SceneStatus.unavailable.refusal?: 'unsupported' | 'not_implemented' | 'not_precomputed'` (always set by `useSceneAsset`; lets Part D label "未预计算" without parsing text). Store behaviour: in static mode `orbital.z` and `superpositionZ` are held at the catalogue Z, `setTimeAu` snaps to the nearest exported frame; in live mode nothing changes.

- [ ] **Step 1: Write the failing tests**

In `web/src/state/useSceneStore.test.ts` replace the imports (lines 1-5) with:

```ts
import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { planSceneRequest, setStaticCatalog } from '../api/capability'
import { superpositionIsosurfaceRequest } from '../api/requests'
import { parseStaticSpec, type StaticManifest } from '../api/staticCatalog'
import { requestKey } from '../api/transport'
import { selectSceneRequestInputs } from '../components/sceneRequest'
import { useSceneStore } from './useSceneStore'
```

and append:

```ts
describe('static catalogue pins', () => {
  const SPEC = parseStaticSpec(
    JSON.parse(readFileSync(new URL('../../tools/fixtures/spec.json', import.meta.url), 'utf-8')),
  )
  const frameKey = (timeAu: number): string => {
    const request = superpositionIsosurfaceRequest(INITIAL.superpositionTerms, 'complex', 1, 1, timeAu, 65, 0.9)
    return requestKey(request.route, request.query)
  }
  const manifest = (keys: readonly string[]): StaticManifest => ({
    format: 'quviz-static/1',
    version: '0000000000000000',
    spec: SPEC,
    entries: Object.fromEntries(
      keys.map((key) => [
        key,
        { file: 'files/000000000000000000000000.json', status: 200, content_type: 'application/json', headers: {} },
      ]),
    ),
  })

  afterEach(() => {
    setStaticCatalog(null)
  })

  it('holds both charges at the catalogue Z', () => {
    setStaticCatalog(manifest([]))
    read().setOrbital({ z: 3 })
    read().setSuperpositionZ(4)
    expect(read().orbital.z).toBe(1)
    expect(read().superpositionZ).toBe(1)
  })

  it('snaps a superposition time to the nearest exported frame', () => {
    setStaticCatalog(manifest([frameKey(0), frameKey(0.6), frameKey(1.2)]))
    read().setMode('superposition')
    read().setTimeAu(0.5)
    expect(read().timeAu).toBe(0.6)
    read().setTimeAu(99)
    expect(read().timeAu).toBe(1.2)
  })

  it('passes a time through when the cell itself is refused', () => {
    setStaticCatalog(manifest([]))
    read().setOrbital({ n: 5 })
    read().setTimeAu(3.3)
    expect(read().timeAu).toBe(3.3)
  })

  it('re-clamps the grid to the pinned value the planner will send', () => {
    setStaticCatalog(manifest([]))
    read().setOrbital({ n: 4, l: 3, m: 0 })
    read().setRepresentation('isosurface')
    expect(read().resolution).toBe(81)
    read().setOrbital({ n: 2, l: 1 })
    expect(read().resolution).toBe(65)
    // What the panel holds is what the planner would send (the catalogue lacks
    // the key here, so the plan is refused rather than re-spelled).
    expect(planSceneRequest(selectSceneRequestInputs(read())).status).toBe('not_precomputed')
  })

  it('leaves live-mode time and charge alone', () => {
    read().setTimeAu(0.5)
    read().setOrbital({ z: 3 })
    expect(read().timeAu).toBe(0.5)
    expect(read().orbital.z).toBe(3)
  })
})
```

In `web/src/components/useSceneAsset.test.tsx` add to the imports:

```ts
import { setStaticCatalog } from '../api/capability'
import { NOT_PRECOMPUTED_DETAIL, parseStaticSpec } from '../api/staticCatalog'
```

in the test `refuses a superposition point cloud without issuing a request` (lines 458-470) add after line 468:

```ts
    expect(status.unavailable?.refusal).toBe('not_implemented')
```

and add directly after that test:

```ts
  it('refuses a scene the static catalogue does not hold, without a request, and says so', async () => {
    const spec = parseStaticSpec(
      JSON.parse(readFileSync(resolve(process.cwd(), 'tools', 'fixtures', 'spec.json'), 'utf-8')),
    )
    setStaticCatalog({ format: 'quviz-static/1', version: '0000000000000000', spec, entries: {} })
    try {
      const inputs: SceneAssetInputs = { ...baseInputs, representation: 'point_cloud' }
      const { capture, statuses, element } = host(inputs)
      const tree = await mount(element(inputs))

      expect(calls).toHaveLength(0)
      expect(capture.current?.asset).toBeNull()
      expect(latest(statuses).unavailable).toMatchObject({ kind: 'point_cloud', refusal: 'not_precomputed' })
      // End to end, the status carries the contract sentence verbatim: what the
      // status chip prints, what chapter 0 quotes, what the pages e2e matches.
      expect(latest(statuses).unavailable?.reason).toBe(NOT_PRECOMPUTED_DETAIL)
      await tree.unmount()
    } finally {
      setStaticCatalog(null)
    }
  })
```

- [ ] **Step 2: Run and see them fail**

Run: `(cd web && npm exec --no -- vitest run src/state/useSceneStore.test.ts src/components/useSceneAsset.test.tsx)`
Expected: FAIL — `holds both charges at the catalogue Z` (`expected 3 to be 1`), `snaps a superposition time…` (`expected 0.5 to be 0.6`), and `expected undefined to be 'not_implemented'` / the `refusal: 'not_precomputed'` match.

- [ ] **Step 3: Implement**

`web/src/api/types.ts` — replace line 286 with:

```ts
  unavailable?: {
    kind: string
    reason: string
    /**
     * Which refusal: the physics or a route says no (`unsupported`), nothing
     * was built for it (`not_implemented`), or the static catalogue holds no
     * precomputed answer (`not_precomputed`). Optional so a status built by
     * hand stays valid; `useSceneAsset` always sets it.
     */
    refusal?: 'unsupported' | 'not_implemented' | 'not_precomputed'
  }
```

`web/src/components/useSceneAsset.ts` — in the refusal branch replace

```ts
      emit({
        loading: false,
        unavailable: { kind: inputs.representation, reason: plan.reason },
      })
```

with

```ts
      emit({
        loading: false,
        unavailable: { kind: inputs.representation, reason: plan.reason, refusal: plan.status },
      })
```

`web/src/state/useSceneStore.ts`:
- Line 3 becomes:

```ts
import { capabilityFor, chargeBound, clampToBound, type ParameterBound } from '../api/capability'
```

- Replace `normalizeOrbital` (lines 108-118) with:

```ts
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
```

- Insert after `clampSeedCount` (after line 172):

```ts

/**
 * The time the store may hold.
 *
 * Live, any time passes through: the slider owns its 0.2 a.u. lattice and the
 * planner clamps into the route range. The static catalogue holds only its
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
```

- Replace `setSuperpositionZ` (lines 394-400) with:

```ts
  setSuperpositionZ: (superpositionZ) => {
    const charge = chargeBound()
    set({ superpositionZ: Math.max(charge.min, Math.min(charge.max, superpositionZ)) })
  },
```

- Replace `setTimeAu: (timeAu) => set({ timeAu }),` (line 402) with:

```ts
  setTimeAu: (timeAu) => set((state) => ({ timeAu: snapTimeAu(state, timeAu) })),
```

`Z_CONSTRAINT` is no longer imported by the store (its two uses are replaced), which keeps `noUnusedLocals` satisfied.

- [ ] **Step 4: Run and see it pass**

Run: `(cd web && npm exec --no -- vitest run src/state/useSceneStore.test.ts src/components/useSceneAsset.test.tsx src/components/ControlPanel.test.tsx src/App.test.tsx src/components/Legend.test.tsx src/api/client.test.ts)`
Expected: PASS.

Run: `npm --prefix web run typecheck`
Expected: exit 0.

- [ ] **Step 5: Pre-commit gate (CLAUDE.md "提交前")**

Run: `npm --prefix web run test`
Expected: exit 0 — the pinned chain (`clean-coverage`, `tsc -p tsconfig.test.json --noEmit`, vitest with coverage, `assert-no-skips`, `assert-coverage-scope`) passes with 0 skipped and 0 todo, and every module in `web/coverage-scope.json` is at ≥ 90/85/90/90.

Run: `npm --prefix web run typecheck`
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add web/src/state/useSceneStore.ts web/src/state/useSceneStore.test.ts web/src/api/types.ts web/src/components/useSceneAsset.ts web/src/components/useSceneAsset.test.tsx
git commit -m "$(cat <<'EOF'
feat(web): store and scene status honour the static catalogue

Claude-Session: https://claude.ai/code/session_01E44DEzsc7Av26fc7nZ5rSo
EOF
)"
```

---

### Task B10: Hash deep links, embed flag, remembered superposition catalogue

**Files:**
- Create: `web/src/state/urlState.ts`
- Test: `web/src/state/urlState.test.ts`
- Modify: `web/src/api/client.ts` (module state + two exports above `fetchSuperpositionCatalog`; its body), `web/src/api/client.test.ts` (import; one appended `describe`), `web/coverage-scope.json` (both arrays, `"src/state/urlState.ts"` directly before `"src/state/useSceneStore.ts"`)

**Interfaces:**
- Consumes: store actions `setOrbital`, `setSuperposition`, `setMode`, `setPlane`, `setSliceObservable`, `setRepresentation`, `setTimeAu`, `subscribe` (`web/src/state/useSceneStore.ts:68-105`); `fetchSuperpositionCatalog`; `Z_CONSTRAINT`, `CAPABILITY_ROUTE_CONSTRAINTS` (for the link value ranges).
- Produces (contract):

```ts
export interface DeepLinkState {
  mode?: 'eigenstate' | 'superposition'
  n?: number; l?: number; m?: number; z?: number; basis?: BasisKind
  preset?: string; t?: number
  rep?: RepresentationKind; plane?: PrincipalPlane; obs?: SliceObservable
  embed?: boolean
}
export function parseDeepLink(hash: string): DeepLinkState
export function serializeDeepLink(state: DeepLinkState): string   // key order embed,mode,n,l,m,z,basis,preset,t,rep,plane,obs; no leading '#'
export function bindUrlState(): () => void
export function isEmbedMode(): boolean
```
- Produces (extra): `export function deepLinkFromStore(state, presetId: string | undefined, embed: boolean): DeepLinkState`, `export function applyDeepLink(link: DeepLinkState, catalog: readonly SuperpositionPreset[] | null): void`; in client.ts `export function lastSuperpositionCatalog(): readonly SuperpositionPreset[] | null` and `export function rememberSuperpositionCatalog(catalog: readonly SuperpositionPreset[] | null): void`.

Behaviour decisions: writes use `history.replaceState` only (no history entries), skip when the hash would not change, and swallow Safari's replaceState rate-limit `SecurityError`; `t` is written only while paused (a 420 ms playback clock must not rewrite the URL every tick); `z` only when ≠ 1; `plane`/`obs` only for slices; an empty start hash is left alone until the store changes; the superposition catalogue is fetched **only** for a `preset` link when none is known yet, and writes are suspended until it resolves (plain page loads add no request — the visual gate's served-fixture list at `web/e2e/slice.spec.ts:559-562` is exact); a newer hash wins over a stale catalogue answer.

Deep links while playing (for Parts D and E, and for the contracts file): a running clock writes **no** `t` — the hash carries the preset and representation only, and is not rewritten on playback ticks; pausing writes the frame on screen as `t` (omitted when it is 0). Applying a link that carries `mode=superposition` stops playback (`setMode` and `setSuperposition` both set `playing: false`) and then sets `t` (snapped to the nearest exported frame in static mode by B9's `snapTimeAu`).

Known merge interaction, resolved in B14 (not here): this task is written against the pre-A tree, whose `setSuperposition` takes four arguments. Part A's A11 makes a fifth argument, `defaultRepresentation`, required. After the merge, B14 passes `preset.default_representation` in `applyDeepLink` and changes the expectation of `uses a catalogue it already has without fetching` from `…&rep=isosurface` to `…&rep=slice&plane=xz&obs=probability_density` (2s-2pz publishes `slice`). Until then, the four-argument call and the `rep=isosurface` expectation below are correct for this branch.

- [ ] **Step 1: Write the failing tests**

Append to `web/src/api/client.test.ts` (add `lastSuperpositionCatalog` and `rememberSuperpositionCatalog` to the `./client` import):

```ts
describe('the remembered superposition catalogue', () => {
  afterEach(() => {
    rememberSuperpositionCatalog(null)
  })

  it('is what the last successful fetch parsed; a failed fetch leaves it alone', async () => {
    rememberSuperpositionCatalog(null)
    routeFetch({ '/api/superposition/catalog': () => errorResponse('catalog offline', 500) })
    await expect(fetchSuperpositionCatalog()).rejects.toThrow('catalog offline')
    expect(lastSuperpositionCatalog()).toBeNull()

    routeFetch({ '/api/superposition/catalog': () => jsonResponse(SUPERPOSITION_CATALOG_FIXTURE) })
    const fetched = await fetchSuperpositionCatalog()
    expect(lastSuperpositionCatalog()).toEqual(fetched)

    routeFetch({ '/api/superposition/catalog': () => jsonResponse([{ id: 'bad' }]) })
    await expect(fetchSuperpositionCatalog()).rejects.toThrow('superposition catalog[0]')
    expect(lastSuperpositionCatalog()).toEqual(fetched)
  })
})
```

Create `web/src/state/urlState.test.ts`:

```ts
/** @vitest-environment jsdom */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { rememberSuperpositionCatalog } from '../api/client'
import type { SuperpositionPreset } from '../api/types'
import {
  applyDeepLink,
  bindUrlState,
  deepLinkFromStore,
  isEmbedMode,
  parseDeepLink,
  serializeDeepLink,
  type DeepLinkState,
} from './urlState'
import { useSceneStore } from './useSceneStore'

const CATALOG_RAW: unknown = JSON.parse(
  readFileSync(resolve(process.cwd(), '..', 'tests', 'fixtures', 'visual', 'catalog-superposition.json'), 'utf-8'),
)
const CATALOG = CATALOG_RAW as SuperpositionPreset[]
const preset = (id: string): SuperpositionPreset => {
  const found = CATALOG.find((entry) => entry.id === id)
  if (found === undefined) throw new Error(`no preset ${id}`)
  return found
}

const INITIAL = useSceneStore.getState()
const read = () => useSceneStore.getState()
const setHash = (hash: string): void => {
  window.history.replaceState(null, '', hash === '' ? '/' : `/${hash}`)
}
const hashChanged = (): void => {
  window.dispatchEvent(new HashChangeEvent('hashchange'))
}
const flush = (): Promise<void> => new Promise((done) => setTimeout(done, 0))

interface Pending {
  resolve: (value: unknown) => void
  reject: (error: unknown) => void
}
let pending: Pending[] = []

/** Every catalogue fetch waits until the spec settles it by hand. */
function deferFetches() {
  pending = []
  const fetchMock = vi.fn(
    (_input: RequestInfo | URL, _init?: RequestInit) =>
      new Promise<unknown>((resolveFetch, rejectFetch) => {
        pending.push({ resolve: resolveFetch, reject: rejectFetch })
      }),
  )
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}
const catalogResponse = () => ({ ok: true, status: 200, json: async () => CATALOG_RAW })

let unbind: (() => void) | null = null

beforeEach(() => {
  useSceneStore.setState(INITIAL, true)
  rememberSuperpositionCatalog(null)
  setHash('')
})

afterEach(() => {
  unbind?.()
  unbind = null
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('parseDeepLink', () => {
  it('reads the spec eigenstate example', () => {
    expect(
      parseDeepLink('#mode=eigenstate&n=2&l=1&m=0&basis=real&rep=point_cloud&plane=xz&obs=probability_density'),
    ).toEqual({
      mode: 'eigenstate',
      n: 2,
      l: 1,
      m: 0,
      basis: 'real',
      rep: 'point_cloud',
      plane: 'xz',
      obs: 'probability_density',
    })
  })

  it('reads the spec superposition example, with or without "#"', () => {
    const expected = { mode: 'superposition', preset: '1s-2pz', t: 3.6, rep: 'isosurface' }
    expect(parseDeepLink('#mode=superposition&preset=1s-2pz&t=3.6&rep=isosurface')).toEqual(expected)
    expect(parseDeepLink('mode=superposition&preset=1s-2pz&t=3.6&rep=isosurface')).toEqual(expected)
  })

  it('reads the embed flag both ways', () => {
    expect(parseDeepLink('#embed=1&z=2.5')).toEqual({ embed: true, z: 2.5 })
    expect(parseDeepLink('#embed=0')).toEqual({ embed: false })
  })

  it.each([
    ['mode=hologram', 'mode'],
    ['n=0', 'n'],
    ['n=9', 'n'],
    ['n=2.5', 'n'],
    ['n=2&l=2', 'l'],
    ['l=1&m=2', 'm'],
    ['z=0', 'z'],
    ['z=abc', 'z'],
    ['z=1e1', 'z'],
    ['basis=quaternion', 'basis'],
    ['preset=../etc', 'preset'],
    ['preset=1S-2pz', 'preset'],
    ['t=2000', 't'],
    ['t=.5', 't'],
    ['rep=hologram', 'rep'],
    ['plane=xw', 'plane'],
    ['obs=charge', 'obs'],
    ['embed=yes', 'embed'],
  ])('drops an invalid value: %s', (hash, dropped) => {
    expect(parseDeepLink(hash)).not.toHaveProperty(dropped)
  })

  it.each(['%E0%A4%A', '&&&', '=1', '#', 'n=%ZZ'])('never throws on %s', (hash) => {
    expect(parseDeepLink(hash)).toEqual({})
  })
})

describe('serializeDeepLink', () => {
  it('writes keys in the contract order whatever order the object has', () => {
    const state: DeepLinkState = {
      obs: 'phase',
      plane: 'xy',
      rep: 'slice',
      basis: 'complex',
      z: 2,
      m: -1,
      l: 2,
      n: 3,
      mode: 'eigenstate',
      embed: true,
    }
    expect(serializeDeepLink(state)).toBe('embed=1&mode=eigenstate&n=3&l=2&m=-1&z=2&basis=complex&rep=slice&plane=xy&obs=phase')
  })

  it('omits absent keys and a false embed flag', () => {
    expect(serializeDeepLink({ embed: false, mode: 'superposition', preset: undefined, t: 0.6 })).toBe('mode=superposition&t=0.6')
  })

  it.each([
    'mode=eigenstate&n=2&l=1&m=0&basis=real&rep=point_cloud&plane=xz&obs=probability_density',
    'mode=superposition&preset=1s-2pz&t=3.6&rep=isosurface',
    'embed=1&mode=superposition&preset=1s-3dz2&t=5.8&rep=slice&plane=xz&obs=phase',
  ])('round-trips %s', (link) => {
    expect(serializeDeepLink(parseDeepLink(link))).toBe(link)
    expect(parseDeepLink(serializeDeepLink(parseDeepLink(link)))).toEqual(parseDeepLink(link))
  })
})

describe('deepLinkFromStore', () => {
  it('writes the default eigenstate without z, plane or observable', () => {
    expect(serializeDeepLink(deepLinkFromStore(read(), undefined, false))).toBe(
      'mode=eigenstate&n=2&l=1&m=0&basis=real&rep=point_cloud',
    )
  })

  it('writes a charge other than 1 and the plane of a slice', () => {
    useSceneStore.setState({
      orbital: { n: 3, l: 2, m: -1, z: 2, basis: 'complex' },
      representation: 'slice',
      plane: 'xy',
      sliceObservable: 'phase',
    })
    expect(serializeDeepLink(deepLinkFromStore(read(), undefined, true))).toBe(
      'embed=1&mode=eigenstate&n=3&l=2&m=-1&z=2&basis=complex&rep=slice&plane=xy&obs=phase',
    )
  })

  it('writes a superposition by preset id, with its time only while paused and non-zero', () => {
    useSceneStore.setState({ mode: 'superposition', representation: 'isosurface', timeAu: 3.6, playing: false })
    expect(serializeDeepLink(deepLinkFromStore(read(), '1s-2pz', false))).toBe(
      'mode=superposition&preset=1s-2pz&t=3.6&rep=isosurface',
    )
    useSceneStore.setState({ playing: true })
    expect(serializeDeepLink(deepLinkFromStore(read(), '1s-2pz', false))).toBe('mode=superposition&preset=1s-2pz&rep=isosurface')
    useSceneStore.setState({ playing: false, timeAu: 0 })
    expect(serializeDeepLink(deepLinkFromStore(read(), undefined, false))).toBe('mode=superposition&rep=isosurface')
  })
})

describe('applyDeepLink', () => {
  it('applies an eigenstate link through the store actions', () => {
    applyDeepLink(parseDeepLink('mode=eigenstate&n=3&l=2&m=-1&basis=complex&rep=slice&plane=xy&obs=phase'), null)
    expect(read()).toMatchObject({
      mode: 'eigenstate',
      orbital: { n: 3, l: 2, m: -1, z: 1, basis: 'complex' },
      representation: 'slice',
      plane: 'xy',
      sliceObservable: 'phase',
    })
  })

  it('resolves a superposition preset through the catalogue, then its time', () => {
    applyDeepLink(parseDeepLink('mode=superposition&preset=1s-3dz2&t=5.8&rep=streamlines'), CATALOG)
    expect(read()).toMatchObject({
      mode: 'superposition',
      superpositionTerms: preset('1s-3dz2').terms,
      superpositionLabel: preset('1s-3dz2').label,
      superpositionSliceResolutionFloor: 103,
      superpositionStreamlineSeedCountMax: 24,
      representation: 'streamlines',
      timeAu: 5.8,
    })
  })

  it('ignores an unknown preset, a missing catalogue and an eigenstate time', () => {
    applyDeepLink({ mode: 'superposition', preset: 'nope' }, CATALOG)
    expect(read().superpositionTerms).toBe(INITIAL.superpositionTerms)
    applyDeepLink({ preset: '1s-3dz2' }, null)
    expect(read().superpositionTerms).toBe(INITIAL.superpositionTerms)
    useSceneStore.setState(INITIAL, true)
    applyDeepLink({ t: 3 }, null)
    expect(read().timeAu).toBe(0)
  })

  it('changes nothing for an empty link', () => {
    applyDeepLink({}, CATALOG)
    expect(read()).toBe(INITIAL)
  })
})

describe('bindUrlState', () => {
  it('applies an eigenstate link at start, canonicalises it, and fetches nothing', () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    setHash('#n=3&l=2&m=-1&basis=complex')

    unbind = bindUrlState()

    expect(read().orbital).toEqual({ n: 3, l: 2, m: -1, z: 1, basis: 'complex' })
    expect(window.location.hash).toBe('#mode=eigenstate&n=3&l=2&m=-1&basis=complex&rep=point_cloud')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('leaves an empty hash alone until the store changes', () => {
    const replace = vi.spyOn(window.history, 'replaceState')
    unbind = bindUrlState()
    expect(replace).not.toHaveBeenCalled()
    expect(window.location.hash).toBe('')

    read().setOrbital({ n: 3 })
    expect(window.location.hash).toBe('#mode=eigenstate&n=3&l=1&m=0&basis=real&rep=point_cloud')
  })

  it('rewrites the hash with replaceState, never adding a history entry', () => {
    const push = vi.spyOn(window.history, 'pushState')
    const length = window.history.length
    unbind = bindUrlState()

    read().setRepresentation('slice')
    read().setPlane('xy')

    expect(push).not.toHaveBeenCalled()
    expect(window.history.length).toBe(length)
    expect(window.location.hash).toBe('#mode=eigenstate&n=2&l=1&m=0&basis=real&rep=slice&plane=xy&obs=probability_density')
  })

  it('does not rewrite the hash on playback ticks, and records the time on pause', () => {
    unbind = bindUrlState()
    read().setMode('superposition')
    read().setPlaying(true)
    const replace = vi.spyOn(window.history, 'replaceState')

    read().setTimeAu(0.6)
    read().setTimeAu(1.2)
    expect(replace).not.toHaveBeenCalled()

    read().setPlaying(false)
    expect(window.location.hash).toBe('#mode=superposition&t=1.2&rep=isosurface')
  })

  it('writes no preset id for a superposition the catalogue does not list', () => {
    rememberSuperpositionCatalog(CATALOG)
    unbind = bindUrlState()
    useSceneStore.setState({ mode: 'superposition', superpositionTerms: '3,0,0,1', representation: 'isosurface' })
    expect(window.location.hash).toBe('#mode=superposition&rep=isosurface')
    useSceneStore.setState({ superpositionTerms: preset('2s-2pz').terms })
    expect(window.location.hash).toBe('#mode=superposition&preset=2s-2pz&rep=isosurface')
  })

  it('follows a hashchange', () => {
    unbind = bindUrlState()
    setHash('#mode=eigenstate&n=4&l=3&m=2&basis=complex')
    hashChanged()
    expect(read().orbital).toEqual({ n: 4, l: 3, m: 2, z: 1, basis: 'complex' })
  })

  it('keeps the embed flag in every rewrite', () => {
    setHash('#embed=1&n=3')
    unbind = bindUrlState()
    expect(isEmbedMode()).toBe(true)
    read().setRepresentation('isosurface')
    expect(window.location.hash.startsWith('#embed=1&mode=eigenstate&n=3')).toBe(true)
  })

  it('resolves a preset link once the catalogue arrives, and writes the hash only then', async () => {
    const fetchMock = deferFetches()
    setHash('#mode=superposition&preset=1s-3dz2&t=5.8&rep=slice&plane=xz&obs=phase')
    const replace = vi.spyOn(window.history, 'replaceState')

    unbind = bindUrlState()
    expect(read().mode).toBe('superposition')
    expect(read().superpositionTerms).toBe(INITIAL.superpositionTerms)
    expect(replace).not.toHaveBeenCalled()
    expect(String(fetchMock.mock.calls[0][0])).toBe('/api/superposition/catalog')

    pending[0].resolve(catalogResponse())
    await flush()

    expect(read()).toMatchObject({
      superpositionTerms: preset('1s-3dz2').terms,
      superpositionSliceResolutionFloor: 103,
      superpositionStreamlineSeedCountMax: 24,
      representation: 'slice',
      plane: 'xz',
      sliceObservable: 'phase',
      timeAu: 5.8,
    })
    expect(window.location.hash).toBe('#mode=superposition&preset=1s-3dz2&t=5.8&rep=slice&plane=xz&obs=phase')
  })

  it('uses a catalogue it already has without fetching', () => {
    rememberSuperpositionCatalog(CATALOG)
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    setHash('#mode=superposition&preset=2s-2pz')

    unbind = bindUrlState()

    expect(fetchMock).not.toHaveBeenCalled()
    expect(read().superpositionTerms).toBe(preset('2s-2pz').terms)
    expect(window.location.hash).toBe('#mode=superposition&preset=2s-2pz&rep=isosurface')
  })

  it('falls back to the default superposition when the catalogue cannot load', async () => {
    deferFetches()
    setHash('#mode=superposition&preset=1s-3dz2')
    unbind = bindUrlState()

    pending[0].reject(new TypeError('offline'))
    await flush()

    expect(read().mode).toBe('superposition')
    expect(read().superpositionTerms).toBe(INITIAL.superpositionTerms)
    expect(window.location.hash).toBe('#mode=superposition&rep=isosurface')
  })

  it('lets a newer hash win over a stale catalogue answer', async () => {
    deferFetches()
    setHash('#mode=superposition&preset=1s-3dz2')
    unbind = bindUrlState()

    setHash('#mode=eigenstate&n=3&l=0&m=0')
    hashChanged()
    pending[0].resolve(catalogResponse())
    await flush()

    expect(read().mode).toBe('eigenstate')
    expect(read().orbital.n).toBe(3)
    expect(window.location.hash).toBe('#mode=eigenstate&n=3&l=0&m=0&basis=real&rep=point_cloud')
  })

  it('stops following, writing and applying after unbind', async () => {
    deferFetches()
    setHash('#mode=superposition&preset=1s-3dz2')
    const stop = bindUrlState()
    stop()

    pending[0].resolve(catalogResponse())
    await flush()
    expect(read().superpositionTerms).toBe(INITIAL.superpositionTerms)

    const before = window.location.hash
    read().setOrbital({ n: 4 })
    expect(window.location.hash).toBe(before)
    setHash('#n=1')
    hashChanged()
    expect(read().orbital.n).toBe(4)
  })

  it('swallows a replaceState rate-limit error', () => {
    unbind = bindUrlState()
    vi.spyOn(window.history, 'replaceState').mockImplementation(() => {
      throw new DOMException('rate limited', 'SecurityError')
    })
    expect(() => read().setOrbital({ n: 3 })).not.toThrow()
    expect(read().orbital.n).toBe(3)
  })
})

describe('isEmbedMode', () => {
  it('reads the flag from the current hash', () => {
    setHash('#embed=1&n=2')
    expect(isEmbedMode()).toBe(true)
    setHash('#n=2')
    expect(isEmbedMode()).toBe(false)
    setHash('')
    expect(isEmbedMode()).toBe(false)
  })
})
```

- [ ] **Step 2: Run and see it fail**

Run: `(cd web && npm exec --no -- vitest run src/state/urlState.test.ts src/api/client.test.ts)`
Expected: FAIL — `Failed to resolve import "./urlState"`; client: `rememberSuperpositionCatalog is not a function`.

- [ ] **Step 3: Implement**

In `web/src/api/client.ts` insert directly above `parseSuperpositionCatalog` (added in B3):

```ts
/** The last superposition catalogue this page parsed successfully, or null before the first. */
let knownSuperpositionCatalog: readonly SuperpositionPreset[] | null = null

/**
 * The superposition catalogue already on hand, without a request.
 *
 * The URL-state binding needs it to spell a preset id into the hash. Fetching
 * the catalogue again for that would put a second /api/superposition/catalog
 * request on every page load, which the visual gate's exact request ledger
 * (web/e2e/slice.spec.ts:559-562) would rightly reject.
 */
export function lastSuperpositionCatalog(): readonly SuperpositionPreset[] | null {
  return knownSuperpositionCatalog
}

/** Replace the remembered catalogue: the fetcher does after every successful parse; specs reset it. */
export function rememberSuperpositionCatalog(catalog: readonly SuperpositionPreset[] | null): void {
  knownSuperpositionCatalog = catalog
}
```

and replace the last line of `fetchSuperpositionCatalog` (`return parseSuperpositionCatalog(await response.json())`) with:

```ts
  const presets = parseSuperpositionCatalog(await response.json())
  rememberSuperpositionCatalog(presets)
  return presets
```

Create `web/src/state/urlState.ts`:

```ts
import { CAPABILITY_ROUTE_CONSTRAINTS, Z_CONSTRAINT } from '../api/capability'
import { fetchSuperpositionCatalog, lastSuperpositionCatalog } from '../api/client'
import { PRINCIPAL_PLANES, SLICE_OBSERVABLES } from '../api/sliceContract'
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
const BASES: readonly BasisKind[] = ['real', 'complex']
const REPRESENTATIONS: readonly RepresentationKind[] = ['point_cloud', 'isosurface', 'slice', 'streamlines']
/** The store's n ceiling (normalizeOrbital clamps n to 1..8). */
const MAX_N = 8
const PRESET_ID = /^[a-z0-9][a-z0-9-]{0,63}$/
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
```

Edit `web/coverage-scope.json`: insert `"src/state/urlState.ts",` directly before `"src/state/useSceneStore.ts",` in both arrays.

- [ ] **Step 4: Run and see it pass**

Run: `(cd web && npm exec --no -- vitest run src/state/urlState.test.ts src/api/client.test.ts src/guards.test.ts)`
Expected: PASS.

Coverage spot check: `(cd web && npm exec --no -- vitest run src/state/urlState.test.ts --coverage --coverage.thresholds.perFile=false --coverage.thresholds.statements=0 --coverage.thresholds.branches=0 --coverage.thresholds.functions=0 --coverage.thresholds.lines=0) | grep -E "urlState\.ts"`
Expected: ≥ 90/85/90/90.

Run: `npm --prefix web run typecheck`
Expected: exit 0.

- [ ] **Step 5: Pre-commit gate (CLAUDE.md "提交前")**

Run: `npm --prefix web run test`
Expected: exit 0 — the pinned chain (`clean-coverage`, `tsc -p tsconfig.test.json --noEmit`, vitest with coverage, `assert-no-skips`, `assert-coverage-scope`) passes with 0 skipped and 0 todo, and every module in `web/coverage-scope.json` is at ≥ 90/85/90/90.

Run: `npm --prefix web run typecheck`
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add web/src/state/urlState.ts web/src/state/urlState.test.ts web/src/api/client.ts web/src/api/client.test.ts web/coverage-scope.json
git commit -m "$(cat <<'EOF'
feat(web): hash deep links with embed flag bound to the scene store

Claude-Session: https://claude.ai/code/session_01E44DEzsc7Av26fc7nZ5rSo
EOF
)"
```

---

### Task B11: Bootstrap — static catalogue before the first render, URL state in both modes

**Files:**
- Modify: `web/src/main.tsx` (whole file, 12 lines)
- Test: `web/src/main.test.tsx` (whole file, 33 lines)

**Interfaces:**
- Consumes: `runtimeMode` (B5), `loadStaticManifest`, `createStaticTransport` (B7), `setTransport` (B1), `setStaticCatalog` (B8), `bindUrlState` (B10).
- Produces: `export async function bootstrap(container: HTMLElement, mode: RuntimeMode): Promise<Root>`; module side effect `void bootstrap(document.getElementById('root')!, runtimeMode())`. Static mode: manifest from `new URL('data/', document.baseURI)` (contract), install transport + overlay, bind URL state, then render; failure → Chinese error screen (`role="alert"`, title `静态教材版无法启动`), no app, no URL binding. Live mode: bind URL state, render (transport untouched).

- [ ] **Step 1: Write the failing test** — replace `web/src/main.test.tsx` with:

```tsx
/** @vitest-environment jsdom */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createElement } from 'react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { setStaticCatalog, staticCatalogSpec } from './api/capability'
import { getTransport, liveTransport, resetTransport } from './api/transport'

/**
 * The entry point's claims: the host element is `#root`, the tree is mounted
 * with React 19's `createRoot` under `StrictMode`, the URL state is bound
 * before the first render, and a static build installs its catalogue first --
 * or shows a readable error instead of a blank lab.
 *
 * `App` is mocked (the real one drags the three.js canvas into jsdom), and so
 * is the URL binding (src/state/urlState.test.ts owns it).
 */
vi.mock('./App', () => ({
  default: () => createElement('div', { 'data-app-mounted': 'true' }),
}))

const urlState = vi.hoisted(() => ({ bind: vi.fn(() => () => undefined) }))
vi.mock('./state/urlState', () => ({ bindUrlState: urlState.bind }))

/** Let React's scheduler flush the root it queued; `render` is not synchronous. */
const flush = (): Promise<void> => new Promise((done) => setTimeout(done, 0))

const SPEC: unknown = JSON.parse(readFileSync(resolve(process.cwd(), 'tools', 'fixtures', 'spec.json'), 'utf-8'))
const MANIFEST = { format: 'quviz-static/1', version: '0123456789abcdef', spec: SPEC, entries: {} }

function container(): HTMLElement {
  const element = document.createElement('div')
  document.body.appendChild(element)
  return element
}

let bootstrap: (typeof import('./main'))['bootstrap']

beforeAll(async () => {
  const root = document.createElement('div')
  root.id = 'root'
  document.body.appendChild(root)
  ;({ bootstrap } = await import('./main'))
  await flush()
})

afterEach(() => {
  vi.unstubAllGlobals()
  resetTransport()
  setStaticCatalog(null)
  urlState.bind.mockClear()
})

describe('main entry point', () => {
  it('mounts the app into #root in live mode after binding the URL state', () => {
    expect(document.getElementById('root')?.querySelector('[data-app-mounted="true"]')).not.toBeNull()
    expect(urlState.bind).toHaveBeenCalledTimes(1)
    expect(getTransport()).toBe(liveTransport)
    expect(staticCatalogSpec()).toBeNull()
  })

  it('installs the static transport and catalogue before the first render', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => ({
      ok: true,
      status: 200,
      json: async () => MANIFEST,
    }))
    vi.stubGlobal('fetch', fetchMock)
    const target = container()

    await bootstrap(target, 'static')
    await flush()

    expect(String(fetchMock.mock.calls[0][0])).toBe(new URL('data/manifest.json', document.baseURI).href)
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ cache: 'no-cache' })
    expect(getTransport()).not.toBe(liveTransport)
    expect(staticCatalogSpec()).toEqual(SPEC)
    expect(urlState.bind).toHaveBeenCalledTimes(1)
    expect(target.querySelector('[data-app-mounted="true"]')).not.toBeNull()
  })

  it('shows a readable Chinese error instead of the lab when the catalogue cannot load', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 404, json: async () => ({}) })),
    )
    const target = container()

    await bootstrap(target, 'static')
    await flush()

    const alert = target.querySelector('[role="alert"]')
    expect(alert?.textContent).toContain('静态教材版无法启动')
    expect(alert?.textContent).toContain('HTTP 404')
    expect(alert?.textContent).toContain('quviz serve')
    expect(target.querySelector('[data-app-mounted="true"]')).toBeNull()
    expect(getTransport()).toBe(liveTransport)
    expect(urlState.bind).not.toHaveBeenCalled()
  })

  it('reports a non-Error rejection as its own text', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject('offline')))
    const target = container()

    await bootstrap(target, 'static')
    await flush()

    expect(target.querySelector('[role="alert"]')?.textContent).toContain('offline')
  })
})
```

- [ ] **Step 2: Run and see it fail**

Run: `(cd web && npm exec --no -- vitest run src/main.test.tsx)`
Expected: FAIL — `expected "spy" to be called 1 times, but got 0 times` (the entry does not bind the URL state yet) and `bootstrap is not a function`.

- [ ] **Step 3: Implement** — replace `web/src/main.tsx` with:

```tsx
import { StrictMode } from 'react'
import { createRoot, type Root } from 'react-dom/client'

import App from './App'
import { setStaticCatalog } from './api/capability'
import { runtimeMode, type RuntimeMode } from './api/runtimeMode'
import { createStaticTransport, loadStaticManifest } from './api/staticCatalog'
import { setTransport } from './api/transport'
import { bindUrlState } from './state/urlState'
import './styles.css'
import './quantum-observatory.css'

/** Shown instead of the lab when the static catalogue cannot be loaded. */
function StartupError({ message }: { message: string }) {
  return (
    <main
      className="startup-error"
      role="alert"
      style={{
        maxWidth: '40rem',
        margin: '15vh auto',
        padding: '0 24px',
        color: '#fff',
        font: '16px/1.7 system-ui, "PingFang SC", "Microsoft YaHei", sans-serif',
      }}
    >
      <h1 style={{ fontSize: '22px', fontWeight: 600 }}>静态教材版无法启动</h1>
      <p>无法加载预计算数据目录：{message}</p>
      <p>
        请刷新页面重试；如果问题持续，可以在本地运行 <code>quviz serve</code> 使用实时计算版。
      </p>
    </main>
  )
}

const errorText = (error: unknown): string => (error instanceof Error ? error.message : String(error))

/**
 * Install the data layer the build mode asks for, then mount the app.
 *
 * The static catalogue must be in place before the first render: the first
 * scene request, the capability answers the panel shows and the URL state all
 * read it. The data directory is resolved against the document, so the same
 * bundle works at "/" and under a GitHub Pages sub-path.
 */
export async function bootstrap(container: HTMLElement, mode: RuntimeMode): Promise<Root> {
  const root = createRoot(container)
  if (mode === 'static') {
    try {
      const dataBase = new URL('data/', document.baseURI)
      const manifest = await loadStaticManifest(dataBase)
      setTransport(createStaticTransport(manifest, dataBase))
      setStaticCatalog(manifest)
    } catch (error) {
      root.render(<StartupError message={errorText(error)} />)
      return root
    }
  }
  bindUrlState()
  root.render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
  return root
}

void bootstrap(document.getElementById('root')!, runtimeMode())
```

- [ ] **Step 4: Run and see it pass**

Run: `(cd web && npm exec --no -- vitest run src/main.test.tsx)`
Expected: PASS (4 tests).

Run: `npm --prefix web run build:pages && grep -c "manifest.json" web/dist/assets/index-*.js && npm --prefix web run build`
Expected: both builds succeed; the pages bundle contains the manifest loader (`grep -c` ≥ 1); the final `build` restores the live `web/dist`.

- [ ] **Step 5: Pre-commit gate (CLAUDE.md "提交前")**

Run: `npm --prefix web run test`
Expected: exit 0 — the pinned chain (`clean-coverage`, `tsc -p tsconfig.test.json --noEmit`, vitest with coverage, `assert-no-skips`, `assert-coverage-scope`) passes with 0 skipped and 0 todo, and every module in `web/coverage-scope.json` is at ≥ 90/85/90/90.

Run: `npm --prefix web run typecheck`
Expected: exit 0.

Run: `npm --prefix web run test:fullstack` (the live app now binds the hash state before its first render; CLAUDE.md: a change to how the app starts against the real server runs the fullstack gate)
Expected: exit 0 — every fullstack journey still opens its scene from the real FastAPI server, and `assert-fullstack-run.mjs` passes.

`test:visual` is not run here (Linux/Docker only; Part E). A plain page load still issues no extra request (pinned by `urlState.test.ts`: an empty or eigenstate hash fetches nothing).

- [ ] **Step 6: Commit**

```bash
git add web/src/main.tsx web/src/main.test.tsx
git commit -m "$(cat <<'EOF'
feat(web): bootstrap the static catalogue before the first render

Binds the hash deep-link state in both modes; a static build that cannot
load its catalogue shows a readable Chinese error instead of a blank lab.

Claude-Session: https://claude.ai/code/session_01E44DEzsc7Av26fc7nZ5rSo
EOF
)"
```

---

### Task B12: Build-time request enumerator (`staticEnumeration.ts` + `tools/static-requests.ts`)

**Files:**
- Create: `web/src/api/staticEnumeration.ts` (coverage-gated logic)
- Create: `web/tools/static-requests.ts` (thin vite-node wrapper: argv + file I/O only)
- Create: `web/tsconfig.tools.json`
- Modify: `web/tsconfig.json` (references 1-14), `web/coverage-scope.json` (both arrays, `"src/api/staticEnumeration.ts"` directly after `"src/api/staticCatalog.ts"`)
- Test: `web/src/api/staticEnumeration.test.ts`

**Interfaces:**
- Consumes: `staticCapabilityFor`, `planForCapability`, `STATIC_A_MU` (B8), `requestsForPlan`, `metadataRequest`, catalogue requests (B2/B4), `parseStaticSpec`, `playbackFrames` (B7), `parseOrbitalCatalog`, `parseSuperpositionCatalog` (B3), `requestKey` (B1). Files from Part A: `<data>/spec.json`, `<data>/catalog-orbitals.json`, `<data>/catalog-superpositions.json`.
- Produces (contract "B → A/E"): `<data>/requests.json` = `{"format": "quviz-static-requests/1", "requests": [ … sorted, unique … ]}`; command (run with cwd `web/`): `npm --prefix web exec --no -- vite-node tools/static-requests.ts -- <data>`.
- Produces (TS): `export const STATIC_REQUESTS_FORMAT = 'quviz-static-requests/1'`, `export interface StaticRequestsFile`, `export const STATIC_SUPERPOSITION_BASIS: BasisKind = 'complex'`, `export function enumerateStaticRequests(spec: StaticSpec, superpositionCatalog: readonly SuperpositionPreset[]): string[]`, `export function buildStaticRequestsFile(rawSpec: unknown, rawOrbitalCatalog: unknown, rawSuperpositionCatalog: unknown): StaticRequestsFile`.

Enumeration walks exactly the spec: every eigenstate `n ≤ n_max`, `0 ≤ l < n`, `|m| ≤ l`, each basis → one metadata request, then each spec representation the static capability allows (physics refusals skipped — e.g. real-basis and m = 0 streamlines, 3s/4s isosurfaces); slices over spec planes × observables. Every superposition preset (looked up by id in the catalogue) × its `playbackFrames(period_au · a_mu / Z²)` (the ControlPanel formula, `ControlPanel.tsx:457-464`) × each spec representation (× xz × observables for slices). Plus both catalogue requests. With the fixture spec and `tests/fixtures/visual/catalog-*.json`: 2 + 60 metadata + 60 point clouds + 56 isosurfaces + 720 slices + 20 streamline sets + 54 frames × 6 = **1242** requests.

- [ ] **Step 1: Write the failing test** — create `web/src/api/staticEnumeration.test.ts`:

```ts
import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it } from 'vitest'

import { nextTimeAu, selectSceneRequestInputs, type SceneInputSource } from '../components/sceneRequest'
import { useSceneStore } from '../state/useSceneStore'
import { playbackFrameCount, planSceneRequest, setStaticCatalog, STATIC_A_MU, type SceneRequestInputs } from './capability'
import { parseSuperpositionCatalog } from './client'
import { parseStaticSpec, type StaticManifest } from './staticCatalog'
import {
  buildStaticRequestsFile,
  enumerateStaticRequests,
  STATIC_REQUESTS_FORMAT,
  STATIC_SUPERPOSITION_BASIS,
} from './staticEnumeration'

const readJson = (relative: string): unknown =>
  JSON.parse(readFileSync(new URL(relative, import.meta.url), 'utf-8'))

const RAW_SPEC = readJson('../../tools/fixtures/spec.json')
const RAW_ORBITALS = readJson('../../../tests/fixtures/visual/catalog-orbitals.json')
const RAW_SUPERPOSITIONS = readJson('../../../tests/fixtures/visual/catalog-superposition.json')
const SPEC = parseStaticSpec(RAW_SPEC)
const SUPERPOSITIONS = parseSuperpositionCatalog(RAW_SUPERPOSITIONS)
const encoded = (terms: string): string => new URLSearchParams({ terms }).toString().slice('terms='.length)
const termsOf = (id: string): string => {
  const found = SUPERPOSITIONS.find((entry) => entry.id === id)
  if (found === undefined) throw new Error(`no preset ${id}`)
  return found.terms
}

const REQUESTS = enumerateStaticRequests(SPEC, SUPERPOSITIONS)

function manifestFor(keys: readonly string[]): StaticManifest {
  return {
    format: 'quviz-static/1',
    version: '0000000000000000',
    spec: SPEC,
    entries: Object.fromEntries(
      keys.map((key) => [
        key,
        { file: 'files/000000000000000000000000.json', status: 200, content_type: 'application/json', headers: {} },
      ]),
    ),
  }
}

/** What the running app would plan: the store's real defaults plus a patch. */
const STORE = useSceneStore.getInitialState()
const runtimeInputs = (patch: Partial<SceneInputSource>): SceneRequestInputs =>
  selectSceneRequestInputs({ ...STORE, ...patch })

afterEach(() => {
  setStaticCatalog(null)
})

describe('enumerateStaticRequests', () => {
  it('lists the catalogues, every metadata request and every precomputed cell, sorted and unique', () => {
    expect(REQUESTS).toEqual([...new Set(REQUESTS)].sort())
    // 2 catalogues + 60 metadata (30 states x 2 bases) + 60 point clouds
    // + 56 isosurfaces (3s and 4s refused in both bases) + 720 slices
    // (60 states x 3 planes x 4 observables) + 20 streamline sets (complex, m != 0)
    // + 324 superposition requests ((28 + 1 + 24 + 1) frames x (1 isosurface + 4 xz slices + 1 streamline set)).
    expect(REQUESTS).toHaveLength(1242)
  })

  it('spells the exact keys the static site will look up', () => {
    const iso3dz2 = encoded(termsOf('1s-3dz2'))
    const iso1s2pz = encoded(termsOf('1s-2pz'))
    for (const key of [
      '/api/orbitals/catalog',
      '/api/superposition/catalog',
      '/api/orbitals/point-cloud?n=2&l=1&m=0&z=1&basis=real&samples=28000&seed=7',
      '/api/orbitals/metadata?n=2&l=1&m=0&z=1&basis=real',
      '/api/orbitals/isosurface?n=4&l=3&m=0&z=1&basis=real&resolution=81&probability_mass=0.9',
      '/api/orbitals/slice?n=4&l=0&m=0&z=1&basis=complex&resolution=97&a_mu=1&plane=yz&observable=phase',
      `/api/superposition/slice?terms=${iso3dz2}&time=5.8&resolution=103&basis=complex&z=1&a_mu=1&plane=xz&observable=wavefunction_imag`,
      `/api/superposition/current-field?terms=${iso3dz2}&time=0&seed_count=24&basis=complex&z=1&a_mu=1`,
      `/api/superposition/isosurface?terms=${iso1s2pz}&time=16.2&resolution=65&basis=complex&z=1&a_mu=1&probability_mass=0.9`,
    ]) {
      expect(REQUESTS, key).toContain(key)
    }
  })

  it('skips what the physics refuses and what the spec leaves out', () => {
    expect(REQUESTS.filter((key) => key.startsWith('/api/orbitals/isosurface?n=3&l=0'))).toEqual([])
    expect(REQUESTS.filter((key) => key.startsWith('/api/orbitals/current-field?') && key.includes('basis=real'))).toEqual([])
    expect(REQUESTS.filter((key) => key.startsWith('/api/superposition/slice?') && !key.includes('plane=xz'))).toEqual([])
    const degenerate = REQUESTS.filter((key) => key.includes(encoded(termsOf('2s-2pz'))))
    expect(degenerate).toHaveLength(6)
    expect(degenerate.every((key) => key.includes('&time=0&'))).toBe(true)
  })

  it('refuses a spec preset the server catalogue does not list', () => {
    expect(() => enumerateStaticRequests(SPEC, SUPERPOSITIONS.slice(1))).toThrow(
      '静态目录规格引用了服务端目录中不存在的叠加态预设 1s-2pz。',
    )
  })

  it('uses the store defaults no control changes', () => {
    expect(STATIC_SUPERPOSITION_BASIS).toBe(STORE.superpositionBasis)
    expect(STATIC_A_MU).toBe(STORE.aMu)
  })
})

describe('the running static site asks for exactly what was enumerated', () => {
  it('finds every eigenstate cell of the spec precomputed, or refused by the physics', () => {
    setStaticCatalog(manifestFor(REQUESTS))
    let precomputed = 0
    for (let n = 1; n <= SPEC.eigenstates.n_max; n += 1) {
      for (let l = 0; l < n; l += 1) {
        for (let m = -l; m <= l; m += 1) {
          for (const basis of SPEC.eigenstates.bases) {
            for (const representation of SPEC.eigenstates.representations) {
              const sections =
                representation === 'slice'
                  ? SPEC.eigenstates.planes.flatMap((plane) =>
                      SPEC.eigenstates.observables.map((sliceObservable) => ({ plane, sliceObservable })),
                    )
                  : [{ plane: STORE.plane, sliceObservable: STORE.sliceObservable }]
              for (const section of sections) {
                const plan = planSceneRequest(
                  runtimeInputs({ orbital: { n, l, m, z: 1, basis }, representation, ...section }),
                )
                expect(plan.status, JSON.stringify({ n, l, m, basis, representation, ...section })).not.toBe(
                  'not_precomputed',
                )
                if (plan.status === 'available') precomputed += 1
              }
            }
          }
        }
      }
    }
    // 60 point clouds + 56 isosurfaces + 720 slices + 20 streamline sets.
    expect(precomputed).toBe(856)
  })

  it('finds every playback frame of every precomputed superposition', () => {
    setStaticCatalog(manifestFor(REQUESTS))
    for (const id of SPEC.superpositions.presets) {
      const preset = SUPERPOSITIONS.find((entry) => entry.id === id)
      if (preset === undefined) throw new Error(`no preset ${id}`)
      for (const representation of SPEC.superpositions.representations) {
        const sections =
          representation === 'slice'
            ? SPEC.superpositions.planes.flatMap((plane) =>
                SPEC.superpositions.observables.map((sliceObservable) => ({ plane, sliceObservable })),
              )
            : [{ plane: STORE.plane, sliceObservable: STORE.sliceObservable }]
        for (const section of sections) {
          let time = 0
          const lap = Math.max(1, playbackFrameCount(preset.period_au))
          for (let frame = 0; frame < lap; frame += 1) {
            const plan = planSceneRequest(
              runtimeInputs({
                mode: 'superposition',
                representation,
                superpositionTerms: preset.terms,
                superpositionSliceResolutionFloor: preset.slice_resolution_floor,
                superpositionStreamlineSeedCountMax: preset.streamline_seed_count_max,
                timeAu: time,
                ...section,
              }),
            )
            expect(plan.status, `${id} ${representation} t=${time}`).toBe('available')
            time = nextTimeAu(time, preset.period_au)
          }
        }
      }
    }
  })

  it('refuses the opening scene when its metadata is missing (negative control)', () => {
    const metadata = '/api/orbitals/metadata?n=2&l=1&m=0&z=1&basis=real'
    setStaticCatalog(manifestFor(REQUESTS.filter((key) => key !== metadata)))
    expect(planSceneRequest(runtimeInputs({})).status).toBe('not_precomputed')
  })
})

describe('buildStaticRequestsFile', () => {
  it('parses the exporter files and writes the contract envelope', () => {
    const file = buildStaticRequestsFile(RAW_SPEC, RAW_ORBITALS, RAW_SUPERPOSITIONS)
    expect(file.format).toBe(STATIC_REQUESTS_FORMAT)
    expect(file.format).toBe('quviz-static-requests/1')
    expect(file.requests).toEqual(REQUESTS)
  })

  it('fails on a malformed spec or catalogue before enumerating anything', () => {
    expect(() => buildStaticRequestsFile({ format: 'x' }, RAW_ORBITALS, RAW_SUPERPOSITIONS)).toThrow('spec.json.format')
    expect(() => buildStaticRequestsFile(RAW_SPEC, { presets: [] }, RAW_SUPERPOSITIONS)).toThrow(
      'orbital catalog must be an array',
    )
    expect(() => buildStaticRequestsFile(RAW_SPEC, RAW_ORBITALS, null)).toThrow(
      'superposition catalog must be an array',
    )
  })
})
```

- [ ] **Step 2: Run and see it fail**

Run: `(cd web && npm exec --no -- vitest run src/api/staticEnumeration.test.ts)`
Expected: FAIL — `Failed to resolve import "./staticEnumeration"`.

- [ ] **Step 3: Implement**

Create `web/src/api/staticEnumeration.ts`:

```ts
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
```

Create `web/tools/static-requests.ts`:

```ts
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
```

Create `web/tsconfig.tools.json`:

```json
{
  "$comment": "Build-time tools run by vite-node (tools/static-requests.ts). A separate project rather than a widening of tsconfig.app.json: tools/ runs in node, reads the file system and must never be bundled into the SPA. It imports the coverage-gated enumeration logic from src/ and holds only the file-system wrapper itself. Referenced from tsconfig.json so `npm run typecheck` (tsc -b) type-checks it.",
  "compilerOptions": {
    "tsBuildInfoFile": "./node_modules/.tmp/tsconfig.tools.tsbuildinfo",
    "target": "ES2023",
    "lib": ["ES2023", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "skipLibCheck": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "forceConsistentCasingInFileNames": true,
    "jsx": "react-jsx",
    "types": ["node", "vite/client"]
  },
  "include": ["tools/**/*.ts"]
}
```

Replace `web/tsconfig.json` with:

```json
{
  "files": [],
  "references": [
    {
      "path": "./tsconfig.app.json"
    },
    {
      "path": "./tsconfig.node.json"
    },
    {
      "path": "./tsconfig.e2e.json"
    },
    {
      "path": "./tsconfig.tools.json"
    }
  ]
}
```

(A probe confirmed `tsc -b` accepts a non-composite referenced project whose `include`d file imports modules outside its `include`.)

Edit `web/coverage-scope.json`: insert `"src/api/staticEnumeration.ts",` directly after `"src/api/staticCatalog.ts",` in both arrays.

- [ ] **Step 4: Run and see it pass**

Run: `(cd web && npm exec --no -- vitest run src/api/staticEnumeration.test.ts src/guards.test.ts)`
Expected: PASS.

Run: `npm --prefix web run typecheck`
Expected: exit 0 (now also checks `tools/static-requests.ts`).

Smoke the tool on the fixtures (bash, from the repo root):

```bash
SMOKE="$(cygpath -m "$(mktemp -d)")"
cp web/tools/fixtures/spec.json "$SMOKE/spec.json"
cp tests/fixtures/visual/catalog-orbitals.json "$SMOKE/catalog-orbitals.json"
cp tests/fixtures/visual/catalog-superposition.json "$SMOKE/catalog-superpositions.json"
(cd web && npm --prefix web exec --no -- vite-node tools/static-requests.ts -- "$SMOKE")
node -e "const f=JSON.parse(require('fs').readFileSync(process.argv[1],'utf8')); if (f.format!=='quviz-static-requests/1' || f.requests.length!==1242 || !f.requests.includes('/api/orbitals/point-cloud?n=2&l=1&m=0&z=1&basis=real&samples=28000&seed=7')) { console.error('requests.json is wrong'); process.exit(1) } console.log('requests.json OK', f.requests.length)" "$SMOKE/requests.json"
```

Expected: `static-requests: 写出 1242 个请求 -> …/requests.json`, then `requests.json OK 1242`.

Run the tool without an argument: `(cd web && npm --prefix web exec --no -- vite-node tools/static-requests.ts); echo "exit=$?"`
Expected: the Chinese usage line on stderr and `exit=2`.

- [ ] **Step 5: Pre-commit gate (CLAUDE.md "提交前")**

Run: `npm --prefix web run test`
Expected: exit 0 — the pinned chain (`clean-coverage`, `tsc -p tsconfig.test.json --noEmit`, vitest with coverage, `assert-no-skips`, `assert-coverage-scope`) passes with 0 skipped and 0 todo, and every module in `web/coverage-scope.json` is at ≥ 90/85/90/90.

Run: `npm --prefix web run typecheck`
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add web/src/api/staticEnumeration.ts web/src/api/staticEnumeration.test.ts web/tools/static-requests.ts web/tsconfig.tools.json web/tsconfig.json web/coverage-scope.json
git commit -m "$(cat <<'EOF'
feat(web): build-time static request enumerator

tools/static-requests.ts (vite-node) writes requests.json from spec.json and
the two catalogues through the same planner the static site runs.

Claude-Session: https://claude.ai/code/session_01E44DEzsc7Av26fc7nZ5rSo
EOF
)"
```

---

### Task B13: Full web gates on the Part B branch (pre-merge hand-off)

**Files:** none changed (verification only).

**Interfaces:** consumes everything above; produces the verification record of the Part B branch before B14 merges it with Part A.

Decision on the smoke data: Part A runs in parallel in its own worktree, so `quviz export-static` is not available on this branch. This smoke therefore uses the committed hand-written `web/tools/fixtures/spec.json` (the contract JSON verbatim) plus the committed catalogue fixtures `tests/fixtures/visual/catalog-orbitals.json` / `catalog-superposition.json`. The real-data smoke runs in B16, on the merged tree.

- [ ] **Step 1: Web unit gate**

Run: `npm --prefix web run test`
Expected: exit 0 — the pinned chain (`clean-coverage`, `tsc -p tsconfig.test.json`, vitest with coverage, `assert-no-skips`, `assert-coverage-scope`) passes; 0 skipped, 0 todo; `assert-coverage-scope` reports the manifest's gated modules (the previous 30 plus `src/api/requests.ts`, `src/api/runtimeMode.ts`, `src/api/staticCatalog.ts`, `src/api/staticEnumeration.ts`, `src/api/transport.ts`, `src/state/urlState.ts`) each at ≥ 90/85/90/90.

- [ ] **Step 2: Type check and both builds**

Run: `npm --prefix web run typecheck`
Expected: exit 0.

Run: `npm --prefix web run build:pages && ls web/dist/assets | grep -c '\.map$'; grep -c 'src="./assets/' web/dist/index.html`
Expected: build succeeds; `0` source maps; `1` relative script tag.

Run: `npm --prefix web run build && grep -c 'src="./assets/' web/dist/index.html`
Expected: build succeeds; `1` (this also leaves the live bundle in `web/dist` for the fullstack gate and `quviz serve`).

- [ ] **Step 3: Python pins that read web sources**

Run: `uv run --locked --no-sync pytest tests/test_slice_builders.py tests/test_check_script.py tests/test_declared_versions.py -q`
Expected: all pass (`EIGENSTATE_S_SLICE_FLOORS` untouched; `web/scripts/` still the 13 pinned files; npm `test`/`test:fullstack` scripts unchanged; no `pretest`/`posttest`).

- [ ] **Step 4: Live fullstack browser gate** (the data path changed and `base` is now `./`)

Run: `npm --prefix web run test:fullstack`
Expected: exit 0 — FastAPI serves the relative-base bundle at `/`, every live request still reaches `/api/…`, the `查看 OpenAPI` → `/docs` link and the MkDocs journey unchanged; `assert-fullstack-run.mjs` passes.

- [ ] **Step 5: Enumerator smoke on the fixtures**

```bash
SMOKE="$(cygpath -m "$(mktemp -d)")"
cp web/tools/fixtures/spec.json "$SMOKE/spec.json"
cp tests/fixtures/visual/catalog-orbitals.json "$SMOKE/catalog-orbitals.json"
cp tests/fixtures/visual/catalog-superposition.json "$SMOKE/catalog-superpositions.json"
(cd web && npm --prefix web exec --no -- vite-node tools/static-requests.ts -- "$SMOKE")
node -e "const f=JSON.parse(require('fs').readFileSync(process.argv[1],'utf8')); if (f.format!=='quviz-static-requests/1' || f.requests.length!==1242) process.exit(1); console.log('requests.json OK', f.requests.length)" "$SMOKE/requests.json"
```

Expected: `static-requests: 写出 1242 个请求 -> …`, then `requests.json OK 1242`.

- [ ] **Step 6: Not run by this task (state it in the hand-off)**

- Real-data smoke (`quviz export-static plan` → enumerator): Part A's exporter is not on this branch; B16 runs it on the merged tree.
- `npm --prefix web run test:visual` is Linux/SwiftShader-only (`web/playwright.config.ts:50-58`) and belongs to Part E's Docker run. Part B changes no component, CSS or canvas code, and adds no request on a plain page load (pinned by `src/state/urlState.test.ts`: an empty or eigenstate hash fetches nothing), so the visual gate's exact fixture ledger is unaffected by design; this is an argument, not a measurement.

- [ ] **Step 7: Confirm nothing is left uncommitted**

Run: `git status --porcelain`
Expected: empty. This task changes no files, so it has no commit. If any gate above fails, fix it in a new commit on the task that introduced the failure's code (with a regression test when it is a defect), then rerun this task from Step 1.

---

### Task B14: Merge Part B onto Part A; deep links open a preset on its published default

**Precondition:** A1–A12 are committed on the Part A worktree branch and that branch is merged into `feat/pages-textbook-lab` (the orchestrator's merge step, contracts "Execution order"); B1–B13 are committed on the Part B worktree branch; Part D has not started. Part C touches no file Part B touches, so whether C is merged yet does not matter here.

**Files:**
- Merge: the Part B branch into `feat/pages-textbook-lab`.
- Resolve (textual conflicts expected from the two plans): `web/src/api/client.ts` (A10 adds `SuperpositionDefaultRepresentation,` inside the `import type {…} from './types'` list at lines 9-24, which B3 replaced as part of lines 1-36); `web/src/state/useSceneStore.test.ts` (A11 and B9 each append a `describe` at the end of the file).
- Expected to merge cleanly (no shared lines; if git nevertheless reports a conflict, keep both sides as noted): `web/src/state/useSceneStore.ts` (A11: imports 5-11, interface 15-106, `ALWAYS_AVAILABLE` doc 174-184, 226-363; B9: line 3, `normalizeOrbital` 108-118, `snapTimeAu` after 172, 394-402), `web/src/api/client.ts` below the imports (A10 owns `parseSuperpositionPreset` 110-167 and its helper; B owns `send`, the fetchers from 169, `parseOrbitalCatalog`/`parseSuperpositionCatalog` and the remembered catalogue), `web/src/api/client.test.ts` (A10: 507-562; B3/B10: imports 20-32 and end of file), `web/src/api/types.ts` (A8: 44-58 and end of file; A10: after 171; B9: 286).
- Modify: `web/src/state/urlState.ts` (`applyDeepLink`, the `store.setSuperposition(…)` call)
- Test: `web/src/state/urlState.test.ts` (`describe('applyDeepLink')`: one new test; `describe('bindUrlState')`: `uses a catalogue it already has without fetching`)

**Interfaces:**
- Consumes (Part A; the contracts file does not list these yet, see Self-review "Contract amendments requested"):
  - `SuperpositionPreset.default_representation: 'isosurface' | 'slice'` (A10; required; generated from `SuperpositionCatalogEntry` in `schema.gen.ts`, validated by A10's `parseSuperpositionPreset`);
  - `export type SuperpositionDefaultRepresentation = SuperpositionPreset['default_representation']` (A10, `types.ts`);
  - `SceneStore.superpositionDefaultRepresentation: SuperpositionDefaultRepresentation`, initially `'isosurface'` (A11);
  - `setSuperposition(terms: string, label: string, sliceResolutionFloor: number, streamlineSeedCountMax: number, defaultRepresentation: SuperpositionDefaultRepresentation) => void` (A11; the fifth argument is required);
  - `syncSuperpositionCapabilities(terms: string, sliceResolutionFloor: number, streamlineSeedCountMax: number, defaultRepresentation: SuperpositionDefaultRepresentation) => void` (A11; Part B does not call it);
  - rule (A11): applying a preset, or switching to superposition mode, opens the published default where the store would otherwise open the isosurface; an explicit `setRepresentation` is honoured.
- Produces: `applyDeepLink` passes `preset.default_representation`; `#mode=superposition&preset=2s-2pz` opens the xz slice and is canonicalised to `#mode=superposition&preset=2s-2pz&rep=slice&plane=xz&obs=probability_density`; `…&rep=isosurface` still opens the isosurface (and shows the server's recorded reason).

Why this is a defect and not only a type error: after the merge, the four-argument call stores `superpositionDefaultRepresentation: undefined` at runtime, and A11's `openingRepresentation` then asks `capabilityFor` for representation `undefined`, which throws (the fail-closed `default` branch of `superpositionCapability`, `capability.ts:677-682` before Part B's edits). Every preset deep link would crash `bindUrlState`. And a link must open a preset exactly where a panel click opens it: a link that ignored the published default would reopen the `2s-2pz` isosurface the server refuses with 422, the defect spec §5 row 1 removes.

- [ ] **Step 1: Merge without committing, and resolve the textual conflicts**

Read the Part B worktree branch name from `git worktree list` (the line whose path is the Part B worktree) and export it as `B_BRANCH` in the shell used for this task; do the same for Part A as `A_BRANCH`. Then, from the main checkout:

```bash
git switch feat/pages-textbook-lab
git status --porcelain
git merge-base --is-ancestor "$A_BRANCH" HEAD && echo "Part A merged"
git merge --no-ff --no-commit "$B_BRANCH"
git diff --name-only --diff-filter=U
```

Expected: `git status --porcelain` prints nothing; `Part A merged` is printed (if it is not, stop: the precondition is unmet); the merge stops with conflicts; the last command lists exactly `web/src/api/client.ts` and `web/src/state/useSceneStore.test.ts`. If it lists any other path, resolve it by keeping both sides' changes (Part A's catalogue/metadata work and Part B's transport/static work never replace each other's logic) and name it in the merge commit body.

Resolve `web/src/api/client.ts`: take Part B's side of the conflicting hunk in full (B3's replacement of the old lines 1-36: the imports, the `export { parsePointCloud }` re-export, the two streamline-seed constants and `send`; `queryString` stays deleted) and add Part A's one type to the `import type` list, so the imports read:

```ts
import { parsePointCloud } from './qvpc'
import {
  currentFieldRequest,
  isosurfaceRequest,
  metadataRequest,
  ORBITAL_CATALOG_REQUEST,
  pointCloudRequest,
  sliceRequest,
  SUPERPOSITION_CATALOG_REQUEST,
  superpositionCurrentFieldRequest,
  superpositionIsosurfaceRequest,
  superpositionSliceRequest,
  type ApiRequest,
  type OrbitalRequestState,
} from './requests'
import {
  MAXIMUM_SLICE_RESOLUTION,
  MINIMUM_SLICE_RESOLUTION,
  parseSlicePayload,
  SliceContractError,
  type AnySlicePayload,
} from './sliceContract'
import { getTransport } from './transport'
import type {
  BasisKind,
  CurrentFieldPayload,
  IsosurfacePayload,
  OrbitalMetadata,
  OrbitalParameters,
  OrbitalPreset,
  PointCloudData,
  PrincipalPlane,
  SliceObservable,
  SlicePayload,
  SuperpositionCurrentPayload,
  SuperpositionDefaultRepresentation,
  SuperpositionIsosurfacePayload,
  SuperpositionPreset,
  SuperpositionSlicePayload,
} from './types'
```

`queryString` stays deleted (B3); `isSuperpositionDefaultRepresentation` and the `default_representation` check inside `parseSuperpositionPreset` stay exactly as Part A wrote them. Check: `grep -n "queryString\|<<<<<<<\|>>>>>>>" web/src/api/client.ts` prints nothing, and `grep -c "isSuperpositionDefaultRepresentation" web/src/api/client.ts` prints `2` (definition and use).

Resolve `web/src/state/useSceneStore.test.ts`: keep both appended blocks, Part B's `describe('static catalogue pins', …)` first and Part A's `describe('catalogue default representation', …)` after it, each complete. The imports are Part B's (B9 replaced lines 1-5 and kept `planSceneRequest` and `selectSceneRequestInputs`, which Part A's block uses). Check: `grep -c "^describe('static catalogue pins'\|^describe('catalogue default representation'" web/src/state/useSceneStore.test.ts` prints `2`, and `grep -n "<<<<<<<\|>>>>>>>" web/src/state/useSceneStore.test.ts` prints nothing.

```bash
git add web/src/api/client.ts web/src/state/useSceneStore.test.ts
```

- [ ] **Step 2: Write the failing tests** — in `web/src/state/urlState.test.ts`:

In `describe('bindUrlState')`, replace the test `uses a catalogue it already has without fetching` with:

```ts
  it('uses a catalogue it already has without fetching', () => {
    rememberSuperpositionCatalog(CATALOG)
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    setHash('#mode=superposition&preset=2s-2pz')

    unbind = bindUrlState()

    expect(fetchMock).not.toHaveBeenCalled()
    expect(read().superpositionTerms).toBe(preset('2s-2pz').terms)
    // 2s-2pz publishes 'slice' (its route-default isosurface is refused), so
    // the link opens the slice and says so, with the slice's plane and field.
    expect(read().superpositionDefaultRepresentation).toBe('slice')
    expect(window.location.hash).toBe('#mode=superposition&preset=2s-2pz&rep=slice&plane=xz&obs=probability_density')
  })
```

(The intent is unchanged — a remembered catalogue resolves a preset link with no request and the hash is canonicalised — only the canonical form follows Part A's published default.)

In `describe('applyDeepLink')`, add after `resolves a superposition preset through the catalogue, then its time`:

```ts
  it('opens a preset on the representation its catalogue entry publishes (2s-2pz regression)', () => {
    expect(preset('2s-2pz').default_representation).toBe('slice')
    expect(preset('1s-2pz').default_representation).toBe('isosurface')

    applyDeepLink(parseDeepLink('mode=superposition&preset=2s-2pz'), CATALOG)
    expect(read()).toMatchObject({
      mode: 'superposition',
      superpositionTerms: preset('2s-2pz').terms,
      superpositionDefaultRepresentation: 'slice',
      representation: 'slice',
    })

    // An explicit representation in the link is honoured, as a click would be.
    useSceneStore.setState(INITIAL, true)
    applyDeepLink(parseDeepLink('mode=superposition&preset=2s-2pz&rep=isosurface'), CATALOG)
    expect(read().representation).toBe('isosurface')

    // A preset that publishes the isosurface opens on it.
    useSceneStore.setState(INITIAL, true)
    applyDeepLink(parseDeepLink('mode=superposition&preset=1s-2pz'), CATALOG)
    expect(read()).toMatchObject({ superpositionDefaultRepresentation: 'isosurface', representation: 'isosurface' })
  })
```

- [ ] **Step 3: Run them and see them fail**

Run: `npm --prefix web run typecheck`
Expected: FAIL — `src/state/urlState.ts(…): error TS2554: Expected 5 arguments, but got 4.` at the `store.setSuperposition(` call in `applyDeepLink`.

Run: `(cd web && npm exec --no -- vitest run src/state/urlState.test.ts)`
Expected: FAIL — `opens a preset on the representation its catalogue entry publishes`, `uses a catalogue it already has without fetching` and `resolves a superposition preset through the catalogue, then its time` throw `Error: No superposition row for representation undefined. The matrix fails closed rather than answering with whichever row happens to be last.` (the four-argument call stored `superpositionDefaultRepresentation: undefined`, and `setMode('superposition')` asks `capabilityFor` for it); `resolves a preset link once the catalogue arrives, and writes the hash only then` fails too (the same throw inside the catalogue callback). The other urlState specs pass.

- [ ] **Step 4: Implement** — in `web/src/state/urlState.ts`, replace the preset block of `applyDeepLink`:

```ts
  if (preset !== undefined) {
    store.setSuperposition(
      preset.terms,
      preset.label,
      preset.slice_resolution_floor,
      preset.streamline_seed_count_max,
    )
  }
```

with:

```ts
  if (preset !== undefined) {
    // The fifth argument is what the preset OPENS on: the server probes each
    // preset's route-default isosurface and publishes 'slice' where that
    // request is refused (2s + 2p_z). A link applies a preset exactly as a
    // click in the panel does, so it opens there too; an explicit `rep` in the
    // link is applied afterwards and still wins.
    store.setSuperposition(
      preset.terms,
      preset.label,
      preset.slice_resolution_floor,
      preset.streamline_seed_count_max,
      preset.default_representation,
    )
  }
```

- [ ] **Step 5: Run them and see them pass**

Run: `(cd web && npm exec --no -- vitest run src/state/urlState.test.ts src/state/useSceneStore.test.ts src/api/client.test.ts src/components/ControlPanel.test.tsx src/api/staticEnumeration.test.ts src/api/capability.static.test.ts src/main.test.tsx)`
Expected: PASS — urlState (all, including the new regression), both appended store blocks, A10's parser tests next to B3/B10's transport and remembered-catalogue tests, A11's ControlPanel tests, the 1242-request enumeration over the regenerated `catalog-superposition.json` (the new field does not change any request).

Run: `(cd web && npm exec --no -- tsc -p tsconfig.test.json --noEmit)`
Expected: exit 0.

- [ ] **Step 6: Pre-commit gate on the merged tree (CLAUDE.md "提交前"; the merge brings Python, web and interface changes together)**

Run: `npm --prefix web run test`
Expected: exit 0; 0 skipped, 0 todo; every gated module (Part B's six new ones included) at ≥ 90/85/90/90.

Run: `npm --prefix web run typecheck`
Expected: exit 0.

Run: `npm --prefix web run test:fullstack`
Expected: exit 0 — the merged app (transport, relative base, URL binding, Part A's radial profile and catalogue default) against the real FastAPI server; `assert-fullstack-run.mjs` passes.

Run: `uv run --locked --group docs pytest --cov=quviz --cov-report=term-missing`
Expected: all pass, 0 skipped, total coverage ≥ 85 %.

Run: `uv run --locked ruff check . && uv run --locked ruff format --check . && uv run --locked mypy`
Expected: all three exit 0.

`test:visual` is not run here (Linux/Docker only; Part E re-baselines after Part D).

- [ ] **Step 7: Commit the merge**

```bash
git add web/src/state/urlState.ts web/src/state/urlState.test.ts
git status --porcelain
git commit -m "$(cat <<'EOF'
merge: web data layer (Part B) onto the static exporter (Part A)

Conflicts resolved as the union of both sides: client.ts keeps Part B's
transport imports plus Part A's SuperpositionDefaultRepresentation;
useSceneStore.test.ts keeps both appended describe blocks.

applyDeepLink now passes the preset's published default_representation
(Part A made it a required argument), so a 2s-2pz deep link opens the
slice instead of the isosurface the server refuses with 422.

Claude-Session: https://claude.ai/code/session_01E44DEzsc7Av26fc7nZ5rSo
EOF
)"
```

Expected: before the commit, `git status --porcelain` lists only staged (`M `/`A `) entries from the merge — no unmerged (`UU`) and no unstaged path. After it, `git log -1 --format=%P` shows two parents.

---

### Task B15: Tie the web spec fixture to Part A's `DEFAULT_SPEC`

**Precondition:** B14 committed (Part A's `quviz.export.catalog_spec` is on this branch).

**Files:**
- Test: `tests/test_web_static_spec_fixture.py` (new)
- Modify: `web/tools/fixtures/spec.json` (regenerated from `DEFAULT_SPEC`; same JSON value, Python's two-space layout)

**Interfaces:**
- Consumes: `DEFAULT_SPEC`, `spec_json_text(spec: StaticCatalogSpec) -> str` (`quviz.export.catalog_spec`, Part A task A1: `json.dumps(spec.to_json(), indent=2, ensure_ascii=False) + "\n"`).
- Produces: a pytest pin that `web/tools/fixtures/spec.json` is byte-identical to what `quviz export-static plan` writes as `spec.json`. B7 hand-copied the contract JSON because the exporter was not on its branch; nothing tied the two afterwards, so the 1242-request enumeration, `capability.static.test.ts`, `staticCatalog.test.ts`, `useSceneStore.test.ts` and `main.test.tsx` could keep passing against a spec the exporter no longer writes.

- [ ] **Step 1: Write the failing test** — create `tests/test_web_static_spec_fixture.py`:

```python
"""The web's spec.json fixture is Part A's DEFAULT_SPEC, byte for byte.

``web/tools/fixtures/spec.json`` feeds the web specs (the static capability
overlay, the static catalogue, the store pins, the entry point) and the
1242-request enumeration smoke. ``quviz export-static plan`` writes the real
``spec.json`` from ``DEFAULT_SPEC``. Nothing else ties the two, so a change on
either side fails here instead of letting the web specs pass against a
specification the exporter no longer writes.

After an intended change to ``DEFAULT_SPEC``, regenerate the fixture from the
repository root and review the web specs that read it::

    uv run --locked --no-sync python -c "from pathlib import Path; from quviz.export.catalog_spec import DEFAULT_SPEC, spec_json_text; Path('web/tools/fixtures/spec.json').write_bytes(spec_json_text(DEFAULT_SPEC).encode('utf-8'))"
"""

from __future__ import annotations

from pathlib import Path

from quviz.export.catalog_spec import DEFAULT_SPEC, spec_json_text

ROOT = Path(__file__).resolve().parents[1]
WEB_SPEC_FIXTURE = ROOT / "web" / "tools" / "fixtures" / "spec.json"


def test_web_spec_fixture_is_the_exported_default_spec_byte_for_byte() -> None:
    expected = spec_json_text(DEFAULT_SPEC).encode("utf-8")
    assert WEB_SPEC_FIXTURE.read_bytes() == expected, (
        "web/tools/fixtures/spec.json differs from spec_json_text(DEFAULT_SPEC); regenerate it "
        "with the command in this module's docstring"
    )
```

- [ ] **Step 2: Run it and see it fail**

Run: `uv run --locked --no-sync pytest tests/test_web_static_spec_fixture.py -q`
Expected: FAIL — `AssertionError: web/tools/fixtures/spec.json differs from spec_json_text(DEFAULT_SPEC)…`; the byte diff shows the fixture's inline arrays (`"bases": ["real", "complex"],`) against Python's one-item-per-line layout (`"bases": [\n      "real",\n      "complex"\n    ],`). The JSON values are equal (both are the contract), which the next steps confirm.

- [ ] **Step 3: Regenerate the fixture from `DEFAULT_SPEC`**

```bash
uv run --locked --no-sync python -c "from pathlib import Path; from quviz.export.catalog_spec import DEFAULT_SPEC, spec_json_text; Path('web/tools/fixtures/spec.json').write_bytes(spec_json_text(DEFAULT_SPEC).encode('utf-8'))"
git diff --stat web/tools/fixtures/spec.json
node -e "const fs=require('fs'); const {execSync}=require('child_process'); const now=JSON.parse(fs.readFileSync('web/tools/fixtures/spec.json','utf8')); const before=JSON.parse(execSync('git show HEAD:web/tools/fixtures/spec.json').toString()); if (JSON.stringify(now)!==JSON.stringify(before)) { console.error('JSON value changed'); process.exit(1) } console.log('same JSON value, key order included')"
```

Expected: `write_bytes` writes LF line endings (binary write, no newline translation on Windows; `.gitattributes` is `* text=auto eol=lf`); `git diff --stat` shows only `web/tools/fixtures/spec.json` changed; the `node` check prints `same JSON value, key order included`. If it prints `JSON value changed`, stop: Part A's `DEFAULT_SPEC` no longer equals the contract, which is Part A's defect to fix, not this fixture's.

- [ ] **Step 4: Run it and see it pass**

Run: `uv run --locked --no-sync pytest tests/test_web_static_spec_fixture.py -q`
Expected: `1 passed`.

Run: `(cd web && npm exec --no -- vitest run src/api/staticCatalog.test.ts src/api/capability.static.test.ts src/api/staticEnumeration.test.ts src/state/useSceneStore.test.ts src/components/useSceneAsset.test.tsx src/main.test.tsx)`
Expected: PASS — every spec that reads the fixture parses it to the same value.

- [ ] **Step 5: Pre-commit gate (CLAUDE.md: a new Python test and a changed `web/` file)**

Run: `uv run --locked --group docs pytest --cov=quviz --cov-report=term-missing`
Expected: all pass, 0 skipped, total coverage ≥ 85 %.

Run: `uv run --locked ruff format tests/test_web_static_spec_fixture.py && uv run --locked ruff check . && uv run --locked ruff format --check . && uv run --locked mypy`
Expected: all exit 0 (`ruff format` normalises the new module's layout first; `mypy` covers `src/` and does not change).

Run: `npm --prefix web run test`
Expected: exit 0.

Run: `npm --prefix web run typecheck`
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add tests/test_web_static_spec_fixture.py web/tools/fixtures/spec.json
git commit -m "$(cat <<'EOF'
test: pin the web spec.json fixture to the exporter's DEFAULT_SPEC

Regenerates web/tools/fixtures/spec.json with spec_json_text(DEFAULT_SPEC)
(same JSON value, Python's layout) and fails if the two ever drift.

Claude-Session: https://claude.ai/code/session_01E44DEzsc7Av26fc7nZ5rSo
EOF
)"
```

---

### Task B16: Final gates on the merged A+B tree and the real-data enumerator smoke

**Files:** none changed (verification only).

**Interfaces:** consumes everything above plus Part A; produces the verification record Part D starts from.

- [ ] **Step 1: Web gates**

Run: `npm --prefix web run test`
Expected: exit 0; 0 skipped, 0 todo; every gated module at ≥ 90/85/90/90.

Run: `npm --prefix web run typecheck`
Expected: exit 0 (includes `tsconfig.tools.json`).

Run: `npm --prefix web run build:pages && ls web/dist/assets | grep -c '\.map$'; grep -c 'src="./assets/' web/dist/index.html`
Expected: build succeeds; `0` source maps; `1` relative script tag.

Run: `npm --prefix web run build && grep -c 'src="./assets/' web/dist/index.html`
Expected: build succeeds; `1`; the live bundle is back in `web/dist`.

- [ ] **Step 2: Live fullstack browser gate**

Run: `npm --prefix web run test:fullstack`
Expected: exit 0; `assert-fullstack-run.mjs` passes.

- [ ] **Step 3: Python and docs gates (Shared commands)**

Run: `uv run --locked --group docs pytest --cov=quviz --cov-report=term-missing`
Expected: all pass, 0 skipped, coverage ≥ 85 % (includes `tests/test_web_static_spec_fixture.py`, `tests/test_slice_builders.py`'s parse of the untouched `EIGENSTATE_S_SLICE_FLOORS`, and `tests/test_check_script.py`'s 13 pinned `web/scripts/` files).

Run: `uv run --locked ruff check . && uv run --locked ruff format --check . && uv run --locked mypy`
Expected: all exit 0.

Run: `uv run --locked --group docs python scripts/render_reference_index.py --check && uv run --locked --group docs python scripts/render_openapi_reference.py --check && uv run --locked --group docs mkdocs build --strict`
Expected: all exit 0.

- [ ] **Step 4: Enumerator on the real exporter output, compared with the fixture run**

```bash
SMOKE="$(cygpath -m "$(mktemp -d)")"
cp web/tools/fixtures/spec.json "$SMOKE/spec.json"
cp tests/fixtures/visual/catalog-orbitals.json "$SMOKE/catalog-orbitals.json"
cp tests/fixtures/visual/catalog-superposition.json "$SMOKE/catalog-superpositions.json"
(cd web && npm exec --no -- vite-node tools/static-requests.ts -- "$SMOKE")
REAL="$(cygpath -m "$(mktemp -d)")"
uv run --locked --no-sync quviz export-static plan --out "$REAL"
(cd web && npm exec --no -- vite-node tools/static-requests.ts -- "$REAL")
node -e "const fs=require('fs'); const read=(d)=>JSON.parse(fs.readFileSync(d+'/requests.json','utf8')); const fixture=read(process.argv[1]); const real=read(process.argv[2]); if (real.format!=='quviz-static-requests/1' || JSON.stringify(real.requests)!==JSON.stringify(fixture.requests)) { console.error('real and fixture enumerations differ'); process.exit(1) } console.log('real requests.json equals the fixture run', real.requests.length)" "$SMOKE" "$REAL"
cmp "$REAL/spec.json" web/tools/fixtures/spec.json && echo "spec.json identical"
```

Expected: two `static-requests: 写出 1242 个请求 -> …` lines, then `real requests.json equals the fixture run 1242` and `spec.json identical`. A difference means the committed catalogue fixtures and the live catalogue routes disagree; stop and report it (the fix belongs to whichever fixture is stale), do not edit the check.

The replay itself (`quviz export-static render`, about 9-10 minutes for this list per Part A) and the browser run over its output belong to Part E (`scripts/build_pages.py`, `web/pages-e2e`).

- [ ] **Step 5: Not run (state it in the hand-off)**

`npm --prefix web run test:visual` (Linux/Docker only; Part E re-baselines after Part D's redesign).

- [ ] **Step 6: Confirm nothing is left uncommitted**

Run: `git status --porcelain`
Expected: empty. This task changes no files, so it has no commit. If a gate fails, fix it in a new commit with a regression test when it is a defect, then rerun this task from Step 1.

---

## Self-review

### Spec coverage (spec section → task)

| Spec / contract item | Task |
|---|---|
| §4.3 `transport.ts`, `liveTransport` byte-identical, `createStaticTransport` hit/miss/headers | B1, B7 |
| §4.3 `client.ts` 10 fetch sites via the transport; pure request formation; exact-URL assertions unchanged | B2, B3 |
| §4.3 request formation reused by static capability and build-time enumeration; §7 risk "enumeration vs runtime drift" | B4 (anti-drift spec), B8 (`isPrecomputed`), B12 (round-trip spec) |
| §4.3 `staticCatalog.ts` (manifest relative to `document.baseURI`, `has(key)` → `isPrecomputed`/manifest lookup, `spec`) | B7, B8, B11 |
| §4.3 capability overlay: physics first, `not_precomputed`, no `/api` in reasons, pinned tunables, Z fixed, `values` for `timeAu`, planes/observables narrowed | B8, B9 |
| §4.3 `urlState.ts` (hash → store, `replaceState`, invalid → defaults, embed) | B10, B11 |
| §4.3 build mode `build:pages`, `import.meta.env.MODE === 'pages'`, `vite/client` types, no `.d.ts` | B5, B11 |
| §4.3 `web/tools/static-requests.ts` via vite-node, outside `web/scripts/` | B12 |
| §3 D1/D4 relative base serving `/` and the Pages sub-path | B5, B13 (fullstack gate) |
| §5 `DEFAULT_PLAYBACK_PERIOD_AU = 39.6` default removed (regression test fails first) | B6 |
| §5 no 6 MB sourcemap on Pages | B5 |
| §6 web unit tests: transport, staticCatalog, overlay, urlState; `npm run test` + `npm run typecheck` | B1, B7, B8, B10, B13 |
| Contract "B → A/E" `requests.json` (sorted, unique, catalogue + metadata requests) | B12, B13 |
| Contract "B produces" `fetchOrbitalMetadata`, `runtimeMode`, `setStaticCatalog`, `isPrecomputed`, `DeepLinkState` API | B3, B5, B8, B10 |
| Contract `NOT_PRECOMPUTED_DETAIL` as the one user-visible `not_precomputed` wording (every reason starts with it; C quotes it, E matches `未预计算`) | B7 (definition, exact-text pin), B8 (all five spec limits + planner miss), B9 (end to end through `useSceneAsset`) |
| §5 row 1 `2s+2p_z` must not open on the 422 isosurface — for deep links (Part A fixes the store and panel) | B14 (regression test fails on the merged tree before the fix) |
| §4.3 / contract "B → A/E": the enumerator reads Part A's `spec.json`; the web fixture cannot drift from `DEFAULT_SPEC` | B15 |
| §6 / CLAUDE.md "提交前": `npm run test` + `npm run typecheck` before every web commit; `test:fullstack` for interface/startup changes; Python gate for Python | Step 5 of B1–B12, B14 Step 6, B15 Step 5 |
| Contracts "Execution order" merge before D, verified on the merged tree | B14 (merge + gates), B16 (final gates, real-data enumerator smoke) |
| Coverage latch for every new module | B1, B2, B5, B7, B10, B12; verified B13, B16 |

Out of scope here and owned elsewhere: visual presentation of refusals, the time pill's frame stepping and prefetch (Part D, using `ParameterBound.values`, `requestsForPlan` and `getTransport`), the embed-mode chrome and "在实验室中打开" link (Part D, using `isEmbedMode`/`serializeDeepLink`), docs for `build:pages` and the enumerator (Parts C/E), `build_pages.py`, pages-e2e and the visual baselines (Part E), the store/panel side of the 2s-2pz fix (Part A, A10–A11).

### Placeholder scan

Searched this plan for "TBD", "TODO", "appropriate", "similar to Task", "write tests for": no occurrences. Every step that changes code shows the code; every run step names the command and the expected result. The only values not spelled out are the two worktree branch names in B14, which the orchestrator chooses at run time; B14 says where to read them (`git worktree list`) and checks the Part A precondition before merging.

### Cross-part review findings (2026-09-25) and what changed

1. **Blocker — `setSuperposition` arity after A11.** Valid, and worse than reported: on the merged tree the four-argument call does not merely reopen the isosurface, it stores `superpositionDefaultRepresentation: undefined`, and A11's `openingRepresentation` then makes `capabilityFor` throw (`capability.ts:677-682`), so every preset deep link crashes `bindUrlState`. B10 cannot pass the argument on its own branch (A11's signature and `SuperpositionPreset.default_representation` do not exist there; it would be TS2554/TS2339), so the fix lives in the new merge task B14: `applyDeepLink` passes `preset.default_representation`, the expectation becomes `#mode=superposition&preset=2s-2pz&rep=slice&plane=xz&obs=probability_density`, and a new regression test (2s-2pz → slice; explicit `rep=isosurface` honoured; 1s-2pz → isosurface) fails before the fix. B10 records the interaction. The contracts file is not mine to edit; the additions are listed below.
2. **Major — no `not_precomputed` reason contained `未预计算`.** Valid (B8's reasons said `没有预计算` / `只预计算`). Now every such reason starts with `NOT_PRECOMPUTED_DETAIL` verbatim and the planner miss is exactly it (B7, B8), pinned over all five spec limits plus the miss, and end to end in `useSceneAsset.test.tsx` (B9). Part C's chapter-0 quote and Part E's `toContainText('未预计算')` are true as those plans are written; neither needs to change.
3. **Major — pre-commit gate.** Valid. Each of B1–B12 now runs `npm --prefix web run test` and `npm --prefix web run typecheck` before committing; B3, B5, B11 and B14 add `test:fullstack` (CLAUDE.md: interface or startup changes), B5 adds the Python pins on `package.json`, B14/B15 run the Python gate.
4. **Minor — spec fixture drift.** Valid. B15 adds `tests/test_web_static_spec_fixture.py` (byte equality with `spec_json_text(DEFAULT_SPEC)`), which fails first against B7's hand-copied layout, and regenerates the fixture (same JSON value, checked).
5. **Minor — merge of A and B.** Valid in substance. Checked against both plans: textual conflicts are expected only in the `client.ts` import block and at the end of `useSceneStore.test.ts`; A11's `useSceneStore.ts` edits and B9's do not share or touch lines (B9 edits line 3, 108-118, after 172 and 394-402; A11 edits 5-11, 15-106, 174-184 and 226-363), so that file is expected to merge cleanly. B14 resolves by union, gives the exact resolved import block, and runs `npm run test`, `typecheck`, `test:fullstack` and the Python gate on the merged tree before Part D starts; the Global Constraints list Part A's parallel edits.

### Contract amendments requested (the orchestrator owns `2026-09-25-contracts.md`; this part may not edit it)

- **Part A additions Part B consumes (B14) and Part D will see:** `SuperpositionCatalogEntry.default_representation: 'isosurface' | 'slice'` (required; `SuperpositionPreset` in TS), `SuperpositionDefaultRepresentation`, `SceneStore.superpositionDefaultRepresentation`, `setSuperposition(terms, label, sliceResolutionFloor, streamlineSeedCountMax, defaultRepresentation)` and `syncSuperpositionCapabilities(terms, sliceResolutionFloor, streamlineSeedCountMax, defaultRepresentation)` (both breaking).
- **Canonical `not_precomputed` wording:** "every `not_precomputed` reason starts with `NOT_PRECOMPUTED_DETAIL` verbatim; the planner miss is exactly it; the static transport's 404 `detail` is it". `NOT_PRECOMPUTED_DETAIL` is defined in `capability.ts` and re-exported from `staticCatalog.ts` (import-cycle reason in B7).
- **Enumerator command:** run from the working directory `web/`: `cd web && npm exec --no -- vite-node tools/static-requests.ts -- <data>` (from the repo root `npm --prefix web exec` keeps the repo root as cwd and `tools/…` does not resolve; `npm --prefix web exec …` also works when the cwd is `web/`, verified).
- **`ParameterBound.step?: number`** (optional), not `step: number` (B8, `ControlPanel.tsx:63`).
- **Part B extras other parts use:** `SceneStatus.unavailable.refusal?: 'unsupported' | 'not_implemented' | 'not_precomputed'` (B9), `chargeBound()`, `staticCatalogSpec()`, `clampToBound()`, `STATIC_MISS_REASON`, `STATIC_A_MU` (B8), `deepLinkFromStore()`, `applyDeepLink()`, `lastSuperpositionCatalog()`, `rememberSuperpositionCatalog()` (B10), `parseStaticSpec()` (B7), `parseOrbitalCatalog()`, `parseSuperpositionCatalog()` (B3).
- **Deep links while playing:** the hash carries no `t` while the clock runs and is not rewritten on ticks; pausing writes the frame on screen as `t` (omitted at 0) (B10). A Part E or D test that expects a `t` per playback frame contradicts this.
- **Spec staleness Part B follows the contracts on:** `data/` not `data/v1/` (B11); `requests.json` holds request strings, not `{route, query}` objects (B12); file names `sha256(body)[:24]` (B7's `FILE_NAME` pattern).

### Interface consistency with `design/plans/2026-09-25-contracts.md`

- `Transport`, `requestKey`, `liveTransport`, `getTransport`, `setTransport`, `resetTransport`: names and signatures as in the contract (B1).
- `ApiRequest`, the eight builders, `ORBITAL_CATALOG_REQUEST`, `SUPERPOSITION_CATALOG_REQUEST`, `requestsForPlan`: contract signatures and argument orders; query orders equal today's `client.ts` (B2, B4).
- `fetchOrbitalMetadata(orbital, signal?)`: added; existing fetchers keep their signatures (B3).
- `RuntimeMode`, `runtimeMode()`: as specified (B5).
- `StaticSpec` (JSON keys as-is), `StaticManifestEntry`, `StaticManifest`, `parseStaticManifest`, `loadStaticManifest(dataBase, signal?)` with `cache: 'no-cache'`, `createStaticTransport`, `NOT_PRECOMPUTED_DETAIL` (exact contract text, exported from `staticCatalog.ts` as the contract says; the definition sits in `capability.ts` to avoid a runtime import cycle), `playbackFrames` (period 0 → `[0]`): as specified (B7).
- Part A's store/catalogue additions (not in the contracts file yet): consumed exactly as Part A's A10/A11 define them — `preset.default_representation` passed as the required fifth argument of `setSuperposition` (B14). Part B never calls `syncSuperpositionCapabilities`.
- `ParameterBound.values`, refusal status `'not_precomputed'`, `setStaticCatalog`, `isPrecomputed`: as specified (B8). **Deviation:** `ParameterBound.step` stays optional (`step?: number`) because `ControlPanel.tsx:63` (Part D's file) compares it with `undefined` and a required `number` fails tsc (TS2367); every emitted bound carries a step. **Derivation note:** `timeAu.values` are the manifest's times per superposition `terms`, which equal `playbackFrames(period)` by construction (B12 round-trip spec), because `capabilityFor` has no catalogue period in its inputs and `setStaticCatalog` receives only the manifest.
- `DeepLinkState`, `parseDeepLink`, `serializeDeepLink` (key order `embed,mode,n,l,m,z,basis,preset,t,rep,plane,obs`, no leading `#`), `bindUrlState(): () => void`, `isEmbedMode()`: as specified (B10).
- Static bootstrap in `src/main.tsx` with `new URL('data/', document.baseURI)` and a Chinese error screen: as specified (B11). The spec's `data/v1/` wording is superseded by the contract's `data/`.
- `web/package.json` `build:pages` exactly `tsc -b && vite build --mode pages --sourcemap false`; `vite.config.ts` `base: './'`; `vite/client` in tsconfig `types` with no new `.d.ts` (B5).
- `requests.json` envelope `{"format": "quviz-static-requests/1", "requests": [...]}`, sorted and de-duplicated; command `npm --prefix web exec --no -- vite-node tools/static-requests.ts -- <data>` — must be run with the working directory `web/` (verified; recorded for Part E) (B12).
- Manifest assumptions Part B enforces on Part A's output: `version` 16 lowercase hex, `file` = `files/<24 lowercase hex>.json|.bin`, header names lowercase `x-quviz-*`, statuses 200..599 excluding 204/205/304 — all as written in the contract.
