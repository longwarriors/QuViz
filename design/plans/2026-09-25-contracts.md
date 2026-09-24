# Cross-part contracts — Pages textbook site + Weather-Lab lab

Spec: `design/specs/2026-09-25-pages-textbook-lab-design.md`. Every plan part (A–E) MUST use exactly these
names, paths, shapes and commands. If a part needs something not listed here, it defines it inside its own
tasks and does not rely on another part providing it.

## Part ownership

| Part | Scope | Plan file |
|---|---|---|
| A | Python: `quviz.export` static catalog exporter + CLI, `radial_profile` in metadata API, 2s-2pz default-view fix | `design/plans/2026-09-25-part-a-python-export.md` |
| B | Web data layer: transport seam, pure request formation, static manifest + static capability overlay, URL/hash state + embed flag, `pages` build mode, request enumerator tool | `design/plans/2026-09-25-part-b-web-data.md` |
| C | Textbook: `docs/textbook/*` chapters, nav restructure, Weather-Lab MkDocs theme, figure embed JS + theme override, stale-doc updates, ADR-0005 | `design/plans/2026-09-25-part-c-textbook.md` |
| D | Weather-Lab UI redesign of the React app (components, CSS tokens, z-up camera, charts, guide dialog, search, error boundary, mobile), unit/e2e test updates | `design/plans/2026-09-25-part-d-redesign.md` |
| E | `scripts/build_pages.py`, `.github/workflows/pages.yml` + tests, `web/pages-e2e` suite, Docker visual baselines, status/roadmap/README, final full-gate run | `design/plans/2026-09-25-part-e-pages-build.md` |

Execution order: A, B, C in parallel (separate worktrees) → merge → D → E.
D may assume every "Produces" item of A and B exists. E may assume A–D exist.

## A → B/E : files written by the exporter

Output root `<data>` = `build/pages/data/` (E passes it explicitly; nothing is hard-coded to `build/`).

1. `quviz export-static plan --out <data>` writes:
   - `<data>/catalog-orbitals.json` = exact bytes of `GET /api/orbitals/catalog`
   - `<data>/catalog-superpositions.json` = exact bytes of `GET /api/superposition/catalog`
   - `<data>/spec.json` = `StaticCatalogSpec.to_json()`:

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

   Values such as `resolution`, `seed_count` are the UI *defaults*; the client clamps them per state exactly as
   the live UI does (capability floors, catalogue seed maxima). `"frames": "playback-lattice"` means the
   enumerator uses `playbackFrames(periodAu)` (Part B) — degenerate presets (period 0) yield `[0]`.

2. `quviz export-static render --data <data> --requests <data>/requests.json [--workers N]` replays every
   request through the ASGI app and writes:
   - one file per distinct response body: `<data>/files/<sha256(body)[:24]>.json` (JSON bodies) or `.bin`
     (anything else, e.g. QVPC);
   - `<data>/manifest.json`:

```json
{
  "format": "quviz-static/1",
  "version": "<sha256 over the sorted (key, file, status) triples, first 16 hex>",
  "spec": { "...": "the spec.json object verbatim" },
  "entries": {
    "/api/orbitals/catalog": {"file": "files/3f…c1.json", "status": 200, "content_type": "application/json", "headers": {}},
    "/api/orbitals/point-cloud?n=2&l=1&m=0&z=1&basis=real&samples=28000&seed=7": {
      "file": "files/9a…77.bin", "status": 200, "content_type": "application/vnd.quviz.point-cloud",
      "headers": {"x-quviz-format": "QVPC/1", "x-quviz-radial-mass": "1.000000000", "x-quviz-extent-bohr": "17.828133"}
    }
  }
}
```

   - `headers` keeps only lower-cased `x-quviz-*` response headers. Non-2xx responses (e.g. 422) are stored
     like any other (their JSON `{"detail": …}` body is the file).
   - The entry key is the request string copied **verbatim** from `requests.json`; Python never re-spells it.

## B → A/E : requests.json (written by the enumerator)

