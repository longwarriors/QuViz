# QuViz 公开教材站：GitHub Pages 静态实验室 + Weather Lab 风格重设计 + 教材化文档

- 日期：2026-09-25
- 状态：设计已定稿（用户授权自主决策；本文件记录决策与理由，用户可随时推翻）
- 范围：子项目 1（本 spec）。子项目 2（M2 一维 TISE/TDSE 数值实验室）另立 spec，在本子项目落地后开始。
- 位置说明：本文件放在仓库根 `design/specs/` 而不是 `docs/`，因为 `tests/test_mkdocs_system.py` 要求
  `docs/**/*.md` 全部进入 MkDocs 导航。

## 1. 意图与成功标准

### 用户原话

> 理解本项目，然后继续开发……本项目我希望有 GitHub Pages 界面发挥其教材属性。前端页面风格我希望是谷歌
> DeepMind Weather Lab 的风格，现在的不好看。其余的授权你独立思考就行开发。

### 解读（区分原话与假设）

| 来源 | 内容 |
|---|---|
| 原话 | 需要一个 GitHub Pages 站点，承担“教材”功能 |
| 原话 | 前端视觉语言向 Google DeepMind Weather Lab 看齐；现有“量子观测台”风格不被接受 |
| 原话 | 从 Phase 0 checkpoint 继续开发，其余由我决定 |
| 假设 | 读者是中文学习者（本科量子力学/结构化学层次），主要用桌面浏览器，也会用手机 |
| 假设 | 教材站不能依赖 Python 后端（Pages 只托管静态文件），但本地 `quviz serve` 的“实时计算”模式必须保留 |
| 假设 | 项目既有的“说的 = 画的”科学如实性原则、零 skip、覆盖率闩锁等门禁全部继续有效，不为赶工放松 |

### 成功标准

1. `https://<owner>.github.io/<repo>/` 打开即是全屏 3D 实验室（Weather Lab 式），无需后端即可浏览预计算目录中的
   所有态与表示法；未预计算的组合如实显示“未预计算”及原因，而不是报错或空白。
2. `/<repo>/learn/` 是教材站：有学习顺序的章节、公式、引用、思考题，每章至少一张可交互嵌入图（点击加载），
   可一键“在实验室中打开”对应状态。
3. 实验室与教材视觉统一：深色玻璃浮层、Google Sans Flex 字体、单一蓝色强调色；数据颜色保持为数据。
4. 本地一条命令构建并预览与线上完全相同的站点（含子路径），Actions 仅负责发布，不作为验证门禁。
5. 所有既有门禁保持绿色；受影响的测试在同一变更中更新，并保留原测试的意图；新增模块满足 90/85/90/90 覆盖闩锁。

## 2. 非目标

- 不在浏览器里重写物理（ADR-0001：Python 计算、浏览器渲染）。Pages 上没有“任意参数实时计算”。
- 不引入 Google/DeepMind 品牌元素（名称、logo、专有 Google Sans）；只借鉴版式语言。
- 不做多语言；站点保持中文优先。
- 不在本子项目实现 M2 数值求解器、叠加态点云采样（M5）、节面表示等路线图条目。
- 不改仓库名、不开启 Pages、不推送——这些是对外动作，完成本地验证后再征求用户确认。

## 3. 关键决策

