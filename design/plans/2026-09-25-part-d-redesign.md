# Part D — Weather-Lab UI Redesign of the Lab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the "Quantum Observatory" three-column shell with a full-bleed WebGL canvas under floating glass panels (Weather-Lab layout language), fix the three colour-truthfulness defects of spec §5 that live in the renderer, turn the camera z-up, and add the detail charts, time pill, search, guide dialog, error boundary and mobile drawers — while every semantic behaviour the current unit/e2e tests pin (capability-driven controls, refused-but-focusable buttons, playback `aria-disabled` + note, five-case status precedence, legend branches, `—` for non-finite numbers, roving tabs, byte-checked colour ramps) survives.

**Architecture:** `App` becomes a thin shell: a fixed `.qv-stage` holds the one `<canvas>` (inside an `ErrorBoundary` and a `WebGLGate`), and a pointer-transparent `.qv-overlay` holds every floating panel, each carrying `data-chrome=""`. Behaviour that used to live inside `ControlPanel` is split into testable units: the catalogue loader (`state/catalogs.ts`), the playback clock (`components/usePlayback.ts` → `TimePill`), and focused control sections (`components/controls/*`). Charts are hand-written SVG fed by `useOrbitalMetadata` (Part B's `fetchOrbitalMetadata`, Part A's `radial_profile`). Colour data stays in `styles.css` (byte-checked); all layout/visual rules move to `lab.css` built on the spec §4.4 `--qv-*` tokens. The z-up camera, neutral scene background, xy ground grid and an in-canvas neutral axis gizmo (drei `GizmoHelper` + `GizmoViewport`, same WebGL context) replace the starfield and coloured lights.

**Tech Stack:** React 19, @react-three/fiber 9.7, @react-three/drei 10.7.8 (`Grid`, `Bounds`, `OrbitControls`, `GizmoHelper`, `GizmoViewport`), @react-three/postprocessing 3.0.4, three 0.185, zustand 5, lucide-react 1.33, vitest 3 + jsdom + @react-three/test-renderer, Playwright 1.62.1. No new npm dependencies (local Node 24.14.1 cannot `npm ci`).

**Spec:** `design/specs/2026-09-25-pages-textbook-lab-design.md` (§3 D8/D9/D10/D12, §4.4, §5, §6) · Contracts: `design/plans/2026-09-25-contracts.md` (Part D "produces", Part A/B "produces").

## Global Constraints

- Execution order is A, B, C → merge → **D** → E. D may assume every "Produces" item of A and B exists exactly as the contracts file names it: `src/api/transport.ts` (`getTransport`, `setTransport`, `resetTransport`), `src/api/requests.ts` (`ApiRequest`, `requestsForPlan`), `src/api/runtimeMode.ts` (`runtimeMode`), `src/api/staticCatalog.ts` (`playbackFrames`), `src/api/client.ts` (`fetchOrbitalMetadata`), `src/api/capability.ts` (`ParameterBound.values`, refusal status `'not_precomputed'`), `src/state/urlState.ts` (`parseDeepLink`, `serializeDeepLink`, `bindUrlState`, `isEmbedMode`), and `components['schemas']['RadialProfile']` in `src/api/schema.gen.ts`.
- D also builds on these A/B deliverables that the contracts file does not print (each verified in the A/B plans; D1 Step 1 re-checks them on the merged tree):
  - **A8**: `export type RadialProfile` and `OrbitalMetadata.radial_profile?: RadialProfile | null` already in `src/api/types.ts` — D never edits `types.ts`.
  - **A10**: `SuperpositionPreset.default_representation: 'isosurface' | 'slice'` (required in the regenerated `schema.gen.ts`; `'slice'` only for `2s-2pz`) and `export type SuperpositionDefaultRepresentation` in `src/api/types.ts`.
  - **A11** (breaking signatures): `SceneStore.superpositionDefaultRepresentation`; `setSuperposition(terms, label, sliceResolutionFloor, streamlineSeedCountMax, defaultRepresentation)`; `syncSuperpositionCapabilities(terms, sliceResolutionFloor, streamlineSeedCountMax, defaultRepresentation)`. A11 also forwards the field in `ControlPanel.tsx` (catalogue sync + mixture click) and adds two `ControlPanel.test.tsx` regression tests; D must carry both the forwarding and the tests through its rewrites (D9, D11, D18).
  - **B6**: `nextTimeAu(time, periodAu)` with the period required and `DEFAULT_PLAYBACK_PERIOD_AU` gone (spec §5 row 5 is B6's fix, not D's).
  - **B8**: `chargeBound(): ParameterBound` (the route's Z range live, `{min: z, max: z}` for the exported Z in the static build), `CapabilityInputs.superpositionTerms?: string`, `ParameterBound.step` kept optional.
  - **B11**: `bindUrlState()` is called once, in `src/main.tsx`'s `bootstrap`, for both modes — D never binds it again.
- Every call of `setSuperposition` or `syncSuperpositionCapabilities` passes the catalogue entry's `default_representation`, and every superposition-catalogue fixture (typed `SuperpositionPreset` or an untyped mock return) carries `default_representation` (`'slice'` for `2s-2pz`, `'isosurface'` otherwise, as A10 publishes).
- Zero skips, `xfail_strict`, `allowOnly: false`; no `it.skip`/`test.skip`/`.only` anywhere (guards.test.ts scans `src/`, `e2e/`, `fullstack-e2e/`).
- Specs never use JSX: `vitest.config.ts` declares no React plugin, so every test below builds elements with `createElement` (existing harness fact, see `src/scene/Atmosphere.test.tsx:12-17`).
- Every new `web/src` module is `.ts`/`.tsx`, has ≥ 1 runtime statement, reaches per-file 90/85/90/90, and is added **sorted** to both `coverageGated` and `pragmaScanned` in `web/coverage-scope.json` in the task that creates it. `vitest.config.ts` (`include: ['src/**/*.ts', 'src/**/*.tsx']`, lines 94–96 of the coverage block) and `src/guards.test.ts` (`coverage-gates exactly the modules coverage-scope.json lists`, lines 998–1031) derive the gated set from the file tree, so they need no edit — the manifest is the human latch. Sorting is JavaScript default order (upper-case before lower-case: `src/components/WebGLGate.tsx` < `src/components/charts/…`).
- No new `.d.ts`, `.js`, `.mts` under `web/src`; nothing added to `web/scripts/` (13-file pin in `tests/test_check_script.py:1844-1912`).
- Exactly one `<canvas>` in the document at all times; `[data-scene-ready]` stays on the canvas container (`src/scene/SceneReady.tsx:89-91`). Probe canvases (`WebGLGate`) and GizmoViewport's label textures are created with `document.createElement('canvas')` and never attached.
- Every floating overlay element carries the attribute `data-chrome=""` (contract "D produces"). No CSS rule may set `visibility: visible` on a descendant of chrome (hiding chrome with inline `visibility: hidden` must hide everything inside it).
- The five status strings and precedence of `App.tsx:59-87` are kept byte-for-byte, exposed as `span[data-status]`.
- Legend colour stops stay in `web/src/styles.css` under the selectors `.phase-wheel`, `.phase-dot.red`, `.phase-dot.cyan`, `.diverging-ramp`, `.density-ramp`, `.speed-ramp` (read from disk by `src/scene/color.test.ts:11-19`, `src/scene/SliceField.test.tsx:176-184`, and — new in D2 — `src/scene/speedColor.test.ts`).
- Chinese UI copy comes only from the copy deck below; scientific notation and the pinned scientific terms (`phase`, `level set`, `mask`, `streamlines`, `|j|/ρ`) are kept where existing tests or e2e specs read them.
- The visual baselines (`web/e2e/__screenshots__/slice.spec.ts/*.png`) are NOT regenerated here. After D21 `npm run test:visual` is expected to fail on pixel comparison until Part E regenerates the five baselines in `mcr.microsoft.com/playwright:v1.62.1-noble`; it cannot run on Windows anyway (`web/playwright.config.ts:50-58`).
- Line numbers in this plan are those of the files at `bbe1a5e` (the state the maps were verified against). Where an earlier D task, or a Part A/B/C merge, has already shifted a file, locate the edit by the quoted test title, selector or code, which every such reference also gives. A file D rewrites whole (`ControlPanel.tsx`, `App.tsx`, `Header.tsx`, `App.test.tsx`) must keep every A/B hunk D1 Step 1 lists; the code in this plan already includes the A11/B11 hunks named above.
- Inner loop (during a task): run only the affected specs with `npm --prefix web run test:watch -- run <files>`, which `npm run` executes as `vitest run <files>` with the working directory `web/`. Do **not** use `npm --prefix web exec -- vitest …`: `npm --prefix … exec` keeps the working directory at the repo root (measured: `tsc --showConfig` through it reports `Cannot find a tsconfig.json file at the current directory: …/QuViz`), so vitest would start without `web/vitest.config.ts` and every spec that resolves fixtures from `process.cwd()` (`useSceneAsset.test.tsx`, B's `main.test.tsx` and `urlState.test.ts`, D19's `GuideDialog.test.tsx`) would hit `ENOENT`.
- Before **every** commit that touches `web/` (CLAUDE.md "提交前"): `npm --prefix web run test` (clean-coverage → `tsc -p tsconfig.test.json` → vitest with per-file 90/85/90/90 → `assert-no-skips` → `assert-coverage-scope`) and `npm --prefix web run typecheck`, both exit 0. Each task's commit step lists them. D22 adds `build`, `test:fullstack` and the docs/Python checks.
- Commits: conventional style; every message ends with a blank line then `Claude-Session: https://claude.ai/code/session_01E44DEzsc7Av26fc7nZ5rSo`. Work on branch `feat/pages-textbook-lab` (or the D worktree branch the orchestrator created); never commit on `master`.

## Review Focus

1. **Truthfulness fixes are regression-tested and fail first** (D2 streamline material + byte-checked speed ramp, D3 no Vignette / Bloom 0 / composer only when Bloom > 0, D20 removal of the "色彩表示 arg ψ" caption).
2. **Semantic pins survive the restructure**: every `ControlPanel.test.tsx` assertion that moves or changes is listed with its replacement (D9, D10, D11); refused representation rows stay focusable buttons whose `title` is the matrix reason verbatim; playback keeps `aria-disabled` + `role=note` `[data-playback-notice]`.
3. **Camera z-up** (D5): directions are tested by what three's own `lookAt` does to each real p/d lobe axis, not by tuple equality alone; the slice plane frames are untouched.
4. **Render loop**: the gizmo's `Hud` priority is 2 when the Bloom composer (priority 1) renders the scene and 1 otherwise (D7) — any other combination either double-renders or renders nothing.
5. **E2E selectors** (D21): `hideChrome`/`revealChrome` are top-level awaited statements, so `scripts/assert-visual-run.mjs`'s AST audit of screenshot calls is unchanged; the guide dialog is suppressed by an init script, not by clicking.
6. **Catalogue requests happen once per page** (D9): the visual harness compares `ledger.served` as a list, so a second catalogue fetch from the search pill would fail every visual test.
7. **A11's 2s-2pz default-view fix is not reverted by the rewrite**: `default_representation` is forwarded by the shared loader (D9), the mixture rows (D11) and the search pill (D18), and A11's two `ControlPanel.test.tsx` regression tests stay green under their new selectors (tables in D9 and D11), with a loader-level pin in `catalogs.test.ts` and a search-level pin in `SearchPill.test.tsx`.

## Copy deck (Chinese UI strings — the only source for new copy)

| Where | Key | Text |
|---|---|---|
| Header | brand | `QuViz` |
| Header | runtime pill (static / live) | `教学预览` / `实时计算` |
| Header | textbook link (static) | accessible name `教材`, title `打开教材`, href `./learn/` |
| Header | OpenAPI link (live) | accessible name `查看 OpenAPI`, visible `OpenAPI`, href `/docs` |
| Header | copy link | `复制链接`; toasts `链接已复制` / `无法写入剪贴板，请手动复制地址栏` |
| Header | save image | `保存图像`; toasts `图像已保存` / `画布尚未就绪，无法保存` |
| Header | guide / repo | `指南` / `GitHub 仓库` |
| Status chip | 5 cases (unchanged) | `场景错误 · {msg}` · `{表示法}暂不可用 · {reason}` · `正在计算` · `正在显示 t=… a.u. · 正在计算 t=… a.u.` (`正在显示上一帧` / `正在计算下一帧`) · `科学资产已就绪` |
| Controls | title / collapse / fab | `控制` / `收起控制面板` / `调节` |
| Controls | nav (aria `控制上下文`) and group titles | `量子态` · `表示法` · `显示` |
| Controls | reset | `恢复 2p_z 默认值` |
| 量子态 | sub-heads | `态类型` · `轨道预设` · `叠加预设` |
| 量子态 | kinds (+notes) | `本征态` (`能量本征态：|ψ|² 不随时间变化`) · `叠加态` (`解析含时本征态叠加`) |
| 量子态 | expander / labels | `更多轨道` · `n` `ℓ` `m` `Z` · static Z title `静态教材版固定 Z = 1` |
| 量子态 | basis | `实基（化学轨道）` · `复基（Lz 本征态）`; tags `实基` / `复基` / `简并` |
| 量子态 | empty states | `正在载入轨道目录…` · `轨道目录不可用；仍可在“更多轨道”中直接选择量子数。` · `正在载入叠加态目录…` · `叠加态目录不可用。` |
| 量子态 | readout | `基` · `Z` · `a<sub>μ</sub>` |
| 表示法 | sub-heads | `表示方式` · `参数` |
| 表示法 | tags | `不支持` · `未实现` · `未预计算` · `需数值验证` |
| 表示法 | parameter labels | `样本数` · `随机种子` · `网格` · `包围概率` · `流线种子` · choices `平面` / `场` |
| 表示法 | pinned value title | `静态教材版固定此参数` |
| 表示法 | flow example | `载入并显示概率流示例 · {label} · {basis}` |
| 显示 | knobs | `点尺寸` · `透明度` · `Bloom 光晕` · `自动旋转` · `地面网格（xy 平面）` |
| 显示 | bloom note | `Bloom 只是展示效果：大于 0 时屏幕颜色不再与图例色带逐字一致。` |
| Search | pill / placeholder / close / empty | `查找量子态` · `例如 2p、3d、叠加` · `关闭查找` · `没有匹配的量子态。` ; tags `预设` `本征` `叠加` `实基` `复基` |
| Detail | aria / opener / close | `科学详情` · `打开科学详情` (visible `科学详情`) · `关闭科学详情` |
| Detail | tabs | `概览` · `图表` · `场景契约` · `引用` |
| Detail | subtitle when empty | `等待已验证的元数据` |
| Charts | titles | `径向分布 P(r)` · `能级 Eₙ` · `叠加系数 |c_k|²` · `数据表` |
| Charts | empty/loading | `正在载入径向分布…` · `径向分布载入失败：{msg}` · `服务端未提供径向分布。` · `径向分布数据不完整，无法绘制。` · `能级数据缺失。` · `叠加态没有报告任何项。` · `载入一个量子态后，这里会显示径向分布、能级与叠加系数。` |
| Time pill | aria / stationary | `时间演化` · `定态 · |ψ|² 与 t 无关` · `本征态的时间因子只是整体相位 e^(−iEt/ħ)，概率密度不变，因此没有可播放的演化。` |
| Time pill | superposition | `能量简并：密度不随时间变化` · `周期未知` · reasons `该叠加态的能量简并，概率密度严格不随时间变化。` / `等待叠加态目录提供物理周期。` · `周期 T = … a.u. · 帧 i/N` |
| Time pill | controls | `上一帧` · `下一帧` · play name `随 t 演化` · `时间 t（原子单位）` · `一个周期内的帧` · progress `正在计算帧` |
| Legend | toggle | `展开图例说明` / `收起图例说明`; waiting `等待资产元数据。` |
| Legend | speed axis | `色带横轴为 √(|j|/ρ ÷ max)：中点对应 max 的 1/4；颜色在两端色之间按线性光插值。` |
| Legend | bloom warning | `Bloom 已开启：屏幕颜色含光晕，不再与色带逐字一致。` |
| Guide | title / close / tabs | `关于 QuViz 实验室` · `关闭指南` · `概览` `读图指南` `教材章节` |
| Errors | app / scene / buttons | `实验室遇到错误` · `三维场景无法显示` · `重试` · `重新载入页面` |
| Errors | WebGL | `此设备无法创建 WebGL 画布` · `三维实验室需要 WebGL。请在浏览器设置中开启硬件加速，或换用最新版 Chrome、Edge、Firefox 或 Safari。` · `改为阅读教材` |
| Embed | link | `在实验室中打开` |
| Loading | overlay (unchanged) | `正在构建量子场` · `采样 · 网格构建 · GPU 上传` |

## Module map (after Part D)

| Module | Role | Created in |
|---|---|---|
| `web/public/fonts/*` | self-hosted Google Sans Flex (OFL) + `google-sans-flex.css` | D1 |
| `web/src/lab.css` | tokens, base, every component's layout | D1 (+ blocks in later tasks) |
| `src/scene/speedColor.ts` | streamline ramp, legend stops | D2 |
| `src/components/sceneCapture.ts` | scene canvas id + PNG capture | D6 |
| `src/components/AxisGizmo.tsx` | in-canvas neutral axis triad | D7 |
| `src/components/format.ts` | `formatFinite` family (extracted) | D8 |
| `src/state/catalogs.ts` | one catalogue load per page | D9 |
| `src/components/usePlayback.ts`, `TimePill.tsx` | clock model, 420 ms tick, static prefetch, pill | D10 |
| `src/components/controls/{rows,ControlGroup,StateSection,RepresentationSection,DisplaySection}.tsx`, `src/components/stateIndex.ts` | control panel sections | D11 (+ search in D18) |
| `src/components/StatusChip.tsx`, `ErrorBoundary.tsx`, `WebGLGate.tsx` | robustness + status | D12 |
| `src/components/charts/{axes.ts,RadialDistributionChart,EnergyLadderChart,SuperpositionTermsChart,ChartsPanel}.tsx`, `src/components/useOrbitalMetadata.ts` | detail charts | D14–D15 |
| `src/components/SearchPill.tsx` | combobox search | D18 |
| `src/components/GuideDialog.tsx` | modal guide | D19 |
| `src/components/useMediaQuery.ts`, `EmbedBar.tsx` | shell helpers | D20 |

---

### Task D1: Design tokens, self-hosted font, base stylesheet

**Files:**
- Create: `web/public/fonts/google-sans-flex-latin-wght-normal.woff2`, `web/public/fonts/google-sans-flex-math-wght-normal.woff2`, `web/public/fonts/OFL.txt` (downloaded, byte-pinned), `web/public/fonts/google-sans-flex.css`
- Create: `web/src/lab.css`
- Create (test only): `web/src/styleContract.test.ts`
- Modify: `web/src/main.tsx:5-6` (CSS imports), `web/index.html:6-9` (theme colour, font stylesheet), `web/public/favicon.svg` (whole file)

**Interfaces:**
- Consumes: nothing from A/B.
- Produces: CSS custom properties `--qv-*` (spec §4.4 table verbatim) plus layout tokens `--qv-card`, `--qv-header-h`, `--qv-edge`, `--qv-panel-w`, `--qv-detail-w`, `--qv-bottom-band`, `--qv-drawer-h`; utility classes `.qv-glass`, `.qv-glass-strong`, `.sr-only`, `.qv-app`, `.qv-stage`, `.qv-overlay`, `.qv-fallback`; font family name `"Google Sans Flex"`; the exported test helper `declaredTokens(css)` inside `styleContract.test.ts` (used by D4's added case in the same file).

- [ ] **Step 1: Reconnaissance of the merged A/B/C state (read-only).** Run and read the output; later tasks depend on it.

```powershell
git log --oneline -25
Select-String -Path web/src/main.tsx,web/src/App.tsx -Pattern 'bindUrlState|isEmbedMode|setStaticCatalog|loadStaticManifest'
Select-String -Path web/src/api/capability.ts -Pattern "not_precomputed|values\?:|export function chargeBound|superpositionTerms\?:"
Select-String -Path web/src/api/schema.gen.ts -Pattern 'RadialProfile|default_representation'
Select-String -Path web/src/api/types.ts -Pattern 'radial_profile|export type RadialProfile|SuperpositionDefaultRepresentation'
Select-String -Path web/src/state/useSceneStore.ts -Pattern 'superpositionDefaultRepresentation|defaultRepresentation: SuperpositionDefaultRepresentation'
Select-String -Path web/src/components/ControlPanel.tsx -Pattern 'default_representation'
Select-String -Path web/src/components/ControlPanel.test.tsx -Pattern "default_representation|opens a mixture on the representation its catalogue entry publishes|records the selected mixture default from the catalogue without moving the picture"
Select-String -Path web/src/components/sceneRequest.ts -Pattern 'DEFAULT_PLAYBACK_PERIOD_AU|export function nextTimeAu'
Get-ChildItem docs/textbook -Name -ErrorAction SilentlyContinue
git log --oneline -- web/src/components/ControlPanel.tsx web/src/components/ControlPanel.test.tsx web/src/state/useSceneStore.ts web/src/App.tsx web/src/App.test.tsx web/src/components/Header.tsx web/index.html web/src/main.tsx | Select-Object -First 12
```

Expected (the merged A/B/C state D builds on):
- `bindUrlState()` is called in `main.tsx` (B11's `bootstrap`) and nowhere in `App.tsx` — D20 adds no second call.
- `capability.ts` contains `'not_precomputed'`, `values?:`, `export function chargeBound` and `superpositionTerms?:` (B8).
- `schema.gen.ts` contains `RadialProfile` and `default_representation: "isosurface" | "slice"` (A8, A10); `types.ts` contains `radial_profile?: RadialProfile | null`, `export type RadialProfile` and `SuperpositionDefaultRepresentation` (A8, A10).
- `useSceneStore.ts` contains `superpositionDefaultRepresentation` and both five-/four-argument action signatures ending in `defaultRepresentation: SuperpositionDefaultRepresentation` (A11).
- `ControlPanel.tsx` shows two `default_representation` hits — `selected.default_representation,` in the catalogue sync and `mixture.default_representation,` in the mixture click (A11 step (i)); `ControlPanel.test.tsx` shows three fixture hits plus the two A11 test titles.
- `sceneRequest.ts` has no `DEFAULT_PLAYBACK_PERIOD_AU` and shows `export function nextTimeAu(time: number, periodAu: number): number` (B6).
- `docs/textbook/` lists Part C's files, including `00-how-to-use.md`, `01-wavefunction.md`, `06-isosurface.md`, `09-superposition-time.md`, `10-experiment.md`, `appendix-a-misconceptions.md`, `appendix-b-notation-units.md` (D19 hard-codes these names).

For every commit the last `git log` prints that did **not** come from Part D, run `git show <sha> -- <file>` for each listed file and write the hunks into the task notes. Known today: Part A's A11 commit (`fix(web): open presets and superposition mode on the server-published default`) touches `ControlPanel.tsx`, `ControlPanel.test.tsx` and `useSceneStore.ts`; Part B's B11 commit touches `main.tsx`; B9 touches `useSceneStore.ts`. D9, D10, D11, D13 and D20 rewrite `ControlPanel.tsx`, `ControlPanel.test.tsx`, `Header.tsx`, `App.tsx` and `App.test.tsx`, and must carry every such hunk over — the A11 forwarding and tests are already built into D9/D11/D18 below; any other hunk found here is carried verbatim. If any expectation above fails, stop and report: a later task's code depends on it.

- [ ] **Step 2: Write the failing style-contract test** `web/src/styleContract.test.ts`:

```ts
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

const read = (relative: string): string =>
  readFileSync(new URL(relative, import.meta.url), 'utf-8')

/**
 * Spec §4.4's token table, transcribed once. lab.css is the only place these
 * values are written; this list is the review copy the design is held to.
 */
const SPEC_TOKENS: Readonly<Record<string, string>> = {
  '--qv-bg': '#0e0f11',
  '--qv-glass': 'rgba(0,0,0,.6)',
  '--qv-glass-strong': 'rgba(16,17,20,.86)',
  '--qv-border': 'rgba(255,255,255,.15)',
  '--qv-border-strong': 'rgba(255,255,255,.3)',
  '--qv-glow': '0 0 12px rgba(100,160,255,.2)',
  '--qv-blur': 'blur(16px)',
  '--qv-radius-panel': '24px',
  '--qv-radius-pill': '100px',
  '--qv-radius-tag': '4px',
  '--qv-text': '#fff',
  '--qv-text-2': 'rgba(255,255,255,.62)',
  '--qv-text-3': 'rgba(255,255,255,.4)',
  '--qv-band': 'rgba(255,255,255,.045)',
  '--qv-accent': '#8ab4f8',
  '--qv-accent-strong': '#1a73e8',
  '--qv-ok': '#81c995',
  '--qv-warn': '#fdd663',
  '--qv-danger': '#f28b82',
  '--qv-font':
    '"Google Sans Flex", system-ui, "PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC", sans-serif',
}

/** The declarations of the FIRST `:root` block (media-query overrides come later). */
function declaredTokens(css: string): Map<string, string> {
  const root = /:root\s*\{([^}]*)\}/.exec(css)
  if (root === null) throw new Error('lab.css has no :root block')
  return new Map(
    [...root[1].matchAll(/(--qv-[a-z0-9-]+)\s*:\s*([^;]+);/g)].map((match) => [
      match[1],
      match[2].trim(),
    ]),
  )
}

describe('lab.css design tokens', () => {
  it('declares every spec token with the spec value', () => {
    const tokens = declaredTokens(read('./lab.css'))
    for (const [name, value] of Object.entries(SPEC_TOKENS)) {
      expect(tokens.get(name), name).toBe(value)
    }
  })

  it('sets tabular numerals on the root, so readouts do not jitter', () => {
    expect(read('./lab.css')).toMatch(/:root\s*\{[^}]*font-variant-numeric:\s*tabular-nums/)
  })

  it('draws one visible focus ring in the accent colour', () => {
    expect(read('./lab.css')).toMatch(
      /:focus-visible\s*\{[^}]*outline:\s*2px solid var\(--qv-accent\)/,
    )
  })

  it('honours prefers-reduced-motion for every transition and animation', () => {
    expect(read('./lab.css')).toMatch(
      /@media \(prefers-reduced-motion: reduce\)\s*\{[^@]*animation-duration:\s*0\.01ms !important/,
    )
  })

  it('never re-shows a descendant of hidden chrome', () => {
    // e2e/slice.spec.ts hides [data-chrome] with inline visibility:hidden;
    // an explicit visibility:visible below it would leak into a screenshot.
    expect(read('./lab.css')).not.toMatch(/visibility:\s*visible/)
  })
})

describe('self-hosted Google Sans Flex', () => {
  const FONT_DIRECTORY = new URL('../public/fonts/', import.meta.url)

  /** @fontsource-variable/google-sans-flex@5.3.1, SHA-256 of the files as published. */
  const PINNED_SHA256: Readonly<Record<string, string>> = {
    'google-sans-flex-latin-wght-normal.woff2':
      '4f2ce47af77a0bb9ec3dbd2e81bab7eb97fbcfcd94e47fa63510bb4271b09113',
    'google-sans-flex-math-wght-normal.woff2':
      'f266d6cc9d343ae3da3de6ee68a772a76a27277ba864a1a07f8bc7ec4bcfd68d',
    'OFL.txt': '7168a081fbcea8dbe975e3a015c4e340761b3b4ddf8de0c8a818543f773a29e0',
  }

  it('ships the pinned OFL font bytes and their licence', () => {
    for (const [name, digest] of Object.entries(PINNED_SHA256)) {
      const bytes = readFileSync(new URL(name, FONT_DIRECTORY))
      expect(createHash('sha256').update(bytes).digest('hex'), name).toBe(digest)
    }
    expect(readFileSync(new URL('OFL.txt', FONT_DIRECTORY), 'utf-8')).toContain(
      'SIL OPEN FONT LICENSE Version 1.1',
    )
  })

  it('references only the two shipped files, relative to its own location', () => {
    const css = readFileSync(new URL('google-sans-flex.css', FONT_DIRECTORY), 'utf-8')
    const files = [...css.matchAll(/url\('\.\/([^']+)'\)/g)].map((match) => match[1])
    expect(new Set(files)).toEqual(
      new Set([
        'google-sans-flex-latin-wght-normal.woff2',
        'google-sans-flex-math-wght-normal.woff2',
      ]),
    )
    for (const file of files) {
      expect(existsSync(new URL(file, FONT_DIRECTORY)), file).toBe(true)
    }
    expect(css).toContain("font-family: 'Google Sans Flex'")
  })

  it('is linked from index.html, imported by main.tsx, and nothing loads from a font CDN', () => {
    const html = read('../index.html')
    expect(html).toContain('<link rel="stylesheet" href="/fonts/google-sans-flex.css" />')
    expect(html).not.toMatch(/fonts\.googleapis|fonts\.gstatic/)
    expect(read('./main.tsx')).toContain("import './lab.css'")
  })
})
```

- [ ] **Step 3: Run it and watch it fail.**

Run: `npm --prefix web run test:watch -- run src/styleContract.test.ts`
Expected: FAIL — `ENOENT … src/lab.css` and `ENOENT … public/fonts/…`.

- [ ] **Step 4: Download the font files** (exact bytes; Part C ships the same three files from the same URLs):

```powershell
$fontDir = 'web/public/fonts'
New-Item -ItemType Directory -Force $fontDir | Out-Null
$base = 'https://cdn.jsdelivr.net/npm/@fontsource-variable/google-sans-flex@5.3.1'
Invoke-WebRequest "$base/files/google-sans-flex-latin-wght-normal.woff2" -OutFile "$fontDir/google-sans-flex-latin-wght-normal.woff2"
Invoke-WebRequest "$base/files/google-sans-flex-math-wght-normal.woff2" -OutFile "$fontDir/google-sans-flex-math-wght-normal.woff2"
Invoke-WebRequest "$base/LICENSE" -OutFile "$fontDir/OFL.txt"
Get-FileHash -Algorithm SHA256 "$fontDir/google-sans-flex-latin-wght-normal.woff2","$fontDir/google-sans-flex-math-wght-normal.woff2","$fontDir/OFL.txt" | Format-Table Hash, Path
```

Expected hashes: latin `4F2CE47AF77A0BB9EC3DBD2E81BAB7EB97FBCFCD94E47FA63510BB4271B09113` (50 832 B), math `F266D6CC9D343AE3DA3DE6EE68A772A76A27277BA864A1A07F8BC7EC4BCFD68D` (38 836 B), OFL `7168A081FBCEA8DBE975E3A015C4E340761B3B4DDF8DE0C8A818543F773A29E0` (4 350 B). Any other hash: stop and report (upstream drift). If Part C already committed the same bytes elsewhere, copying them is equivalent — the hashes are what the test checks. `.gitattributes` already marks `*.woff2` binary; `OFL.txt` is text (`eol=lf`) and its hash was taken on the LF-only upstream file, so do not let an editor re-save it.

- [ ] **Step 5: Write `web/public/fonts/google-sans-flex.css`** (served as-is from `public/`, so its relative URLs never depend on Vite's `base`):

```css
/*
  Google Sans Flex 5.3.1 -- SIL Open Font License 1.1 (see OFL.txt), from
  @fontsource-variable/google-sans-flex. Latin + math subsets only: CJK text
  falls back to the system faces named in --qv-font, and U+2113 (ℓ) is not in
  the upstream math subset, so it falls back as well.
*/
@font-face {
  font-family: 'Google Sans Flex';
  font-style: normal;
  font-display: swap;
  font-weight: 1 1000;
  src: url('./google-sans-flex-latin-wght-normal.woff2') format('woff2-variations');
  unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304,
    U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD;
}

@font-face {
  font-family: 'Google Sans Flex';
  font-style: normal;
  font-display: swap;
  font-weight: 1 1000;
  src: url('./google-sans-flex-math-wght-normal.woff2') format('woff2-variations');
  unicode-range: U+0302-0303, U+0305, U+0307-0308, U+0310, U+0312, U+0315, U+031A, U+0326-0327,
    U+032C, U+032F-0330, U+0332-0333, U+0338, U+033A, U+0346, U+034D, U+0391-03A1, U+03A3-03A9,
    U+03B1-03C9, U+03D1, U+03D5-03D6, U+03F0-03F1, U+03F4-03F5, U+2016-2017, U+2034-2038, U+203C,
    U+2040, U+2043, U+2047, U+2050, U+2057, U+205F, U+2070-2071, U+2074-208E, U+2090-209C,
    U+20D0-20DC, U+20E1, U+20E5-20EF, U+2100-2112, U+2114-2115, U+2117-2121, U+2123-214F, U+2190,
    U+2192, U+2194-21AE, U+21B0-21E5, U+21F1-21F2, U+21F4-2211, U+2213-2214, U+2216-22FF,
    U+2308-230B, U+2310, U+2319, U+231C-2321, U+2336-237A, U+237C, U+2395, U+239B-23B7, U+23D0,
    U+23DC-23E1, U+2474-2475, U+25AF, U+25B3, U+25B7, U+25BD, U+25C1, U+25CA, U+25CC, U+25FB,
    U+266D-266F, U+27C0-27FF, U+2900-2AFF, U+2B0E-2B11, U+2B30-2B4C, U+2BFE, U+3030, U+FF5B,
    U+FF5D, U+1D400-1D7FF, U+1EE00-1EEFF;
}
```

- [ ] **Step 6: Write `web/src/lab.css`** (this task's block; later tasks append their component blocks at the end of the file, each under a `/* ---- <Component> ---- */` banner, each with its own `@media (max-width: 820px)` rules):

```css
/*
  QuViz lab visual system -- layout language inspired by map "lab" tools:
  data first, chrome recedes into glass panels floating over a full-bleed
  canvas. No third-party branding. The --qv-* tokens are spec §4.4 verbatim
  and src/styleContract.test.ts reads them back.

  Data colours are NOT here. The phase wheel, the slice ramps and the speed
  ramp live in styles.css, where color.test.ts, SliceField.test.tsx and
  speedColor.test.ts compare them byte-for-byte against the renderer.

  Never set `visibility: visible` below a [data-chrome] element: the visual
  suite hides chrome with inline visibility:hidden before every capture.
*/
:root {
  color-scheme: dark;
  --qv-bg: #0e0f11;
  --qv-glass: rgba(0,0,0,.6);
  --qv-glass-strong: rgba(16,17,20,.86);
  --qv-border: rgba(255,255,255,.15);
  --qv-border-strong: rgba(255,255,255,.3);
  --qv-glow: 0 0 12px rgba(100,160,255,.2);
  --qv-blur: blur(16px);
  --qv-radius-panel: 24px;
  --qv-radius-pill: 100px;
  --qv-radius-tag: 4px;
  --qv-text: #fff;
  --qv-text-2: rgba(255,255,255,.62);
  --qv-text-3: rgba(255,255,255,.4);
  --qv-band: rgba(255,255,255,.045);
  --qv-accent: #8ab4f8;
  --qv-accent-strong: #1a73e8;
  --qv-ok: #81c995;
  --qv-warn: #fdd663;
  --qv-danger: #f28b82;
  --qv-font: "Google Sans Flex", system-ui, "PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC", sans-serif;
  --qv-card: #1b1c1f;
  --qv-header-h: 56px;
  --qv-edge: 16px;
  --qv-panel-w: 320px;
  --qv-detail-w: 360px;
  --qv-bottom-band: 128px;
  --qv-drawer-h: 56dvh;
  font-family: var(--qv-font);
  font-variant-numeric: tabular-nums;
  font-synthesis: none;
  color: var(--qv-text);
  background: var(--qv-bg);
}

*, *::before, *::after { box-sizing: border-box; }
html, body, #root { width: 100%; height: 100%; margin: 0; }
body {
  overflow: hidden;
  background: var(--qv-bg);
  color: var(--qv-text);
  font-family: var(--qv-font);
  font-size: 14px;
  line-height: 1.45;
  -webkit-font-smoothing: antialiased;
}
button, input, select, output { font: inherit; color: inherit; }
a { color: var(--qv-accent); text-decoration: none; }
a:hover { text-decoration: underline; }
h1, h2, h3, p, dl, dd, figure { margin: 0; }
::selection { color: #0e0f11; background: var(--qv-accent); }
:focus-visible { outline: 2px solid var(--qv-accent); outline-offset: 2px; }

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
  border: 0;
}

.qv-glass {
  border: 1px solid var(--qv-border);
  background: var(--qv-glass);
  box-shadow: var(--qv-glow);
  backdrop-filter: var(--qv-blur);
  -webkit-backdrop-filter: var(--qv-blur);
}
.qv-glass-strong {
  border: 1px solid var(--qv-border);
  background: var(--qv-glass-strong);
  box-shadow: var(--qv-glow);
  backdrop-filter: var(--qv-blur);
  -webkit-backdrop-filter: var(--qv-blur);
}

/* ---- App shell ---- */
.qv-app { position: relative; width: 100%; height: 100%; }
.qv-stage { position: fixed; inset: 0; z-index: 0; background: var(--qv-bg); }
.qv-overlay { position: fixed; inset: 0; z-index: 1; pointer-events: none; }
.qv-overlay [data-chrome] { pointer-events: auto; }

.qv-fallback {
  position: fixed;
  inset: 0;
  z-index: 60;
  display: grid;
  place-content: center;
  justify-items: center;
  gap: 12px;
  padding: 24px;
  text-align: center;
  background: var(--qv-bg);
}
.qv-stage .qv-fallback { position: absolute; z-index: 0; }
.qv-fallback h1 { font-size: 22px; font-weight: 500; }
.qv-fallback p { max-width: 520px; color: var(--qv-text-2); }
.qv-fallback-actions { display: flex; flex-wrap: wrap; justify-content: center; gap: 8px; }
.qv-fallback-actions button {
  height: 40px;
  padding: 0 18px;
  border: 1px solid var(--qv-border-strong);
  border-radius: var(--qv-radius-pill);
  background: transparent;
  cursor: pointer;
}
.qv-fallback-actions button:first-child { border-color: transparent; background: var(--qv-accent-strong); }

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    scroll-behavior: auto !important;
    transition-duration: 0.01ms !important;
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
  }
}
```

- [ ] **Step 7: Wire the stylesheet and the font.**

`web/src/main.tsx` — the two CSS imports (currently lines 5–6) become three; `lab.css` loads last so its base rules win until D20 deletes `quantum-observatory.css`. Keep every other line (Part B's static bootstrap) as it is.

```ts
import './styles.css'
import './quantum-observatory.css'
import './lab.css'
```

`web/index.html` — replace the `theme-color` and `description` lines and add the font stylesheet right after the icon link (keep Part B's edits to the other lines):

```html
    <meta name="theme-color" content="#0e0f11" />
    <meta name="description" content="QuViz 氢样量子态科学可视化实验室" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <link rel="stylesheet" href="/fonts/google-sans-flex.css" />
```

`web/public/favicon.svg` — whole file (the old `#61dafb→#8b5cf6` gradient matches nothing in the new palette):

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">
  <rect width="128" height="128" rx="64" fill="#0e0f11"/>
  <ellipse cx="64" cy="64" rx="44" ry="18" fill="none" stroke="#8ab4f8" stroke-width="7" transform="rotate(30 64 64)"/>
  <ellipse cx="64" cy="64" rx="44" ry="18" fill="none" stroke="#8ab4f8" stroke-width="7" stroke-opacity=".55" transform="rotate(-30 64 64)"/>
  <circle cx="64" cy="64" r="9" fill="#ffffff"/>
</svg>
```

- [ ] **Step 8: Run and see it pass.**

Run: `npm --prefix web run test:watch -- run src/styleContract.test.ts src/scene/color.test.ts src/scene/SliceField.test.tsx`
Expected: PASS (`styles.css` is untouched in this task, so both ramp tests stay green).
Run: `npm --prefix web run build` then `Select-String -Path web/dist/index.html -Pattern 'google-sans-flex.css'` and `Test-Path web/dist/fonts/google-sans-flex-latin-wght-normal.woff2`
Expected: build exit 0; the link is present (with Part B's `base: './'` it reads `./fonts/google-sans-flex.css`); `True`.

- [ ] **Step 9: Pre-commit gate, then commit.** Both gate commands must exit 0 — `test` runs all five stages (clean-coverage, `tsc -p tsconfig.test.json`, vitest with per-file 90/85/90/90, `assert-no-skips`, `assert-coverage-scope`); a failure is fixed inside this task before committing.

```powershell
npm --prefix web run test
npm --prefix web run typecheck
git add web/public/fonts/google-sans-flex-latin-wght-normal.woff2 web/public/fonts/google-sans-flex-math-wght-normal.woff2 web/public/fonts/OFL.txt web/public/fonts/google-sans-flex.css web/public/favicon.svg web/src/lab.css web/src/styleContract.test.ts web/src/main.tsx web/index.html
git commit -m "feat(web): add --qv design tokens and self-hosted Google Sans Flex" -m "Claude-Session: https://claude.ai/code/session_01E44DEzsc7Av26fc7nZ5rSo"
```

(`git commit -m A -m B` writes A, a blank line, then B — the required trailer form. Every later commit step uses the same form.)

### Task D2: Streamline colour truth — no tone mapping, no fog, byte-checked speed ramp

**Files:**
- Create: `web/src/scene/speedColor.ts`, `web/src/scene/speedColor.test.ts`
- Modify: `web/src/scene/CurrentStreamlines.tsx:1-4,33-51,67-71`, `web/src/scene/CurrentStreamlines.test.tsx` (new case after line 335), `web/src/styles.css:283-287`, `web/src/components/Legend.tsx:184-187`, `web/src/components/Legend.test.tsx:80`, `web/src/components/ControlPanel.tsx:909-911`, `web/src/components/ControlPanel.test.tsx:1143,1187-1188`, `web/coverage-scope.json`

**Interfaces:**
- Produces (`src/scene/speedColor.ts`):
  ```ts
  export const SPEED_SLOW_HEX = '#2b6cff'
  export const SPEED_FAST_HEX = '#ff4d6d'
  export const SPEED_LEGEND_STOPS: readonly number[]            // [0, .125, …, 1]
  export function speedRampCoordinate(speed: number | undefined, maxSpeed: number): number // √(clamp(speed/max,0,1))
  export function speedRampLinearRgb(t: number): [number, number, number]                  // three linear working space
  export function speedRampHex(t: number): string                                           // on-screen sRGB '#rrggbb'
  ```

- [ ] **Step 1: Write the failing tests.** `web/src/scene/speedColor.test.ts`:

```ts
import { readFileSync } from 'node:fs'

import { Color, SRGBColorSpace } from 'three'
import { describe, expect, it } from 'vitest'

import {
  SPEED_FAST_HEX,
  SPEED_LEGEND_STOPS,
  SPEED_SLOW_HEX,
  speedRampCoordinate,
  speedRampHex,
  speedRampLinearRgb,
} from './speedColor'

/** The `.speed-ramp` stops the app ships, as (hex, position) pairs. */
function speedRampStops(): { hex: string; position: number }[] {
  const css = readFileSync(new URL('../styles.css', import.meta.url), 'utf-8')
  const rule = /\.speed-ramp\s*\{[^}]*?linear-gradient\(([^)]*)\)/.exec(css)
  if (rule === null) throw new Error('styles.css has no .speed-ramp gradient')
  return [...rule[1].matchAll(/(#[0-9a-f]{6})\s+(\d+(?:\.\d+)?)%/gi)].map((match) => ({
    hex: match[1].toLowerCase(),
    position: Number(match[2]) / 100,
  }))
}

const bytesOf = (hex: string): number[] =>
  [1, 3, 5].map((offset) => parseInt(hex.slice(offset, offset + 2), 16))

/** What the canvas shows for ramp coordinate t, as unrounded sRGB 0..255. */
function renderedSrgb(t: number): number[] {
  const target = { r: 0, g: 0, b: 0 }
  new Color().setRGB(...speedRampLinearRgb(t)).getRGB(target, SRGBColorSpace)
  return [target.r * 255, target.g * 255, target.b * 255]
}

describe('speedRampCoordinate', () => {
  it('puts a quarter of the maximum speed at the middle of the ramp', () => {
    expect(speedRampCoordinate(1, 4)).toBe(0.5)
    expect(speedRampCoordinate(4, 4)).toBe(1)
  })

  it('clamps out-of-range and missing speeds instead of inventing colours', () => {
    expect(speedRampCoordinate(5, 4)).toBe(1)
    expect(speedRampCoordinate(-1, 4)).toBe(0)
    expect(speedRampCoordinate(undefined, 4)).toBe(0)
    expect(speedRampCoordinate(Number.NaN, 4)).toBe(0)
  })

  it('treats a field at rest (max 0) as a unit scale, never dividing by zero', () => {
    expect(speedRampCoordinate(0.25, 0)).toBe(0.5)
    expect(speedRampCoordinate(2, Number.NaN)).toBe(1)
  })
})

describe('the speed legend is the renderer', () => {
  it('starts and ends at the two named colours, and clamps t', () => {
    expect(speedRampHex(0)).toBe(SPEED_SLOW_HEX)
    expect(speedRampHex(1)).toBe(SPEED_FAST_HEX)
    expect(speedRampHex(-3)).toBe(SPEED_SLOW_HEX)
    expect(speedRampHex(Number.NaN)).toBe(SPEED_SLOW_HEX)
  })

  it('names the midpoint by the linear-light blend, not by an sRGB average', () => {
    // Measured with three 0.185. The retired legend printed a hand-picked
    // #7a5bd6 at 50%; the renderer draws #be5ec8 there.
    expect(speedRampHex(0.5)).toBe('#be5ec8')
    expect(speedRampHex(0.5)).not.toBe('#7a5bd6')
  })

  it('is the byte-exact source of every shipped .speed-ramp stop', () => {
    const stops = speedRampStops()
    expect(stops.map((stop) => stop.position)).toEqual([...SPEED_LEGEND_STOPS])
    for (const stop of stops) {
      expect(stop.hex, `stop at ${stop.position}`).toBe(speedRampHex(stop.position))
    }
  })

  it('keeps the CSS interpolation between stops within 8/255 of the renderer', () => {
    const stops = speedRampStops()
    let worst = 0
    for (let sample = 0; sample <= 400; sample += 1) {
      const t = sample / 400
      const right = Math.max(1, stops.findIndex((stop) => stop.position >= t))
      const [low, high] = [stops[right - 1], stops[right]]
      const fraction = (t - low.position) / (high.position - low.position)
      const lowBytes = bytesOf(low.hex)
      const highBytes = bytesOf(high.hex)
      const css = lowBytes.map((value, channel) => value + (highBytes[channel] - value) * fraction)
      const truth = renderedSrgb(t)
      worst = Math.max(worst, ...css.map((value, channel) => Math.abs(value - truth[channel])))
    }
    // 7.76 measured for nine evenly spaced stops; the old three stops were 27.7.
    expect(worst).toBeLessThanOrEqual(8)
  })
})
```

`web/src/scene/CurrentStreamlines.test.tsx` — inside `describe('CurrentStreamlines')`, after `'draws nothing at all when the field carries no lines'` (ends at line 335):

```ts
  it('draws speed as data: no tone mapping and no fog on the line material', async () => {
    const { renderer, segments } = await render(eigenstateField())
    const material = segments.material as THREE.LineBasicMaterial

    // The legend is byte-checked against speedRampHex (speedColor.test.ts), the
    // colour an unlit, un-tone-mapped, unfogged line shows. ACES at exposure 0.9
    // or a depth fog would make the key lie about every vertex.
    expect(material.toneMapped).toBe(false)
    expect(material.fog).toBe(false)
    expect(material.vertexColors).toBe(true)

    await renderer.unmount()
  })
```

`web/src/components/Legend.test.tsx` — in `'describes streamline colour as speed, not phase'`, after line 80:

```ts
    // The ramp is laid out in √(|j|/ρ ÷ max), matching the renderer's sqrt map.
    expect(markup).toContain('色带横轴为 √(|j|/ρ ÷ max)')
```

- [ ] **Step 2: Run and see them fail.**

Run: `npm --prefix web run test:watch -- run src/scene/speedColor.test.ts src/scene/CurrentStreamlines.test.tsx src/components/Legend.test.tsx`
Expected: FAIL — `Failed to resolve import "./speedColor"`; `expected true to be false` (toneMapped); Legend markup lacks `色带横轴为`.

- [ ] **Step 3: Implement.** `web/src/scene/speedColor.ts`:

```ts
import { Color } from 'three'

/**
 * The probability-flow speed ramp: one definition for the renderer and the
 * legend.
 *
 * Colour = lerp(SLOW, FAST, t) in three's LINEAR working space with
 * t = √(|j|/ρ ÷ max). The line material is unlit, un-tone-mapped and unfogged,
 * so the canvas shows exactly `speedRampHex(t)`; the legend's CSS stops are
 * those hexes at SPEED_LEGEND_STOPS and speedColor.test.ts reads them back.
 */
export const SPEED_SLOW_HEX = '#2b6cff'
export const SPEED_FAST_HEX = '#ff4d6d'

/**
 * Nine evenly spaced stops along t. CSS interpolates between stops in sRGB,
 * the renderer in linear light; nine stops keep that disagreement under 8/255
 * per channel (measured 7.76), three stops were 27.7/255.
 */
export const SPEED_LEGEND_STOPS: readonly number[] = [
  0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875, 1,
]

const SLOW = new Color(SPEED_SLOW_HEX)
const FAST = new Color(SPEED_FAST_HEX)

const clampUnit = (value: number): number =>
  Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0

/** t = √(clamp(speed / max, 0, 1)); a non-positive or non-finite max is a unit scale. */
export function speedRampCoordinate(speed: number | undefined, maxSpeed: number): number {
  const scale = maxSpeed > 0 ? maxSpeed : 1
  return Math.sqrt(clampUnit((speed ?? 0) / scale))
}

/** The vertex colour at t, in three's linear working space. */
export function speedRampLinearRgb(t: number): [number, number, number] {
  const color = SLOW.clone().lerp(FAST, clampUnit(t))
  return [color.r, color.g, color.b]
}

/** The on-screen sRGB colour at t for an unlit, un-tone-mapped, unfogged line. */
export function speedRampHex(t: number): string {
  return `#${SLOW.clone().lerp(FAST, clampUnit(t)).getHexString()}`
}
```

`web/src/scene/CurrentStreamlines.tsx` — add the import after line 4, replace the colour loop (lines 33–51), and the material (line 69); everything else is unchanged:

```tsx
import { speedRampCoordinate, speedRampLinearRgb } from './speedColor'
```

```tsx
  const geometry = useMemo(() => {
    const positions: number[] = []
    const colors: number[] = []

    data.lines.forEach((line, lineIndex) => {
      const speeds = data.speed[lineIndex]
      for (let index = 0; index + 1 < line.length; index += 1) {
        // LineSegments: every drawn segment needs both endpoints.
        positions.push(...line[index], ...line[index + 1])
        for (const offset of [0, 1]) {
          colors.push(
            ...speedRampLinearRgb(speedRampCoordinate(speeds[index + offset], data.max_speed)),
          )
        }
      }
    })

    const value = new THREE.BufferGeometry()
    value.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3))
    value.setAttribute('color', new THREE.BufferAttribute(new Float32Array(colors), 3))
    value.computeBoundingBox()
    value.computeBoundingSphere()
    return value
  }, [data])
```

```tsx
  return (
    <lineSegments geometry={geometry}>
      {/* Speed is data: the legend beside it is byte-checked against this
          un-tone-mapped, unfogged colour (speedColor.test.ts). */}
      <lineBasicMaterial
        vertexColors
        transparent={opacity < 0.999}
        opacity={opacity}
        toneMapped={false}
        fog={false}
      />
    </lineSegments>
  )
```

`web/src/styles.css` — replace the `.speed-ramp` rule (lines 283–287):

```css
/*
  The streamline speed ramp: speedRampHex(t) from scene/speedColor.ts at the
  nine SPEED_LEGEND_STOPS, t = √(|j|/ρ ÷ max). speedColor.test.ts reads these
  stops back and fails if one drifts from the renderer by a single byte.
*/
.speed-ramp {
  height: 10px;
  border-radius: 999px;
  background: linear-gradient(90deg, #2b6cff 0%, #6b69f3 12.5%, #8d65e6 25%, #a862d7 37.5%, #be5ec8 50%, #d05ab6 62.5%, #e156a3 75%, #f1528b 87.5%, #ff4d6d 100%);
}
```

`web/src/components/Legend.tsx` — the streamline paragraph (lines 184–187) becomes:

```tsx
        <p>色带横轴为 √(|j|/ρ ÷ max)：中点对应 max 的 1/4；颜色在两端色之间按线性光插值。</p>
        <p>
          <strong>j</strong>/ρ 的 streamlines 按弧长等距采样；颜色表示速率，不表示 phase。
          这些是概率流线，不是电子轨迹。
        </p>
```

`web/src/components/ControlPanel.tsx` — delete the fog knob (lines 909–911). With the line material unfogged, `fogStrength` reaches no material, and the panel's rule (comment at lines 895–900) is that a knob exists only where the renderer consumes it.

`web/src/components/ControlPanel.test.tsx`:
- line 1143 `['streamlines', ['opacity', 'fog', 'bloom'], ['透明度', '雾强度', 'Bloom']]` → `['streamlines', ['opacity', 'bloom'], ['透明度', 'Bloom']]`.
- lines 1187–1188 (`await setValue(knob('fog'), 'fog', '40')` / `fogStrength` 0.4) → `expect(knob('fog')).toBeNull()`.

`web/coverage-scope.json` — insert `"src/scene/speedColor.ts"` into both `coverageGated` and `pragmaScanned`, directly after `"src/scene/sliceTexture.ts"`.

- [ ] **Step 4: Run and see them pass.**

Run: `npm --prefix web run test:watch -- run src/scene/speedColor.test.ts src/scene/CurrentStreamlines.test.tsx src/components/Legend.test.tsx src/components/ControlPanel.test.tsx src/guards.test.ts`
Expected: PASS. Then `npm --prefix web run typecheck` → exit 0.

- [ ] **Step 5: Pre-commit gate, then commit.** Both gate commands must exit 0 — `test` runs all five stages (clean-coverage, `tsc -p tsconfig.test.json`, vitest with per-file 90/85/90/90, `assert-no-skips`, `assert-coverage-scope`); a failure is fixed inside this task before committing.

```powershell
npm --prefix web run test
npm --prefix web run typecheck
git add web/src/scene/speedColor.ts web/src/scene/speedColor.test.ts web/src/scene/CurrentStreamlines.tsx web/src/scene/CurrentStreamlines.test.tsx web/src/styles.css web/src/components/Legend.tsx web/src/components/Legend.test.tsx web/src/components/ControlPanel.tsx web/src/components/ControlPanel.test.tsx web/coverage-scope.json
git commit -m "fix(web): draw streamline speed unfogged and un-tone-mapped with a byte-checked legend" -m "Claude-Session: https://claude.ai/code/session_01E44DEzsc7Av26fc7nZ5rSo"
```

### Task D3: Slice post-chain truth — Bloom 0 by default, no Vignette, no composer at Bloom 0

**Files:**
- Modify: `web/src/state/useSceneStore.ts:254`, `web/src/state/useSceneStore.test.ts` (new block after line 11), `web/src/components/OrbitalCanvas.tsx:3,379,445-464,488,513-525`, `web/src/components/OrbitalCanvas.test.tsx` (imports 52–77; lines 859, 1285, 1326–1344, 1361–1408)

**Interfaces:**
- Produces (`src/components/OrbitalCanvas.tsx`): `export function presentationChainActive(asset: SceneAsset | null, bloom: number): boolean` = `bloom > 0 && usesPresentationEffects(asset)`. `usesPresentationEffects` keeps its signature and semantics.

- [ ] **Step 1: Write the failing tests.**

`web/src/state/useSceneStore.test.ts` — after `beforeEach` (line 11):

```ts
describe('presentation defaults', () => {
  it('starts with Bloom off, so data colours reach the screen as the legend prints them', () => {
    // Spec §5: slices went through Bloom 0.12 (and a Vignette) while
    // SliceField.test proved only the texture bytes against the legend.
    expect(INITIAL.bloom).toBe(0)
  })
})
```

`web/src/components/OrbitalCanvas.test.tsx`:
- add `import { Bloom, EffectComposer } from '@react-three/postprocessing'`; add `Children` and `type ReactNode` to the existing `react` import; add `presentationChainActive` to the `./OrbitalCanvas` import list (lines 66–75).
- in `describe('OrbitalCanvas')`, after `assetOf` (line 1285):

```ts
  /** The post chain, found by element type -- robust to other canvas children. */
  const composerOf = (props: Record<string, unknown>): ReactElement | undefined =>
    childrenOf(props).find((child) => child.type === EffectComposer)
```

- in `'hands the canvas the scene and the post chain, with bloom from the store'`, replace lines 1336–1341 with:

```ts
    const composer = composerOf(props)
    expect(composer).toBeDefined()
    expect((composer?.props as { ref?: unknown }).ref).toEqual(expect.any(Function))
    const effects = Children.toArray(
      (composer?.props as { children: ReactNode }).children,
    ) as ReactElement[]
    // Bloom and nothing else: the Vignette darkened data pixels that the
    // legend claims are exact (spec §5).
    expect(effects).toHaveLength(1)
    expect(effects[0].type).toBe(Bloom)
    expect((effects[0].props as { intensity: number }).intensity).toBe(0.42)
```

- add after that case:

```ts
  it('mounts no post chain at all while Bloom is 0, even for a slice', async () => {
    useSceneStore.setState({ mode: 'eigenstate', representation: 'slice', bloom: 0 })
    answerWith(sliceBody('xz', false))
    const { props, unmount } = await mountShell()

    expect(assetOf(props)?.kind).toBe('slice')
    expect(composerOf(props)).toBeUndefined()

    await unmount()
  })

  it.each([
    [0, 'slice', false],
    [0.3, 'slice', true],
    [0.3, 'point_cloud', false],
    [0.3, 'streamlines', true],
  ] as const)('bloom %s over %s -> post chain %s', (bloom, kind, expected) => {
    const asset: SceneAsset =
      kind === 'slice'
        ? { kind: 'slice', data: slice() }
        : kind === 'point_cloud'
          ? { kind: 'point_cloud', data: pointCloud() }
          : { kind: 'streamlines', data: currentField() }
    expect(presentationChainActive(asset, bloom)).toBe(expected)
    expect(presentationChainActive(null, bloom)).toBe(false)
  })
```

- `'keeps the post chain aligned with the arrived frame during a delayed kind switch'`: add `bloom: 0.3,` to the `setState` at lines 1361–1365, and replace the four length checks — line 1380 → `expect(composerOf(firstFrame)).toBeDefined()`; line 1396 → `expect(composerOf(oldFrameCommit as Record<string, unknown>)).toBeDefined()`; line 1398 → `expect(composerOf(canvasProps.current as Record<string, unknown>)).toBeUndefined()`; line 1408 → `expect(composerOf(scientificFrame)).toBeUndefined()`. (Intent unchanged: the composer follows the arrived frame, not the requested one.)
- `'restores and clears the default framebuffer when a post-processed frame leaves'`, line 859 → `useSceneStore.setState({ mode: 'eigenstate', representation: 'slice', bloom: 0.3 })` (a composer only ever exists with Bloom on).

- [ ] **Step 2: Run and see them fail.**

Run: `npm --prefix web run test:watch -- run src/state/useSceneStore.test.ts src/components/OrbitalCanvas.test.tsx`
Expected: FAIL — `expected 0.12 to be 0`; `presentationChainActive is not a function`; `expected [ …2 items ] to have a length of 1` (Vignette still present).

- [ ] **Step 3: Implement.**

`web/src/state/useSceneStore.ts` line 254: `bloom: 0.12,` → `bloom: 0,`.

`web/src/components/OrbitalCanvas.tsx`:
- line 3 → `import { Bloom, EffectComposer } from '@react-three/postprocessing'`.
- after `usesPresentationEffects` (ends line 464):

```tsx
/**
 * Whether the post chain is mounted for the frame on screen.
 *
 * Bloom is the only presentation effect left and it defaults to 0; a Bloom of
 * 0 mounts nothing, so by default slice and streamline pixels come straight
 * from their unlit, un-tone-mapped materials -- the colours the legend's
 * byte-checked stops name. The Vignette is gone for the same reason.
 */
export function presentationChainActive(asset: SceneAsset | null, bloom: number): boolean {
  return bloom > 0 && usesPresentationEffects(asset)
}
```

- `SceneView` line 379 → `const presentationEffectsActive = presentationChainActive(asset, state.bloom)`.
- `OrbitalCanvas` line 488 → `const showPresentationEffects = presentationChainActive(model.asset, model.state.bloom)`.
- the composer block (lines 513–525) keeps only Bloom:

```tsx
      {showPresentationEffects ? (
        /* Bloom reads the rendered buffer back, so it cannot exist without a
           real renderer; it is mounted only while the viewer has turned it up. */
        <EffectComposer ref={composerRef} multisampling={0}>
          <Bloom
            intensity={model.state.bloom}
            luminanceThreshold={0.56}
            luminanceSmoothing={0.46}
            mipmapBlur
          />
        </EffectComposer>
      ) : null}
```

- [ ] **Step 4: Run and see them pass.**

Run: `npm --prefix web run test:watch -- run src/state/useSceneStore.test.ts src/components/OrbitalCanvas.test.tsx src/components/ControlPanel.test.tsx`
Expected: PASS. `npm --prefix web run typecheck` → exit 0.

- [ ] **Step 5: Pre-commit gate, then commit.** Both gate commands must exit 0 — `test` runs all five stages (clean-coverage, `tsc -p tsconfig.test.json`, vitest with per-file 90/85/90/90, `assert-no-skips`, `assert-coverage-scope`); a failure is fixed inside this task before committing.

```powershell
npm --prefix web run test
npm --prefix web run typecheck
git add web/src/state/useSceneStore.ts web/src/state/useSceneStore.test.ts web/src/components/OrbitalCanvas.tsx web/src/components/OrbitalCanvas.test.tsx
git commit -m "fix(web): keep slice colours legend-exact: bloom 0 by default, no vignette" -m "Claude-Session: https://claude.ai/code/session_01E44DEzsc7Av26fc7nZ5rSo"
```

### Task D4: Neutral scene — background, no starfield, no coloured lights, xy ground grid

**Files:**
- Modify: `web/src/scene/fog.ts` (append), `web/src/scene/fog.test.ts` (append), `web/src/scene/Atmosphere.tsx` (whole file), `web/src/scene/Atmosphere.test.tsx:89-178`, `web/src/components/OrbitalCanvas.tsx:21,78-79,287-319`, `web/src/components/OrbitalCanvas.test.tsx:62,814-853,952`, `web/src/scene/sliceColor.ts:72-77,127-128` (comments), `web/src/scene/sliceColor.test.ts` (new block + comment line 112), `web/src/scene/SliceField.tsx:153` (comment), `web/src/styleContract.test.ts` (new case)

**Interfaces:**
- Produces: `export const SCENE_BACKGROUND = '#0e0f11'` in `src/scene/fog.ts` (= `--qv-bg`); `export const GRID_CELL_COLOR = '#2a2c30'` and `export const GRID_SECTION_COLOR = '#3c3f45'` in `src/scene/Atmosphere.tsx`. `RendererSettings` now also owns `scene.background` (set on mount, cleared on unmount).

- [ ] **Step 1: Write the failing tests.**

`web/src/scene/fog.test.ts` — extend its `./fog` import with `SCENE_BACKGROUND` and append:

```ts
describe('SCENE_BACKGROUND', () => {
  it('is the neutral dark the page uses, so fog recedes into the page', () => {
    expect(SCENE_BACKGROUND).toBe('#0e0f11')
  })
})
```

`web/src/styleContract.test.ts` — inside `describe('lab.css design tokens')`:

```ts
  it('paints the page with the scene background, so the canvas has no seam', async () => {
    const { SCENE_BACKGROUND } = await import('./scene/fog')
    expect(declaredTokens(read('./lab.css')).get('--qv-bg')).toBe(SCENE_BACKGROUND)
  })
```

`web/src/scene/sliceColor.test.ts` — add `import { SCENE_BACKGROUND } from './fog'` to the imports, change the comment at line 112 to `// Dark: the scene renders on #0e0f11, and a bright midpoint would make the`, and append:

```ts
describe('slice colours against the scene background', () => {
  const background = [1, 3, 5].map(
    (offset) => parseInt(SCENE_BACKGROUND.slice(offset, offset + 2), 16) / 255,
  ) as [number, number, number]
  const contrast = (colour: readonly [number, number, number]): number => {
    const [high, low] = [relativeLuminance(colour), relativeLuminance(background)].sort(
      (x, y) => y - x,
    )
    return (high + 0.05) / (low + 0.05)
  }

  it('keeps the neutral a surface: visible, but quieter than the poles', () => {
    // 1.635:1 measured on #0e0f11 (1.691 on the retired #050a13).
    expect(contrast(SLICE_NEUTRAL_RGB)).toBeGreaterThan(1.6)
    expect(contrast(SLICE_NEUTRAL_RGB)).toBeLessThan(2)
  })

  it('keeps the density peak readable at a glance', () => {
    // 9.199:1 measured for the tinted top; the saturated knee alone is 3.212:1.
    expect(contrast(sequentialRgb(1))).toBeGreaterThan(9)
    expect(contrast(sequentialRgb(0.5))).toBeGreaterThan(3)
  })
})
```

`web/src/scene/Atmosphere.test.tsx` — replace the whole `describe('Atmosphere', …)` (lines 89–179) with:

```ts
describe('Atmosphere', () => {
  it('lights neutrally and hangs no decoration in the data frame', async () => {
    const renderer = await render(false)

    // Ambient plus one neutral key light. The starfield and the violet/cyan
    // fills are gone: every data material is unlit, so they only ever added
    // saturated colour that was not data (spec §4.4, "画布内").
    expect(typesIn(renderer)).toEqual(['AmbientLight', 'DirectionalLight'])
    const key = renderer.scene.children[1].instance as THREE.DirectionalLight
    expect(key.color.getHexString()).toBe('ffffff')

    await renderer.unmount()
  })

  it('adds the ground grid only when it is asked for', async () => {
    const without = await render(false)
    expect(typesIn(without)).not.toContain('Mesh')
    await without.unmount()

    const including = await render(true)
    expect(typesIn(including)).toContain('Mesh')
    await including.unmount()
  })

  it('lays the grid in the xy plane, below the object along z', async () => {
    const renderer = await render(true, 20)
    const mesh = renderer.scene.children.find((child) => child.instance.type === 'Mesh')
      ?.instance as THREE.Mesh
    const parameters = (mesh.geometry as THREE.PlaneGeometry).parameters

    // z is up (spec D8), so the floor is a z = const plane. drei's Grid draws
    // in its local xz plane; a +90° turn about x lays it in world xy.
    expect(mesh.position.z).toBeCloseTo(-1.05 * 20, 6)
    expect(mesh.position.y).toBe(0)
    expect(mesh.rotation.x).toBeCloseTo(Math.PI / 2, 12)
    expect(parameters.width).toBeCloseTo(2.4 * 20, 6)
    expect(parameters.height).toBeCloseTo(2.4 * 20, 6)

    await renderer.unmount()
  })

  it('keeps the grid off the camera and out of the far distance at the extremes', async () => {
    const tiny = await render(true, 0.5)
    const tinyMesh = tiny.scene.children.find((child) => child.instance.type === 'Mesh')
      ?.instance as THREE.Mesh
    expect(tinyMesh.position.z).toBeCloseTo(-1.05 * 4, 6)
    expect((tinyMesh.geometry as THREE.PlaneGeometry).parameters.width).toBeCloseTo(2.4 * 4, 6)
    await tiny.unmount()

    const huge = await render(true, 400)
    const hugeMesh = huge.scene.children.find((child) => child.instance.type === 'Mesh')
      ?.instance as THREE.Mesh
    expect((hugeMesh.geometry as THREE.PlaneGeometry).parameters.width).toBe(100)
    expect((hugeMesh.geometry as THREE.PlaneGeometry).parameters.height).toBe(100)
    await huge.unmount()
  })

  it('stands in for an unmeasured scene until the first asset arrives', async () => {
    const renderer = await render(true)
    const mesh = renderer.scene.children.find((child) => child.instance.type === 'Mesh')
      ?.instance as THREE.Mesh
    expect(mesh.position.z).toBeCloseTo(-1.05 * 8, 6)
    await renderer.unmount()
  })

  it('leaves no undisposed geometry behind when it is unmounted', async () => {
    const renderer = await render(true, 20)
    const geometries = everyGeometry(renderer)
    // The grid's plane: if this ever reads 0 the audit below is vacuous.
    expect(geometries.length).toBeGreaterThanOrEqual(1)
    const disposals = geometries.map((geometry) => vi.spyOn(geometry, 'dispose'))

    await renderer.unmount()

    disposals.forEach((dispose) => expect(dispose).toHaveBeenCalled())
  })
})
```

`web/src/components/OrbitalCanvas.test.tsx` — line 62 becomes `import { fogRangeFor, SCENE_BACKGROUND } from '../scene/fog'`; in `describe('RendererSettings')` add:

```ts
  it('paints the neutral scene background and fogs towards it', async () => {
    const renderer = await mountSettings(1, 0.4, 20)
    const scene = sceneOf(renderer)

    expect((scene.background as THREE.Color).getHexString()).toBe(SCENE_BACKGROUND.slice(1))
    expect((scene.fog as THREE.Fog).color.getHexString()).toBe(SCENE_BACKGROUND.slice(1))

    await renderer.unmount()
    expect(scene.background).toBeNull()
  })
```

and in `'scales fog and grid to the extent of the asset that actually arrived'`, line 952 `expect(grid?.position.y)` → `expect(grid?.position.z)`.

- [ ] **Step 2: Run and see them fail.**

Run: `npm --prefix web run test:watch -- run src/scene/fog.test.ts src/scene/Atmosphere.test.tsx src/scene/sliceColor.test.ts src/components/OrbitalCanvas.test.tsx src/styleContract.test.ts`
Expected: FAIL — `SCENE_BACKGROUND` is undefined; Atmosphere still yields `PointLight`/`Points`; grid `position.z` is 0; `scene.background` is null.

- [ ] **Step 3: Implement.**

`web/src/scene/fog.ts` — append:

```ts
/**
 * The scene's own background, and the colour depth fog recedes into.
 *
 * Neutral and identical to the page's --qv-bg (styleContract.test.ts), so the
 * full-bleed canvas has no seam against the page, and the slice neutral
 * #383838 keeps its "readable surface, quieter than the poles" contrast
 * (1.635:1, sliceColor.test.ts).
 */
export const SCENE_BACKGROUND = '#0e0f11'
```

`web/src/scene/Atmosphere.tsx` — whole file:

```tsx
import { Grid } from '@react-three/drei'

interface AtmosphereProps {
  showGrid: boolean
  extent?: number
}

/** Neutral greys: the grid is a depth cue, not a colour anyone should read. */
export const GRID_CELL_COLOR = '#2a2c30'
export const GRID_SECTION_COLOR = '#3c3f45'

/**
 * Lights and the ground grid -- and nothing decorative.
 *
 * Every data material (points, isosurface, slice, streamlines) is unlit, so
 * the lights change no data pixel; they stay neutral for anything lit later.
 * The grid lies in the world xy plane (z is up, spec D8) just below the
 * object, scaled to what is on screen.
 */
export function Atmosphere({ showGrid, extent = 8 }: AtmosphereProps) {
  const gridExtent = Math.max(extent, 4)
  const gridSize = Math.min(2.4 * gridExtent, 100)
  return (
    <>
      <ambientLight intensity={0.6} />
      <directionalLight position={[7, -9, 12]} intensity={1.2} color="#ffffff" />
      {showGrid ? (
        <Grid
          position={[0, 0, -1.05 * gridExtent]}
          rotation={[Math.PI / 2, 0, 0]}
          args={[gridSize, gridSize]}
          cellSize={1}
          cellThickness={0.45}
          cellColor={GRID_CELL_COLOR}
          sectionSize={5}
          sectionThickness={0.7}
          sectionColor={GRID_SECTION_COLOR}
          fadeDistance={24}
          fadeStrength={1.6}
          infiniteGrid
        />
      ) : null}
    </>
  )
}
```

`web/src/components/OrbitalCanvas.tsx`:
- line 21 → `import { fogRangeFor, SCENE_BACKGROUND } from '../scene/fog'`; delete lines 78–79 (`FOG_COLOR`).
- `RendererSettings` (lines 287–319): doc comment → `/** Tone mapping, the scene background and depth fog, scaled to the scene actually on screen. */`; add a background effect before the fog effect, and fog towards the background:

```tsx
  useEffect(() => {
    // Opaque and neutral: a saved PNG and the visual baselines no longer
    // depend on whatever the page paints behind a transparent canvas.
    scene.background = new THREE.Color(SCENE_BACKGROUND)
    return () => {
      scene.background = null
    }
  }, [scene])
```

and `scene.fog = new THREE.Fog(SCENE_BACKGROUND, range.near, range.far)`.

Comment-only edits (no value changes):
- `sliceColor.ts:72-77` → "The scene renders on `#0e0f11` (`SCENE_BACKGROUND`, scene/fog.ts), far darker than the reference palette's dark surface, … 0.35 lands the neutral on `#383838`, within a channel step of the reference palette's documented dark diverging midpoint (`#383835`) and about 1.6:1 against this scene's background (1.635, sliceColor.test.ts): enough for the slice plane to read as a surface, not enough for the baseline of a signed slice to compete with the poles."
- `sliceColor.ts:127-128` → "the fully saturated step alone tops out at 3.2:1 against the background, the tinted one at 9.2:1, so a density peak reads at a glance."
- `SliceField.tsx:153` → "the fog colour of the time (#050a13) to the byte. A colormap is data; blending it" (the measurement is historical and stays).
- The comments at `SliceField.tsx:111` and `SliceField.test.tsx:329-330` quote "about 1.7:1"; change both to "about 1.6:1" and "comes out at 1.64".

- [ ] **Step 4: Run and see them pass.**

Run: `npm --prefix web run test:watch -- run src/scene/fog.test.ts src/scene/Atmosphere.test.tsx src/scene/sliceColor.test.ts src/scene/SliceField.test.tsx src/components/OrbitalCanvas.test.tsx src/styleContract.test.ts`
Expected: PASS. `npm --prefix web run typecheck` → exit 0.

- [ ] **Step 5: Pre-commit gate, then commit.** Both gate commands must exit 0 — `test` runs all five stages (clean-coverage, `tsc -p tsconfig.test.json`, vitest with per-file 90/85/90/90, `assert-no-skips`, `assert-coverage-scope`); a failure is fixed inside this task before committing.

```powershell
npm --prefix web run test
npm --prefix web run typecheck
git add web/src/scene/fog.ts web/src/scene/fog.test.ts web/src/scene/Atmosphere.tsx web/src/scene/Atmosphere.test.tsx web/src/components/OrbitalCanvas.tsx web/src/components/OrbitalCanvas.test.tsx web/src/scene/sliceColor.ts web/src/scene/sliceColor.test.ts web/src/scene/SliceField.tsx web/src/scene/SliceField.test.tsx web/src/styleContract.test.ts
git commit -m "feat(web): neutral scene background, xy ground grid, no starfield or coloured lights" -m "Claude-Session: https://claude.ai/code/session_01E44DEzsc7Av26fc7nZ5rSo"
```

### Task D5: Camera z-up

**Files:**
- Modify: `web/src/scene/camera.ts:17-58` (up axis, view directions), `web/src/scene/camera.test.ts:15-61` (direction specs), `web/src/components/OrbitalCanvas.tsx:13-18,90-97,230,498`, `web/src/components/OrbitalCanvas.test.tsx:794-809,1296`

**Interfaces:**
- Produces (`src/scene/camera.ts`): `export const WORLD_UP: CameraDirection = [0, 0, 1]`; `DEFAULT_CAMERA_DIRECTION` becomes `[1, 1, 0.6]`; `cameraDirectionFor(state)` keeps its signature. `cameraDirectionForPlane` / `cameraUpForPlane` are unchanged (slices keep their frame's own `v` axis as up).

Background: the real basis is `m=+1 → p_x`, `m=−1 → p_y`, `m=0 → p_z` for ℓ=1 and `m=+1 → d_xz`, `m=−1 → d_yz`, `m=±2 → d_x²−y² / d_xy`, `m=0 → d_z²` for ℓ=2 (`src/quviz/physics/hydrogenic.py:261-290`). With z up, a front view from −y shows x across and z up (the xz slice's own frame, `sliceContract.ts:102`), a side view from +x shows y across and z up (the yz frame), and a near-top view shows the xy plane.

- [ ] **Step 1: Write the failing tests.** In `web/src/scene/camera.test.ts`, replace the first `describe('cameraDirectionFor', …)` (lines 15–61) with the block below, and change the import (lines 6–11) to also import `WORLD_UP`. `screenBasis` (line 75) is a hoisted function declaration, so the new specs can call it.

```ts
const X = new Vector3(1, 0, 0)
const Y = new Vector3(0, 1, 0)
const Z = new Vector3(0, 0, 1)

describe('cameraDirectionFor, with z up', () => {
  it('frames an unknown scene from the three-quarter default, z up on screen', () => {
    expect(WORLD_UP).toEqual([0, 0, 1])
    expect(DEFAULT_CAMERA_DIRECTION).toEqual([1, 1, 0.6])
    expect(cameraDirectionFor(undefined)).toEqual([1, 1, 0.6])
    const basis = screenBasis(cameraDirectionFor(undefined), WORLD_UP)
    expect(basis.y.dot(Z)).toBeGreaterThan(0.9)
  })

  it.each([
    ['2p_z', 1, 0, Z, 'vertical'],
    ['2p_x', 1, 1, X, 'horizontal'],
    ['2p_y', 1, -1, Y, 'horizontal'],
    ['3d_z²', 2, 0, Z, 'vertical'],
  ] as const)(
    'lays the %s lobe axis across the screen, not down the line of sight',
    (_name, l, m, axis, orientation) => {
      const basis = screenBasis(cameraDirectionFor({ basis: 'real', l, m }), WORLD_UP)
      const onScreen = orientation === 'vertical' ? basis.y : basis.x
      expect(Math.abs(onScreen.dot(axis))).toBeGreaterThan(0.9)
      // Looking down the axis would overlap the two lobes into one blob.
      expect(Math.abs(basis.z.dot(axis))).toBeLessThan(0.35)
    },
  )

  it.each([
    ['3d_xz', 1, Y],
    ['3d_yz', -1, X],
    ['3d_xy', -2, Z],
    ['3d_x²−y²', 2, Z],
  ] as const)('faces the %s lobe plane nearly head-on', (_name, m, normal) => {
    const basis = screenBasis(cameraDirectionFor({ basis: 'real', l: 2, m }), WORLD_UP)
    expect(Math.abs(basis.z.dot(normal))).toBeGreaterThan(0.9)
  })

  it('keeps +z pointing up on screen for every side view', () => {
    for (const [l, m] of [
      [1, -1], [1, 0], [1, 1], [2, -1], [2, 0], [2, 1],
    ] as const) {
      const basis = screenBasis(cameraDirectionFor({ basis: 'real', l, m }), WORLD_UP)
      expect(basis.y.dot(Z), `l=${l} m=${m}`).toBeGreaterThan(0.9)
    }
  })

  it('keeps the default for every other real l', () => {
    for (const l of [0, 3, 4]) {
      for (let m = -l; m <= l; m += 1) {
        expect(cameraDirectionFor(state('real', l, m)), `l=${l} m=${m}`).toEqual([1, 1, 0.6])
      }
    }
  })

  it('keeps the default for the complex basis, whose lobes are rings about z', () => {
    for (let l = 0; l <= 3; l += 1) {
      for (let m = -l; m <= l; m += 1) {
        expect(cameraDirectionFor(state('complex', l, m)), `l=${l} m=${m}`).toEqual([1, 1, 0.6])
      }
    }
  })

  it('returns a fresh array each call, so a caller cannot mutate the next answer', () => {
    const first = cameraDirectionFor(undefined)
    const second = cameraDirectionFor(undefined)
    expect(first).not.toBe(second)
    expect(first).not.toBe(DEFAULT_CAMERA_DIRECTION)
  })
})
```

`web/src/components/OrbitalCanvas.test.tsx`:
- replace `'restores the default up when the scene stops being a slice'` (lines 794–809) with the version below. With z up, the xz slice's `v` axis IS the world up, so the old xz→default transition could no longer see a stale up; the xy slice (`v = +y`) keeps the test's intent.

```ts
  it('restores the world up (+z) when the scene stops being a slice', () => {
    const camera = new THREE.PerspectiveCamera()
    camera.position.set(0, 0, 20)
    aimCamera(camera, undefined, 'xy')
    expect(camera.up.toArray()).toEqual([0, 1, 0])

    aimCamera(camera, cameraViewOf({ kind: 'point_cloud', data: pointCloud() }))

    // The camera outlives the asset: a slice's up left in place would tilt
    // every orbital drawn afterwards.
    expect(camera.up.toArray()).toEqual([0, 0, 1])
  })
```

- line 1296 → `expect(props.camera).toMatchObject({ position: [11, 11, 6.6], up: [0, 0, 1], fov: 42, near: 0.01, far: 500 })`.

- [ ] **Step 2: Run and see them fail.**

Run: `npm --prefix web run test:watch -- run src/scene/camera.test.ts src/components/OrbitalCanvas.test.tsx`
Expected: FAIL — `WORLD_UP` is undefined; default direction is `[1, 0.45, 1]`; the point-cloud up is `[0, 1, 0]`.

- [ ] **Step 3: Implement.** `web/src/scene/camera.ts` lines 17–58 become:

```ts
export type CameraDirection = readonly [number, number, number]

export interface CameraViewState {
  basis: BasisKind
  l: number
  m: number
}

/**
 * Which way is up: +z, the textbook convention (spec D8). 2p_z's two lobes are
 * stacked vertically on screen, as every chemistry text draws them; a y-up
 * camera laid them on their side.
 */
export const WORLD_UP: CameraDirection = [0, 0, 1]

/**
 * The neutral three-quarter view: azimuth 45° between +x and +y, about 23°
 * above the xy plane. With z up, +x points to the viewer's lower left and +y
 * to the right -- the standard right-handed drawing.
 */
export const DEFAULT_CAMERA_DIRECTION: CameraDirection = [1, 1, 0.6]

/** From the front (−y): screen right ≈ +x, screen up = +z. p_x, p_z, d_z², d_xz. */
const FROM_FRONT: CameraDirection = [0.2, -1, 0.3]
/** From the side (+x): screen right ≈ +y, screen up = +z. p_y, d_yz. */
const FROM_SIDE: CameraDirection = [1, 0.2, 0.3]
/**
 * From above (+z), tilted toward −y so the up vector is never parallel to the
 * line of sight: screen right = +x, screen up ≈ +y. d_xy, d_x²−y².
 */
const FROM_ABOVE: CameraDirection = [0, -0.35, 1]

/**
 * The canonical view direction for a state, as a fresh tuple.
 *
 * Fresh on purpose: the canvas normalises the vector it is handed, in place,
 * so a shared array would be scaled to unit length by the first scene and stay
 * that way for every later one.
 */
export function cameraDirectionFor(state: CameraViewState | undefined): [number, number, number] {
  return [...direction(state)]
}

function direction(state: CameraViewState | undefined): CameraDirection {
  if (state?.basis !== 'real') {
    return DEFAULT_CAMERA_DIRECTION
  }
  if (state.l === 1) {
    // Real basis (hydrogenic.py): m = +1 is p_x, m = −1 is p_y, m = 0 is p_z.
    // The front view shows x across and z up; p_y needs the side view.
    return state.m === -1 ? FROM_SIDE : FROM_FRONT
  }
  if (state.l === 2) {
    // |m| = 2 are d_x²−y² and d_xy, both in the xy plane: look from above.
    if (state.m === 2 || state.m === -2) return FROM_ABOVE
    // m = −1 is d_yz (the yz plane, seen from +x); d_z² and d_xz read from the front.
    return state.m === -1 ? FROM_SIDE : FROM_FRONT
  }
  return DEFAULT_CAMERA_DIRECTION
}
```

Keep the file's top comment block (lines 4–16) but replace its last sentence with "The caller normalises and scales it to its own orbit distance; `WORLD_UP` is the up vector for every non-slice view." `cameraDirectionForPlane`/`cameraUpForPlane` (lines 60–91) are unchanged.

`web/src/components/OrbitalCanvas.tsx`:
- extend the `../scene/camera` import (lines 13–18) with `WORLD_UP`; delete `DEFAULT_CAMERA_UP` (lines 90–97).
- line 230 → `camera.up.set(...(plane === undefined ? WORLD_UP : cameraUpForPlane(plane)))`.
- line 498 → `camera={{ position: [11, 11, 6.6], up: [0, 0, 1], fov: 42, near: 0.01, far: 500 }}` (the opening pose on the default direction, z up before the first asset arrives; three-stdlib's OrbitControls re-reads `camera.up` every update, so orbiting follows z).

- [ ] **Step 4: Run and see them pass.**

Run: `npm --prefix web run test:watch -- run src/scene/camera.test.ts src/components/OrbitalCanvas.test.tsx`
Expected: PASS (`'faces a slice down its own normal'`, `'turns the store into one slice request…'` and `'holds the slice"s pose…'` are unchanged and still green: slices use their frame's `v` axis). `npm --prefix web run typecheck` → exit 0.

- [ ] **Step 5: Pre-commit gate, then commit.** Both gate commands must exit 0 — `test` runs all five stages (clean-coverage, `tsc -p tsconfig.test.json`, vitest with per-file 90/85/90/90, `assert-no-skips`, `assert-coverage-scope`); a failure is fixed inside this task before committing.

```powershell
npm --prefix web run test
npm --prefix web run typecheck
git add web/src/scene/camera.ts web/src/scene/camera.test.ts web/src/components/OrbitalCanvas.tsx web/src/components/OrbitalCanvas.test.tsx
git commit -m "feat(web): turn the 3D camera z-up so 2p_z lobes stack vertically" -m "Claude-Session: https://claude.ai/code/session_01E44DEzsc7Av26fc7nZ5rSo"
```

### Task D6: Save the scene canvas explicitly, never "the first canvas"

**Files:**
- Create: `web/src/components/sceneCapture.ts`, `web/src/components/sceneCapture.test.ts`
- Modify: `web/src/components/OrbitalCanvas.tsx:496-505` (`id` on `<Canvas>`), `web/src/components/OrbitalCanvas.test.tsx:1287-1307`, `web/src/components/Header.tsx:5-12,46`, `web/src/components/Header.test.tsx:54-70`, `web/coverage-scope.json`

**Interfaces:**
- Produces (`src/components/sceneCapture.ts`):
  ```ts
  export const SCENE_CANVAS_ID = 'quviz-scene'
  export function sceneCanvas(root?: ParentNode): HTMLCanvasElement | null
  export function captureFileName(now?: Date): string                 // 'quviz-<ISO with - for :>.png'
  export function captureSceneCanvas(root?: ParentNode, now?: Date): boolean // false = nothing saved
  ```

- [ ] **Step 1: Write the failing tests.** `web/src/components/sceneCapture.test.ts`:

```ts
/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  captureFileName,
  captureSceneCanvas,
  SCENE_CANVAS_ID,
  sceneCanvas,
} from './sceneCapture'

const SCENE_URL = 'data:image/png;base64,U0NFTkU='
const DECOY_URL = 'data:image/png;base64,REVDT1k='
let clicked: HTMLAnchorElement[] = []

function canvasReturning(url: string): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  Object.defineProperty(canvas, 'toDataURL', { value: () => url })
  return canvas
}

beforeEach(() => {
  clicked = []
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    clicked.push(this)
  })
})

afterEach(() => {
  vi.restoreAllMocks()
  document.body.innerHTML = ''
})

describe('sceneCanvas', () => {
  it('finds the canvas inside the scene container, not the first canvas on the page', () => {
    document.body.appendChild(canvasReturning(DECOY_URL))
    const host = document.createElement('div')
    host.id = SCENE_CANVAS_ID
    const scene = canvasReturning(SCENE_URL)
    host.appendChild(scene)
    document.body.appendChild(host)

    expect(sceneCanvas()).toBe(scene)
  })

  it('reports no canvas when the scene has not mounted', () => {
    document.body.appendChild(canvasReturning(DECOY_URL))
    expect(sceneCanvas()).toBeNull()
  })
})

describe('captureSceneCanvas', () => {
  it('saves the scene canvas under a file-system-safe name', () => {
    document.body.appendChild(canvasReturning(DECOY_URL))
    const host = document.createElement('div')
    host.id = SCENE_CANVAS_ID
    host.appendChild(canvasReturning(SCENE_URL))
    document.body.appendChild(host)

    expect(captureSceneCanvas(document, new Date('2026-09-25T01:02:03.004Z'))).toBe(true)
    expect(clicked).toHaveLength(1)
    expect(clicked[0].href).toBe(SCENE_URL)
    expect(clicked[0].download).toBe('quviz-2026-09-25T01-02-03.004Z.png')
  })

  it('saves nothing, and says so, when there is no scene canvas', () => {
    expect(captureSceneCanvas()).toBe(false)
    expect(clicked).toHaveLength(0)
  })

  it('saves nothing when the canvas cannot be read back (tainted or lost)', () => {
    const host = document.createElement('div')
    host.id = SCENE_CANVAS_ID
    const canvas = document.createElement('canvas')
    Object.defineProperty(canvas, 'toDataURL', {
      value: () => {
        throw new DOMException('tainted', 'SecurityError')
      },
    })
    host.appendChild(canvas)
    document.body.appendChild(host)

    expect(captureSceneCanvas()).toBe(false)
    expect(clicked).toHaveLength(0)
  })

  it('never puts a colon in the file name (Windows refuses it)', () => {
    expect(captureFileName(new Date('2026-01-02T03:04:05.000Z'))).not.toContain(':')
    expect(captureFileName()).toMatch(/^quviz-.*\.png$/)
  })
})
```

`web/src/components/Header.test.tsx` — replace `'saves the canvas it can actually read, under a file-system-safe name'` (lines 55–70) with the regression below (it fails on today's `document.querySelector('canvas')`, which picks the decoy):

```ts
  it('saves the scene canvas, not whichever canvas comes first', async () => {
    const decoy = document.createElement('canvas')
    Object.defineProperty(decoy, 'toDataURL', { value: () => 'data:image/png;base64,REVDT1k=' })
    document.body.appendChild(decoy)
    const host = document.createElement('div')
    host.id = 'quviz-scene'
    host.appendChild(document.createElement('canvas'))
    document.body.appendChild(host)
    const tree = await header()
    try {
      captureButton(tree).click()

      expect(clicked).toHaveLength(1)
      expect(clicked[0].href).toBe(DATA_URL)
      expect(clicked[0].download).not.toContain(':')
      expect(clicked[0].download).toMatch(/^quviz-.*\.png$/)
    } finally {
      await tree.unmount()
      host.remove()
    }
  })
```

`web/src/components/OrbitalCanvas.test.tsx` — in `'asks for the renderer the scene needs, and says so explicitly'` add after line 1296 (import `SCENE_CANVAS_ID` from `./sceneCapture`):

```ts
    // The save button finds the scene canvas by this id, never "the first canvas".
    expect(props.id).toBe(SCENE_CANVAS_ID)
```

- [ ] **Step 2: Run and see them fail.**

Run: `npm --prefix web run test:watch -- run src/components/sceneCapture.test.ts src/components/Header.test.tsx src/components/OrbitalCanvas.test.tsx`
Expected: FAIL — module `./sceneCapture` missing; Header saves the decoy URL; `props.id` undefined.

- [ ] **Step 3: Implement.** `web/src/components/sceneCapture.ts`:

```ts
/**
 * The id of the element r3f's `<Canvas>` renders into. The save action looks
 * the scene canvas up by it, so another canvas earlier in the document (a
 * chart library, a probe, an embed) can never be what gets saved.
 */
export const SCENE_CANVAS_ID = 'quviz-scene'

/** The scene's own canvas, or null before the scene has mounted. */
export function sceneCanvas(root: ParentNode = document): HTMLCanvasElement | null {
  const canvas = root.querySelector(`#${SCENE_CANVAS_ID} canvas`)
  return canvas instanceof HTMLCanvasElement ? canvas : null
}

/** An ISO time stamp with ':' replaced -- Windows refuses ':' in file names. */
export function captureFileName(now: Date = new Date()): string {
  return `quviz-${now.toISOString().replaceAll(':', '-')}.png`
}

/**
 * Save the scene canvas as a PNG. Returns false, and saves nothing, when there
 * is no scene canvas yet or the drawing buffer cannot be read back.
 */
export function captureSceneCanvas(root: ParentNode = document, now: Date = new Date()): boolean {
  const canvas = sceneCanvas(root)
  if (canvas === null) return false
  let url: string
  try {
    url = canvas.toDataURL('image/png')
  } catch {
    return false
  }
  const link = document.createElement('a')
  link.download = captureFileName(now)
  link.href = url
  link.click()
  return true
}
```

`web/src/components/OrbitalCanvas.tsx` — import `SCENE_CANVAS_ID` from `./sceneCapture` and add `id={SCENE_CANVAS_ID}` as the first prop of `<Canvas>` (line 497); r3f passes `id` to its container `<div>`, the canvas's parent element's parent (`[data-scene-ready]` stays where it is).

`web/src/components/Header.tsx` — delete `saveScreenshot` (lines 5–12), import `captureSceneCanvas` from `./sceneCapture`, and change the capture button's handler (line 46) to `onClick={() => captureSceneCanvas()}`.

`web/coverage-scope.json` — insert `"src/components/sceneCapture.ts"` into both arrays directly before `"src/components/sceneRequest.ts"`.

- [ ] **Step 4: Run and see them pass.**

Run: `npm --prefix web run test:watch -- run src/components/sceneCapture.test.ts src/components/Header.test.tsx src/components/OrbitalCanvas.test.tsx src/guards.test.ts`
Expected: PASS. `npm --prefix web run typecheck` → exit 0.

- [ ] **Step 5: Pre-commit gate, then commit.** Both gate commands must exit 0 — `test` runs all five stages (clean-coverage, `tsc -p tsconfig.test.json`, vitest with per-file 90/85/90/90, `assert-no-skips`, `assert-coverage-scope`); a failure is fixed inside this task before committing.

```powershell
npm --prefix web run test
npm --prefix web run typecheck
git add web/src/components/sceneCapture.ts web/src/components/sceneCapture.test.ts web/src/components/OrbitalCanvas.tsx web/src/components/OrbitalCanvas.test.tsx web/src/components/Header.tsx web/src/components/Header.test.tsx web/coverage-scope.json
git commit -m "fix(web): save the scene canvas by id instead of the first canvas" -m "Claude-Session: https://claude.ai/code/session_01E44DEzsc7Av26fc7nZ5rSo"
```

### Task D7: Neutral axis gizmo inside the scene canvas

**Choice and justification.** drei `GizmoHelper` + `GizmoViewport`, not custom lines + `Html` labels. `GizmoHelper` renders through drei's `Hud` into the **same** WebGL context (a second render pass, no second `<canvas>`), and `GizmoViewport` draws its labels as sprite textures inside that pass, so the triad needs no DOM elements. Custom lines would have to be camera-attached objects fighting `Bounds`' near-plane `clip` (near = distance/100 can exceed a fixed HUD depth), and drei `Html` labels are per-frame DOM nodes that would need their own `data-chrome` plumbing. The one cost of `Hud` is the render loop: any `useFrame` with priority > 0 turns off r3f's automatic render. `EffectComposer` renders at priority 1 when Bloom is on; so the gizmo runs at priority 2 (draw the HUD over the composer's output, do not render the scene) while the composer is mounted, and at priority 1 (render the scene, then the HUD) otherwise — `gizmoRenderPriority` below. Interaction is disabled: a click-to-tween would rewrite `camera.up` and fight the slice views' frame-aligned up. The triad is part of the canvas pixels, so it appears in the regenerated visual baselines (Part E), always at the same corner.

**Files:**
- Create: `web/src/components/AxisGizmo.tsx`, `web/src/components/AxisGizmo.test.ts`
- Modify: `web/src/components/OrbitalCanvas.tsx:512` (mount the gizmo), `web/src/components/OrbitalCanvas.test.tsx` (new case in `describe('OrbitalCanvas')`), `web/coverage-scope.json`

**Interfaces:**
- Produces (`src/components/AxisGizmo.tsx`):
  ```ts
  export const GIZMO_AXIS_COLOR = '#9aa0a6'
  export const GIZMO_LABEL_COLOR = '#0e0f11'
  export const GIZMO_FONT = '600 22px sans-serif'
  export function gizmoRenderPriority(presentationChain: boolean): 1 | 2
  export interface GizmoLayout { margin: [number, number]; scale: number }
  export function gizmoLayout(canvasWidth: number): GizmoLayout
  export function AxisGizmo(props: { presentationChain: boolean }): JSX.Element
  ```

- [ ] **Step 1: Write the failing tests.** `web/src/components/AxisGizmo.test.ts`:

```ts
import ReactThreeTestRenderer from '@react-three/test-renderer'
import { createElement } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * drei's gizmo renders through a Hud portal with its own render pass, which
 * the test renderer's mock GL cannot run. What this file checks is the
 * CONFIGURATION handed to it: neutral, non-interactive, at the priority that
 * cooperates with the post chain, sized to the canvas.
 */
const recorded = vi.hoisted(() => ({
  helper: null as Record<string, unknown> | null,
  viewport: null as Record<string, unknown> | null,
}))

vi.mock('@react-three/drei', async () => {
  const { createElement: element, Fragment } = await import('react')
  return {
    GizmoHelper: (props: Record<string, unknown>) => {
      recorded.helper = props
      return element(Fragment, null, props.children as never)
    },
    GizmoViewport: (props: Record<string, unknown>) => {
      recorded.viewport = props
      return null
    },
  }
})

import {
  AxisGizmo,
  GIZMO_AXIS_COLOR,
  GIZMO_FONT,
  GIZMO_LABEL_COLOR,
  gizmoLayout,
  gizmoRenderPriority,
} from './AxisGizmo'

let restoreActEnvironment: () => void = () => undefined

beforeEach(() => {
  const scope = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  const had = 'IS_REACT_ACT_ENVIRONMENT' in scope
  const previous = scope.IS_REACT_ACT_ENVIRONMENT
  scope.IS_REACT_ACT_ENVIRONMENT = true
  restoreActEnvironment = () => {
    if (had) scope.IS_REACT_ACT_ENVIRONMENT = previous
    else delete scope.IS_REACT_ACT_ENVIRONMENT
  }
  recorded.helper = null
  recorded.viewport = null
})

afterEach(() => restoreActEnvironment())

describe('gizmoRenderPriority', () => {
  it('draws over the composer while Bloom is on, and renders the scene itself otherwise', () => {
    expect(gizmoRenderPriority(true)).toBe(2)
    expect(gizmoRenderPriority(false)).toBe(1)
  })
})

describe('gizmoLayout', () => {
  it('sits in the free bottom-left band on a desktop canvas', () => {
    expect(gizmoLayout(1280)).toEqual({ margin: [76, 76], scale: 34 })
    expect(gizmoLayout(821)).toEqual({ margin: [76, 76], scale: 34 })
  })

  it('shrinks and lifts above the phone controls at 820 px and below', () => {
    expect(gizmoLayout(820)).toEqual({ margin: [44, 136], scale: 26 })
    expect(gizmoLayout(400)).toEqual({ margin: [44, 136], scale: 26 })
  })
})

describe('AxisGizmo', () => {
  it('draws a neutral, non-interactive x/y/z triad in the bottom-left corner', async () => {
    const renderer = await ReactThreeTestRenderer.create(
      createElement(AxisGizmo, { presentationChain: false }),
      { width: 1280, height: 800 },
    )

    expect(recorded.helper).toMatchObject({
      alignment: 'bottom-left',
      margin: [76, 76],
      renderPriority: 1,
    })
    expect(recorded.viewport).toMatchObject({
      disabled: true,
      hideNegativeAxes: true,
      axisColors: [GIZMO_AXIS_COLOR, GIZMO_AXIS_COLOR, GIZMO_AXIS_COLOR],
      labelColor: GIZMO_LABEL_COLOR,
      labels: ['x', 'y', 'z'],
      font: GIZMO_FONT,
      scale: 34,
    })

    await renderer.unmount()
  })

  it('hands the Hud priority 2 while the post chain renders the scene', async () => {
    const renderer = await ReactThreeTestRenderer.create(
      createElement(AxisGizmo, { presentationChain: true }),
    )
    expect(recorded.helper?.renderPriority).toBe(2)
    await renderer.unmount()
  })

  it('uses the phone layout on a narrow canvas', async () => {
    const renderer = await ReactThreeTestRenderer.create(
      createElement(AxisGizmo, { presentationChain: false }),
      { width: 400, height: 860 },
    )
    expect(recorded.helper?.margin).toEqual([44, 136])
    expect(recorded.viewport?.scale).toBe(26)
    await renderer.unmount()
  })
})
```

`web/src/components/OrbitalCanvas.test.tsx` — import `AxisGizmo` from `./AxisGizmo`; in `describe('OrbitalCanvas')` add:

```ts
  it.each([
    [0.42, true],
    [0, false],
  ] as const)(
    'draws the axis triad inside the one scene canvas (bloom %s -> post chain %s)',
    async (bloom, chain) => {
      useSceneStore.setState({
        mode: 'superposition',
        bloom,
        representation: 'streamlines',
        superpositionStreamlineSeedCountMax: 40,
      })
      answerWith(superpositionCurrent())
      const { props, unmount } = await mountShell()

      const gizmo = childrenOf(props).find((child) => child.type === AxisGizmo)
      expect(gizmo).toBeDefined()
      expect((gizmo?.props as { presentationChain: boolean }).presentationChain).toBe(chain)

      await unmount()
    },
  )
```

- [ ] **Step 2: Run and see them fail.**

Run: `npm --prefix web run test:watch -- run src/components/AxisGizmo.test.ts src/components/OrbitalCanvas.test.tsx`
Expected: FAIL — `./AxisGizmo` does not exist; no gizmo child in the canvas.

- [ ] **Step 3: Implement.** `web/src/components/AxisGizmo.tsx`:

```tsx
import { GizmoHelper, GizmoViewport } from '@react-three/drei'
import { useThree } from '@react-three/fiber'

/** Neutral grey: data colours (the red/cyan phase poles) are the only saturated things. */
export const GIZMO_AXIS_COLOR = '#9aa0a6'
export const GIZMO_LABEL_COLOR = '#0e0f11'
/**
 * A system face on purpose: the label textures are drawn once at mount, and a
 * web font that has not finished loading by then would make the baseline pixels
 * depend on a network race.
 */
export const GIZMO_FONT = '600 22px sans-serif'

/**
 * The Hud's useFrame priority. EffectComposer renders the scene at priority 1
 * while Bloom is on, so the Hud must only draw its overlay after it (2); with
 * no composer the Hud is what renders the scene (1). Any priority > 0 turns off
 * r3f's automatic render, so the other combinations draw twice or not at all.
 */
export function gizmoRenderPriority(presentationChain: boolean): 1 | 2 {
  return presentationChain ? 2 : 1
}

export interface GizmoLayout {
  margin: [number, number]
  scale: number
}

/** Bottom-left, clear of the control panel band on desktop and the phone buttons below 820 px. */
export function gizmoLayout(canvasWidth: number): GizmoLayout {
  return canvasWidth <= 820 ? { margin: [44, 136], scale: 26 } : { margin: [76, 76], scale: 34 }
}

/**
 * The world axes as the camera currently sees them -- z up (spec D8) -- drawn
 * in the scene's own WebGL context. Clicking is disabled: a tween would rewrite
 * camera.up and fight the slice views' frame-aligned up.
 */
export function AxisGizmo({ presentationChain }: { presentationChain: boolean }) {
  const width = useThree((state) => state.size.width)
  const { margin, scale } = gizmoLayout(width)
  return (
    <GizmoHelper
      alignment="bottom-left"
      margin={margin}
      renderPriority={gizmoRenderPriority(presentationChain)}
    >
      <GizmoViewport
        scale={scale}
        disabled
        hideNegativeAxes
        axisColors={[GIZMO_AXIS_COLOR, GIZMO_AXIS_COLOR, GIZMO_AXIS_COLOR]}
        labelColor={GIZMO_LABEL_COLOR}
        labels={['x', 'y', 'z']}
        font={GIZMO_FONT}
      />
    </GizmoHelper>
  )
}
```

`web/src/components/OrbitalCanvas.tsx` — import `AxisGizmo` from `./AxisGizmo` and render it right after `<SceneView {...model} />` (line 512), before the composer:

```tsx
      <SceneView {...model} />
      <AxisGizmo presentationChain={showPresentationEffects} />
```

`web/coverage-scope.json` — insert `"src/components/AxisGizmo.tsx"` into both arrays directly before `"src/components/ControlPanel.tsx"`.

- [ ] **Step 4: Run and see them pass.**

Run: `npm --prefix web run test:watch -- run src/components/AxisGizmo.test.ts src/components/OrbitalCanvas.test.tsx src/guards.test.ts`
Expected: PASS. `npm --prefix web run typecheck` → exit 0. (The render-loop claim is verified visually in D22's screenshots: the scene must be drawn both with Bloom 0 and with Bloom > 0 on a slice.)

- [ ] **Step 5: Pre-commit gate, then commit.** Both gate commands must exit 0 — `test` runs all five stages (clean-coverage, `tsc -p tsconfig.test.json`, vitest with per-file 90/85/90/90, `assert-no-skips`, `assert-coverage-scope`); a failure is fixed inside this task before committing.

```powershell
npm --prefix web run test
npm --prefix web run typecheck
git add web/src/components/AxisGizmo.tsx web/src/components/AxisGizmo.test.ts web/src/components/OrbitalCanvas.tsx web/src/components/OrbitalCanvas.test.tsx web/coverage-scope.json
git commit -m "feat(web): draw a neutral z-up axis gizmo inside the scene canvas" -m "Claude-Session: https://claude.ai/code/session_01E44DEzsc7Av26fc7nZ5rSo"
```

### Task D8: Extract `formatFinite` into a shared module

**Files:**
- Create: `web/src/components/format.ts`, `web/src/components/format.test.ts`
- Modify: `web/src/components/Inspector.tsx:14-71` (moved out), `web/coverage-scope.json`

**Interfaces:**
- Produces (`src/components/format.ts`):
  ```ts
  export const PLACEHOLDER = '—'
  export type NumericStyle = { kind: 'fixed'; digits: number } | { kind: 'exponential'; digits: number } | { kind: 'magnitude'; digits: number } | { kind: 'count' }
  export function formatFinite(value: number | undefined, style: NumericStyle): string
  export function formatFiniteUnit(value: number | undefined, style: NumericStyle, unit: string, separator?: string): string
  ```

- [ ] **Step 1: Write the failing test** `web/src/components/format.test.ts`:

```ts
import { describe, expect, it } from 'vitest'

import { formatFinite, formatFiniteUnit, PLACEHOLDER } from './format'

describe('formatFinite', () => {
  it('shows the absence of a number as an em dash, never NaN or Infinity', () => {
    for (const value of [undefined, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      expect(formatFinite(value, { kind: 'fixed', digits: 2 })).toBe(PLACEHOLDER)
    }
    expect(PLACEHOLDER).toBe('—')
  })

  it('formats each style the panel uses', () => {
    expect(formatFinite(-0.125, { kind: 'fixed', digits: 6 })).toBe('-0.125000')
    expect(formatFinite(0.002, { kind: 'exponential', digits: 3 })).toBe('2.000e-3')
    expect(formatFinite(900, { kind: 'count' })).toBe('900')
  })

  it('switches a magnitude to scientific notation outside [1e-3, 1e3), keeping exact zero', () => {
    expect(formatFinite(0.7071, { kind: 'magnitude', digits: 3 })).toBe('0.707')
    expect(formatFinite(1e-12, { kind: 'magnitude', digits: 3 })).toBe('1.00e-12')
    expect(formatFinite(12345, { kind: 'magnitude', digits: 3 })).toBe('1.23e+4')
    expect(formatFinite(0, { kind: 'magnitude', digits: 3 })).toBe('0.000')
  })
})

describe('formatFiniteUnit', () => {
  it('drops the unit when there is no number to carry it', () => {
    expect(formatFiniteUnit(Number.NaN, { kind: 'fixed', digits: 6 }, 'Ha')).toBe('—')
    expect(formatFiniteUnit(-0.125, { kind: 'fixed', digits: 6 }, 'Ha')).toBe('-0.125000 Ha')
    expect(formatFiniteUnit(98.5, { kind: 'fixed', digits: 1 }, '%', '')).toBe('98.5%')
  })
})
```

- [ ] **Step 2: Run and see it fail.**

Run: `npm --prefix web run test:watch -- run src/components/format.test.ts`
Expected: FAIL — `./format` does not exist.

- [ ] **Step 3: Implement.** Move `Inspector.tsx` lines 14–71 verbatim (the `PLACEHOLDER` constant, the `NumericStyle` type, `formatFinite`, `formatFiniteUnit`, with their doc comments) into `web/src/components/format.ts`, adding `export` to all four declarations. Its opening comment line becomes: `/** The one numeric formatter the lab uses; see formatFinite. The Inspector, the charts and the time pill all route numbers through here. */`. In `Inspector.tsx`, delete lines 14–71 and add `import { formatFinite, formatFiniteUnit } from './format'`.

`web/coverage-scope.json` — insert `"src/components/format.ts"` into both arrays directly before `"src/components/sceneCapture.ts"`.

- [ ] **Step 4: Run and see it pass.**

Run: `npm --prefix web run test:watch -- run src/components/format.test.ts src/components/Inspector.test.tsx src/guards.test.ts`
Expected: PASS (Inspector's markup assertions are unchanged). `npm --prefix web run typecheck` → exit 0.

- [ ] **Step 5: Pre-commit gate, then commit.** Both gate commands must exit 0 — `test` runs all five stages (clean-coverage, `tsc -p tsconfig.test.json`, vitest with per-file 90/85/90/90, `assert-no-skips`, `assert-coverage-scope`); a failure is fixed inside this task before committing.

```powershell
npm --prefix web run test
npm --prefix web run typecheck
git add web/src/components/format.ts web/src/components/format.test.ts web/src/components/Inspector.tsx web/coverage-scope.json
git commit -m "refactor(web): share the non-finite-safe number formatter" -m "Claude-Session: https://claude.ai/code/session_01E44DEzsc7Av26fc7nZ5rSo"
```

### Task D9: One catalogue load per page (`state/catalogs.ts`)

The search pill (D18), the time pill (D10) and the control panel all need the two server catalogues, and the embed page renders no control panel at all but still needs the selected mixture's period and slice floor. The visual harness compares `ledger.served` as an ordered **list** (`web/e2e/fixtures.ts:323,372`; `slice.spec.ts:560-563`), so a second catalogue fetch from any new component would fail every visual test. This task moves the fetch out of `ControlPanel.tsx:320-347` into a shared, de-duplicated loader with the same fail-closed side effects.

**Files:**
- Create: `web/src/state/catalogs.ts`, `web/src/state/catalogs.test.ts`
- Modify: `web/src/components/ControlPanel.tsx:16,25-32,303-347` (at `bbe1a5e`; after A11 the effect also passes `selected.default_representation` — the whole effect moves, that argument included), `web/src/components/ControlPanel.test.tsx:136-141`, `web/coverage-scope.json`

**Interfaces:**
- Consumes: `fetchCatalog(signal?)`, `fetchSuperpositionCatalog(signal?)` (`src/api/client.ts`, unchanged signatures); `SuperpositionPreset.default_representation` (A10); `useSceneStore` actions `syncSuperpositionCapabilities(terms, sliceResolutionFloor, streamlineSeedCountMax, defaultRepresentation)` (A11) and `invalidateSuperpositionStreamlineCapability()`.
- Produces (`src/state/catalogs.ts`):
  ```ts
  export type CatalogStatus = 'idle' | 'loading' | 'ready' | 'error'
  export interface CatalogState { orbitals: readonly OrbitalPreset[]; superpositions: readonly SuperpositionPreset[]; orbitalStatus: CatalogStatus; superpositionStatus: CatalogStatus }
  export const useCatalogStore: UseBoundStore<StoreApi<CatalogState>>
  export function ensureCatalogsLoaded(): void   // idempotent per page
  export function resetCatalogs(): void          // aborts in flight, empties the store (tests)
  export function useCatalogs(): CatalogState    // ensures the load on mount, subscribes
  ```

**`ControlPanel.test.tsx` assertions that move or gain a second pin in this task** (semantics preserved):

| Current (title) | What happens |
|---|---|
| `'invalidates stale seed metadata when the catalogue request or parser rejects'` and `'… omits the selected mixture'` (981–1027 at `bbe1a5e`) | unchanged; now satisfied through `state/catalogs.ts`, and pinned directly by `catalogs.test.ts` `'fails closed …'` cases |
| A11 `'records the selected mixture default from the catalogue without moving the picture'` | unchanged in `ControlPanel.test.tsx` (the panel still loads through `useCatalogs`, and `resetCatalogs()` in `beforeEach` makes each mount fetch the mutated fixture); pinned a second time at the loader in `catalogs.test.ts` `'records the selected mixture's published default without moving the picture (A11)'` |
| A11 `'opens a mixture on the representation its catalogue entry publishes'` | unchanged in this task (`.mixture-list .preset` still exists until D11, whose table re-selects it) |

- [ ] **Step 1: Write the failing test** `web/src/state/catalogs.test.ts`:

```ts
/** @vitest-environment jsdom */
import { createElement } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { OrbitalPreset, SuperpositionPreset } from '../api/types'
import { mount } from '../test/mount'

const client = vi.hoisted(() => ({
  orbitals: vi.fn<(signal?: AbortSignal) => Promise<OrbitalPreset[]>>(),
  superpositions: vi.fn<(signal?: AbortSignal) => Promise<SuperpositionPreset[]>>(),
}))

vi.mock('../api/client', () => ({
  fetchCatalog: client.orbitals,
  fetchSuperpositionCatalog: client.superpositions,
}))

import { ensureCatalogsLoaded, resetCatalogs, useCatalogs, useCatalogStore } from './catalogs'
import { useSceneStore } from './useSceneStore'

const INITIAL_SCENE = useSceneStore.getState()
const BOHR_TERMS = '1,0,0,0.7071067811865476;2,1,0,0.7071067811865476'
const PRESETS: OrbitalPreset[] = [{ id: '2pz', label: '2p_z', n: 2, l: 1, m: 0, basis: 'real', z: 1 }]
const MIXTURE = (
  terms: string,
  default_representation: SuperpositionPreset['default_representation'] = 'isosurface',
): SuperpositionPreset => ({
  id: 'bohr',
  label: '1s + 2p_z',
  terms,
  period_au: 16.755160819145562,
  note: 'Bohr oscillation',
  slice_resolution_floor: 103,
  streamline_seed_count_max: 24,
  default_representation,
})

const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0))

beforeEach(() => {
  resetCatalogs()
  useSceneStore.setState(INITIAL_SCENE, true)
  client.orbitals.mockReset()
  client.superpositions.mockReset()
})

describe('ensureCatalogsLoaded', () => {
  it('fetches each catalogue once, however many callers ask', async () => {
    client.orbitals.mockResolvedValue(PRESETS)
    client.superpositions.mockResolvedValue([MIXTURE(BOHR_TERMS)])

    ensureCatalogsLoaded()
    ensureCatalogsLoaded()
    ensureCatalogsLoaded()
    expect(useCatalogStore.getState().orbitalStatus).toBe('loading')
    await flush()

    expect(client.orbitals).toHaveBeenCalledTimes(1)
    expect(client.superpositions).toHaveBeenCalledTimes(1)
    expect(useCatalogStore.getState()).toMatchObject({
      orbitals: PRESETS,
      orbitalStatus: 'ready',
      superpositionStatus: 'ready',
    })
  })

  it('syncs the selected mixture floor and seed ceiling into the scene store', async () => {
    client.orbitals.mockResolvedValue(PRESETS)
    client.superpositions.mockResolvedValue([MIXTURE(BOHR_TERMS)])

    ensureCatalogsLoaded()
    await flush()

    expect(useSceneStore.getState().superpositionSliceResolutionFloor).toBe(103)
    expect(useSceneStore.getState().superpositionStreamlineSeedCountMax).toBe(24)
  })

  it("records the selected mixture's published default without moving the picture (A11)", async () => {
    // The 2s-2pz fix: the catalogue says which picture a preset opens on. A
    // sync only records it; the representation on screen stays where it is.
    useSceneStore.setState({ mode: 'superposition', representation: 'isosurface' })
    client.orbitals.mockResolvedValue(PRESETS)
    client.superpositions.mockResolvedValue([MIXTURE(BOHR_TERMS, 'slice')])

    ensureCatalogsLoaded()
    await flush()

    expect(useSceneStore.getState().superpositionDefaultRepresentation).toBe('slice')
    expect(useSceneStore.getState().representation).toBe('isosurface')
  })

  it('fails closed when the catalogue omits the selected mixture', async () => {
    useSceneStore.setState({ superpositionStreamlineSeedCountMax: 40 })
    client.orbitals.mockResolvedValue(PRESETS)
    client.superpositions.mockResolvedValue([MIXTURE('9,0,0,1')])

    ensureCatalogsLoaded()
    await flush()

    expect(useSceneStore.getState().superpositionStreamlineSeedCountMax).toBeUndefined()
  })

  it('fails closed, and says error, when the superposition catalogue is unreachable', async () => {
    useSceneStore.setState({ superpositionStreamlineSeedCountMax: 40 })
    client.orbitals.mockResolvedValue(PRESETS)
    client.superpositions.mockRejectedValue(new Error('offline'))

    ensureCatalogsLoaded()
    await flush()

    expect(useCatalogStore.getState()).toMatchObject({
      superpositions: [],
      superpositionStatus: 'error',
    })
    expect(useSceneStore.getState().superpositionStreamlineSeedCountMax).toBeUndefined()
  })

  it('reports an unreachable orbital catalogue as an error, not as an empty success', async () => {
    client.orbitals.mockRejectedValue(new Error('offline'))
    client.superpositions.mockResolvedValue([])

    ensureCatalogsLoaded()
    await flush()

    expect(useCatalogStore.getState()).toMatchObject({ orbitals: [], orbitalStatus: 'error' })
  })

  it('drops answers that arrive after a reset, and aborts their requests', async () => {
    let resolveOrbitals: (value: OrbitalPreset[]) => void = () => undefined
    let rejectMixtures: (error: Error) => void = () => undefined
    client.orbitals.mockImplementation(
      () => new Promise((resolve) => {
        resolveOrbitals = resolve
      }),
    )
    client.superpositions.mockImplementation(
      () => new Promise((_resolve, reject) => {
        rejectMixtures = reject
      }),
    )
    ensureCatalogsLoaded()
    const signal = client.orbitals.mock.calls[0][0]

    resetCatalogs()
    resolveOrbitals(PRESETS)
    rejectMixtures(new Error('aborted'))
    await flush()

    expect(signal?.aborted).toBe(true)
    expect(useCatalogStore.getState()).toMatchObject({ orbitals: [], orbitalStatus: 'idle' })
    // A fresh load is allowed after a reset.
    client.orbitals.mockResolvedValue(PRESETS)
    client.superpositions.mockResolvedValue([])
    ensureCatalogsLoaded()
    await flush()
    expect(useCatalogStore.getState().orbitalStatus).toBe('ready')
  })
})

describe('useCatalogs', () => {
  it('starts the load on mount and re-renders when the catalogues arrive', async () => {
    client.orbitals.mockResolvedValue(PRESETS)
    client.superpositions.mockResolvedValue([MIXTURE(BOHR_TERMS)])
    function Probe() {
      const { orbitals, superpositions } = useCatalogs()
      return createElement('span', { 'data-count': orbitals.length + superpositions.length })
    }

    const tree = await mount(createElement(Probe))
    try {
      await flush()
      await tree.update(createElement(Probe))
      expect(tree.container.querySelector('span')?.dataset.count).toBe('2')
    } finally {
      await tree.unmount()
    }
  })
})
```

- [ ] **Step 2: Run and see it fail.**

Run: `npm --prefix web run test:watch -- run src/state/catalogs.test.ts`
Expected: FAIL — `./catalogs` does not exist.

- [ ] **Step 3: Implement** `web/src/state/catalogs.ts`:

```ts
import { useEffect } from 'react'
import { create } from 'zustand'

import { fetchCatalog, fetchSuperpositionCatalog } from '../api/client'
import type { OrbitalPreset, SuperpositionPreset } from '../api/types'
import { useSceneStore } from './useSceneStore'

export type CatalogStatus = 'idle' | 'loading' | 'ready' | 'error'

export interface CatalogState {
  orbitals: readonly OrbitalPreset[]
  superpositions: readonly SuperpositionPreset[]
  orbitalStatus: CatalogStatus
  superpositionStatus: CatalogStatus
}

const EMPTY: CatalogState = {
  orbitals: [],
  superpositions: [],
  orbitalStatus: 'idle',
  superpositionStatus: 'idle',
}

/** The two server catalogues, loaded once per page for every component that needs them. */
export const useCatalogStore = create<CatalogState>()(() => EMPTY)

let inFlight: AbortController | null = null

/**
 * The selected mixture's builder-derived capabilities, or a fail-closed
 * invalidation when the catalogue does not list it -- exactly what
 * ControlPanel.tsx did inline before this module existed.
 */
function syncSelectedMixture(catalogue: readonly SuperpositionPreset[]): void {
  const scene = useSceneStore.getState()
  const selected = catalogue.find((mixture) => mixture.terms === scene.superpositionTerms)
  if (selected === undefined) {
    scene.invalidateSuperpositionStreamlineCapability()
    return
  }
  // The fourth argument is A11's 2s-2pz fix: the preset's server-probed
  // opening picture. Dropping it would silently reopen 2s-2pz on a refused
  // isosurface.
  scene.syncSuperpositionCapabilities(
    selected.terms,
    selected.slice_resolution_floor,
    selected.streamline_seed_count_max,
    selected.default_representation,
  )
}

/**
 * Start the catalogue load unless it has already started. Idempotent: the
 * visual harness counts catalogue responses, so a page asks exactly once.
 */
export function ensureCatalogsLoaded(): void {
  if (inFlight !== null) return
  const controller = new AbortController()
  inFlight = controller
  useCatalogStore.setState({ orbitalStatus: 'loading', superpositionStatus: 'loading' })

  fetchCatalog(controller.signal).then(
    (orbitals) => {
      if (!controller.signal.aborted) useCatalogStore.setState({ orbitals, orbitalStatus: 'ready' })
    },
    () => {
      if (!controller.signal.aborted) {
        useCatalogStore.setState({ orbitals: [], orbitalStatus: 'error' })
      }
    },
  )

  fetchSuperpositionCatalog(controller.signal).then(
    (superpositions) => {
      if (controller.signal.aborted) return
      useCatalogStore.setState({ superpositions, superpositionStatus: 'ready' })
      syncSelectedMixture(superpositions)
    },
    () => {
      if (controller.signal.aborted) return
      useCatalogStore.setState({ superpositions: [], superpositionStatus: 'error' })
      useSceneStore.getState().invalidateSuperpositionStreamlineCapability()
    },
  )
}

/** Abort anything in flight and forget the catalogues (a fresh page, or a test). */
export function resetCatalogs(): void {
  inFlight?.abort()
  inFlight = null
  useCatalogStore.setState(EMPTY, true)
}

/** The catalogues, with the load started on first use. */
export function useCatalogs(): CatalogState {
  useEffect(() => {
    ensureCatalogsLoaded()
  }, [])
  return useCatalogStore()
}
```

`web/src/components/ControlPanel.tsx`:
- line 16 → `import { useEffect, useMemo, useState } from 'react'` stays (the playback timer still uses `useEffect` until D10).
- line 25 (`import { fetchCatalog, fetchSuperpositionCatalog } from '../api/client'`) → `import { useCatalogs } from '../state/catalogs'`; drop `OrbitalPreset` and `SuperpositionPreset` from the type import (lines 26–32).
- delete line 307 (`const [presets, setPresets] = …`), line 318 (`const [mixtures, setMixtures] = …`) and the effect at lines 320–347 (after A11 its `syncSuperpositionCapabilities(...)` call has a fourth argument, `selected.default_representation`, which `syncSelectedMixture` above now passes); in their place write:

```tsx
  // One load per page, shared with the time pill and the search pill: the
  // fail-closed catalogue side effects now live in state/catalogs.ts.
  const { orbitals: presets, superpositions: mixtures } = useCatalogs()
```

`web/src/components/ControlPanel.test.tsx` — add `import { resetCatalogs } from '../state/catalogs'` and make `beforeEach` (lines 136–141):

```ts
beforeEach(() => {
  capabilityOverride.current = null
  superpositionCatalogueFailure.current = null
  superpositionCatalogueFailure.omitSelected = false
  // The loader is page-wide; each mounted panel must see a fresh catalogue
  // request, which is what the failure and omission cases below arrange.
  resetCatalogs()
  useSceneStore.setState(PRISTINE, true)
})
```

`web/coverage-scope.json` — insert `"src/state/catalogs.ts"` into both arrays directly before `"src/state/useSceneStore.ts"`.

- [ ] **Step 4: Run and see it pass.**

Run: `npm --prefix web run test:watch -- run src/state/catalogs.test.ts src/components/ControlPanel.test.tsx src/guards.test.ts`
Expected: PASS — including `'invalidates stale seed metadata when the catalogue request or parser rejects'` and `'… omits the selected mixture'` (ControlPanel.test.tsx:981-1027), now satisfied by the shared loader, and both A11 cases (`'opens a mixture on the representation its catalogue entry publishes'`, `'records the selected mixture default from the catalogue without moving the picture'`). `npm --prefix web run typecheck` → exit 0. The mixture click (`store.setSuperposition(..., mixture.default_representation)`, A11) is not touched by this task.

- [ ] **Step 5: Pre-commit gate, then commit.** Both gate commands must exit 0 — `test` runs all five stages (clean-coverage, `tsc -p tsconfig.test.json`, vitest with per-file 90/85/90/90, `assert-no-skips`, `assert-coverage-scope`); a failure is fixed inside this task before committing.

```powershell
npm --prefix web run test
npm --prefix web run typecheck
git add web/src/state/catalogs.ts web/src/state/catalogs.test.ts web/src/components/ControlPanel.tsx web/src/components/ControlPanel.test.tsx web/coverage-scope.json
git commit -m "refactor(web): load the server catalogues once per page in a shared store" -m "Claude-Session: https://claude.ai/code/session_01E44DEzsc7Av26fc7nZ5rSo"
```

### Task D10: Playback hook and the bottom-centre time pill

**Files:**
- Create: `web/src/components/usePlayback.ts`, `web/src/components/usePlayback.test.tsx`, `web/src/components/TimePill.tsx`, `web/src/components/TimePill.test.tsx`
- Modify: `web/src/components/ControlPanel.tsx:1-16,34,265-276,440-489,692-723` (clock removed), `web/src/components/ControlPanel.test.tsx` (lines listed in Step 1), `web/src/App.tsx:1-12,202` (mount the pill), `web/src/App.test.tsx` (catalogue mock), `web/src/lab.css` (append), `web/coverage-scope.json`
- Not modified: `web/src/components/sceneRequest.ts`, `sceneRequest.test.ts`, `useSceneAsset.test.tsx` — the required-period fix of spec §5 row 5 (`DEFAULT_PLAYBACK_PERIOD_AU` removed, `nextTimeAu.length === 2` regression test, every one-argument caller given `LEGACY_PERIOD_AU`/`PLAYBACK_PERIOD_AU`) is Part B's Task B6 and is already merged.

**Interfaces:**
- Consumes: `playbackFrames(periodAu): readonly number[]` (`src/api/staticCatalog.ts`, Part B — the exact `nextTimeAu` lattice for one period, `[0]` for 0); `ParameterBound.values` (Part B); `runtimeMode()` (Part B); `getTransport()` (Part B); `requestsForPlan(plan, inputs)` (Part B); `useCatalogs()` (D9); `nextTimeAu(time: number, periodAu: number): number` (period required since B6); `setSuperposition(terms, label, sliceResolutionFloor, streamlineSeedCountMax, defaultRepresentation)` (A11, used by the spec only).
- Produces (`src/components/usePlayback.ts`):
  ```ts
  export const PLAYBACK_TICK_MS = 420
  export const PREFETCH_CONCURRENCY = 4
  export const DEGENERATE_REASON = '该叠加态的能量简并，概率密度严格不随时间变化。'
  export const WAITING_REASON = '等待叠加态目录提供物理周期。'
  export type ClockKind = 'stationary' | 'waiting' | 'degenerate' | 'oscillating'
  export interface PlaybackModel {
    kind: ClockKind; canPlay: boolean; reason: string | null
    periodAu: number | null; bound: ParameterBound | undefined
    frames: readonly number[]; frameIndex: number; onLattice: boolean
    timeAu: number; playing: boolean
    step(direction: 1 | -1): void; toggle(): void; seek(index: number): void; setTime(value: number): void
  }
  export function nearestFrameIndex(frames: readonly number[], time: number): number
  export function nextFrameTime(frames: readonly number[], time: number): number
  export function usePlaybackModel(): PlaybackModel          // derivation only, no timers
  export function usePlaybackClock(model: Pick<PlaybackModel, 'playing' | 'canPlay' | 'periodAu' | 'bound'>): void
  export function prefetchRequests(requests: readonly ApiRequest[], signal: AbortSignal, concurrency?: number): Promise<number>
  export function useFramePrefetch(model: Pick<PlaybackModel, 'canPlay' | 'playing' | 'frames'>): void // static mode only
  ```
- Produces (`src/components/TimePill.tsx`): `export const STATIONARY_HEADLINE = '定态 · |ψ|² 与 t 无关'`; `export function TimePill(props: { status: SceneStatus }): JSX.Element` — `section[data-chrome][data-time-kind]`, `button[data-control="playback"]` (aria-pressed, aria-disabled, aria-describedby → `#playback-availability-notice`), `p#playback-availability-notice[role=note][data-playback-notice]`, live-mode `input[type=number][data-parameter="timeAu"]` bounded by the capability, `input[type=range][data-time-scrubber]` over frame indices, `button[data-time-step="-1"|"1"]`, `[role=progressbar]` while loading/refreshing.

**`ControlPanel.test.tsx` assertions that move or change in this task** (all semantics preserved, now asserted on the pill):

| Current | Replacement |
|---|---|
| 17 `nextTimeAu` import | removed (only the moved playback specs used it) |
| 112–119 `EVERY_PARAMETER` includes `'timeAu'` | `'timeAu'` removed; new case `'never renders the clock itself'` asserts `input[data-parameter="timeAu"]` and `[data-control="playback"]` are absent for every cell |
| 541–557 `'offers a clock only where the matrix declares one'` | moved to `TimePill.test.tsx` `'offers a clock and playback only where the matrix declares timeAu'` |
| 895–923 `'switches state kind, picks a mixture and toggles playback'` | playback half (911–916) moved to `TimePill.test.tsx` `'toggles playback on and off'`; test renamed `'switches state kind and picks a mixture'` |
| 1080–1087 (timeAu part of `'writes each request parameter the cell declares'`) | moved to `TimePill.test.tsx` `'writes an exact time through the capability-bounded entry'` |
| 1286–1303 `'advances the clock on its own while playback is on'` | moved verbatim (mounting `TimePill`) |
| 1305–1337 `'uses the selected catalogue period for playback'` | moved; mixture chosen with `setSuperposition(…, ring.default_representation)` (A11's five-argument form); the `.control-value` text check becomes the entry's value `/^\d+(?:\.\d)?$/` |
| 1339–1375 `'does not offer motion for a degenerate catalogue state'` | moved verbatim (mounting `TimePill`) |
| A11's two cases inserted after it (`'opens a mixture on the representation its catalogue entry publishes'`, `'records the selected mixture default from the catalogue without moving the picture'`) | **not moved, not deleted**: they are catalogue/mixture semantics, not clock semantics, and stay in `ControlPanel.test.tsx` (D11's table re-selects the first). When deleting the neighbouring playback cases, delete by title, not by line range. |
| 1377–1391 `'runs no clock for a cell the matrix gives no time parameter'` | moved verbatim (mounting `TimePill`) |

- [ ] **Step 1: Write the failing tests.**

`web/src/components/TimePill.test.tsx`:

```ts
/** @vitest-environment jsdom */
import { act, createElement } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { Capability, CapabilityInputs } from '../api/capability'
import { playbackFrames } from '../api/staticCatalog'
import type { SceneStatus, SuperpositionPreset } from '../api/types'
import { resetCatalogs } from '../state/catalogs'
import { useSceneStore } from '../state/useSceneStore'
import { mount, type MountedTree } from '../test/mount'
import { nextTimeAu } from './sceneRequest'
import { STATIONARY_HEADLINE, TimePill } from './TimePill'
import { DEGENERATE_REASON, WAITING_REASON } from './usePlayback'

const override = vi.hoisted(() => ({
  current: null as ((inputs: CapabilityInputs) => Capability | null) | null,
}))

vi.mock('../api/capability', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/capability')>()
  return {
    ...actual,
    capabilityFor: (inputs: CapabilityInputs): Capability =>
      override.current?.(inputs) ?? actual.capabilityFor(inputs),
  }
})

// Typed as the generated catalogue entry, so a fixture missing a required
// field (A10's default_representation) fails tsc -p tsconfig.test.json.
const CATALOGUE = vi.hoisted(() => {
  const mixtures: SuperpositionPreset[] = [
    {
      id: 'bohr',
      label: '1s + 2p_z',
      terms: '1,0,0,0.7071067811865476;2,1,0,0.7071067811865476',
      period_au: 39.6,
      note: 'Bohr oscillation',
      slice_resolution_floor: 65,
      streamline_seed_count_max: 40,
      default_representation: 'isosurface',
    },
    {
      id: 'ring',
      label: '2p_+1 + 3d_+2',
      terms: '2,1,1,0.7071067811865476;3,2,2,0.7071067811865476',
      period_au: 12.1,
      note: 'ring current',
      slice_resolution_floor: 65,
      streamline_seed_count_max: 40,
      default_representation: 'isosurface',
    },
  ]
  return { omitSelected: false, mixtures }
})

vi.mock('../api/client', () => ({
  fetchCatalog: () => Promise.resolve([]),
  fetchSuperpositionCatalog: () =>
    Promise.resolve(CATALOGUE.omitSelected ? CATALOGUE.mixtures.slice(1) : CATALOGUE.mixtures),
}))

const PRISTINE = useSceneStore.getState()

beforeEach(() => {
  override.current = null
  CATALOGUE.omitSelected = false
  resetCatalogs()
  useSceneStore.setState(PRISTINE, true)
})

afterEach(() => {
  vi.useRealTimers()
})

async function interact(body: () => void): Promise<void> {
  const scope = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  const had = 'IS_REACT_ACT_ENVIRONMENT' in scope
  const previous = scope.IS_REACT_ACT_ENVIRONMENT
  scope.IS_REACT_ACT_ENVIRONMENT = true
  try {
    await act(async () => {
      body()
    })
  } finally {
    if (had) scope.IS_REACT_ACT_ENVIRONMENT = previous
    else delete scope.IS_REACT_ACT_ENVIRONMENT
  }
}

async function press(element: Element | null, what: string): Promise<void> {
  if (!(element instanceof HTMLElement)) throw new Error(`no ${what} to press`)
  await interact(() => element.click())
}

async function setValue(element: HTMLInputElement | null, what: string, value: string): Promise<void> {
  if (element === null) throw new Error(`no ${what} control on screen`)
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
  if (setter === undefined) throw new Error('no value setter')
  await interact(() => {
    setter.call(element, value)
    element.dispatchEvent(new Event('input', { bubbles: true }))
    element.dispatchEvent(new Event('change', { bubbles: true }))
  })
}

async function pill(status: SceneStatus = { loading: false }): Promise<MountedTree> {
  const tree = await mount(createElement(TimePill, { status }))
  await interact(() => undefined) // let the mocked catalogue settle
  return tree
}

const playback = (tree: MountedTree): HTMLButtonElement | null =>
  tree.container.querySelector<HTMLButtonElement>('[data-control="playback"]')
const clock = (tree: MountedTree): HTMLInputElement | null =>
  tree.container.querySelector<HTMLInputElement>('input[data-parameter="timeAu"]')

describe('TimePill: where a clock exists', () => {
  it('offers a clock and playback only where the matrix declares timeAu', async () => {
    useSceneStore.setState({ mode: 'eigenstate', representation: 'point_cloud' })
    const stationary = await pill()
    try {
      expect(clock(stationary)).toBeNull()
      expect(playback(stationary)).toBeNull()
      expect(stationary.container.textContent).toContain(STATIONARY_HEADLINE)
      expect(stationary.container.querySelector('[data-time-kind]')?.getAttribute('data-time-kind')).toBe('stationary')
      expect(stationary.container.querySelector('[data-chrome]')).not.toBeNull()
    } finally {
      await stationary.unmount()
    }

    useSceneStore.setState({ mode: 'superposition', representation: 'isosurface' })
    const timeDependent = await pill()
    try {
      expect(clock(timeDependent)).not.toBeNull()
      expect(playback(timeDependent)).not.toBeNull()
      expect(timeDependent.container.querySelector('[data-time-kind]')?.getAttribute('data-time-kind')).toBe('oscillating')
    } finally {
      await timeDependent.unmount()
    }
  })

  it('writes an exact time through the capability-bounded entry', async () => {
    useSceneStore.setState({ mode: 'superposition', representation: 'isosurface' })
    const tree = await pill()
    try {
      const input = clock(tree)
      expect(input?.type).toBe('number')
      expect(input?.step).toBe('0.2')
      expect(input?.min).toBe('-1000')
      expect(input?.max).toBe('1000')
      expect(input?.value).toBe('0')
      expect(input?.validity.stepMismatch).toBe(false)
      await setValue(input, 'time', '8.4')
      expect(input?.value).toBe('8.4')
      expect(input?.validity.stepMismatch).toBe(false)
      expect(useSceneStore.getState().timeAu).toBe(8.4)
      await setValue(input, 'time', '')
      expect(useSceneStore.getState().timeAu).toBe(8.4)
    } finally {
      await tree.unmount()
    }
  })
})

describe('TimePill: playback', () => {
  it('toggles playback on and off', async () => {
    useSceneStore.setState({ mode: 'superposition', representation: 'isosurface' })
    const tree = await pill()
    try {
      await press(playback(tree), 'the playback toggle')
      expect(useSceneStore.getState().playing).toBe(true)
      expect(playback(tree)?.getAttribute('aria-pressed')).toBe('true')
      await press(playback(tree), 'the playback toggle')
      expect(useSceneStore.getState().playing).toBe(false)
    } finally {
      await tree.unmount()
    }
  })

  it('advances the clock on its own while playback is on', async () => {
    vi.useFakeTimers()
    useSceneStore.setState({ mode: 'superposition', representation: 'isosurface', timeAu: 0 })
    const tree = await pill()
    try {
      await press(playback(tree), 'playback')
      expect(useSceneStore.getState().playing).toBe(true)
      await vi.advanceTimersByTimeAsync(900)
      // Two ticks of the 0.6 a.u. frame grid, landing exactly on the grid.
      expect(useSceneStore.getState().timeAu).toBe(1.2)
    } finally {
      await tree.unmount()
    }
  })

  it('uses the selected catalogue period for playback', async () => {
    vi.useFakeTimers()
    useSceneStore.setState({ mode: 'superposition', representation: 'isosurface', timeAu: 0 })
    const tree = await pill()
    try {
      const ring = CATALOGUE.mixtures[1]
      await interact(() =>
        useSceneStore
          .getState()
          .setSuperposition(
            ring.terms,
            ring.label,
            ring.slice_resolution_floor,
            ring.streamline_seed_count_max,
            ring.default_representation,
          ),
      )
      await press(playback(tree), 'playback')
      await vi.advanceTimersByTimeAsync(5 * 420 + 1)

      let expected = 0
      let oldFixedPeriod = 0
      for (let frame = 0; frame < 5; frame += 1) {
        expected = nextTimeAu(expected, ring.period_au)
        oldFixedPeriod = nextTimeAu(oldFixedPeriod, 39.6)
      }
      expect(expected).toBe(2.8)
      expect(oldFixedPeriod).toBe(3)
      expect(useSceneStore.getState().timeAu).toBe(expected)
      expect(useSceneStore.getState().timeAu).not.toBe(oldFixedPeriod)
      expect(clock(tree)?.validity.stepMismatch).toBe(false)
      expect(clock(tree)?.value).toMatch(/^\d+(?:\.\d)?$/)
    } finally {
      await tree.unmount()
    }
  })

  it('does not offer motion for a degenerate catalogue state', async () => {
    const mixture = CATALOGUE.mixtures[0]
    const originalPeriod = mixture.period_au
    mixture.period_au = 0
    useSceneStore.setState({ mode: 'superposition', representation: 'isosurface' })
    const tree = await pill()
    try {
      const button = playback(tree)
      expect(button?.disabled).toBe(false)
      expect(button?.getAttribute('aria-disabled')).toBe('true')
      expect(button?.title).toContain('能量简并')
      button?.focus()
      expect(document.activeElement).toBe(button)
      const notice = tree.container.querySelector('[data-playback-notice]')
      expect(notice?.textContent).toBe(DEGENERATE_REASON)
      expect(notice?.getAttribute('role')).toBe('note')
      expect(button?.getAttribute('aria-describedby')).toBe(notice?.id)
      expect(tree.container.textContent).toContain('能量简并：密度不随时间变化')
      await press(button, 'the inert degenerate playback control')
      expect(useSceneStore.getState().playing).toBe(false)

      // A real rerender: the explanation must survive later store writes.
      await interact(() => useSceneStore.getState().setBloom(0.31))
      const rerendered = playback(tree)
      const rerenderedNotice = tree.container.querySelector('[data-playback-notice]')
      expect(rerenderedNotice?.textContent).toContain('能量简并')
      expect(rerendered?.getAttribute('aria-disabled')).toBe('true')
      expect(rerendered?.getAttribute('aria-describedby')).toBe(rerenderedNotice?.id)
    } finally {
      await tree.unmount()
      mixture.period_au = originalPeriod
    }
  })

  it('waits for the catalogue period before it offers playback', async () => {
    CATALOGUE.omitSelected = true
    useSceneStore.setState({ mode: 'superposition', representation: 'isosurface' })
    const tree = await pill()
    try {
      expect(playback(tree)?.getAttribute('aria-disabled')).toBe('true')
      expect(tree.container.querySelector('[data-playback-notice]')?.textContent).toBe(WAITING_REASON)
      expect(tree.container.textContent).toContain('周期未知')
    } finally {
      await tree.unmount()
    }
  })

  it('runs no clock for a cell the matrix gives no time parameter', async () => {
    vi.useFakeTimers()
    useSceneStore.setState({ mode: 'eigenstate', representation: 'point_cloud', playing: true })
    const tree = await pill()
    try {
      await vi.advanceTimersByTimeAsync(2000)
      expect(useSceneStore.getState().timeAu).toBe(0)
    } finally {
      await tree.unmount()
    }
  })
})

describe('TimePill: frames', () => {
  it('steps one frame at a time along the playback lattice, wrapping at both ends', async () => {
    useSceneStore.setState({ mode: 'superposition', representation: 'isosurface', timeAu: 0 })
    const tree = await pill()
    const frames = playbackFrames(39.6)
    try {
      await press(tree.container.querySelector('[data-time-step="-1"]'), 'previous frame')
      expect(useSceneStore.getState().timeAu).toBe(frames[frames.length - 1])
      await press(tree.container.querySelector('[data-time-step="1"]'), 'next frame')
      expect(useSceneStore.getState().timeAu).toBe(frames[0])
      await press(tree.container.querySelector('[data-time-step="1"]'), 'next frame')
      expect(useSceneStore.getState().timeAu).toBe(frames[1])
    } finally {
      await tree.unmount()
    }
  })

  it('scrubs one period with a range over frame indices and names the frame', async () => {
    useSceneStore.setState({ mode: 'superposition', representation: 'isosurface', timeAu: 0 })
    const tree = await pill()
    const frames = playbackFrames(39.6)
    try {
      const scrubber = tree.container.querySelector<HTMLInputElement>('input[data-time-scrubber]')
      expect(scrubber?.max).toBe(String(frames.length - 1))
      await setValue(scrubber, 'scrubber', '10')
      expect(useSceneStore.getState().timeAu).toBe(frames[10])
      expect(scrubber?.getAttribute('aria-valuetext')).toBe(`t = ${frames[10].toFixed(1)} a.u.`)
      expect(tree.container.textContent).toContain(`周期 T = 39.60 a.u. · 帧 11/${frames.length}`)

      await interact(() => useSceneStore.getState().setTimeAu(0.1))
      expect(tree.container.textContent).toContain(`帧 —/${frames.length}`)
    } finally {
      await tree.unmount()
    }
  })

  it('reads a precomputed frame list instead of offering free time entry', async () => {
    vi.useFakeTimers()
    override.current = (inputs) =>
      inputs.mode === 'superposition'
        ? {
            status: 'available',
            endpoint: '/api/superposition/isosurface',
            parameters: { timeAu: { min: 0, max: 1.2, step: 0.2, values: [0, 0.6, 1.2] } },
            latency: 'slow',
          }
        : null
    useSceneStore.setState({ mode: 'superposition', representation: 'isosurface', timeAu: 0 })
    const tree = await pill()
    try {
      expect(clock(tree)).toBeNull()
      expect(tree.container.querySelector('output[data-time-readout]')?.textContent).toBe('0.0')
      expect(tree.container.querySelector<HTMLInputElement>('input[data-time-scrubber]')?.max).toBe('2')
      await press(playback(tree), 'playback')
      await vi.advanceTimersByTimeAsync(3 * 420 + 1)
      // 0 -> 0.6 -> 1.2 -> 0: the static catalogue's frames, wrapping.
      expect(useSceneStore.getState().timeAu).toBe(0)
    } finally {
      await tree.unmount()
    }
  })

  it('shows a thin progress bar only while a frame is being computed', async () => {
    useSceneStore.setState({ mode: 'superposition', representation: 'isosurface' })
    for (const [status, busy] of [
      [{ loading: true }, true],
      [{ loading: false, refreshing: true }, true],
      [{ loading: false }, false],
    ] as const) {
      const tree = await pill(status)
      try {
        expect(tree.container.querySelector('[role="progressbar"]') !== null).toBe(busy)
      } finally {
        await tree.unmount()
      }
    }
  })
})
```

`web/src/components/usePlayback.test.tsx`:

```ts
/** @vitest-environment jsdom */
import { act, createElement } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { ApiRequest } from '../api/requests'
import { playbackFrames } from '../api/staticCatalog'
import { resetTransport, setTransport } from '../api/transport'
import { resetCatalogs } from '../state/catalogs'
import { useSceneStore } from '../state/useSceneStore'
import { mount } from '../test/mount'
import {
  nearestFrameIndex,
  nextFrameTime,
  prefetchRequests,
  useFramePrefetch,
  usePlaybackModel,
} from './usePlayback'

const runtime = vi.hoisted(() => ({ current: 'live' as 'live' | 'static' }))
vi.mock('../api/runtimeMode', () => ({ runtimeMode: () => runtime.current }))
vi.mock('../api/client', () => ({
  fetchCatalog: () => Promise.resolve([]),
  fetchSuperpositionCatalog: () =>
    Promise.resolve([
      {
        id: 'bohr',
        label: '1s + 2p_z',
        terms: '1,0,0,0.7071067811865476;2,1,0,0.7071067811865476',
        period_au: 39.6,
        note: 'Bohr oscillation',
        slice_resolution_floor: 65,
        streamline_seed_count_max: 40,
        default_representation: 'isosurface',
      },
    ]),
}))

const PRISTINE = useSceneStore.getState()
const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0))

beforeEach(() => {
  runtime.current = 'live'
  resetCatalogs()
  useSceneStore.setState(PRISTINE, true)
})

afterEach(() => {
  resetTransport()
})

describe('nearestFrameIndex / nextFrameTime', () => {
  it('finds the nearest frame and reports -1 when there is none', () => {
    expect(nearestFrameIndex([], 1)).toBe(-1)
    expect(nearestFrameIndex([0, 0.6, 1.2], Number.NaN)).toBe(-1)
    expect(nearestFrameIndex([0, 0.6, 1.2], 0.7)).toBe(1)
    expect(nearestFrameIndex([0, 0.6, 1.2], 0.9)).toBe(1)
    expect(nearestFrameIndex([0, 0.6, 1.2], 5)).toBe(2)
  })

  it('advances to the next frame and wraps to the first', () => {
    expect(nextFrameTime([0, 0.6, 1.2], 0)).toBe(0.6)
    expect(nextFrameTime([0, 0.6, 1.2], 1.2)).toBe(0)
    expect(nextFrameTime([], 3)).toBe(3)
  })
})

describe('prefetchRequests', () => {
  const requests = (count: number): ApiRequest[] =>
    Array.from({ length: count }, (_, index) => ({
      route: '/api/superposition/isosurface',
      query: new URLSearchParams({ time: String(index) }),
    }))

  it('never runs more than the concurrency limit at once, and counts warmed frames', async () => {
    let running = 0
    let peak = 0
    setTransport({
      request: async () => {
        running += 1
        peak = Math.max(peak, running)
        await flush()
        running -= 1
        return new Response(new ArrayBuffer(8))
      },
    })
    const warmed = await prefetchRequests(requests(9), new AbortController().signal, 2)
    expect(warmed).toBe(9)
    expect(peak).toBe(2)
  })

  it('treats a failed or refused frame as a missed warm-up, not an error', async () => {
    let call = 0
    setTransport({
      request: async () => {
        call += 1
        if (call === 1) throw new Error('offline')
        if (call === 2) return new Response('{"detail":"x"}', { status: 404 })
        return new Response(new ArrayBuffer(8))
      },
    })
    await expect(prefetchRequests(requests(3), new AbortController().signal, 1)).resolves.toBe(1)
  })

  it('stops launching requests once aborted', async () => {
    const controller = new AbortController()
    let calls = 0
    setTransport({
      request: async () => {
        calls += 1
        controller.abort()
        return new Response(new ArrayBuffer(8))
      },
    })
    await prefetchRequests(requests(5), controller.signal, 1)
    expect(calls).toBe(1)
    await expect(prefetchRequests([], controller.signal)).resolves.toBe(0)
  })
})

describe('useFramePrefetch', () => {
  function Harness() {
    const model = usePlaybackModel()
    useFramePrefetch(model)
    return createElement('span', { 'data-frames': model.frames.length })
  }

  async function mountPlaying(): Promise<{
    calls: { route: string; signal?: AbortSignal }[]
    unmount: () => Promise<void>
  }> {
    const calls: { route: string; signal?: AbortSignal }[] = []
    setTransport({
      request: (route, _query, signal) => {
        calls.push({ route, signal })
        return Promise.resolve(new Response(new ArrayBuffer(8)))
      },
    })
    useSceneStore.setState({ mode: 'superposition', representation: 'isosurface', playing: true })
    const tree = await mount(createElement(Harness))
    await act(async () => {
      await flush()
    })
    await tree.update(createElement(Harness))
    await act(async () => {
      await flush()
      await flush()
    })
    return { calls, unmount: () => tree.unmount() }
  }

  it('warms every frame of one period in the static build while playing', async () => {
    runtime.current = 'static'
    const { calls, unmount } = await mountPlaying()
    expect(calls).toHaveLength(playbackFrames(39.6).length)
    expect(new Set(calls.map((call) => call.route))).toEqual(new Set(['/api/superposition/isosurface']))
    await unmount()
    expect(calls.every((call) => call.signal?.aborted === true)).toBe(true)
  })

  it('does nothing in live mode, where every frame is computed on demand anyway', async () => {
    runtime.current = 'live'
    const { calls, unmount } = await mountPlaying()
    expect(calls).toHaveLength(0)
    await unmount()
  })
})
```

`web/src/components/ControlPanel.test.tsx` — apply the table above: remove the `nextTimeAu` import (line 17); drop `'timeAu'` from `EVERY_PARAMETER` (line 118); delete the cases at 541–557, 1286–1303, 1305–1337, 1339–1375, 1377–1391 (at `bbe1a5e`; after A11 and D9 locate each by its title and delete exactly that `it(...)` — A11's two mixture cases sit between the degenerate-state case and the no-clock case and stay) and lines 1080–1087; in 895–923 delete lines 911–916 and rename the case; then add inside `describe('ControlPanel sliders are the capability matrix bounds')`:

```ts
  it.each(CELLS)('%s / %s: never renders the clock itself (it lives in the time pill)', async (mode, representation, orbital) => {
    const tree = await panel(mode, representation, orbital)
    try {
      expect(parameterInput(tree, 'timeAu')).toBeNull()
      expect(tree.container.querySelector('[data-control="playback"]')).toBeNull()
    } finally {
      await tree.unmount()
    }
  })
```

- [ ] **Step 2: Run and see them fail.**

Run: `npm --prefix web run test:watch -- run src/components/TimePill.test.tsx src/components/usePlayback.test.tsx src/components/ControlPanel.test.tsx`
Expected: FAIL — `./TimePill` and `./usePlayback` missing; the new `'never renders the clock itself'` cases fail because ControlPanel still renders `input[data-parameter="timeAu"]` and `[data-control="playback"]`.

- [ ] **Step 3: Implement.**

`web/src/components/usePlayback.ts`:

```ts
import { useEffect, useMemo } from 'react'

import { capabilityFor, planSceneRequest, type ParameterBound } from '../api/capability'
import { requestsForPlan, type ApiRequest } from '../api/requests'
import { runtimeMode } from '../api/runtimeMode'
import { playbackFrames } from '../api/staticCatalog'
import { getTransport } from '../api/transport'
import { useCatalogs } from '../state/catalogs'
import { useSceneStore } from '../state/useSceneStore'
import { nextTimeAu, selectSceneRequestInputs } from './sceneRequest'

/** One frame per tick. Unchanged from the retired ControlPanel timer. */
export const PLAYBACK_TICK_MS = 420
/** Parallel warm-up requests for one period of precomputed frames. */
export const PREFETCH_CONCURRENCY = 4
export const DEGENERATE_REASON = '该叠加态的能量简并，概率密度严格不随时间变化。'
export const WAITING_REASON = '等待叠加态目录提供物理周期。'

/**
 * stationary  -- the cell declares no time (every eigenstate): nothing to play.
 * waiting     -- time is declared but the catalogue period is not known yet.
 * degenerate  -- the period is 0: |Ψ|² cannot move.
 * oscillating -- a positive period: playback is offered.
 */
export type ClockKind = 'stationary' | 'waiting' | 'degenerate' | 'oscillating'

export interface PlaybackModel {
  kind: ClockKind
  canPlay: boolean
  reason: string | null
  periodAu: number | null
  bound: ParameterBound | undefined
  frames: readonly number[]
  frameIndex: number
  onLattice: boolean
  timeAu: number
  playing: boolean
  step: (direction: 1 | -1) => void
  toggle: () => void
  seek: (index: number) => void
  setTime: (value: number) => void
}

/** The frame nearest `time`, or -1 when there are no frames or no time. */
export function nearestFrameIndex(frames: readonly number[], time: number): number {
  if (frames.length === 0 || !Number.isFinite(time)) return -1
  let best = 0
  for (let index = 1; index < frames.length; index += 1) {
    if (Math.abs(frames[index] - time) < Math.abs(frames[best] - time)) best = index
  }
  return best
}

/** The frame after the one nearest `time`, wrapping; `time` itself when there are none. */
export function nextFrameTime(frames: readonly number[], time: number): number {
  if (frames.length === 0) return time
  return frames[(nearestFrameIndex(frames, time) + 1) % frames.length]
}

const parseFrames = (key: string | null): number[] | null =>
  key === null || key === '' ? null : key.split(',').map(Number)

/**
 * Everything the time pill (and the charts' beat period) need to know about the
 * clock, derived from the capability matrix and the catalogue -- no timers.
 *
 * A clock exists iff the cell declares a `timeAu` bound, so playback can never
 * be offered for a request that would send the same query on every tick. The
 * period is the catalogue's physical period scaled by a_mu/Z² from the PLAN,
 * the values the request actually carries.
 */
export function usePlaybackModel(): PlaybackModel {
  const store = useSceneStore()
  const { superpositions } = useCatalogs()
  const inputs = selectSceneRequestInputs(store)
  const capability = capabilityFor(inputs)
  const bound = capability.status === 'available' ? capability.parameters.timeAu : undefined
  const plan = planSceneRequest(inputs)
  const z = plan.status === 'available' && typeof plan.params.z === 'number' ? plan.params.z : null
  const aMu =
    plan.status === 'available' && typeof plan.params.a_mu === 'number' ? plan.params.a_mu : null
  const mixture = superpositions.find((entry) => entry.terms === store.superpositionTerms)
  const periodAu =
    bound === undefined || mixture === undefined
      ? null
      : mixture.period_au === 0
        ? 0
        : z === null || aMu === null
          ? null
          : (mixture.period_au * aMu) / z ** 2
  const kind: ClockKind =
    bound === undefined
      ? 'stationary'
      : periodAu === 0
        ? 'degenerate'
        : periodAu !== null && periodAu > 0
          ? 'oscillating'
          : 'waiting'
  const canPlay = kind === 'oscillating'
  // The static catalogue's frame list (Part B) is authoritative when present;
  // otherwise the live lattice for one period, which is what the exporter used.
  const valuesKey = bound?.values === undefined ? null : bound.values.join(',')
  const frames = useMemo<readonly number[]>(
    () => parseFrames(valuesKey) ?? (canPlay && periodAu !== null ? playbackFrames(periodAu) : []),
    [valuesKey, canPlay, periodAu],
  )
  const frameIndex = nearestFrameIndex(frames, store.timeAu)
  const onLattice = frameIndex >= 0 && Math.abs(frames[frameIndex] - store.timeAu) < 1e-9
  const { setTimeAu, setPlaying, playing, timeAu } = store

  return {
    kind,
    canPlay,
    reason: kind === 'degenerate' ? DEGENERATE_REASON : kind === 'waiting' ? WAITING_REASON : null,
    periodAu,
    bound,
    frames,
    frameIndex,
    onLattice,
    timeAu,
    playing,
    step: (direction) => {
      if (frames.length === 0) return
      const base = Math.max(0, frameIndex)
      setTimeAu(frames[(base + direction + frames.length) % frames.length])
    },
    toggle: () => {
      if (canPlay) setPlaying(!playing)
    },
    seek: (index) => {
      const time = frames[index]
      if (time !== undefined) setTimeAu(time)
    },
    setTime: (value) => {
      if (Number.isFinite(value)) setTimeAu(value)
    },
  }
}

/**
 * The 420 ms tick. It reads the clock from the store, not from a render's
 * closure, and depends only on what decides whether it runs -- so an unrelated
 * store write (dragging another slider) cannot restart the interval.
 */
export function usePlaybackClock(
  model: Pick<PlaybackModel, 'playing' | 'canPlay' | 'periodAu' | 'bound'>,
): void {
  const { playing, canPlay, periodAu } = model
  const valuesKey = model.bound?.values === undefined ? null : model.bound.values.join(',')
  useEffect(() => {
    if (!playing || !canPlay || periodAu === null) return undefined
    const frames = parseFrames(valuesKey)
    const timer = window.setInterval(() => {
      const state = useSceneStore.getState()
      state.setTimeAu(
        frames === null ? nextTimeAu(state.timeAu, periodAu) : nextFrameTime(frames, state.timeAu),
      )
    }, PLAYBACK_TICK_MS)
    return () => window.clearInterval(timer)
  }, [playing, canPlay, periodAu, valuesKey])
}

/**
 * Warm one period of frames through the active transport, at most
 * `concurrency` at a time. Returns how many frames came back OK. A failed
 * warm-up is not an error: the frame's own request reports any real failure.
 */
export async function prefetchRequests(
  requests: readonly ApiRequest[],
  signal: AbortSignal,
  concurrency = PREFETCH_CONCURRENCY,
): Promise<number> {
  const transport = getTransport()
  let cursor = 0
  let warmed = 0
  const worker = async (): Promise<void> => {
    while (!signal.aborted && cursor < requests.length) {
      const request = requests[cursor]
      cursor += 1
      try {
        const response = await transport.request(request.route, request.query, signal)
        if (response.ok) {
          await response.arrayBuffer()
          warmed += 1
        }
      } catch {
        // A missed warm-up only means the frame is fetched when it is shown.
      }
    }
  }
  const workers = Math.max(0, Math.min(concurrency, requests.length))
  await Promise.all(Array.from({ length: workers }, () => worker()))
  return warmed
}

/**
 * Static build only: while a superposition plays, fetch every frame of one
 * period ahead of the 420 ms clock so a cold Pages cache does not stall the
 * animation. Live mode computes on demand and is left alone.
 */
export function useFramePrefetch(model: Pick<PlaybackModel, 'canPlay' | 'playing' | 'frames'>): void {
  const store = useSceneStore()
  const enabled =
    runtimeMode() === 'static' && model.canPlay && model.playing && model.frames.length > 1
  const key = enabled
    ? `${model.frames.join(',')}|${JSON.stringify({ ...selectSceneRequestInputs(store), timeAu: 0 })}`
    : null
  useEffect(() => {
    if (key === null) return undefined
    const frames = key.slice(0, key.indexOf('|')).split(',').map(Number)
    const base = selectSceneRequestInputs(useSceneStore.getState())
    const requests = frames.flatMap((timeAu) => {
      const inputs = { ...base, timeAu }
      const plan = planSceneRequest(inputs)
      return plan.status === 'available' ? [...requestsForPlan(plan, inputs)] : []
    })
    const controller = new AbortController()
    void prefetchRequests(requests, controller.signal)
    return () => controller.abort()
  }, [key])
}
```

`web/src/components/TimePill.tsx`:

```tsx
import { ChevronLeft, ChevronRight, Pause, Play } from 'lucide-react'

import type { SceneStatus } from '../api/types'
import { useFramePrefetch, usePlaybackClock, usePlaybackModel, type ClockKind } from './usePlayback'

export const STATIONARY_HEADLINE = '定态 · |ψ|² 与 t 无关'

const META_BY_KIND: Readonly<Record<Exclude<ClockKind, 'stationary' | 'oscillating'>, string>> = {
  degenerate: '能量简并：密度不随时间变化',
  waiting: '周期未知',
}

const formatTime = (time: number): string => (Number.isFinite(time) ? time.toFixed(1) : '—')

/**
 * The bottom-centre time pill. Time is a first-class control: eigenstates say
 * why nothing moves, a degenerate superposition says why it cannot move, and an
 * oscillating one gets step, play and one period of frames.
 */
export function TimePill({ status }: { status: SceneStatus }) {
  const model = usePlaybackModel()
  usePlaybackClock(model)
  useFramePrefetch(model)
  const busy = status.loading || status.refreshing === true
  const progress = busy ? (
    <div className="qv-time-progress" role="progressbar" aria-label="正在计算帧" />
  ) : null

  if (model.kind === 'stationary') {
    return (
      <section
        className="qv-time-pill qv-glass"
        data-chrome=""
        data-time-kind="stationary"
        aria-label="时间演化"
      >
        <div className="qv-time-row">
          <span className="qv-time-glyph" aria-hidden="true">
            <Play size={18} />
          </span>
          <p className="qv-time-headline">{STATIONARY_HEADLINE}</p>
        </div>
        <p className="qv-time-note">
          本征态的时间因子只是整体相位 e^(−iEt/ħ)，概率密度不变，因此没有可播放的演化。
        </p>
        {progress}
      </section>
    )
  }

  const { bound, frames, frameIndex, onLattice, periodAu } = model
  const count = frames.length
  const shownIndex = Math.max(0, frameIndex)
  return (
    <section
      className="qv-time-pill qv-glass"
      data-chrome=""
      data-time-kind={model.kind}
      aria-label="时间演化"
    >
      <div className="qv-time-row">
        {count > 1 ? (
          <button
            type="button"
            className="qv-time-step"
            data-time-step="-1"
            aria-label="上一帧"
            onClick={() => model.step(-1)}
          >
            <ChevronLeft size={18} aria-hidden="true" />
          </button>
        ) : null}
        <label className="qv-time-value">
          <span>t =</span>
          {bound !== undefined && bound.values === undefined ? (
            <input
              type="number"
              data-parameter="timeAu"
              aria-label="时间 t（原子单位）"
              min={bound.min}
              max={bound.max}
              step={bound.step}
              value={model.timeAu}
              onChange={(event) => {
                if (event.target.value.trim() !== '') model.setTime(Number(event.target.value))
              }}
            />
          ) : (
            <output data-time-readout="">{formatTime(model.timeAu)}</output>
          )}
          <span className="qv-time-unit">a.u.</span>
        </label>
        {count > 1 ? (
          <button
            type="button"
            className="qv-time-step"
            data-time-step="1"
            aria-label="下一帧"
            onClick={() => model.step(1)}
          >
            <ChevronRight size={18} aria-hidden="true" />
          </button>
        ) : null}
      </div>
      <div className="qv-time-row">
        <button
          type="button"
          className="qv-play"
          data-control="playback"
          aria-pressed={model.playing}
          aria-disabled={!model.canPlay}
          aria-describedby={model.reason === null ? undefined : 'playback-availability-notice'}
          title={
            model.canPlay && periodAu !== null
              ? `按物理周期 ${periodAu.toPrecision(6)} a.u. 循环`
              : (model.reason ?? undefined)
          }
          onClick={model.toggle}
        >
          {model.playing ? <Pause size={18} aria-hidden="true" /> : <Play size={18} aria-hidden="true" />}
          <span className="sr-only">随 t 演化</span>
        </button>
        {count > 1 ? (
          <input
            type="range"
            className="qv-time-scrubber"
            data-time-scrubber=""
            aria-label="一个周期内的帧"
            aria-valuetext={`t = ${formatTime(frames[shownIndex])} a.u.`}
            min={0}
            max={count - 1}
            step={1}
            value={shownIndex}
            onChange={(event) => model.seek(Number(event.target.value))}
          />
        ) : (
          <div className="qv-time-track" aria-hidden="true" />
        )}
      </div>
      <p className="qv-time-meta">
        {model.kind === 'oscillating' && periodAu !== null
          ? `周期 T = ${periodAu.toFixed(2)} a.u. · 帧 ${onLattice ? frameIndex + 1 : '—'}/${count}`
          : META_BY_KIND[model.kind === 'oscillating' ? 'waiting' : model.kind]}
      </p>
      {model.reason === null ? null : (
        <p
          id="playback-availability-notice"
          className="qv-time-note"
          role="note"
          data-playback-notice=""
        >
          {model.reason}
        </p>
      )}
      {progress}
    </section>
  )
}
```

`web/src/components/ControlPanel.tsx` — remove the clock: delete lines 440–489 (`hasClock` … the interval effect) and 692–723 (the playback toggle and its note); delete `{ id: 'timeAu', label: 't', suffix: ' a.u.' }` from `PARAMETER_ROWS` (line 275); change the react import (line 16) to `import { useMemo, useState } from 'react'` and the `./sceneRequest` import (line 34) to `import { selectSceneRequestInputs } from './sceneRequest'`. `Pause`/`Play` stay imported (the auto-rotate toggle at 915–924 uses them until D11). `plannedZ`/`plannedAMu`/`selectedMixture`/`playbackPeriodAu` go with the deleted block.

`web/src/App.tsx` — import `TimePill` from `./components/TimePill` and render `<TimePill status={status} />` directly after `<Legend status={status} />` (line 202), so playback stays reachable until D20 rebuilds the shell.

`web/src/App.test.tsx` — add after the Inspector mock (line 77), so the pill's catalogue hook does not reach `fetch` in jsdom:

```ts
vi.mock('./state/catalogs', () => ({
  useCatalogs: () => ({
    orbitals: [],
    superpositions: [],
    orbitalStatus: 'ready',
    superpositionStatus: 'ready',
  }),
  ensureCatalogsLoaded: () => undefined,
}))
```

`web/src/lab.css` — append:

```css
/* ---- Time pill ---- */
.qv-time-pill {
  position: fixed;
  left: 50%;
  bottom: 24px;
  z-index: 10;
  display: grid;
  gap: 8px;
  width: min(500px, calc(100vw - 2 * var(--qv-edge)));
  padding: 14px 20px;
  border-radius: 30px;
  overflow: hidden;
  transform: translateX(-50%);
}
.qv-time-row { display: flex; align-items: center; justify-content: center; gap: 10px; }
.qv-time-step {
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: var(--qv-text-2);
  cursor: pointer;
}
.qv-time-step:hover { background: rgba(255,255,255,.08); color: var(--qv-text); }
.qv-time-value { display: inline-flex; align-items: baseline; gap: 6px; font-size: 15px; font-weight: 700; }
.qv-time-value input {
  width: 84px;
  height: 30px;
  padding: 0 8px;
  border: 1px solid var(--qv-border);
  border-radius: 8px;
  background: rgba(255,255,255,.06);
  color: var(--qv-text);
  font-weight: 700;
  text-align: right;
}
.qv-time-unit { color: var(--qv-text-2); font-size: 13px; font-weight: 500; }
.qv-play {
  display: grid;
  flex: 0 0 auto;
  place-items: center;
  width: 40px;
  height: 40px;
  border: 0;
  border-radius: 50%;
  background: var(--qv-accent);
  color: #0e0f11;
  cursor: pointer;
}
.qv-play[aria-disabled="true"] { background: rgba(255,255,255,.12); color: var(--qv-text-3); cursor: not-allowed; }
.qv-time-scrubber { flex: 1; }
.qv-time-track { flex: 1; height: 4px; border-radius: 2px; background: rgba(255,255,255,.12); }
.qv-time-meta { color: var(--qv-text-2); font-size: 12px; text-align: center; }
.qv-time-note { color: var(--qv-text-3); font-size: 12px; line-height: 1.5; text-align: center; }
.qv-time-headline { font-size: 15px; font-weight: 700; }
.qv-time-glyph {
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: rgba(255,255,255,.08);
  color: var(--qv-text-3);
}
.qv-time-progress {
  position: absolute;
  right: 0;
  bottom: 0;
  left: 0;
  height: 3px;
  background: linear-gradient(90deg, transparent, var(--qv-accent), transparent) no-repeat;
  background-size: 40% 100%;
  animation: qv-progress 1.1s linear infinite;
}
@keyframes qv-progress {
  from { background-position: -40% 0; }
  to { background-position: 140% 0; }
}
input[type="range"] {
  width: 100%;
  height: 4px;
  border-radius: 2px;
  background: rgba(255,255,255,.18);
  appearance: none;
}
input[type="range"]::-webkit-slider-thumb {
  width: 16px;
  height: 16px;
  border: 0;
  border-radius: 50%;
  background: var(--qv-accent);
  cursor: pointer;
  appearance: none;
}
input[type="range"]::-moz-range-thumb { width: 16px; height: 16px; border: 0; border-radius: 50%; background: var(--qv-accent); cursor: pointer; }

@media (max-width: 820px) {
  .qv-time-pill {
    right: 68px;
    bottom: var(--qv-edge);
    left: 68px;
    width: auto;
    padding: 10px 12px;
    gap: 6px;
    transform: none;
  }
  .qv-app[data-drawer-open="true"] .qv-time-pill {
    right: var(--qv-edge);
    bottom: calc(var(--qv-drawer-h) + 8px);
    left: var(--qv-edge);
  }
  .qv-time-note { display: none; }
}
```

`web/coverage-scope.json` — insert `"src/components/TimePill.tsx"` directly after `"src/components/OrbitalCanvas.tsx"` and `"src/components/usePlayback.ts"` directly before `"src/components/useSceneAsset.ts"`, in both arrays.

- [ ] **Step 4: Run and see them pass.**

Run: `npm --prefix web run test:watch -- run src/components/TimePill.test.tsx src/components/usePlayback.test.tsx src/components/ControlPanel.test.tsx src/App.test.tsx src/guards.test.ts`
Expected: PASS. `npm --prefix web run typecheck` → exit 0.

- [ ] **Step 5: Pre-commit gate, then commit.** Both gate commands must exit 0 — `test` runs all five stages (clean-coverage, `tsc -p tsconfig.test.json`, vitest with per-file 90/85/90/90, `assert-no-skips`, `assert-coverage-scope`); a failure is fixed inside this task before committing.

```powershell
npm --prefix web run test
npm --prefix web run typecheck
git add web/src/components/usePlayback.ts web/src/components/usePlayback.test.tsx web/src/components/TimePill.tsx web/src/components/TimePill.test.tsx web/src/components/ControlPanel.tsx web/src/components/ControlPanel.test.tsx web/src/App.tsx web/src/App.test.tsx web/src/lab.css web/coverage-scope.json
git commit -m "feat(web): move the playback clock into a bottom-centre time pill" -m "Claude-Session: https://claude.ai/code/session_01E44DEzsc7Av26fc7nZ5rSo"
```

### Task D11: Left "控制" panel — focused sections, Weather-Lab rows, collapsible to "调节"

**Files:**
- Create: `web/src/components/controls/rows.tsx`, `web/src/components/controls/rows.test.tsx`, `web/src/components/controls/ControlGroup.tsx`, `web/src/components/controls/StateSection.tsx`, `web/src/components/controls/RepresentationSection.tsx`, `web/src/components/controls/DisplaySection.tsx`, `web/src/components/stateIndex.ts`, `web/src/components/stateIndex.test.ts`
- Modify: `web/src/components/ControlPanel.tsx` (whole file), `web/src/components/ControlPanel.test.tsx` (lines listed below + new cases), `web/src/lab.css` (append), `web/coverage-scope.json`

**Interfaces:**
- Consumes: `capabilityFor`, `planSceneRequest`, `ParameterBound`, `ParameterId`, `Capability` (with refusal status `'not_precomputed'`, Part B); `chargeBound(): ParameterBound` (B8 — the one source of the Z range: the route's `Z_CONSTRAINT.uiBound` live, `{min: z, max: z}` for the exported Z in the static build, the same bound B9's store clamp uses); `CapabilityInputs.superpositionTerms?` (B8); `useCatalogs()` (D9); `REPRESENTATION_LABELS` (`sceneStatus.ts`); store actions as today, with A11's `setSuperposition(terms, label, sliceResolutionFloor, streamlineSeedCountMax, defaultRepresentation)`.
- Produces:
  - `ControlPanel(props: { open?: boolean; onOpenChange?: (open: boolean) => void })` — `aside.qv-controls[data-chrome][aria-label=控制面板]` with `nav[aria-label=控制上下文]` (buttons `量子态`/`表示法`/`显示`, `aria-pressed`) and three `section[data-group]`; collapsed = `button[data-action="open-controls"][aria-label=调节][data-chrome]`. `export type ControlGroupId = 'state' | 'representation' | 'display'` (replaces `ControlContext`).
  - `controls/rows.tsx`: `stepDigits(step?)`, `formatForStep(value, step?)`, `ParameterRow`, `DisplayRow`, `ChoiceRow<T>`, `OptionRow`, `SwitchRow` (signatures in Step 3).
  - `controls/ControlGroup.tsx`: `ControlGroup(props: { id; title; icon; expanded; onToggle; actions?; sectionRef?; children })`.
  - `controls/StateSection.tsx`: `StateSection()`; `controls/RepresentationSection.tsx`: `RepresentationSection(props: { onActivate?: () => void })`; `controls/DisplaySection.tsx`: `DisplaySection()`.
  - `stateIndex.ts`: `export const MIXTURE_COPY: Readonly<Record<string, { label: string; note: string }>>` (D18 adds the search index to this module).
- DOM hooks kept byte-for-byte: `button[data-representation]` (+ `data-unavailable`, `data-server-validation`, `aria-pressed`, `title` = reason verbatim, `aria-label` `…暂不可用：…`), `#representation-availability-notice[role=status][data-representation-notice]`, `#representation-server-validation-notice[role=note][data-server-validation-notice]`, `[data-flow-example]`, `[data-choice] button[data-choice-value]` (+ `.active`, `aria-pressed`), `input[type=range][data-parameter]` with capability `min/max/step`, `dd[data-readonly="basis"|"z"|"a_mu"]`, `[data-control-section="eigenstate-quantum-numbers"]`, `.display-section input[data-display]`. New hooks: `button[data-preset]`, `button[data-mixture]`, `button[data-state-kind]`, `select[data-quantum="n"|"l"|"m"]`, `input|output[data-quantum="z"]`, `button[data-basis]`, `button[data-action="reset-state"|"more-orbitals"|"collapse-controls"|"open-controls"]`, `button[role=switch][data-toggle]`, `[data-value-of]`, `output[data-parameter][data-readonly-parameter]`, `[data-control-section="state-kind"]`.

**`ControlPanel.test.tsx` assertions that change** (line numbers as of `bbe1a5e`; D2/D9/D10 have shifted them — locate each case by its title; semantics preserved):

| Current (line: selector / text) | Replacement |
|---|---|
| 829–845 `.preset-strip .preset` ×7, `presets[0].className` contains `active`, `.round-button` = reset | `button[data-preset]` ×7, `presets[0]` `aria-pressed="true"`, `button[data-action="reset-state"]` |
| 847–863 `'does not leave the state reset action in non-state contexts'` (contexts no longer exist) | `'keeps the reset action in the 量子态 group header, reachable while the group is folded'` |
| 865–893 `.quantum-grid select`[0..2], `.quantum-grid input[type="number"]`, `.segmented button`[1]/[0] | `select[data-quantum="n"|"l"|"m"]`, `input[data-quantum="z"]`, `button[data-basis="complex"|"real"]` |
| 895– `'switches state kind and picks a mixture'`: `.control-section .representation-switch button`[1]/[0], `.mixture-list .preset` + `className` `active` | `button[data-state-kind="superposition"|"eigenstate"]`, `button[data-mixture]` + `aria-pressed="true"` |
| 925–979 (both catalogue-floor cases) `.mixture-list .preset` | `button[data-mixture]` |
| A11 `'opens a mixture on the representation its catalogue entry publishes'`: `tree.container.querySelectorAll('.mixture-list .preset')`, `press(mixtures[1], 'the second mixture')` | `press(tree.container.querySelector('button[data-mixture="ring"]'), 'the second mixture')`; every assertion kept (`superpositionDefaultRepresentation` `'slice'`, `representation` `'slice'`, the plan's endpoint `/api/superposition/slice`) — it now proves `StateSection`'s row forwards `mixture.default_representation` |
| A11 `'records the selected mixture default from the catalogue without moving the picture'` | unchanged (no selector; the loader of D9 performs the sync) |
| 981–1004 `.mixture-list .preset` length 0 | `button[data-mixture]` length 0, and the band says `叠加态目录不可用。` |
| 1041–1061 `resolution.closest('label').querySelector('.control-value')` | `[data-value-of="resolution"]` |
| 1196–1240 label list `态制备`, `轨道与表示设置`, `态构成`; `not.toContain('量子数')`; `button[title="解析含时 eigenstate 叠加"]`; `实基 · chemistry`, `复基 · Lz`, `量子数` | list `量子态`, `态类型`, `本征态`, `叠加态`, `表示法`, `电子云`, `等密度面`, `平面切片`, `概率流线`, `显示`; `not.toContain('更多轨道')`; `button[data-state-kind="superposition"][title="解析含时本征态叠加"]`; `实基（化学轨道）`, `复基（Lz 本征态）`, `更多轨道` |
| 1267–1284 `.control-section.compact .toggle-row` ×2 | `button[role="switch"][data-toggle]` ×2 with `aria-checked` |

Unchanged and still required green: both A11 mixture cases (one re-selected above), every `CELLS` matrix case (207–251, 569–593, 696–720), the sabotage cases (387–440), the slider-bound cases (442–539), the probability-flow cases (297–385), the plane/observable cases (595–651), the read-out cases (653–746), the display-knob cases (1135–1194, as edited in D2), `'offers bloom only while…'` (1242–1265).

- [ ] **Step 1: Write the failing tests.**

`web/src/components/controls/rows.test.tsx`:

```ts
/** @vitest-environment jsdom */
import { act, createElement } from 'react'
import { Atom } from 'lucide-react'
import { describe, expect, it, vi } from 'vitest'

import { mount } from '../../test/mount'
import {
  ChoiceRow,
  DisplayRow,
  formatForStep,
  OptionRow,
  ParameterRow,
  stepDigits,
  SwitchRow,
} from './rows'

async function interact(body: () => void): Promise<void> {
  const scope = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  const had = 'IS_REACT_ACT_ENVIRONMENT' in scope
  const previous = scope.IS_REACT_ACT_ENVIRONMENT
  scope.IS_REACT_ACT_ENVIRONMENT = true
  try {
    await act(async () => body())
  } finally {
    if (had) scope.IS_REACT_ACT_ENVIRONMENT = previous
    else delete scope.IS_REACT_ACT_ENVIRONMENT
  }
}

async function change(input: HTMLInputElement, value: string): Promise<void> {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
  await interact(() => {
    setter?.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

describe('stepDigits / formatForStep', () => {
  it('shows as many decimals as the step has, and never more than 12', () => {
    expect(stepDigits(undefined)).toBeNull()
    expect(stepDigits(-1)).toBeNull()
    expect(stepDigits(1000)).toBe(0)
    expect(stepDigits(0.005)).toBe(3)
    expect(stepDigits(1e-20)).toBe(12)
    expect(formatForStep(0.90000000001, 0.01)).toBe('0.9')
    expect(formatForStep(28000, 1000)).toBe('28000')
    expect(formatForStep(3.14159, undefined)).toBe('3.14159')
  })
})

describe('ParameterRow', () => {
  it('is a slider bounded only by the capability, showing its value to the step', async () => {
    const onChange = vi.fn()
    const tree = await mount(
      createElement(ParameterRow, {
        parameter: 'probabilityMass',
        label: '包围概率',
        bound: { min: 0.5, max: 0.99, step: 0.01 },
        value: 0.9,
        onChange,
      }),
    )
    try {
      const input = tree.container.querySelector<HTMLInputElement>('input[data-parameter="probabilityMass"]')
      expect(input?.type).toBe('range')
      expect([input?.min, input?.max, input?.step]).toEqual(['0.5', '0.99', '0.01'])
      expect(tree.container.querySelector('[data-value-of="probabilityMass"]')?.textContent).toBe('0.9')
      await change(input as HTMLInputElement, '0.75')
      expect(onChange).toHaveBeenCalledWith(0.75)
    } finally {
      await tree.unmount()
    }
  })

  it('shows a pinned bound (min === max) as a read-only value, not a slider over one value', async () => {
    const tree = await mount(
      createElement(ParameterRow, {
        parameter: 'samples',
        label: '样本数',
        bound: { min: 28000, max: 28000, step: 1000 },
        value: 40000,
        suffix: ' pts',
        onChange: () => undefined,
      }),
    )
    try {
      expect(tree.container.querySelector('input')).toBeNull()
      const output = tree.container.querySelector('output[data-parameter="samples"]')
      // The value the wire carries (the clamped bound), not the store's 40000.
      expect(output?.textContent).toBe('28000 pts')
      expect(output?.getAttribute('data-readonly-parameter')).toBe('true')
      expect(output?.getAttribute('title')).toBe('静态教材版固定此参数')
    } finally {
      await tree.unmount()
    }
  })
})

describe('DisplayRow / SwitchRow / ChoiceRow / OptionRow', () => {
  it('drives a local display knob, never a request parameter', async () => {
    const onChange = vi.fn()
    const tree = await mount(
      createElement(DisplayRow, { control: 'opacity', label: '透明度', value: 60, min: 25, max: 100, step: 1, suffix: '%', onChange }),
    )
    try {
      const input = tree.container.querySelector<HTMLInputElement>('input[data-display="opacity"]')
      expect(input?.hasAttribute('data-parameter')).toBe(false)
      expect(tree.container.textContent).toContain('60%')
      await change(input as HTMLInputElement, '40')
      expect(onChange).toHaveBeenCalledWith(40)
    } finally {
      await tree.unmount()
    }
  })

  it('is a real switch with aria-checked', async () => {
    const onChange = vi.fn()
    const tree = await mount(createElement(SwitchRow, { toggle: 'showGrid', label: '地面网格（xy 平面）', checked: true, onChange }))
    try {
      const button = tree.container.querySelector<HTMLButtonElement>('button[role="switch"][data-toggle="showGrid"]')
      expect(button?.getAttribute('aria-checked')).toBe('true')
      await interact(() => button?.click())
      expect(onChange).toHaveBeenCalledWith(false)
    } finally {
      await tree.unmount()
    }
  })

  it('offers exactly the declared choices and marks the standing one', async () => {
    const onChange = vi.fn()
    const tree = await mount(
      createElement(ChoiceRow<'xy' | 'xz'>, {
        choice: 'plane',
        label: '平面',
        options: ['xy', 'xz'],
        labels: { xy: 'xy', xz: 'xz' },
        value: 'xz',
        onChange,
      }),
    )
    try {
      const buttons = Array.from(tree.container.querySelectorAll<HTMLButtonElement>('[data-choice="plane"] button[data-choice-value]'))
      expect(buttons.map((button) => button.dataset.choiceValue)).toEqual(['xy', 'xz'])
      expect(buttons.map((button) => button.className)).toEqual(['', 'active'])
      expect(buttons[1].getAttribute('aria-pressed')).toBe('true')
      await interact(() => buttons[0].click())
      expect(onChange).toHaveBeenCalledWith('xy')
    } finally {
      await tree.unmount()
    }
  })

  it('names a radio row by its label alone and describes it by its note', async () => {
    const onClick = vi.fn()
    const onFocus = vi.fn()
    const tree = await mount(
      createElement(OptionRow, {
        icon: Atom,
        label: '叠加态',
        note: '解析含时本征态叠加',
        pressed: false,
        tags: [{ text: '简并' }, { text: '未预计算', tone: 'warn' as const }],
        title: '解析含时本征态叠加',
        ariaDescribedBy: 'extra-note',
        data: { 'data-state-kind': 'superposition' },
        onClick,
        onFocus,
      }),
    )
    try {
      const button = tree.container.querySelector<HTMLButtonElement>('button[data-state-kind="superposition"]')
      expect(button?.getAttribute('aria-label')).toBe('叠加态')
      expect(button?.getAttribute('aria-pressed')).toBe('false')
      const note = tree.container.querySelector('.qv-option-note')
      expect(button?.getAttribute('aria-describedby')).toBe(`extra-note ${note?.id}`)
      expect(Array.from(tree.container.querySelectorAll('.qv-tag')).map((tag) => [tag.textContent, tag.getAttribute('data-tone')])).toEqual([
        ['简并', null],
        ['未预计算', 'warn'],
      ])
      await interact(() => button?.focus())
      await interact(() => button?.click())
      expect(onFocus).toHaveBeenCalledOnce()
      expect(onClick).toHaveBeenCalledOnce()
    } finally {
      await tree.unmount()
    }
  })

  it('uses an explicit accessible name and no description when given no note', async () => {
    const tree = await mount(
      createElement(OptionRow, { label: '电子云', ariaLabel: '电子云暂不可用：x', pressed: true, onClick: () => undefined }),
    )
    try {
      const button = tree.container.querySelector('button')
      expect(button?.getAttribute('aria-label')).toBe('电子云暂不可用：x')
      expect(button?.hasAttribute('aria-describedby')).toBe(false)
      expect(button?.querySelector('svg')).toBeNull()
    } finally {
      await tree.unmount()
    }
  })
})
```

`web/src/components/stateIndex.test.ts`:

```ts
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import { MIXTURE_COPY } from './stateIndex'

describe('MIXTURE_COPY', () => {
  it('names every preset the server catalogue publishes', () => {
    // The committed catalogue fixture is the server's own response bytes
    // (tests/fixtures/visual/, rebuilt by tests/test_visual_fixtures.py).
    const catalogue = JSON.parse(
      readFileSync(new URL('../../../tests/fixtures/visual/catalog-superposition.json', import.meta.url), 'utf-8'),
    ) as { id: string }[]
    for (const { id } of catalogue) {
      expect(MIXTURE_COPY[id]?.label, id).toBeTruthy()
      expect(MIXTURE_COPY[id]?.note, id).toBeTruthy()
    }
  })
})
```

`web/src/components/ControlPanel.test.tsx` — apply the table above, add `import { resetCatalogs } from '../state/catalogs'` if not present (D9), add `type ParameterBound` to the `../api/capability` type import, extend the client mock and add two hoisted flags next to the other hoisted mocks:

```ts
const orbitalCatalogueFailure = vi.hoisted(() => ({ current: false }))
/** Replaces B8's chargeBound(): the static build pins Z through it, not through runtimeMode. */
const chargeOverride = vi.hoisted(() => ({ current: null as ParameterBound | null }))
```

and extend the existing `vi.mock('../api/capability', …)` factory (lines 40–47 at `bbe1a5e`) with one more member after `capabilityFor`:

```ts
    chargeBound: (): ParameterBound => chargeOverride.current ?? actual.chargeBound(),
```

make the mocked `fetchCatalog` read `() => orbitalCatalogueFailure.current ? Promise.reject(new Error('offline')) : Promise.resolve(CATALOGUE.presets)`, reset both flags in `beforeEach` (`orbitalCatalogueFailure.current = false; chargeOverride.current = null`), and add these cases (new `describe` blocks at the end of the file):

```ts
describe('ControlPanel shell', () => {
  it('keeps a 控制上下文 navigation whose buttons reveal their group', async () => {
    const tree = await mount(createElement(ControlPanel))
    try {
      const nav = tree.container.querySelector('nav[aria-label="控制上下文"]')
      const buttons = Array.from(nav?.querySelectorAll<HTMLButtonElement>('button') ?? [])
      expect(buttons.map((button) => button.textContent)).toEqual(['量子态', '表示法', '显示'])
      const display = tree.container.querySelector<HTMLElement>('[data-group="display"] .qv-group-body')
      expect(display?.hidden).toBe(true)

      await press(buttons[2], 'the 显示 context')
      expect(display?.hidden).toBe(false)
      expect(buttons[2].getAttribute('aria-pressed')).toBe('true')
      expect(buttons[0].getAttribute('aria-pressed')).toBe('false')
    } finally {
      await tree.unmount()
    }
  })

  it('folds and unfolds a group from its header', async () => {
    const tree = await mount(createElement(ControlPanel))
    try {
      const head = tree.container.querySelector<HTMLButtonElement>('[data-group="representation"] .qv-group-head')
      const body = tree.container.querySelector<HTMLElement>('[data-group="representation"] .qv-group-body')
      expect(head?.getAttribute('aria-expanded')).toBe('true')
      expect(head?.getAttribute('aria-controls')).toBe(body?.id)
      await press(head, 'the 表示法 header')
      expect(body?.hidden).toBe(true)
      expect(head?.getAttribute('aria-expanded')).toBe('false')
      // Folded content stays in the DOM: the refused-button explanations are
      // still there for the next time the group opens.
      expect(body?.querySelector('button[data-representation="streamlines"]')).not.toBeNull()
      await press(head, 'the 表示法 header')
      expect(body?.hidden).toBe(false)
    } finally {
      await tree.unmount()
    }
  })

  it('collapses to a single 调节 button and opens again', async () => {
    const tree = await mount(createElement(ControlPanel))
    try {
      await press(tree.container.querySelector('button[data-action="collapse-controls"]'), 'collapse')
      expect(tree.container.querySelector('aside.qv-controls')).toBeNull()
      const fab = tree.container.querySelector<HTMLButtonElement>('button[data-action="open-controls"]')
      expect(fab?.getAttribute('aria-label')).toBe('调节')
      expect(fab?.hasAttribute('data-chrome')).toBe(true)
      await press(fab, 'the 调节 button')
      expect(tree.container.querySelector('aside.qv-controls[data-chrome]')).not.toBeNull()
    } finally {
      await tree.unmount()
    }
  })

  it('reports open/close to a controlling parent instead of deciding itself', async () => {
    const onOpenChange = vi.fn()
    const tree = await mount(createElement(ControlPanel, { open: false, onOpenChange }))
    try {
      await press(tree.container.querySelector('button[data-action="open-controls"]'), 'the 调节 button')
      expect(onOpenChange).toHaveBeenCalledWith(true)
      // Still closed: the parent owns the state.
      expect(tree.container.querySelector('aside.qv-controls')).toBeNull()
    } finally {
      await tree.unmount()
    }
  })

  it('keeps the reset action in the 量子态 group header, reachable while the group is folded', async () => {
    const tree = await mount(createElement(ControlPanel))
    try {
      const header = tree.container.querySelector('[data-group="state"] .qv-group-header')
      const reset = header?.querySelector<HTMLButtonElement>('button[data-action="reset-state"]')
      expect(reset?.getAttribute('aria-label')).toBe('恢复 2p_z 默认值')
      await press(header?.querySelector<HTMLButtonElement>('.qv-group-head') ?? null, 'the 量子态 header')
      expect(tree.container.querySelector<HTMLElement>('[data-group="state"] .qv-group-body')?.hidden).toBe(true)
      expect(reset?.isConnected).toBe(true)
      expect(reset?.tabIndex).toBe(0)
    } finally {
      await tree.unmount()
    }
  })
})

describe('ControlPanel in the static textbook build', () => {
  it('shows a pinned bound as a read-only value, not a slider over one value', async () => {
    capabilityOverride.current = () => ({
      status: 'available',
      endpoint: '/api/orbitals/point-cloud',
      parameters: { samples: { min: 28000, max: 28000, step: 1000 }, seed: { min: 7, max: 7, step: 1 } },
      latency: 'fast',
    })
    const tree = await mount(createElement(ControlPanel))
    try {
      expect(tree.container.querySelector('input[data-parameter]')).toBeNull()
      expect(tree.container.querySelector('output[data-parameter="samples"]')?.textContent).toBe('28000')
      expect(tree.container.querySelector('output[data-parameter="seed"]')?.textContent).toBe('7')
    } finally {
      await tree.unmount()
    }
  })

  it('tags a not-precomputed representation and keeps it a focusable explanation', async () => {
    const reason = '静态教材版未预计算这一组合。本地运行 quviz serve 可实时计算任意参数。'
    capabilityOverride.current = (inputs) =>
      inputs.representation === 'isosurface'
        ? { status: 'not_precomputed', reason }
        : null
    const tree = await panel('eigenstate', 'point_cloud')
    try {
      const button = representationButton(tree, 'isosurface')
      expect(button.dataset.unavailable).toBe('true')
      expect(button.disabled).toBe(false)
      expect(button.title).toBe(reason)
      expect(button.querySelector('.qv-tag')?.textContent).toBe('未预计算')
    } finally {
      await tree.unmount()
    }
  })

  it('fixes Z at 1 and says why when the charge bound pins it', async () => {
    // B8's static overlay: chargeBound() is {min: z, max: z}. The panel reads
    // that bound -- the one the store clamps with -- and not the runtime mode.
    chargeOverride.current = { min: 1, max: 1, step: 0.1 }
    const tree = await panel('eigenstate', 'point_cloud')
    try {
      expect(tree.container.querySelector('input[data-quantum="z"]')).toBeNull()
      const z = tree.container.querySelector('output[data-quantum="z"]')
      expect(z?.textContent).toBe('1')
      expect(z?.getAttribute('title')).toBe('静态教材版固定 Z = 1')
    } finally {
      await tree.unmount()
    }
  })

  it('offers a free Z input bounded by the live charge range', async () => {
    const tree = await panel('eigenstate', 'point_cloud')
    try {
      const z = tree.container.querySelector<HTMLInputElement>('input[data-quantum="z"]')
      expect(tree.container.querySelector('output[data-quantum="z"]')).toBeNull()
      expect([z?.min, z?.max, z?.step]).toEqual(['0.1', '20', '0.1'])
    } finally {
      await tree.unmount()
    }
  })

  it('offers only the n values the matrix can draw, plus the current one', async () => {
    capabilityOverride.current = (inputs) =>
      inputs.representation === 'point_cloud' && inputs.orbital.n > 4
        ? { status: 'not_precomputed', reason: 'n > 4 is not in the static catalogue' }
        : null
    const tree = await panel('eigenstate', 'point_cloud')
    try {
      const options = Array.from(tree.container.querySelectorAll<HTMLOptionElement>('select[data-quantum="n"] option'))
      expect(options.map((option) => option.value)).toEqual(['1', '2', '3', '4'])
    } finally {
      await tree.unmount()
    }
  })
})

describe('ControlPanel state section copy', () => {
  it('says the orbital catalogue is unavailable instead of showing an empty list', async () => {
    orbitalCatalogueFailure.current = true
    const tree = await panel('eigenstate', 'point_cloud')
    try {
      expect(tree.container.querySelectorAll('button[data-preset]')).toHaveLength(0)
      expect(tree.container.textContent).toContain('轨道目录不可用')
    } finally {
      await tree.unmount()
    }
  })

  it('summarises the current state on the folded 更多轨道 row and unfolds it', async () => {
    const tree = await panel('eigenstate', 'point_cloud')
    try {
      const more = tree.container.querySelector<HTMLButtonElement>('button[data-action="more-orbitals"]')
      expect(more?.textContent).toContain('ψ(2,1,0) · 实基')
      const body = tree.container.querySelector<HTMLElement>('[data-control-section="eigenstate-quantum-numbers"]')
      expect(body?.hidden).toBe(true)
      await press(more, 'the 更多轨道 expander')
      expect(body?.hidden).toBe(false)
      expect(more?.getAttribute('aria-expanded')).toBe('true')
    } finally {
      await tree.unmount()
    }
  })
})
```

(The `capabilityOverride` mock type is widened from `(inputs) => Capability` to `(inputs) => Capability | null` so an override can fall through to the real matrix for other cells: at lines 32–34 declare `current: null as ((inputs: CapabilityInputs) => Capability | null) | null` and in the mock factory use `capabilityOverride.current?.(inputs) ?? actual.capabilityFor(inputs)` — already the expression at line 46.)

- [ ] **Step 2: Run and see them fail.**

Run: `npm --prefix web run test:watch -- run src/components/controls/rows.test.tsx src/components/stateIndex.test.ts src/components/ControlPanel.test.tsx`
Expected: FAIL — the `controls/` modules and `stateIndex` do not exist; ControlPanel has no `nav` group buttons `量子态`, no `data-preset`, no `data-quantum`, no switch roles.

- [ ] **Step 3: Implement.**

`web/src/components/stateIndex.ts` (D18 extends this module):

```ts
/**
 * Chinese UI copy for the fixed server superposition catalogue. Formulas and
 * ket labels stay untouched; stateIndex.test.ts checks that every preset the
 * server publishes has an entry.
 */
export const MIXTURE_COPY: Readonly<Record<string, { label: string; note: string }>> = {
  '1s-2pz': { label: '1s + 2p_z · Bohr 振荡', note: 'ω = 3/8 Ha；偶极矩随 t 振荡。' },
  '2s-2pz': { label: '2s + 2p_z · 简并定态', note: '两项能量相同，概率密度不随 t 变化。' },
  '1s-3dz2': { label: '1s + 3d_z²', note: 'ω = 4/9 Ha；无偶极耦合，呈四极“呼吸”。' },
  '2pplus-2pminus': { label: '2p(+1) + 2p(−1)', note: '简并叠加；等价于实 p 轨道，净概率流为 0。' },
}
```

`web/src/components/controls/rows.tsx`:

```tsx
import type { LucideIcon } from 'lucide-react'
import { useId } from 'react'

import type { ParameterBound, ParameterId } from '../../api/capability'

/** Decimals a value is shown with: as many as the step has, never more than 12. */
export function stepDigits(step: number | undefined): number | null {
  if (step === undefined || !(step > 0)) return null
  return Math.min(12, Math.max(0, -Math.floor(Math.log10(step))))
}

export function formatForStep(value: number, step: number | undefined): string {
  const digits = stepDigits(step)
  return digits === null ? String(value) : String(Number(value.toFixed(digits)))
}

/**
 * A request parameter. `min`, `max` and `step` are NOT arguments: they come
 * from the capability's ParameterBound, so a slider cannot offer a value the
 * route rejects. A bound with min === max is how the static catalogue pins a
 * value; a slider over one value is a control over nothing, so it is shown as
 * the read-only value the request actually carries.
 */
export function ParameterRow({
  parameter,
  label,
  bound,
  value,
  suffix = '',
  onChange,
}: {
  parameter: ParameterId
  label: string
  bound: ParameterBound
  value: number
  suffix?: string
  onChange: (value: number) => void
}) {
  if (bound.min === bound.max) {
    return (
      <div className="qv-param-row" data-parameter-row={parameter}>
        <span className="qv-param-label">{label}</span>
        <output data-parameter={parameter} data-readonly-parameter="true" title="静态教材版固定此参数">
          {`${formatForStep(bound.min, bound.step)}${suffix}`}
        </output>
      </div>
    )
  }
  return (
    <label className="qv-param-row" data-parameter-row={parameter}>
      <span className="qv-param-label">{label}</span>
      <input
        type="range"
        data-parameter={parameter}
        min={bound.min}
        max={bound.max}
        step={bound.step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      <span className="qv-param-value" data-value-of={parameter}>
        {`${formatForStep(value, bound.step)}${suffix}`}
      </span>
    </label>
  )
}

/**
 * A purely local rendering knob. Deliberately not a ParameterRow: nothing here
 * is sent to a route, so there is no bound to read and no data-parameter.
 */
export function DisplayRow({
  control,
  label,
  value,
  min,
  max,
  step,
  suffix = '',
  onChange,
}: {
  control: string
  label: string
  value: number
  min: number
  max: number
  step: number
  suffix?: string
  onChange: (value: number) => void
}) {
  return (
    <label className="qv-param-row" data-display-row={control}>
      <span className="qv-param-label">{label}</span>
      <input
        type="range"
        data-display={control}
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      <span className="qv-param-value">{`${value}${suffix}`}</span>
    </label>
  )
}

/** An enumerated request choice; `options` is the list the capability declares. */
export function ChoiceRow<T extends string>({
  choice,
  label,
  options,
  labels,
  value,
  onChange,
}: {
  choice: string
  label: string
  options: readonly T[]
  labels: Readonly<Record<T, string>>
  value: T
  onChange: (value: T) => void
}) {
  return (
    <div className="qv-choice-row">
      <span className="qv-param-label">{label}</span>
      <div className="qv-chips" data-choice={choice} role="group" aria-label={label}>
        {options.map((option) => (
          <button
            type="button"
            key={option}
            data-choice-value={option}
            className={value === option ? 'active' : ''}
            aria-pressed={value === option}
            onClick={() => onChange(option)}
          >
            {labels[option]}
          </button>
        ))}
      </div>
    </div>
  )
}

export interface OptionTag {
  text: string
  tone?: 'warn'
}

export interface OptionRowProps {
  label: string
  note?: string
  icon?: LucideIcon
  pressed: boolean
  tags?: readonly OptionTag[]
  title?: string
  /** Defaults to `label`, so a note or a tag never pollutes the accessible name. */
  ariaLabel?: string
  ariaDescribedBy?: string
  data?: Readonly<Record<string, string | undefined>>
  onClick: () => void
  onFocus?: () => void
}

/**
 * A Weather-Lab radio row: icon, label (and note) on the left, tags, then a
 * radio disc on the right. Semantically a pressed button -- the refused
 * representation rows must stay focusable explanation actions, which a
 * disabled radio input could not be.
 */
export function OptionRow({
  label,
  note,
  icon: Icon,
  pressed,
  tags = [],
  title,
  ariaLabel,
  ariaDescribedBy,
  data = {},
  onClick,
  onFocus,
}: OptionRowProps) {
  const noteId = useId()
  const describedBy =
    [ariaDescribedBy, note === undefined ? undefined : noteId]
      .filter((id): id is string => id !== undefined)
      .join(' ') || undefined
  return (
    <button
      type="button"
      className="qv-option-row"
      aria-pressed={pressed}
      aria-label={ariaLabel ?? label}
      aria-describedby={describedBy}
      title={title}
      onClick={onClick}
      onFocus={onFocus}
      {...data}
    >
      {Icon === undefined ? null : <Icon className="qv-option-icon" size={18} aria-hidden="true" />}
      <span className="qv-option-text">
        <span className="qv-option-label">{label}</span>
        {note === undefined ? null : (
          <span className="qv-option-note" id={noteId}>
            {note}
          </span>
        )}
      </span>
      {tags.map((tag) => (
        <span key={tag.text} className="qv-tag" data-tone={tag.tone}>
          {tag.text}
        </span>
      ))}
      <span className="qv-radio" aria-hidden="true" />
    </button>
  )
}

/** A Weather-Lab toggle: label left, switch right, `role=switch`. */
export function SwitchRow({
  toggle,
  label,
  checked,
  onChange,
}: {
  toggle: string
  label: string
  checked: boolean
  onChange: (next: boolean) => void
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      className="qv-switch-row"
      data-toggle={toggle}
      onClick={() => onChange(!checked)}
    >
      <span>{label}</span>
      <span className="qv-switch" aria-hidden="true" />
    </button>
  )
}
```

`web/src/components/controls/ControlGroup.tsx`:

```tsx
import { ChevronDown, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

/**
 * One group of the control panel: icon + bold title + chevron header, a band
 * of rows below it. A folded group keeps its content in the DOM (`hidden`), so
 * explanations and state survive folding.
 */
export function ControlGroup({
  id,
  title,
  icon: Icon,
  expanded,
  onToggle,
  actions,
  sectionRef,
  children,
}: {
  id: string
  title: string
  icon: LucideIcon
  expanded: boolean
  onToggle: () => void
  actions?: ReactNode
  sectionRef?: (node: HTMLElement | null) => void
  children: ReactNode
}) {
  const bodyId = `qv-group-${id}`
  return (
    <section className="qv-group" data-group={id} ref={sectionRef}>
      <div className="qv-group-header">
        <button
          type="button"
          className="qv-group-head"
          aria-expanded={expanded}
          aria-controls={bodyId}
          onClick={onToggle}
        >
          <span className="qv-group-icon" aria-hidden="true">
            <Icon size={16} />
          </span>
          <span className="qv-group-title">{title}</span>
          <ChevronDown className="qv-group-chevron" size={18} aria-hidden="true" />
        </button>
        {actions}
      </div>
      <div className="qv-group-body" id={bodyId} hidden={!expanded}>
        {children}
      </div>
    </section>
  )
}
```

`web/src/components/controls/StateSection.tsx`:

```tsx
import { Atom, ChevronRight, Clock } from 'lucide-react'
import { useMemo, useState } from 'react'

import { capabilityFor, chargeBound, planSceneRequest } from '../../api/capability'
import type { BasisKind } from '../../api/types'
import { useCatalogs } from '../../state/catalogs'
import { useSceneStore } from '../../state/useSceneStore'
import { selectSceneRequestInputs } from '../sceneRequest'
import { MIXTURE_COPY } from '../stateIndex'
import { OptionRow } from './rows'

/** The n values the store can hold (normalizeOrbital clamps to 1..8). */
const N_RANGE = [1, 2, 3, 4, 5, 6, 7, 8] as const
const BASIS_LABEL: Readonly<Record<BasisKind, string>> = {
  real: '实基（化学轨道）',
  complex: '复基（Lz 本征态）',
}
const BASIS_TAG: Readonly<Record<BasisKind, string>> = { real: '实基', complex: '复基' }

/**
 * 量子态: the state kind, the catalogue presets (a radio list), the
 * "更多轨道" expander with n / ℓ / m / Z and the basis, or -- for a
 * superposition -- the mixture presets and the basis/Z read-outs the request
 * actually carries.
 */
export function StateSection() {
  const store = useSceneStore()
  const { orbitals: presets, superpositions: mixtures, orbitalStatus, superpositionStatus } =
    useCatalogs()
  const [moreOpen, setMoreOpen] = useState(false)
  const { orbital, mode } = store
  // One source of truth for Z: B8's chargeBound() -- the route's range live,
  // the single exported Z on the static site -- which is also what B9's store
  // clamp and the planner use. min === max leaves nothing to choose.
  const charge = chargeBound()
  const zFixed = charge.min === charge.max
  // Offered n: those the matrix can draw at all (point clouds are the one
  // representation every eigenstate has), plus the current n so the select
  // never holds a value it cannot show.
  const nOptions = useMemo(
    () =>
      N_RANGE.filter(
        (n) =>
          n === orbital.n ||
          capabilityFor({
            mode: 'eigenstate',
            orbital: { n, l: 0, m: 0, z: orbital.z, basis: orbital.basis },
            representation: 'point_cloud',
          }).status === 'available',
      ),
    [orbital.n, orbital.z, orbital.basis],
  )
  const lOptions = Array.from({ length: orbital.n }, (_, index) => index)
  const mOptions = Array.from({ length: 2 * orbital.l + 1 }, (_, index) => index - orbital.l)
  const plan = planSceneRequest(selectSceneRequestInputs(store))

  return (
    <>
      <div className="qv-band" role="group" aria-label="态类型" data-control-section="state-kind">
        <div className="qv-subhead">态类型</div>
        <OptionRow
          icon={Atom}
          label="本征态"
          note="能量本征态：|ψ|² 不随时间变化"
          pressed={mode === 'eigenstate'}
          data={{ 'data-state-kind': 'eigenstate' }}
          onClick={() => store.setMode('eigenstate')}
        />
        <OptionRow
          icon={Clock}
          label="叠加态"
          note="解析含时本征态叠加"
          title="解析含时本征态叠加"
          pressed={mode === 'superposition'}
          data={{ 'data-state-kind': 'superposition' }}
          onClick={() => store.setMode('superposition')}
        />
      </div>

      {mode === 'eigenstate' ? (
        <div className="qv-band" data-control-section="presets">
          <div className="qv-subhead">轨道预设</div>
          {presets.length === 0 ? (
            <p className="qv-empty">
              {orbitalStatus === 'error'
                ? '轨道目录不可用；仍可在“更多轨道”中直接选择量子数。'
                : '正在载入轨道目录…'}
            </p>
          ) : (
            presets.map((preset) => (
              <OptionRow
                key={preset.id}
                label={preset.label}
                pressed={
                  preset.n === orbital.n &&
                  preset.l === orbital.l &&
                  preset.m === orbital.m &&
                  preset.basis === orbital.basis
                }
                tags={[{ text: BASIS_TAG[preset.basis] }]}
                data={{ 'data-preset': preset.id }}
                onClick={() => store.applyPreset(preset)}
              />
            ))
          )}
          <button
            type="button"
            className="qv-expander"
            data-action="more-orbitals"
            aria-expanded={moreOpen}
            aria-controls="qv-more-orbitals"
            onClick={() => setMoreOpen((open) => !open)}
          >
            <ChevronRight size={16} aria-hidden="true" />
            <span>更多轨道</span>
            <span className="qv-expander-summary">
              ψ({orbital.n},{orbital.l},{orbital.m}) · {BASIS_TAG[orbital.basis]}
            </span>
          </button>
          <div
            id="qv-more-orbitals"
            className="qv-more"
            hidden={!moreOpen}
            data-control-section="eigenstate-quantum-numbers"
          >
            <div className="qv-quantum-grid">
              <label>
                <span>n</span>
                <select
                  data-quantum="n"
                  value={orbital.n}
                  onChange={(event) => store.setOrbital({ n: Number(event.target.value) })}
                >
                  {nOptions.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>ℓ</span>
                <select
                  data-quantum="l"
                  value={orbital.l}
                  onChange={(event) => store.setOrbital({ l: Number(event.target.value) })}
                >
                  {lOptions.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>m</span>
                <select
                  data-quantum="m"
                  value={orbital.m}
                  onChange={(event) => store.setOrbital({ m: Number(event.target.value) })}
                >
                  {mOptions.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Z</span>
                {zFixed ? (
                  <output data-quantum="z" title={`静态教材版固定 Z = ${charge.min}`}>
                    {charge.min}
                  </output>
                ) : (
                  <input
                    type="number"
                    data-quantum="z"
                    min={charge.min}
                    max={charge.max}
                    step={charge.step}
                    value={orbital.z}
                    onChange={(event) => store.setOrbital({ z: Number(event.target.value) })}
                  />
                )}
              </label>
            </div>
            <div className="qv-basis-row" role="group" aria-label="基">
              {(['real', 'complex'] as const).map((basis) => (
                <button
                  type="button"
                  key={basis}
                  data-basis={basis}
                  aria-pressed={orbital.basis === basis}
                  onClick={() => store.setOrbital({ basis })}
                >
                  {BASIS_LABEL[basis]}
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="qv-band" data-control-section="mixtures">
          <div className="qv-subhead">叠加预设</div>
          {mixtures.length === 0 ? (
            <p className="qv-empty">
              {superpositionStatus === 'error' ? '叠加态目录不可用。' : '正在载入叠加态目录…'}
            </p>
          ) : (
            mixtures.map((mixture) => {
              const copy = MIXTURE_COPY[mixture.id]
              return (
                <OptionRow
                  key={mixture.id}
                  label={copy?.label ?? mixture.label}
                  note={copy?.note ?? mixture.note}
                  title={copy?.note ?? mixture.note}
                  pressed={store.superpositionTerms === mixture.terms}
                  tags={mixture.period_au === 0 ? [{ text: '简并' }] : []}
                  data={{ 'data-mixture': mixture.id }}
                  onClick={() =>
                    // The fifth argument is A11's 2s-2pz fix: open the preset
                    // on the picture the server probed it can build.
                    store.setSuperposition(
                      mixture.terms,
                      mixture.label,
                      mixture.slice_resolution_floor,
                      mixture.streamline_seed_count_max,
                      mixture.default_representation,
                    )
                  }
                />
              )
            })
          )}
          {plan.status === 'available' ? (
            // Read from the PLAN, so the read-out cannot name a basis or a
            // charge different from the one the query carries.
            <dl className="qv-readout" data-readonly-group="superposition">
              <div>
                <dt>基</dt>
                <dd data-readonly="basis">{String(plan.params.basis)}</dd>
              </div>
              <div>
                <dt>Z</dt>
                <dd data-readonly="z">{String(plan.params.z)}</dd>
              </div>
            </dl>
          ) : null}
        </div>
      )}
    </>
  )
}
```

`web/src/components/controls/RepresentationSection.tsx`:

```tsx
import { Cloud, Grid2x2, Layers3, Waves, type LucideIcon } from 'lucide-react'
import { useState } from 'react'

import {
  capabilityFor,
  planSceneRequest,
  type Capability,
  type ParameterId,
} from '../../api/capability'
import type { PrincipalPlane, RepresentationKind, SliceObservable } from '../../api/types'
import { useCatalogs } from '../../state/catalogs'
import { useSceneStore } from '../../state/useSceneStore'
import { selectSceneRequestInputs } from '../sceneRequest'
import { REPRESENTATION_LABELS } from '../sceneStatus'
import { ChoiceRow, OptionRow, ParameterRow, type OptionTag } from './rows'

const PLANE_LABEL: Readonly<Record<PrincipalPlane, string>> = { xy: 'xy', xz: 'xz', yz: 'yz' }

const OBSERVABLE_LABEL: Readonly<Record<SliceObservable, string>> = {
  probability_density: '|ψ|²',
  wavefunction_real: 'Re ψ',
  wavefunction_imag: 'Im ψ',
  phase: 'arg ψ',
}

/**
 * The four representations and what each is FOR. `purpose` is the title of an
 * available row only; a refused row's title is the matrix's reason, verbatim.
 */
const REPRESENTATIONS: readonly {
  id: RepresentationKind
  icon: LucideIcon
  purpose: string
}[] = [
  { id: 'point_cloud', icon: Cloud, purpose: '从 |ψ|² d³r 采样位置；每个点具有相同视觉权重' },
  { id: 'isosurface', icon: Layers3, purpose: '包围指定概率质量的 |ψ|² 等值面' },
  { id: 'slice', icon: Grid2x2, purpose: '在过原子核的主平面上采样一个标量场' },
  { id: 'streamlines', icon: Waves, purpose: 'j/ρ 的流线（概率流，不是电子轨迹）' },
]

/** A Record over the refusal statuses: a new refusal kind is a compile error here. */
const REFUSAL_TAG: Readonly<Record<Exclude<Capability['status'], 'available'>, string>> = {
  unsupported: '不支持',
  not_implemented: '未实现',
  not_precomputed: '未预计算',
}

/**
 * Order is this list's; membership is the capability's. `timeAu` lives in the
 * time pill and `aMu` is read-only (see the read-out below), so neither is here.
 */
const PARAMETER_ROWS: readonly { id: Exclude<ParameterId, 'timeAu' | 'aMu'>; label: string }[] = [
  { id: 'samples', label: '样本数' },
  { id: 'seed', label: '随机种子' },
  { id: 'resolution', label: '网格' },
  { id: 'probabilityMass', label: '包围概率' },
  { id: 'seedCount', label: '流线种子' },
]

/**
 * 表示法: a radio list of the four representations -- every availability
 * decision comes from capabilityFor -- then the cell's own parameters.
 */
export function RepresentationSection({ onActivate }: { onActivate?: () => void }) {
  const store = useSceneStore()
  const { orbitals: presets } = useCatalogs()
  const [notice, setNotice] = useState<RepresentationKind | null>(null)
  const { mode } = store
  // Exactly the inputs useSceneAsset plans from.
  const inputs = selectSceneRequestInputs(store)
  const current = capabilityFor(inputs)
  const bounds = current.status === 'available' ? current.parameters : {}
  const planes = current.status === 'available' ? current.planes : undefined
  const observables = current.status === 'available' ? current.observables : undefined
  const serverValidation = current.status === 'available' ? current.serverValidation : undefined
  const plan = planSceneRequest(inputs)

  const capabilityOf = (representation: RepresentationKind): Capability =>
    capabilityFor({
      mode,
      orbital: inputs.orbital,
      representation,
      // B8's static overlay finds a superposition's exported frames by terms;
      // without them every superposition row would read as not precomputed.
      superpositionTerms: inputs.superpositionTerms,
      superpositionSliceResolutionFloor: inputs.superpositionSliceResolutionFloor,
      superpositionStreamlineSeedCountMax: inputs.superpositionStreamlineSeedCountMax,
    })
  const noticed = notice === null ? null : capabilityOf(notice)
  const noticeText = noticed !== null && noticed.status !== 'available' ? noticed.reason : null

  const flowExample = presets.find((preset) => preset.id === '3d-complex')
  const flowExampleCapability =
    flowExample === undefined
      ? undefined
      : capabilityFor({
          mode: 'eigenstate',
          orbital: { ...inputs.orbital, ...flowExample },
          representation: 'streamlines',
        })
  const offerFlowExample =
    mode === 'eigenstate' &&
    capabilityOf('streamlines').status !== 'available' &&
    flowExample !== undefined &&
    flowExampleCapability?.status === 'available'

  const loadFlowExample = (): void => {
    // A separate, plainly labelled action: the refused button itself never
    // rewrites the state. The example is the server catalogue entry.
    if (flowExample === undefined) return
    store.applyPreset(flowExample)
    useSceneStore.getState().setRepresentation('streamlines')
    setNotice(null)
  }

  const parameterValue: Record<ParameterId, number> = {
    samples: store.samples,
    seed: store.seed,
    resolution: store.resolution,
    probabilityMass: store.probabilityMass,
    seedCount: store.seedCount,
    timeAu: store.timeAu,
    aMu: store.aMu,
  }
  const parameterSetter: Record<ParameterId, (value: number) => void> = {
    samples: store.setSamples,
    seed: store.setSeed,
    resolution: store.setResolution,
    probabilityMass: store.setProbabilityMass,
    seedCount: store.setSeedCount,
    timeAu: store.setTimeAu,
    aMu: store.setAMu,
  }
  const declaredRows = PARAMETER_ROWS.filter(({ id }) => bounds[id] !== undefined)
  const carriesAMu = plan.status === 'available' && plan.params.a_mu !== undefined

  return (
    <>
      <div className="qv-band" role="group" aria-label="表示方式" data-control-section="representations">
        <div className="qv-subhead">表示方式</div>
        {REPRESENTATIONS.map(({ id, icon, purpose }) => {
          const label = REPRESENTATION_LABELS[id]
          const capability = capabilityOf(id)
          const available = capability.status === 'available'
          const validation = available ? capability.serverValidation : undefined
          const tags: OptionTag[] = !available
            ? [{ text: REFUSAL_TAG[capability.status], tone: 'warn' }]
            : validation === undefined
              ? []
              : [{ text: '需数值验证' }]
          return (
            <OptionRow
              key={id}
              icon={icon}
              label={label}
              pressed={store.representation === id}
              tags={tags}
              ariaLabel={
                !available
                  ? `${label}暂不可用：${capability.reason}`
                  : validation === undefined
                    ? label
                    : `${label}；需服务端数值验证：${validation.reason}`
              }
              ariaDescribedBy={
                !available && notice === id
                  ? 'representation-availability-notice'
                  : available && store.representation === id && validation !== undefined
                    ? 'representation-server-validation-notice'
                    : undefined
              }
              title={
                !available
                  ? capability.reason
                  : validation === undefined
                    ? purpose
                    : `${purpose}；需服务端数值验证：${validation.reason}`
              }
              data={{
                'data-representation': id,
                'data-unavailable': available ? undefined : 'true',
                'data-server-validation': validation === undefined ? undefined : 'required',
              }}
              onFocus={() => {
                if (!available) setNotice(id)
              }}
              onClick={() => {
                onActivate?.()
                if (available) {
                  setNotice(null)
                  store.setRepresentation(id)
                } else {
                  setNotice(id)
                }
              }}
            />
          )
        })}
        {noticeText === null ? null : (
          <p
            id="representation-availability-notice"
            className="qv-notice"
            role="status"
            data-representation-notice={notice ?? undefined}
          >
            {noticeText}
          </p>
        )}
        {serverValidation === undefined ? null : (
          <p
            id="representation-server-validation-notice"
            className="qv-notice"
            data-tone="info"
            role="note"
            data-server-validation-notice={store.representation}
          >
            <strong>需服务端数值验证：</strong>
            {serverValidation.reason}
          </p>
        )}
        {offerFlowExample && flowExample !== undefined ? (
          <button type="button" className="qv-action-row" data-flow-example onClick={loadFlowExample}>
            <Waves size={14} aria-hidden="true" /> 载入并显示概率流示例 · {flowExample.label} ·{' '}
            {flowExample.basis}
          </button>
        ) : null}
      </div>

      {planes !== undefined || observables !== undefined || declaredRows.length > 0 || carriesAMu ? (
        <div className="qv-band" data-control-section="representation-parameters">
          <div className="qv-subhead">参数</div>
          {planes === undefined ? null : (
            <ChoiceRow
              choice="plane"
              label="平面"
              options={planes}
              labels={PLANE_LABEL}
              value={store.plane}
              onChange={store.setPlane}
            />
          )}
          {observables === undefined ? null : (
            <ChoiceRow
              choice="observable"
              label="场"
              options={observables}
              labels={OBSERVABLE_LABEL}
              value={store.sliceObservable}
              onChange={store.setSliceObservable}
            />
          )}
          {declaredRows.map(({ id, label }) => (
            <ParameterRow
              key={id}
              parameter={id}
              label={label}
              bound={bounds[id] as NonNullable<(typeof bounds)[typeof id]>}
              value={parameterValue[id]}
              onChange={parameterSetter[id]}
            />
          ))}
          {carriesAMu && plan.status === 'available' ? (
            // Read-only by decision, and read out iff the request carries one;
            // the value is the plan's clamped one, not the store's raw number.
            <dl className="qv-readout" data-readonly-group="request">
              <div>
                <dt>
                  a<sub>μ</sub>
                </dt>
                <dd data-readonly="a_mu">{String(plan.params.a_mu)}</dd>
              </div>
            </dl>
          ) : null}
        </div>
      ) : null}
    </>
  )
}
```

`web/src/components/controls/DisplaySection.tsx`:

```tsx
import { useSceneStore } from '../../state/useSceneStore'
import { DisplayRow, SwitchRow } from './rows'

/**
 * 显示: renderer-specific knobs only -- a knob exists exactly where the frame's
 * renderer consumes it. Exposure stays internal (no audited tone-mapping
 * policy), fog has no consumer since D2, and Bloom carries its honesty note.
 */
export function DisplaySection() {
  const store = useSceneStore()
  const { representation } = store
  const ownsBloom = representation === 'slice' || representation === 'streamlines'
  return (
    <div className="qv-band display-section" data-control-section="display">
      {representation === 'point_cloud' ? (
        <DisplayRow control="pointSize" label="点尺寸" value={store.pointSize} min={1.5} max={7} step={0.1} onChange={store.setPointSize} />
      ) : null}
      {representation !== 'slice' ? (
        <DisplayRow
          control="opacity"
          label="透明度"
          value={Math.round(store.opacity * 100)}
          min={25}
          max={100}
          step={1}
          suffix="%"
          onChange={(value) => store.setOpacity(value / 100)}
        />
      ) : null}
      {ownsBloom ? (
        <>
          <DisplayRow
            control="bloom"
            label="Bloom 光晕"
            value={Math.round(store.bloom * 100)}
            min={0}
            max={50}
            step={1}
            suffix="%"
            onChange={(value) => store.setBloom(value / 100)}
          />
          <p className="qv-notice" data-tone="info" data-bloom-note="">
            Bloom 只是展示效果：大于 0 时屏幕颜色不再与图例色带逐字一致。
          </p>
        </>
      ) : null}
      <SwitchRow toggle="autoRotate" label="自动旋转" checked={store.autoRotate} onChange={store.setAutoRotate} />
      <SwitchRow toggle="showGrid" label="地面网格（xy 平面）" checked={store.showGrid} onChange={store.setShowGrid} />
    </div>
  )
}
```

`web/src/components/ControlPanel.tsx` — whole file (carry over any Part B hunk recorded in D1 Step 1):

```tsx
import { Atom, Layers3, RotateCcw, SlidersHorizontal, X, type LucideIcon } from 'lucide-react'
import { useRef, useState } from 'react'

import { useCatalogs } from '../state/catalogs'
import { useSceneStore } from '../state/useSceneStore'
import { ControlGroup } from './controls/ControlGroup'
import { DisplaySection } from './controls/DisplaySection'
import { RepresentationSection } from './controls/RepresentationSection'
import { StateSection } from './controls/StateSection'

export type ControlGroupId = 'state' | 'representation' | 'display'

const GROUPS: readonly { id: ControlGroupId; label: string; icon: LucideIcon }[] = [
  { id: 'state', label: '量子态', icon: Atom },
  { id: 'representation', label: '表示法', icon: Layers3 },
  { id: 'display', label: '显示', icon: SlidersHorizontal },
]

export interface ControlPanelProps {
  /** Expanded panel, or the single round "调节" button. Uncontrolled default: open. */
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

/**
 * The floating "控制" panel. `nav[aria-label=控制上下文]` survives from the old
 * context rail: its three buttons reveal (expand and scroll to) their group.
 */
export function ControlPanel({ open: controlledOpen, onOpenChange }: ControlPanelProps) {
  const [localOpen, setLocalOpen] = useState(true)
  const open = controlledOpen ?? localOpen
  const setOpen = onOpenChange ?? setLocalOpen
  const [expanded, setExpanded] = useState<Record<ControlGroupId, boolean>>({
    state: true,
    representation: true,
    display: false,
  })
  const [active, setActive] = useState<ControlGroupId>('state')
  const sections = useRef<Partial<Record<ControlGroupId, HTMLElement | null>>>({})
  const applyPreset = useSceneStore((state) => state.applyPreset)
  // The panel alone (tests, and pages without the App shell) still loads the catalogues.
  useCatalogs()

  if (!open) {
    return (
      <button
        type="button"
        className="qv-controls-fab qv-glass"
        data-chrome=""
        data-action="open-controls"
        aria-label="调节"
        title="展开控制面板"
        onClick={() => setOpen(true)}
      >
        <SlidersHorizontal size={22} aria-hidden="true" />
      </button>
    )
  }

  const reveal = (id: ControlGroupId): void => {
    setActive(id)
    setExpanded((current) => ({ ...current, [id]: true }))
    sections.current[id]?.scrollIntoView?.({ block: 'nearest' })
  }
  const toggle = (id: ControlGroupId): void => {
    setActive(id)
    setExpanded((current) => ({ ...current, [id]: !current[id] }))
  }

  return (
    <aside className="qv-controls qv-glass" data-chrome="" aria-label="控制面板">
      <div className="qv-controls-head">
        <h2>控制</h2>
        <button
          type="button"
          className="qv-icon-button"
          data-action="collapse-controls"
          aria-label="收起控制面板"
          title="收起为“调节”按钮"
          onClick={() => setOpen(false)}
        >
          <X size={18} aria-hidden="true" />
        </button>
      </div>
      <nav className="qv-context-nav" aria-label="控制上下文">
        {GROUPS.map(({ id, label }) => (
          <button type="button" key={id} aria-pressed={active === id} onClick={() => reveal(id)}>
            {label}
          </button>
        ))}
      </nav>
      <div className="qv-controls-body">
        {GROUPS.map(({ id, label, icon }) => (
          <ControlGroup
            key={id}
            id={id}
            title={label}
            icon={icon}
            expanded={expanded[id]}
            onToggle={() => toggle(id)}
            sectionRef={(node) => {
              sections.current[id] = node
            }}
            actions={
              id === 'state' ? (
                <button
                  type="button"
                  className="qv-icon-button"
                  data-action="reset-state"
                  aria-label="恢复 2p_z 默认值"
                  title="恢复 2p_z 默认值"
                  onClick={() => applyPreset({ n: 2, l: 1, m: 0, z: 1, basis: 'real' })}
                >
                  <RotateCcw size={16} aria-hidden="true" />
                </button>
              ) : undefined
            }
          >
            {id === 'state' ? (
              <StateSection />
            ) : id === 'representation' ? (
              <RepresentationSection onActivate={() => setActive('representation')} />
            ) : (
              <DisplaySection />
            )}
          </ControlGroup>
        ))}
      </div>
    </aside>
  )
}
```

`web/src/App.tsx` — `ControlContext`, `mobileOpen` and `onRequestClose` no longer exist on `ControlPanel`: until D20 rewrites the shell, replace the `ControlPanel` element (lines 189–194) with `<ControlPanel />`, delete `controlContext`/`setControlContext` (line 110) and the `openControls` helper (lines 122–127), and make the three control buttons of the mobile action bar (lines 236–264) call `setMobileSurface('controls')` (their `className`/`aria-pressed` become `mobileSurface === 'controls' ? 'active' : ''` / `mobileSurface === 'controls'`). In `App.test.tsx`, `'coordinates the mobile control sheet, detail sheet, and compact inspector trigger'` loses its control-sheet half — delete from `await press(mobileButtons[2])` down to (not including) `await press(mobileButtons[3])` (lines 314–342 at `bbe1a5e`: the `activeContext`/`mobileOpen` assertions on the mocked panel, a concept that no longer exists); its detail-sheet and focus-restore half stays until D20 replaces the whole test. The mocked `ControlPanel` (lines 29–52) may keep its now-unused props.

`web/src/lab.css` — append:

```css
/* ---- Control panel ---- */
.qv-controls {
  position: fixed;
  top: calc(var(--qv-header-h) + var(--qv-edge));
  left: var(--qv-edge);
  z-index: 10;
  display: flex;
  flex-direction: column;
  width: var(--qv-panel-w);
  max-height: calc(100dvh - var(--qv-header-h) - var(--qv-edge) - var(--qv-bottom-band));
  border-radius: var(--qv-radius-panel);
  overflow: hidden;
}
.qv-controls-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 14px 10px 6px 20px; }
.qv-controls-head h2 { font-size: 16px; font-weight: 700; }
.qv-controls-body {
  padding: 0 10px 14px;
  overflow-y: auto;
  scrollbar-color: var(--qv-border-strong) transparent;
  scrollbar-width: thin;
}
.qv-controls-fab {
  position: fixed;
  top: calc(var(--qv-header-h) + var(--qv-edge));
  left: var(--qv-edge);
  z-index: 10;
  display: grid;
  place-items: center;
  width: 48px;
  height: 48px;
  border-radius: 50%;
  color: var(--qv-text);
  cursor: pointer;
}
.qv-context-nav { display: flex; gap: 6px; padding: 0 12px 10px 20px; }
.qv-context-nav button {
  height: 28px;
  padding: 0 12px;
  border: 1px solid var(--qv-border);
  border-radius: var(--qv-radius-pill);
  background: transparent;
  color: var(--qv-text-2);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
}
.qv-context-nav button[aria-pressed="true"] { border-color: rgba(138,180,248,.6); background: rgba(138,180,248,.1); color: var(--qv-accent); }

.qv-group + .qv-group { margin-top: 6px; }
.qv-group-header { display: flex; align-items: center; gap: 4px; }
.qv-group-head {
  display: flex;
  flex: 1;
  align-items: center;
  gap: 10px;
  min-height: 44px;
  padding: 0 8px;
  border: 0;
  border-radius: 12px;
  background: transparent;
  color: var(--qv-text);
  text-align: left;
  cursor: pointer;
}
.qv-group-head:hover { background: rgba(255,255,255,.05); }
.qv-group-icon { display: grid; place-items: center; width: 28px; height: 28px; border-radius: 8px; background: rgba(138,180,248,.12); color: var(--qv-accent); }
.qv-group-title { flex: 1; font-size: 15px; font-weight: 700; }
.qv-group-chevron { color: var(--qv-text-3); transition: transform .15s ease; }
.qv-group-head[aria-expanded="true"] .qv-group-chevron { transform: rotate(180deg); }
.qv-group-body { display: grid; gap: 8px; padding: 4px 0 8px; }
.qv-band { display: grid; gap: 2px; padding: 8px; border-radius: 16px; background: var(--qv-band); }
.qv-subhead { padding: 4px 8px 6px; color: var(--qv-text-3); font-size: 12px; font-weight: 500; }
.qv-empty { padding: 6px 8px; color: var(--qv-text-3); font-size: 12px; }

.qv-option-row {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  min-height: 40px;
  padding: 6px 8px;
  border: 0;
  border-radius: 10px;
  background: transparent;
  color: var(--qv-text);
  font-size: 14px;
  text-align: left;
  cursor: pointer;
}
.qv-option-row:hover { background: rgba(255,255,255,.06); }
.qv-option-icon { flex: 0 0 auto; color: var(--qv-text-2); }
.qv-option-text { display: grid; flex: 1; min-width: 0; }
.qv-option-label { font-weight: 500; }
.qv-option-note { color: var(--qv-text-3); font-size: 12px; line-height: 1.35; }
.qv-radio { position: relative; flex: 0 0 auto; width: 18px; height: 18px; border: 2px solid var(--qv-text-3); border-radius: 50%; }
.qv-option-row[aria-pressed="true"] .qv-radio { border-color: var(--qv-accent); }
.qv-option-row[aria-pressed="true"] .qv-radio::after { content: ""; position: absolute; inset: 3px; border-radius: 50%; background: var(--qv-accent); }
.qv-option-row[data-unavailable="true"] { color: var(--qv-text-3); cursor: help; }
.qv-option-row[data-unavailable="true"] .qv-radio { border-style: dashed; }
.qv-tag {
  flex: 0 0 auto;
  padding: 0 6px;
  border: 1px solid var(--qv-border-strong);
  border-radius: var(--qv-radius-tag);
  color: var(--qv-text-2);
  font-size: 10px;
  font-weight: 500;
  line-height: 16px;
  white-space: nowrap;
}
.qv-tag[data-tone="warn"] { border-color: rgba(253,214,99,.5); color: var(--qv-warn); }

.qv-param-row { display: grid; grid-template-columns: 76px minmax(0, 1fr) 60px; align-items: center; gap: 10px; min-height: 36px; padding: 0 8px; }
.qv-param-label { color: var(--qv-text-2); font-size: 13px; }
.qv-param-value { color: var(--qv-text); font-size: 12px; text-align: right; }
.qv-param-row output { grid-column: 2 / -1; justify-self: end; color: var(--qv-text); font-size: 13px; }
.qv-choice-row { display: grid; grid-template-columns: 76px minmax(0, 1fr); align-items: center; gap: 10px; min-height: 36px; padding: 0 8px; }
.qv-chips { display: flex; flex-wrap: wrap; gap: 4px; }
.qv-chips button {
  min-width: 40px;
  height: 28px;
  padding: 0 10px;
  border: 1px solid var(--qv-border);
  border-radius: var(--qv-radius-pill);
  background: transparent;
  color: var(--qv-text-2);
  font-size: 12px;
  cursor: pointer;
}
.qv-chips button.active { border-color: var(--qv-accent); background: rgba(138,180,248,.12); color: var(--qv-accent); }

.qv-switch-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  min-height: 40px;
  padding: 0 8px;
  border: 0;
  border-radius: 10px;
  background: transparent;
  color: var(--qv-text);
  font-size: 14px;
  cursor: pointer;
}
.qv-switch-row:hover { background: rgba(255,255,255,.06); }
.qv-switch { position: relative; width: 36px; height: 20px; border-radius: 10px; background: rgba(255,255,255,.2); transition: background-color .15s ease; }
.qv-switch::after { content: ""; position: absolute; top: 3px; left: 3px; width: 14px; height: 14px; border-radius: 50%; background: #fff; transition: transform .15s ease; }
.qv-switch-row[aria-checked="true"] .qv-switch { background: var(--qv-accent-strong); }
.qv-switch-row[aria-checked="true"] .qv-switch::after { transform: translateX(16px); }

.qv-expander {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  min-height: 36px;
  padding: 0 8px;
  border: 0;
  background: transparent;
  color: var(--qv-text-2);
  font-size: 13px;
  text-align: left;
  cursor: pointer;
}
.qv-expander svg { transition: transform .15s ease; }
.qv-expander[aria-expanded="true"] svg { transform: rotate(90deg); }
.qv-expander-summary { margin-left: auto; color: var(--qv-text-3); font-size: 12px; }
.qv-quantum-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; padding: 4px 8px 8px; }
.qv-quantum-grid label { display: grid; gap: 4px; color: var(--qv-text-3); font-size: 12px; }
.qv-quantum-grid select,
.qv-quantum-grid input,
.qv-quantum-grid output {
  width: 100%;
  height: 34px;
  padding: 0 8px;
  border: 1px solid var(--qv-border);
  border-radius: 8px;
  background: rgba(0,0,0,.35);
  color: var(--qv-text);
  line-height: 32px;
}
.qv-basis-row { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; padding: 0 8px 4px; }
.qv-basis-row button {
  min-height: 32px;
  border: 1px solid var(--qv-border);
  border-radius: var(--qv-radius-pill);
  background: transparent;
  color: var(--qv-text-2);
  font-size: 12px;
  cursor: pointer;
}
.qv-basis-row button[aria-pressed="true"] { border-color: var(--qv-accent); background: rgba(138,180,248,.12); color: var(--qv-accent); }
.qv-readout { display: grid; grid-template-columns: repeat(auto-fit, minmax(72px, 1fr)); gap: 6px; padding: 4px 8px; }
.qv-readout div { padding: 6px 8px; border-radius: 8px; background: rgba(0,0,0,.25); }
.qv-readout dt { color: var(--qv-text-3); font-size: 11px; }
.qv-readout dd { margin: 2px 0 0; color: var(--qv-text); font-size: 13px; }
.qv-notice {
  margin: 2px 8px;
  padding: 8px 10px;
  border-left: 2px solid var(--qv-warn);
  border-radius: 0 8px 8px 0;
  background: rgba(253,214,99,.08);
  color: var(--qv-text-2);
  font-size: 12px;
  line-height: 1.5;
}
.qv-notice[data-tone="info"] { border-left-color: var(--qv-accent); background: rgba(138,180,248,.08); }
.qv-action-row {
  display: flex;
  align-items: center;
  gap: 8px;
  width: calc(100% - 16px);
  min-height: 36px;
  margin: 2px 8px;
  padding: 0 12px;
  border: 1px solid rgba(138,180,248,.5);
  border-radius: var(--qv-radius-pill);
  background: rgba(138,180,248,.1);
  color: var(--qv-accent);
  font-size: 13px;
  cursor: pointer;
}
.qv-icon-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-width: 40px;
  height: 40px;
  padding: 0 10px;
  border: 0;
  border-radius: var(--qv-radius-pill);
  background: transparent;
  color: var(--qv-text-2);
  text-decoration: none;
  cursor: pointer;
  transition: background-color .15s ease, color .15s ease;
}
.qv-icon-button:hover { background: rgba(255,255,255,.08); color: var(--qv-text); text-decoration: none; }

@media (max-width: 820px) {
  .qv-controls {
    top: auto;
    right: 0;
    bottom: 0;
    left: 0;
    width: auto;
    height: var(--qv-drawer-h);
    max-height: none;
    border-radius: 24px 24px 0 0;
  }
  .qv-controls-fab { top: auto; bottom: var(--qv-edge); left: var(--qv-edge); }
}
```

`web/coverage-scope.json` — insert into both arrays (sorted positions): `"src/components/controls/ControlGroup.tsx"`, `"src/components/controls/DisplaySection.tsx"`, `"src/components/controls/RepresentationSection.tsx"`, `"src/components/controls/StateSection.tsx"`, `"src/components/controls/rows.tsx"` directly after `"src/components/WebGLGate.tsx"` if it exists, otherwise directly after `"src/components/TimePill.tsx"` (upper-case names sort before `controls/`), and `"src/components/stateIndex.ts"` directly after `"src/components/sceneStatus.ts"`.

- [ ] **Step 4: Run and see them pass.**

Run: `npm --prefix web run test:watch -- run src/components/controls/rows.test.tsx src/components/stateIndex.test.ts src/components/ControlPanel.test.tsx src/App.test.tsx src/guards.test.ts`
Expected: PASS — every unchanged matrix/sabotage/flow/readout case, every rewritten selector, and both A11 mixture cases (`'opens a mixture on the representation its catalogue entry publishes'` now pressing `button[data-mixture="ring"]` and ending on `/api/superposition/slice`; `'records the selected mixture default …'`). `npm --prefix web run typecheck` → exit 0.

- [ ] **Step 5: Pre-commit gate, then commit.** Both gate commands must exit 0 — `test` runs all five stages (clean-coverage, `tsc -p tsconfig.test.json`, vitest with per-file 90/85/90/90, `assert-no-skips`, `assert-coverage-scope`); a failure is fixed inside this task before committing.

```powershell
npm --prefix web run test
npm --prefix web run typecheck
git add web/src/components/controls web/src/components/stateIndex.ts web/src/components/stateIndex.test.ts web/src/components/ControlPanel.tsx web/src/components/ControlPanel.test.tsx web/src/App.tsx web/src/App.test.tsx web/src/lab.css web/coverage-scope.json
git commit -m "feat(web): rebuild the control panel as collapsible Weather-Lab groups" -m "Claude-Session: https://claude.ai/code/session_01E44DEzsc7Av26fc7nZ5rSo"
```

### Task D12: Status chip, error boundary, WebGL-unavailable message

**Files:**
- Create: `web/src/components/StatusChip.tsx`, `web/src/components/StatusChip.test.tsx`, `web/src/components/ErrorBoundary.tsx`, `web/src/components/ErrorBoundary.test.tsx`, `web/src/components/WebGLGate.tsx`, `web/src/components/WebGLGate.test.tsx`
- Modify: `web/src/App.tsx:13-14,48-105,201,278` (status line moves out; scene wrapped), `web/src/App.test.tsx:5,83-91,155-245` (StatusBar specs move) + one mock, `web/src/lab.css` (append), `web/coverage-scope.json`

**Interfaces:**
- Produces:
  - `src/components/StatusChip.tsx`: `export type StatusKind = 'error' | 'unavailable' | 'loading' | 'refreshing' | 'ready'`; `export function statusLine(status: SceneStatus): { kind: StatusKind; text: string }` (moved verbatim from `App.tsx:59-87`); `export function StatusChip(props: { status: SceneStatus })` → `div.qv-status-chip[data-chrome][title]` › `span[data-status]`.
  - `src/components/ErrorBoundary.tsx`: `export function asError(value: unknown): Error`; `export function reloadPage(target?: Pick<Location, 'reload'>): void`; `export class ErrorBoundary extends Component<{ children: ReactNode; fallback: (error: Error, reset: () => void) => ReactNode; onError?: (error: Error, info: ErrorInfo) => void }>`; `export function LabFailure(props: { title: string; error: Error; onRetry?: () => void; onReload?: () => void })` → `div.qv-fallback[role=alert][data-chrome]`.
  - `src/components/WebGLGate.tsx`: `export function detectWebGL(create?: () => HTMLCanvasElement): boolean`; `export function WebGLGate(props: { children: ReactNode; probe?: () => boolean })` → children, or `div.qv-fallback[role=alert][data-webgl-unavailable][data-chrome]`.
  - Consumes: `runtimeMode()` (Part B), `representationLabel` (`sceneStatus.ts`).

- [ ] **Step 1: Write the failing tests.**

`web/src/components/StatusChip.test.tsx` — the seven `StatusBar` cases move here from `App.test.tsx:155-245` with the same statuses and the same `toContain`/`not.toContain` strings (semantic pins: five-case precedence, both times while refreshing), now mounting `StatusChip`; plus two new cases:

```ts
/** @vitest-environment jsdom */
import { createElement } from 'react'
import { describe, expect, it } from 'vitest'

import type { SceneStatus } from '../api/types'
import { mount, type MountedTree } from '../test/mount'
import { StatusChip, statusLine } from './StatusChip'

async function chip(status: SceneStatus): Promise<MountedTree> {
  return mount(createElement(StatusChip, { status }))
}

function line(tree: MountedTree): HTMLElement {
  const node = tree.container.querySelector<HTMLElement>('[data-status]')
  if (node === null) throw new Error('the status chip reports no status at all')
  return node
}

describe('StatusChip says which frame the numbers describe', () => {
  it('names the rendered time AND the in-flight time while refreshing', async () => {
    const tree = await chip({
      loading: false,
      refreshing: true,
      renderedTimeAu: 3.6,
      timeAu: 9.0,
      triangleCount: 4096,
    })
    try {
      expect(line(tree).dataset.status).toBe('refreshing')
      expect(line(tree).textContent).toContain('正在显示 t=3.6 a.u.')
      expect(line(tree).textContent).toContain('正在计算 t=9.0 a.u.')
      // The unqualified ready text would present the OLD frame's diagnostics
      // as the current ones.
      expect(line(tree).textContent).not.toContain('科学资产已就绪')
    } finally {
      await tree.unmount()
    }
  })

  it('still says a stale frame is stale when it does not know the frame time', async () => {
    const tree = await chip({ loading: false, refreshing: true, timeAu: 9 })
    try {
      expect(line(tree).dataset.status).toBe('refreshing')
      expect(line(tree).textContent).toContain('正在计算 t=9.0 a.u.')
      expect(line(tree).textContent).not.toContain('科学资产已就绪')
    } finally {
      await tree.unmount()
    }
  })

  it('names the frame on screen even when the requested time is missing', async () => {
    const tree = await chip({ loading: false, refreshing: true, renderedTimeAu: 3.6 })
    try {
      expect(line(tree).dataset.status).toBe('refreshing')
      expect(line(tree).textContent).toContain('正在显示 t=3.6 a.u.')
      expect(line(tree).textContent).toContain('正在计算下一帧')
    } finally {
      await tree.unmount()
    }
  })

  it('reports a standing refusal with its kind and its reason, not as an error', async () => {
    const reason = 'No route samples a time-dependent state as a point cloud.'
    const tree = await chip({ loading: false, unavailable: { kind: 'point_cloud', reason } })
    try {
      expect(line(tree).dataset.status).toBe('unavailable')
      expect(line(tree).textContent).toContain('电子云暂不可用')
      expect(line(tree).textContent).not.toContain('point_cloud 暂不可用')
      expect(line(tree).textContent).toContain(reason)
      expect(line(tree).textContent).not.toContain('场景错误')
      expect(line(tree).textContent).not.toContain('科学资产已就绪')
    } finally {
      await tree.unmount()
    }
  })

  it('reports an error with the message, not just the word', async () => {
    const tree = await chip({ loading: false, error: 'HTTP 422 from /api/orbitals/isosurface' })
    try {
      expect(line(tree).dataset.status).toBe('error')
      expect(line(tree).textContent).toContain('HTTP 422 from /api/orbitals/isosurface')
    } finally {
      await tree.unmount()
    }
  })

  it('says computing while there is nothing on screen', async () => {
    const tree = await chip({ loading: true })
    try {
      expect(line(tree).dataset.status).toBe('loading')
      expect(line(tree).textContent).toContain('正在计算')
    } finally {
      await tree.unmount()
    }
  })

  it('says the asset is ready only when it is the current one', async () => {
    const tree = await chip({ loading: false, renderedTimeAu: 12, pointCount: 28000 })
    try {
      expect(line(tree).dataset.status).toBe('ready')
      expect(line(tree).textContent).toContain('科学资产已就绪')
    } finally {
      await tree.unmount()
    }
  })

  it('floats as chrome and carries the full text as a tooltip', async () => {
    const reason = 'a long refusal reason that the chip may have to truncate on a phone'
    const tree = await chip({ loading: false, unavailable: { kind: 'isosurface', reason } })
    try {
      const root = tree.container.querySelector<HTMLElement>('.qv-status-chip')
      expect(root?.hasAttribute('data-chrome')).toBe(true)
      expect(root?.title).toBe(`等密度面暂不可用 · ${reason}`)
      expect(root?.querySelector('.qv-status-dot')?.getAttribute('data-kind')).toBe('unavailable')
    } finally {
      await tree.unmount()
    }
  })
})

describe('statusLine precedence', () => {
  it('ranks error > unavailable > loading > refreshing > ready', () => {
    const all: SceneStatus = {
      loading: true,
      refreshing: true,
      error: 'boom',
      unavailable: { kind: 'slice', reason: 'no' },
    }
    expect(statusLine(all).kind).toBe('error')
    expect(statusLine({ ...all, error: undefined }).kind).toBe('unavailable')
    expect(statusLine({ ...all, error: undefined, unavailable: undefined }).kind).toBe('loading')
    expect(statusLine({ loading: false, refreshing: true }).kind).toBe('refreshing')
    expect(statusLine({ loading: false }).kind).toBe('ready')
    expect(statusLine({ loading: false, refreshing: true }).text).toBe('正在显示上一帧 · 正在计算下一帧')
  })
})
```

`web/src/components/ErrorBoundary.test.tsx`:

```ts
/** @vitest-environment jsdom */
import { act, createElement } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { mount } from '../test/mount'
import { asError, ErrorBoundary, LabFailure, reloadPage } from './ErrorBoundary'

const bomb = { armed: true }

function Bomb() {
  if (bomb.armed) throw new Error('shader failed to compile')
  return createElement('p', { 'data-recovered': '' }, 'recovered')
}

function StringBomb(): null {
  throw 'a bare string'
}

beforeEach(() => {
  bomb.armed = true
  // React reports every caught render error on console.error; silence it here.
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
})

afterEach(() => {
  vi.restoreAllMocks()
})

async function click(element: Element | null): Promise<void> {
  const scope = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  scope.IS_REACT_ACT_ENVIRONMENT = true
  try {
    await act(async () => (element as HTMLElement).click())
  } finally {
    delete scope.IS_REACT_ACT_ENVIRONMENT
  }
}

describe('ErrorBoundary', () => {
  it('renders its children when nothing throws', async () => {
    bomb.armed = false
    const tree = await mount(
      createElement(ErrorBoundary, { fallback: () => createElement('p', null, 'fallback') }, createElement(Bomb)),
    )
    try {
      expect(tree.container.querySelector('[data-recovered]')).not.toBeNull()
    } finally {
      await tree.unmount()
    }
  })

  it('replaces a crashed subtree with a readable failure, reports it, and can retry', async () => {
    const onError = vi.fn()
    const onReload = vi.fn()
    const tree = await mount(
      createElement(
        ErrorBoundary,
        {
          onError,
          fallback: (error: Error, reset: () => void) =>
            createElement(LabFailure, { title: '三维场景无法显示', error, onRetry: reset, onReload }),
        },
        createElement(Bomb),
      ),
    )
    try {
      const alert = tree.container.querySelector('[role="alert"]')
      expect(alert?.hasAttribute('data-chrome')).toBe(true)
      expect(alert?.textContent).toContain('三维场景无法显示')
      expect(alert?.textContent).toContain('shader failed to compile')
      expect(onError).toHaveBeenCalledOnce()
      expect(onError.mock.calls[0][0]).toBeInstanceOf(Error)

      const buttons = Array.from(tree.container.querySelectorAll('button'))
      expect(buttons.map((button) => button.textContent)).toEqual(['重试', '重新载入页面'])
      await click(buttons[1])
      expect(onReload).toHaveBeenCalledOnce()

      bomb.armed = false
      await click(buttons[0])
      expect(tree.container.querySelector('[data-recovered]')).not.toBeNull()
    } finally {
      await tree.unmount()
    }
  })

  it('turns a thrown non-Error into an Error with its text', async () => {
    const tree = await mount(
      createElement(
        ErrorBoundary,
        { fallback: (error: Error) => createElement(LabFailure, { title: '实验室遇到错误', error }) },
        createElement(StringBomb),
      ),
    )
    try {
      expect(tree.container.textContent).toContain('a bare string')
      // No retry offered when there is nothing to retry.
      expect(Array.from(tree.container.querySelectorAll('button')).map((button) => button.textContent)).toEqual([
        '重新载入页面',
      ])
    } finally {
      await tree.unmount()
    }
  })
})

describe('asError / reloadPage', () => {
  it('keeps Errors and wraps everything else', () => {
    const error = new Error('x')
    expect(asError(error)).toBe(error)
    expect(asError(42).message).toBe('42')
  })

  it('reloads the location it is given', () => {
    const target = { reload: vi.fn() }
    reloadPage(target)
    expect(target.reload).toHaveBeenCalledOnce()
  })
})
```

`web/src/components/WebGLGate.test.tsx`:

```ts
/** @vitest-environment jsdom */
import { createElement } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { mount } from '../test/mount'
import { detectWebGL, WebGLGate } from './WebGLGate'

const runtime = vi.hoisted(() => ({ current: 'live' as 'live' | 'static' }))
vi.mock('../api/runtimeMode', () => ({ runtimeMode: () => runtime.current }))

afterEach(() => {
  runtime.current = 'live'
  vi.restoreAllMocks()
})

const fakeCanvas = (getContext: (kind: string) => unknown): HTMLCanvasElement =>
  ({ getContext }) as unknown as HTMLCanvasElement

describe('detectWebGL', () => {
  it('accepts WebGL2 and releases the probe context at once', () => {
    const loseContext = vi.fn()
    const context = { getExtension: () => ({ loseContext }) }
    expect(detectWebGL(() => fakeCanvas((kind) => (kind === 'webgl2' ? context : null)))).toBe(true)
    expect(loseContext).toHaveBeenCalledOnce()
  })

  it('falls back to WebGL1, with or without the lose-context extension', () => {
    const context = { getExtension: () => null }
    expect(detectWebGL(() => fakeCanvas((kind) => (kind === 'webgl' ? context : null)))).toBe(true)
  })

  it('reports no WebGL when neither context exists or the probe throws', () => {
    expect(detectWebGL(() => fakeCanvas(() => null))).toBe(false)
    expect(
      detectWebGL(() =>
        fakeCanvas(() => {
          throw new Error('blocked by policy')
        }),
      ),
    ).toBe(false)
  })

  it('probes with a detached canvas: the document keeps exactly its scene canvas', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
    expect(detectWebGL()).toBe(false)
    expect(document.querySelectorAll('canvas')).toHaveLength(0)
  })
})

describe('WebGLGate', () => {
  it('renders the scene when WebGL is available', async () => {
    const tree = await mount(
      createElement(WebGLGate, { probe: () => true }, createElement('p', { 'data-scene': '' })),
    )
    try {
      expect(tree.container.querySelector('[data-scene]')).not.toBeNull()
      expect(tree.container.querySelector('[data-webgl-unavailable]')).toBeNull()
    } finally {
      await tree.unmount()
    }
  })

  it('says why the scene is missing instead of leaving a blank page', async () => {
    const tree = await mount(
      createElement(WebGLGate, { probe: () => false }, createElement('p', { 'data-scene': '' })),
    )
    try {
      const alert = tree.container.querySelector('[data-webgl-unavailable]')
      expect(alert?.getAttribute('role')).toBe('alert')
      expect(alert?.hasAttribute('data-chrome')).toBe(true)
      expect(alert?.textContent).toContain('此设备无法创建 WebGL 画布')
      expect(tree.container.querySelector('[data-scene]')).toBeNull()
      expect(tree.container.querySelector('a')).toBeNull()
    } finally {
      await tree.unmount()
    }
  })

  it('points a static-build reader at the textbook instead', async () => {
    runtime.current = 'static'
    const tree = await mount(createElement(WebGLGate, { probe: () => false }, null))
    try {
      const link = tree.container.querySelector('a')
      expect(link?.getAttribute('href')).toBe('./learn/')
      expect(link?.textContent).toBe('改为阅读教材')
    } finally {
      await tree.unmount()
    }
  })
})
```

`web/src/App.test.tsx` — change line 5 to `import App from './App'`; delete the `statusBar`/`line` helpers (lines 83–91) and the whole `describe('StatusBar says which frame the numbers describe')` (lines 155–245, now in `StatusChip.test.tsx`); add, after the catalogue mock:

```ts
vi.mock('./components/WebGLGate', () => ({
  WebGLGate: ({ children }: { children: ReactNode }) => children,
}))
```

(add `type ReactNode` to the `react` import).

- [ ] **Step 2: Run and see them fail.**

Run: `npm --prefix web run test:watch -- run src/components/StatusChip.test.tsx src/components/ErrorBoundary.test.tsx src/components/WebGLGate.test.tsx`
Expected: FAIL — the three modules do not exist.

- [ ] **Step 3: Implement.**

`web/src/components/StatusChip.tsx`:

```tsx
import type { SceneStatus } from '../api/types'
import { representationLabel } from './sceneStatus'

export type StatusKind = 'error' | 'unavailable' | 'loading' | 'refreshing' | 'ready'

/** A clock reading, always with its unit and always to the same precision. */
const timeText = (timeAu: number): string => `t=${timeAu.toFixed(1)} a.u.`

/**
 * What the status chip says (moved verbatim from App.tsx's StatusBar).
 *
 * Ordered by how much each case invalidates: an error and a standing refusal
 * both mean the numbers elsewhere are not about a current frame, `loading`
 * means there is no frame, `refreshing` means the frame is the previous one.
 * Only the last case may say the asset is ready.
 */
export function statusLine(status: SceneStatus): { kind: StatusKind; text: string } {
  if (status.error !== undefined) {
    return { kind: 'error', text: `场景错误 · ${status.error}` }
  }
  if (status.unavailable !== undefined) {
    return {
      kind: 'unavailable',
      text: `${representationLabel(status.unavailable.kind)}暂不可用 · ${status.unavailable.reason}`,
    }
  }
  if (status.loading) {
    return { kind: 'loading', text: '正在计算' }
  }
  if (status.refreshing === true) {
    // Both times, always: the frame on screen and the one on its way.
    const showing =
      status.renderedTimeAu !== undefined
        ? `正在显示 ${timeText(status.renderedTimeAu)}`
        : '正在显示上一帧'
    const computing =
      status.timeAu !== undefined ? `正在计算 ${timeText(status.timeAu)}` : '正在计算下一帧'
    return { kind: 'refreshing', text: `${showing} · ${computing}` }
  }
  return { kind: 'ready', text: '科学资产已就绪' }
}

/** The floating status chip; `span[data-status]` is what every e2e suite waits on. */
export function StatusChip({ status }: { status: SceneStatus }) {
  const { kind, text } = statusLine(status)
  return (
    <div className="qv-status-chip" data-chrome="" title={text}>
      <span data-status={kind}>
        <i className="qv-status-dot" data-kind={kind} aria-hidden="true" /> {text}
      </span>
    </div>
  )
}
```

`web/src/components/ErrorBoundary.tsx`:

```tsx
import { Component, type ErrorInfo, type ReactNode } from 'react'

/** Anything thrown, as an Error with readable text. */
export function asError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value))
}

/** Reload the page (injectable so the button can be tested without navigating). */
export function reloadPage(target: Pick<Location, 'reload'> = window.location): void {
  target.reload()
}

export interface ErrorBoundaryProps {
  children: ReactNode
  fallback: (error: Error, reset: () => void) => ReactNode
  onError?: (error: Error, info: ErrorInfo) => void
}

interface ErrorBoundaryState {
  error: Error | null
}

/**
 * A render error below this point becomes a readable message instead of a
 * blank page -- textbook embeds are often opened on locked-down machines.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    return { error: asError(error) }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    this.props.onError?.(error, info)
  }

  reset = (): void => {
    this.setState({ error: null })
  }

  render(): ReactNode {
    return this.state.error === null
      ? this.props.children
      : this.props.fallback(this.state.error, this.reset)
  }
}

/** The failure screen: what failed, the error text, and a way out. */
export function LabFailure({
  title,
  error,
  onRetry,
  onReload = reloadPage,
}: {
  title: string
  error: Error
  onRetry?: () => void
  onReload?: () => void
}) {
  return (
    <div className="qv-fallback" role="alert" data-chrome="">
      <h1>{title}</h1>
      <p>{error.message}</p>
      <div className="qv-fallback-actions">
        {onRetry === undefined ? null : (
          <button type="button" onClick={onRetry}>
            重试
          </button>
        )}
        <button type="button" onClick={() => onReload()}>
          重新载入页面
        </button>
      </div>
    </div>
  )
}
```

`web/src/components/WebGLGate.tsx`:

```tsx
import { useState, type ReactNode } from 'react'

import { runtimeMode } from '../api/runtimeMode'

/**
 * Can this browser create a WebGL context at all? Probed on a DETACHED canvas
 * (the document keeps exactly one canvas, the scene's), and the probe context
 * is released at once so it does not count against the browser's context cap.
 */
export function detectWebGL(
  create: () => HTMLCanvasElement = () => document.createElement('canvas'),
): boolean {
  try {
    const canvas = create()
    const context = canvas.getContext('webgl2') ?? canvas.getContext('webgl')
    if (context === null) return false
    context.getExtension('WEBGL_lose_context')?.loseContext()
    return true
  } catch {
    return false
  }
}

/** The scene, or a readable reason there is none. Probed once per mount. */
export function WebGLGate({
  children,
  probe = detectWebGL,
}: {
  children: ReactNode
  probe?: () => boolean
}) {
  const [supported] = useState(probe)
  if (supported) return <>{children}</>
  return (
    <div className="qv-fallback" role="alert" data-webgl-unavailable="" data-chrome="">
      <h1>此设备无法创建 WebGL 画布</h1>
      <p>
        三维实验室需要 WebGL。请在浏览器设置中开启硬件加速，或换用最新版 Chrome、Edge、Firefox 或 Safari。
      </p>
      {runtimeMode() === 'static' ? (
        <p>
          <a href="./learn/">改为阅读教材</a>
        </p>
      ) : null}
    </div>
  )
}
```

`web/src/App.tsx`:
- delete `timeText`, `statusLine` and `StatusBar` (lines 13–14 and 48–105) — now in `StatusChip.tsx`; import `StatusChip`, `ErrorBoundary`, `LabFailure`, `WebGLGate`.
- line 201 becomes:

```tsx
          <ErrorBoundary
            fallback={(error, reset) => (
              <LabFailure title="三维场景无法显示" error={error} onRetry={reset} />
            )}
          >
            <WebGLGate>
              <OrbitalCanvas onStatus={handleStatus} />
            </WebGLGate>
          </ErrorBoundary>
```

- line 278 `<StatusBar status={status} />` → `<StatusChip status={status} />`.

`web/src/lab.css` — append:

```css
/* ---- Status chip ---- */
.qv-status-chip {
  position: fixed;
  top: 12px;
  left: 50%;
  z-index: 21;
  display: flex;
  align-items: center;
  max-width: min(460px, calc(100vw - 760px));
  height: 32px;
  padding: 0 14px;
  border: 1px solid var(--qv-border);
  border-radius: var(--qv-radius-pill);
  background: rgba(255,255,255,.04);
  color: var(--qv-text-2);
  font-size: 12px;
  transform: translateX(-50%);
}
.qv-status-chip [data-status] { display: flex; align-items: center; gap: 8px; min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.qv-status-dot { flex: 0 0 auto; width: 8px; height: 8px; border-radius: 50%; background: var(--qv-ok); }
.qv-status-dot[data-kind="loading"],
.qv-status-dot[data-kind="refreshing"] { background: var(--qv-warn); animation: qv-pulse 1s ease-in-out infinite alternate; }
.qv-status-dot[data-kind="unavailable"],
.qv-status-dot[data-kind="error"] { background: var(--qv-danger); }
@keyframes qv-pulse { to { opacity: .35; } }
.qv-app[data-embed="true"] .qv-status-chip { left: 12px; max-width: calc(100vw - 220px); background: var(--qv-glass); transform: none; }

@media (max-width: 1180px) {
  .qv-status-chip { max-width: min(360px, calc(100vw - 560px)); }
}
@media (max-width: 820px) {
  .qv-status-chip {
    top: calc(var(--qv-header-h) + 8px);
    left: var(--qv-edge);
    max-width: calc(100vw - 132px);
    height: 30px;
    background: var(--qv-glass);
    backdrop-filter: var(--qv-blur);
    transform: none;
  }
}
```

`web/coverage-scope.json` — insert into both arrays: `"src/components/ErrorBoundary.tsx"` directly before `"src/components/Header.tsx"`; `"src/components/StatusChip.tsx"` directly after `"src/components/OrbitalCanvas.tsx"` (before `TimePill.tsx`); `"src/components/WebGLGate.tsx"` directly after `"src/components/TimePill.tsx"`.

- [ ] **Step 4: Run and see them pass.**

Run: `npm --prefix web run test:watch -- run src/components/StatusChip.test.tsx src/components/ErrorBoundary.test.tsx src/components/WebGLGate.test.tsx src/App.test.tsx src/guards.test.ts`
Expected: PASS. `npm --prefix web run typecheck` → exit 0.

- [ ] **Step 5: Pre-commit gate, then commit.** Both gate commands must exit 0 — `test` runs all five stages (clean-coverage, `tsc -p tsconfig.test.json`, vitest with per-file 90/85/90/90, `assert-no-skips`, `assert-coverage-scope`); a failure is fixed inside this task before committing.

```powershell
npm --prefix web run test
npm --prefix web run typecheck
git add web/src/components/StatusChip.tsx web/src/components/StatusChip.test.tsx web/src/components/ErrorBoundary.tsx web/src/components/ErrorBoundary.test.tsx web/src/components/WebGLGate.tsx web/src/components/WebGLGate.test.tsx web/src/App.tsx web/src/App.test.tsx web/src/lab.css web/coverage-scope.json
git commit -m "feat(web): status chip, error boundary and a WebGL-unavailable message" -m "Claude-Session: https://claude.ai/code/session_01E44DEzsc7Av26fc7nZ5rSo"
```

### Task D13: Glass header — runtime pill, textbook/OpenAPI, copy link, save image, guide, GitHub

**Files:**
- Modify: `web/src/components/Header.tsx` (whole file), `web/src/components/Header.test.tsx` (whole file), `web/src/App.tsx:187` (`<Header />`), `web/src/App.test.tsx:247-304` (label-routing case removed), `web/src/lab.css` (append)

**Interfaces:**
- Consumes: `runtimeMode()` (Part B); `captureSceneCanvas()` (D6).
- Produces: `export const REPOSITORY_URL = 'https://github.com/longwarriors/Atmoic-quantum-visualization'`; `export const TOAST_MS = 2400`; `export function Header(props: { onOpenGuide?: () => void })` → `header.qv-header[data-chrome]`, runtime pill `.qv-pill-tag[data-runtime]`, static link `a[aria-label=教材][href="./learn/"]` or live link `a[aria-label="查看 OpenAPI"][href="/docs"][target=_blank][rel=noreferrer]`, `button[data-action="copy-link"|"save-image"|"open-guide"]`, `a[aria-label="GitHub 仓库"]`, toast `p.qv-toast[role=status][data-chrome]`.

The old Header's state read-out (`.topbar-context-value`, `.topbar-context-compact`) and subtitle are removed (spec §4.4 header = brand + pill + icons). `App.test.tsx:247-304` ("routes the arrived … label into the compact header") tested only that read-out and is deleted; the arrived label is shown as the detail panel's `h2` (pinned by `Inspector.test.tsx` and, from D21, by `fullstack-e2e/app.spec.ts`).

- [ ] **Step 1: Write the failing test.** `web/src/components/Header.test.tsx` — whole file:

```ts
/** @vitest-environment jsdom */
import { act, createElement } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { mount, type MountedTree } from '../test/mount'
import { Header, REPOSITORY_URL, TOAST_MS } from './Header'

const runtime = vi.hoisted(() => ({ current: 'live' as 'live' | 'static' }))
vi.mock('../api/runtimeMode', () => ({ runtimeMode: () => runtime.current }))

/**
 * jsdom has no canvas backend, so `toDataURL` does not exist; the stub lets
 * the capture path run and is removed afterwards.
 */
const DATA_URL = 'data:image/png;base64,QUJD'
const canvasPrototype = HTMLCanvasElement.prototype as unknown as {
  toDataURL?: (type?: string) => string
}
let clicked: HTMLAnchorElement[] = []

beforeEach(() => {
  runtime.current = 'live'
  clicked = []
  canvasPrototype.toDataURL = () => DATA_URL
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    clicked.push(this)
  })
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  delete canvasPrototype.toDataURL
  delete (navigator as { clipboard?: unknown }).clipboard
  document.querySelectorAll('canvas, #quviz-scene').forEach((node) => node.remove())
})

async function interact(body: () => void | Promise<void>): Promise<void> {
  const scope = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  scope.IS_REACT_ACT_ENVIRONMENT = true
  try {
    await act(async () => {
      await body()
    })
  } finally {
    delete scope.IS_REACT_ACT_ENVIRONMENT
  }
}

const header = (onOpenGuide?: () => void): Promise<MountedTree> =>
  mount(createElement(Header, { onOpenGuide }))
const action = (tree: MountedTree, name: string): HTMLButtonElement => {
  const button = tree.container.querySelector<HTMLButtonElement>(`button[data-action="${name}"]`)
  if (button === null) throw new Error(`the header offers no ${name} action`)
  return button
}
const toast = (tree: MountedTree): string | null =>
  tree.container.querySelector('.qv-toast[role="status"]')?.textContent ?? null

describe('Header capture', () => {
  it('saves the scene canvas, not whichever canvas comes first', async () => {
    const decoy = document.createElement('canvas')
    Object.defineProperty(decoy, 'toDataURL', { value: () => 'data:image/png;base64,REVDT1k=' })
    document.body.appendChild(decoy)
    const host = document.createElement('div')
    host.id = 'quviz-scene'
    host.appendChild(document.createElement('canvas'))
    document.body.appendChild(host)
    const tree = await header()
    try {
      await interact(() => action(tree, 'save-image').click())
      expect(clicked).toHaveLength(1)
      expect(clicked[0].href).toBe(DATA_URL)
      expect(clicked[0].download).toMatch(/^quviz-[^:]*\.png$/)
      expect(toast(tree)).toBe('图像已保存')
      expect(action(tree, 'save-image').getAttribute('aria-label')).toBe('保存图像')
    } finally {
      await tree.unmount()
    }
  })

  it('says it cannot save before the scene exists, and raises nothing', async () => {
    const raised: unknown[] = []
    const onError = (event: ErrorEvent): void => {
      raised.push(event.error)
      event.preventDefault()
    }
    window.addEventListener('error', onError)
    const tree = await header()
    try {
      await interact(() => action(tree, 'save-image').click())
      expect(clicked).toHaveLength(0)
      expect(raised).toEqual([])
      expect(toast(tree)).toBe('画布尚未就绪，无法保存')
    } finally {
      window.removeEventListener('error', onError)
      await tree.unmount()
    }
  })
})

describe('Header links', () => {
  it('keeps the OpenAPI link in live mode and labels the runtime 实时计算', async () => {
    const tree = await header()
    try {
      const link = tree.container.querySelector<HTMLAnchorElement>('a[aria-label="查看 OpenAPI"]')
      expect(link?.getAttribute('href')).toBe('/docs')
      expect(link?.rel).toBe('noreferrer')
      expect(link?.target).toBe('_blank')
      expect(link?.textContent).toBe('OpenAPI')
      expect(tree.container.querySelector('a[aria-label="教材"]')).toBeNull()
      expect(tree.container.querySelector('.qv-pill-tag')?.textContent).toBe('实时计算')
      expect(tree.container.querySelector('.qv-brand-name')?.textContent).toBe('QuViz')
      expect(tree.container.querySelector('header')?.hasAttribute('data-chrome')).toBe(true)
    } finally {
      await tree.unmount()
    }
  })

  it('links the textbook in the static build and labels the runtime 教学预览', async () => {
    runtime.current = 'static'
    const tree = await header()
    try {
      expect(tree.container.querySelector('a[aria-label="教材"]')?.getAttribute('href')).toBe('./learn/')
      expect(tree.container.querySelector('a[aria-label="查看 OpenAPI"]')).toBeNull()
      expect(tree.container.querySelector('.qv-pill-tag')?.textContent).toBe('教学预览')
    } finally {
      await tree.unmount()
    }
  })

  it('links the source repository in a new tab', async () => {
    const tree = await header()
    try {
      const repo = tree.container.querySelector<HTMLAnchorElement>('a[aria-label="GitHub 仓库"]')
      expect(repo?.href).toBe(REPOSITORY_URL)
      expect(repo?.rel).toBe('noreferrer')
      expect(repo?.target).toBe('_blank')
    } finally {
      await tree.unmount()
    }
  })
})

describe('Header actions', () => {
  it('copies the current link and confirms it briefly', async () => {
    vi.useFakeTimers()
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    const tree = await header()
    try {
      await interact(() => action(tree, 'copy-link').click())
      expect(writeText).toHaveBeenCalledWith(window.location.href)
      expect(toast(tree)).toBe('链接已复制')
      await interact(() => vi.advanceTimersByTime(TOAST_MS + 1))
      expect(toast(tree)).toBeNull()
    } finally {
      await tree.unmount()
    }
  })

  it('says so when the clipboard is unavailable', async () => {
    const tree = await header()
    try {
      await interact(() => action(tree, 'copy-link').click())
      expect(toast(tree)).toBe('无法写入剪贴板，请手动复制地址栏')
    } finally {
      await tree.unmount()
    }
  })

  it('opens the guide when there is one, and offers no guide button otherwise', async () => {
    const onOpenGuide = vi.fn()
    const withGuide = await header(onOpenGuide)
    try {
      await interact(() => action(withGuide, 'open-guide').click())
      expect(onOpenGuide).toHaveBeenCalledOnce()
      expect(action(withGuide, 'open-guide').getAttribute('aria-label')).toBe('指南')
    } finally {
      await withGuide.unmount()
    }
    const without = await header()
    try {
      expect(without.container.querySelector('button[data-action="open-guide"]')).toBeNull()
    } finally {
      await without.unmount()
    }
  })
})
```

- [ ] **Step 2: Run and see it fail.**

Run: `npm --prefix web run test:watch -- run src/components/Header.test.tsx`
Expected: FAIL — no `REPOSITORY_URL`/`TOAST_MS` exports, no `data-action` buttons, no runtime pill.

- [ ] **Step 3: Implement.** `web/src/components/Header.tsx` — whole file (carry over any Part B hunk recorded in D1 Step 1):

```tsx
import { BookOpen, Braces, CircleHelp, Download, GitBranch, Link2, Orbit } from 'lucide-react'
import { useEffect, useState } from 'react'

import { runtimeMode } from '../api/runtimeMode'
import { captureSceneCanvas } from './sceneCapture'

export const REPOSITORY_URL = 'https://github.com/longwarriors/Atmoic-quantum-visualization'
/** How long a confirmation toast stays up. */
export const TOAST_MS = 2400

/**
 * The 56 px glass header: brand, runtime pill, icon actions. No state read-out
 * -- the detail panel's title names the state on screen.
 */
export function Header({ onOpenGuide }: { onOpenGuide?: () => void }) {
  const mode = runtimeMode()
  const [toast, setToast] = useState<string | null>(null)

  useEffect(() => {
    if (toast === null) return undefined
    const timer = window.setTimeout(() => setToast(null), TOAST_MS)
    return () => window.clearTimeout(timer)
  }, [toast])

  const copyLink = async (): Promise<void> => {
    try {
      // The URL hash carries the whole state (Part B's bindUrlState).
      await navigator.clipboard.writeText(window.location.href)
      setToast('链接已复制')
    } catch {
      setToast('无法写入剪贴板，请手动复制地址栏')
    }
  }

  const saveImage = (): void => {
    setToast(captureSceneCanvas() ? '图像已保存' : '画布尚未就绪，无法保存')
  }

  return (
    <header className="qv-header" data-chrome="">
      <div className="qv-brand">
        <span className="qv-brand-mark" aria-hidden="true">
          <Orbit size={20} strokeWidth={1.6} />
        </span>
        <span className="qv-brand-name">QuViz</span>
        <span className="qv-pill-tag" data-runtime={mode}>
          {mode === 'static' ? '教学预览' : '实时计算'}
        </span>
      </div>
      <nav className="qv-header-actions" aria-label="页面操作">
        {mode === 'static' ? (
          <a className="qv-icon-button" href="./learn/" aria-label="教材" title="打开教材">
            <BookOpen size={18} aria-hidden="true" />
            <span className="qv-icon-label">教材</span>
          </a>
        ) : (
          <a
            className="qv-icon-button"
            href="/docs"
            target="_blank"
            rel="noreferrer"
            aria-label="查看 OpenAPI"
            title="查看 OpenAPI"
          >
            <Braces size={18} aria-hidden="true" />
            <span className="qv-icon-label">OpenAPI</span>
          </a>
        )}
        <button
          type="button"
          className="qv-icon-button"
          data-action="copy-link"
          aria-label="复制链接"
          title="复制当前状态的链接"
          onClick={() => void copyLink()}
        >
          <Link2 size={18} aria-hidden="true" />
        </button>
        <button
          type="button"
          className="qv-icon-button"
          data-action="save-image"
          aria-label="保存图像"
          title="保存当前画布为 PNG"
          onClick={saveImage}
        >
          <Download size={18} aria-hidden="true" />
        </button>
        {onOpenGuide === undefined ? null : (
          <button
            type="button"
            className="qv-icon-button"
            data-action="open-guide"
            aria-label="指南"
            title="打开使用指南"
            onClick={onOpenGuide}
          >
            <CircleHelp size={18} aria-hidden="true" />
          </button>
        )}
        <a
          className="qv-icon-button"
          href={REPOSITORY_URL}
          target="_blank"
          rel="noreferrer"
          aria-label="GitHub 仓库"
          title="在 GitHub 查看源代码"
        >
          <GitBranch size={18} aria-hidden="true" />
        </a>
      </nav>
      {toast === null ? null : (
        <p className="qv-toast qv-glass-strong" role="status" data-chrome="">
          {toast}
        </p>
      )}
    </header>
  )
}
```

`web/src/App.tsx` line 187 → `<Header />`. `web/src/App.test.tsx` — delete `'routes the arrived stationary or superposition label into the compact header'` (lines 247–304).

`web/src/lab.css` — append:

```css
/* ---- Header ---- */
.qv-header {
  position: fixed;
  top: 0;
  right: 0;
  left: 0;
  z-index: 20;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  height: var(--qv-header-h);
  padding: 0 12px 0 16px;
  background: var(--qv-glass);
  box-shadow: var(--qv-glow);
  backdrop-filter: var(--qv-blur);
  -webkit-backdrop-filter: var(--qv-blur);
}
.qv-brand { display: flex; align-items: center; gap: 10px; min-width: 0; }
.qv-brand-mark { display: grid; place-items: center; width: 32px; height: 32px; border-radius: 50%; background: rgba(138,180,248,.14); color: var(--qv-accent); }
.qv-brand-name { font-size: 20px; font-weight: 400; }
.qv-pill-tag {
  padding: 4px 10px;
  border: 1px solid var(--qv-border-strong);
  border-radius: var(--qv-radius-pill);
  color: var(--qv-text-2);
  font-size: 12px;
  font-weight: 500;
  white-space: nowrap;
}
.qv-header-actions { display: flex; align-items: center; gap: 4px; }
.qv-icon-label { font-size: 14px; font-weight: 500; }
.qv-toast {
  position: fixed;
  top: calc(var(--qv-header-h) + 12px);
  left: 50%;
  z-index: 40;
  padding: 8px 16px;
  border-radius: var(--qv-radius-pill);
  color: var(--qv-text);
  font-size: 13px;
  transform: translateX(-50%);
}

@media (max-width: 1180px) {
  .qv-icon-label { display: none; }
}
@media (max-width: 820px) {
  :root { --qv-header-h: 52px; --qv-edge: 12px; }
  .qv-brand-name { font-size: 18px; }
  .qv-pill-tag { padding: 2px 8px; font-size: 11px; }
  .qv-header-actions .qv-icon-button { min-width: 36px; height: 36px; padding: 0 8px; }
}
```

- [ ] **Step 4: Run and see it pass.**

Run: `npm --prefix web run test:watch -- run src/components/Header.test.tsx src/App.test.tsx`
Expected: PASS. `npm --prefix web run typecheck` → exit 0.

- [ ] **Step 5: Pre-commit gate, then commit.** Both gate commands must exit 0 — `test` runs all five stages (clean-coverage, `tsc -p tsconfig.test.json`, vitest with per-file 90/85/90/90, `assert-no-skips`, `assert-coverage-scope`); a failure is fixed inside this task before committing.

```powershell
npm --prefix web run test
npm --prefix web run typecheck
git add web/src/components/Header.tsx web/src/components/Header.test.tsx web/src/App.tsx web/src/App.test.tsx web/src/lab.css
git commit -m "feat(web): glass header with runtime pill, textbook link, copy, save, guide and repo" -m "Claude-Session: https://claude.ai/code/session_01E44DEzsc7Av26fc7nZ5rSo"
```

### Task D14: SVG chart primitives — axes, radial distribution P(r), energy ladder

Charts are hand-written SVG (spec D10): no chart library, no second `<canvas>`. One series per chart, so no legend box — the title names the series; marks are thin (2 px line, 1 px dashed node rules, ≥ 8 px markers), grid and axes are recessive, text uses text tokens (never the series colour), every number goes through `formatFinite`, each chart has `<title>`/`<desc>` plus a `数据表` details table, and the radial chart has a crosshair hover readout.

**Files:**
- Create: `web/src/components/charts/axes.ts`, `web/src/components/charts/axes.test.ts`, `web/src/components/charts/RadialDistributionChart.tsx`, `web/src/components/charts/RadialDistributionChart.test.tsx`, `web/src/components/charts/EnergyLadderChart.tsx`, `web/src/components/charts/EnergyLadderChart.test.tsx`
- Modify: `web/src/lab.css` (append), `web/coverage-scope.json`
- Not modified: `web/src/api/types.ts` — Part A's A8 already exports `RadialProfile` and adds `OrbitalMetadata.radial_profile?: RadialProfile | null` (D1 Step 1 confirms both).

**Interfaces:**
- Consumes: `RadialProfile` and `OrbitalMetadata.radial_profile?: RadialProfile | null` (`src/api/types.ts`, Part A8, aliasing the regenerated `components['schemas']['RadialProfile']`); `formatFinite`, `formatFiniteUnit` (D8).
- Produces:
  - `charts/axes.ts`: `type Scale = (value: number) => number`; `linearScale(domain, range): Scale`; `niceStep(span, count): number`; `niceTicks(min, max, count?): number[]`; `formatTick(value): string`; `linePath(points): string`; `nearestSortedIndex(sorted, target): number`.
  - `charts/RadialDistributionChart.tsx`: `interface RadialProfileView { r_bohr; radial_density; nodes_bohr; expectation_r_bohr; most_probable_r_bohr }` (readonly arrays — the generated `RadialProfile` is assignable); `radialSeries(profile): { r: number[]; p: number[]; rMax: number; pMax: number }`; `RadialDistributionChart(props: { profile: RadialProfileView; label: string })` → `figure.qv-chart[data-chart="radial"]`.
  - `charts/EnergyLadderChart.tsx`: `interface LevelMark { n; energy; y }`; `labelledLevels(levels, highlight, reservedYs?, minGap?): Set<number>`; `EnergyLadderChart(props: { levels: readonly number[]; highlight: readonly number[] })` → `figure.qv-chart[data-chart="levels"]`.

- [ ] **Step 1: Write the failing tests.**

`web/src/components/charts/axes.test.ts`:

```ts
import { describe, expect, it } from 'vitest'

import { formatTick, linearScale, linePath, nearestSortedIndex, niceStep, niceTicks } from './axes'

describe('linearScale', () => {
  it('maps a domain onto a (possibly inverted) range', () => {
    const y = linearScale([0, 10], [180, 20])
    expect(y(0)).toBe(180)
    expect(y(10)).toBe(20)
    expect(y(5)).toBe(100)
  })

  it('puts everything at the middle of the range for an empty domain', () => {
    expect(linearScale([3, 3], [0, 100])(3)).toBe(50)
  })
})

describe('niceStep / niceTicks', () => {
  it('picks 1, 2, 2.5, 5 or 10 times a power of ten', () => {
    expect(niceStep(17.8, 5)).toBe(5)
    expect(niceStep(0.0019, 4)).toBeCloseTo(5e-4, 12)
    expect(niceStep(9, 9)).toBe(1)
    expect(niceStep(4, 2)).toBe(2)
    expect(niceStep(10, 4)).toBe(2.5)
    expect(niceStep(61, 6)).toBe(20)
    expect(niceStep(0, 5)).toBe(1)
    expect(niceStep(Number.NaN, 5)).toBe(1)
  })

  it('lists round ticks inside the domain, without float dust', () => {
    expect(niceTicks(0, 20, 5)).toEqual([0, 5, 10, 15, 20])
    expect(niceTicks(0, 0.2109, 4)).toEqual([0, 0.1, 0.2])
    expect(niceTicks(-0.5, 0, 5)).toEqual([-0.5, -0.4, -0.3, -0.2, -0.1, 0])
  })

  it('has no ticks for an empty or non-finite domain', () => {
    expect(niceTicks(5, 5)).toEqual([])
    expect(niceTicks(0, Number.NaN)).toEqual([])
  })
})

describe('formatTick / linePath / nearestSortedIndex', () => {
  it('prints short numbers and a dash for nothing', () => {
    expect(formatTick(0.30000000000000004)).toBe('0.3')
    expect(formatTick(-0)).toBe('0')
    expect(formatTick(Number.NaN)).toBe('—')
  })

  it('builds an SVG path with two decimals', () => {
    expect(linePath([[0, 1], [2.345, 3.456]])).toBe('M0.00,1.00L2.35,3.46')
    expect(linePath([])).toBe('')
  })

  it('finds the nearest sample in a sorted list', () => {
    expect(nearestSortedIndex([], 1)).toBe(-1)
    expect(nearestSortedIndex([0, 1, 2], Number.NaN)).toBe(-1)
    expect(nearestSortedIndex([0, 1, 2], 1.4)).toBe(1)
    expect(nearestSortedIndex([0, 1, 2], 1.6)).toBe(2)
    expect(nearestSortedIndex([0, 1, 2], -5)).toBe(0)
    expect(nearestSortedIndex([0, 1, 2], 9)).toBe(2)
    expect(nearestSortedIndex([4], 0)).toBe(0)
  })
})
```

`web/src/components/charts/RadialDistributionChart.test.tsx`:

```ts
/** @vitest-environment jsdom */
import { act, createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { mount } from '../../test/mount'
import { RadialDistributionChart, radialSeries, type RadialProfileView } from './RadialDistributionChart'

/** r = 0 .. 20 bohr in 0.5 steps; P(r) = r² e^{−r}, which peaks at r = 2. */
const R = Array.from({ length: 41 }, (_, index) => index * 0.5)
const PROFILE: RadialProfileView = {
  r_bohr: R,
  radial_density: R.map((r) => r * r * Math.exp(-r)),
  nodes_bohr: [0.8],
  expectation_r_bohr: 3,
  most_probable_r_bohr: 2,
}

const render = (profile: RadialProfileView): string =>
  renderToStaticMarkup(createElement(RadialDistributionChart, { profile, label: '2s' }))

describe('radialSeries', () => {
  it('keeps only finite (r, P) pairs and reports their extremes', () => {
    const series = radialSeries({
      ...PROFILE,
      r_bohr: [0, 1, Number.NaN, 3],
      radial_density: [0, 0.4, 0.2, Number.POSITIVE_INFINITY],
    })
    expect(series.r).toEqual([0, 1])
    expect(series.p).toEqual([0, 0.4])
    expect(series.rMax).toBe(1)
    expect(series.pMax).toBe(0.4)
    expect(radialSeries({ ...PROFILE, r_bohr: [], radial_density: [] })).toMatchObject({ rMax: 0, pMax: 0 })
  })
})

describe('RadialDistributionChart', () => {
  it('names the state and says every marked number in its accessible description', () => {
    const markup = render(PROFILE)
    expect(markup).toContain('2s 的径向分布 P(r)')
    expect(markup).toContain('⟨r⟩ = 3.00 bohr')
    expect(markup).toContain('最可几半径 = 2.00 bohr')
    expect(markup).toContain('径向节点 1 个：0.800 bohr')
    expect(markup).toContain('data-chart="radial"')
    expect(markup).toContain('role="img"')
  })

  it('draws the curve, the node rule, the ⟨r⟩ rule, the peak marker and round ticks', () => {
    const markup = render(PROFILE)
    expect(markup.match(/data-series="radial"/g)).toHaveLength(1)
    expect(markup).toContain('data-node="0.8"')
    expect(markup).toContain('data-marker="expectation"')
    expect(markup).toContain('data-marker="peak"')
    for (const tick of ['>0<', '>5<', '>10<', '>15<', '>20<']) expect(markup).toContain(tick)
    expect(markup).toContain('r / bohr')
  })

  it('tabulates the markers and says 无 when there is no node', () => {
    const markup = render({ ...PROFILE, nodes_bohr: [] })
    expect(markup).toContain('<summary>数据表</summary>')
    expect(markup).toContain('<th scope="row">径向节点</th><td>无</td>')
    expect(markup).toContain('<th scope="row">P(r) 峰值</th><td>5.413e-1 bohr⁻¹</td>')
  })

  it('shows a dash, never NaN, and omits markers it cannot place', () => {
    const markup = render({
      ...PROFILE,
      expectation_r_bohr: Number.NaN,
      most_probable_r_bohr: Number.POSITIVE_INFINITY,
      nodes_bohr: [Number.NaN, 50],
    })
    expect(markup).toContain('⟨r⟩ = —')
    expect(markup).not.toContain('data-marker="expectation"')
    expect(markup).not.toContain('data-marker="peak"')
    expect(markup).not.toContain('data-node')
    expect(markup).not.toContain('NaN')
    expect(markup).not.toContain('Infinity')
  })

  it('refuses to draw a profile with fewer than two finite samples', () => {
    const markup = render({ ...PROFILE, r_bohr: [0], radial_density: [0] })
    expect(markup).toContain('径向分布数据不完整，无法绘制。')
    expect(markup).not.toContain('<svg')
  })

  it('reads out the sample under the pointer and forgets it on leave', async () => {
    const tree = await mount(createElement(RadialDistributionChart, { profile: PROFILE, label: '2s' }))
    try {
      const hit = tree.container.querySelector<SVGRectElement>('.qv-chart-hit')
      if (hit === null) throw new Error('no hover target')
      hit.getBoundingClientRect = () =>
        ({ left: 0, top: 0, width: 264, height: 138, right: 264, bottom: 138, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect
      const scope = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
      scope.IS_REACT_ACT_ENVIRONMENT = true
      try {
        // 10 % of the plot width = r of 2 bohr.
        await act(async () => {
          hit.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: 26.4 }))
        })
        expect(tree.container.querySelector('.qv-chart-readout')?.textContent).toBe(
          'r = 2.00 bohr · P = 5.413e-1',
        )
        await act(async () => {
          hit.dispatchEvent(new PointerEvent('pointerout', { bubbles: true, relatedTarget: document.body }))
        })
        expect(tree.container.querySelector('[data-hover]')).toBeNull()
      } finally {
        delete scope.IS_REACT_ACT_ENVIRONMENT
      }
    } finally {
      await tree.unmount()
    }
  })
})
```

`web/src/components/charts/EnergyLadderChart.test.tsx`:

```ts
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { EnergyLadderChart, labelledLevels } from './EnergyLadderChart'

/** E_n = −1/(2n²) Ha for hydrogen, n = 1..6. */
const LEVELS = [1, 2, 3, 4, 5, 6].map((n) => -0.5 / (n * n))

const render = (levels: readonly number[], highlight: readonly number[]): string =>
  renderToStaticMarkup(createElement(EnergyLadderChart, { levels, highlight }))

describe('labelledLevels', () => {
  it('always labels the highlighted levels, then any level with room, bottom first', () => {
    const chosen = labelledLevels(
      [
        { n: 1, energy: -0.5, y: 186 },
        { n: 2, energy: -0.125, y: 60 },
        { n: 3, energy: -0.056, y: 36.7 },
        { n: 4, energy: -0.031, y: 28.5 },
      ],
      [4],
      [18],
    )
    expect([...chosen].sort()).toEqual([1, 2, 4])
  })
})

describe('EnergyLadderChart', () => {
  it('draws every level, marks the current one, and labels only what fits', () => {
    const markup = render(LEVELS, [2])
    expect(markup.match(/class="qv-level"/g)).toHaveLength(6)
    expect(markup).toContain('data-level="2"')
    expect(markup.match(/data-current="true"/g)).toHaveLength(1)
    for (const label of ['n=1', 'n=2', 'n=3']) expect(markup).toContain(`>${label}<`)
    expect(markup).not.toContain('>n=4<')
    expect(markup).toContain('-0.1250 Ha')
    expect(markup).toContain('E = 0 电离')
    expect(markup).toContain('当前态（n = 2）')
  })

  it('drops non-finite levels and says so when none are left', () => {
    const partial = render([Number.NaN, -0.125], [])
    expect(partial.match(/class="qv-level"/g)).toHaveLength(1)
    expect(partial).not.toContain('NaN')
    expect(render([Number.NaN], [1])).toContain('能级数据缺失。')
  })
})
```

- [ ] **Step 2: Run and see them fail.**

Run: `npm --prefix web run test:watch -- run src/components/charts`
Expected: FAIL — the chart modules do not exist.

- [ ] **Step 3: Implement.**

`web/src/components/charts/axes.ts`:

```ts
/** Plain SVG chart arithmetic. No chart library (spec D10). */
export type Scale = (value: number) => number

export function linearScale(
  domain: readonly [number, number],
  range: readonly [number, number],
): Scale {
  const [d0, d1] = domain
  const [r0, r1] = range
  const span = d1 - d0
  return (value) => (span === 0 ? (r0 + r1) / 2 : r0 + ((value - d0) / span) * (r1 - r0))
}

/** A 1 / 2 / 2.5 / 5 / 10 × 10^k step giving about `count` intervals over `span`. */
export function niceStep(span: number, count: number): number {
  if (!(span > 0) || !Number.isFinite(span)) return 1
  const raw = span / Math.max(1, count)
  const power = 10 ** Math.floor(Math.log10(raw))
  const fraction = raw / power
  const nice =
    fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 2.5 ? 2.5 : fraction <= 5 ? 5 : 10
  return nice * power
}

/** Round ticks from `min` to `max` inclusive; none for an empty or non-finite domain. */
export function niceTicks(min: number, max: number, count = 5): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) return []
  const step = niceStep(max - min, count)
  const ticks: number[] = []
  for (let index = Math.ceil(min / step - 1e-9); index * step <= max + step * 1e-9; index += 1) {
    ticks.push(Number((index * step).toPrecision(12)))
  }
  return ticks
}

export function formatTick(value: number): string {
  return Number.isFinite(value) ? String(Number(value.toPrecision(6))) : '—'
}

export function linePath(points: readonly (readonly [number, number])[]): string {
  return points
    .map(([x, y], index) => `${index === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`)
    .join('')
}

/** Index of the sample nearest `target` in an ascending list; -1 when there is none. */
export function nearestSortedIndex(sorted: readonly number[], target: number): number {
  if (sorted.length === 0 || !Number.isFinite(target)) return -1
  let low = 0
  let high = sorted.length - 1
  while (high - low > 1) {
    const middle = (low + high) >> 1
    if (sorted[middle] <= target) low = middle
    else high = middle
  }
  return Math.abs(sorted[high] - target) < Math.abs(sorted[low] - target) ? high : low
}
```

`web/src/components/charts/RadialDistributionChart.tsx`:

```tsx
import { useId, useMemo, useState, type PointerEvent } from 'react'

import { formatFinite, formatFiniteUnit } from '../format'
import { formatTick, linePath, linearScale, nearestSortedIndex, niceTicks } from './axes'

/** The fields of Part A's RadialProfile this chart draws. */
export interface RadialProfileView {
  r_bohr: readonly number[]
  radial_density: readonly number[]
  nodes_bohr: readonly number[]
  expectation_r_bohr: number
  most_probable_r_bohr: number
}

const WIDTH = 320
const HEIGHT = 188
const MARGIN = { top: 16, right: 12, bottom: 34, left: 44 } as const
const PLOT_WIDTH = WIDTH - MARGIN.left - MARGIN.right
const PLOT_HEIGHT = HEIGHT - MARGIN.top - MARGIN.bottom
const FIXED2 = { kind: 'fixed', digits: 2 } as const
const FIXED3 = { kind: 'fixed', digits: 3 } as const
const EXP3 = { kind: 'exponential', digits: 3 } as const

export interface RadialSeries {
  r: number[]
  p: number[]
  rMax: number
  pMax: number
}

/** The finite (r, P) pairs in order. A non-finite sample is dropped, never drawn as 0. */
export function radialSeries(profile: RadialProfileView): RadialSeries {
  const r: number[] = []
  const p: number[] = []
  const count = Math.min(profile.r_bohr.length, profile.radial_density.length)
  for (let index = 0; index < count; index += 1) {
    const radius = profile.r_bohr[index]
    const density = profile.radial_density[index]
    if (Number.isFinite(radius) && Number.isFinite(density)) {
      r.push(radius)
      p.push(density)
    }
  }
  return {
    r,
    p,
    rMax: r.length === 0 ? 0 : Math.max(...r),
    pMax: p.length === 0 ? 0 : Math.max(...p),
  }
}

/**
 * P(r) = r²|R(r)|² as computed by the Python core (Part A); the browser only
 * draws it. Nodes are dashed rules, ⟨r⟩ a solid rule, the most probable radius
 * a marker on the curve.
 */
export function RadialDistributionChart({
  profile,
  label,
}: {
  profile: RadialProfileView
  label: string
}) {
  const titleId = useId()
  const descId = useId()
  const series = useMemo(() => radialSeries(profile), [profile])
  const [hover, setHover] = useState<number | null>(null)

  if (series.r.length < 2 || !(series.rMax > 0) || !(series.pMax > 0)) {
    return (
      <figure className="qv-chart" data-chart="radial">
        <figcaption className="qv-chart-title">径向分布 P(r)</figcaption>
        <p className="qv-chart-empty">径向分布数据不完整，无法绘制。</p>
      </figure>
    )
  }

  const top = series.pMax * 1.08
  const x = linearScale([0, series.rMax], [MARGIN.left, WIDTH - MARGIN.right])
  const y = linearScale([0, top], [HEIGHT - MARGIN.bottom, MARGIN.top])
  const line = linePath(series.r.map((radius, index) => [x(radius), y(series.p[index])] as const))
  const baseline = y(0).toFixed(2)
  const area = `${line}L${x(series.rMax).toFixed(2)},${baseline}L${x(series.r[0]).toFixed(2)},${baseline}Z`
  const xTicks = niceTicks(0, series.rMax, 5)
  const yTicks = niceTicks(0, top, 4)
  const inPlot = (radius: number): boolean =>
    Number.isFinite(radius) && radius >= 0 && radius <= series.rMax
  const nodes = profile.nodes_bohr.filter(inPlot)
  const expectation = profile.expectation_r_bohr
  const peak = profile.most_probable_r_bohr
  const peakIndex = inPlot(peak) ? nearestSortedIndex(series.r, peak) : -1
  const nodeText =
    nodes.length === 0 ? '无' : `${nodes.map((radius) => formatFinite(radius, FIXED3)).join('、')} bohr`
  const description =
    `P(r) = r²|R(r)|²，横轴 r / bohr。⟨r⟩ = ${formatFiniteUnit(expectation, FIXED2, 'bohr')}，` +
    `最可几半径 = ${formatFiniteUnit(peak, FIXED2, 'bohr')}；径向节点 ${nodes.length} 个：${nodeText}。`

  const onPointerMove = (event: PointerEvent<SVGRectElement>): void => {
    const box = event.currentTarget.getBoundingClientRect()
    if (!(box.width > 0)) return
    setHover(nearestSortedIndex(series.r, ((event.clientX - box.left) / box.width) * series.rMax))
  }
  const hovered = hover === null || hover < 0 ? null : { r: series.r[hover], p: series.p[hover] }

  return (
    <figure className="qv-chart" data-chart="radial">
      <figcaption className="qv-chart-title">径向分布 P(r)</figcaption>
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-labelledby={`${titleId} ${descId}`}>
        <title id={titleId}>{`${label} 的径向分布 P(r)`}</title>
        <desc id={descId}>{description}</desc>
        <g className="qv-chart-grid">
          {yTicks.map((tick) => (
            <line key={tick} x1={MARGIN.left} x2={WIDTH - MARGIN.right} y1={y(tick)} y2={y(tick)} />
          ))}
        </g>
        <path className="qv-chart-area" d={area} />
        <path className="qv-chart-line" d={line} data-series="radial" />
        {nodes.map((radius) => (
          <line
            key={radius}
            className="qv-chart-node"
            data-node={radius}
            x1={x(radius)}
            x2={x(radius)}
            y1={MARGIN.top}
            y2={HEIGHT - MARGIN.bottom}
          />
        ))}
        {inPlot(expectation) ? (
          <g data-marker="expectation">
            <line
              className="qv-chart-expectation"
              x1={x(expectation)}
              x2={x(expectation)}
              y1={MARGIN.top}
              y2={HEIGHT - MARGIN.bottom}
            />
            <text className="qv-chart-label" x={x(expectation) + 4} y={MARGIN.top + 10}>
              ⟨r⟩
            </text>
          </g>
        ) : null}
        {peakIndex >= 0 ? (
          <g data-marker="peak">
            <circle className="qv-chart-marker" cx={x(peak)} cy={y(series.p[peakIndex])} r={4.5} />
            <text className="qv-chart-label" x={x(peak) + 7} y={y(series.p[peakIndex]) - 6}>
              r_mp
            </text>
          </g>
        ) : null}
        <g className="qv-chart-axis" data-axis="x">
          <line x1={MARGIN.left} x2={WIDTH - MARGIN.right} y1={y(0)} y2={y(0)} />
          {xTicks.map((tick) => (
            <g key={tick} transform={`translate(${x(tick).toFixed(2)},${HEIGHT - MARGIN.bottom})`}>
              <line y2={4} />
              <text y={15} textAnchor="middle">
                {formatTick(tick)}
              </text>
            </g>
          ))}
          <text className="qv-chart-axis-title" x={WIDTH - MARGIN.right} y={HEIGHT - 4} textAnchor="end">
            r / bohr
          </text>
        </g>
        <g className="qv-chart-axis" data-axis="y">
          {yTicks.map((tick) => (
            <text key={tick} x={MARGIN.left - 6} y={y(tick) + 3} textAnchor="end">
              {formatTick(tick)}
            </text>
          ))}
          <text className="qv-chart-axis-title" x={MARGIN.left} y={10}>
            P(r) / bohr⁻¹
          </text>
        </g>
        {hovered === null ? null : (
          <g data-hover="">
            <line
              className="qv-chart-crosshair"
              x1={x(hovered.r)}
              x2={x(hovered.r)}
              y1={MARGIN.top}
              y2={HEIGHT - MARGIN.bottom}
            />
            <circle className="qv-chart-hover-dot" cx={x(hovered.r)} cy={y(hovered.p)} r={4} />
            <text className="qv-chart-readout" x={WIDTH - MARGIN.right} y={MARGIN.top + 10} textAnchor="end">
              {`r = ${formatFinite(hovered.r, FIXED2)} bohr · P = ${formatFinite(hovered.p, EXP3)}`}
            </text>
          </g>
        )}
        <rect
          className="qv-chart-hit"
          x={MARGIN.left}
          y={MARGIN.top}
          width={PLOT_WIDTH}
          height={PLOT_HEIGHT}
          onPointerMove={onPointerMove}
          onPointerLeave={() => setHover(null)}
        />
      </svg>
      <details className="qv-chart-table">
        <summary>数据表</summary>
        <table>
          <tbody>
            <tr>
              <th scope="row">⟨r⟩</th>
              <td>{formatFiniteUnit(expectation, FIXED3, 'bohr')}</td>
            </tr>
            <tr>
              <th scope="row">最可几半径</th>
              <td>{formatFiniteUnit(peak, FIXED3, 'bohr')}</td>
            </tr>
            <tr>
              <th scope="row">径向节点</th>
              <td>{nodeText}</td>
            </tr>
            <tr>
              <th scope="row">P(r) 峰值</th>
              <td>{formatFiniteUnit(series.pMax, EXP3, 'bohr⁻¹')}</td>
            </tr>
          </tbody>
        </table>
      </details>
    </figure>
  )
}
```

`web/src/components/charts/EnergyLadderChart.tsx`:

```tsx
import { useId } from 'react'

import { formatFiniteUnit } from '../format'
import { linearScale } from './axes'

const WIDTH = 320
const HEIGHT = 200
const MARGIN = { top: 18, right: 98, bottom: 14, left: 44 } as const
const FIXED4 = { kind: 'fixed', digits: 4 } as const

export interface LevelMark {
  n: number
  energy: number
  y: number
}

/**
 * Which levels get text labels. Highlighted ones always do; every other level
 * does only if it sits at least `minGap` px from every label already placed
 * (and from the reserved y's), lowest n first -- hydrogenic levels crowd
 * towards E = 0, and overlapping labels are worse than missing ones.
 */
export function labelledLevels(
  levels: readonly LevelMark[],
  highlight: readonly number[],
  reservedYs: readonly number[] = [],
  minGap = 12,
): Set<number> {
  const taken = [...reservedYs]
  const chosen = new Set<number>()
  const place = (level: LevelMark): void => {
    chosen.add(level.n)
    taken.push(level.y)
  }
  for (const level of levels) if (highlight.includes(level.n)) place(level)
  for (const level of levels) {
    if (chosen.has(level.n)) continue
    if (taken.every((y) => Math.abs(y - level.y) >= minGap)) place(level)
  }
  return chosen
}

/** E_n for n = 1..K as reported by the server (Part A); the current state's level(s) in the accent. */
export function EnergyLadderChart({
  levels,
  highlight,
}: {
  levels: readonly number[]
  highlight: readonly number[]
}) {
  const titleId = useId()
  const descId = useId()
  const finite = levels
    .map((energy, index) => ({ n: index + 1, energy }))
    .filter((level) => Number.isFinite(level.energy))
  if (finite.length === 0) {
    return (
      <figure className="qv-chart" data-chart="levels">
        <figcaption className="qv-chart-title">能级 Eₙ</figcaption>
        <p className="qv-chart-empty">能级数据缺失。</p>
      </figure>
    )
  }

  const lowest = Math.min(0, ...finite.map((level) => level.energy))
  const y = linearScale([lowest, 0], [HEIGHT - MARGIN.bottom, MARGIN.top])
  const marks: LevelMark[] = finite.map((level) => ({ ...level, y: y(level.energy) }))
  const zeroY = y(0)
  const labelled = labelledLevels(marks, highlight, [zeroY])
  const current = marks.filter((mark) => highlight.includes(mark.n)).map((mark) => mark.n)
  const description =
    `氢样能级 Eₙ（${marks.length} 个），最低能级 = ${formatFiniteUnit(lowest, FIXED4, 'Ha')}；` +
    `强调色为当前态${current.length === 0 ? '' : `（n = ${current.join('、')}）`}；E = 0 为电离极限。`

  return (
    <figure className="qv-chart" data-chart="levels">
      <figcaption className="qv-chart-title">能级 Eₙ</figcaption>
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-labelledby={`${titleId} ${descId}`}>
        <title id={titleId}>氢样能级 Eₙ</title>
        <desc id={descId}>{description}</desc>
        <line className="qv-level-ionization" x1={MARGIN.left} x2={WIDTH - MARGIN.right} y1={zeroY} y2={zeroY} />
        <text className="qv-chart-label" x={WIDTH - MARGIN.right + 6} y={zeroY + 3}>
          E = 0 电离
        </text>
        {marks.map((mark) => {
          const isCurrent = highlight.includes(mark.n)
          return (
            <g key={mark.n} data-level={mark.n}>
              <line
                className="qv-level"
                data-current={isCurrent ? 'true' : 'false'}
                x1={MARGIN.left}
                x2={WIDTH - MARGIN.right}
                y1={mark.y}
                y2={mark.y}
              />
              {labelled.has(mark.n) ? (
                <>
                  <text className="qv-chart-label" x={MARGIN.left - 6} y={mark.y + 3} textAnchor="end">
                    {`n=${mark.n}`}
                  </text>
                  <text className="qv-chart-label" x={WIDTH - MARGIN.right + 6} y={mark.y + 3}>
                    {formatFiniteUnit(mark.energy, FIXED4, 'Ha')}
                  </text>
                </>
              ) : null}
            </g>
          )
        })}
      </svg>
    </figure>
  )
}
```

`web/src/lab.css` — append:

```css
/* ---- Charts (SVG) ---- */
.qv-charts { display: grid; gap: 10px; }
.qv-chart { display: grid; gap: 6px; padding: 12px; border-radius: 16px; background: var(--qv-card); }
.qv-chart svg { display: block; width: 100%; height: auto; overflow: visible; }
.qv-chart-title { font-size: 13px; font-weight: 500; }
.qv-chart-grid line { stroke: rgba(255,255,255,.08); stroke-width: 1; }
.qv-chart-axis line { stroke: rgba(255,255,255,.25); stroke-width: 1; }
.qv-chart-axis text { fill: var(--qv-text-3); font-size: 10px; }
.qv-chart-axis-title { fill: var(--qv-text-3); font-size: 10px; font-style: italic; }
.qv-chart-line { fill: none; stroke: var(--qv-accent); stroke-width: 2; stroke-linejoin: round; stroke-linecap: round; }
.qv-chart-area { fill: rgba(138,180,248,.14); stroke: none; }
.qv-chart-node { stroke: var(--qv-text-2); stroke-width: 1; stroke-dasharray: 3 3; }
.qv-chart-expectation { stroke: var(--qv-text-2); stroke-width: 1; }
.qv-chart-marker { fill: var(--qv-accent); stroke: var(--qv-card); stroke-width: 2; }
.qv-chart-label { fill: var(--qv-text-2); font-size: 10px; }
.qv-chart-crosshair { stroke: rgba(255,255,255,.4); stroke-width: 1; }
.qv-chart-hover-dot { fill: var(--qv-card); stroke: var(--qv-text); stroke-width: 2; }
.qv-chart-readout { fill: var(--qv-text); font-size: 11px; }
.qv-chart-hit { fill: transparent; cursor: crosshair; }
.qv-level { stroke: rgba(255,255,255,.35); stroke-width: 2; stroke-linecap: round; }
.qv-level[data-current="true"] { stroke: var(--qv-accent); stroke-width: 3; }
.qv-level-ionization { stroke: rgba(255,255,255,.25); stroke-width: 1; stroke-dasharray: 4 4; }
.qv-bar { fill: var(--qv-accent); }
.qv-bar-track { fill: rgba(255,255,255,.06); }
.qv-chart-note { color: var(--qv-text-2); font-size: 12px; line-height: 1.5; }
.qv-chart-empty { padding: 12px 4px; color: var(--qv-text-3); font-size: 12px; }
.qv-chart-table summary { color: var(--qv-text-3); font-size: 12px; cursor: pointer; }
.qv-chart-table table { width: 100%; margin-top: 6px; border-collapse: collapse; font-size: 12px; }
.qv-chart-table th,
.qv-chart-table td { padding: 4px 6px; border-top: 1px solid rgba(255,255,255,.08); text-align: right; }
.qv-chart-table th { color: var(--qv-text-2); font-weight: 400; text-align: left; }
```

`web/coverage-scope.json` — insert into both arrays, directly after the last `src/components/W…`/upper-case entry and before any `src/components/controls/…` entry: `"src/components/charts/EnergyLadderChart.tsx"`, `"src/components/charts/RadialDistributionChart.tsx"`, `"src/components/charts/axes.ts"` (in that order).

- [ ] **Step 4: Run and see them pass.**

Run: `npm --prefix web run test:watch -- run src/components/charts src/guards.test.ts`
Expected: PASS. `npm --prefix web run typecheck` → exit 0.

- [ ] **Step 5: Pre-commit gate, then commit.** Both gate commands must exit 0 — `test` runs all five stages (clean-coverage, `tsc -p tsconfig.test.json`, vitest with per-file 90/85/90/90, `assert-no-skips`, `assert-coverage-scope`); a failure is fixed inside this task before committing.

```powershell
npm --prefix web run test
npm --prefix web run typecheck
git add web/src/components/charts/axes.ts web/src/components/charts/axes.test.ts web/src/components/charts/RadialDistributionChart.tsx web/src/components/charts/RadialDistributionChart.test.tsx web/src/components/charts/EnergyLadderChart.tsx web/src/components/charts/EnergyLadderChart.test.tsx web/src/lab.css web/coverage-scope.json
git commit -m "feat(web): hand-written SVG radial distribution and energy ladder charts" -m "Claude-Session: https://claude.ai/code/session_01E44DEzsc7Av26fc7nZ5rSo"
```

### Task D15: Superposition terms chart, `useOrbitalMetadata`, `ChartsPanel`

**Files:**
- Create: `web/src/components/charts/SuperpositionTermsChart.tsx`, `web/src/components/charts/SuperpositionTermsChart.test.tsx`, `web/src/components/useOrbitalMetadata.ts`, `web/src/components/useOrbitalMetadata.test.tsx`, `web/src/components/charts/ChartsPanel.tsx`, `web/src/components/charts/ChartsPanel.test.tsx`, `web/coverage-scope.json`

**Interfaces:**
- Consumes: `fetchOrbitalMetadata(orbital, signal?)` (Part B, `src/api/client.ts` — called with `{ n, l, m, z, basis }`); `usePlaybackModel().periodAu` (D10, catalogue period × a_μ/Z²); `RadialDistributionChart`, `EnergyLadderChart` (D14).
- Produces:
  - `charts/SuperpositionTermsChart.tsx`: `termWeight(term): number` (= Re² + Im²), `ket(term): string` (`|n,l,m⟩`), `beatText(periodAu: number | null, deltaE?: number): string`, `SuperpositionTermsChart(props: { terms: readonly SuperpositionTermSpec[]; levels: readonly number[] | null; periodAu: number | null })` → `figure[data-chart="terms"]`.
  - `useOrbitalMetadata.ts`: `type MetadataStatus = 'idle' | 'loading' | 'ready' | 'error'`; `interface OrbitalMetadataState { status; metadata?; error? }`; `orbitalKey(orbital | null): string | null`; `describes(metadata | undefined, orbital | null): boolean`; `useOrbitalMetadata(orbital: OrbitalParameters | null, preloaded?: OrbitalMetadata): OrbitalMetadataState` — no request when `preloaded` already carries a `radial_profile` for the same state; one `AbortController` per key, aborted on key change and unmount.
  - `charts/ChartsPanel.tsx`: `highestTerm(terms): SuperpositionTermSpec | undefined`; `ChartsPanel(props: { status: SceneStatus })`.

- [ ] **Step 1: Write the failing tests.**

`web/src/components/charts/SuperpositionTermsChart.test.tsx`:

```ts
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import type { SuperpositionTermSpec } from '../../api/types'
import { beatText, ket, SuperpositionTermsChart, termWeight } from './SuperpositionTermsChart'

const HALF = Math.SQRT1_2
const BOHR: SuperpositionTermSpec[] = [
  { n: 1, l: 0, m: 0, coefficient_real: HALF, coefficient_imag: 0 },
  { n: 2, l: 1, m: 0, coefficient_real: HALF, coefficient_imag: 0 },
]
const LEVELS = [1, 2, 3, 4, 5].map((n) => -0.5 / (n * n))

const render = (
  terms: readonly SuperpositionTermSpec[],
  levels: readonly number[] | null,
  periodAu: number | null,
): string => renderToStaticMarkup(createElement(SuperpositionTermsChart, { terms, levels, periodAu }))

describe('termWeight / ket / beatText', () => {
  it('weighs a complex coefficient by its modulus squared', () => {
    expect(termWeight({ n: 2, l: 1, m: 1, coefficient_real: 0.6, coefficient_imag: 0.8 })).toBeCloseTo(1, 12)
    expect(ket(BOHR[1])).toBe('|2,1,0⟩')
  })

  it('states the beat period, a degenerate pair, or the wait for the catalogue', () => {
    expect(beatText(16.755160819145562, 0.375)).toBe('拍周期 T = 16.76 a.u.，ΔE = 0.3750 Ha（T = 2π/ΔE）')
    expect(beatText(16.76)).toBe('拍周期 T = 16.76 a.u.（T = 2π/ΔE）')
    expect(beatText(0)).toBe('能量简并（ΔE = 0）：|Ψ|² 不随时间变化，没有拍频。')
    expect(beatText(null)).toBe('拍周期：等待叠加态目录。')
  })
})

describe('SuperpositionTermsChart', () => {
  it('draws one bar per term with its weight and its level energy', () => {
    const markup = render(BOHR, LEVELS, 16.755160819145562)
    expect(markup.match(/class="qv-bar"/g)).toHaveLength(2)
    expect(markup).toContain('>|1,0,0⟩<')
    expect(markup).toContain('0.500 · -0.5000 Ha')
    expect(markup).toContain('0.500 · -0.1250 Ha')
    expect(markup).toContain('ΔE = 0.3750 Ha')
    expect(markup).toContain('Σ|c_k|² = 1.000')
    expect(markup).toContain('data-chart="terms"')
  })

  it('says why energies are missing instead of guessing them', () => {
    const markup = render(BOHR, null, 16.76)
    expect(markup).toContain('0.500 · —')
    expect(markup).toContain('能级需 a_μ = 1 的元数据，当前未显示。')
    expect(markup).not.toContain('ΔE =')
  })

  it('draws a non-finite coefficient as an empty bar and a dash', () => {
    const markup = render(
      [{ n: 1, l: 0, m: 0, coefficient_real: Number.NaN, coefficient_imag: 0 }],
      LEVELS,
      0,
    )
    expect(markup).toContain('width="0"')
    expect(markup).toContain('— · -0.5000 Ha')
    expect(markup).not.toContain('NaN')
    expect(markup).toContain('能量简并')
  })

  it('says a state with no terms has nothing to draw', () => {
    expect(render([], LEVELS, null)).toContain('叠加态没有报告任何项。')
  })
})
```

`web/src/components/useOrbitalMetadata.test.tsx`:

```ts
/** @vitest-environment jsdom */
import { act, createElement } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { OrbitalMetadata, OrbitalParameters } from '../api/types'
import { mount } from '../test/mount'

const fetchMetadata = vi.hoisted(() => vi.fn<(orbital: OrbitalParameters, signal?: AbortSignal) => Promise<OrbitalMetadata>>())
vi.mock('../api/client', () => ({ fetchOrbitalMetadata: fetchMetadata }))

import { describes, orbitalKey, useOrbitalMetadata, type OrbitalMetadataState } from './useOrbitalMetadata'

const TWO_PZ: OrbitalParameters = { n: 2, l: 1, m: 0, z: 1, basis: 'real' }
const PROFILE = {
  r_bohr: [0, 1, 2],
  radial_density: [0, 0.3, 0.1],
  nodes_bohr: [],
  expectation_r_bohr: 5,
  most_probable_r_bohr: 4,
  energy_levels_hartree: [-0.5, -0.125, -0.0556, -0.03125, -0.02],
}

function metadata(state: OrbitalParameters, withProfile = true): OrbitalMetadata {
  return {
    state: { ...state, a_mu: 1 },
    label: '2p_z',
    energy_hartree: -0.125,
    length_unit: 'bohr',
    observable: 'probability_density',
    representation: 'point_cloud',
    normalization: 'unit',
    coordinate_convention: 'physics',
    spherical_harmonic_convention: 'Condon-Shortley',
    geometry_semantics: 'samples',
    color_semantics: 'phase',
    references: [],
    warnings: [],
    radial_profile: withProfile ? PROFILE : null,
  }
}

let seen: OrbitalMetadataState[] = []
function Probe({ orbital, preloaded }: { orbital: OrbitalParameters | null; preloaded?: OrbitalMetadata }) {
  seen.push(useOrbitalMetadata(orbital, preloaded))
  return null
}
const last = (): OrbitalMetadataState => seen[seen.length - 1]
const settle = async (): Promise<void> => {
  const scope = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  scope.IS_REACT_ACT_ENVIRONMENT = true
  try {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
  } finally {
    delete scope.IS_REACT_ACT_ENVIRONMENT
  }
}

beforeEach(() => {
  seen = []
  fetchMetadata.mockReset()
})

describe('orbitalKey / describes', () => {
  it('keys a state by every field the request carries', () => {
    expect(orbitalKey(null)).toBeNull()
    expect(orbitalKey(TWO_PZ)).toBe('2|1|0|1|real')
    expect(describes(metadata(TWO_PZ), TWO_PZ)).toBe(true)
    expect(describes(metadata(TWO_PZ), { ...TWO_PZ, basis: 'complex' })).toBe(false)
    expect(describes(undefined, TWO_PZ)).toBe(false)
    expect(describes(metadata(TWO_PZ), null)).toBe(false)
  })
})

describe('useOrbitalMetadata', () => {
  it('is idle without a state and asks nothing', async () => {
    const tree = await mount(createElement(Probe, { orbital: null }))
    expect(last()).toEqual({ status: 'idle' })
    expect(fetchMetadata).not.toHaveBeenCalled()
    await tree.unmount()
  })

  it('uses metadata that already carries the profile for the same state, without a request', async () => {
    const preloaded = metadata(TWO_PZ)
    const tree = await mount(createElement(Probe, { orbital: TWO_PZ, preloaded }))
    expect(last()).toEqual({ status: 'ready', metadata: preloaded })
    expect(fetchMetadata).not.toHaveBeenCalled()
    await tree.unmount()
  })

  it('fetches when the preloaded metadata has no profile, and reports ready', async () => {
    fetchMetadata.mockResolvedValue(metadata(TWO_PZ))
    const tree = await mount(createElement(Probe, { orbital: TWO_PZ, preloaded: metadata(TWO_PZ, false) }))
    expect(last().status).toBe('loading')
    await settle()
    expect(fetchMetadata).toHaveBeenCalledWith(TWO_PZ, expect.any(AbortSignal))
    expect(last().status).toBe('ready')
    expect(last().metadata?.radial_profile?.expectation_r_bohr).toBe(5)
    await tree.unmount()
  })

  it('aborts the previous request when the state changes, and on unmount', async () => {
    fetchMetadata.mockImplementation(() => new Promise(() => undefined))
    const tree = await mount(createElement(Probe, { orbital: TWO_PZ }))
    const first = fetchMetadata.mock.calls[0][1]
    await tree.update(createElement(Probe, { orbital: { ...TWO_PZ, m: 1 } }))
    expect(first?.aborted).toBe(true)
    expect(last().status).toBe('loading')
    const second = fetchMetadata.mock.calls[1][1]
    await tree.unmount()
    expect(second?.aborted).toBe(true)
  })

  it('reports a failed request with its message', async () => {
    fetchMetadata.mockRejectedValueOnce(new Error('静态教材版未预计算这一组合。'))
    const tree = await mount(createElement(Probe, { orbital: TWO_PZ }))
    await settle()
    expect(last()).toEqual({ status: 'error', error: '静态教材版未预计算这一组合。' })
    fetchMetadata.mockRejectedValueOnce('plain')
    await tree.update(createElement(Probe, { orbital: { ...TWO_PZ, n: 3 } }))
    await settle()
    expect(last()).toEqual({ status: 'error', error: 'plain' })
    await tree.unmount()
  })
})
```

`web/src/components/charts/ChartsPanel.test.tsx`:

```ts
/** @vitest-environment jsdom */
import { act, createElement } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { OrbitalMetadata, SceneStatus, SuperpositionMetadata } from '../../api/types'
import { mount, type MountedTree } from '../../test/mount'

const fetchMetadata = vi.hoisted(() => vi.fn())
const playback = vi.hoisted(() => ({ periodAu: 16.755160819145562 as number | null }))
vi.mock('../../api/client', () => ({ fetchOrbitalMetadata: fetchMetadata }))
vi.mock('../usePlayback', () => ({ usePlaybackModel: () => ({ periodAu: playback.periodAu }) }))

import { ChartsPanel, highestTerm } from './ChartsPanel'

const LEVELS = [1, 2, 3, 4, 5].map((n) => -0.5 / (n * n))
const PROFILE = {
  r_bohr: [0, 2, 4, 6],
  radial_density: [0, 0.2, 0.1, 0.02],
  nodes_bohr: [],
  expectation_r_bohr: 5,
  most_probable_r_bohr: 2,
  energy_levels_hartree: LEVELS,
}

function eigen(withProfile: boolean): OrbitalMetadata {
  return {
    state: { n: 2, l: 1, m: 0, z: 1, a_mu: 1, basis: 'real' },
    label: '2p_z',
    energy_hartree: -0.125,
    length_unit: 'bohr',
    observable: 'probability_density',
    representation: 'point_cloud',
    normalization: 'unit',
    coordinate_convention: 'physics',
    spherical_harmonic_convention: 'Condon-Shortley',
    geometry_semantics: 'samples',
    color_semantics: 'phase',
    references: [],
    warnings: [],
    radial_profile: withProfile ? PROFILE : null,
  }
}

function mixture(aMu = 1): SuperpositionMetadata {
  return {
    terms: [
      { n: 1, l: 0, m: 0, coefficient_real: Math.SQRT1_2, coefficient_imag: 0 },
      { n: 2, l: 1, m: 0, coefficient_real: Math.SQRT1_2, coefficient_imag: 0 },
    ],
    label: '1s + 2p_z',
    basis: 'complex',
    z: 1,
    a_mu: aMu,
    reduced_mass_ratio: 1,
    time_au: 0,
    energy_expectation_hartree: -0.3125,
    is_stationary: false,
    length_unit: 'bohr',
    observable: 'probability_density',
    representation: 'isosurface',
    normalization: 'unit',
    coordinate_convention: 'physics',
    spherical_harmonic_convention: 'Condon-Shortley',
    geometry_semantics: 'surface',
    color_semantics: 'phase',
    references: [],
    warnings: [],
  }
}

async function panel(status: SceneStatus): Promise<MountedTree> {
  const tree = await mount(createElement(ChartsPanel, { status }))
  const scope = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  scope.IS_REACT_ACT_ENVIRONMENT = true
  try {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
  } finally {
    delete scope.IS_REACT_ACT_ENVIRONMENT
  }
  return tree
}

beforeEach(() => {
  fetchMetadata.mockReset()
  playback.periodAu = 16.755160819145562
})

describe('highestTerm', () => {
  it('picks the term with the largest n, whose levels cover every term', () => {
    expect(highestTerm(mixture().terms)?.n).toBe(2)
    expect(highestTerm([])).toBeUndefined()
  })
})

describe('ChartsPanel', () => {
  it('draws P(r) and the ladder from the arrived metadata, asking nothing more', async () => {
    const tree = await panel({ loading: false, metadata: eigen(true) })
    try {
      expect(tree.container.querySelector('[data-chart="radial"]')).not.toBeNull()
      expect(tree.container.querySelector('[data-chart="levels"] [data-current="true"]')?.closest('[data-level]')?.getAttribute('data-level')).toBe('2')
      expect(fetchMetadata).not.toHaveBeenCalled()
    } finally {
      await tree.unmount()
    }
  })

  it('fetches the profile when the arrived metadata has none', async () => {
    fetchMetadata.mockResolvedValue(eigen(true))
    const tree = await panel({ loading: false, metadata: eigen(false) })
    try {
      expect(fetchMetadata).toHaveBeenCalledWith({ n: 2, l: 1, m: 0, z: 1, basis: 'real' }, expect.any(AbortSignal))
      expect(tree.container.querySelector('[data-chart="radial"]')).not.toBeNull()
    } finally {
      await tree.unmount()
    }
  })

  it('says it is loading, failed, or was given no profile', async () => {
    fetchMetadata.mockImplementation(() => new Promise(() => undefined))
    const loading = await panel({ loading: false, metadata: eigen(false) })
    expect(loading.container.textContent).toContain('正在载入径向分布…')
    await loading.unmount()

    fetchMetadata.mockReset()
    fetchMetadata.mockRejectedValue(new Error('HTTP 404'))
    const failed = await panel({ loading: false, metadata: eigen(false) })
    expect(failed.container.querySelector('[role="alert"]')?.textContent).toBe('径向分布载入失败：HTTP 404')
    await failed.unmount()

    fetchMetadata.mockReset()
    fetchMetadata.mockResolvedValue(eigen(false))
    const missing = await panel({ loading: false, metadata: eigen(false) })
    expect(missing.container.textContent).toContain('服务端未提供径向分布。')
    await missing.unmount()
  })

  it('draws the superposition weights and both levels, with the beat period', async () => {
    fetchMetadata.mockResolvedValue(eigen(true))
    const tree = await panel({ loading: false, superposition: mixture() })
    try {
      expect(fetchMetadata).toHaveBeenCalledWith({ n: 2, l: 1, m: 0, z: 1, basis: 'complex' }, expect.any(AbortSignal))
      expect(tree.container.querySelector('[data-chart="terms"]')?.textContent).toContain('拍周期 T = 16.76 a.u.')
      expect(tree.container.querySelectorAll('[data-chart="levels"] [data-current="true"]')).toHaveLength(2)
    } finally {
      await tree.unmount()
    }
  })

  it('shows no energies for a reduced mass the level metadata does not describe', async () => {
    fetchMetadata.mockResolvedValue(eigen(true))
    const tree = await panel({ loading: false, superposition: mixture(0.5) })
    try {
      expect(tree.container.querySelector('[data-chart="levels"]')).toBeNull()
      expect(tree.container.textContent).toContain('能级需 a_μ = 1 的元数据')
    } finally {
      await tree.unmount()
    }
  })

  it('invites the reader to load a state when nothing has arrived', async () => {
    const tree = await panel({ loading: true })
    try {
      expect(tree.container.textContent).toContain('载入一个量子态后')
      expect(fetchMetadata).not.toHaveBeenCalled()
    } finally {
      await tree.unmount()
    }
  })
})
```

- [ ] **Step 2: Run and see them fail.**

Run: `npm --prefix web run test:watch -- run src/components/charts src/components/useOrbitalMetadata.test.tsx`
Expected: FAIL — `SuperpositionTermsChart`, `ChartsPanel`, `useOrbitalMetadata` do not exist.

- [ ] **Step 3: Implement.**

`web/src/components/charts/SuperpositionTermsChart.tsx`:

```tsx
import { useId } from 'react'

import type { SuperpositionTermSpec } from '../../api/types'
import { formatFinite, formatFiniteUnit } from '../format'
import { linearScale } from './axes'

const WIDTH = 320
const ROW = 30
const MARGIN = { top: 6, right: 116, left: 62 } as const
const FIXED3 = { kind: 'fixed', digits: 3 } as const
const FIXED4 = { kind: 'fixed', digits: 4 } as const
const FIXED2 = { kind: 'fixed', digits: 2 } as const

/** |c_k|² from the server's own coefficients -- arithmetic, not physics. */
export function termWeight(term: SuperpositionTermSpec): number {
  return term.coefficient_real ** 2 + term.coefficient_imag ** 2
}

export function ket(term: Pick<SuperpositionTermSpec, 'n' | 'l' | 'm'>): string {
  return `|${term.n},${term.l},${term.m}⟩`
}

/** The beat period from the catalogue (Part B/D10), and ΔE when the levels are known. */
export function beatText(periodAu: number | null, deltaE?: number): string {
  if (periodAu === null) return '拍周期：等待叠加态目录。'
  if (periodAu === 0) return '能量简并（ΔE = 0）：|Ψ|² 不随时间变化，没有拍频。'
  const delta = deltaE === undefined ? '' : `，ΔE = ${formatFinite(deltaE, FIXED4)} Ha`
  return `拍周期 T = ${formatFinite(periodAu, FIXED2)} a.u.${delta}（T = 2π/ΔE）`
}

/**
 * One bar per term: |c_k|² on a 0..1 scale, the term's level energy beside it,
 * and the beat period below. Energies come from the server's level list for
 * the superposition's own (Z, basis) -- null when a_μ ≠ 1, rather than a guess.
 */
export function SuperpositionTermsChart({
  terms,
  levels,
  periodAu,
}: {
  terms: readonly SuperpositionTermSpec[]
  levels: readonly number[] | null
  periodAu: number | null
}) {
  const titleId = useId()
  const descId = useId()
  if (terms.length === 0) {
    return (
      <figure className="qv-chart" data-chart="terms">
        <figcaption className="qv-chart-title">叠加系数 |c_k|²</figcaption>
        <p className="qv-chart-empty">叠加态没有报告任何项。</p>
      </figure>
    )
  }

  const height = MARGIN.top * 2 + terms.length * ROW
  const x = linearScale([0, 1], [MARGIN.left, WIDTH - MARGIN.right])
  const weights = terms.map(termWeight)
  const energies = terms.map((term) => levels?.[term.n - 1])
  const total = weights.reduce((sum, weight) => sum + weight, 0)
  const distinct = [...new Set(energies.filter((energy): energy is number => energy !== undefined && Number.isFinite(energy)))]
  const deltaE = distinct.length === 2 ? Math.abs(distinct[0] - distinct[1]) : undefined
  const rowText = (index: number): string =>
    `${formatFinite(weights[index], FIXED3)} · ${formatFiniteUnit(energies[index], FIXED4, 'Ha')}`

  return (
    <figure className="qv-chart" data-chart="terms">
      <figcaption className="qv-chart-title">叠加系数 |c_k|²</figcaption>
      <svg viewBox={`0 0 ${WIDTH} ${height}`} role="img" aria-labelledby={`${titleId} ${descId}`}>
        <title id={titleId}>叠加态各项权重 |c_k|²</title>
        <desc id={descId}>
          {terms.map((term, index) => `${ket(term)}：|c|² 与能量 ${rowText(index)}`).join('；')}
        </desc>
        {terms.map((term, index) => {
          const top = MARGIN.top + index * ROW
          const weight = weights[index]
          const width = Number.isFinite(weight)
            ? Math.max(0, x(Math.min(1, weight)) - MARGIN.left)
            : 0
          return (
            <g key={`${ket(term)}-${index}`} data-term={ket(term)}>
              <text className="qv-chart-label" x={MARGIN.left - 8} y={top + 17} textAnchor="end">
                {ket(term)}
              </text>
              <rect className="qv-bar-track" x={MARGIN.left} y={top + 7} width={WIDTH - MARGIN.left - MARGIN.right} height={14} rx={4} />
              <rect className="qv-bar" x={MARGIN.left} y={top + 7} width={width} height={14} rx={4} />
              <text className="qv-chart-label" x={WIDTH - MARGIN.right + 8} y={top + 17}>
                {rowText(index)}
              </text>
            </g>
          )
        })}
      </svg>
      <p className="qv-chart-note" data-beat="">
        {beatText(periodAu, deltaE)}
      </p>
      <p className="qv-chart-note">
        Σ|c_k|² = {formatFinite(total, FIXED3)}
        {levels === null ? '；能级需 a_μ = 1 的元数据，当前未显示。' : ''}
      </p>
    </figure>
  )
}
```

`web/src/components/useOrbitalMetadata.ts`:

```ts
import { useEffect, useMemo, useState } from 'react'

import { fetchOrbitalMetadata } from '../api/client'
import type { OrbitalMetadata, OrbitalParameters } from '../api/types'

export type MetadataStatus = 'idle' | 'loading' | 'ready' | 'error'

export interface OrbitalMetadataState {
  status: MetadataStatus
  metadata?: OrbitalMetadata
  error?: string
}

/** Every field the metadata request carries, joined. */
export function orbitalKey(orbital: OrbitalParameters | null): string | null {
  return orbital === null
    ? null
    : `${orbital.n}|${orbital.l}|${orbital.m}|${orbital.z}|${orbital.basis}`
}

/** Does this metadata describe exactly this state? */
export function describes(
  metadata: OrbitalMetadata | undefined,
  orbital: OrbitalParameters | null,
): boolean {
  if (metadata === undefined || orbital === null) return false
  const { state } = metadata
  return (
    state.n === orbital.n &&
    state.l === orbital.l &&
    state.m === orbital.m &&
    state.z === orbital.z &&
    state.basis === orbital.basis
  )
}

/**
 * An eigenstate's metadata with its radial profile, for the charts.
 *
 * No request when `preloaded` (the arrived scene's metadata) already carries a
 * profile for the same state -- the common case, since every eigenstate payload
 * embeds it. Otherwise one request per state, through the active transport
 * (live /api or the static catalogue), aborted when the state changes or the
 * chart goes away.
 */
export function useOrbitalMetadata(
  orbital: OrbitalParameters | null,
  preloaded?: OrbitalMetadata,
): OrbitalMetadataState {
  const key = orbitalKey(orbital)
  const usable =
    describes(preloaded, orbital) &&
    preloaded?.radial_profile !== undefined &&
    preloaded.radial_profile !== null
  // The object identity changes every render; the key is what the request depends on.
  const request = useMemo(() => orbital, [key]) // eslint-disable-line react-hooks/exhaustive-deps
  const [fetched, setFetched] = useState<{ key: string; state: OrbitalMetadataState } | null>(null)

  useEffect(() => {
    if (key === null || request === null || usable) return undefined
    const controller = new AbortController()
    setFetched({ key, state: { status: 'loading' } })
    fetchOrbitalMetadata(request, controller.signal).then(
      (metadata) => {
        if (!controller.signal.aborted) setFetched({ key, state: { status: 'ready', metadata } })
      },
      (error: unknown) => {
        if (!controller.signal.aborted) {
          setFetched({
            key,
            state: { status: 'error', error: error instanceof Error ? error.message : String(error) },
          })
        }
      },
    )
    return () => controller.abort()
  }, [key, request, usable])

  if (key === null) return { status: 'idle' }
  if (usable) return { status: 'ready', metadata: preloaded }
  if (fetched === null || fetched.key !== key) return { status: 'loading' }
  return fetched.state
}
```

(The repo has no ESLint; the trailing comment only documents the deliberate dependency list and is harmless.)

`web/src/components/charts/ChartsPanel.tsx`:

```tsx
import type { OrbitalParameters, SceneStatus, SuperpositionTermSpec } from '../../api/types'
import { useOrbitalMetadata } from '../useOrbitalMetadata'
import { usePlaybackModel } from '../usePlayback'
import { EnergyLadderChart } from './EnergyLadderChart'
import { RadialDistributionChart } from './RadialDistributionChart'
import { SuperpositionTermsChart } from './SuperpositionTermsChart'

/** The term with the largest n: its level list (k = 1..max(n+2, 5)) covers every term. */
export function highestTerm(
  terms: readonly SuperpositionTermSpec[],
): SuperpositionTermSpec | undefined {
  return terms.reduce<SuperpositionTermSpec | undefined>(
    (best, term) => (best === undefined || term.n > best.n ? term : best),
    undefined,
  )
}

/**
 * The detail panel's 图表 tab. Mounted only while that tab is open (Inspector),
 * so a closed tab issues no metadata request -- the visual suite's request
 * ledger would otherwise see an undeclared question.
 */
export function ChartsPanel({ status }: { status: SceneStatus }) {
  const { periodAu } = usePlaybackModel()
  const metadata = status.metadata
  const mixture = status.superposition
  const eigenstate: OrbitalParameters | null =
    metadata === undefined
      ? null
      : {
          n: metadata.state.n,
          l: metadata.state.l,
          m: metadata.state.m,
          z: metadata.state.z,
          basis: metadata.state.basis,
        }
  const heaviest = mixture === undefined ? undefined : highestTerm(mixture.terms)
  const termState: OrbitalParameters | null =
    mixture === undefined || heaviest === undefined
      ? null
      : { n: heaviest.n, l: heaviest.l, m: heaviest.m, z: mixture.z, basis: mixture.basis }
  const eigenMeta = useOrbitalMetadata(eigenstate, metadata)
  const termMeta = useOrbitalMetadata(termState)

  if (metadata !== undefined) {
    if (eigenMeta.status === 'loading') {
      return (
        <p className="inspector-empty" role="status">
          正在载入径向分布…
        </p>
      )
    }
    if (eigenMeta.status === 'error') {
      return (
        <p className="inspector-empty" role="alert">
          径向分布载入失败：{eigenMeta.error}
        </p>
      )
    }
    const profile = eigenMeta.metadata?.radial_profile
    if (profile === undefined || profile === null) {
      return <p className="inspector-empty">服务端未提供径向分布。</p>
    }
    return (
      <div className="qv-charts" data-charts="eigenstate">
        <RadialDistributionChart profile={profile} label={metadata.label} />
        <EnergyLadderChart levels={profile.energy_levels_hartree} highlight={[metadata.state.n]} />
      </div>
    )
  }

  if (mixture !== undefined) {
    // The level list is for a_μ = 1 (the metadata request carries no a_μ); for
    // any other reduced mass the energies are withheld rather than mis-stated.
    const levels =
      mixture.a_mu === 1 ? (termMeta.metadata?.radial_profile?.energy_levels_hartree ?? null) : null
    return (
      <div className="qv-charts" data-charts="superposition">
        <SuperpositionTermsChart terms={mixture.terms} levels={levels} periodAu={periodAu} />
        {levels === null ? null : (
          <EnergyLadderChart
            levels={levels}
            highlight={[...new Set(mixture.terms.map((term) => term.n))]}
          />
        )}
      </div>
    )
  }

  return <p className="inspector-empty">载入一个量子态后，这里会显示径向分布、能级与叠加系数。</p>
}
```

`web/coverage-scope.json` — insert into both arrays: `"src/components/charts/ChartsPanel.tsx"` directly before `"src/components/charts/EnergyLadderChart.tsx"`; `"src/components/charts/SuperpositionTermsChart.tsx"` directly after `"src/components/charts/RadialDistributionChart.tsx"`; `"src/components/useOrbitalMetadata.ts"` directly after `"src/components/useDeferredDisposableRef.ts"` (or after `useMediaQuery.ts` if D20 already ran — it has not in this order).

- [ ] **Step 4: Run and see them pass.**

Run: `npm --prefix web run test:watch -- run src/components/charts src/components/useOrbitalMetadata.test.tsx src/guards.test.ts`
Expected: PASS. `npm --prefix web run typecheck` → exit 0.

- [ ] **Step 5: Pre-commit gate, then commit.** Both gate commands must exit 0 — `test` runs all five stages (clean-coverage, `tsc -p tsconfig.test.json`, vitest with per-file 90/85/90/90, `assert-no-skips`, `assert-coverage-scope`); a failure is fixed inside this task before committing.

```powershell
npm --prefix web run test
npm --prefix web run typecheck
git add web/src/components/charts/SuperpositionTermsChart.tsx web/src/components/charts/SuperpositionTermsChart.test.tsx web/src/components/charts/ChartsPanel.tsx web/src/components/charts/ChartsPanel.test.tsx web/src/components/useOrbitalMetadata.ts web/src/components/useOrbitalMetadata.test.tsx web/coverage-scope.json
git commit -m "feat(web): superposition weights chart and lazily loaded detail charts" -m "Claude-Session: https://claude.ai/code/session_01E44DEzsc7Av26fc7nZ5rSo"
```

### Task D16: Right detail panel — title row, four tabs, lazily mounted charts

**Files:**
- Modify: `web/src/components/Inspector.tsx` (restructure; helpers and contract rows kept), `web/src/components/Inspector.test.tsx` (lines listed below + new cases), `web/src/lab.css` (append)

**Interfaces:**
- Consumes: `ChartsPanel` (D15); `formatFinite`, `formatFiniteUnit` (D8).
- Produces: `Inspector(props: { status: SceneStatus; open?: boolean; mobileOpen?: boolean; onClose?: () => void })` — unchanged props. `aside#science-inspector.inspector-panel[data-chrome][aria-label=科学详情]` (`aria-hidden` + `inert` when closed; `.is-open`, `.mobile-open` as today), header row `h2` (arrived label) + `span.energy-pill` + `button.inspector-close[aria-label=关闭科学详情]`, `[role=tablist][aria-label=科学详情视图]` with tabs `概览`/`图表`/`场景契约`/`引用` (roving tabindex, Arrow/Home/End), panels `.overview-panel`, `.charts-panel` (content mounted only while active), `.contract-panel` (`dl.contract-list`, unchanged rows), `.references-panel`.

The module keeps its name and id: `src/guards.test.ts:1026` names `components/Inspector.tsx` literally and `fullstack-e2e/app.spec.ts` reads `#science-inspector`; renaming would churn two gates for no behaviour change.

**`Inspector.test.tsx` assertions that change:**

| Current | Replacement |
|---|---|
| 450 tab labels `['概览','场景契约','引用']` | `['概览','图表','场景契约','引用']` |
| 451 tabIndex `[0,-1,-1]`; 452 three panels | `[0,-1,-1,-1]`; four panels |
| 458 `tabs[1].click()` → `.contract-panel` visible | `tabs[2].click()` |
| 461–467 focus `tabs[1]`, ArrowRight → `tabs[2]`, tabIndex `[-1,-1,0]` | focus `tabs[2]`, ArrowRight → `tabs[3]`, tabIndex `[-1,-1,-1,0]` |
| 469–473 Home from `tabs[2]` | Home from `tabs[3]` → `tabs[0]` |
| 475–478 ArrowLeft from `tabs[0]` → `tabs[2]` | → `tabs[3]` |
| 480–483 End from `tabs[2]` → `tabs[2]` | End from `tabs[3]` → `tabs[3]` |
| 304 `'等待已验证 metadata'` | `'等待已验证的元数据'` |

Every exact-markup `<dt>…</dt><dd>…</dd>`, `<span class="energy-pill">…</span>`, `<h2>暂无资产</h2>`/`<h2>计算中…</h2>`, coefficient-formatting and non-finite case (80–434) is unchanged and must stay green.

- [ ] **Step 1: Write the failing tests.** In `web/src/components/Inspector.test.tsx`: apply the table; add, after the imports, a mock so the charts tab is observable without its data hooks:

```ts
vi.mock('./charts/ChartsPanel', async () => {
  const { createElement: element } = await import('react')
  return { ChartsPanel: () => element('p', { 'data-mock-charts': '' }, 'charts') }
})
```

and add in `describe('Inspector disclosure')`:

```ts
  it('mounts the charts only while their tab is open, so a closed tab asks nothing', async () => {
    const tree = await mount(createElement(Inspector, { status: eigenstateStatus(-0.125) }))
    try {
      const tabs = Array.from(tree.container.querySelectorAll<HTMLButtonElement>('[role="tab"]'))
      expect(tree.container.querySelector('[data-mock-charts]')).toBeNull()
      await interact(() => tabs[1].click())
      expect(tree.container.querySelector('.charts-panel')?.hasAttribute('hidden')).toBe(false)
      expect(tree.container.querySelector('[data-mock-charts]')).not.toBeNull()
      await interact(() => tabs[0].click())
      expect(tree.container.querySelector('[data-mock-charts]')).toBeNull()
    } finally {
      await tree.unmount()
    }
  })

  it('floats as chrome with the arrived label and energy in its title row', () => {
    const markup = render(eigenstateStatus(-0.125))
    expect(markup).toContain('data-chrome=""')
    expect(markup).toContain('<h2>test eigenstate</h2>')
    expect(markup).toContain('<span class="energy-pill">-0.125000 Ha</span>')
    expect(markup).toContain('ψ(2, 1, 0) · complex basis')
  })
```

- [ ] **Step 2: Run and see them fail.**

Run: `npm --prefix web run test:watch -- run src/components/Inspector.test.tsx`
Expected: FAIL — three tabs instead of four; no `data-chrome`; subtitle text differs.

- [ ] **Step 3: Implement.** Restructure `web/src/components/Inspector.tsx`:

1. Imports become:

```tsx
import { AlertTriangle, Box, Database, Gauge, Sigma, X } from 'lucide-react'
import { type KeyboardEvent, useId, useRef, useState } from 'react'

import type { SceneStatus } from '../api/types'
import { ChartsPanel } from './charts/ChartsPanel'
import { formatFinite, formatFiniteUnit } from './format'
import { observableLabel, representationLabel } from './sceneStatus'
```

2. `formatSuperpositionTerms` and `formatFiniteGridMassStatus` stay as they are. The tab list becomes:

```tsx
type InspectorTab = 'overview' | 'charts' | 'contract' | 'references'

const INSPECTOR_TABS: { id: InspectorTab; label: string }[] = [
  { id: 'overview', label: '概览' },
  { id: 'charts', label: '图表' },
  { id: 'contract', label: '场景契约' },
  { id: 'references', label: '引用' },
]
```

3. In the component, the subtitle fallback becomes `'等待已验证的元数据'`; `tabId`, `panelId` and `handleTabKeyDown` are unchanged (they already iterate `INSPECTOR_TABS.length`). The returned tree becomes:

```tsx
  return (
    <aside
      id="science-inspector"
      className={`inspector-panel qv-glass${visible ? ' is-open' : ''}${mobileOpen ? ' mobile-open' : ''}`}
      aria-label="科学详情"
      aria-hidden={!visible}
      inert={!visible}
      data-chrome=""
      onKeyDown={(event) => {
        if (event.key !== 'Escape' || onClose === undefined) return
        event.preventDefault()
        event.stopPropagation()
        onClose()
      }}
    >
      <div className="qv-detail-head">
        <div className="qv-detail-title">
          <h2>{label ?? (status.loading ? '计算中…' : '暂无资产')}</h2>
          <p className="qv-detail-sub">{subtitle}</p>
        </div>
        <span className="energy-pill">
          {formatFiniteUnit(energy, { kind: 'fixed', digits: 6 }, 'Ha')}
        </span>
        {onClose === undefined ? null : (
          <button
            type="button"
            className="inspector-close qv-icon-button"
            onClick={onClose}
            aria-label="关闭科学详情"
            title="关闭科学详情"
          >
            <X size={17} aria-hidden="true" />
          </button>
        )}
      </div>

      <div className="inspector-tabs" role="tablist" aria-label="科学详情视图">
        {INSPECTOR_TABS.map((tab, index) => (
          <button
            type="button"
            role="tab"
            key={tab.id}
            id={tabId(tab.id)}
            ref={(node) => {
              tabRefs.current[index] = node
            }}
            aria-selected={activeTab === tab.id}
            aria-controls={panelId(tab.id)}
            tabIndex={activeTab === tab.id ? 0 : -1}
            className={activeTab === tab.id ? 'active' : ''}
            onClick={() => setActiveTab(tab.id)}
            onKeyDown={(event) => handleTabKeyDown(event, index)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="inspector-body">
        <section
          id={panelId('overview')}
          className="inspector-tab-panel overview-panel"
          role="tabpanel"
          aria-labelledby={tabId('overview')}
          hidden={activeTab !== 'overview'}
        >
          <div className="inspector-grid">
            {/* the four metric cards of today's lines 230–264, unchanged */}
          </div>
        </section>

        <section
          id={panelId('charts')}
          className="inspector-tab-panel charts-panel"
          role="tabpanel"
          aria-labelledby={tabId('charts')}
          hidden={activeTab !== 'charts'}
        >
          {/* Mounted only while open: the charts may fetch metadata, and a
              closed tab must not add requests to the page. */}
          {activeTab === 'charts' ? <ChartsPanel status={status} /> : null}
        </section>

        <section
          id={panelId('contract')}
          className="inspector-tab-panel contract-panel"
          role="tabpanel"
          aria-labelledby={tabId('contract')}
          hidden={activeTab !== 'contract'}
        >
          {/* today's <dl className="contract-list"> (lines 275–569), unchanged */}
        </section>

        <section
          id={panelId('references')}
          className="inspector-tab-panel references-panel"
          role="tabpanel"
          aria-labelledby={tabId('references')}
          hidden={activeTab !== 'references'}
        >
          {/* today's reference block (lines 579–588), unchanged */}
        </section>

        {/* today's error and warning cards (lines 591–596), unchanged */}
      </div>
    </aside>
  )
```

The four `{/* … unchanged */}` markers are cut-and-paste instructions, not new code: cut exactly those line ranges out of today's file and paste them in place of each marker, byte-for-byte (the exact-markup assertions in `Inspector.test.tsx:137-433` read them). The old `.inspector-tabbar` wrapper and the old in-panel `.state-title-row` are gone (their content moved to `.qv-detail-head`).

`web/src/lab.css` — append:

```css
/* ---- Detail panel (Inspector) ---- */
.inspector-panel {
  position: fixed;
  top: calc(var(--qv-header-h) + var(--qv-edge) + 56px);
  right: var(--qv-edge);
  z-index: 11;
  display: flex;
  flex-direction: column;
  width: var(--qv-detail-w);
  max-height: calc(100dvh - var(--qv-header-h) - var(--qv-edge) - 56px - var(--qv-bottom-band));
  border-radius: var(--qv-radius-panel);
  overflow: hidden;
}
.inspector-panel:not(.is-open) { display: none; }
.qv-detail-head { display: flex; align-items: flex-start; gap: 10px; padding: 18px 10px 8px 20px; }
.qv-detail-title { flex: 1; min-width: 0; }
.qv-detail-title h2 { font-size: 20px; font-weight: 500; overflow-wrap: anywhere; }
.qv-detail-sub { margin-top: 2px; color: var(--qv-text-2); font-size: 12px; }
.energy-pill {
  flex: 0 0 auto;
  margin-top: 2px;
  padding: 4px 10px;
  border: 1px solid var(--qv-border-strong);
  border-radius: var(--qv-radius-pill);
  color: var(--qv-text);
  font-size: 12px;
  font-weight: 500;
  white-space: nowrap;
}
.inspector-tabs { display: flex; gap: 2px; padding: 0 12px; border-bottom: 1px solid var(--qv-border); }
.inspector-tabs [role="tab"] {
  position: relative;
  height: 40px;
  padding: 0 10px;
  border: 0;
  background: transparent;
  color: var(--qv-text-2);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
}
.inspector-tabs [role="tab"][aria-selected="true"] { color: var(--qv-accent); }
.inspector-tabs [role="tab"][aria-selected="true"]::after {
  content: "";
  position: absolute;
  right: 8px;
  bottom: -1px;
  left: 8px;
  height: 3px;
  border-radius: 3px 3px 0 0;
  background: var(--qv-accent);
}
.inspector-body { padding: 12px 16px 16px; overflow-y: auto; scrollbar-width: thin; scrollbar-color: var(--qv-border-strong) transparent; }
.inspector-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.metric-card { display: grid; grid-template-columns: 18px 1fr; gap: 2px 6px; padding: 10px 12px; border-radius: 14px; background: var(--qv-band); }
.metric-card svg { grid-row: 1 / 3; color: var(--qv-accent); }
.metric-card span { color: var(--qv-text-3); font-size: 12px; }
.metric-card strong { font-size: 14px; font-weight: 500; overflow-wrap: anywhere; }
.contract-list { margin: 0; }
.contract-list div { display: flex; justify-content: space-between; gap: 12px; padding: 8px 4px; border-top: 1px solid rgba(255,255,255,.08); }
.contract-list dt { color: var(--qv-text-2); font-size: 12px; }
.contract-list dd { max-width: 62%; margin: 0; font-size: 12px; text-align: right; overflow-wrap: anywhere; }
.reference-block { display: grid; gap: 6px; padding: 10px 12px; border-radius: 14px; background: var(--qv-band); }
.reference-block span { color: var(--qv-text-3); font-size: 12px; }
.reference-block code { color: var(--qv-accent); font-family: var(--qv-font); font-size: 12px; overflow-wrap: anywhere; }
.inspector-empty { color: var(--qv-text-3); font-size: 13px; }
.warning-card {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin-top: 10px;
  padding: 10px 12px;
  border-left: 2px solid var(--qv-warn);
  border-radius: 0 10px 10px 0;
  background: rgba(253,214,99,.08);
  color: var(--qv-text-2);
  font-size: 12px;
  line-height: 1.5;
}
.warning-card.error { border-left-color: var(--qv-danger); background: rgba(242,139,130,.08); }
.warning-card svg { flex: 0 0 auto; color: var(--qv-warn); }
.warning-card.error svg { color: var(--qv-danger); }
.qv-detail-toggle {
  position: fixed;
  top: calc(var(--qv-header-h) + var(--qv-edge) + 56px);
  right: var(--qv-edge);
  z-index: 11;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  height: 40px;
  padding: 0 16px;
  border-radius: var(--qv-radius-pill);
  color: var(--qv-text);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
}

@media (max-width: 820px) {
  .inspector-panel {
    top: auto;
    right: 0;
    bottom: 0;
    left: 0;
    width: auto;
    height: var(--qv-drawer-h);
    max-height: none;
    border-radius: 24px 24px 0 0;
  }
  .qv-detail-toggle { top: auto; right: var(--qv-edge); bottom: var(--qv-edge); height: 48px; }
}
```

- [ ] **Step 4: Run and see them pass.**

Run: `npm --prefix web run test:watch -- run src/components/Inspector.test.tsx src/components/charts src/App.test.tsx`
Expected: PASS. `npm --prefix web run typecheck` → exit 0.

- [ ] **Step 5: Pre-commit gate, then commit.** Both gate commands must exit 0 — `test` runs all five stages (clean-coverage, `tsc -p tsconfig.test.json`, vitest with per-file 90/85/90/90, `assert-no-skips`, `assert-coverage-scope`); a failure is fixed inside this task before committing.

```powershell
npm --prefix web run test
npm --prefix web run typecheck
git add web/src/components/Inspector.tsx web/src/components/Inspector.test.tsx web/src/lab.css
git commit -m "feat(web): detail panel with title row and a lazily mounted charts tab" -m "Claude-Session: https://claude.ai/code/session_01E44DEzsc7Av26fc7nZ5rSo"
```

### Task D17: Legend pill (expandable) and the loading overlay as chrome

**Files:**
- Modify: `web/src/components/Legend.tsx` (whole file), `web/src/components/Legend.test.tsx:1,68,172` + new cases, `web/src/components/LoadingOverlay.tsx:4`, `web/src/components/LoadingOverlay.test.tsx:19-23`, `web/src/App.tsx:202` (bloom to the legend), `web/src/lab.css` (append)

**Interfaces:**
- Produces: `Legend(props: { status: SceneStatus; bloom?: number; defaultExpanded?: boolean })` → `div.legend[data-chrome][data-expanded][data-empty-flow?]` with `.legend-title`, `button.legend-toggle[aria-expanded][aria-controls]`, the key visual (`.phase-wheel`, `.real-legend`, `.diverging-ramp`, `.density-ramp`, `.speed-ramp`, `.phase-labels` — class names unchanged), and `.legend-details[hidden?]` with the explanatory sentences (always in the DOM). `LoadingOverlay` gains `data-chrome=""`.
- Branch logic and every sentence are unchanged except: the waiting text `等待 asset metadata。` → `等待资产元数据。` (copy deck), the speed sentence added in D2, and a new Bloom warning.

- [ ] **Step 1: Write the failing tests.** `web/src/components/Legend.test.tsx`: insert `/** @vitest-environment jsdom */` as line 1 (the toggle case mounts); line 68 `not.toContain('等待 asset metadata')` → `not.toContain('等待资产元数据')`; line 172 `toContain('等待 asset metadata')` → `toContain('等待资产元数据。')`; change the `react` import to `import { act, createElement } from 'react'` and add `import { mount } from '../test/mount'`; add:

```ts
describe('Legend as a pill', () => {
  it('floats as chrome and starts open unless the shell asks for a compact pill', () => {
    const open = render({ loading: false, metadata: eigenstateMetadata('point_cloud', 'real') })
    expect(open).toContain('data-chrome=""')
    expect(open).toContain('data-expanded="true"')

    const compact = renderToStaticMarkup(
      createElement(Legend, {
        status: { loading: false, metadata: eigenstateMetadata('point_cloud', 'real') },
        defaultExpanded: false,
      }),
    )
    expect(compact).toContain('data-expanded="false"')
    // Collapsed hides the sentences, never removes them.
    expect(compact).toMatch(/class="legend-details"[^>]*hidden=""/)
    expect(compact).toContain('|ψ|²d³r')
  })

  it('toggles its explanation and says which way', async () => {
    const tree = await mount(
      createElement(Legend, { status: { loading: false, metadata: eigenstateMetadata('isosurface', 'complex') } }),
    )
    try {
      const toggle = tree.container.querySelector<HTMLButtonElement>('.legend-toggle')
      const details = tree.container.querySelector<HTMLElement>('.legend-details')
      expect(toggle?.getAttribute('aria-expanded')).toBe('true')
      expect(toggle?.getAttribute('aria-controls')).toBe(details?.id)
      const scope = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
      scope.IS_REACT_ACT_ENVIRONMENT = true
      try {
        await act(async () => toggle?.click())
      } finally {
        delete scope.IS_REACT_ACT_ENVIRONMENT
      }
      expect(toggle?.getAttribute('aria-expanded')).toBe('false')
      expect(toggle?.getAttribute('aria-label')).toBe('展开图例说明')
      expect(details?.hidden).toBe(true)
      // The colour key itself stays visible when the pill is compact.
      expect(tree.container.querySelector('.phase-wheel')).not.toBeNull()
    } finally {
      await tree.unmount()
    }
  })

  it('warns that Bloom breaks the byte-exact key, only where Bloom is applied', () => {
    const slice = { ...sliceStatus('probability_density') }
    const withBloom = renderToStaticMarkup(createElement(Legend, { status: slice, bloom: 0.3 }))
    expect(withBloom).toContain('Bloom 已开启：屏幕颜色含光晕，不再与色带逐字一致。')
    expect(renderToStaticMarkup(createElement(Legend, { status: slice, bloom: 0 }))).not.toContain('Bloom 已开启')
    const cloud = { loading: false, metadata: eigenstateMetadata('point_cloud', 'complex') }
    expect(renderToStaticMarkup(createElement(Legend, { status: cloud, bloom: 0.3 }))).not.toContain('Bloom 已开启')
  })
})
```

`web/src/components/LoadingOverlay.test.tsx` — in `'names what it is waiting for when it is visible'` add `expect(markup).toContain('data-chrome=""')`.

- [ ] **Step 2: Run and see them fail.**

Run: `npm --prefix web run test:watch -- run src/components/Legend.test.tsx src/components/LoadingOverlay.test.tsx`
Expected: FAIL — no `data-chrome`, no `.legend-toggle`, no Bloom warning, waiting text differs.

- [ ] **Step 3: Implement.** `web/src/components/Legend.tsx` — whole file:

```tsx
import { ChevronUp } from 'lucide-react'
import { useId, useState, type ReactNode } from 'react'

import type { SceneStatus, SliceObservable } from '../api/types'
import { representationLabel } from './sceneStatus'

/** What an absent or non-finite number is shown as. Never "NaN", never a guess. */
const PLACEHOLDER = '—'

/** A reported number with its unit (three significant figures), or the placeholder. */
function amountWithUnit(value: number, unit: string, separator = ' '): string {
  if (!Number.isFinite(value)) return PLACEHOLDER
  const text = value.toPrecision(3)
  return unit === '' ? text : `${text}${separator}${unit}`
}

/**
 * The title of a slice legend, keyed on the SLICE observable (never on the
 * coarser metadata observable); a Record so a fifth observable is a compile error.
 */
const SLICE_TITLES: Record<SliceObservable, string> = {
  phase: '波函数 phase',
  wavefunction_real: '平面上的 Re ψ',
  wavefunction_imag: '平面上的 Im ψ',
  probability_density: '概率密度 |ψ|²',
}

interface LegendKey {
  visual: ReactNode
  text: ReactNode
}

/** The ramp and the sentence for one slice observable -- the maps sliceTexture.ts applies. */
function sliceKey(status: SceneStatus): LegendKey {
  const observable = status.sliceObservable
  const unit = status.sliceValueUnit ?? ''
  const extreme = amountWithUnit(status.sliceMaxAbsValue ?? Number.NaN, unit)

  if (observable === 'phase') {
    return {
      visual: (
        <>
          <div className="phase-wheel" />
          <div className="phase-labels"><span>−π</span><span>0</span><span>π</span></div>
        </>
      ),
      text: (
        <p>
          透明 texel 属于 mask：|ψ| 低于阈值，此处 arg ψ 未定义；这不是节点。该平面有{' '}
          {amountWithUnit((status.phaseMaskedFraction ?? Number.NaN) * 100, '%', '')} 被 mask。
        </p>
      ),
    }
  }
  if (observable === 'wavefunction_real' || observable === 'wavefunction_imag') {
    return {
      visual: (
        <>
          <div className="diverging-ramp" />
          <div className="phase-labels"><span>−A</span><span>0</span><span>+A</span></div>
        </>
      ),
      text: (
        <p>
          A = {extreme}，即该平面最大的 |value|；颜色对有符号 value 线性映射并按 A
          归一化，因此青色与红色表示等振幅、反符号。
        </p>
      ),
    }
  }
  if (observable === 'probability_density') {
    return {
      visual: (
        <>
          <div className="density-ramp" />
          <div className="phase-labels"><span>0</span><span>max</span></div>
        </>
      ),
      text: (
        <p>
          max = {extreme}；亮度 ∝ |ψ|/max|ψ|，即概率密度的平方根，不与 density 本身成正比。
        </p>
      ),
    }
  }
  return { visual: null, text: <p>该切片没有报告 observable，因此无法为其颜色命名。</p> }
}

function LegendFrame({
  title,
  emptyFlow,
  visual,
  defaultExpanded,
  children,
}: {
  title: string
  emptyFlow?: string
  visual?: ReactNode
  defaultExpanded: boolean
  children: ReactNode
}) {
  const [expanded, setExpanded] = useState(defaultExpanded)
  const detailsId = useId()
  return (
    <div
      className="legend qv-glass"
      data-chrome=""
      data-empty-flow={emptyFlow}
      data-expanded={expanded ? 'true' : 'false'}
    >
      <div className="legend-head">
        <div className="legend-title">{title}</div>
        <button
          type="button"
          className="legend-toggle"
          aria-expanded={expanded}
          aria-controls={detailsId}
          aria-label={expanded ? '收起图例说明' : '展开图例说明'}
          onClick={() => setExpanded((current) => !current)}
        >
          <ChevronUp size={16} aria-hidden="true" />
        </button>
      </div>
      {visual}
      <div className="legend-details" id={detailsId} hidden={!expanded}>
        {children}
      </div>
    </div>
  )
}

export interface LegendProps {
  status: SceneStatus
  /** The store's Bloom; > 0 on a slice or streamlines means the key is no longer byte-exact. */
  bloom?: number
  defaultExpanded?: boolean
}

/**
 * The bottom-right legend pill. It must describe the asset actually on screen:
 * a phase wheel over streamlines, whose colour encodes speed, would misname the
 * one thing a legend exists to name.
 */
export function Legend({ status, bloom = 0, defaultExpanded = true }: LegendProps) {
  const basis = status.metadata?.state.basis ?? status.superposition?.basis
  const representation = status.metadata?.representation ?? status.superposition?.representation
  const bloomWarning =
    bloom > 0 && (representation === 'slice' || representation === 'streamlines') ? (
      <p data-bloom-warning="">Bloom 已开启：屏幕颜色含光晕，不再与色带逐字一致。</p>
    ) : null

  if (status.unavailable !== undefined) {
    return (
      <LegendFrame title="无可绘制资产" defaultExpanded={defaultExpanded}>
        <p>
          <strong>{representationLabel(status.unavailable.kind)}</strong> 对当前量子态不可用。{' '}
          {status.unavailable.reason}
        </p>
      </LegendFrame>
    )
  }

  if (representation === 'slice') {
    const key = sliceKey(status)
    return (
      <LegendFrame
        title={status.sliceObservable === undefined ? '平面切片' : SLICE_TITLES[status.sliceObservable]}
        visual={key.visual}
        defaultExpanded={defaultExpanded}
      >
        {key.text}
        <p>在过原点的 {status.plane ?? '未报告'} 平面采样；使用 nearest-sample 颜色，无插值。</p>
        {bloomWarning}
      </LegendFrame>
    )
  }

  if (
    representation === 'streamlines' &&
    status.superposition !== undefined &&
    status.continuityScaleKind === 'analytic_zero_current'
  ) {
    return (
      <LegendFrame title="解析零概率流" emptyFlow="analytic_zero_current" defaultExpanded={defaultExpanded}>
        <p>
          该叠加态的概率流经解析判据严格为零，因此服务端有意返回空流线；空视图不是加载失败，
          也没有可供颜色编码的 |j|/ρ 速率。
        </p>
      </LegendFrame>
    )
  }

  if (
    representation === 'streamlines' &&
    status.lineCount === 0 &&
    status.continuityScaleKind !== 'analytic_zero_current'
  ) {
    return (
      <LegendFrame
        title="当前时刻无可绘制流线"
        emptyFlow="instantaneous_empty_current"
        defaultExpanded={defaultExpanded}
      >
        <p>
          服务端在该时刻没有解析出可绘制的概率流线。这是已到达的空场结果，不是加载失败；
          当前也没有可供颜色编码的 |j|/ρ 速率。
        </p>
      </LegendFrame>
    )
  }

  if (representation === 'streamlines') {
    return (
      <LegendFrame
        title="概率流速率 |j|/ρ"
        defaultExpanded={defaultExpanded}
        visual={
          <>
            <div className="speed-ramp" />
            <div className="phase-labels">
              <span>0</span>
              <span>{status.maxSpeed !== undefined ? `${status.maxSpeed.toPrecision(3)} a.u.` : 'max'}</span>
            </div>
          </>
        }
      >
        <p>色带横轴为 √(|j|/ρ ÷ max)：中点对应 max 的 1/4；颜色在两端色之间按线性光插值。</p>
        <p>
          <strong>j</strong>/ρ 的 streamlines 按弧长等距采样；颜色表示速率，不表示 phase。
          这些是概率流线，不是电子轨迹。
        </p>
        {bloomWarning}
      </LegendFrame>
    )
  }

  return (
    <LegendFrame
      title="波函数 phase"
      defaultExpanded={defaultExpanded}
      visual={
        basis !== 'complex' ? (
          <div className="real-legend">
            <span><i className="phase-dot red" /> phase 0</span>
            <span><i className="phase-dot cyan" /> phase π</span>
          </div>
        ) : (
          <>
            <div className="phase-wheel" />
            <div className="phase-labels"><span>−π</span><span>0</span><span>π</span></div>
          </>
        )
      }
    >
      <p>
        {representation === 'point_cloud'
          ? '位置从 |ψ|²d³r 采样；每个 marker 具有相同视觉权重。'
          : representation === 'isosurface'
            ? '几何是 |ψ|² level set；颜色承载 phase。'
            : '等待资产元数据。'}
      </p>
    </LegendFrame>
  )
}
```

`web/src/components/LoadingOverlay.tsx` line 4 → `<div className="loading-overlay qv-glass-strong" data-chrome="">`.

`web/src/App.tsx` — add `const bloom = useSceneStore((state) => state.bloom)` (import `useSceneStore` from `./state/useSceneStore`) and pass it: `<Legend status={status} bloom={bloom} />`.

`web/src/lab.css` — append:

```css
/* ---- Legend pill ---- */
.legend {
  position: fixed;
  right: var(--qv-edge);
  bottom: 24px;
  z-index: 10;
  width: 280px;
  padding: 10px 12px 12px 14px;
  border-radius: 22px;
}
.legend-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 8px; }
.legend-title { font-size: 13px; font-weight: 500; }
.legend-toggle {
  display: grid;
  flex: 0 0 auto;
  place-items: center;
  width: 28px;
  height: 28px;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: var(--qv-text-2);
  cursor: pointer;
}
.legend-toggle:hover { background: rgba(255,255,255,.08); color: var(--qv-text); }
.legend-toggle svg { transition: transform .15s ease; }
.legend[data-expanded="true"] .legend-toggle svg { transform: rotate(180deg); }
.legend-details { margin-top: 8px; }
.legend p { color: var(--qv-text-2); font-size: 12px; line-height: 1.5; }
.legend p + p { margin-top: 6px; }
.phase-labels { display: flex; justify-content: space-between; margin-top: 4px; color: var(--qv-text-3); font-size: 11px; }
.real-legend { display: flex; justify-content: space-between; gap: 8px; color: var(--qv-text-2); font-size: 12px; }
.real-legend span { display: inline-flex; align-items: center; gap: 6px; }
.qv-app[data-embed="true"] .legend { right: 12px; bottom: 12px; width: 240px; }

/* ---- Loading overlay ---- */
.loading-overlay {
  position: fixed;
  top: 50%;
  left: 50%;
  z-index: 9;
  display: grid;
  justify-items: center;
  gap: 8px;
  padding: 20px 28px;
  border-radius: 24px;
  pointer-events: none;
  transform: translate(-50%, -50%);
}
.loading-overlay strong { font-size: 13px; font-weight: 500; }
.loading-overlay span { color: var(--qv-text-2); font-size: 12px; }
.loader-orbit { position: relative; width: 44px; height: 44px; }
.loader-orbit i { position: absolute; inset: 0; border: 1px solid var(--qv-border-strong); border-radius: 50%; animation: qv-orbit 1.8s linear infinite; }
.loader-orbit i:nth-child(2) { border-color: var(--qv-accent); transform: rotate(60deg) scaleY(.5); animation-duration: 2.3s; }
.loader-orbit i:nth-child(3) { transform: rotate(-60deg) scaleY(.5); animation-duration: 1.45s; }
@keyframes qv-orbit { to { rotate: 360deg; } }

@media (max-width: 820px) {
  .legend {
    top: calc(var(--qv-header-h) + 8px);
    right: 64px;
    bottom: auto;
    width: auto;
    max-width: calc(100vw - 88px);
    padding: 4px 6px;
    border-radius: var(--qv-radius-pill);
  }
  .legend:not([data-expanded="true"]) .legend-title { max-width: 96px; overflow: hidden; font-size: 12px; white-space: nowrap; text-overflow: ellipsis; }
  .legend:not([data-expanded="true"]) .legend-head { margin-bottom: 0; }
  .legend:not([data-expanded="true"]) > :not(.legend-head) { display: none; }
  .legend[data-expanded="true"] { width: min(300px, calc(100vw - 88px)); padding: 10px 12px; border-radius: 18px; }
}
```

- [ ] **Step 4: Run and see them pass.**

Run: `npm --prefix web run test:watch -- run src/components/Legend.test.tsx src/components/LoadingOverlay.test.tsx src/App.test.tsx src/scene/speedColor.test.ts src/scene/color.test.ts`
Expected: PASS (the ramp tests read `styles.css`, untouched here). `npm --prefix web run typecheck` → exit 0.

- [ ] **Step 5: Pre-commit gate, then commit.** Both gate commands must exit 0 — `test` runs all five stages (clean-coverage, `tsc -p tsconfig.test.json`, vitest with per-file 90/85/90/90, `assert-no-skips`, `assert-coverage-scope`); a failure is fixed inside this task before committing.

```powershell
npm --prefix web run test
npm --prefix web run typecheck
git add web/src/components/Legend.tsx web/src/components/Legend.test.tsx web/src/components/LoadingOverlay.tsx web/src/components/LoadingOverlay.test.tsx web/src/App.tsx web/src/lab.css
git commit -m "feat(web): expandable legend pill with a Bloom honesty warning" -m "Claude-Session: https://claude.ai/code/session_01E44DEzsc7Av26fc7nZ5rSo"
```

### Task D18: "查找量子态" search pill (combobox + listbox)

**Files:**
- Create: `web/src/components/SearchPill.tsx`, `web/src/components/SearchPill.test.tsx`
- Modify: `web/src/components/stateIndex.ts` (append the index), `web/src/components/stateIndex.test.ts` (append), `web/src/lab.css` (append), `web/coverage-scope.json`

**Interfaces:**
- Consumes: `useCatalogs()` (D9 — no fetch of its own), `capabilityFor` (static availability probe), `runtimeMode()` (Part B), store actions `setMode`, `applyPreset`, `setSuperposition(terms, label, sliceResolutionFloor, streamlineSeedCountMax, defaultRepresentation)` (A11 — the pill forwards the entry's `default_representation`), `SuperpositionPreset.default_representation` (A10).
- Produces (`src/components/stateIndex.ts`, appended):
  ```ts
  export function orbitalName(n: number, l: number, m: number, basis: BasisKind): string
  export type SearchEntryKind = 'preset' | 'eigenstate' | 'superposition'
  export interface SearchEntry { id: string; kind: SearchEntryKind; label: string; tags: readonly string[]; haystack: string; orbital?: Omit<OrbitalParameters, 'z'> & { z?: number }; mixture?: SuperpositionPreset }
  export function buildSearchEntries(input: { presets: readonly OrbitalPreset[]; mixtures: readonly SuperpositionPreset[]; maxN: number; isAvailable: (orbital: OrbitalParameters) => boolean }): SearchEntry[]
  export function searchEntries(entries: readonly SearchEntry[], query: string, limit?: number): SearchEntry[]
  ```
- Produces (`src/components/SearchPill.tsx`): `SearchPill()` → `div.qv-search[data-chrome]`; closed: `button.qv-search-pill[aria-haspopup=listbox][aria-expanded=false]` named `查找量子态`; open: `input[role=combobox][aria-controls][aria-activedescendant][aria-autocomplete=list][aria-label=查找量子态]`, `ul[role=listbox]` of `li[role=option][aria-selected][data-entry]`, empty `p[role=status]`.

Scope per mode: live — catalogue presets + all superposition presets + every eigenstate with n ≤ 4 (both bases; m = 0 listed once, in the real basis, where the two bases are the same function); static — the same, but n ≤ 8 filtered by the capability overlay, i.e. exactly the precomputed states (Part B's overlay refuses the rest).

- [ ] **Step 1: Write the failing tests.**

Append to `web/src/components/stateIndex.test.ts`:

```ts
import type { OrbitalPreset, SuperpositionPreset } from '../api/types'
import { buildSearchEntries, orbitalName, searchEntries } from './stateIndex'

const PRESETS: OrbitalPreset[] = [
  { id: '2pz', label: '2p_z', n: 2, l: 1, m: 0, basis: 'real', z: 1 },
  { id: '3d-complex', label: '3d, m=2', n: 3, l: 2, m: 2, basis: 'complex', z: 1 },
]
const MIXTURES: SuperpositionPreset[] = [
  {
    id: '1s-2pz',
    label: '1s + 2p_z (Bohr oscillation)',
    terms: '1,0,0,0.7071067811865476;2,1,0,0.7071067811865476',
    period_au: 16.755160819145562,
    note: 'Bohr',
    slice_resolution_floor: 65,
    streamline_seed_count_max: 40,
    default_representation: 'isosurface',
  },
  {
    id: '2s-2pz',
    label: '2s + 2p_z (degenerate, stationary)',
    terms: '2,0,0,0.7071067811865476;2,1,0,0.7071067811865476',
    period_au: 0,
    note: 'control',
    slice_resolution_floor: 65,
    streamline_seed_count_max: 40,
    // A10: the only preset whose route-default isosurface the server refuses.
    default_representation: 'slice',
  },
]

describe('orbitalName', () => {
  it('names real p and d orbitals by their Cartesian label, the rest by m', () => {
    expect(orbitalName(1, 0, 0, 'real')).toBe('1s')
    expect(orbitalName(2, 1, 1, 'real')).toBe('2p_x')
    expect(orbitalName(2, 1, -1, 'real')).toBe('2p_y')
    expect(orbitalName(2, 1, 0, 'real')).toBe('2p_z')
    expect(orbitalName(3, 2, 0, 'real')).toBe('3d_z²')
    expect(orbitalName(3, 2, 1, 'real')).toBe('3d_xz')
    expect(orbitalName(3, 2, -1, 'real')).toBe('3d_yz')
    expect(orbitalName(3, 2, 2, 'real')).toBe('3d_x²−y²')
    expect(orbitalName(3, 2, -2, 'real')).toBe('3d_xy')
    expect(orbitalName(4, 3, 1, 'real')).toBe('4f, m=+1')
    expect(orbitalName(2, 1, -1, 'complex')).toBe('2p, m=-1')
    expect(orbitalName(8, 7, 0, 'complex')).toBe('8k, m=0')
  })
})

describe('buildSearchEntries / searchEntries', () => {
  const entries = buildSearchEntries({ presets: PRESETS, mixtures: MIXTURES, maxN: 4, isAvailable: () => true })

  it('lists presets, then superpositions, then every n ≤ 4 state once', () => {
    // Σn² = 30 real states + 20 complex m ≠ 0 states, minus the two presets.
    expect(entries.filter((entry) => entry.kind === 'eigenstate')).toHaveLength(48)
    expect(entries.slice(0, 4).map((entry) => entry.kind)).toEqual(['preset', 'preset', 'superposition', 'superposition'])
    expect(entries[0].tags).toEqual(['预设', '实基'])
    expect(entries[3]).toMatchObject({ label: '2s + 2p_z · 简并定态', tags: ['叠加', '简并'] })
    expect(entries.some((entry) => entry.id === 'eig-2-1-0-real')).toBe(false)
    expect(entries.some((entry) => entry.id === 'eig-2-1-0-complex')).toBe(false)
  })

  it('keeps only what the capability matrix can draw', () => {
    const onlyN1 = buildSearchEntries({
      presets: [],
      mixtures: [],
      maxN: 8,
      isAvailable: (orbital) => orbital.n === 1,
    })
    expect(onlyN1.map((entry) => entry.label)).toEqual(['1s'])
  })

  it('matches every typed token, ignoring case, spaces, underscores and superscripts', () => {
    expect(searchEntries(entries, '3dxy').map((entry) => entry.label)).toEqual(['3d_xy'])
    expect(searchEntries(entries, '3dz2').map((entry) => entry.label)).toEqual(['3d_z²'])
    expect(searchEntries(entries, 'BOHR').map((entry) => entry.id)).toEqual(['mix-1s-2pz'])
    expect(searchEntries(entries, '叠加').every((entry) => entry.kind === 'superposition')).toBe(true)
    expect(searchEntries(entries, 'complex n=2').map((entry) => entry.label)).toEqual(['2p, m=-1', '2p, m=+1'])
    expect(searchEntries(entries, '')).toHaveLength(40)
    expect(searchEntries(entries, '', 5)).toHaveLength(5)
    expect(searchEntries(entries, 'zzz')).toEqual([])
  })
})
```

`web/src/components/SearchPill.test.tsx`:

```ts
/** @vitest-environment jsdom */
import { act, createElement } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { resetCatalogs } from '../state/catalogs'
import { useSceneStore } from '../state/useSceneStore'
import { mount, type MountedTree } from '../test/mount'
import { SearchPill } from './SearchPill'

const runtime = vi.hoisted(() => ({ current: 'live' as 'live' | 'static' }))
vi.mock('../api/runtimeMode', () => ({ runtimeMode: () => runtime.current }))
vi.mock('../api/client', () => ({
  fetchCatalog: () =>
    Promise.resolve([{ id: '2pz', label: '2p_z', n: 2, l: 1, m: 0, basis: 'real', z: 1 }]),
  fetchSuperpositionCatalog: () =>
    Promise.resolve([
      {
        id: '1s-2pz',
        label: '1s + 2p_z (Bohr oscillation)',
        terms: '1,0,0,0.7071067811865476;2,1,0,0.7071067811865476',
        period_au: 16.755160819145562,
        note: 'Bohr',
        slice_resolution_floor: 65,
        streamline_seed_count_max: 40,
        default_representation: 'isosurface',
      },
      {
        id: '2s-2pz',
        label: '2s + 2p_z (degenerate, stationary)',
        terms: '2,0,0,0.7071067811865476;2,1,0,0.7071067811865476',
        period_au: 0,
        note: 'control',
        slice_resolution_floor: 65,
        streamline_seed_count_max: 40,
        default_representation: 'slice',
      },
    ]),
}))

const PRISTINE = useSceneStore.getState()

beforeEach(() => {
  runtime.current = 'live'
  resetCatalogs()
  useSceneStore.setState(PRISTINE, true)
})

async function interact(body: () => void): Promise<void> {
  const scope = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  scope.IS_REACT_ACT_ENVIRONMENT = true
  try {
    await act(async () => {
      body()
    })
  } finally {
    delete scope.IS_REACT_ACT_ENVIRONMENT
  }
}

async function openSearch(): Promise<MountedTree> {
  const tree = await mount(createElement(SearchPill))
  await interact(() => undefined) // catalogues settle
  await interact(() => tree.container.querySelector<HTMLButtonElement>('.qv-search-pill')?.click())
  return tree
}

const input = (tree: MountedTree): HTMLInputElement => {
  const node = tree.container.querySelector<HTMLInputElement>('input[role="combobox"]')
  if (node === null) throw new Error('the search is not open')
  return node
}

async function type(tree: MountedTree, text: string): Promise<void> {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
  await interact(() => {
    setter?.call(input(tree), text)
    input(tree).dispatchEvent(new Event('input', { bubbles: true }))
  })
}

async function key(tree: MountedTree, name: string): Promise<void> {
  await interact(() => {
    input(tree).dispatchEvent(new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true }))
  })
}

const options = (tree: MountedTree): HTMLLIElement[] =>
  Array.from(tree.container.querySelectorAll<HTMLLIElement>('[role="option"]'))

describe('SearchPill', () => {
  it('is a single 查找量子态 pill until it is opened', async () => {
    const tree = await mount(createElement(SearchPill))
    try {
      const pill = tree.container.querySelector<HTMLButtonElement>('.qv-search-pill')
      expect(pill?.textContent).toContain('查找量子态')
      expect(pill?.getAttribute('aria-expanded')).toBe('false')
      expect(tree.container.querySelector('.qv-search')?.hasAttribute('data-chrome')).toBe(true)
      expect(tree.container.querySelector('[role="listbox"]')).toBeNull()
    } finally {
      await tree.unmount()
    }
  })

  it('opens a focused combobox over presets, superpositions and n ≤ 4 states', async () => {
    const tree = await openSearch()
    try {
      expect(document.activeElement).toBe(input(tree))
      expect(input(tree).getAttribute('aria-controls')).toBe(tree.container.querySelector('[role="listbox"]')?.id)
      expect(options(tree)).toHaveLength(40)
      expect(options(tree)[0].textContent).toContain('2p_z')
      expect(options(tree)[0].textContent).toContain('预设')
      expect(options(tree)[1].textContent).toContain('1s + 2p_z · Bohr 振荡')
      expect(options(tree)[0].getAttribute('aria-selected')).toBe('true')
    } finally {
      await tree.unmount()
    }
  })

  it('filters as you type and says so when nothing matches', async () => {
    const tree = await openSearch()
    try {
      await type(tree, '3dxy')
      expect(options(tree).map((option) => option.dataset.entry)).toEqual(['eig-3-2--2-real'])
      await type(tree, 'zzz')
      expect(options(tree)).toHaveLength(0)
      expect(tree.container.querySelector('[role="status"]')?.textContent).toBe('没有匹配的量子态。')
      expect(input(tree).hasAttribute('aria-activedescendant')).toBe(false)
    } finally {
      await tree.unmount()
    }
  })

  it('moves the active option with the keyboard and applies it with Enter', async () => {
    const tree = await openSearch()
    try {
      await type(tree, 'complex n=2')
      const [first, second] = options(tree)
      await key(tree, 'ArrowDown')
      expect(input(tree).getAttribute('aria-activedescendant')).toBe(second.id)
      expect(second.getAttribute('aria-selected')).toBe('true')
      await key(tree, 'ArrowDown')
      expect(input(tree).getAttribute('aria-activedescendant')).toBe(second.id)
      await key(tree, 'Home')
      expect(input(tree).getAttribute('aria-activedescendant')).toBe(first.id)
      await key(tree, 'ArrowUp')
      expect(input(tree).getAttribute('aria-activedescendant')).toBe(first.id)
      await key(tree, 'End')
      await key(tree, 'Enter')

      expect(useSceneStore.getState().mode).toBe('eigenstate')
      expect(useSceneStore.getState().orbital).toMatchObject({ n: 2, l: 1, m: 1, basis: 'complex' })
      expect(tree.container.querySelector('[role="listbox"]')).toBeNull()
      expect(document.activeElement).toBe(tree.container.querySelector('.qv-search-pill'))
    } finally {
      await tree.unmount()
    }
  })

  it('applies a superposition picked with the pointer', async () => {
    const tree = await openSearch()
    try {
      await type(tree, 'bohr')
      await interact(() => options(tree)[0].click())
      expect(useSceneStore.getState().mode).toBe('superposition')
      expect(useSceneStore.getState().superpositionTerms).toBe(
        '1,0,0,0.7071067811865476;2,1,0,0.7071067811865476',
      )
    } finally {
      await tree.unmount()
    }
  })

  it('opens a searched preset on the picture its catalogue entry publishes (A11, 2s-2pz)', async () => {
    // From an eigenstate: setSuperposition records the default, and the mode
    // switch that follows opens on it -- a slice, not a refused isosurface.
    useSceneStore.setState({ mode: 'eigenstate', representation: 'point_cloud' })
    const tree = await openSearch()
    try {
      await type(tree, 'degenerate')
      expect(options(tree).map((option) => option.dataset.entry)).toEqual(['mix-2s-2pz'])
      await interact(() => options(tree)[0].click())
      const state = useSceneStore.getState()
      expect(state.mode).toBe('superposition')
      expect(state.superpositionDefaultRepresentation).toBe('slice')
      expect(state.representation).toBe('slice')
    } finally {
      await tree.unmount()
    }
  })

  it('closes on Escape or when focus leaves, changing nothing', async () => {
    const before = useSceneStore.getState().orbital
    const tree = await openSearch()
    const outside = document.createElement('button')
    document.body.appendChild(outside)
    try {
      await key(tree, 'Escape')
      expect(tree.container.querySelector('[role="listbox"]')).toBeNull()
      expect(document.activeElement).toBe(tree.container.querySelector('.qv-search-pill'))

      await interact(() => tree.container.querySelector<HTMLButtonElement>('.qv-search-pill')?.click())
      await interact(() => outside.focus())
      expect(tree.container.querySelector('[role="listbox"]')).toBeNull()
      expect(useSceneStore.getState().orbital).toEqual(before)

      await interact(() => tree.container.querySelector<HTMLButtonElement>('.qv-search-pill')?.click())
      await interact(() => tree.container.querySelector<HTMLButtonElement>('button[aria-label="关闭查找"]')?.click())
      expect(tree.container.querySelector('[role="listbox"]')).toBeNull()
    } finally {
      outside.remove()
      await tree.unmount()
    }
  })

  it('offers every precomputed state, up to n = 8, in the static build', async () => {
    runtime.current = 'static'
    const tree = await openSearch()
    try {
      await type(tree, '8s')
      expect(options(tree).map((option) => option.textContent)).toContain('8s本征实基')
    } finally {
      await tree.unmount()
    }
  })
})
```

- [ ] **Step 2: Run and see them fail.**

Run: `npm --prefix web run test:watch -- run src/components/stateIndex.test.ts src/components/SearchPill.test.tsx`
Expected: FAIL — `orbitalName`, `buildSearchEntries`, `searchEntries`, `SearchPill` do not exist.

- [ ] **Step 3: Implement.** Append to `web/src/components/stateIndex.ts` (and add the type import at the top):

```ts
import type {
  BasisKind,
  OrbitalParameters,
  OrbitalPreset,
  SuperpositionPreset,
} from '../api/types'

/** Spectroscopic letters for ℓ = 0..7 (j is skipped by convention). */
const L_LETTERS = ['s', 'p', 'd', 'f', 'g', 'h', 'i', 'k'] as const

/**
 * Real-basis Cartesian names, per hydrogenic.py's real_spherical_harmonic:
 * m = +1 is x-like, m = −1 is y-like, |m| = 2 are x²−y² / xy.
 */
const REAL_NAMES: Readonly<Record<string, string>> = {
  '1,1': 'p_x',
  '1,-1': 'p_y',
  '1,0': 'p_z',
  '2,0': 'd_z²',
  '2,1': 'd_xz',
  '2,-1': 'd_yz',
  '2,2': 'd_x²−y²',
  '2,-2': 'd_xy',
}

const BASIS_TAG: Readonly<Record<BasisKind, string>> = { real: '实基', complex: '复基' }

export function orbitalName(n: number, l: number, m: number, basis: BasisKind): string {
  if (l === 0) return `${n}s`
  if (basis === 'real') {
    const named = REAL_NAMES[`${l},${m}`]
    if (named !== undefined) return `${n}${named}`
  }
  return `${n}${L_LETTERS[l] ?? `ℓ${l}`}, m=${m > 0 ? `+${m}` : m}`
}

export type SearchEntryKind = 'preset' | 'eigenstate' | 'superposition'

export interface SearchEntry {
  id: string
  kind: SearchEntryKind
  label: string
  tags: readonly string[]
  /** Normalised alternatives joined by U+0001, so no token matches across two of them. */
  haystack: string
  orbital?: Omit<OrbitalParameters, 'z'> & { z?: number }
  mixture?: SuperpositionPreset
}

/** Lower-case, and drop what people leave out when typing a state's name. */
function normalise(text: string): string {
  return text
    .toLowerCase()
    .replaceAll('²', '2')
    .replaceAll('−', '-')
    .replace(/[\s_·,()（）|⟩⟨]+/g, '')
}

const haystack = (...alternatives: string[]): string => alternatives.map(normalise).join('\u0001')

function stateWords(n: number, l: number, m: number, basis: BasisKind): string[] {
  return [
    orbitalName(n, l, m, basis),
    `${n}${L_LETTERS[l] ?? ''}`,
    `n=${n}`,
    `l=${l}`,
    `ℓ=${l}`,
    `m=${m}`,
    `ψ(${n},${l},${m})`,
    basis === 'real' ? '实基 real' : '复基 complex',
  ]
}

/**
 * Everything the search offers, in display order: catalogue presets, the
 * superposition presets, then every eigenstate up to `maxN` that
 * `isAvailable` accepts. A state already offered as a preset is not repeated;
 * m = 0 is listed once (real basis), since both bases give the same function.
 */
export function buildSearchEntries({
  presets,
  mixtures,
  maxN,
  isAvailable,
}: {
  presets: readonly OrbitalPreset[]
  mixtures: readonly SuperpositionPreset[]
  maxN: number
  isAvailable: (orbital: OrbitalParameters) => boolean
}): SearchEntry[] {
  const entries: SearchEntry[] = []
  const offered = new Set<string>()
  const key = (n: number, l: number, m: number, basis: BasisKind): string => `${n},${l},${m},${basis}`

  for (const preset of presets) {
    offered.add(key(preset.n, preset.l, preset.m, preset.basis))
    entries.push({
      id: `preset-${preset.id}`,
      kind: 'preset',
      label: preset.label,
      tags: ['预设', BASIS_TAG[preset.basis]],
      haystack: haystack(preset.label, '预设', ...stateWords(preset.n, preset.l, preset.m, preset.basis)),
      orbital: {
        n: preset.n,
        l: preset.l,
        m: preset.m,
        basis: preset.basis,
        ...(preset.z === undefined ? {} : { z: preset.z }),
      },
    })
  }

  for (const mixture of mixtures) {
    const label = MIXTURE_COPY[mixture.id]?.label ?? mixture.label
    entries.push({
      id: `mix-${mixture.id}`,
      kind: 'superposition',
      label,
      tags: mixture.period_au === 0 ? ['叠加', '简并'] : ['叠加'],
      haystack: haystack(label, mixture.label, mixture.id, '叠加 superposition'),
      mixture,
    })
  }

  for (let n = 1; n <= maxN; n += 1) {
    for (let l = 0; l < n; l += 1) {
      for (let m = -l; m <= l; m += 1) {
        for (const basis of ['real', 'complex'] as const) {
          if (m === 0 && basis === 'complex') continue
          if (offered.has(key(n, l, m, basis))) continue
          if (!isAvailable({ n, l, m, z: 1, basis })) continue
          entries.push({
            id: `eig-${n}-${l}-${m}-${basis}`,
            kind: 'eigenstate',
            label: orbitalName(n, l, m, basis),
            tags: ['本征', BASIS_TAG[basis]],
            haystack: haystack('本征 eigenstate', ...stateWords(n, l, m, basis)),
            orbital: { n, l, m, basis },
          })
        }
      }
    }
  }
  return entries
}

/** Entries matching every whitespace-separated token of `query`, at most `limit`. */
export function searchEntries(entries: readonly SearchEntry[], query: string, limit = 40): SearchEntry[] {
  const tokens = query
    .split(/\s+/)
    .map(normalise)
    .filter((token) => token !== '')
  const matches =
    tokens.length === 0
      ? entries
      : entries.filter((entry) => tokens.every((token) => entry.haystack.includes(token)))
  return matches.slice(0, limit)
}
```

(`'complex n=2'` → tokens `complex`, `n=2`: the two complex p states, m = −1 then +1 in build order.)

`web/src/components/SearchPill.tsx`:

```tsx
import { Search, X } from 'lucide-react'
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react'

import { capabilityFor } from '../api/capability'
import { runtimeMode } from '../api/runtimeMode'
import type { OrbitalParameters } from '../api/types'
import { useCatalogs } from '../state/catalogs'
import { useSceneStore } from '../state/useSceneStore'
import { buildSearchEntries, searchEntries, type SearchEntry } from './stateIndex'

/** A state the static catalogue (or the live server) can actually draw. */
const drawable = (orbital: OrbitalParameters): boolean =>
  capabilityFor({ mode: 'eigenstate', orbital, representation: 'point_cloud' }).status === 'available'

/**
 * The top-right "查找量子态" pill. Opens into an ARIA 1.2 combobox: the input
 * keeps focus, aria-activedescendant names the active option, Enter applies it,
 * Escape (or focus leaving) closes without changing anything.
 */
export function SearchPill() {
  const { orbitals, superpositions } = useCatalogs()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const listId = useId()
  const pillRef = useRef<HTMLButtonElement | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const restoreFocus = useRef(false)
  const staticBuild = runtimeMode() === 'static'

  const entries = useMemo(
    () =>
      buildSearchEntries({
        presets: orbitals,
        mixtures: superpositions,
        maxN: staticBuild ? 8 : 4,
        isAvailable: drawable,
      }),
    [orbitals, superpositions, staticBuild],
  )
  const results = useMemo(() => searchEntries(entries, query), [entries, query])
  const optionId = (entry: SearchEntry): string => `${listId}-${entry.id}`
  const current = results[Math.min(active, results.length - 1)]

  useEffect(() => {
    if (open) {
      inputRef.current?.focus()
    } else if (restoreFocus.current) {
      restoreFocus.current = false
      pillRef.current?.focus()
    }
  }, [open])

  const close = (returnFocus: boolean): void => {
    restoreFocus.current = returnFocus
    setOpen(false)
    setQuery('')
    setActive(0)
  }

  const apply = (entry: SearchEntry): void => {
    const store = useSceneStore.getState()
    if (entry.mixture !== undefined) {
      const mixture = entry.mixture
      // Record the preset (and A11's published opening picture) first; the
      // mode switch then opens on that picture, not on a refused isosurface.
      store.setSuperposition(
        mixture.terms,
        mixture.label,
        mixture.slice_resolution_floor,
        mixture.streamline_seed_count_max,
        mixture.default_representation,
      )
      useSceneStore.getState().setMode('superposition')
    } else if (entry.orbital !== undefined) {
      store.setMode('eigenstate')
      useSceneStore.getState().applyPreset(entry.orbital)
    }
    close(true)
  }

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    const last = results.length - 1
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault()
        setActive((index) => Math.min(last, index + 1))
        break
      case 'ArrowUp':
        event.preventDefault()
        setActive((index) => Math.max(0, index - 1))
        break
      case 'Home':
        event.preventDefault()
        setActive(0)
        break
      case 'End':
        event.preventDefault()
        setActive(Math.max(0, last))
        break
      case 'Enter':
        event.preventDefault()
        if (current !== undefined) apply(current)
        break
      case 'Escape':
        event.preventDefault()
        close(true)
        break
      default:
        break
    }
  }

  if (!open) {
    return (
      <div className="qv-search" data-chrome="">
        <button
          type="button"
          className="qv-search-pill qv-glass"
          ref={pillRef}
          aria-haspopup="listbox"
          aria-expanded={false}
          onClick={() => setOpen(true)}
        >
          <span className="qv-search-label">查找量子态</span>
          <Search size={18} aria-hidden="true" />
        </button>
      </div>
    )
  }

  return (
    <div
      className="qv-search"
      data-chrome=""
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) close(false)
      }}
    >
      <div className="qv-search-panel qv-glass">
        <div className="qv-search-field">
          <Search size={18} aria-hidden="true" />
          <input
            ref={inputRef}
            role="combobox"
            aria-label="查找量子态"
            aria-expanded={results.length > 0}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={current === undefined ? undefined : optionId(current)}
            placeholder="例如 2p、3d、叠加"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value)
              setActive(0)
            }}
            onKeyDown={onKeyDown}
          />
          <button type="button" className="qv-icon-button" aria-label="关闭查找" onClick={() => close(true)}>
            <X size={16} aria-hidden="true" />
          </button>
        </div>
        <ul id={listId} role="listbox" aria-label="量子态" className="qv-search-list">
          {results.map((entry, index) => (
            <li
              key={entry.id}
              id={optionId(entry)}
              role="option"
              aria-selected={entry === current}
              data-entry={entry.id}
              className="qv-search-option"
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => setActive(index)}
              onClick={() => apply(entry)}
            >
              <span className="qv-option-label">{entry.label}</span>
              {entry.tags.map((tag) => (
                <span key={tag} className="qv-tag">
                  {tag}
                </span>
              ))}
            </li>
          ))}
        </ul>
        {results.length === 0 ? (
          <p className="qv-search-empty" role="status">
            没有匹配的量子态。
          </p>
        ) : null}
      </div>
    </div>
  )
}
```

`web/src/lab.css` — append:

```css
/* ---- Search pill ---- */
.qv-search { position: fixed; top: calc(var(--qv-header-h) + var(--qv-edge)); right: var(--qv-edge); z-index: 12; }
.qv-search-pill {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  height: 44px;
  padding: 0 16px 0 20px;
  border-radius: var(--qv-radius-pill);
  color: var(--qv-text);
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
}
.qv-search-panel { width: min(360px, calc(100vw - 2 * var(--qv-edge))); padding: 8px; border-radius: var(--qv-radius-panel); }
.qv-search-field { display: flex; align-items: center; gap: 8px; height: 44px; padding: 0 4px 0 14px; border-radius: var(--qv-radius-pill); background: rgba(255,255,255,.06); color: var(--qv-text-2); }
.qv-search-field:focus-within { box-shadow: 0 0 0 2px var(--qv-accent); }
.qv-search-field input { flex: 1; min-width: 0; height: 100%; border: 0; outline: none; background: transparent; color: var(--qv-text); }
.qv-search-field input::placeholder { color: var(--qv-text-3); }
.qv-search-list { max-height: min(420px, calc(100dvh - 220px)); margin: 8px 0 0; padding: 0; overflow-y: auto; list-style: none; }
.qv-search-option { display: flex; align-items: center; gap: 8px; min-height: 40px; padding: 6px 12px; border-radius: 10px; cursor: pointer; }
.qv-search-option .qv-option-label { flex: 1; }
.qv-search-option[aria-selected="true"] { background: rgba(138,180,248,.16); }
.qv-search-empty { padding: 12px; color: var(--qv-text-3); font-size: 13px; }

@media (max-width: 820px) {
  .qv-search { top: calc(var(--qv-header-h) + 8px); }
  .qv-search-pill { justify-content: center; width: 44px; padding: 0; }
  .qv-search-label { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
}
```

`web/coverage-scope.json` — insert `"src/components/SearchPill.tsx"` into both arrays directly after `"src/components/OrbitalCanvas.tsx"` (before `StatusChip.tsx`).

- [ ] **Step 4: Run and see them pass.**

Run: `npm --prefix web run test:watch -- run src/components/stateIndex.test.ts src/components/SearchPill.test.tsx src/guards.test.ts`
Expected: PASS. `npm --prefix web run typecheck` → exit 0.

- [ ] **Step 5: Pre-commit gate, then commit.** Both gate commands must exit 0 — `test` runs all five stages (clean-coverage, `tsc -p tsconfig.test.json`, vitest with per-file 90/85/90/90, `assert-no-skips`, `assert-coverage-scope`); a failure is fixed inside this task before committing.

```powershell
npm --prefix web run test
npm --prefix web run typecheck
git add web/src/components/stateIndex.ts web/src/components/stateIndex.test.ts web/src/components/SearchPill.tsx web/src/components/SearchPill.test.tsx web/src/lab.css web/coverage-scope.json
git commit -m "feat(web): 查找量子态 search pill over presets and drawable states" -m "Claude-Session: https://claude.ai/code/session_01E44DEzsc7Av26fc7nZ5rSo"
```

### Task D19: Guide dialog (modal, focus trap, first-visit auto-open)

**Files:**
- Create: `web/src/components/GuideDialog.tsx`, `web/src/components/GuideDialog.test.tsx`
- Modify: `web/src/lab.css` (append), `web/coverage-scope.json`

**Interfaces:**
- Consumes: `runtimeMode()` (Part B); Part C's chapter files under `docs/textbook/` — the exact names and nav titles of the final `教材` block in `design/plans/2026-09-25-part-c-textbook.md` (the final `教材` nav block that Part C's Task C1 prints): `00-how-to-use`, `01-wavefunction`, `02-hydrogen-levels`, `03-radial-nodes`, `04-real-complex`, `05-electron-cloud`, `06-isosurface`, `07-phase-slices`, `08-probability-current`, `09-superposition-time`, `10-experiment`, `11-symmetry-hybridization`, `appendix-a-misconceptions`, `appendix-b-notation-units` (checked on disk by the test, not imported). With MkDocs' default `use_directory_urls`, `docs/textbook/<name>.md` is served at `learn/textbook/<name>/` on Pages.
- Produces:
  ```ts
  export const GUIDE_SEEN_KEY = 'quviz.guide.v1'
  export interface GuideChapter { title: string; path: string }   // path relative to the site root
  export const TEXTBOOK_CHAPTERS: readonly GuideChapter[]
  export function guideSeen(): boolean
  export function markGuideSeen(): void
  export function shouldAutoOpenGuide(hash: string): boolean      // no deep link and not seen
  export function focusableWithin(root: HTMLElement): HTMLElement[]
  export function GuideDialog(props: { open: boolean; onClose: () => void }): JSX.Element | null
  ```
  → `div.qv-dialog-backdrop[data-chrome]` › `div.qv-dialog[role=dialog][aria-modal=true][aria-labelledby]`, tabs `概览`/`读图指南`/`教材章节` (roving tabindex), close button `关闭指南`.
- The e2e suites suppress the first-visit dialog with `localStorage.setItem('quviz.guide.v1', 'seen')` in an init script (D21); a deep link (non-empty hash) never auto-opens it, so textbook readers arriving via "在实验室中打开" land on the state they asked for.

- [ ] **Step 1: Write the failing test** `web/src/components/GuideDialog.test.tsx`:

```ts
/** @vitest-environment jsdom */
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

import { act, createElement } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { mount, type MountedTree } from '../test/mount'
import {
  focusableWithin,
  GUIDE_SEEN_KEY,
  GuideDialog,
  guideSeen,
  markGuideSeen,
  shouldAutoOpenGuide,
  TEXTBOOK_CHAPTERS,
} from './GuideDialog'

const runtime = vi.hoisted(() => ({ current: 'live' as 'live' | 'static' }))
vi.mock('../api/runtimeMode', () => ({ runtimeMode: () => runtime.current }))

beforeEach(() => {
  runtime.current = 'live'
  localStorage.clear()
})

afterEach(() => {
  vi.restoreAllMocks()
})

async function interact(body: () => void): Promise<void> {
  const scope = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  scope.IS_REACT_ACT_ENVIRONMENT = true
  try {
    await act(async () => {
      body()
    })
  } finally {
    delete scope.IS_REACT_ACT_ENVIRONMENT
  }
}

const press = (target: Element | null, key: string, shiftKey = false): Promise<void> =>
  interact(() => {
    target?.dispatchEvent(new KeyboardEvent('keydown', { key, shiftKey, bubbles: true, cancelable: true }))
  })

async function dialog(onClose = vi.fn()): Promise<MountedTree> {
  return mount(createElement(GuideDialog, { open: true, onClose }))
}

describe('first-visit memory', () => {
  it('opens once, then remembers, and never over a deep link', () => {
    expect(shouldAutoOpenGuide('')).toBe(true)
    expect(shouldAutoOpenGuide('#')).toBe(true)
    expect(shouldAutoOpenGuide('#mode=eigenstate&n=2')).toBe(false)
    markGuideSeen()
    expect(localStorage.getItem(GUIDE_SEEN_KEY)).toBe('seen')
    expect(guideSeen()).toBe(true)
    expect(shouldAutoOpenGuide('')).toBe(false)
  })

  it('stays silent when storage is refused', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError')
    })
    expect(guideSeen()).toBe(false)
    expect(() => markGuideSeen()).not.toThrow()
    expect(shouldAutoOpenGuide('')).toBe(true)
  })
})

describe('GuideDialog', () => {
  it('renders nothing while closed', async () => {
    const tree = await mount(createElement(GuideDialog, { open: false, onClose: vi.fn() }))
    try {
      expect(tree.container.innerHTML).toBe('')
    } finally {
      await tree.unmount()
    }
  })

  it('is a labelled modal dialog that takes focus and marks the guide as seen', async () => {
    const opener = document.createElement('button')
    document.body.appendChild(opener)
    opener.focus()
    const tree = await dialog()
    try {
      const node = tree.container.querySelector('[role="dialog"]')
      expect(node?.getAttribute('aria-modal')).toBe('true')
      expect(document.getElementById(node?.getAttribute('aria-labelledby') ?? '')?.textContent).toBe('关于 QuViz 实验室')
      expect(tree.container.querySelector('.qv-dialog-backdrop')?.hasAttribute('data-chrome')).toBe(true)
      expect(document.activeElement?.getAttribute('role')).toBe('tab')
      expect(guideSeen()).toBe(true)
    } finally {
      await tree.unmount()
      // Focus goes back where it came from.
      expect(document.activeElement).toBe(opener)
      opener.remove()
    }
  })

  it('closes on Escape without letting the key reach the page', async () => {
    const onClose = vi.fn()
    const pageListener = vi.fn()
    document.addEventListener('keydown', pageListener)
    const tree = await dialog(onClose)
    try {
      await press(tree.container.querySelector('[role="tab"]'), 'Escape')
      expect(onClose).toHaveBeenCalledOnce()
      expect(pageListener).not.toHaveBeenCalled()
    } finally {
      document.removeEventListener('keydown', pageListener)
      await tree.unmount()
    }
  })

  it('traps Tab inside the dialog in both directions', async () => {
    const tree = await dialog()
    try {
      const root = tree.container.querySelector<HTMLElement>('[role="dialog"]')
      if (root === null) throw new Error('no dialog')
      const items = focusableWithin(root)
      const first = items[0]
      const last = items[items.length - 1]
      last.focus()
      await press(last, 'Tab')
      expect(document.activeElement).toBe(first)
      await press(first, 'Tab', true)
      expect(document.activeElement).toBe(last)
      // Inactive tabs (tabIndex -1) and hidden panels are not tab stops.
      expect(items.every((item) => item.tabIndex >= 0)).toBe(true)
    } finally {
      await tree.unmount()
    }
  })

  it('switches tabs with the roving keyboard pattern and closes from the button or the backdrop', async () => {
    const onClose = vi.fn()
    const tree = await dialog(onClose)
    try {
      const tabs = Array.from(tree.container.querySelectorAll<HTMLButtonElement>('[role="tab"]'))
      expect(tabs.map((tab) => tab.textContent)).toEqual(['概览', '读图指南', '教材章节'])
      await press(tabs[0], 'ArrowRight')
      expect(document.activeElement).toBe(tabs[1])
      expect(tabs[1].getAttribute('aria-selected')).toBe('true')
      expect(tree.container.textContent).toContain('等值面')
      await press(tabs[1], 'End')
      expect(document.activeElement).toBe(tabs[2])
      await press(tabs[2], 'ArrowRight')
      expect(document.activeElement).toBe(tabs[0])
      await press(tabs[0], 'ArrowLeft')
      expect(document.activeElement).toBe(tabs[2])
      await press(tabs[2], 'Home')
      expect(document.activeElement).toBe(tabs[0])
      await interact(() => tabs[2].click())
      expect(tabs[2].getAttribute('aria-selected')).toBe('true')

      await interact(() => tree.container.querySelector<HTMLButtonElement>('button[aria-label="关闭指南"]')?.click())
      const backdrop = tree.container.querySelector('.qv-dialog-backdrop')
      await interact(() => backdrop?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })))
      await interact(() =>
        tree.container.querySelector('[role="dialog"]')?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })),
      )
      expect(onClose).toHaveBeenCalledTimes(2)
    } finally {
      await tree.unmount()
    }
  })

  it('links every chapter in the static build and explains their absence in live mode', async () => {
    runtime.current = 'static'
    const staticTree = await dialog()
    try {
      await interact(() => staticTree.container.querySelectorAll<HTMLButtonElement>('[role="tab"]')[2].click())
      const links = Array.from(staticTree.container.querySelectorAll<HTMLAnchorElement>('.qv-chapter-list a'))
      expect(links.map((link) => link.getAttribute('href'))).toEqual(
        TEXTBOOK_CHAPTERS.map((chapter) => `./${chapter.path}`),
      )
    } finally {
      await staticTree.unmount()
    }
    runtime.current = 'live'
    const liveTree = await dialog()
    try {
      await interact(() => liveTree.container.querySelectorAll<HTMLButtonElement>('[role="tab"]')[2].click())
      expect(liveTree.container.querySelectorAll('.qv-chapter-list a')).toHaveLength(0)
      expect(liveTree.container.textContent).toContain('mkdocs serve')
    } finally {
      await liveTree.unmount()
    }
  })
})

describe('TEXTBOOK_CHAPTERS', () => {
  it('points only at chapters Part C actually wrote', () => {
    // Resolved from the vitest root (web/), NOT from import.meta.url: under
    // the jsdom environment that URL is an http:// one and node:fs rejects it
    // ("The URL must be of scheme file"), so existsSync would always be false
    // -- the same hazard the `goldenBinary` comment in useSceneAsset.test.tsx documents.
    const docs = resolve(process.cwd(), '..', 'docs')
    expect(existsSync(resolve(docs, 'textbook', 'index.md'))).toBe(true)
    for (const chapter of TEXTBOOK_CHAPTERS) {
      const page = chapter.path.replace(/^learn\//, '').replace(/\/$/, '')
      expect(existsSync(resolve(docs, `${page}.md`)), chapter.path).toBe(true)
    }
  })

  it('lists the fourteen chapters in the textbook nav order', () => {
    expect(TEXTBOOK_CHAPTERS.map((chapter) => chapter.path)).toEqual([
      'learn/textbook/00-how-to-use/',
      'learn/textbook/01-wavefunction/',
      'learn/textbook/02-hydrogen-levels/',
      'learn/textbook/03-radial-nodes/',
      'learn/textbook/04-real-complex/',
      'learn/textbook/05-electron-cloud/',
      'learn/textbook/06-isosurface/',
      'learn/textbook/07-phase-slices/',
      'learn/textbook/08-probability-current/',
      'learn/textbook/09-superposition-time/',
      'learn/textbook/10-experiment/',
      'learn/textbook/11-symmetry-hybridization/',
      'learn/textbook/appendix-a-misconceptions/',
      'learn/textbook/appendix-b-notation-units/',
    ])
  })
})
```

- [ ] **Step 2: Run and see it fail.**

Run: `npm --prefix web run test:watch -- run src/components/GuideDialog.test.tsx`
Expected: FAIL — `./GuideDialog` does not exist.

- [ ] **Step 3: Implement.** The chapter names and titles below are Part C's final `教材` nav, verbatim (D1 Step 1 listed the files; no alignment step remains). If a file is missing on the merged tree, that is a Part C defect to report, not a reason to edit this list.

`web/src/components/GuideDialog.tsx`:

```tsx
import { X } from 'lucide-react'
import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'

import { runtimeMode } from '../api/runtimeMode'

export const GUIDE_SEEN_KEY = 'quviz.guide.v1'

export interface GuideChapter {
  title: string
  /** Relative to the Pages site root, where the lab lives; the textbook is at learn/. */
  path: string
}

/**
 * Part C's textbook nav (mkdocs.yml `教材`), in reading order, with the nav
 * titles verbatim. GuideDialog.test.tsx checks each file exists under docs/.
 */
export const TEXTBOOK_CHAPTERS: readonly GuideChapter[] = [
  { title: '0 如何使用本书与实验室', path: 'learn/textbook/00-how-to-use/' },
  { title: '1 波函数与 Born 规则', path: 'learn/textbook/01-wavefunction/' },
  { title: '2 氢原子：量子数与能级', path: 'learn/textbook/02-hydrogen-levels/' },
  { title: '3 径向分布与节点', path: 'learn/textbook/03-radial-nodes/' },
  { title: '4 实轨道与复轨道', path: 'learn/textbook/04-real-complex/' },
  { title: '5 电子云：从概率到采样', path: 'learn/textbook/05-electron-cloud/' },
  { title: '6 等值面：轨道的“形状”', path: 'learn/textbook/06-isosurface/' },
  { title: '7 相位与平面切片', path: 'learn/textbook/07-phase-slices/' },
  { title: '8 概率流', path: 'learn/textbook/08-probability-current/' },
  { title: '9 叠加态与时间演化', path: 'learn/textbook/09-superposition-time/' },
  { title: '10 从密度到实验图样', path: 'learn/textbook/10-experiment/' },
  { title: '11 对称性与杂化', path: 'learn/textbook/11-symmetry-hybridization/' },
  { title: '附录 A 常见误区', path: 'learn/textbook/appendix-a-misconceptions/' },
  { title: '附录 B 符号与单位', path: 'learn/textbook/appendix-b-notation-units/' },
]

function storage(): Storage | null {
  try {
    return globalThis.localStorage ?? null
  } catch {
    return null
  }
}

export function guideSeen(): boolean {
  try {
    return storage()?.getItem(GUIDE_SEEN_KEY) === 'seen'
  } catch {
    return false
  }
}

export function markGuideSeen(): void {
  try {
    storage()?.setItem(GUIDE_SEEN_KEY, 'seen')
  } catch {
    // Storage refused (private mode, policy): the guide may open again next visit.
  }
}

/** Auto-open on a first visit without a deep link; a deep link means "show me this state". */
export function shouldAutoOpenGuide(hash: string): boolean {
  return hash.replace(/^#/, '') === '' && !guideSeen()
}

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]'

/** Tab stops inside `root`: focusable, not hidden, not a roving tabindex -1. */
export function focusableWithin(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (element) => element.tabIndex >= 0 && element.closest('[hidden]') === null,
  )
}

type GuideTab = 'overview' | 'reading' | 'chapters'

const GUIDE_TABS: readonly { id: GuideTab; label: string }[] = [
  { id: 'overview', label: '概览' },
  { id: 'reading', label: '读图指南' },
  { id: 'chapters', label: '教材章节' },
]

function OverviewGuide() {
  const staticBuild = runtimeMode() === 'static'
  return (
    <>
      <p>
        QuViz 把氢样原子的量子态画成可以旋转、切片和播放的三维场景。<strong>说的 = 画的</strong>：
        每一种颜色、每一个数字都来自 Python 计算核心（或它预先导出的目录），浏览器只负责绘制。
      </p>
      <h3>当前模式</h3>
      <p>
        {staticBuild
          ? '教学预览：所有场景来自预计算目录；未预计算的组合会如实标注“未预计算”。本地运行 quviz serve 可实时计算任意参数。'
          : '实时计算：每个场景都由本地 FastAPI 服务按需计算。'}
      </p>
      <h3>怎么用</h3>
      <ul>
        <li><strong>左侧“控制”</strong>：选择本征态或叠加态、表示法与显示选项；可收起为“调节”按钮。</li>
        <li><strong>底部时间胶囊</strong>：叠加态可播放、逐帧步进，或拖动一个周期内的帧。</li>
        <li><strong>右侧“科学详情”</strong>：概览、图表（径向分布、能级、叠加系数）、场景契约与引用。</li>
        <li><strong>右上“查找量子态”</strong>：输入 2p、3d 或“叠加”即可跳转。</li>
        <li><strong>复制链接</strong>会把当前状态写进网址，发给别人就能打开同一幅图。</li>
      </ul>
      <p className="qv-dialog-meta">QuViz 0.1.0 · 坐标约定：z 轴朝上，左下角为坐标指示。</p>
    </>
  )
}

function ReadingGuide() {
  return (
    <>
      <h3>电子云</h3>
      <p>每个点按 |ψ|² d³r 独立采样，视觉权重相同；点的颜色是波函数的相位 arg ψ，不是电荷。</p>
      <h3>等值面</h3>
      <p>曲面包围指定的概率质量（默认 90%），是 |ψ|² 的一个等值面，不是“电子的边界”；颜色同样表示相位。</p>
      <h3>平面切片</h3>
      <p>
        在过原子核的主平面上采样一个标量场：|ψ|²（亮度 ∝ |ψ|/max|ψ|）、Re ψ / Im ψ（青—灰—红，按平面最大值归一化）
        或 arg ψ（色轮）。相位切片中的透明像素是振幅太小、相位无定义的区域，不是节点。
      </p>
      <h3>概率流线</h3>
      <p>j/ρ 的流线，颜色表示速率（色带按 √(速率 ÷ 最大值) 排布）。它们是概率流，不是电子轨迹。</p>
      <h3>时间演化</h3>
      <p>本征态的 |ψ|² 不随时间变化；能量不同的本征态叠加会以拍周期 T = 2π/ΔE 振荡，能量相同则不动。</p>
      <h3>图例与 Bloom</h3>
      <p>右下角图例与渲染器逐字节核对；把 Bloom 调到大于 0 后，屏幕颜色不再与图例完全一致。</p>
    </>
  )
}

function ChaptersGuide() {
  if (runtimeMode() !== 'static') {
    return (
      <>
        <p>
          教材随 GitHub Pages 版本发布。在本地阅读：运行{' '}
          <code>uv run --group docs mkdocs serve -a 127.0.0.1:8001</code>，然后打开 http://127.0.0.1:8001/。
        </p>
        <ol className="qv-chapter-list">
          {TEXTBOOK_CHAPTERS.map((chapter) => (
            <li key={chapter.path}>{chapter.title}</li>
          ))}
        </ol>
      </>
    )
  }
  return (
    <>
      <p>按学习顺序排列；每章都有可交互的嵌入图，并能一键在实验室中打开。</p>
      <ol className="qv-chapter-list">
        {TEXTBOOK_CHAPTERS.map((chapter) => (
          <li key={chapter.path}>
            <a href={`./${chapter.path}`}>{chapter.title}</a>
          </li>
        ))}
      </ol>
    </>
  )
}

/**
 * The in-app guide: the lab's "About" modal, with its textbook entry points.
 * The first role=dialog in the app: aria-modal, focus moved in and trapped,
 * Escape closes (and does not reach the page's own Escape handler), focus
 * returns to where it was.
 */
export function GuideDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [tab, setTab] = useState<GuideTab>('overview')
  const dialogRef = useRef<HTMLDivElement | null>(null)
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([])
  const titleId = useId()
  const baseId = useId()

  useEffect(() => {
    if (!open) return undefined
    markGuideSeen()
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    dialogRef.current?.querySelector<HTMLElement>('[role="tab"][tabindex="0"]')?.focus()
    return () => previous?.focus()
  }, [open])

  if (!open) return null

  const tabId = (id: GuideTab): string => `${baseId}-${id}-tab`
  const panelId = (id: GuideTab): string => `${baseId}-${id}-panel`

  const onDialogKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      onClose()
      return
    }
    if (event.key !== 'Tab' || dialogRef.current === null) return
    const items = focusableWithin(dialogRef.current)
    if (items.length === 0) return
    const first = items[0]
    const last = items[items.length - 1]
    const active = document.activeElement
    if (event.shiftKey && (active === first || !dialogRef.current.contains(active))) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && (active === last || !dialogRef.current.contains(active))) {
      event.preventDefault()
      first.focus()
    }
  }

  const onTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number): void => {
    const count = GUIDE_TABS.length
    const next =
      event.key === 'ArrowRight'
        ? (index + 1) % count
        : event.key === 'ArrowLeft'
          ? (index - 1 + count) % count
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? count - 1
              : undefined
    if (next === undefined) return
    event.preventDefault()
    setTab(GUIDE_TABS[next].id)
    tabRefs.current[next]?.focus()
  }

  return (
    <div
      className="qv-dialog-backdrop"
      data-chrome=""
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        className="qv-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        ref={dialogRef}
        onKeyDown={onDialogKeyDown}
      >
        <div className="qv-dialog-head">
          <h2 id={titleId}>关于 QuViz 实验室</h2>
          <button type="button" className="qv-icon-button qv-dialog-close" aria-label="关闭指南" onClick={onClose}>
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        <div className="qv-tabs" role="tablist" aria-label="指南视图">
          {GUIDE_TABS.map((entry, index) => (
            <button
              type="button"
              role="tab"
              key={entry.id}
              id={tabId(entry.id)}
              ref={(node) => {
                tabRefs.current[index] = node
              }}
              aria-selected={tab === entry.id}
              aria-controls={panelId(entry.id)}
              tabIndex={tab === entry.id ? 0 : -1}
              onClick={() => setTab(entry.id)}
              onKeyDown={(event) => onTabKeyDown(event, index)}
            >
              {entry.label}
            </button>
          ))}
        </div>
        <div className="qv-dialog-body">
          <section role="tabpanel" id={panelId('overview')} aria-labelledby={tabId('overview')} hidden={tab !== 'overview'}>
            <OverviewGuide />
          </section>
          <section role="tabpanel" id={panelId('reading')} aria-labelledby={tabId('reading')} hidden={tab !== 'reading'}>
            <ReadingGuide />
          </section>
          <section role="tabpanel" id={panelId('chapters')} aria-labelledby={tabId('chapters')} hidden={tab !== 'chapters'}>
            <ChaptersGuide />
          </section>
        </div>
      </div>
    </div>
  )
}
```

`web/src/lab.css` — append:

```css
/* ---- Guide dialog ---- */
.qv-dialog-backdrop { position: fixed; inset: 0; z-index: 50; display: grid; place-items: center; padding: 16px; background: rgba(0,0,0,.55); }
.qv-dialog {
  display: flex;
  flex-direction: column;
  width: min(720px, 100%);
  max-height: min(80dvh, 720px);
  border: 1px solid var(--qv-border);
  border-radius: 24px;
  background: #000;
  box-shadow: var(--qv-glow);
  overflow: hidden;
}
.qv-dialog-head { position: relative; padding: 20px 56px 10px; text-align: center; }
.qv-dialog-head h2 { font-size: 20px; font-weight: 500; }
.qv-dialog-close { position: absolute; top: 10px; right: 10px; }
.qv-tabs { display: flex; justify-content: center; gap: 8px; border-bottom: 1px solid var(--qv-border); }
.qv-tabs [role="tab"] {
  position: relative;
  height: 40px;
  padding: 0 12px;
  border: 0;
  background: transparent;
  color: var(--qv-text-2);
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
}
.qv-tabs [role="tab"][aria-selected="true"] { color: var(--qv-accent); }
.qv-tabs [role="tab"][aria-selected="true"]::after { content: ""; position: absolute; right: 10px; bottom: -1px; left: 10px; height: 3px; border-radius: 3px 3px 0 0; background: var(--qv-accent); }
.qv-dialog-body { padding: 18px 28px 28px; overflow-y: auto; color: var(--qv-text-2); font-size: 14px; line-height: 1.65; }
.qv-dialog-body h3 { margin: 16px 0 6px; color: var(--qv-text); font-size: 15px; font-weight: 700; }
.qv-dialog-body strong { color: var(--qv-text); }
.qv-dialog-body ul, .qv-dialog-body ol { margin: 6px 0; padding-left: 20px; }
.qv-dialog-body code { padding: 1px 6px; border-radius: 6px; background: rgba(255,255,255,.08); color: var(--qv-text); font-size: 13px; }
.qv-dialog-meta { margin-top: 16px; color: var(--qv-text-3); font-size: 12px; }
.qv-chapter-list li { padding: 6px 0; border-bottom: 1px solid rgba(255,255,255,.08); }

@media (max-width: 820px) {
  .qv-dialog { max-height: 88dvh; }
  .qv-dialog-body { padding: 14px 18px 22px; }
}
```

`web/coverage-scope.json` — insert `"src/components/GuideDialog.tsx"` into both arrays directly after `"src/components/ErrorBoundary.tsx"` (before `Header.tsx`).

- [ ] **Step 4: Run and see it pass.**

Run: `npm --prefix web run test:watch -- run src/components/GuideDialog.test.tsx src/guards.test.ts`
Expected: PASS — including `'points only at chapters Part C actually wrote'`, which resolves `docs/` from `process.cwd()` (= `web/` under `npm --prefix web run …`) and finds all fourteen `docs/textbook/*.md` files. `npm --prefix web run typecheck` → exit 0.

- [ ] **Step 5: Pre-commit gate, then commit.** Both gate commands must exit 0 — `test` runs all five stages (clean-coverage, `tsc -p tsconfig.test.json`, vitest with per-file 90/85/90/90, `assert-no-skips`, `assert-coverage-scope`); a failure is fixed inside this task before committing.

```powershell
npm --prefix web run test
npm --prefix web run typecheck
git add web/src/components/GuideDialog.tsx web/src/components/GuideDialog.test.tsx web/src/lab.css web/coverage-scope.json
git commit -m "feat(web): modal guide with reading guide and textbook chapter links" -m "Claude-Session: https://claude.ai/code/session_01E44DEzsc7Av26fc7nZ5rSo"
```

### Task D20: Full-bleed shell — canvas layer, overlay layer, drawers, embed mode, caption removed

**Files:**
- Create: `web/src/components/useMediaQuery.ts`, `web/src/components/useMediaQuery.test.tsx`, `web/src/components/EmbedBar.tsx`, `web/src/components/EmbedBar.test.tsx`
- Modify: `web/src/App.tsx` (whole file), `web/src/App.test.tsx` (whole file), `web/src/main.tsx:5-7` (CSS imports), `web/src/styles.css` (whole file: data colours only), `web/src/styleContract.test.ts` (one case), `web/src/lab.css` (append)
- Delete: `web/src/quantum-observatory.css`
- Modify: `web/coverage-scope.json`

**Interfaces:**
- Consumes: `isEmbedMode()`, `parseDeepLink(hash)`, `serializeDeepLink(state)`, `DeepLinkState` (Part B, `src/state/urlState.ts`); every component from D6–D19. Not consumed: `bindUrlState()` — B11's `bootstrap` in `src/main.tsx` already binds the URL state once per page in both modes; a second binding in `App` would add a second store subscriber and, for a `preset` link, a second superposition-catalogue fetch.
- Produces:
  - `src/components/useMediaQuery.ts`: `COMPACT_WORKSPACE_QUERY = '(max-width: 1180px)'`, `MOBILE_QUERY = '(max-width: 820px)'`, `useMediaQuery(query: string): boolean` (live subscription; false where `matchMedia` is absent).
  - `src/components/EmbedBar.tsx`: `embedLabHref(hash: string): string` (`'./#' + serializeDeepLink(state without embed)`, or `'./'`), `EmbedBar()` → `a.qv-embed-open[data-chrome][target=_blank][rel=noopener]` "在实验室中打开", href refreshed from the live hash on pointerdown/focus/click.
  - `App` (default export): `div.qv-app[data-embed?][data-drawer-open]` › `div.qv-stage` (the one canvas, inside `ErrorBoundary` + `WebGLGate`) + `div.qv-overlay` whose every child carries `data-chrome`. Contract "D produces": in embed mode header, control panel, search, guide (and the detail panel) are not rendered; canvas, legend pill, time pill, status chip and `在实验室中打开` remain.
- The old viewport caption (`App.tsx:196-200`, "…色彩表示 arg ψ，不表示电荷") is deleted (spec D9): it mislabelled density slices, Re/Im slices and streamlines. Colour meaning is the legend's job.

**`App.test.tsx` changes** — the file is rewritten; semantic pins carried over: loading overlay only while `loading` (426–436, minus the caption lines 430–432 which pinned the defect), both times while refreshing (438–453), refusal reason reaches the legend (455–466), compact 1180 px query closes the detail panel and widening does not reopen it (383–424), Escape closes the detail panel and focus returns to a rendered opener (306–381, simplified to the one opener). Removed: the mobile action bar (`['态','参数','显示','详情']`, 312) and `.stage-inspector-toggle` (replaced by `.qv-detail-toggle`); the StatusBar block moved in D12; the header read-out case removed in D13.

- [ ] **Step 1: Write the failing tests.**

`web/src/components/useMediaQuery.test.tsx`:

```ts
/** @vitest-environment jsdom */
import { act, createElement } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { mount } from '../test/mount'
import { COMPACT_WORKSPACE_QUERY, MOBILE_QUERY, useMediaQuery } from './useMediaQuery'

afterEach(() => vi.unstubAllGlobals())

let seen: boolean[] = []
function Probe({ query }: { query: string }) {
  seen.push(useMediaQuery(query))
  return null
}

describe('useMediaQuery', () => {
  it('names the two layout breakpoints', () => {
    expect(COMPACT_WORKSPACE_QUERY).toBe('(max-width: 1180px)')
    expect(MOBILE_QUERY).toBe('(max-width: 820px)')
  })

  it('is false where the platform cannot be asked', async () => {
    seen = []
    vi.stubGlobal('matchMedia', undefined)
    const tree = await mount(createElement(Probe, { query: MOBILE_QUERY }))
    expect(seen.at(-1)).toBe(false)
    await tree.unmount()
  })

  it('follows the query live and stops listening on unmount', async () => {
    seen = []
    const listeners = new Set<(event: MediaQueryListEvent) => void>()
    const list = {
      matches: true,
      addEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => listeners.add(listener),
      removeEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => listeners.delete(listener),
    }
    const asked: string[] = []
    vi.stubGlobal('matchMedia', (query: string) => {
      asked.push(query)
      return list
    })
    const tree = await mount(createElement(Probe, { query: MOBILE_QUERY }))
    expect(asked).toContain(MOBILE_QUERY)
    expect(seen.at(-1)).toBe(true)
    const scope = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    scope.IS_REACT_ACT_ENVIRONMENT = true
    try {
      await act(async () => {
        for (const listener of [...listeners]) listener({ matches: false } as MediaQueryListEvent)
      })
    } finally {
      delete scope.IS_REACT_ACT_ENVIRONMENT
    }
    expect(seen.at(-1)).toBe(false)
    await tree.unmount()
    expect(listeners.size).toBe(0)
  })
})
```

`web/src/components/EmbedBar.test.tsx`:

```ts
/** @vitest-environment jsdom */
import { act, createElement } from 'react'
import { afterEach, describe, expect, it } from 'vitest'

import { serializeDeepLink } from '../state/urlState'
import { mount } from '../test/mount'
import { EmbedBar, embedLabHref } from './EmbedBar'

afterEach(() => {
  window.history.replaceState(null, '', window.location.pathname)
})

const expected = (state: Parameters<typeof serializeDeepLink>[0]): string =>
  `./#${serializeDeepLink(state).replace(/^#/, '')}`

describe('embedLabHref', () => {
  it('opens the same state in the full lab, without the embed flag', () => {
    const state = { mode: 'eigenstate', n: 3, l: 2, m: 2, basis: 'complex' } as const
    const hash = `#${serializeDeepLink({ ...state, embed: true }).replace(/^#/, '')}`
    expect(embedLabHref(hash)).toBe(expected(state))
    expect(embedLabHref(hash)).not.toContain('embed')
  })

  it('opens the lab root when the embed carried nothing else', () => {
    expect(embedLabHref('#embed=1')).toBe('./')
    expect(embedLabHref('')).toBe('./')
  })
})

describe('EmbedBar', () => {
  it('is a new-tab link, marked as chrome, that follows the live hash', async () => {
    window.history.replaceState(null, '', '#embed=1&mode=eigenstate&n=2&l=1&m=0&basis=real')
    const tree = await mount(createElement(EmbedBar))
    try {
      const link = tree.container.querySelector<HTMLAnchorElement>('a.qv-embed-open')
      expect(link?.textContent).toBe('在实验室中打开')
      expect(link?.target).toBe('_blank')
      expect(link?.rel).toBe('noopener')
      expect(link?.hasAttribute('data-chrome')).toBe(true)
      expect(link?.getAttribute('href')).toBe(expected({ mode: 'eigenstate', n: 2, l: 1, m: 0, basis: 'real' }))

      // bindUrlState rewrites the hash whenever the store changes (t is written
      // only while paused, B10); the link reads whatever the hash says now.
      window.history.replaceState(null, '', '#embed=1&mode=eigenstate&n=3&l=0&m=0&basis=real')
      const scope = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
      scope.IS_REACT_ACT_ENVIRONMENT = true
      try {
        await act(async () => link?.focus())
      } finally {
        delete scope.IS_REACT_ACT_ENVIRONMENT
      }
      expect(link?.getAttribute('href')).toBe(expected({ mode: 'eigenstate', n: 3, l: 0, m: 0, basis: 'real' }))
      link?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
      link?.addEventListener('click', (event) => event.preventDefault(), { once: true })
      link?.click()
      expect(link?.getAttribute('href')).toBe(expected({ mode: 'eigenstate', n: 3, l: 0, m: 0, basis: 'real' }))
    } finally {
      await tree.unmount()
    }
  })
})
```

`web/src/styleContract.test.ts` — add inside `describe('lab.css design tokens')`:

```ts
  it('keeps styles.css to the byte-checked data colours, with the old visual system gone', () => {
    const data = read('./styles.css')
    expect(data).not.toMatch(/:root|\.app-shell|\.workspace|\.topbar|\.viewport-copy|font-family/)
    for (const selector of ['.phase-wheel', '.phase-dot.red', '.phase-dot.cyan', '.diverging-ramp', '.density-ramp', '.speed-ramp']) {
      expect(data).toContain(selector)
    }
    expect(existsSync(new URL('./quantum-observatory.css', import.meta.url))).toBe(false)
    expect(read('./main.tsx')).not.toContain('quantum-observatory')
  })
```

`web/src/App.test.tsx` — whole file:

```ts
/** @vitest-environment jsdom */
import { act, createElement, useEffect, type ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import App from './App'
import type { SceneStatus } from './api/types'
import { GUIDE_SEEN_KEY } from './components/GuideDialog'
import { mount, type MountedTree } from './test/mount'

/**
 * The shell, measured with its heavy children replaced: the canvas becomes a
 * source of SceneStatus values, the control panel and the detail panel become
 * open/close probes. What is under test is the layout contract -- chrome vs
 * canvas, drawers, embed mode, focus, guide -- not those components.
 */
const reported = vi.hoisted(() => ({ current: { loading: true } as SceneStatus }))
const embed = vi.hoisted(() => ({ current: false }))
const webgl = vi.hoisted(() => ({ current: true }))
const crash = vi.hoisted(() => ({ scene: false, shell: false }))
const binding = vi.hoisted(() => ({ bound: 0 }))

vi.mock('./components/OrbitalCanvas', () => ({
  OrbitalCanvas: ({ onStatus }: { onStatus: (status: SceneStatus) => void }) => {
    if (crash.scene) throw new Error('WebGL context lost')
    useEffect(() => {
      onStatus(reported.current)
    }, [onStatus])
    return null
  },
}))

vi.mock('./components/ControlPanel', async () => {
  const { createElement: element } = await import('react')
  return {
    ControlPanel: ({ open, onOpenChange }: { open?: boolean; onOpenChange?: (open: boolean) => void }) =>
      element(
        'section',
        { 'data-mock-controls': '', 'data-chrome': '', 'data-open': String(open) },
        element('button', { type: 'button', 'data-mock-toggle-controls': '', onClick: () => onOpenChange?.(!open) }, 'toggle'),
      ),
  }
})

vi.mock('./components/Inspector', async () => {
  const { createElement: element } = await import('react')
  return {
    Inspector: ({ open, onClose }: { open?: boolean; onClose?: () => void }) => {
      if (crash.shell) throw new Error('inspector exploded')
      return element(
        'aside',
        { 'data-mock-inspector': '', 'data-chrome': '', 'data-open': String(open), id: 'science-inspector' },
        element('button', { type: 'button', 'data-mock-close-inspector': '', onClick: onClose }, 'close'),
      )
    },
  }
})

vi.mock('./components/WebGLGate', async () => {
  const { createElement: element } = await import('react')
  return {
    WebGLGate: ({ children }: { children: ReactNode }) =>
      webgl.current ? children : element('div', { 'data-webgl-unavailable': '', 'data-chrome': '' }, 'no WebGL'),
  }
})

vi.mock('./state/catalogs', () => ({
  useCatalogs: () => ({ orbitals: [], superpositions: [], orbitalStatus: 'ready', superpositionStatus: 'ready' }),
  ensureCatalogsLoaded: () => undefined,
}))

vi.mock('./state/urlState', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./state/urlState')>()),
  isEmbedMode: () => embed.current,
  // Counted only to prove the shell never calls it: main.tsx binds (B11).
  bindUrlState: () => {
    binding.bound += 1
    return () => undefined
  },
}))

interface MediaStub {
  change(query: string, matches: boolean): Promise<void>
  listenerCount(): number
}

function stubMedia(initial: Readonly<Record<string, boolean>>): MediaStub {
  const lists = new Map<string, { matches: boolean; listeners: Set<(event: MediaQueryListEvent) => void> }>()
  vi.stubGlobal('matchMedia', (query: string) => {
    const existing = lists.get(query) ?? { matches: initial[query] === true, listeners: new Set() }
    lists.set(query, existing)
    return {
      get matches() {
        return existing.matches
      },
      addEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => existing.listeners.add(listener),
      removeEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => existing.listeners.delete(listener),
    }
  })
  return {
    async change(query, matches) {
      const list = lists.get(query)
      if (list === undefined) throw new Error(`nobody asked about ${query}`)
      list.matches = matches
      await interact(() => {
        for (const listener of [...list.listeners]) listener({ matches } as MediaQueryListEvent)
      })
    },
    listenerCount: () => [...lists.values()].reduce((total, list) => total + list.listeners.size, 0),
  }
}

async function interact(body: () => void): Promise<void> {
  const scope = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  const had = 'IS_REACT_ACT_ENVIRONMENT' in scope
  const previous = scope.IS_REACT_ACT_ENVIRONMENT
  scope.IS_REACT_ACT_ENVIRONMENT = true
  try {
    await act(async () => body())
  } finally {
    if (had) scope.IS_REACT_ACT_ENVIRONMENT = previous
    else delete scope.IS_REACT_ACT_ENVIRONMENT
  }
}

async function shell(status: SceneStatus = { loading: false }): Promise<MountedTree> {
  reported.current = status
  return mount(createElement(App))
}

const q = <T extends Element = HTMLElement>(tree: MountedTree, selector: string): T | null =>
  tree.container.querySelector<T>(selector)

beforeEach(() => {
  embed.current = false
  webgl.current = true
  crash.scene = false
  crash.shell = false
  binding.bound = 0
  localStorage.setItem(GUIDE_SEEN_KEY, 'seen')
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  localStorage.clear()
  window.history.replaceState(null, '', window.location.pathname)
})

describe('App: canvas and chrome', () => {
  it('puts the scene on its own layer and marks every floating element as chrome', async () => {
    const tree = await shell({ loading: true })
    try {
      const overlay = q(tree, '.qv-overlay')
      const children = Array.from(overlay?.children ?? [])
      expect(children.length).toBeGreaterThanOrEqual(8)
      for (const child of children) {
        expect(child.hasAttribute('data-chrome'), child.outerHTML.slice(0, 60)).toBe(true)
      }
      expect(q(tree, '.qv-stage')?.hasAttribute('data-chrome')).toBe(false)
      expect(q(tree, '.qv-stage [data-chrome]')).toBeNull()
    } finally {
      await tree.unmount()
    }
  })

  it('no longer tells every representation that colour means arg ψ (spec D9)', async () => {
    const tree = await shell()
    try {
      expect(q(tree, '.viewport-copy')).toBeNull()
      expect(tree.container.textContent).not.toContain('色彩表示 arg ψ，不表示电荷')
      expect(tree.container.textContent).not.toContain('实时量子场')
    } finally {
      await tree.unmount()
    }
  })

  it('shows the loading overlay only while there is no frame to keep', async () => {
    const tree = await shell({ loading: true })
    try {
      expect(q(tree, '.loading-overlay')).not.toBeNull()
      expect(q(tree, '[data-status]')?.getAttribute('data-status')).toBe('loading')
    } finally {
      await tree.unmount()
    }
  })

  it('keeps the last frame visible while refreshing: no overlay, but both times', async () => {
    const tree = await shell({ loading: false, refreshing: true, renderedTimeAu: 3.6, timeAu: 9.0 })
    try {
      expect(q(tree, '.loading-overlay')).toBeNull()
      const text = q(tree, '[data-status]')?.textContent ?? ''
      expect(text).toContain('正在显示 t=3.6 a.u.')
      expect(text).toContain('正在计算 t=9.0 a.u.')
    } finally {
      await tree.unmount()
    }
  })

  it('passes a standing refusal through to the status and the legend', async () => {
    const reason = 'nothing implements this cell yet'
    const tree = await shell({ loading: false, unavailable: { kind: 'point_cloud', reason } })
    try {
      expect(q(tree, '.loading-overlay')).toBeNull()
      expect(q(tree, '[data-status]')?.textContent).toContain(reason)
      expect(q(tree, '.legend')?.textContent).toContain(reason)
    } finally {
      await tree.unmount()
    }
  })

  it('says why there is no scene when WebGL is unavailable, keeping the chrome usable', async () => {
    webgl.current = false
    const tree = await shell()
    try {
      expect(q(tree, '.qv-stage [data-webgl-unavailable]')).not.toBeNull()
      expect(q(tree, 'header.qv-header')).not.toBeNull()
    } finally {
      await tree.unmount()
    }
  })

  it('contains a crashed scene and offers a retry, and a crashed shell shows the lab failure', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    crash.scene = true
    const scene = await shell()
    try {
      expect(q(scene, '.qv-stage [role="alert"]')?.textContent).toContain('三维场景无法显示')
      expect(q(scene, 'header.qv-header')).not.toBeNull()
      crash.scene = false
      await interact(() => q<HTMLButtonElement>(scene, '.qv-stage [role="alert"] button')?.click())
      expect(q(scene, '.qv-stage [role="alert"]')).toBeNull()
    } finally {
      await scene.unmount()
    }

    crash.shell = true
    const whole = await shell()
    try {
      expect(q(whole, '[role="alert"]')?.textContent).toContain('实验室遇到错误')
      expect(q(whole, '.qv-overlay')).toBeNull()
    } finally {
      await whole.unmount()
    }
  })
})

describe('App: panels on desktop, compact and phone widths', () => {
  it('opens both panels on a wide screen and keeps the detail panel closed after narrowing', async () => {
    const media = stubMedia({ '(max-width: 1180px)': false, '(max-width: 820px)': false })
    const tree = await shell()
    try {
      expect(q(tree, '[data-mock-inspector]')?.dataset.open).toBe('true')
      expect(q(tree, '[data-mock-controls]')?.dataset.open).toBe('true')
      expect(q(tree, '.qv-detail-toggle')).toBeNull()

      await media.change('(max-width: 1180px)', true)
      expect(q(tree, '[data-mock-inspector]')?.dataset.open).toBe('false')
      // Widening again does not override the reader's (or the layout's) closed state.
      await media.change('(max-width: 1180px)', false)
      expect(q(tree, '[data-mock-inspector]')?.dataset.open).toBe('false')
    } finally {
      await tree.unmount()
    }
    expect(media.listenerCount()).toBe(0)
  })

  it('starts a compact workspace with a reachable opener, and opening it folds the controls', async () => {
    stubMedia({ '(max-width: 1180px)': true, '(max-width: 820px)': false })
    const tree = await shell()
    try {
      const opener = q<HTMLButtonElement>(tree, '.qv-detail-toggle')
      expect(opener?.getAttribute('aria-label')).toBe('打开科学详情')
      expect(opener?.hasAttribute('data-chrome')).toBe(true)
      await interact(() => opener?.click())
      expect(q(tree, '[data-mock-inspector]')?.dataset.open).toBe('true')
      expect(q(tree, '[data-mock-controls]')?.dataset.open).toBe('false')
    } finally {
      await tree.unmount()
    }
  })

  it('uses one bottom drawer at a time on a phone', async () => {
    const media = stubMedia({ '(max-width: 1180px)': true, '(max-width: 820px)': true })
    const tree = await shell()
    try {
      const app = q(tree, '.qv-app')
      expect(q(tree, '[data-mock-controls]')?.dataset.open).toBe('false')
      expect(q(tree, '[data-mock-inspector]')?.dataset.open).toBe('false')
      expect(app?.dataset.drawerOpen).toBe('false')
      expect(q(tree, '.legend')?.dataset.expanded).toBe('false')

      await interact(() => q<HTMLButtonElement>(tree, '.qv-detail-toggle')?.click())
      expect(app?.dataset.drawerOpen).toBe('true')
      await interact(() => q<HTMLButtonElement>(tree, '[data-mock-toggle-controls]')?.click())
      expect(q(tree, '[data-mock-controls]')?.dataset.open).toBe('true')
      expect(q(tree, '[data-mock-inspector]')?.dataset.open).toBe('false')
      await media.change('(max-width: 820px)', false)
      await media.change('(max-width: 820px)', true)
      expect(q(tree, '[data-mock-controls]')?.dataset.open).toBe('false')
    } finally {
      await tree.unmount()
    }
  })

  it('closes the detail panel on Escape and returns focus to its opener', async () => {
    stubMedia({ '(max-width: 1180px)': false, '(max-width: 820px)': false })
    const tree = await shell()
    try {
      await interact(() => {
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
      })
      expect(q(tree, '[data-mock-inspector]')?.dataset.open).toBe('false')
      expect(document.activeElement).toBe(q(tree, '.qv-detail-toggle'))

      await interact(() => q<HTMLButtonElement>(tree, '.qv-detail-toggle')?.click())
      await interact(() => q<HTMLButtonElement>(tree, '[data-mock-close-inspector]')?.click())
      expect(document.activeElement).toBe(q(tree, '.qv-detail-toggle'))
      await interact(() => {
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }))
      })
      expect(q(tree, '[data-mock-inspector]')?.dataset.open).toBe('false')
    } finally {
      await tree.unmount()
    }
  })
})

describe('App: embed mode and the guide', () => {
  it('embeds only the canvas, legend, time pill, status and an open-in-lab link', async () => {
    embed.current = true
    localStorage.clear()
    const tree = await shell()
    try {
      expect(q(tree, '.qv-app')?.dataset.embed).toBe('true')
      expect(q(tree, 'header.qv-header')).toBeNull()
      expect(q(tree, '[data-mock-controls]')).toBeNull()
      expect(q(tree, '.qv-search')).toBeNull()
      expect(q(tree, '[data-mock-inspector]')).toBeNull()
      expect(q(tree, '[role="dialog"]')).toBeNull()
      expect(q(tree, '.legend')?.dataset.expanded).toBe('false')
      expect(q(tree, '.qv-time-pill')).not.toBeNull()
      expect(q(tree, '[data-status]')).not.toBeNull()
      const link = q<HTMLAnchorElement>(tree, 'a.qv-embed-open')
      expect(link?.textContent).toBe('在实验室中打开')
      expect(link?.target).toBe('_blank')
    } finally {
      await tree.unmount()
    }
  })

  it('opens the guide on a first visit, from the header later, and never over a deep link', async () => {
    localStorage.clear()
    const first = await shell()
    try {
      expect(q(first, '[role="dialog"]')?.getAttribute('aria-modal')).toBe('true')
      await interact(() => q<HTMLButtonElement>(first, 'button[aria-label="关闭指南"]')?.click())
      expect(q(first, '[role="dialog"]')).toBeNull()
      await interact(() => q<HTMLButtonElement>(first, 'button[data-action="open-guide"]')?.click())
      expect(q(first, '[role="dialog"]')).not.toBeNull()
    } finally {
      await first.unmount()
    }

    localStorage.clear()
    window.history.replaceState(null, '', '#mode=eigenstate&n=3')
    const linked = await shell()
    try {
      expect(q(linked, '[role="dialog"]')).toBeNull()
    } finally {
      await linked.unmount()
    }
  })

  it('leaves the URL binding to main.tsx: the shell never binds it a second time', async () => {
    // B11's bootstrap binds once per page. A second binding here would add a
    // second store subscriber and a second catalogue fetch for preset links.
    const tree = await shell()
    await tree.update(createElement(App))
    await tree.unmount()
    expect(binding.bound).toBe(0)
  })
})
```

- [ ] **Step 2: Run and see them fail.**

Run: `npm --prefix web run test:watch -- run src/App.test.tsx src/components/useMediaQuery.test.tsx src/components/EmbedBar.test.tsx src/styleContract.test.ts`
Expected: FAIL — no `.qv-overlay`, the caption still renders, `useMediaQuery`/`EmbedBar` missing, `quantum-observatory.css` still exists.

- [ ] **Step 3: Implement.**

`web/src/components/useMediaQuery.ts`:

```ts
import { useEffect, useState } from 'react'

/** Where the detail panel stops being a permanent rail. */
export const COMPACT_WORKSPACE_QUERY = '(max-width: 1180px)'
/** Where panels become bottom drawers. */
export const MOBILE_QUERY = '(max-width: 820px)'

function listFor(query: string): MediaQueryList | null {
  if (typeof globalThis.matchMedia !== 'function') return null
  return globalThis.matchMedia(query)
}

/**
 * A media query, LIVE. CSS decides the geometry at a breakpoint and this hook
 * lets JavaScript own what is open there; subscribing keeps the two aligned
 * when a window is resized or zoom crosses the breakpoint.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => listFor(query)?.matches === true)
  useEffect(() => {
    const list = listFor(query)
    if (list === null) return undefined
    const onChange = (event: MediaQueryListEvent): void => setMatches(event.matches)
    list.addEventListener('change', onChange)
    setMatches(list.matches)
    return () => list.removeEventListener('change', onChange)
  }, [query])
  return matches
}
```

`web/src/components/EmbedBar.tsx`:

```tsx
import { ExternalLink } from 'lucide-react'
import type { SyntheticEvent } from 'react'

import { parseDeepLink, serializeDeepLink, type DeepLinkState } from '../state/urlState'

/** The full-lab link for an embed: the same deep link, minus `embed`. */
export function embedLabHref(hash: string): string {
  const state: DeepLinkState = { ...parseDeepLink(hash) }
  delete state.embed
  const query = serializeDeepLink(state).replace(/^#/, '')
  return query === '' ? './' : `./#${query}`
}

/**
 * "在实验室中打开" -- the one control an embedded figure keeps. The href is
 * re-read from the live hash (main.tsx's bindUrlState keeps it equal to the
 * store; t only once playback pauses) at the moment the reader reaches for
 * the link, so it opens what they are looking at.
 */
export function EmbedBar() {
  const refresh = (event: SyntheticEvent<HTMLAnchorElement>): void => {
    event.currentTarget.setAttribute('href', embedLabHref(window.location.hash))
  }
  return (
    <a
      className="qv-embed-open qv-glass"
      data-chrome=""
      href={embedLabHref(window.location.hash)}
      target="_blank"
      rel="noopener"
      onPointerDown={refresh}
      onFocus={refresh}
      onClick={refresh}
    >
      <ExternalLink size={16} aria-hidden="true" />
      在实验室中打开
    </a>
  )
}
```

`web/src/App.tsx` — whole file:

```tsx
import { PanelRightOpen } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'

import type { SceneStatus } from './api/types'
import { ControlPanel } from './components/ControlPanel'
import { EmbedBar } from './components/EmbedBar'
import { ErrorBoundary, LabFailure } from './components/ErrorBoundary'
import { GuideDialog, shouldAutoOpenGuide } from './components/GuideDialog'
import { Header } from './components/Header'
import { Inspector } from './components/Inspector'
import { Legend } from './components/Legend'
import { LoadingOverlay } from './components/LoadingOverlay'
import { OrbitalCanvas } from './components/OrbitalCanvas'
import { SearchPill } from './components/SearchPill'
import { StatusChip } from './components/StatusChip'
import { TimePill } from './components/TimePill'
import { COMPACT_WORKSPACE_QUERY, MOBILE_QUERY, useMediaQuery } from './components/useMediaQuery'
import { WebGLGate } from './components/WebGLGate'
import { useCatalogs } from './state/catalogs'
import { isEmbedMode } from './state/urlState'
import { useSceneStore } from './state/useSceneStore'

/**
 * The lab: a full-bleed canvas layer and a pointer-transparent overlay of
 * glass panels. Every overlay child carries data-chrome, so hiding
 * [data-chrome] leaves exactly the one <canvas> (the visual suite relies on it).
 */
function LabShell() {
  const compact = useMediaQuery(COMPACT_WORKSPACE_QUERY)
  const mobile = useMediaQuery(MOBILE_QUERY)
  const [embed] = useState(() => isEmbedMode())
  const [status, setStatus] = useState<SceneStatus>({ loading: true })
  const [controlsOpen, setControlsOpen] = useState(() => !mobile)
  const [detailOpen, setDetailOpen] = useState(() => !compact)
  const [guideOpen, setGuideOpen] = useState(
    () => !embed && shouldAutoOpenGuide(window.location.hash),
  )
  const bloom = useSceneStore((state) => state.bloom)
  const detailOpenerRef = useRef<HTMLButtonElement | null>(null)
  const restoreDetailFocus = useRef(false)
  const previousCompact = useRef(compact)
  const previousMobile = useRef(mobile)
  const handleStatus = useCallback((value: SceneStatus) => setStatus(value), [])

  // One catalogue load per page, even for an embed that renders no controls:
  // the time pill needs the selected mixture's period and the planner its floors.
  // (The URL hash is bound once, before the first render, by main.tsx -- B11.)
  useCatalogs()

  useEffect(() => {
    // A permanent rail must not silently become a canvas-covering overlay when
    // the window narrows; leave the visible opener and wait for intent.
    const entered = compact && !previousCompact.current
    previousCompact.current = compact
    if (!entered) return
    restoreDetailFocus.current = false
    setDetailOpen(false)
  }, [compact])

  useEffect(() => {
    const entered = mobile && !previousMobile.current
    previousMobile.current = mobile
    if (!entered) return
    restoreDetailFocus.current = false
    setControlsOpen(false)
    setDetailOpen(false)
  }, [mobile])

  const openDetail = (): void => {
    restoreDetailFocus.current = false
    setDetailOpen(true)
    // Weather-Lab: the controls fold to their round button when details open on a narrow screen.
    if (compact || mobile) setControlsOpen(false)
  }

  const closeDetail = useCallback((): void => {
    restoreDetailFocus.current = true
    setDetailOpen(false)
  }, [])

  const changeControls = (open: boolean): void => {
    setControlsOpen(open)
    if (open && mobile) setDetailOpen(false)
  }

  useEffect(() => {
    if (detailOpen || !restoreDetailFocus.current) return
    restoreDetailFocus.current = false
    detailOpenerRef.current?.focus()
  }, [detailOpen])

  useEffect(() => {
    if (!detailOpen || guideOpen) return undefined
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      closeDetail()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [closeDetail, detailOpen, guideOpen])

  const drawerOpen = mobile && (controlsOpen || detailOpen)

  return (
    <div
      className="qv-app"
      data-embed={embed ? 'true' : undefined}
      data-drawer-open={drawerOpen ? 'true' : 'false'}
    >
      <div className="qv-stage">
        <ErrorBoundary
          fallback={(error, reset) => (
            <LabFailure title="三维场景无法显示" error={error} onRetry={reset} />
          )}
        >
          <WebGLGate>
            <OrbitalCanvas onStatus={handleStatus} />
          </WebGLGate>
        </ErrorBoundary>
      </div>
      <div className="qv-overlay">
        {embed ? null : <Header onOpenGuide={() => setGuideOpen(true)} />}
        <StatusChip status={status} />
        {embed ? null : <ControlPanel open={controlsOpen} onOpenChange={changeControls} />}
        {embed ? null : <SearchPill />}
        {embed || detailOpen ? null : (
          <button
            type="button"
            className="qv-detail-toggle qv-glass"
            data-chrome=""
            ref={detailOpenerRef}
            aria-controls="science-inspector"
            aria-expanded={false}
            aria-label="打开科学详情"
            title="打开科学详情"
            onClick={openDetail}
          >
            <PanelRightOpen size={18} aria-hidden="true" />
            <span>科学详情</span>
          </button>
        )}
        {embed ? null : <Inspector status={status} open={detailOpen} onClose={closeDetail} />}
        <TimePill status={status} />
        <Legend status={status} bloom={bloom} defaultExpanded={!embed && !mobile} />
        {embed ? <EmbedBar /> : null}
        {/*
          Keyed to `loading` alone, deliberately: `refreshing` means a frame is
          still on screen and still true, and the status chip already says a
          newer one is on its way.
        */}
        <LoadingOverlay visible={status.loading} />
        {embed ? null : <GuideDialog open={guideOpen} onClose={() => setGuideOpen(false)} />}
      </div>
    </div>
  )
}

export default function App() {
  return (
    <ErrorBoundary fallback={(error) => <LabFailure title="实验室遇到错误" error={error} />}>
      <LabShell />
    </ErrorBoundary>
  )
}
```

`web/src/main.tsx` — the CSS imports become exactly (Part B's bootstrap lines untouched):

```ts
import './styles.css'
import './lab.css'
```

`git rm web/src/quantum-observatory.css`.

`web/src/styles.css` — whole file (the four rule groups the colour tests read, byte-for-byte as today plus D2's speed ramp; everything else moved to `lab.css`):

```css
/*
  Data colours only. Every rule here is a legend swatch whose stops are
  computed by the renderer's own colour modules and read back from this file
  by a test:
    .phase-wheel, .phase-dot.red, .phase-dot.cyan -> scene/color.test.ts
    .diverging-ramp, .density-ramp                 -> scene/SliceField.test.tsx
    .speed-ramp                                    -> scene/speedColor.test.ts
  Layout and chrome live in lab.css.
*/
.phase-dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; }
.phase-dot.cyan { background: #46fafa; box-shadow: 0 0 8px #46fafa; }
.phase-dot.red { background: #fa4646; box-shadow: 0 0 8px #fa4646; }
.phase-wheel { height: 7px; border-radius: 10px; background: linear-gradient(90deg, #46fafa, #4646fa, #fa46fa, #fa4646, #fafa46, #46fa46, #46fafa); }

/*
  The two slice value ramps. Their stops are the colours scene/sliceColor.ts
  computes, not colours picked to look similar: #fa4646 is phaseToRgb(0) and
  #46fafa is phaseToRgb(pi) -- the diverging poles, so a reader who learned
  "red is +, cyan is -" from a phase-coloured orbital keeps that reading here --
  #383838 is SLICE_NEUTRAL_RGB, the dark midpoint both value maps paint at
  zero, and #4646fa / #acacfd are the sequential map's saturated knee and its
  white-tinted top. A legend swatch that drifts from the texture beside it is
  worse than no swatch, so these stops are the only thing in this file that may
  change when that module's constants do.

  That is now CHECKED rather than promised: SliceField.test.tsx reads these two
  gradients out of this file and asserts that the slice renders each stop's
  colour -- which is why the slice's DataTexture is tagged sRGB, so the
  renderer's decode and its output encode cancel and a byte here is the byte on
  screen. Measured before that tag was set: #383838 reached the canvas as
  #818181, and the plane's dark baseline came up a light grey.
*/
.diverging-ramp { height: 7px; border-radius: 10px; background: linear-gradient(90deg, #46fafa, #383838, #fa4646); }
/* The knee sits at 50%, exactly where sequentialRgb's SEQUENTIAL_KNEE is. */
.density-ramp { height: 7px; border-radius: 10px; background: linear-gradient(90deg, #383838, #4646fa 50%, #acacfd); }

/*
  The streamline speed ramp: speedRampHex(t) from scene/speedColor.ts at the
  nine SPEED_LEGEND_STOPS, t = √(|j|/ρ ÷ max). speedColor.test.ts reads these
  stops back and fails if one drifts from the renderer by a single byte.
*/
.speed-ramp {
  height: 10px;
  border-radius: 999px;
  background: linear-gradient(90deg, #2b6cff 0%, #6b69f3 12.5%, #8d65e6 25%, #a862d7 37.5%, #be5ec8 50%, #d05ab6 62.5%, #e156a3 75%, #f1528b 87.5%, #ff4d6d 100%);
}
```

`web/src/lab.css` — append:

```css
/* ---- Embed + drawers ---- */
.qv-embed-open {
  position: fixed;
  top: 12px;
  right: 12px;
  z-index: 20;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 36px;
  padding: 0 14px;
  border-radius: var(--qv-radius-pill);
  color: var(--qv-text);
  font-size: 13px;
  font-weight: 500;
}
.qv-embed-open:hover { text-decoration: none; }
.qv-app[data-embed="true"] .qv-time-pill { bottom: 12px; }

@media (max-width: 820px) {
  .qv-app[data-drawer-open="true"] .qv-controls-fab,
  .qv-app[data-drawer-open="true"] .qv-detail-toggle { display: none; }
  .qv-app[data-embed="true"] .qv-time-pill { right: 12px; left: 12px; }
}
```

`web/coverage-scope.json` — insert into both arrays: `"src/components/EmbedBar.tsx"` directly after `"src/components/ControlPanel.tsx"`; `"src/components/useMediaQuery.ts"` directly after `"src/components/useDeferredDisposableRef.ts"`.

- [ ] **Step 4: Run and see them pass.**

Run: `npm --prefix web run test:watch -- run src/App.test.tsx src/components/useMediaQuery.test.tsx src/components/EmbedBar.test.tsx src/styleContract.test.ts src/scene/color.test.ts src/scene/SliceField.test.tsx src/scene/speedColor.test.ts src/main.test.tsx src/guards.test.ts`
Expected: PASS. `npm --prefix web run typecheck` → exit 0. `Select-String -Path web/src -Pattern 'quantum-observatory' -SimpleMatch -Recurse`… (PowerShell: `Get-ChildItem web/src -Recurse -File | Select-String 'quantum-observatory'`) → no output.

- [ ] **Step 5: Pre-commit gate, then commit.** Both gate commands must exit 0 — `test` runs all five stages (clean-coverage, `tsc -p tsconfig.test.json`, vitest with per-file 90/85/90/90, `assert-no-skips`, `assert-coverage-scope`); a failure is fixed inside this task before committing.

```powershell
npm --prefix web run test
npm --prefix web run typecheck
git add web/src/App.tsx web/src/App.test.tsx web/src/components/useMediaQuery.ts web/src/components/useMediaQuery.test.tsx web/src/components/EmbedBar.tsx web/src/components/EmbedBar.test.tsx web/src/main.tsx web/src/styles.css web/src/styleContract.test.ts web/src/lab.css web/coverage-scope.json
git rm web/src/quantum-observatory.css
git commit -m "feat(web): full-bleed canvas with floating glass chrome, drawers and embed mode" -m "Claude-Session: https://claude.ai/code/session_01E44DEzsc7Av26fc7nZ5rSo"
```

### Task D21: E2E specs follow the new DOM (visual + fullstack)

**Files:**
- Modify: `web/e2e/slice.spec.ts` (header comment 35–62 and 145–155; comments at 196–204, 212–218, 259–263, 912–919; helpers 390–470, 472–482, 498–513; the seven test bodies 580–925), `web/fullstack-e2e/app.spec.ts:164-169,229-237,248`
- Not modified: `web/scripts/assert-visual-run.mjs`, `web/scripts/assert-fullstack-run.mjs` (test titles, snapshot names and screenshot-option helpers are unchanged, and every `toHaveScreenshot` stays a top-level awaited statement, which is what their AST audit reads — `assert-visual-run.mjs:656-703`); `web/playwright.config.ts` (viewport 1280×800 already equals the new full-bleed canvas); `tests/test_check_script.py` fullstack substrings (`:1549-1597` — the MkDocs half of `app.spec.ts` is untouched).

**Interfaces:**
- Consumes: D-produced hooks `[data-chrome]`, `nav[aria-label=控制上下文]` buttons `量子态`/`表示法`/`显示`, `button[data-representation]`, `input[data-display="bloom"]`, `[data-choice] button[data-choice-value]`, `button[data-action="more-orbitals"]`, `button[data-basis="complex"]`, `select[data-quantum="m"]`, `button[data-state-kind="superposition"]`, `button[data-mixture="2s-2pz"]`, `input[data-parameter="timeAu"]` (time pill, live mode), `.contract-list dt/dd`, `.legend-title`, `.legend`, `.warning-card`, `#science-inspector h2`, `[data-control-section="state-kind"]`, `localStorage['quviz.guide.v1']`.
- Consequence stated up front: after this task the five PNG baselines no longer match (the canvas is 1280×800 instead of 672×704, z is up, the background is opaque #0e0f11, the starfield is gone, the gizmo is drawn). `npm run test:visual` will fail its positive screenshot comparisons until Part E regenerates and reviews the five baselines in `mcr.microsoft.com/playwright:v1.62.1-noble`. It cannot run on Windows in any case (`playwright.config.ts:50-58`).

**Selector / string changes in `web/e2e/slice.spec.ts`:**

| Old | New |
|---|---|
| `openControlContext(page, '态制备' \| '表示法' \| '显示')` via `.context-rail button` | `revealControls(page, '量子态' \| '表示法' \| '显示')` via `getByRole('navigation', { name: '控制上下文' }).getByRole('button', { name, exact: true })` |
| hide `.representation-command-switch`, `.viewport-copy`, `.legend` inside `showPlaneSection` | `hideChrome(page)` hides every `[data-chrome]` right before each capture; `revealChrome(page)` before driving controls again |
| `.segmented.two button:has-text("复基 · Lz")` | `button[data-action="more-orbitals"]` (expand) then `button[data-basis="complex"]` |
| `.quantum-grid label:has-text("m") select` | `select[data-quantum="m"]` |
| `.representation-switch button:has-text("叠加态")` | `button[data-state-kind="superposition"]` |
| `.mixture-list button:has-text("2s + 2p_z")` | `button[data-mixture="2s-2pz"]` |
| `timeSlider` = ParameterRow range in the 表示法 context | `input[data-parameter="timeAu"]`, the time pill's number entry (same `step="0.2"`, same `fill`) — no context switch |
| guide dialog (new, modal on first visit) | suppressed by `page.addInitScript` setting `localStorage['quviz.guide.v1'] = 'seen'` before `goto` |
| frame "672 x 704 = 473088 px" | "1280 x 800 = 1024000 px" (budget 1024 px); calibration numbers marked as measured on the retired frame, to be re-measured by Part E |

Unchanged: `canvasOf = page.locator('canvas')` (strict single canvas — still exactly one), `span[data-status]`, `[data-scene-ready]`, `[data-choice=…] button[data-choice-value=…]`, `input[data-display="bloom"]`, `.contract-list dt`, `.legend-title`, `.legend`, `.warning-card`, every fixture question and provenance list, every screenshot call and its options helper, the status regex `/正在显示 t=0\.0 a\.u\. · 正在计算 t=8\.4 a\.u\./`.

- [ ] **Step 1: Confirm the current specs no longer match the DOM (the "failing test" for this task).**

Run: `npm --prefix web run build` then `npm --prefix web run test:fullstack`
Expected: FAIL at `page.getByRole('navigation', { name: '控制上下文' }).getByRole('button', { name: '态制备', exact: true })` (the nav's buttons are now `量子态`/`表示法`/`显示`) — or earlier, if the first-visit guide dialog intercepts a click. (`slice.spec.ts` cannot run on Windows; its source is audited in Step 4 by `src/visualGate.test.ts`.)

- [ ] **Step 2: Edit `web/e2e/slice.spec.ts`.**

Header comment — replace lines 38–43 with:

```ts
 * Five Linux/SwiftShader PNGs are committed in `e2e/__screenshots__/`. The
 * canvas is full-bleed: every file is 1280 x 800 = 1024000 pixels, so the
 * 0.001 ratio budget is 1024 pixels. Every floating panel carries
 * `data-chrome`; `hideChrome` hides all of them immediately before each
 * capture, so a panel's glass and text can never leak into a canvas pixel.
```

and replace lines 148–154 ("**Only the canvas is compared.** …") with:

```ts
 * **Only the canvas is compared.** The scene is WebGL; every panel is a DOM
 * element floating over it and carries `data-chrome`. `hideChrome` hides them
 * all (inline visibility, so layout and text stay in the DOM for the semantic
 * assertions) right before a capture, and `revealChrome` restores them when a
 * test drives the controls again. Playwright masks are deliberately not used:
 * a mask paints its locator's live bounding box into the PNG, so font-metric
 * differences make the mask itself a cross-platform pixel diff.
```

In the comments at 196–204 replace "these canvases are 672 x 704" with "these canvases are 1280 x 800"; at the end of the paragraph 212–218 and of the table header 259–263 add the sentence "(Measured on the retired 672 x 704 frame; Part E re-measures these numbers on the 1280 x 800 frame in the pinned Docker image before regenerating the baselines.)"; at 912–919 replace "The committed 672 x 704 baseline has 473088 pixels and therefore a 473.088-pixel ratio budget." with "The committed 1280 x 800 baseline has 1024000 pixels and therefore a 1024-pixel ratio budget." No constant, threshold or helper that `assert-visual-run.mjs` pins changes.

Add after `SETTLE` (line 299):

```ts
/** The key the lab remembers a dismissed guide under (src/components/GuideDialog.tsx). */
const GUIDE_SEEN_KEY = 'quviz.guide.v1'
```

In `openApp`, insert before `await page.goto('/')` (line 402):

```ts
  // The guide dialog opens on a first visit and is modal. Every test here is a
  // returning visitor, so the controls under it stay clickable.
  await page.addInitScript((key) => {
    window.localStorage.setItem(key, 'seen')
  }, GUIDE_SEEN_KEY)
```

Replace `openControlContext` and `showPlaneSection` (lines 432–470) with:

```ts
async function revealControls(page: Page, group: '量子态' | '表示法' | '显示'): Promise<void> {
  const context = page
    .getByRole('navigation', { name: '控制上下文' })
    .getByRole('button', { name: group, exact: true })
  await expect(context).toBeVisible()
  await context.click()
}

/**
 * Hide every floating panel before a canvas capture. Inline visibility keeps
 * the layout boxes and text nodes, so the contract and legend assertions can
 * still read them.
 */
async function hideChrome(page: Page): Promise<void> {
  const chrome = page.locator('[data-chrome]')
  await expect(chrome.first()).toBeAttached()
  await chrome.evaluateAll((elements) => {
    for (const element of elements) (element as HTMLElement).style.visibility = 'hidden'
  })
}

/** Undo `hideChrome` before driving the controls again. */
async function revealChrome(page: Page): Promise<void> {
  await page.locator('[data-chrome]').evaluateAll((elements) => {
    for (const element of elements) (element as HTMLElement).style.visibility = ''
  })
}

/**
 * Switch to a plane section and hold Bloom at zero. Bloom now defaults to 0
 * and mounts no post chain at all; asserting the default through the real
 * control keeps a regressed default from passing silently. `Home` on the
 * focused range input is the platform's own minimum gesture.
 */
async function showPlaneSection(page: Page): Promise<void> {
  await page.locator('button[data-representation="slice"]').click()
  await revealControls(page, '显示')
  const bloom = page.locator('input[data-display="bloom"]')
  await expect(bloom).toBeVisible()
  await expect(bloom).toHaveValue('0')
  await bloom.focus()
  await page.keyboard.press('Home')
  await expect(bloom).toHaveValue('0')
}
```

`chooseObservable` / `choosePlane` (472–482): `await openControlContext(page, '表示法')` → `await revealControls(page, '表示法')`.

`timeSlider` comment (498) → `/** The time pill's exact entry: \`input[type=number][data-parameter="timeAu"]\`, bounded by TIME_BOUND. */`; in `advanceToHalfPeriod` delete line 513 (`await openControlContext(page, '表示法')`) — the pill is always visible. The rest of the function is unchanged.

The seven test bodies (580–925) become (titles, fixtures, provenance lists and screenshot calls unchanged; only the lines marked `// D21` differ from today):

```ts
test('2p_z on xz: the nodal line lies across the plane, not down it', async ({ page, baseURL }) => {
  const ledger = await openApp(page, baseURL)
  await showPlaneSection(page)
  await chooseObservable(page, 'wavefunction_real')
  await settled(page)

  await expect(contractValue(page, '切片平面')).toHaveText('xz')
  await expect(contractValue(page, '数值单位')).toHaveText('bohr^-3/2')
  await expect(contractValue(page, 'max |value|')).toHaveText('7.276e-2')
  await expect(contractValue(page, '2D 网格')).toHaveText('65 × 65 · Δ=0.583 bohr')
  await expect(contractValue(page, 'mask 占比')).toHaveText('0.000%')
  await expect(page.locator('.legend-title')).toHaveText('平面上的 Re ψ')

  expectProvenance(ledger, {
    served: [...CATALOGS, '2pz-real-xz'],
    declared: [
      EIGENSTATE_DENSITY_XZ,
      eigenstateSliceQuestion({
        n: '2',
        l: '1',
        m: '0',
        basis: 'real',
        plane: 'xz',
        observable: 'wavefunction_real',
      }),
    ],
  })

  // The picture. With z up, 2p_z's lobes sit one above the other and the
  // nodal line (z = 0) runs HORIZONTALLY across the section.
  await hideChrome(page) // D21
  await expect(canvasOf(page)).toHaveScreenshot('2pz-real-xz.png', screenshotOptions())
  expect(ledger.offOrigin, 'a request escaped while the frame was being compared').toEqual([])
})

test('2p(+1) on xy: one winding around a masked disc', async ({ page, baseURL }) => {
  const ledger = await openApp(page, baseURL)
  await showPlaneSection(page)
  await revealControls(page, '量子态') // D21
  await page.locator('button[data-action="more-orbitals"]').click() // D21
  await page.locator('button[data-basis="complex"]').click() // D21
  await page.locator('select[data-quantum="m"]').selectOption('1') // D21
  await choosePlane(page, 'xy')
  await chooseObservable(page, 'phase')
  await settled(page)

  await expect(contractValue(page, '切片平面')).toHaveText('xy')
  await expect(contractValue(page, '数值单位')).toHaveText('radian')
  await expect(page.locator('.legend-title')).toHaveText('波函数 phase')
  await expect(contractValue(page, 'mask 占比')).toHaveText('0.024%')
  await expect(contractValue(page, 'mask 占比')).not.toHaveText('0.000%')
  await expect(contractValue(page, 'mask 哨兵值')).toHaveText('0.000')
  await expect(page.locator('.legend')).toContainText('该平面有 0.0237% 被 mask')

  expectProvenance(ledger, {
    served: [...CATALOGS, '2p+1-phase-xy'],
    declared: [
      EIGENSTATE_DENSITY_XZ,
      eigenstateSliceQuestion({
        n: '2', l: '1', m: '0', basis: 'complex', plane: 'xz', observable: 'probability_density',
      }),
      eigenstateSliceQuestion({
        n: '2', l: '1', m: '1', basis: 'complex', plane: 'xz', observable: 'probability_density',
      }),
      eigenstateSliceQuestion({
        n: '2', l: '1', m: '1', basis: 'complex', plane: 'xy', observable: 'probability_density',
      }),
      eigenstateSliceQuestion({
        n: '2', l: '1', m: '1', basis: 'complex', plane: 'xy', observable: 'phase',
      }),
    ],
  })

  await hideChrome(page) // D21
  await expect(canvasOf(page)).toHaveScreenshot('2p+1-phase-xy.png', screenshotOptions())
  expect(ledger.offOrigin, 'a request escaped while the frame was being compared').toEqual([])
})

test('2s + 2p_z are degenerate: the same picture at t=0 and at t=8.4', async ({ page, baseURL }) => {
  const terms = SUPERPOSITION_TERMS['2s-2pz']
  const held = superpositionSliceQuestion({ terms, time: HALF_PERIOD_AU })
  const ledger = await openApp(page, baseURL, { hold: held })
  await showPlaneSection(page)
  await revealControls(page, '量子态') // D21
  await page.locator('button[data-state-kind="superposition"]').click() // D21
  await settled(page)
  await page.locator('button[data-mixture="2s-2pz"]').click() // D21
  await settled(page)

  await expect(contractValue(page, '⟨H⟩')).toHaveText('-0.125000 Ha · 定态 density')
  await expect(page.locator('.warning-card')).toContainText(
    'all terms share one energy, so this superposition is stationary',
  )
  await expect(contractValue(page, 't')).toHaveText('0.00 a.u.')
  await expect(contractValue(page, '切片平面')).toHaveText('xz')

  expectProvenance(ledger, {
    served: [...CATALOGS, '1s2pz-t0-xz', 'degenerate-stationary-xz-t0'],
    declared: [EIGENSTATE_DENSITY_XZ],
  })

  await hideChrome(page) // D21
  await expect(canvasOf(page)).toHaveScreenshot(
    'degenerate-stationary-xz.png',
    screenshotOptions(),
  )

  await revealChrome(page) // D21
  await advanceToHalfPeriod(page, ledger)

  await expect(contractValue(page, '⟨H⟩')).toHaveText('-0.125000 Ha · 定态 density')
  await expect(contractValue(page, 't')).toHaveText('8.40 a.u.')

  expectProvenance(ledger, {
    served: [
      ...CATALOGS,
      '1s2pz-t0-xz',
      'degenerate-stationary-xz-t0',
      'degenerate-stationary-xz-t8.4',
    ],
    declared: [EIGENSTATE_DENSITY_XZ],
  })

  await hideChrome(page) // D21
  await expect(canvasOf(page)).toHaveScreenshot(
    'degenerate-stationary-xz.png',
    screenshotOptions(),
  )
  expect(ledger.offOrigin, 'a request escaped while the frame was being compared').toEqual([])
})

test('the comparison rejects a two-percent plane-extent error beyond the AA fringe', async ({
  page,
  baseURL,
}) => {
  const terms = SUPERPOSITION_TERMS['2s-2pz']
  const held = superpositionSliceQuestion({ terms, time: HALF_PERIOD_AU })
  const ledger = await openApp(page, baseURL, {
    hold: held,
    transform: { 'degenerate-stationary-xz-t8.4': enlargeSliceGeometry },
  })
  await showPlaneSection(page)
  await revealControls(page, '量子态') // D21
  await page.locator('button[data-state-kind="superposition"]').click() // D21
  await settled(page)
  await page.locator('button[data-mixture="2s-2pz"]').click() // D21
  await settled(page)

  await expect(contractValue(page, 't')).toHaveText('0.00 a.u.')
  await expect(contractValue(page, '2D 网格')).toHaveText('65 × 65 · Δ=0.620 bohr')
  expectProvenance(ledger, {
    served: [...CATALOGS, '1s2pz-t0-xz', 'degenerate-stationary-xz-t0'],
    declared: [EIGENSTATE_DENSITY_XZ],
  })
  await hideChrome(page) // D21
  await expect(canvasOf(page)).toHaveScreenshot(
    'degenerate-stationary-xz.png',
    screenshotOptions(),
  )

  await revealChrome(page) // D21
  await advanceToHalfPeriod(page, ledger)
  await expect(contractValue(page, '⟨H⟩')).toHaveText('-0.125000 Ha · 定态 density')
  await expect(contractValue(page, '2D 网格')).toHaveText('65 × 65 · Δ=0.633 bohr')
  expectProvenance(ledger, {
    served: [
      ...CATALOGS,
      '1s2pz-t0-xz',
      'degenerate-stationary-xz-t0',
      'degenerate-stationary-xz-t8.4',
    ],
    declared: [EIGENSTATE_DENSITY_XZ],
  })

  await hideChrome(page) // D21
  await expect(canvasOf(page)).not.toHaveScreenshot(
    'degenerate-stationary-xz.png',
    geometryRejectionOptions(),
  )
  expect(ledger.offOrigin, 'a request escaped while the frame was being compared').toEqual([])
})

test('1s + 2p_z at t=0: the dipole in its first lobe', async ({ page, baseURL }) => {
  const ledger = await openApp(page, baseURL)
  await showPlaneSection(page)
  await revealControls(page, '量子态') // D21
  await page.locator('button[data-state-kind="superposition"]').click() // D21
  await settled(page)

  await expect(contractValue(page, 't')).toHaveText('0.00 a.u.')
  await expect(contractValue(page, '切片平面')).toHaveText('xz')
  await expect(contractValue(page, '数值单位')).toHaveText('bohr^-3')
  await expect(contractValue(page, '⟨H⟩')).toHaveText('-0.312500 Ha')
  await expect(page.locator('.legend-title')).toHaveText('概率密度 |ψ|²')

  expectProvenance(ledger, {
    served: [...CATALOGS, '1s2pz-t0-xz'],
    declared: [EIGENSTATE_DENSITY_XZ],
  })

  await hideChrome(page) // D21
  await expect(canvasOf(page)).toHaveScreenshot('1s2pz-t0-xz.png', screenshotOptions())
  expect(ledger.offOrigin, 'a request escaped while the frame was being compared').toEqual([])
})

test('1s + 2p_z at t=8.4: half a Bohr period later, the lobe has swung over', async ({
  page,
  baseURL,
}) => {
  const held = superpositionSliceQuestion({
    terms: SUPERPOSITION_TERMS['1s-2pz'],
    time: HALF_PERIOD_AU,
  })
  const ledger = await openApp(page, baseURL, { hold: held })
  await showPlaneSection(page)
  await revealControls(page, '量子态') // D21
  await page.locator('button[data-state-kind="superposition"]').click() // D21
  await settled(page)
  await expect(contractValue(page, 't')).toHaveText('0.00 a.u.')

  await advanceToHalfPeriod(page, ledger)
  await expect(contractValue(page, '⟨H⟩')).toHaveText('-0.312500 Ha')

  expectProvenance(ledger, {
    served: [...CATALOGS, '1s2pz-t0-xz', '1s2pz-t8.4-xz'],
    declared: [EIGENSTATE_DENSITY_XZ],
  })

  await hideChrome(page) // D21
  await expect(canvasOf(page)).toHaveScreenshot('1s2pz-t8.4-xz.png', screenshotOptions())

  await expect(canvasOf(page)).not.toHaveScreenshot(
    '1s2pz-t0-xz.png',
    halfPeriodRejectionOptions(),
  )
  expect(ledger.offOrigin, 'a request escaped while the frame was being compared').toEqual([])
})

test('the comparison can see a transposed slice: the apparatus is not vacuous', async ({
  page,
  baseURL,
}) => {
  const ledger = await openApp(page, baseURL, {
    transform: { '2pz-real-xz': transposeSlicePayload },
  })
  await showPlaneSection(page)
  await chooseObservable(page, 'wavefunction_real')
  await settled(page)

  await expect(contractValue(page, 'max |value|')).toHaveText('7.276e-2')
  await expect(contractValue(page, '2D 网格')).toHaveText('65 × 65 · Δ=0.583 bohr')
  await expect(contractValue(page, 'mask 占比')).toHaveText('0.000%')

  expectProvenance(ledger, {
    served: [...CATALOGS, '2pz-real-xz'],
    declared: [
      EIGENSTATE_DENSITY_XZ,
      eigenstateSliceQuestion({
        n: '2',
        l: '1',
        m: '0',
        basis: 'real',
        plane: 'xz',
        observable: 'wavefunction_real',
      }),
    ],
  })

  await hideChrome(page) // D21
  await expect(canvasOf(page)).not.toHaveScreenshot(
    '2pz-real-xz.png',
    transposeRejectionOptions(),
  )
  expect(ledger.offOrigin, 'a request escaped while the frame was being compared').toEqual([])
})
```

(Keep the long explanatory comments that sit inside today's test bodies — they are unchanged prose; only the `// D21` statements are new. Strip the `// D21` markers when committing.)

- [ ] **Step 3: Edit `web/fullstack-e2e/app.spec.ts`.**

Insert before `const initialPointCloud = waitForApi(page, '/api/orbitals/point-cloud')` (line 168):

```ts
  // The guide dialog opens on a first visit and is modal; this journey is a
  // returning visitor's (src/components/GuideDialog.tsx GUIDE_SEEN_KEY).
  await page.addInitScript(() => {
    window.localStorage.setItem('quviz.guide.v1', 'seen')
  })
```

Replace lines 229–237 with:

```ts
  await page
    .getByRole('navigation', { name: '控制上下文' })
    .getByRole('button', { name: '量子态', exact: true })
    .click()
  const superposition = waitForApi(page, '/api/superposition/isosurface')
  await page
    .locator('[data-control-section="state-kind"]')
    .getByRole('button', { name: '叠加态', exact: true })
    .click()
```

Replace line 248 (`.topbar-context-value`) with — the header no longer carries a state read-out; the detail panel's title is the arrived label:

```ts
  await expect(page.locator('#science-inspector h2')).toHaveText('1s + 2p_z (Bohr oscillation)')
```

Everything else in `app.spec.ts` (the `查看 OpenAPI` → `/docs` link, `#science-inspector` texts, `.legend` texts, `[data-flow-example]`, `.energy-pill`, the MkDocs half) is unchanged.

- [ ] **Step 4: Run and see them pass.**

Run: `npm --prefix web run test:watch -- run src/visualGate.test.ts src/fullstackGate.test.ts src/guards.test.ts`
Expected: PASS — `visualGate.test.ts:451` audits the real `slice.spec.ts` source: every required screenshot is still a top-level awaited statement with its pinned options helper, no top-level control flow was added, and the comparison constants are untouched.
Run: `npm --prefix web run typecheck`
Expected: exit 0 (`tsconfig.e2e.json` type-checks both specs).
Run: `npm --prefix web run test:fullstack`
Expected: PASS — 1 test, `serves the built product and completes every core scene path against FastAPI`, and `assert-fullstack-run.mjs` prints `required product-path test ran exactly once`.
Run: `uv run --locked --no-sync pytest tests/test_check_script.py -q`
Expected: PASS (the fullstack MkDocs contract substrings and the 13-file `web/scripts` pin are untouched).

- [ ] **Step 5: Pre-commit gate, then commit.** Both gate commands must exit 0 — `test` runs all five stages (clean-coverage, `tsc -p tsconfig.test.json`, vitest with per-file 90/85/90/90, `assert-no-skips`, `assert-coverage-scope`); a failure is fixed inside this task before committing.

```powershell
npm --prefix web run test
npm --prefix web run typecheck
git add web/e2e/slice.spec.ts web/fullstack-e2e/app.spec.ts
git commit -m "test(web): drive the redesigned lab in e2e and hide all chrome before captures" -m "Claude-Session: https://claude.ai/code/session_01E44DEzsc7Av26fc7nZ5rSo"
```

### Task D22: Final gates, screenshots and human review

**Files:**
- Modify (Step 6, docs that describe the lab — Part C wrote them from spec §4.4 names before D existed): `docs/getting-started/first-orbital.md`, `docs/tutorials/phase-0-walkthrough.md`, `docs/tutorials/frontend-rendering.md`, `docs/textbook/00-how-to-use.md`, and any other `docs/textbook/*.md` the Step 6 search lists
- Test: `tests/test_docs_integrity.py` — Part C's `test_ui_docs_follow_the_redesigned_lab_and_the_static_textbook` (added by C's task "Bring the stale developer pages in line with the redesigned lab and the static textbook") gains three assertions
- Otherwise none, unless a gate fails (fix in place, re-run, and include the fix in this task's commit). Screenshots go to a temp folder, never into the repo.

**Interfaces:**
- Consumes: everything above; Part B's `build` script and `base: './'`; the page texts and test of Part C's stale-developer-pages task and chapter-0 task.
- Produces: the verification record the orchestrator needs to hand over to Part E (numbers and file list pasted into the task report); developer and textbook pages whose quoted UI labels are the ones D shipped.

- [ ] **Step 1: Coverage manifest is complete and sorted.**

```powershell
node -e "const s=require('./web/coverage-scope.json');for(const k of ['coverageGated','pragmaScanned']){const a=s[k];if(JSON.stringify(a)!==JSON.stringify([...a].sort()))throw new Error(k+' is not sorted')};const want=['src/components/AxisGizmo.tsx','src/components/EmbedBar.tsx','src/components/ErrorBoundary.tsx','src/components/GuideDialog.tsx','src/components/SearchPill.tsx','src/components/StatusChip.tsx','src/components/TimePill.tsx','src/components/WebGLGate.tsx','src/components/charts/ChartsPanel.tsx','src/components/charts/EnergyLadderChart.tsx','src/components/charts/RadialDistributionChart.tsx','src/components/charts/SuperpositionTermsChart.tsx','src/components/charts/axes.ts','src/components/controls/ControlGroup.tsx','src/components/controls/DisplaySection.tsx','src/components/controls/RepresentationSection.tsx','src/components/controls/StateSection.tsx','src/components/controls/rows.tsx','src/components/format.ts','src/components/sceneCapture.ts','src/components/stateIndex.ts','src/components/useMediaQuery.ts','src/components/useOrbitalMetadata.ts','src/components/usePlayback.ts','src/scene/speedColor.ts','src/state/catalogs.ts'];for(const f of want){if(!s.coverageGated.includes(f)||!s.pragmaScanned.includes(f))throw new Error('missing '+f)};console.log('coverage manifest: 26 Part D modules present, both arrays sorted')"
```

Expected: `coverage manifest: 26 Part D modules present, both arrays sorted`.

- [ ] **Step 2: Full web gates.**

```powershell
npm --prefix web run test
npm --prefix web run typecheck
npm --prefix web run build
npm --prefix web run test:fullstack
```

Expected: `test` — all vitest files pass, `assert-no-skips` reports zero skipped/todo, `assert-coverage-scope` reports every gated module ≥ 90/85/90/90 (the 26 new ones included); `typecheck` exit 0; `build` exit 0 (the >500 kB chunk warning is pre-existing and documented); `test:fullstack` 1 passed and its audit green. Also run `uv run --locked --no-sync pytest tests/test_check_script.py tests/test_ci_workflows.py tests/test_declared_versions.py -q` → PASS (these pin `web/scripts`, the npm chain and the fullstack spec). The full Python gate runs in Step 6, which edits `tests/test_docs_integrity.py`. Not run anywhere in Part D: `npm run test:visual` (Linux only; expected to fail on pixels until Part E regenerates the five baselines).

- [ ] **Step 3: Build facts that Part E relies on.**

```powershell
Select-String -Path web/dist/index.html -Pattern 'google-sans-flex.css'
Test-Path web/dist/fonts/google-sans-flex-latin-wght-normal.woff2
Get-ChildItem web/dist -Recurse -Filter *.css | Select-String -Pattern 'fonts.googleapis|fonts.gstatic'
```

Expected: the stylesheet link is present (relative `./fonts/…` with Part B's `base: './'`); `True`; no match for a font CDN.

- [ ] **Step 4: Screenshots of the redesigned lab (1600×900 and 400×860).** The planning session's script is `C:\Users\SCHROD~1\AppData\Local\Temp\claude\C--Users-SchrodingerFeiFei-Documents-GitHub-QuViz\e4e5f5e7-ca6c-4fc4-a8a8-91a27bc3b1df\scratchpad\shot.mjs`; if that path is gone, recreate it (outside the repo) with exactly:

```js
import { chromium } from 'file:///C:/Users/SchrodingerFeiFei/Documents/GitHub/QuViz/web/node_modules/playwright-core/index.mjs';
const [url, out, w, h] = process.argv.slice(2);
const browser = await chromium.launch({ args: ['--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: +w || 1600, height: +h || 900 } });
page.on('console', m => { if (m.type() === 'error') console.log('console.error', m.text()); });
await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForTimeout(4000);
await page.screenshot({ path: out });
await browser.close();
```

Then:

```powershell
npm --prefix web run build
$server = Start-Process uv -ArgumentList 'run','--locked','--no-sync','quviz','serve','--port','8765' -PassThru -WindowStyle Hidden
do {
  Start-Sleep -Milliseconds 500
  try { $ready = (Invoke-WebRequest -UseBasicParsing http://127.0.0.1:8765/api/health).StatusCode -eq 200 } catch { $ready = $false }
} until ($ready)
$shots = Join-Path $env:TEMP 'quviz-part-d'
New-Item -ItemType Directory -Force $shots | Out-Null
$shot = 'C:\Users\SCHROD~1\AppData\Local\Temp\claude\C--Users-SchrodingerFeiFei-Documents-GitHub-QuViz\e4e5f5e7-ca6c-4fc4-a8a8-91a27bc3b1df\scratchpad\shot.mjs'
$lab = 'http://127.0.0.1:8765/'
node $shot "$lab" "$shots\first-visit-guide-1600.png" 1600 900
node $shot "$lab#mode=eigenstate&n=2&l=1&m=0&basis=real&rep=point_cloud" "$shots\lab-2pz-1600.png" 1600 900
node $shot "$lab#mode=eigenstate&n=2&l=1&m=0&basis=real&rep=point_cloud" "$shots\lab-2pz-400.png" 400 860
node $shot "$lab#mode=eigenstate&n=2&l=1&m=0&basis=real&rep=slice&plane=xz&obs=wavefunction_real" "$shots\slice-xz-1600.png" 1600 900
node $shot "$lab#mode=superposition&preset=1s-2pz&rep=isosurface" "$shots\superposition-1600.png" 1600 900
node $shot "$lab#mode=eigenstate&n=3&l=2&m=2&basis=complex&rep=streamlines" "$shots\streamlines-1600.png" 1600 900
node $shot "$lab#embed=1&mode=eigenstate&n=2&l=1&m=0&basis=real&rep=point_cloud" "$shots\embed-800x500.png" 800 500
Stop-Process -Id $server.Id
Get-ChildItem $shots
```

Expected: seven PNGs; the script prints no `console.error` line. (Deep-link keys are Part B's `DeepLinkState`; the first-visit shot must show the guide because a fresh browser profile has no `quviz.guide.v1`.) Open each PNG with the Read tool and walk the checklist below; attach the images to the report.

- [ ] **Step 5: Human review checklist** (Weather-Lab notes → what to see; record pass/fail per line in the report):

| # | Weather-Lab reference (scratchpad `weatherlab-style-notes.md`) | Check in the screenshots / live page |
|---|---|---|
| 1 | Full-bleed data canvas; data layers are the only saturated colour | The canvas fills the viewport edge to edge; only the phase red/cyan, the slice ramps and the speed ramp are saturated; chrome is grey/white with the single blue accent |
| 2 | 56 px glass header, logo + name 20 px + pill badge; icon buttons right | Header 56 px, `QuViz` 20 px regular, pill `实时计算` (live) — `教学预览` on Pages; icons OpenAPI · 复制链接 · 保存图像 · 指南 · GitHub; soft blue glow under the bar |
| 3 | Left floating "Controls" panel, radius ~24–30, border rgba(255,255,255,.15), blur, glow | `控制` panel radius 24, 1 px light border, blurred glass; header `控制` 16/700 + close; nav chips `量子态/表示法/显示` |
| 4 | Sections = icon + bold title + toggle; sub-groups on a lighter band; rows label-left/control-right; tiny 10 px tags; "Other …" expander | Group heads with icon tile + bold title + chevron; bands `态类型` / `轨道预设` / `表示方式` / `参数`; radio discs on the right; tags `实基`/`复基`/`简并`/`未预计算`; `更多轨道` expander with ψ(n,ℓ,m) summary |
| 5 | Panel collapses to a single round "tune" button | `×` collapses to the round `调节` button top-left (bottom-left on phones) |
| 6 | Top-right pill FAB "Find locations" | `查找量子态 ⌕` pill top-right; opens into a combobox with tagged options |
| 7 | Bottom-centre time pill: ‹ date ›, play + slider, meta row | Eigenstate: `定态 · |ψ|² 与 t 无关` with a greyed play glyph. Superposition: `‹ t = 0 a.u. ›`, round blue play, one-period scrubber, `周期 T = 16.76 a.u. · 帧 1/28` |
| 8 | Bottom-right legend pill with a ramp and an expand chevron | Legend pill bottom-right; chevron folds the sentences but keeps the ramp |
| 9 | Right detail panel: title, chips, stacked charts on a lighter card, faint grid, italic axis titles | `科学详情`: h2 label + energy pill + close; underline tabs 概览/图表/场景契约/引用; 图表 shows P(r) (node rules, ⟨r⟩ rule, peak marker, italic `r / bohr`) and the energy ladder with the current level in blue, on #1b1c1f cards |
| 10 | About modal: centred, black, radius ~24, centred title, underline tabs | First-visit shot: centred black dialog, `关于 QuViz 实验室`, tabs 概览/读图指南/教材章节; Esc closes; focus returns |
| 11 | Typography: Google Sans family, 14–16 px, white + 60 % white | Latin UI text in Google Sans Flex (check DevTools → Rendered Fonts on the live page), CJK in the system face, numbers tabular |
| 12 | Progressive disclosure | 显示 group folded by default; 更多轨道 folded; detail tabs; legend chevron |
| 13 | Canvas content | No starfield, no violet/cyan fill light; neutral #0e0f11 background; 2p_z lobes stacked vertically (z up); the xy ground grid below the object; the grey x/y/z gizmo bottom-left |
| 14 | Mobile (400×860) | Header condensed; status chip under it; legend a small pill top-right; `调节` bottom-left, `科学详情` bottom-right, time pill between; opening either shows a bottom drawer (56 dvh) with the time pill lifted above it |
| 15 | Embed (800×500) | Only canvas, status chip (top-left), time pill, legend pill and `在实验室中打开` (top-right) |
| 16 | Honesty checks (spec §5, D9) | No "色彩表示 arg ψ" caption anywhere; slice-xz shot has no vignette darkening at the corners; streamline shot's colours match the legend ramp by eye; live page: set 显示 → Bloom 光晕 to 20 % on the slice — the scene and the gizmo both keep rendering (no black frame, no double image) and the legend shows the Bloom warning |

- [ ] **Step 6: Docs that describe the lab use the labels D shipped.** Part C (its chapter-0 task writing `00-how-to-use.md`, its "Bring the stale developer pages in line…" task writing `first-orbital.md` / `phase-0-walkthrough.md` / `frontend-rendering.md`, and the chapters that send readers to the detail panel) described the lab from spec §4.4 before D existed; C's plan (its Review Focus item 5) leaves the alignment to D's PR. Re-read them against the copy deck at the top of this plan.

(a) List every UI-label mention:

```powershell
Select-String -Path docs/textbook/*.md,docs/getting-started/first-orbital.md,docs/tutorials/phase-0-walkthrough.md,docs/tutorials/frontend-rendering.md -Pattern '详情面板|点大小|嵌入|只保留|控制面板|时间胶囊|图例胶囊|查找量子态|调节|教学预览|实时计算|复制链接|保存图像|指南|在实验室中打开|未预计算|定态 ·|能量简并'
```

(b) Compare each hit with the copy deck. Two differences are known from the plans; everything else C quotes (`控制` with `量子态 / 表示法 / 显示`, `调节`, `定态 · |ψ|² 与 t 无关`, `能量简并：密度不随时间变化`, `查找量子态`, `教学预览` / `实时计算`, `教材 · 复制链接 · 保存图像 · 指南 · GitHub`, tabs `概览 / 图表 / 场景契约 / 引用`, `在实验室中打开`, `未预计算`) is the shipped string and stays:

| Page wording (C) | Shipped (D) | Replace with |
|---|---|---|
| `详情面板` naming the right-hand panel (`first-orbital.md` `右侧**详情面板**给出…`; walkthrough `右侧详情面板显示…` / `右侧详情面板应显示…`; `frontend-rendering.md` `右侧详情面板（概览 / 图表 / 场景契约 / 引用）`; chapter 0's lab tour; chapters 2–3 `详情面板“图表”`) | the panel and its opener are labelled `科学详情` (D16/D20) | `**科学详情**面板` in `first-orbital.md`; `“科学详情”面板` everywhere else |
| `first-orbital.md` `**显示**（点大小、透明度等…）` | knob label `点尺寸` (D11) | `点尺寸` |
| chapter 0 `## 交互图怎么用 {#figures}`: embed mode keeps "only the canvas, the legend pill, the time pill and 在实验室中打开" | D20's embed also keeps the status chip (top-left) | add `左上角的状态提示` to that list |

Any further mismatch the search shows (a label D renamed during implementation) is fixed the same way — page text follows the shipped copy, never the other way round.

(c) Write the failing pins first. In `tests/test_docs_integrity.py`, append to `test_ui_docs_follow_the_redesigned_lab_and_the_static_textbook` (Part C):

```python
    # Part D's shipped labels (its copy deck): the right-hand panel and its
    # opener read 科学详情, and the point-size knob reads 点尺寸.
    assert "科学详情" in first_orbital
    assert "科学详情" in walkthrough
    assert "点大小" not in first_orbital
```

Run: `uv run --locked --no-sync --group docs pytest tests/test_docs_integrity.py -q -k redesigned`
Expected: FAIL at `assert "科学详情" in first_orbital` (Part C wrote `详情面板`).

(d) Apply the replacements from (b), then:

Run: `uv run --locked --no-sync --group docs pytest tests/test_docs_integrity.py tests/test_textbook.py tests/test_mkdocs_system.py -q`
Expected: PASS — Part C's older pins (`data-chrome`, `$z$ 轴朝上`, `**量子态**`, no `态制备`/`检查器`, `未预计算`, the ADR-0005 link) still hold, and chapter structure/figure pins are untouched.
Run: `uv run --locked --group docs mkdocs build --strict`
Expected: exit 0 (no page added or removed, so the nav-exactly-once rule is unaffected).

(e) Python pre-commit gate (a file under `tests/` changed):

```powershell
uv run --locked ruff check .
uv run --locked ruff format --check .
uv run --locked mypy
uv run --locked --group docs pytest --cov=quviz --cov-report=term-missing
```

Expected: all exit 0; coverage ≥ 85 % (`fail_under`); zero skips (`tests/conftest.py`).

- [ ] **Step 7: Commit and report.**

```powershell
git status --short
git add docs/getting-started/first-orbital.md docs/tutorials/phase-0-walkthrough.md docs/tutorials/frontend-rendering.md docs/textbook/00-how-to-use.md docs/textbook/02-hydrogen-levels.md docs/textbook/03-radial-nodes.md tests/test_docs_integrity.py
git commit -m "docs: name the lab controls exactly as the redesigned UI labels them" -m "Claude-Session: https://claude.ai/code/session_01E44DEzsc7Av26fc7nZ5rSo"
```

(Chapters 2 and 3 are staged because Part C's chapter specs send readers to the `详情面板` “图表” tab. If the Step 6 search changed any further `docs/textbook/*.md` page, add that file to the `git add` line by name; if it changed none of chapters 0/2/3, drop that name. `git status --short` must be empty afterwards.)

If Steps 1–3 also required a code fix, that fix gets its own commit first, after `npm --prefix web run test` and `npm --prefix web run typecheck` pass again, staging exactly the files `git status --short` shows under `web/`, with a `fix(web): …` message naming the gate that caught it and the same trailer.

Report: the commands run and their final lines, the seven screenshot paths, the checklist results, the Step 6 replacements made (page, old wording, new wording), and the explicit list of what was not verified (`npm run test:visual`, which Part E owns).

---

## Self-review

**Spec coverage (spec section → task):**

| Spec | Requirement | Task(s) |
|---|---|---|
| §1 success 3 | Dark glass panels, Google Sans Flex, single blue accent, data colours stay data | D1, D11–D20 |
| §3 D8 | Camera z-up (2p_z lobes vertical) | D5 (+ grid D4, gizmo D7) |
| §3 D9 | Delete viewport caption; legend carries colour meaning | D20 (regression test in `App.test.tsx`), D17 |
| §3 D10 | SVG charts, no chart library, no second `<canvas>`; capture the scene canvas | D14, D15, D6, D7 (Hud in the same context), D21 (strict `canvasOf` kept) |
| §3 D12 | Embed mode (placeholder card → iframe) | D20 (`EmbedBar`, embed rendering per contract) |
| §4.4 layout | Full-bleed canvas, `data-chrome` panels | D20, every component task |
| §4.4 header | Brand, pill 教学预览/实时计算, 教材 or 查看 OpenAPI, 复制链接, 保存图像, 指南, GitHub | D13 (+ D6 capture) |
| §4.4 controls | 320 px, radius 24, collapsible to 调节; groups 量子态/表示法/显示; bands; rows; tags; `nav[aria-label=控制上下文]` kept | D11 |
| §4.4 time pill | Stationary text; oscillating ‹ t › / play / one-period slider / period + frame; degenerate text; static frame list + prefetch; live 0.2 lattice; thin loading bar | D10 |
| §4.4 detail panel | Title + energy pill + tabs 概览/图表/场景契约/引用; P(r) with nodes, ⟨r⟩, r_mp; energy ladder; superposition |c_k|² + beat; SVG, `formatFinite` | D16, D14, D15, D8 |
| §4.4 search | 查找量子态 pill, presets + all states, tags | D18 |
| §4.4 legend | Existing branches, byte-checked ramps, expandable | D17 (+ D2 speed ramp) |
| §4.4 guide | First `role=dialog aria-modal`, tabs 概览/读图指南/教材章节, first-visit auto-open via localStorage, silent on error | D19, D20 |
| §4.4 mobile | ≤ 820 px: condensed header, bottom drawers, time pill above drawer, legend as small button | D10–D20 CSS blocks, D20 drawer logic + tests |
| §4.4 canvas | No stars / coloured lights; neutral bg keeping #383838 contrast; neutral axis indicator bottom-left; xy grid toggle (default on) | D4, D7, D11 (`地面网格（xy 平面）` switch) |
| §4.4 robustness | React error boundary + WebGL-unavailable message | D12, D20 |
| §4.4 tokens | `--qv-*` table, font stack, tabular numbers; ramps stay in styles.css | D1, D20 (styles.css trimmed) |
| §5 row 3 | Streamlines `toneMapped=false, fog=false`; legend ramp generated from the linear lerp with a byte test | D2 |
| §5 row 4 | No Vignette on data slices; Bloom default 0, adjustable with a note | D3, D11 (note), D17 (legend warning) |
| §5 row 5 | Remove `DEFAULT_PLAYBACK_PERIOD_AU` default | **Part B, Task B6** (arity regression test, callers updated). D10 only consumes the required-period `nextTimeAu` and touches neither `sceneRequest.ts` nor its specs |
| §5 row 1 (Part A's 2s-2pz fix, carried, not re-fixed) | Presets open on the server-published `default_representation` | D9 (loader forwards it + loader pin), D11 (mixture rows forward it; A11 test re-selected), D18 (search forwards it + 2s-2pz pin) |
| §6 web tests | Time pill, control groups, charts, search, guide, error boundary; presentational pins updated, semantic pins kept | D10–D20 (tables in D9, D10, D11, D16, D20); every commit gated by `npm run test` + `npm run typecheck` |
| §6 fullstack / visual | Update selectors; hide `[data-chrome]` before capture; baselines regenerated later | D21 (baselines: Part E) |

Not in Part D by the contracts: static transport, manifest, URL state and its binding (`bindUrlState()` in `main.tsx`, B11), `build:pages` (Part B); `radial_profile` API and its `types.ts` alias (Part A8); the required playback period (B6); textbook and developer pages (Part C) — except that D22 Step 6 aligns the labels those pages quote with the ones D shipped (`科学详情`, `点尺寸`, embed keeps the status chip) and pins them in `tests/test_docs_integrity.py`; Docker baselines, pages-e2e (Part E).

**Placeholder scan:** re-run after the review round: searched this file for "TBD", "TODO", "appropriate", "similar to", "write tests for", "fill in", "<exactly", "<what the" — none as instructions (D22's old `git add <exactly the files …>` template is now an explicit path list plus a named rule for a code fix; D19's "align later" step and D20/D14's "only if" conditionals are gone). The four `{/* … unchanged */}` markers in D16 are explicit cut-and-paste instructions naming exact line ranges of the existing `Inspector.tsx`; the "Keep the long explanatory comments" note in D21 refers to existing prose inside today's test bodies. Every new module's code and every new test is written out in full.

**Interface consistency with `design/plans/2026-09-25-contracts.md`:**
- Uses exactly the Part B names: `getTransport`, `setTransport`, `resetTransport` (`src/api/transport.ts`); `ApiRequest`, `requestsForPlan` (`src/api/requests.ts`); `runtimeMode` returning `'live' | 'static'` (`src/api/runtimeMode.ts`); `playbackFrames` (`src/api/staticCatalog.ts`); `fetchOrbitalMetadata(orbital, signal?)` (`src/api/client.ts`); `ParameterBound.values`; refusal status `'not_precomputed'`; `parseDeepLink`, `serializeDeepLink`, `isEmbedMode()`, `DeepLinkState` (`src/state/urlState.ts`); `bindUrlState(): () => void` is relied on (called once by B11's `main.tsx`) but never called by D.
- Uses exactly the Part A field names: `radial_profile.{r_bohr, radial_density, nodes_bohr, expectation_r_bohr, most_probable_r_bohr, energy_levels_hartree}` via `components['schemas']['RadialProfile']` (aliased as `RadialProfile` in `types.ts` by A8; D14 no longer edits `types.ts`).
- Part A11's breaking store signatures (not printed in the contracts file; checked against `design/plans/2026-09-25-part-a-python-export.md` Task A11): every D call passes five arguments to `setSuperposition` (StateSection row in D11, SearchPill `apply` in D18, the TimePill spec in D10) and four to `syncSuperpositionCapabilities` (`syncSelectedMixture` in D9); every superposition-catalogue fixture carries `default_representation` (D9 `MIXTURE`, D10 `TimePill.test.tsx` typed `SuperpositionPreset[]` and `usePlayback.test.tsx` mock, D18 `stateIndex.test.ts` `MIXTURES` and `SearchPill.test.tsx` mock; `2s-2pz` is `'slice'`, the rest `'isosurface'`). A11's two `ControlPanel.test.tsx` cases are kept (D9, D10 and D11 tables).
- Part B extras used beyond the contracts' list, each checked against the B plan: `chargeBound()` (D11 Z input — the only source of the static Z, same as B9's store clamp; the D11 spec mocks it instead of `runtimeMode`), `CapabilityInputs.superpositionTerms` (D11 `capabilityOf`, so the static overlay can find a preset's frames), `nextTimeAu(time, periodAu)` with the period required (B6), and B10's rule that `t` is written to the hash only while paused (EmbedBar comment).
- Commands: every per-task spec run is `npm --prefix web run test:watch -- run <files>` (working directory `web/`); `npm --prefix web exec -- …` is not used anywhere because it runs from the repo root (measured). Every commit step runs `npm --prefix web run test` and `npm --prefix web run typecheck` first; D22 Step 6 runs the contracts' Python gate (`uv run --locked --group docs pytest --cov=quviz --cov-report=term-missing`, ruff, mypy) and `mkdocs build --strict` because it edits `tests/test_docs_integrity.py` and docs.
- File-system reads in jsdom specs resolve from `process.cwd()` (= `web/`), never from `import.meta.url` (D19 `GuideDialog.test.tsx`); node-environment specs (`styleContract.test.ts`, `stateIndex.test.ts`) keep `new URL(…, import.meta.url)`, which is a `file:` URL there.
- Delivers "D produces": `data-chrome` on header, control panel (and its 调节 button), time pill, detail panel (and its opener), legend pill, search pill, guide dialog, toast, status chip, loading overlay, fallbacks, embed link; exactly one `<canvas>` (probe and gizmo textures are detached); `[data-scene-ready]` unchanged; `span[data-status]` with the five-case precedence and strings; static header link `教材` → `./learn/`, live `查看 OpenAPI` → `/docs`; embed renders canvas, legend pill, time pill and `在实验室中打开` (`./#` + deep link without `embed`, `target=_blank`), and not header, controls, search or guide. Beyond the contract text, D also keeps the hooks Part E's pages e2e drives: `button[data-representation]` with `aria-pressed` (D11), `button[data-control="playback"]` with `aria-pressed` and `aria-disabled` inside the `[data-chrome]` time pill `section[data-time-kind]` (D10), and the guide `[role=dialog][aria-modal=true]` that closes on Escape (D19); in embed mode the status chip (and the loading overlay while loading) also remain, which D22 Step 6 makes chapter 0 say.
- Shared commands used as listed: `npm --prefix web run test | typecheck | build | test:fullstack`; per-task `npm --prefix web run test:watch -- run …`.

**Review-round fixes (cross-part review of 2026-09-25), each verified against the repo or the A/B/C plans before editing:**
1. Blocker — A11 signatures and fixtures: fixed in D9, D10, D11, D18 and D1 Step 1 (reconnaissance now lists Part A commits on `ControlPanel.tsx`, `ControlPanel.test.tsx`, `useSceneStore.ts` and greps for `default_representation`).
2. `GuideDialog.test.tsx` path check under jsdom: now `resolve(process.cwd(), '..', 'docs', …)`; the chapter list is hard-coded to Part C's file names and nav titles (`01-wavefunction`, `06-isosurface`, `09-superposition-time`, `10-experiment`, `appendix-a-misconceptions`, `appendix-b-notation-units`, …) with an order pin; the "align later" step is gone.
3. `npm --prefix web exec` runs from the repo root (re-measured: `tsc --showConfig` through it reports the repo root as the current directory): all 41 per-task spec runs now use `npm --prefix web run test:watch -- run …`.
4. D10 no longer duplicates B6 (no edits to `sceneRequest.ts`, `sceneRequest.test.ts`, `useSceneAsset.test.tsx`); §5 row 5 points at B6.
5. Every commit step now runs `npm --prefix web run test` and `npm --prefix web run typecheck`.
6. Conditionals resolved: `App` never calls `bindUrlState` (B11 binds in `main.tsx`); the App spec pins that it is never called; D14's `types.ts` edit is dropped (A8 adds the alias and field).
7. Static Z comes from `chargeBound()` (min === max → read-only output), not from `runtimeMode()`.
8. D22 Step 6 re-reads chapter 0, `first-orbital.md`, `phase-0-walkthrough.md`, `frontend-rendering.md` (and chapters that name the detail panel) against the copy deck, fixes the known differences, and pins them in `tests/test_docs_integrity.py` with a fail-first run.
Also fixed while re-reading: `RepresentationSection`'s per-row `capabilityOf` now passes `superpositionTerms` (without it B8's static overlay cannot find a preset's frames), and the EmbedBar comments no longer claim the hash is rewritten on every playback tick (B10 writes `t` only while paused).