`npm --prefix web exec --no -- vite-node tools/static-requests.ts -- <data>` reads `<data>/spec.json`,
`<data>/catalog-orbitals.json`, `<data>/catalog-superpositions.json` and writes `<data>/requests.json`:

```json
{"format": "quviz-static-requests/1", "requests": ["/api/orbitals/catalog", "/api/superposition/catalog", "/api/orbitals/metadata?n=1&l=0&m=0&z=1&basis=real", "…"]}
```

Each string is `route` or `route + "?" + query`, byte-identical to what `liveTransport` would request for the
same call (see `requestKey` below). Sorted, de-duplicated.

## B produces (TypeScript, all under `web/src/`)

```ts
// src/api/transport.ts
export interface Transport {
  request(route: string, query: URLSearchParams | null, signal?: AbortSignal): Promise<Response>
}
export function requestKey(route: string, query: URLSearchParams | null): string // route or route?query (query.toString())
export const liveTransport: Transport          // fetch(requestKey(route, query), { signal })
export function getTransport(): Transport
export function setTransport(transport: Transport): void   // tests + static bootstrap
export function resetTransport(): void

// src/api/requests.ts  — pure request formation, shared by client.ts, the enumerator and the static overlay
export interface ApiRequest { route: string; query: URLSearchParams | null }
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
export function requestsForPlan(plan: ScenePlan, inputs: SceneRequestInputs): readonly ApiRequest[] // point cloud → [pointCloud, metadata]
// (exact parameter order of each query = today's client.ts order; Part B pins it with the existing exact-URL tests)

// src/api/client.ts — existing fetchers keep their signatures; add:
export function fetchOrbitalMetadata(orbital: OrbitalRequestState, signal?: AbortSignal): Promise<OrbitalMetadata>

// src/api/runtimeMode.ts
export type RuntimeMode = 'live' | 'static'
export function runtimeMode(): RuntimeMode                   // import.meta.env.MODE === 'pages' → 'static'

// src/api/staticCatalog.ts
export interface StaticSpec { /* mirrors spec.json above, camelCase not required: use the JSON keys as-is */ }
export interface StaticManifestEntry { file: string; status: number; content_type: string; headers: Record<string, string> }
export interface StaticManifest { format: 'quviz-static/1'; version: string; spec: StaticSpec; entries: Record<string, StaticManifestEntry> }
export function parseStaticManifest(raw: unknown): StaticManifest          // validates; throws Error with a Chinese message
export async function loadStaticManifest(dataBase: URL, signal?: AbortSignal): Promise<StaticManifest> // fetch(new URL('manifest.json', dataBase), {cache: 'no-cache'})
export function createStaticTransport(manifest: StaticManifest, dataBase: URL): Transport
export const NOT_PRECOMPUTED_DETAIL: string // '静态教材版未预计算这一组合。本地运行 quviz serve 可实时计算任意参数。'
export function playbackFrames(periodAu: number): readonly number[]      // exact nextTimeAu lattice for one period; period 0 → [0]

// src/api/capability.ts additions
export interface ParameterBound { min: number; max: number; step: number; values?: readonly number[] }
// CapabilityRefusal kind union gains 'not_precomputed'
export function setStaticCatalog(manifest: StaticManifest | null): void   // installs the overlay; null = live mode
export function isPrecomputed(plan: ScenePlan, inputs: SceneRequestInputs): boolean

// src/state/urlState.ts
export interface DeepLinkState {
  mode?: 'eigenstate' | 'superposition'
  n?: number; l?: number; m?: number; z?: number; basis?: BasisKind
  preset?: string; t?: number
  rep?: RepresentationKind; plane?: PrincipalPlane; obs?: SliceObservable
  embed?: boolean
}
export function parseDeepLink(hash: string): DeepLinkState       // tolerant: drops invalid keys, never throws
export function serializeDeepLink(state: DeepLinkState): string  // stable key order: embed,mode,n,l,m,z,basis,preset,t,rep,plane,obs
export function bindUrlState(): () => void                       // hash → store at start + on hashchange; store → history.replaceState
export function isEmbedMode(): boolean
```