| # | 决策 | 理由 |
|---|---|---|
| D1 | 站点布局：根路径 = 实验室 SPA；`learn/` = MkDocs 教材；`data/v1/` = 预计算场景目录 | Weather Lab 的范式是“工具即首页”，指南在工具内；教材以子站形式深度链接进实验室。避开 `/docs`（FastAPI Swagger 与 Vite 代理已占用） |
| D2 | 静态模式 = 预计算目录 + 前端“静态传输层”，由构建模式 `pages` 选择 | 保持单一物理真值源；所有解码与校验代码在两种模式下共用 |
| D3 | 请求清单由前端真实 client 代码枚举（vite-node 运行 `web/tools/static-requests.ts`），Python 通过 ASGI 逐字回放并写盘 | 键就是前端将要发出的字面 `route?query`，构造即正确，不需要在 Python 里复刻 TS 的参数拼写与顺序 |
| D4 | Vite `base: './'`（相对路径），两种模式共用；不设子路径硬编码 | 无路由的 SPA 用相对 base 可同时服务 FastAPI `/` 挂载与 Pages 子路径；不破坏 fullstack 门禁 |
| D5 | 预计算数据在构建时生成，不提交进 git | 约 280 MB 原始数据会让 7 MB 仓库膨胀数十倍；Windows 生成的浮点字节在 Linux 上逐字比对已失败过 |
| D6 | 发布：`scripts/build_pages.py` 本地构建+预览为最终验证；`.github/workflows/pages.yml` 只重跑同一脚本并部署 | 与 CLAUDE.md “不依赖 CI”一致：Actions 是发布器不是门禁 |
| D7 | 字体：自托管 OFL 的 Google Sans Flex（拉丁 wght 可变 woff2 + math 子集），中文用系统字体栈 | Google Sans Flex 自 2025-11 起 OFL；fonts.googleapis.com 在中国大陆不可靠；视觉门禁禁止离站请求；中文 webfont 体积大 |
| D8 | 3D 相机改为 **z 轴朝上** | 教科书惯例：2p_z 两瓣上下排列。当前 y-up 使 2p_z 横躺，易误导学习者 |
| D9 | 删除视口大标题说明；颜色语义只由图例胶囊承担 | 现有说明对密度切片、Re/Im 切片、流线声称“色彩表示 arg ψ”，是如实性缺陷 |
| D10 | 图表用手写 SVG，不引入图表库，不新增第二个 `<canvas>` | 视觉门禁 `page.locator('canvas')` 为严格单例、截图按钮取第一个 canvas；本机 Node 版本也无法安装新依赖 |
| D11 | 教材：新增 `docs/textbook/` 章节（学习者叙事），现有 concepts/tutorials 保留为“深入阅读”；导航分教材 / 深入阅读 / 开发者 / 信源 | 最少移动已被测试钉住的文件；学习者路径与开发者台账分离 |
| D12 | 嵌入图 = 占位卡 +“加载交互图”按钮 → iframe（实验室 embed 模式）；每页同一时刻一个活动 WebGL 上下文为宜 | 避免多 WebGL 上下文与首屏重负载；无 JS 或离线时仍有可读的图注和实验室链接 |
| D13 | Linux 视觉基线改在固定 Docker 镜像 `mcr.microsoft.com/playwright:v1.62.1-noble` 中本地生成与校验 | 不依赖 CI；与 CI 的 SwiftShader 同一 Chromium 构建 |

## 4. 架构

```text
                       build time (scripts/build_pages.py)
┌──────────────┐  catalogs+spec  ┌───────────────────────┐  requests.json  ┌────────────────────┐
│ quviz export │ ───────────────▶│ web/tools/static-     │ ──────────────▶ │ quviz export       │
│ static plan  │                 │ requests.ts (vite-node│                 │ static render      │
└──────────────┘                 │ + real client code)   │                 │ (ASGI replay, pool)│
                                 └───────────────────────┘                 └─────────┬──────────┘
                                                                                     ▼
 build/pages/ = web dist (mode=pages, base ./) + data/v1/{manifest.json, <hash>.json|.bin} + learn/ (MkDocs) + .nojekyll

                       run time
 Lab SPA ── client.ts ── Transport ──┬── LiveTransport  → fetch('/api/...')            (quviz serve, dev)
                                     └── StaticTransport → manifest lookup → data/v1/… (Pages)
```

### 4.1 Python：静态目录导出器 `quviz.export`

新包 `src/quviz/export/`（受 mypy strict 与 85% 覆盖率约束）：

- `catalog_spec.py`：`StaticCatalogSpec`（冻结 dataclass），v1 内容：
  - 本征态：全部 $n\le4$ 的 $(n,\ell,m)$，`basis ∈ {real, complex}`，`z=1`；
    点云 `samples=28000, seed=7`；等值面 `probability_mass=0.9`，分辨率取该态的最低合法奇数
    `max(65, 16n+17)`（n=4 → 81）；切片 3 个主平面 × 4 个 observable，分辨率取该态的切片下限；
    概率流 `seed_count=48`（只对复基 m≠0 有意义，其余由能力矩阵在前端拒绝，不导出）。
  - 叠加态：服务端目录的 4 个预设；振荡预设按播放帧格点（与 `nextTimeAu` 完全相同：`ceil(T/0.6)` 帧、
    对齐 0.2 a.u.）导出等值面、概率流与 `xz` 平面 4 个 observable 切片；简并预设只导出 t=0。
  - 规格以 JSON 写出（`spec.json`），同时嵌入 manifest，供前端能力覆盖层使用。
- `static_site.py`：
  - `plan(out_dir)`：通过 ASGI 获取两个目录接口的响应并写出，写出 `spec.json`。
  - `render(out_dir, requests, workers)`：读取 `requests.json`（`[{route, query}]`），对每个
    `route?query` 用进程池驱动 `create_app(mount_frontend=False)` 的 ASGI 调用（手写 scope/receive/send，
    不引入 httpx 运行时依赖），把 `status`、`content-type`、`X-QuViz-*` 头与响应体逐字写盘；
    文件名为 `sha256(key)[:20]` + `.json|.bin`（Windows 禁止 `?`；`.bin` 已在 `.gitattributes` 标为二进制）；
    422 等非 2xx 响应同样记录（前端据此显示服务端原因）。
  - `manifest.json`：`{format: "quviz-static/1", version, generated_by, spec, entries: {key: {file, status,
    content_type, headers}}}`；`version` 为内容哈希，用于目录版本化（Pages 固定 `max-age=600`）。
- CLI：`quviz export-static plan|render`（`cli.py`）。
- 生成数据不入库；`build/` 已被 `.gitignore` 覆盖。

### 4.2 API 小幅扩展：径向分布

`OrbitalMetadata` 新增可选块 `radial_profile`（Python 计算，前端只画）：
`r_bohr[]`（256 点，覆盖 99.9% 径向质量）、`radial_density[]`（$P(r)=r^2|R_{n\ell}|^2$，归一）、
`nodes_bohr[]`、`expectation_r_bohr`、`most_probable_r_bohr`、`energy_levels_hartree[]`（$n=1..\max(n+2,5)$）。
连带更新：`tests/fixtures/openapi.json`、`web/src/api/schema.gen.ts`（codegen）、`docs/reference/http-schema.md`
（生成器）、数值门禁测试（归一、节点数 = $n-\ell-1$、$\langle r\rangle = \tfrac{a}{2Z}[3n^2-\ell(\ell+1)]$ 解析值）。

### 4.3 前端数据层：传输、静态模式、URL 状态

- `src/api/transport.ts`：`interface Transport { request(route, query, signal): Promise<Response> }`；
  `liveTransport` 保持与今天逐字节相同的 `'/api/...?' + URLSearchParams` 请求；`createStaticTransport(manifest,
  dataBase)` 按字面键查表、取文件、用 manifest 中的状态与头合成 `new Response(...)`；未命中返回 404 +
  JSON `detail`（“静态版未预计算此组合……”），由现有 `responseError` 显示。
- `client.ts`：10 个 `fetch` 调用改为经由当前传输；**请求构造抽成纯函数** `requestFor(...)`，使静态能力判断与
  构建期枚举复用同一逻辑。现有精确 URL 断言保持不变。