`web/tools/static-requests.ts` (run with vite-node; not under `web/scripts/`). `web/package.json` gains
`"build:pages": "tsc -b && vite build --mode pages --sourcemap false"`. `vite.config.ts` gains `base: './'`.
tsconfig `types` gains `vite/client` (no new `.d.ts` file). Static bootstrap happens in `src/main.tsx`
before first render: in static mode load the manifest from `new URL('data/', document.baseURI)`, install
`createStaticTransport` + `setStaticCatalog`; on failure render a readable Chinese error screen.

## A produces (API contract change)

`OrbitalMetadata.radial_profile: RadialProfile | null` (pydantic, in `src/quviz/scene/models.py`), populated for
eigenstate metadata (`/api/orbitals/metadata` and wherever `OrbitalMetadata` is built for an eigenstate):

```python
class RadialProfile(BaseModel):
    r_bohr: list[float]                 # 256 ascending points, r_bohr[0] == 0.0, last covers >= 0.999 radial mass
    radial_density: list[float]         # P(r) = r^2 |R_nl(r)|^2 in 1/bohr; trapezoid integral over r_bohr == 1 +/- 1e-3
    nodes_bohr: list[float]             # n - l - 1 radial node radii (ascending)
    expectation_r_bohr: float           # <r> = (a_mu/(2Z)) [3n^2 - l(l+1)]  (analytic)
    most_probable_r_bohr: float         # argmax of P(r) (grid-refined)
    energy_levels_hartree: list[float]  # E_k for k = 1..max(n+2, 5), same reduced-mass convention as metadata energy
```

TS type comes from regenerated `web/src/api/schema.gen.ts` (`npm --prefix web run codegen` after refreshing
`tests/fixtures/openapi.json`); `docs/reference/http-schema.md` regenerated by `scripts/render_openapi_reference.py`.

## D produces (consumed by E and C)

- Every floating overlay element (header, control panel, time pill, detail panel, legend pill, search pill,
  guide dialog, toasts) carries the attribute `data-chrome` (no value). Hiding `[data-chrome]` leaves only the
  `<canvas>` visible.
- Exactly one `<canvas>` in the document; scene readiness is still `[data-scene-ready]` on the canvas container.
- Status text still exposed as `span[data-status]` with the existing five-case precedence and strings.
- Header in static mode has link with accessible name `教材` → `./learn/`; in live mode keeps `查看 OpenAPI` → `/docs`.
- Embed mode (`isEmbedMode()`): header, control panel, search, guide are not rendered; the canvas, legend pill,
  time pill and an `在实验室中打开` link (target `_blank`, href = `./#` + same deep link without `embed`) remain.

## C produces (consumed by E)

- MkDocs site builds with `--strict` from repo root; Pages build uses a generated config (E writes it):

```yaml
INHERIT: <abs path>/mkdocs.yml
site_url: <pages url>learn/
extra:
  quviz:
    lab_url: "../"
```

- `mkdocs.yml` gets `theme.custom_dir: overrides` and `extra.quviz.lab_url: "http://127.0.0.1:8000/"`.
- Figures: `<figure class="quviz-figure" data-lab="<deep link without leading #>" markdown>caption</figure>`;
  `docs/assets/javascripts/quviz-figure.js` resolves `lab_url` relative to the site root derived from Material's
  `__config.base` and builds `<lab>#embed=1&<data-lab>` for the iframe and `<lab>#<data-lab>` for the link.

## Shared commands

- Python gate: `uv run --locked --group docs pytest --cov=quviz --cov-report=term-missing` (fail_under 85)
- Lint/type: `uv run --locked ruff check .`, `uv run --locked ruff format --check .`, `uv run --locked mypy`
- Docs: `uv run --locked --group docs python scripts/render_reference_index.py --check`,
  `uv run --locked --group docs python scripts/render_openapi_reference.py --check`,
  `uv run --locked --group docs mkdocs build --strict`
- Web: `npm --prefix web run test`, `npm --prefix web run typecheck`, `npm --prefix web run build`
- Fullstack (live): `npm --prefix web run test:fullstack`
- Visual (Linux only, Docker): see Part E.
- Local Node is v24.14.1 (engine-strict rejects `npm ci`/`npm install`): **no new npm dependencies**; `npm run`
  works with the existing `node_modules`.