- `src/api/staticCatalog.ts`：加载 `data/v1/manifest.json`（相对 `document.baseURI`），提供 `has(key)`、`spec`。
- 能力覆盖层（在 `capability.ts` 内部，保持 `EIGENSTATE_S_SLICE_FLOORS` 字面块不变）：
  - 物理拒绝优先；物理允许但清单无对应键 → 新拒绝种类 `not_precomputed`，理由为中文可读句，不含 `/api` 路径。
  - 参数固定：样本数、种子、分辨率、包围概率、种子线数在静态模式下 `min = max`（UI 显示只读值）；Z 固定 1。
  - `ParameterBound` 增加可选 `values?: readonly number[]`（离散取值）；静态模式的 `timeAu` 为该预设的帧列表。
  - 平面/observable 可选项由 spec 收窄。
- `src/state/urlState.ts`：hash 深链接 `#mode=eigenstate&n=2&l=1&m=0&basis=real&rep=point_cloud&plane=xz&obs=probability_density`
  / `#mode=superposition&preset=1s-2pz&t=3.6&rep=isosurface`，外加 `embed=1`。启动时解析→store；store 变化以
  `history.replaceState` 回写（不产生历史记录）；无效参数被丢弃并回退默认值。
- 构建模式：`npm run build:pages` = `tsc -b && vite build --mode pages --sourcemap false`；
  `import.meta.env.MODE === 'pages'` 选择静态传输（`vite/client` 类型加入 tsconfig `types`，不新增 `.d.ts`）。
- `web/tools/static-requests.ts`（vite-node 运行，不在 `web/scripts/` 以免触发 13 文件清单）：读 `spec.json`
  与目录 → 遍历 spec 中的所有场景输入 → 经 `planSceneRequest` + `requestFor` → 写 `requests.json`。

### 4.4 Weather Lab 风格重设计

**版式（桌面）**

```text
┌────────────────────────────────── 56px glass header ──────────────────────────────────┐
│ ◎ QuViz  [教学预览]                                    教材 · 链接 · 保存 · 指南 · GitHub │
├───────────────────────────────────────────────────────────────────────────────────────┤
│ ┌控制─────────┐                                                   ( 查找量子态 ⌕ )      │
│ │▣ 量子态  ⌄  │                full-bleed WebGL canvas             ┌详情 2p_z ─────── ×┐ │
│ │  本征/叠加  │                (z-up, neutral dark bg)             │ E = −0.125 Ha      │ │
│ │  预设单选列 │                                                    │ ▁▃▆█▆▃▁ P(r) 图    │ │
│ │  › 更多轨道 │                                                    │ 概览 图表 契约 引用 │ │
│ │▣ 表示法  ⌄  │                                                    └────────────────────┘ │
│ │  ◉电子云 …  │                                                                           │
│ │▣ 显示    ›  │          ┌ ‹  t = 3.6 ħ/Eₕ  › [Δt 0.6] ┐                               │
│ └─────────────┘          │ ▶ ━━━━●━━━━━━━━  ⟲          │           [相位图例 ▭▭▭ ⌃]   │
│                          └ 周期 T = 16.76 · 帧 7/28 ───┘                               │
└───────────────────────────────────────────────────────────────────────────────────────┘
```

- 画布全屏铺底（`position: fixed; inset: 0`），所有控件是浮在其上的玻璃面板；面板带 `data-chrome` 属性，
  视觉测试截图前统一隐藏。
- **顶栏**：`rgba(0,0,0,.6)` + `blur(16px)` + `0 0 12px rgba(100,160,255,.2)`；左侧标志 + “QuViz” 20px
  + 药丸标签（“教学预览”/本地模式为“实时计算”）；右侧图标按钮：教材（静态模式）/ 查看 OpenAPI（实时模式，
  保持 `/docs` 与可访问名）、复制链接、保存图像、指南、GitHub。
- **左侧“控制”面板**（宽 320px，圆角 24px，可折叠为单个圆形“调节”按钮）：分组 = 量子态 / 表示法 / 显示；
  组头 = 图标 + 粗体标题 + 展开箭头；组内为浅色带状子区块，行 = 左标签右单选/开关，禁用原因以小标签或
  提示呈现。原“上下文轨道”取消，保留 `nav[aria-label=控制上下文]` 语义以便测试与读屏。
- **底部居中时间胶囊**：本征态显示“定态 · |ψ|² 与 t 无关”（播放禁用并说明原因）；振荡叠加态显示
  ‹ t › 步进、播放/暂停、一周期滑条、周期与帧序号；简并叠加态显示“能量简并：密度不随时间变化”。
  静态模式按帧列表步进并预取整周期帧；实时模式保持 0.2 a.u. 格点。加载状态以胶囊内细进度条显示。
- **右侧详情面板**（Inspector 重做）：标题 + 能量胶囊 + 标签页 概览 / 图表 / 场景契约 / 引用；
  图表页：本征态 = 径向分布 $P(r)$（节点竖线、$\langle r\rangle$ 与最可几半径标记）与能级梯；
  叠加态 = 各项 $|c_k|^2$ 与能级差/拍周期示意。所有图表为 SVG，数值经 `formatFinite`。
- **右上悬浮药丸**：“查找量子态”（搜索框 + 列表：预设与目录内全部态，带“本征/叠加/复基”小标签）。
- **右下图例胶囊**：沿用 Legend 的分支逻辑与字节受检的色带；可展开为完整说明。
- **指南弹窗**（首个 `role=dialog aria-modal`）：标签页 概览 / 读图指南 / 教材章节；首次访问自动打开一次
  （`localStorage` 记忆，异常时静默）。
- **移动端（≤ 820px）**：顶栏精简；控制与详情为底部抽屉；时间胶囊固定在抽屉之上；图例收为小按钮。
- 画布内：去掉星空与彩色装饰灯光；中性深灰背景（保持切片中性色 `#383838` 的对比度理由成立）；
  左下角中性色坐标轴指示；地面网格可在“显示”中开关（默认开，xy 平面）。
- **健壮性**：新增 React 错误边界与 WebGL 不可用提示（教材嵌入常在受限机器上打开）。

**设计令牌**（`--qv-*`，替换 `quantum-observatory.css` 与 `styles.css` 的布局部分；图例色带选择器与十六进制
逐字保留，`color.test.ts` / `SliceField.test.tsx` 继续从 `styles.css` 读取）：

| 令牌 | 值 |
|---|---|
| `--qv-bg` | `#0e0f11` |
| `--qv-glass` / `--qv-glass-strong` | `rgba(0,0,0,.6)` / `rgba(16,17,20,.86)` |
| `--qv-border` / `--qv-border-strong` | `rgba(255,255,255,.15)` / `rgba(255,255,255,.3)` |
| `--qv-glow` | `0 0 12px rgba(100,160,255,.2)` |
| `--qv-blur` | `blur(16px)` |
| `--qv-radius-panel` / `--qv-radius-pill` / `--qv-radius-tag` | `24px` / `100px` / `4px` |
| `--qv-text` / `--qv-text-2` / `--qv-text-3` | `#fff` / `rgba(255,255,255,.62)` / `rgba(255,255,255,.4)` |
| `--qv-band` | `rgba(255,255,255,.045)` |
| `--qv-accent` / `--qv-accent-strong` | `#8ab4f8` / `#1a73e8` |
| `--qv-ok` / `--qv-warn` / `--qv-danger` | `#81c995` / `#fdd663` / `#f28b82` |
| 字体 | `"Google Sans Flex", system-ui, "PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC", sans-serif`；数字 `tabular-nums` |

### 4.5 教材（MkDocs）

- 导航（Material tabs）：首页 · 教材 · 深入阅读（现有 concepts + tutorials）· 开发者（项目/入门/操作指南/技术参考/
  决策记录）· 信源与审计。所有既有页面保持原路径，满足“每页恰在导航中出现一次”。