## Amendments after the cross-part review (binding; supersede anything above)

1. **Part A additions** (A10/A11):
   - `SuperpositionCatalogEntry.default_representation: "isosurface" | "slice"` — required; server-probed per
     preset at catalogue build (cached). TS: `SuperpositionPreset['default_representation']`;
     `export type SuperpositionDefaultRepresentation` in `web/src/api/types.ts`; `parseSuperpositionPreset`
     rejects a missing/unknown value.
   - Store: `SceneStore.superpositionDefaultRepresentation` (initially `'isosurface'`);
     `setSuperposition(terms, label, sliceResolutionFloor, streamlineSeedCountMax, defaultRepresentation)` and
     `syncSuperpositionCapabilities(terms, sliceResolutionFloor, streamlineSeedCountMax, defaultRepresentation)`
     — both **breaking** (last argument required). Every caller in B and D passes `entry.default_representation`.
   - Applying a preset or switching to superposition mode opens the published default; an explicit
     `setRepresentation` is honoured.
2. **Exporter failure rule:** `render` aborts (exit 1, names the key, writes no manifest) on 5xx, **404**, or a
   transport exception; every other status (e.g. 422) is stored.
3. **Canonical `not_precomputed` wording:** `NOT_PRECOMPUTED_DETAIL` =
   `静态教材版未预计算这一组合。本地运行 quviz serve 可实时计算任意参数。` Every `not_precomputed` reason
   starts with it verbatim; the planner miss is exactly it; the static transport's 404 `detail` is it. Defined in
   `capability.ts`, re-exported from `staticCatalog.ts`. Tests and docs match on the substring `未预计算`.
4. **Enumerator command** runs with working directory `web/`:
   `cd web && npm exec --no -- vite-node tools/static-requests.ts -- <abs data dir>`.
   Likewise every direct `vitest`/`tsc -p` invocation runs from `web/` (`npm --prefix web exec` keeps the repo
   root as cwd). `npm --prefix web run <script>` is fine from anywhere.
5. `ParameterBound.step?: number` stays optional.
6. **Part B extras** others may use: `SceneStatus.unavailable.refusal?: 'unsupported' | 'not_implemented' |
   'not_precomputed'`, `chargeBound()`, `staticCatalogSpec()`, `clampToBound()`, `STATIC_MISS_REASON`,
   `STATIC_A_MU`, `deepLinkFromStore()`, `applyDeepLink()`, `lastSuperpositionCatalog()`,
   `rememberSuperpositionCatalog()`, `parseStaticSpec()`, `parseOrbitalCatalog()`, `parseSuperpositionCatalog()`.
   Static Z comes from `chargeBound()` (single source); D must not re-derive it from `runtimeMode()`.
   `bindUrlState()` is called once, in `main.tsx` (B11); App must not bind again.
7. **Deep links while playing:** no `t` in the hash while the clock runs and no rewrite on ticks; pausing writes
   the frame on screen as `t` (omitted at 0). Tests read the playing frame from the time pill, not the hash.
8. **Data layout:** `build/pages/data/{manifest.json, spec.json, requests.json, catalog-*.json, files/<sha256(body)[:24]>.json|.bin}`;
   no `v1/` segment, no `generated_by` field; `requests.json` holds request strings.
9. **Generated MkDocs Pages config** must also set absolute `docs_dir`, `theme.custom_dir` (absolute
   `<root>/overrides`, with `theme.name: material` repeated) and `watch: []`, because MkDocs resolves these
   relative to the generated file's directory.
10. **D hooks E relies on:** `button[data-representation]` with `aria-pressed`; `[data-control="playback"]` with
    `aria-pressed`/`aria-disabled` inside the `[data-chrome]` time pill, which also shows the current time as
    text; the guide `role=dialog` closes on Escape.
11. **Textbook:** the "≥ 1 interactive figure" rule applies to chapters 0–11; appendices are exempt. Every chapter
    gets an independent adversarial physics review (orchestrated at execution time, not by the author).