- 新章节 `docs/textbook/`（中文，学习者叙事；每章：学习目标 → 正文与公式 → 交互图 → 常见误区 → 思考题（可折叠
  答案）→ 延伸阅读；只引用 `references.bib` 已有键，严格构建失败即报错）：
  0 如何使用本书与实验室；1 波函数与 Born 规则；2 氢原子：量子数与能级；3 径向分布与节点；4 实轨道与复轨道；
  5 电子云：从概率到采样；6 等值面：轨道的“形状”；7 相位与平面切片；8 概率流；9 叠加态与时间演化；
  10 从密度到实验图样；11 对称性与杂化；附录：常见误区、符号与单位。
- 嵌入图：`<figure class="quviz-figure" data-lab="mode=…&rep=…" markdown>` + 图注；
  `docs/assets/javascripts/quviz-figure.js` 生成占位卡、“加载交互图”与“在实验室中打开”；实验室根 URL 取自
  主题覆盖 `overrides/main.html` 注入的 `<meta name="quviz-lab">`（`extra.quviz.lab_url`：本地默认
  `http://127.0.0.1:8000/`，Pages 构建为 `../`，相对 `__config.base` 解析）。
- 主题：Weather Lab 式深色（默认）+ 浅色备选；玻璃顶栏与标签栏、面板化侧栏与告示块、自托管 Google Sans Flex、
  Mermaid 改 `dark` 主题；首页保留测试钉住的公式、引用、`concepts/model-map` 链接与“解析含时叠加态”“平面切片”字样。
- Pages 构建使用生成的 `mkdocs.pages.yml`（`INHERIT: mkdocs.yml` + `site_url` + `extra.quviz.lab_url`），
  使 sitemap/即时导航在静态站点真正生效；`mkdocs.yml` 本身不写子路径（否则 fullstack 门禁的根路径失效）。
- 过期文档随改动更新：`tutorials/frontend-rendering.md`（视觉系统与断点）、`getting-started/first-orbital.md`、
  `tutorials/phase-0-walkthrough.md`（补静态模式说明）、`reference/quality-gates.md`（视觉帧尺寸、Docker 流程）、
  `project/status.md` 与 `roadmap.md`（新 checkpoint）、README；新增 ADR-0005 “静态托管与预计算目录”。

### 4.6 构建与发布

- `scripts/build_pages.py [--site-url URL] [--workers N] [--serve PORT]`：按第 4 节流程组装 `build/pages/`；
  `--serve` 在 `/<repo>/` 子路径下预览（模拟 Pages）。
- `.github/workflows/pages.yml`：`workflow_dispatch` + `push: master`；步骤 = checkout、setup-uv@v10.0.1、
  setup-node（`.node-version`）、`uv sync --locked --all-groups`、`npm --prefix web ci`、`build_pages.py`
  （`site_url` 取 `actions/configure-pages` 输出）、upload-pages-artifact、deploy-pages。
  新增 `tests/test_pages_workflow.py` 钉住结构；`test_declared_versions.py` 的 Node 版本检查扩展到所有 workflow。

## 5. 同时修复的缺陷

| 缺陷 | 处理 |
|---|---|
| `2s+2p_z` 叠加态默认表示（等值面）在 mass 0.9 必然 422 | 先稳定复现并定位根因，再修；回归测试须在修复前失败 |
| 视口说明对非相位表示仍称“色彩表示 arg ψ” | 删除说明（D9），颜色语义由图例承担 |
| 流线材质仍受色调映射/雾影响，图例中点色与实际不符 | 流线材质 `toneMapped=false, fog=false`，图例色带按实际线性插值生成并加字节测试 |
| 切片颜色经过 Vignette/Bloom，与图例声称不符 | 数据切片不再走 Vignette；Bloom 默认 0（显示面板可调，并注明） |
| `DEFAULT_PLAYBACK_PERIOD_AU = 39.6` 残留默认参数 | 删除默认实参，调用方必须传入目录周期 |
| 发布 6 MB sourcemap | Pages 构建关闭 sourcemap |

## 6. 测试与验证

- Python：导出器单测（ASGI 回放逐字节等于 TestClient 响应；422 记录；文件名哈希；manifest 结构；帧格点与 TS
  一致性由构建期枚举保证）、径向分布数值门禁、2s-2pz 回归测试、pages workflow 结构测试。
  提交前 `uv run --group docs pytest --cov=quviz`（≥85%）。
- Web 单测：transport（live URL 逐字节不变、static 命中/未命中/QVPC 头合成）、staticCatalog、能力覆盖层、
  urlState、各新组件（时间胶囊、控制面板分组、详情图表、查找面板、指南弹窗、错误边界）；更新被重设计改变的
  展示性断言，保留语义性断言（拒绝按钮可聚焦且理由逐字、播放 aria-disabled + 说明、状态五分支优先级、
  图例分支、非有限数显示“—”、标签页键盘模式、色带字节）。`npm run test` + `npm run typecheck`。
- 新 Playwright 套件 `web/pages-e2e/`（`npm run test:pages`，Windows 可跑）：对 `build/pages` 在子路径下启动
  静态服务器，验证开场场景就绪、切换表示法、未预计算提示、叠加态帧播放、深链接往返、embed 模式、教材页加载与
  嵌入图按钮、无离站请求。更新 `web/scripts` 清单与相应断言脚本。
- fullstack（实时模式）：更新选择器与文案，继续验证 FastAPI 挂载与 MkDocs（`mkdocs serve`）。
- 视觉：`slice.spec.ts` 适配全屏画布（截图前隐藏 `[data-chrome]`），在 Docker 镜像中重新生成 5 张基线并人工
  检查，重测校准表；`quality-gates.md` 记录新帧尺寸与 Docker 命令。
- 构建：`build_pages.py` 全量跑通 + `--serve` 预览 + pages-e2e 绿色，才算“可发布”。

## 7. 风险与缓解

| 风险 | 缓解 |
|---|---|
| 请求枚举与运行时请求不一致导致静默未命中 | 枚举复用运行时 `requestFor`；pages-e2e 走真实 UI 路径；未命中显示可读原因而非空白 |
| 预计算耗时（叠加态流线单帧 2–25 s） | 进程池并行；目录规格可调；构建日志报告每类耗时 |
| 本机 Node 24.14.1 不满足 engine-strict，无法安装新依赖 | 设计上不新增 npm 依赖（字体文件直接入库，图表手写 SVG）；Docker 内用镜像自带 Node 跑 `npm ci` |
| 全屏画布使视觉基线全部失效 | Docker 固定镜像本地重生成并逐张人工检查；截图前隐藏全部浮层 |
| 教材内容的物理错误 | 每章独立物理审校（对抗式），公式与数值和既有测试/解析结果对照 |
| 公开站点引用私有 claude.ai artifact（`claude-fable-audit`） | 保留在开发者页面并标注“私有链接”，提请用户决定 |
| 仓库名拼写 `Atmoic` 进入公开 URL | 相对 base + 可配置 site_url，使改名零成本；提请用户在首次发布前决定 |

## 8. 实施顺序（供 writing-plans 细化）

1. 第一轮（并行、隔离工作树）：A Python 导出器 + 径向分布 API + 2s-2pz 修复；B 前端数据层（传输/静态目录/能力覆盖/
   URL 状态/构建模式/请求枚举）；C 教材章节撰写与导航/主题/嵌入脚本。
2. 合并 A+B+C，跑受影响门禁。
3. 第二轮：Weather Lab 重设计（组件、样式、相机 z-up、图表、指南、错误边界、移动端），同步更新单测与 e2e。
4. 第三轮：`build_pages.py` + pages.yml + pages-e2e；Docker 视觉基线；文档与状态台账；全量门禁与对抗式评审。
5. 之后：子项目 2（M2 一维数值实验室）新 spec。
