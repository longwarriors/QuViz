# Part C — Textbook chapters, nav, Weather-Lab MkDocs theme, figure embeds Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the MkDocs site into the public textbook (`learn/`): a five-tab information architecture (首页 · 教材 · 深入阅读 · 开发者 · 信源与审计), twelve learner chapters plus two appendices under `docs/textbook/` with click-to-load interactive lab figures, a dark-first Weather-Lab-style theme with self-hosted Google Sans Flex, ADR-0005, updated developer pages, and a labelled private citation — without breaking any existing docs, citation, fullstack or pin gate.

**Architecture:** Docs-only part. `mkdocs.yml` gains `theme.custom_dir: overrides` and `extra.quviz.lab_url`; `overrides/main.html` injects `<meta name="quviz-lab">`; `docs/assets/javascripts/quviz-figure.js` upgrades every `<figure class="quviz-figure" data-lab="…" markdown>` into a placeholder card whose button lazily inserts an iframe of the lab's embed mode, resolving the lab URL against the site root taken from Material's `#__config` once per full page load and re-running on `document$`. A Python gate (`tests/test_textbook.py`) validates every figure deep link against the lab's hash grammar and the static catalogue, and pins each chapter's section ids and figures. A Node fake-DOM test executes the real figure script. Chapters are written from the existing audited concept/tutorial pages and cite only existing `references.bib` keys with locators already used in the repo.

**Tech Stack:** MkDocs 1.6.1 + Material 9.7.7 (Jinja override, palette, `document$`), pymdown-extensions (details, arithmatex, md_in_html, attr_list), the project citation extension `quviz.docs.citations`, plain ES5 browser JavaScript, CSS custom properties, pytest (+ Node 24 as a subprocess), Playwright fullstack suite (TypeScript) for the live docs smoke.

**Spec:** `design/specs/2026-09-25-pages-textbook-lab-design.md` (§3 D1, D7, D11, D12; §4.4 tokens and layout wording; §4.5 textbook; §7 risks) and the binding cross-part contracts `design/plans/2026-09-25-contracts.md` ("C produces", "D produces", deep-link grammar in "B produces → src/state/urlState.ts", "Shared commands").

## Global Constraints

- **Scope of files.** Part C may create/modify only: `mkdocs.yml`, `overrides/**`, `docs/**`, `references.bib` (only the `claude-fable-audit` entry's new `note` field), `tests/test_mkdocs_system.py`, `tests/test_docs_integrity.py`, `tests/test_bibliography.py`, `tests/test_check_script.py` (only the fullstack docs pin at lines 1549-1578), the new `tests/test_textbook.py` and `tests/test_quviz_figure_js.py`, and `web/fullstack-e2e/app.spec.ts` (only the docs block after line 316). Nothing under `src/`, `web/src/`, `web/scripts/`, `web/public/`, `scripts/` or `.github/` changes in this part.
- **No new dependencies.** No npm package (local Node v24.14.1 fails engine-strict `npm ci`), no Python package, no new bibliography entry. Fonts are committed files obtained once with `curl` (Task C3).
- **Every `docs/**/*.md` appears in the `nav` exactly once** (`tests/test_mkdocs_system.py:44-51`). A chapter file and its nav line land in the same task. Strict build (`strict: true`, validation dict pinned at `tests/test_mkdocs_system.py:54-69`) must stay green after every task.
- **Citations:** only keys that already exist in `references.bib` (37 keys). Use only the exact citation strings listed in each chapter task. Their keys and locators are copied verbatim from pages that have already been audited; two are shortened forms of existing ones (`[@griffiths2018qm, eq. (1.3), p. 4]` and the bare `[@mkdocs-material]`). Planning checked every string in this plan against `references.bib` and `docs/`. **Never invent a page, equation or problem number.** A claim with no verified locator is cited with the bare key or with a broad locator the repo already uses, such as `[@griffiths2018qm, ch. 4 (pp. 131--197)]`.
- **No new absolute URL under `docs/`** except `http://scripts.sil.org/OFL`, which sits inside the verbatim OFL licence text (`docs/assets/fonts/OFL.txt`), plus loopback `http://127.0.0.1:…` addresses, which `scripts/check_links.py` exempts. The lab is always addressed through `data-lab`/`data-quviz-lab` attributes resolved by JavaScript, never through a Markdown link: MkDocs strict validation rejects relative links that leave `docs/`.
- **Markdown byte gates (`tests/test_docs_integrity.py`):** LF only, no TAB/CR. In `|`-prefixed table rows, write `$\lvert\psi\rvert^2$` and never a raw `|` inside `$…$`. `!!!`/`???` titles use straight ASCII double quotes. No line may start with an orphan LaTeX fragment such as `heta`, `abla` or `ightarrow`. Run `tests/test_docs_integrity.py` after every docs edit.
- **Textbook page rules (enforced by `tests/test_textbook.py` from Task C5 on):**
  - Every `## ` heading ends with an explicit ASCII id `{#kebab-id}` (no spaces inside the braces).
  - Every registered page, the two appendices included, contains at least one figure. Spec §1 success criterion 2 asks for one "per chapter", and the appendices are given one each so that the criterion holds under either reading.
  - Numbered chapters use the section order `goals` … `misconceptions`, `exercises`, `further-reading`, contain at least three `??? question "…"` blocks, and contain no developer jargon matching `/api/|tests/|web/src|\bPR-\d|Phase 0`.
  - Figure captions start with `**图 N.k**`, where N is the chapter number (`0`–`11`) or the appendix letter (`A`, `B`).
  - Chinese learner prose. Keep technical names such as `basis`, `phase`, `a.u.`, `bohr` and `Ha` as they are.
- **Figures** are exactly `<figure class="quviz-figure" data-lab="<deep link, no leading #>" markdown>` + newline + caption paragraph + newline + `</figure>`, separated from surrounding text by blank lines. The deep link grammar is the contract's: keys in the order `mode,n,l,m,basis,preset,t,rep,plane,obs` (no `embed`, no `z`). Eigenstates may use `n<=4` in either basis. Superpositions may use only the presets `1s-2pz`, `2s-2pz`, `1s-3dz2` and `2pplus-2pminus`, at a playback-lattice `t` spelled like JavaScript (`0`, `4.2`, `7`, `8.4`), with `xz` slices only.
- **Zero skips / strict xfail** (`tests/conftest.py`, `pyproject.toml:73`). The Node-driven test *asserts* that `node` is on PATH, following the `pwsh` precedent at `tests/test_check_script.py:249-250`. It never skips.
- **Commands** (contracts "Shared commands"). While a task is being developed, run only the tests the task names; do not run the whole suite after every edit (CLAUDE.md). Before each commit, run the pre-commit gate below. Task C20 re-runs every gate once on the final tree.
  - `uv run --locked --group docs pytest <files> -q`
  - `uv run --locked --group docs mkdocs build --strict` (writes the git-ignored `site/`)
  - `uv run --locked --group docs python scripts/render_reference_index.py --check`
  - `uv run --locked ruff check <files>` and `uv run --locked ruff format <files>`
  - `npm --prefix web run typecheck`, `npm --prefix web run test`, `npm --prefix web run test:fullstack`
- **Pre-commit gate (CLAUDE.md "提交前", spec §6).** Every Part C commit changes at least one `tests/*.py` file, so every commit step first runs the full Python gate on the staged tree:
  - `uv run --locked --group docs pytest --cov=quviz --cov-report=term-missing`. Expected: exit 0. The final summary line reports only `passed`, with no `failed`, `error`, `skipped`, `xfailed` or `xpassed`, and the output contains `Required test coverage of 85% reached.` `tests/conftest.py` already fails the session on any skip; do not set `QUVIZ_ALLOW_SKIPS`.
  - `uv run --locked ruff check <the task's test files> && uv run --locked ruff format --check <the task's test files>`. Expected: `All checks passed!` and `N file(s) already formatted`.
  - A commit that also changes `web/` (only Task C19) additionally needs `npm --prefix web run typecheck` and `npm --prefix web run test` green on the same tree. It also needs `npm --prefix web run test:fullstack`, because the change touches the docs smoke of the live interface.
  - If the gate fails, fix the cause and re-run the gate. Never commit on a red or partial run. The exact commands and file lists are repeated in each commit step.
- **Shell.** Commands are written for the Bash tool (Git Bash) from the repo root `C:\Users\SchrodingerFeiFei\Documents\GitHub\QuViz`. Every command also works in PowerShell except the ones marked *(bash)*.
- **Commits.** Stage exact paths only. Use two `-m` flags so that the trailer paragraph is separated by a blank line:
  `git commit -m "<type>(<scope>): <summary>" -m "Claude-Session: https://claude.ai/code/session_01E44DEzsc7Av26fc7nZ5rSo"`.
- **UI wording** for the redesigned lab follows spec §4.4. The words to use are:
  - panels: 控制面板 with the groups 量子态 / 表示法 / 显示; 时间胶囊; 详情面板 with the tabs 概览 / 图表 / 场景契约 / 引用; 查找量子态; 图例胶囊; 指南;
  - header links: 教材 · 复制链接 · 保存图像 · 指南 · GitHub;
  - mobile layout (≤ 820px): 底部抽屉;
  - Part D implements these; see the cross-part notes in Review Focus.

## Review Focus

1. **Physics accuracy of every chapter.** Review each chapter adversarially against the numbers below. Every one of them was recomputed with the project code during planning (and again on 2026-09-25 while this plan was revised). Step 6 of Tasks C7–C14 gives the commands that recompute them. Task C15 sends every chapter and appendix to an independent adversarial reviewer with this list and the complete recompute kit (spec §7). Confirmed findings are fixed there, pinned by a regression test and re-verified before Task C20.
   - Hydrogen levels at Z = 1 and a_μ = 1: $E_n=-1/(2n^2)$ Ha, which is −0.5, −0.125, −0.0556 and −0.03125 Ha for n = 1…4.
   - $\langle r\rangle=\tfrac{a_\mu}{2Z}[3n^2-\ell(\ell+1)]$. For every state with ℓ = n−1, the most probable radius is n² a₀.
   - Radial nodes lie at 2 a₀ (2s), 6 a₀ (3p), (9∓3√3)/2 a₀ (3s) and 12 a₀ (4d).
   - The 1s sphere that encloses 90 % of the probability has radius 2.661 a₀, and P(r ≤ a₀) for 1s is 1 − 5e⁻² = 0.3233.
   - Only 5.27 % of the 2s probability lies inside its radial node.
   - Bohr oscillation: $\langle z\rangle=(128\sqrt2/243)\,a_0\cos\omega t$, with ω = 3/8 Ha and T = 16π/3 = 16.755 ħ/E_h = 0.405 fs.
   - 1s+3d_{z²}: ω = 4/9 Ha, T = 9π/2 = 14.137 ħ/E_h, and ⟨z⟩ ≡ 0.
   - The degenerate 2s+2p_z state is stationary, with ⟨z⟩ = ⟨200|z|210⟩ = −3 a₀.
   - $(\psi_{21,+1}+\psi_{21,-1})/\sqrt2=-i\,\psi_{2p_y}$.
   - $\mathbf j=(\hbar/\mu)\operatorname{Im}(\psi^*\nabla\psi)$ vanishes for real ψ. For complex eigenstates $\mathbf v=\hbar m/(\mu s)\,\mathbf e_\phi$.
   - In the complex 2p xy phase slices, m = +1 has phase π at +x and m = −1 has phase 0 at +x; both have −π/2 at +y (`tests/test_slice_science.py:396-406`).
   - Lyman-α is 10.20 eV / 121.5 nm with infinite nuclear mass and 121.57 nm with the reduced mass.
2. **Citations and locators.** No locator outside the per-chapter lists. The private `claude-fable-audit` key must not be cited in `docs/textbook/`.
3. **Figure deep links.** Every `data-lab` passes `deep_link_problems` (Task C5). Figures deliberately avoid three kinds of combination:
   - 2s+2p_z isosurfaces. Measured on 2026-09-25: they are refused with 422 at probability_mass 0.9.
   - Streamlines at t = 0, where Ψ is real and the current is identically zero.
   - Degenerate presets for streamlines.
   - Also check the one intentional use of the `2pplus-2pminus` preset (chapter 4). Its xz slice would be blank because $2p_y$ vanishes on y = 0, so only its isosurface is used.
4. **Deliberate deviation from the task brief:** the iframe `sandbox` is `allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox`. The two `allow-popups*` tokens are required because the lab's embed mode keeps an `在实验室中打开` link with `target="_blank"` (contracts, "D produces"). Without them the sandbox silently swallows that link.
5. **Cross-part wording risk.** Chapter 0, `first-orbital.md` and the walkthrough describe the redesigned UI using the spec §4.4 names. If Part D ships different visible labels, Task C17's pins and chapter 0 must follow D's labels in D's PR.
   - The "not precomputed" wording has no single canonical sentence across parts. Contracts B fix `NOT_PRECOMPUTED_DETAIL` (the transport miss). Part B's capability overlay adds `STATIC_MISS_REASON` and per-limit reasons (`design/plans/2026-09-25-part-b-web-data.md:3175-3254`). Part D shows the tag `未预计算`.
   - All of B's static reasons start with `静态教材版` and end with the same hint, `本地运行 quviz serve 可实时计算任意参数。`
   - Chapter 0 and the walkthrough therefore quote at most the tag `未预计算` and that shared hint. They never quote one full reason sentence as "the" message.
6. **Pages build (Part E).** `mkdocs.yml` uses the relative `theme.custom_dir: overrides`, the default relative `docs_dir` and a relative `watch:` list (`mkdocs.yml:4-6`: `src/quviz`, `references.bib`). MkDocs resolves every one of them against the *child* config's directory:
   - `docs_dir` and `watch` entries through `FilesystemObject` (`mkdocs/config/config_options.py:689-712`);
   - `custom_dir` at `config_options.py:842-846`.

   E's generated `mkdocs.pages.yml` must therefore set an absolute `docs_dir`, an absolute `theme.custom_dir`, `watch: []` and `extra.quviz.lab_url: "../"`. Planning verified that such a child config builds strict and emits `<meta name="quviz-lab" content="../">` on every page.

---

### Task C1: Five-tab navigation and the textbook entry page

**Files:**
- Modify: `mkdocs.yml:110-163` (the whole `nav:` block)
- Create: `docs/textbook/index.md`
- Modify: `docs/tutorials/index.md:3-12`, `docs/reference/index.md:1-8`
- Test: `tests/test_mkdocs_system.py` (new test after line 51)

**Interfaces:**
- Consumes: the existing file paths. Every current page keeps its path (spec §4.5, D11).
- Produces: the top-level nav titles `首页`, `教材`, `深入阅读`, `开发者`, `信源与审计`, with `教材` headed by `textbook/index.md`. Later tasks append chapter lines under `教材` and ADR-0005 under `开发者 › 决策记录`.

Existing pins this task must keep green (checked in Step 5):

- `tests/test_mkdocs_system.py:44-51` (every page in nav once): satisfied, because paths are unchanged and `textbook/index.md` is added.
- `tests/test_mkdocs_system.py:54-140`: unchanged by this task.
- `tests/test_docs_integrity.py:270-369`: content pins; no pinned file is touched.
- `web/fullstack-e2e/app.spec.ts:260-316`:
  - The home article still links `concepts/model-map/`.
  - `a[href$="concepts/architecture/"]` still exists, because Material renders every tab's nav in the drawer and `concepts/architecture.md` stays in the nav under 开发者 › 技术参考.
  - `/reference/physics-api/` and `/references/#…` paths are unchanged.
- `tests/test_check_script.py:1549-1578`: pins config and spec text only; untouched.

- [ ] **Step 1: Write the failing test.** Insert after `test_every_markdown_page_appears_once_in_navigation` (after line 51) in `tests/test_mkdocs_system.py`:

```python
TOP_LEVEL_TABS = ["首页", "教材", "深入阅读", "开发者", "信源与审计"]
DEVELOPER_SECTIONS = ["项目", "入门", "操作指南", "技术参考", "决策记录"]


def _section(entries: list[Any], title: str) -> Any:
    for entry in entries:
        if isinstance(entry, dict) and title in entry:
            return entry[title]
    raise AssertionError(f"nav has no section {title!r}")


def test_navigation_separates_the_learner_path_from_developer_pages() -> None:
    nav = _raw_config()["nav"]
    assert [next(iter(entry)) for entry in nav] == TOP_LEVEL_TABS
    assert _section(nav, "首页") == "index.md"

    textbook = _section(nav, "教材")
    assert textbook[0] == "textbook/index.md"
    assert all(path.startswith("textbook/") for path in _nav_paths(textbook))

    further = _nav_paths(_section(nav, "深入阅读"))
    assert {path.split("/")[0] for path in further} == {"concepts", "tutorials"}
    # Implementation-facing pages live with the developer material.
    assert "concepts/architecture.md" not in further
    assert "tutorials/frontend-rendering.md" not in further

    developer = _section(nav, "开发者")
    assert [next(iter(entry)) for entry in developer] == DEVELOPER_SECTIONS
    developer_paths = _nav_paths(developer)
    for path in (
        "project/status.md",
        "getting-started/installation.md",
        "how-to/cite-sources.md",
        "concepts/architecture.md",
        "tutorials/frontend-rendering.md",
        "reference/physics-api.md",
        "adr/index.md",
    ):
        assert path in developer_paths, path

    assert _nav_paths(_section(nav, "信源与审计"))[0] == "references/index.md"
```

- [ ] **Step 2: Run it and watch it fail.**

Run: `uv run --locked --group docs pytest tests/test_mkdocs_system.py -q`
Expected: FAIL in `test_navigation_separates_the_learner_path_from_developer_pages` with `AssertionError: assert ['首页', '项目', '入门', '科学模型', '教程', '操作指南', '技术参考', '决策记录', '信源与审计'] == ['首页', '教材', '深入阅读', '开发者', '信源与审计']`. The other 6 tests pass.

- [ ] **Step 3: Create `docs/textbook/index.md`** with exactly this content:

```markdown
# 教材：看得见的氢原子量子力学

这套教材面向正在学习本科量子力学或结构化学的读者，假设你熟悉微积分、复数和矩阵的基本运算。
全书只讨论一个体系——氢原子（以及把核电荷换成 $Z$ 的类氢离子），但从波函数、能级和径向分布一路讲到
相位、概率流、含时叠加态和实验测量。每一章的交互图都来自同一套 Python 解析计算，浏览器只负责绘制。

## 怎么读 {#how-to-read}

1. 按章节顺序阅读：后面的章节默认你已经熟悉前面的记号。
2. 每章以“学习目标”开头，以“常见误区”“思考题”“延伸阅读”结尾；思考题的答案默认折叠，先自己算再展开。
3. 交互图默认只显示图注和按钮。点“加载交互图”在页面内运行实验室；点“在实验室中打开”在新标签页继续探索同一个状态。

## 章节 {#chapters}

章节按下表顺序展开。

## 与站点其他部分的关系 {#other-parts}

- **深入阅读**收录原有的科学模型与教程页面，推导更完整，也更接近实现约定；
- **开发者**记录项目状态、安装、操作指南、技术参考和架构决策；
- **信源与审计**是全部引用的索引、信源政策与纠错账本。
```

- [ ] **Step 4: Replace `mkdocs.yml:110-163`** (from `nav:` to the end of the file) with:

```yaml
nav:
  - 首页: index.md
  - 教材:
      - textbook/index.md
  - 深入阅读:
      - 科学模型:
          - concepts/index.md
          - 量子可视化模型地图: concepts/model-map.md
          - 可视对象语义: concepts/semantics.md
          - 物理与数值约定: concepts/conventions.md
          - 坐标与概率测度: concepts/coordinate-measures.md
          - 概率流: concepts/probability-current.md
          - 实验图样与概率密度: concepts/experiment-vs-density.md
      - 教程:
          - tutorials/index.md
          - Phase 0 交互工作流: tutorials/phase-0-walkthrough.md
          - 氢与类氢轨道: tutorials/hydrogenic-orbitals.md
          - 实轨道与复轨道: tutorials/real-vs-complex.md
          - 电子云采样: tutorials/sampling.md
          - 点群与轨道杂化: tutorials/hybridization.md
  - 开发者:
      - 项目:
          - project/index.md
          - 愿景与边界: project/vision.md
          - 当前状态: project/status.md
          - 开发路线图: project/roadmap.md
      - 入门:
          - getting-started/index.md
          - 安装: getting-started/installation.md
          - 第一个轨道: getting-started/first-orbital.md
          - 开发工作流: getting-started/development.md
      - 操作指南:
          - how-to/index.md
          - 添加量子态: how-to/add-state.md
          - 添加表示方法: how-to/add-representation.md
          - 验证采样器: how-to/validate-sampler.md
          - 添加和维护引用: how-to/cite-sources.md
      - 技术参考:
          - reference/index.md
          - 系统架构: concepts/architecture.md
          - 3D 前端渲染: tutorials/frontend-rendering.md
          - Scene Contract: reference/scene-contract.md
          - HTTP API: reference/api.md
          - HTTP Schema: reference/http-schema.md
          - Python API: reference/physics-api.md
          - 质量门禁: reference/quality-gates.md
      - 决策记录:
          - adr/index.md
          - ADR-0001 科学内核与渲染分离: adr/0001-core-renderer-boundary.md
          - ADR-0002 浏览器原生 3D: adr/0002-browser-native-3d.md
          - ADR-0003 引用单一真值源: adr/0003-reference-index.md
          - ADR-0004 qmsolve 定位: adr/0004-qmsolve-boundary.md
  - 信源与审计:
      - references/index.md
      - 信源与引用政策: references/source-policy.md
      - 用户提供资料审计: references/source-audit.md
      - 声明—证据—测试映射: references/source-map.md
      - 纠错账本: references/corrections.md
```

For reference, the **final** `教材` block after Tasks C7–C14 is shown below. Do not add these lines now: nav entries for missing files fail the strict build.

```yaml
  - 教材:
      - textbook/index.md
      - 0 如何使用本书与实验室: textbook/00-how-to-use.md
      - 1 波函数与 Born 规则: textbook/01-wavefunction.md
      - 2 氢原子：量子数与能级: textbook/02-hydrogen-levels.md
      - 3 径向分布与节点: textbook/03-radial-nodes.md
      - 4 实轨道与复轨道: textbook/04-real-complex.md
      - 5 电子云：从概率到采样: textbook/05-electron-cloud.md
      - 6 等值面：轨道的“形状”: textbook/06-isosurface.md
      - 7 相位与平面切片: textbook/07-phase-slices.md
      - 8 概率流: textbook/08-probability-current.md
      - 9 叠加态与时间演化: textbook/09-superposition-time.md
      - 10 从密度到实验图样: textbook/10-experiment.md
      - 11 对称性与杂化: textbook/11-symmetry-hybridization.md
      - 附录 A 常见误区: textbook/appendix-a-misconceptions.md
      - 附录 B 符号与单位: textbook/appendix-b-notation-units.md
```

The final `决策记录` block additionally ends with `- ADR-0005 静态托管与预计算目录: adr/0005-static-hosting.md` (Task C16). Planning checked that these keys load with `yaml.safe_load`, including those with a leading digit, a full-width colon or typographic quotes.

- [ ] **Step 5: Point the two index pages at the new homes.**
  - In `docs/tutorials/index.md`, replace line 3 with:

    ```markdown
    这里的教程保留为“深入阅读”：推导更完整，也保留实现约定。按学习顺序的系统讲解见[教材](../textbook/index.md)。页面会区分已经验证的实现、原型和目标设计；总状态以[当前状态](../project/status.md)为准。
    ```

  - Delete line 10 (`6. [3D 前端渲染]…`) entirely, so that the ordered list ends at item 5 with no blank line inside it. Then replace line 12 (line 11 after the deletion) with:

    ```markdown
    如果目标是先把当前版本完整跑通，从第 1 篇开始；如果要复核公式或实现约定，按后四篇的主题进入。面向开发者的[3D 前端渲染](frontend-rendering.md)已移到“开发者 › 技术参考”。
    ```

  - In `docs/reference/index.md`, insert two list items before line 3, so that the list starts:

    ```markdown
    - [系统架构](../concepts/architecture.md)
    - [3D 前端渲染](../tutorials/frontend-rendering.md)
    - [Scene Contract](scene-contract.md)
    ```

- [ ] **Step 6: Run and see it pass.**

Run: `uv run --locked --group docs pytest tests/test_mkdocs_system.py tests/test_docs_integrity.py -q`
Expected: all passed (7 tests in `test_mkdocs_system.py`, the rest in `test_docs_integrity.py`).
Run: `uv run --locked --group docs mkdocs build --strict`
Expected: exit 0, and `site/textbook/index.html` exists.

- [ ] **Step 7: Pre-commit gate, then commit.** This commit changes `tests/test_mkdocs_system.py`, so the full Python gate runs first (CLAUDE.md, spec §6).

Run: `uv run --locked --group docs pytest --cov=quviz --cov-report=term-missing`
Expected: exit 0. The summary line reports only `passed`, with no `failed`, `error`, `skipped`, `xfailed` or `xpassed`, and the output contains `Required test coverage of 85% reached.` If anything is red, fix it and re-run this step; do not commit.
Run: `uv run --locked ruff check tests/test_mkdocs_system.py && uv run --locked ruff format --check tests/test_mkdocs_system.py`
Expected: `All checks passed!` and `1 file already formatted`.

```bash
git add mkdocs.yml docs/textbook/index.md docs/tutorials/index.md docs/reference/index.md tests/test_mkdocs_system.py
git commit -m "docs(nav): split the site into textbook, further reading and developer tabs" -m "Claude-Session: https://claude.ai/code/session_01E44DEzsc7Av26fc7nZ5rSo"
```

---

### Task C2: Theme override — lab meta tag, dark-first palette, dark Mermaid

**Files:**
- Create: `overrides/main.html`
- Modify: `mkdocs.yml:22-54` (the theme block) and insert an `extra:` block between `extra_javascript` (ends line 108) and `nav:`
- Modify: `docs/assets/javascripts/mermaid.js:1-5`
- Test: `tests/test_mkdocs_system.py` (new test after the Task C1 test)

**Interfaces:**
- Consumes: Material's `base.html` `{% block extrahead %}` (`.venv/Lib/site-packages/material/templates/base.html:83`), and `config.extra` as a mapping in Jinja.
- Produces (contracts, "C produces"):
  - `mkdocs.yml` `theme.custom_dir: overrides` and `extra.quviz.lab_url: "http://127.0.0.1:8000/"`;
  - on every page, `<meta name="quviz-lab" content="{{ config.extra.quviz.lab_url | e }}">` in `<head>`. Material's instant navigation diffs `<head>` children and keeps identical ones, so the tag survives document swaps.

- [ ] **Step 1: Write the failing test** (append after the Task C1 test):

```python
def test_theme_injects_the_lab_url_and_defaults_to_the_dark_palette() -> None:
    config = _raw_config()
    theme = config["theme"]
    assert theme["custom_dir"] == "overrides"
    assert theme["font"] is False
    assert config["extra"] == {"quviz": {"lab_url": "http://127.0.0.1:8000/"}}

    palette = theme["palette"]
    assert [entry["scheme"] for entry in palette] == ["slate", "default"]
    for entry in palette:
        # Dark is the default, not a system-preference branch; light is the toggle.
        assert "media" not in entry
        assert (entry["primary"], entry["accent"]) == ("custom", "custom")

    template = (ROOT / "overrides" / "main.html").read_text(encoding="utf-8")
    assert template.startswith('{% extends "base.html" %}')
    assert "{% block extrahead %}" in template
    assert "{{ super() }}" in template
    assert '<meta name="quviz-lab" content="{{ config.extra.quviz.lab_url | e }}">' in template

    loaded = load_config(str(CONFIG_PATH))
    assert Path(loaded["theme"].custom_dir).resolve() == (ROOT / "overrides").resolve()

    mermaid = (DOCS / "assets/javascripts/mermaid.js").read_text(encoding="utf-8")
    assert "theme: quvizMermaidTheme()" in mermaid
    assert '? "default"' in mermaid
    assert ': "dark"' in mermaid
    assert '"neutral"' not in mermaid
```

- [ ] **Step 2: Run it and watch it fail.**

Run: `uv run --locked --group docs pytest tests/test_mkdocs_system.py -q`
Expected: FAIL in `test_theme_injects_the_lab_url_and_defaults_to_the_dark_palette` with `KeyError: 'custom_dir'`.

- [ ] **Step 3: Create `overrides/main.html`:**

```jinja
{% extends "base.html" %}

{#-
  教材交互图（docs/assets/javascripts/quviz-figure.js）从这里读取实验室根地址。
  mkdocs.yml 的 extra.quviz.lab_url 默认指向本地 quviz serve；GitHub Pages 的派生配置改为 "../"，
  由脚本相对教材站点根解析。Material 即时导航换页时保留相同的 <head> 子元素，所以只注入一次即可。
-#}
{% block extrahead %}
  {{ super() }}
  {%- if config.extra.quviz and config.extra.quviz.lab_url %}
  <meta name="quviz-lab" content="{{ config.extra.quviz.lab_url | e }}">
  {%- endif %}
{% endblock %}
```

- [ ] **Step 4: Edit `mkdocs.yml`.**
  - In the theme block, add `custom_dir: overrides` directly under `name: material` (line 23).
  - Replace `palette:` (lines 40-54) with:

    ```yaml
      palette:
        - scheme: slate
          primary: custom
          accent: custom
          toggle:
            icon: material/brightness-4
            name: 切换到浅色模式
        - scheme: default
          primary: custom
          accent: custom
          toggle:
            icon: material/brightness-7
            name: 切换到深色模式
    ```

  - After the last `extra_javascript` item (line 108) and before `nav:`, insert:

    ```yaml

    # 教材交互图读取的实验室根地址，由 overrides/main.html 注入 <meta name="quviz-lab">。
    # 本地默认指向 `quviz serve`；GitHub Pages 构建的派生配置（INHERIT 本文件）改为 "../"。
    extra:
      quviz:
        lab_url: "http://127.0.0.1:8000/"
    ```

- [ ] **Step 5: Replace `docs/assets/javascripts/mermaid.js:1-5`** (the `initialize` call) with the following. Lines 7-25 stay unchanged, so the pinned strings `startOnLoad: false`, `document$.subscribe(renderMermaid)` and `window.mermaid.run({ nodes })` remain (`tests/test_mkdocs_system.py:97-99`).

```js
// Mermaid 的主题只能在 initialize 时设定一次：跟随 Material 写在 body 上的配色方案，
// 深色（默认）用 dark，浅色备选用 default。
const quvizMermaidTheme = () =>
  document.body && document.body.getAttribute("data-md-color-scheme") === "default"
    ? "default"
    : "dark";

window.mermaid.initialize({
  startOnLoad: false,
  securityLevel: "strict",
  theme: quvizMermaidTheme()
});
```

- [ ] **Step 6: Run and see it pass, then check the built head.**

Run: `uv run --locked --group docs pytest tests/test_mkdocs_system.py tests/test_citation_gates.py -q`
Expected: all passed. `test_citation_gates.py` calls `load_config`, which now requires `overrides/` to exist.
Run: `uv run --locked --group docs mkdocs build --strict && grep -o '<meta name="quviz-lab"[^>]*>' site/index.html site/concepts/model-map/index.html` *(bash)*
Expected: exit 0 and two lines, each `<meta name="quviz-lab" content="http://127.0.0.1:8000/">`.

- [ ] **Step 7: Pre-commit gate, then commit.** This commit changes `tests/test_mkdocs_system.py`, so the full Python gate runs first (CLAUDE.md, spec §6).

Run: `uv run --locked --group docs pytest --cov=quviz --cov-report=term-missing`
Expected: exit 0. The summary line reports only `passed`, with no `failed`, `error`, `skipped`, `xfailed` or `xpassed`, and the output contains `Required test coverage of 85% reached.` If anything is red, fix it and re-run this step; do not commit.
Run: `uv run --locked ruff check tests/test_mkdocs_system.py && uv run --locked ruff format --check tests/test_mkdocs_system.py`
Expected: `All checks passed!` and `1 file already formatted`.

```bash
git add overrides/main.html mkdocs.yml docs/assets/javascripts/mermaid.js tests/test_mkdocs_system.py
git commit -m "docs(theme): inject the lab URL meta tag and default to a dark palette" -m "Claude-Session: https://claude.ai/code/session_01E44DEzsc7Av26fc7nZ5rSo"
```

---

### Task C3: Self-hosted Google Sans Flex and the Weather-Lab stylesheet

**Files:**
- Create: `docs/assets/fonts/google-sans-flex-latin-wght-normal.woff2`, `docs/assets/fonts/google-sans-flex-math-wght-normal.woff2`, `docs/assets/fonts/OFL.txt`
- Modify (full rewrite): `docs/assets/stylesheets/extra.css:1-50`
- Test: `tests/test_mkdocs_system.py` (new test and constants)

**Interfaces:**
- Consumes: the Material CSS variables `--md-text-font`, `--md-default-*`, `--md-primary-*`, `--md-accent-*` and `--md-typeset-*`, and the scheme/primary/accent attributes on `<body>`.
- Produces: the `--qv-*` design tokens of spec §4.4 in docs CSS, plus the classes `.hero` and `.quviz-pill` (used by Task C6). The three font files are also the source Part D copies verbatim to `web/public/fonts/`.

- [ ] **Step 1: Write the failing test.** Add `import hashlib` to the imports of `tests/test_mkdocs_system.py`, then append:

```python
FONT_FILES = {
    # @fontsource-variable/google-sans-flex@5.3.1 (SIL OFL 1.1), fetched verbatim.
    "google-sans-flex-latin-wght-normal.woff2": (
        "4f2ce47af77a0bb9ec3dbd2e81bab7eb97fbcfcd94e47fa63510bb4271b09113"
    ),
    "google-sans-flex-math-wght-normal.woff2": (
        "f266d6cc9d343ae3da3de6ee68a772a76a27277ba864a1a07f8bc7ec4bcfd68d"
    ),
    "OFL.txt": "7168a081fbcea8dbe975e3a015c4e340761b3b4ddf8de0c8a818543f773a29e0",
}
# spec §4.4: the lab and the textbook share one set of design tokens.
SPEC_TOKENS = {
    "--qv-bg": "#0e0f11",
    "--qv-glass": "rgba(0, 0, 0, 0.6)",
    "--qv-glass-strong": "rgba(16, 17, 20, 0.86)",
    "--qv-border": "rgba(255, 255, 255, 0.15)",
    "--qv-border-strong": "rgba(255, 255, 255, 0.3)",
    "--qv-glow": "0 0 12px rgba(100, 160, 255, 0.2)",
    "--qv-blur": "blur(16px)",
    "--qv-radius-panel": "24px",
    "--qv-radius-pill": "100px",
    "--qv-radius-tag": "4px",
    "--qv-text": "#fff",
    "--qv-text-2": "rgba(255, 255, 255, 0.62)",
    "--qv-text-3": "rgba(255, 255, 255, 0.4)",
    "--qv-band": "rgba(255, 255, 255, 0.045)",
    "--qv-accent": "#8ab4f8",
    "--qv-accent-strong": "#1a73e8",
    "--qv-ok": "#81c995",
    "--qv-warn": "#fdd663",
    "--qv-danger": "#f28b82",
}


def test_google_sans_flex_is_self_hosted_with_its_licence_and_spec_tokens() -> None:
    fonts = DOCS / "assets" / "fonts"
    assert sorted(path.name for path in fonts.iterdir()) == sorted(FONT_FILES)
    for name, digest in FONT_FILES.items():
        assert hashlib.sha256((fonts / name).read_bytes()).hexdigest() == digest, name
    assert "SIL OPEN FONT LICENSE Version 1.1" in (fonts / "OFL.txt").read_text(encoding="utf-8")

    css = (DOCS / "assets/stylesheets/extra.css").read_text(encoding="utf-8")
    assert css.count("@font-face") == 2
    for name in FONT_FILES:
        if name.endswith(".woff2"):
            assert f'url("../fonts/{name}") format("woff2")' in css
    assert '--md-text-font: "Google Sans Flex", system-ui, "PingFang SC"' in css
    for token, value in SPEC_TOKENS.items():
        assert f"  {token}: {value};" in css, token
    # font: false keeps Material from requesting Google Fonts; nothing else may either.
    assert _raw_config()["theme"]["font"] is False
    for path in [*DOCS.rglob("*.css"), *DOCS.rglob("*.js"), *(ROOT / "overrides").rglob("*")]:
        if path.is_file():
            text = path.read_text(encoding="utf-8")
            assert "fonts.googleapis.com" not in text, path
            assert "fonts.gstatic.com" not in text, path
```

- [ ] **Step 2: Run it and watch it fail.**

Run: `uv run --locked --group docs pytest tests/test_mkdocs_system.py -q`
Expected: FAIL in `test_google_sans_flex_is_self_hosted_with_its_licence_and_spec_tokens` with `FileNotFoundError: … docs\assets\fonts`.

- [ ] **Step 3: Fetch the OFL font files** *(bash)*. These commands are read-only against the network: jsDelivr serves the published npm tarball contents. Planning verified the sizes: 50,832 B, 38,836 B and 4,350 B.

```bash
FONT_BASE="https://cdn.jsdelivr.net/npm/@fontsource-variable/google-sans-flex@5.3.1"
mkdir -p docs/assets/fonts
curl -fsSL -o docs/assets/fonts/google-sans-flex-latin-wght-normal.woff2 "$FONT_BASE/files/google-sans-flex-latin-wght-normal.woff2"
curl -fsSL -o docs/assets/fonts/google-sans-flex-math-wght-normal.woff2 "$FONT_BASE/files/google-sans-flex-math-wght-normal.woff2"
curl -fsSL -o docs/assets/fonts/OFL.txt "$FONT_BASE/LICENSE"
sha256sum docs/assets/fonts/*
```

Expected `sha256sum` output (order may differ):

```text
7168a081fbcea8dbe975e3a015c4e340761b3b4ddf8de0c8a818543f773a29e0 *docs/assets/fonts/OFL.txt
4f2ce47af77a0bb9ec3dbd2e81bab7eb97fbcfcd94e47fa63510bb4271b09113 *docs/assets/fonts/google-sans-flex-latin-wght-normal.woff2
f266d6cc9d343ae3da3de6ee68a772a76a27277ba864a1a07f8bc7ec4bcfd68d *docs/assets/fonts/google-sans-flex-math-wght-normal.woff2
```

If jsDelivr is unreachable, use the same package through npm without installing anything into `web/`: `npm pack @fontsource-variable/google-sans-flex@5.3.1`, run in the scratchpad, produces `fontsource-variable-google-sans-flex-5.3.1.tgz`. Extract it with `tar -xzf fontsource-variable-google-sans-flex-5.3.1.tgz`, then copy `package/files/google-sans-flex-latin-wght-normal.woff2`, `package/files/google-sans-flex-math-wght-normal.woff2` and `package/LICENSE` (renamed to `OFL.txt`) into `docs/assets/fonts/`. The hashes must match either way. `.gitattributes` already marks `*.woff2` binary; `OFL.txt` is ASCII with LF endings.

- [ ] **Step 4: Rewrite `docs/assets/stylesheets/extra.css`** with exactly this content (the figure-card rules are appended in Task C4):

```css
/*
 * QuViz 教材主题。
 *
 * 与实验室共用 design/specs/2026-09-25-pages-textbook-lab-design.md §4.4 的 --qv-* 设计令牌：
 * 深色为默认，浅色为备选；玻璃顶栏与标签栏、面板化侧栏、告示块与表格、药丸按钮。
 * 数据颜色（相位色轮、切片色带、流线速度）属于实验室，不在这里定义。
 */

/* 自托管 Google Sans Flex（SIL OFL 1.1，许可证：../fonts/OFL.txt）。latin 子集刻意去掉
 * U+2014 与 U+2018-201F，让中文正文里的破折号和弯引号落到系统中文字体上。 */
@font-face {
  font-family: "Google Sans Flex";
  font-style: normal;
  font-weight: 1 1000;
  font-display: swap;
  src: url("../fonts/google-sans-flex-latin-wght-normal.woff2") format("woff2");
  unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-2013, U+2015-2017, U+2020-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD;
}

@font-face {
  font-family: "Google Sans Flex";
  font-style: normal;
  font-weight: 1 1000;
  font-display: swap;
  src: url("../fonts/google-sans-flex-math-wght-normal.woff2") format("woff2");
  unicode-range: U+0302-0303, U+0305, U+0307-0308, U+0310, U+0312, U+0315, U+031A, U+0326-0327, U+032C, U+032F-0330, U+0332-0333, U+0338, U+033A, U+0346, U+034D, U+0391-03A1, U+03A3-03A9, U+03B1-03C9, U+03D1, U+03D5-03D6, U+03F0-03F1, U+03F4-03F5, U+2016-2017, U+2034-2038, U+203C, U+2040, U+2043, U+2047, U+2050, U+2057, U+205F, U+2070-2071, U+2074-208E, U+2090-209C, U+20D0-20DC, U+20E1, U+20E5-20EF, U+2100-2112, U+2114-2115, U+2117-2121, U+2123-214F, U+2190, U+2192, U+2194-21AE, U+21B0-21E5, U+21F1-21F2, U+21F4-2211, U+2213-2214, U+2216-22FF, U+2308-230B, U+2310, U+2319, U+231C-2321, U+2336-237A, U+237C, U+2395, U+239B-23B7, U+23D0, U+23DC-23E1, U+2474-2475, U+25AF, U+25B3, U+25B7, U+25BD, U+25C1, U+25CA, U+25CC, U+25FB, U+266D-266F, U+27C0-27FF, U+2900-2AFF, U+2B0E-2B11, U+2B30-2B4C, U+2BFE, U+3030, U+FF5B, U+FF5D, U+1D400-1D7FF, U+1EE00-1EEFF;
}

:root {
  --qv-bg: #0e0f11;
  --qv-glass: rgba(0, 0, 0, 0.6);
  --qv-glass-strong: rgba(16, 17, 20, 0.86);
  --qv-border: rgba(255, 255, 255, 0.15);
  --qv-border-strong: rgba(255, 255, 255, 0.3);
  --qv-glow: 0 0 12px rgba(100, 160, 255, 0.2);
  --qv-blur: blur(16px);
  --qv-radius-panel: 24px;
  --qv-radius-pill: 100px;
  --qv-radius-tag: 4px;
  --qv-text: #fff;
  --qv-text-2: rgba(255, 255, 255, 0.62);
  --qv-text-3: rgba(255, 255, 255, 0.4);
  --qv-band: rgba(255, 255, 255, 0.045);
  --qv-accent: #8ab4f8;
  --qv-accent-strong: #1a73e8;
  --qv-ok: #81c995;
  --qv-warn: #fdd663;
  --qv-danger: #f28b82;
  --qv-font: "Google Sans Flex", system-ui, "PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC", sans-serif;
  /* Material 拼成 var(--md-text-font), -apple-system, …，因此这里不写最后的 sans-serif。 */
  --md-text-font: "Google Sans Flex", system-ui, "PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC";
}

/* 深色（默认，slate）：页面、面板与文字都取实验室令牌。 */
[data-md-color-scheme="slate"] {
  --md-hue: 220;
  --md-default-bg-color: var(--qv-bg);
  --md-default-bg-color--light: rgba(14, 15, 17, 0.54);
  --md-default-bg-color--lighter: rgba(14, 15, 17, 0.26);
  --md-default-bg-color--lightest: rgba(14, 15, 17, 0.07);
  --md-default-fg-color: rgba(255, 255, 255, 0.87);
  --md-default-fg-color--light: var(--qv-text-2);
  --md-default-fg-color--lighter: var(--qv-text-3);
  --md-default-fg-color--lightest: rgba(255, 255, 255, 0.12);
  --md-code-bg-color: rgba(255, 255, 255, 0.05);
  --md-code-fg-color: rgba(255, 255, 255, 0.84);
  --md-typeset-color: var(--md-default-fg-color);
  --md-typeset-a-color: var(--qv-accent);
  --md-typeset-table-color: var(--qv-border);
  --md-typeset-table-color--light: var(--qv-band);
  --md-admonition-bg-color: var(--qv-band);
  --md-footer-bg-color: rgba(0, 0, 0, 0.6);
  --md-footer-bg-color--dark: rgba(0, 0, 0, 0.78);
  --qv-chrome-bg: var(--qv-glass);
  --qv-card-bg: var(--qv-glass-strong);
  --qv-line: var(--qv-border);
  --qv-line-strong: var(--qv-border-strong);
  --qv-surface: var(--qv-band);
}

/* 浅色备选：正文白底深字；顶栏与标签栏仍是深色玻璃，与实验室一致，
 * 也让 Material 以 --md-primary-bg-color（白）绘制的顶栏文字与搜索框保持可读。 */
[data-md-color-scheme="default"] {
  --md-default-bg-color: #f8f9fb;
  --md-typeset-a-color: var(--qv-accent-strong);
  --qv-chrome-bg: var(--qv-glass-strong);
  --qv-card-bg: #fff;
  --qv-line: rgba(0, 0, 0, 0.12);
  --qv-line-strong: rgba(0, 0, 0, 0.24);
  --qv-surface: rgba(0, 0, 0, 0.03);
}

[data-md-color-primary="custom"] {
  --md-primary-fg-color: var(--qv-accent-strong);
  --md-primary-fg-color--light: var(--qv-accent);
  --md-primary-fg-color--dark: #1557b0;
  --md-primary-bg-color: #fff;
  --md-primary-bg-color--light: rgba(255, 255, 255, 0.7);
}

[data-md-color-accent="custom"] {
  --md-accent-fg-color: var(--qv-accent-strong);
  --md-accent-fg-color--transparent: rgba(26, 115, 232, 0.1);
  --md-accent-bg-color: #fff;
  --md-accent-bg-color--light: rgba(255, 255, 255, 0.7);
}

[data-md-color-scheme="slate"][data-md-color-accent="custom"] {
  --md-accent-fg-color: var(--qv-accent);
  --md-accent-fg-color--transparent: rgba(138, 180, 248, 0.12);
}

/* 玻璃顶栏与标签栏 */
.md-header,
.md-tabs {
  background-color: var(--qv-chrome-bg);
  color: var(--qv-text);
  -webkit-backdrop-filter: var(--qv-blur);
  backdrop-filter: var(--qv-blur);
}

.md-header {
  border-bottom: 1px solid var(--qv-border);
  box-shadow: var(--qv-glow);
}

.md-header--shadow {
  box-shadow: var(--qv-glow), 0 6px 18px rgba(0, 0, 0, 0.28);
}

.md-header__topic:first-child {
  font-weight: 500;
  letter-spacing: -0.01em;
}

.md-tabs {
  border-bottom: 1px solid var(--qv-border);
}

.md-tabs__link {
  color: var(--qv-text-2);
  font-weight: 500;
  opacity: 1;
}

.md-tabs__link:is(:hover, :focus-visible),
.md-tabs__item--active .md-tabs__link {
  color: var(--qv-text);
}

.md-tabs__item--active .md-tabs__link {
  text-decoration: underline 2px var(--qv-accent);
  text-underline-offset: 0.45em;
}

.md-search__form {
  border-radius: var(--qv-radius-pill);
}

/* 桌面端两侧导航是浮在页面上的面板 */
@media screen and (min-width: 76.25em) {
  .md-sidebar__scrollwrap {
    margin-inline: 0.4rem;
    border: 1px solid var(--qv-line);
    border-radius: var(--qv-radius-panel);
    background-color: var(--qv-surface);
  }
}

.md-nav__link--active,
.md-nav__link:is(:hover, :focus-visible) {
  color: var(--md-typeset-a-color);
}

/* 正文 */
.md-typeset h1,
.md-typeset h2,
.md-typeset h3 {
  font-weight: 500;
  letter-spacing: -0.02em;
}

.md-typeset h1 {
  color: var(--md-default-fg-color);
}

.md-typeset .admonition,
.md-typeset details {
  border-width: 1px;
  border-radius: 16px;
  background-color: var(--qv-surface);
  box-shadow: none;
}

.md-typeset .admonition-title,
.md-typeset summary {
  border-top-left-radius: 15px;
  border-top-right-radius: 15px;
  font-weight: 700;
}

.md-typeset details:not([open]) > summary {
  border-radius: 15px;
}

.md-typeset table:not([class]) {
  border: 1px solid var(--qv-line);
  border-radius: 16px;
  overflow: hidden;
  background-color: var(--qv-surface);
  font-variant-numeric: tabular-nums;
}

.md-typeset table:not([class]) th {
  background-color: var(--md-default-fg-color--lightest);
  font-weight: 700;
}

.md-typeset code {
  border-radius: var(--qv-radius-tag);
}

.md-typeset pre > code {
  border: 1px solid var(--qv-line);
  border-radius: 16px;
}

/* 药丸按钮 */
.md-typeset .md-button {
  border: 1px solid var(--qv-line-strong);
  border-radius: var(--qv-radius-pill);
  padding: 0.55em 1.5em;
  color: var(--md-default-fg-color);
  font-weight: 500;
  transition: background-color 0.2s, border-color 0.2s, box-shadow 0.2s, color 0.2s;
}

.md-typeset .md-button:is(:hover, :focus-visible) {
  border-color: var(--qv-accent);
  background-color: var(--qv-surface);
  color: var(--md-default-fg-color);
  box-shadow: var(--qv-glow);
}

.md-typeset .md-button--primary,
.md-typeset .md-button--primary:is(:hover, :focus-visible) {
  border-color: var(--qv-accent-strong);
  background-color: var(--qv-accent-strong);
  color: #fff;
}

.md-typeset .md-button:disabled {
  opacity: 0.45;
  cursor: not-allowed;
  box-shadow: none;
}

.md-top {
  border: 1px solid var(--qv-line);
  border-radius: var(--qv-radius-pill);
  background-color: var(--qv-card-bg);
  color: var(--md-default-fg-color);
  box-shadow: var(--qv-glow);
}

.md-footer {
  -webkit-backdrop-filter: var(--qv-blur);
  backdrop-filter: var(--qv-blur);
}

.md-typeset .quviz-citation {
  color: var(--md-accent-fg-color);
  font-size: 0.92em;
  white-space: nowrap;
  cursor: help;
}

/* 首页主卡片与“教学预览”药丸标签 */
.md-typeset .hero {
  padding: 2.4rem 2.2rem;
  border: 1px solid var(--qv-line);
  border-radius: var(--qv-radius-panel);
  background:
    radial-gradient(circle at 85% 12%, rgba(138, 180, 248, 0.16), transparent 42%),
    var(--qv-card-bg);
  box-shadow: var(--qv-glow);
}

.md-typeset .hero h1 {
  margin: 0.4rem 0 0.8rem;
  font-size: clamp(2.2rem, 5vw, 3.6rem);
  font-weight: 500;
  line-height: 1.05;
  letter-spacing: -0.03em;
  color: var(--md-default-fg-color);
}

.md-typeset .quviz-pill {
  display: inline-block;
  padding: 4px 10px;
  border: 1px solid var(--qv-line-strong);
  border-radius: var(--qv-radius-pill);
  color: var(--md-default-fg-color--light);
  font-size: 0.6rem;
  font-weight: 500;
  letter-spacing: 0.02em;
}

@media screen and (max-width: 44.9375em) {
  .md-typeset .hero {
    padding: 1.4rem 1.2rem;
  }
}

@media (prefers-reduced-motion: reduce) {
  .md-typeset .md-button {
    transition: none;
  }
}
```

- [ ] **Step 5: Run and see it pass, and check that the fonts ship.**

Run: `uv run --locked --group docs pytest tests/test_mkdocs_system.py -q`
Expected: all passed.
Run: `uv run --locked --group docs mkdocs build --strict && ls site/assets/fonts` *(bash)*
Expected: exit 0, then `OFL.txt  google-sans-flex-latin-wght-normal.woff2  google-sans-flex-math-wght-normal.woff2`.
Manual look (not a gate): `uv run --locked --no-sync --group docs mkdocs serve -a 127.0.0.1:8001`, then open `http://127.0.0.1:8001/`. The page should be dark by default, with a glass header whose text is white, a single blue accent and panel sidebars. Toggle the palette once; the page should turn light and stay readable. Stop the server.

- [ ] **Step 6: Pre-commit gate, then commit.** This commit changes `tests/test_mkdocs_system.py`, so the full Python gate runs first (CLAUDE.md, spec §6).

Run: `uv run --locked --group docs pytest --cov=quviz --cov-report=term-missing`
Expected: exit 0. The summary line reports only `passed`, with no `failed`, `error`, `skipped`, `xfailed` or `xpassed`, and the output contains `Required test coverage of 85% reached.` If anything is red, fix it and re-run this step; do not commit.
Run: `uv run --locked ruff check tests/test_mkdocs_system.py && uv run --locked ruff format --check tests/test_mkdocs_system.py`
Expected: `All checks passed!` and `1 file already formatted`.

```bash
git add docs/assets/fonts/google-sans-flex-latin-wght-normal.woff2 docs/assets/fonts/google-sans-flex-math-wght-normal.woff2 docs/assets/fonts/OFL.txt docs/assets/stylesheets/extra.css tests/test_mkdocs_system.py
git commit -m "docs(theme): self-host Google Sans Flex and restyle the site with the lab tokens" -m "Claude-Session: https://claude.ai/code/session_01E44DEzsc7Av26fc7nZ5rSo"
```

---

### Task C4: Figure embed script and figure cards

**Files:**
- Create: `docs/assets/javascripts/quviz-figure.js`
- Create: `tests/test_quviz_figure_js.py`
- Modify: `mkdocs.yml` (append one `extra_javascript` entry after `- assets/javascripts/mermaid.js`, originally line 108; Task C2's theme edit has shifted it by one line)
- Modify: `tests/test_mkdocs_system.py`, function `test_mathjax_and_mermaid_are_exactly_pinned_and_instant_navigation_aware` (originally lines 85-99; Tasks C1–C3 inserted tests above it, so locate it by name): the pinned script list plus new assertions
- Modify: `docs/assets/stylesheets/extra.css` (append the figure-card rules at the end)
- Modify: `docs/reference/quality-gates.md` (insert one bullet before line 130, the `- 🔗 MkDocs 在真实 Chromium 中完成渲染` bullet)

**Interfaces:**
- Consumes:
  - `<meta name="quviz-lab" content>` (Task C2);
  - Material's `#__config` JSON `base` (`material/templates/base.html:229-248`) and the global `document$` (`window.document$` in the bundle);
  - figure markup from the contracts.
- Produces:
  - the browser global `window.QuvizFigure = { siteRootFrom(configText: string, pageHref: string): string, labRoot(labSetting: string | null, siteRoot: string): string | null, labUrls(labSetting: string | null, siteRoot: string, deepLink: string | null): { embed: string, open: string } | null, enhance(): void }`;
  - the DOM contract used by Part E's pages-e2e and by Task C19:
    - `figure.quviz-figure[data-quviz-ready]` › `.quviz-figure__stage` › `.quviz-figure__placeholder`, which contains:
      - `button.quviz-figure__load` with the text `加载交互图`;
      - `a.quviz-figure__open` with the text `在实验室中打开`, `href` = `<lab>#<data-lab>`, `target="_blank"` and `rel="noopener"`;
    - after a click, `iframe.quviz-figure__frame` with `src` = `<lab>#embed=1&<data-lab>`, plus `button.quviz-figure__close` with the text `关闭交互图`;
    - `a[data-quviz-lab]` anchors become `href` = lab root (or `<lab>#<value>`) and lose `hidden`;
    - a failure sets `figure[data-quviz-state="error"]`, a disabled load button and a hidden open link.

- [ ] **Step 1: Write the failing tests.** Create `tests/test_quviz_figure_js.py`:

```python
"""Behaviour of ``docs/assets/javascripts/quviz-figure.js`` under a minimal fake DOM.

The script runs on every textbook page. No browser is needed to prove its URL
arithmetic and DOM contract: a small fake DOM in Node executes the real file.
Node is already a hard requirement of this repository (``web/``). As with
``pwsh`` in ``tests/test_check_script.py``, a missing ``node`` is a failure,
never a skip.
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "docs" / "assets" / "javascripts" / "quviz-figure.js"

HARNESS = r"""
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')

const SOURCE = fs.readFileSync(process.env.QUVIZ_FIGURE_JS, 'utf8')

function matches(node, selector) {
  const parsed = /^([a-z]+)?((?:\.[\w-]+)*)((?:\[[^\]]+\])*)$/.exec(selector)
  if (!parsed) throw new Error(`fake DOM: unsupported selector ${selector}`)
  const [, tag, classes, attributes] = parsed
  if (tag && node.tagName !== tag.toUpperCase()) return false
  const own = String(node.className || '').split(/\s+/)
  for (const name of classes.split('.').filter(Boolean)) if (!own.includes(name)) return false
  for (const raw of attributes.match(/\[[^\]]+\]/g) || []) {
    const [, name, value] = /^\[([\w-]+)(?:="([^"]*)")?\]$/.exec(raw)
    if (!node.hasAttribute(name)) return false
    if (value !== undefined && node.getAttribute(name) !== value) return false
  }
  return true
}

class FakeElement {
  constructor(tag) {
    this.tagName = tag.toUpperCase()
    this.className = ''
    this.hidden = false
    this.disabled = false
    this.children = []
    this.parentNode = null
    this.attributes = new Map()
    this.listeners = new Map()
    this.ownText = ''
  }
  get textContent() { return this.ownText + this.children.map((child) => child.textContent).join('') }
  set textContent(value) { this.ownText = String(value); this.children = [] }
  get firstChild() { return this.children[0] || null }
  setAttribute(name, value) { this.attributes.set(name, String(value)) }
  getAttribute(name) { return this.attributes.has(name) ? this.attributes.get(name) : null }
  hasAttribute(name) { return this.attributes.has(name) }
  removeAttribute(name) { this.attributes.delete(name) }
  appendChild(child) { child.parentNode = this; this.children.push(child); return child }
  insertBefore(child, reference) {
    child.parentNode = this
    const index = reference ? this.children.indexOf(reference) : -1
    if (index < 0) this.children.push(child)
    else this.children.splice(index, 0, child)
    return child
  }
  removeChild(child) { this.children = this.children.filter((node) => node !== child); child.parentNode = null; return child }
  addEventListener(type, listener) { this.listeners.set(type, [...(this.listeners.get(type) || []), listener]) }
  click() { if (!this.disabled) for (const listener of this.listeners.get('click') || []) listener({ type: 'click' }) }
  querySelectorAll(selector) {
    const found = []
    const walk = (node) => { for (const child of node.children) { if (matches(child, selector)) found.push(child); walk(child) } }
    walk(this)
    return found
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null }
}

function page({ href, config, lab, figures = [], labLinks = [] }) {
  const root = new FakeElement('html')
  const head = root.appendChild(new FakeElement('head'))
  const body = root.appendChild(new FakeElement('body'))
  if (lab !== undefined) {
    const meta = head.appendChild(new FakeElement('meta'))
    meta.setAttribute('name', 'quviz-lab')
    meta.setAttribute('content', lab)
  }
  const article = body.appendChild(new FakeElement('article'))
  for (const [deepLink, caption] of figures) {
    const figure = article.appendChild(new FakeElement('figure'))
    figure.className = 'quviz-figure'
    figure.setAttribute('data-lab', deepLink)
    const paragraph = figure.appendChild(new FakeElement('p'))
    paragraph.textContent = caption
  }
  for (const value of labLinks) {
    const anchor = article.appendChild(new FakeElement('a'))
    anchor.className = 'md-button'
    anchor.setAttribute('data-quviz-lab', value)
    anchor.hidden = true
  }
  if (config !== undefined) {
    const script = body.appendChild(new FakeElement('script'))
    script.setAttribute('id', '__config')
    script.textContent = config
  }
  const document = {
    readyState: 'complete',
    createElement: (tag) => new FakeElement(tag),
    getElementById: (id) => root.querySelectorAll(`[id="${id}"]`)[0] || null,
    querySelectorAll: (selector) => root.querySelectorAll(selector),
    querySelector: (selector) => root.querySelector(selector),
    addEventListener: () => { throw new Error('readyState is complete; no listener expected') },
  }
  const window = { location: { href } }
  vm.runInNewContext(SOURCE, { window, document, URL, JSON, String })
  return { window, document, article }
}

const EIGEN = 'mode=eigenstate&n=1&l=0&m=0&basis=real&rep=point_cloud'
const SUPER = 'mode=superposition&preset=1s-2pz&t=8.4&rep=slice&plane=xz&obs=probability_density'

// 1. GitHub Pages layout: lab_url "../" is relative to the textbook root, not to the page.
{
  const { window, document, article } = page({
    href: 'https://example.test/repo/learn/textbook/01-wavefunction/',
    config: JSON.stringify({ base: '../..' }),
    lab: '../',
    figures: [[EIGEN, '图 1.1   1s  电子云'], [SUPER, '图 9.2 t=8.4']],
  })
  const [first, second] = article.querySelectorAll('figure.quviz-figure')
  assert.equal(first.firstChild.className, 'quviz-figure__stage')
  assert.ok(first.hasAttribute('data-quviz-ready'))
  const load = first.querySelector('.quviz-figure__load')
  const open = first.querySelector('.quviz-figure__open')
  assert.equal(load.textContent, '加载交互图')
  assert.equal(load.getAttribute('type'), 'button')
  assert.equal(open.textContent, '在实验室中打开')
  assert.equal(open.getAttribute('href'), `https://example.test/repo/#${EIGEN}`)
  assert.equal(open.getAttribute('target'), '_blank')
  assert.equal(open.getAttribute('rel'), 'noopener')
  assert.equal(document.querySelectorAll('iframe').length, 0, 'nothing loads before the reader asks')

  load.click()
  const frame = first.querySelector('.quviz-figure__frame')
  assert.equal(frame.tagName, 'IFRAME')
  assert.equal(frame.getAttribute('src'), `https://example.test/repo/#embed=1&${EIGEN}`)
  assert.equal(frame.getAttribute('loading'), 'lazy')
  assert.equal(frame.getAttribute('sandbox'), 'allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox')
  assert.equal(frame.getAttribute('allow'), 'fullscreen')
  assert.ok(frame.hasAttribute('allowfullscreen'))
  // Whitespace in the caption collapses; 0xff1a is the full-width colon.
  assert.equal(frame.getAttribute('title'), 'QuViz 交互图' + String.fromCharCode(0xff1a) + '图 1.1 1s 电子云')
  assert.equal(first.querySelector('.quviz-figure__placeholder').hidden, true)
  assert.ok(first.hasAttribute('data-quviz-active'))

  // One live WebGL context per page: loading the second figure unloads the first.
  second.querySelector('.quviz-figure__load').click()
  assert.equal(first.querySelector('iframe'), null)
  assert.equal(first.querySelector('.quviz-figure__placeholder').hidden, false)
  assert.ok(!first.hasAttribute('data-quviz-active'))
  assert.equal(second.querySelector('iframe').getAttribute('src'), `https://example.test/repo/#embed=1&${SUPER}`)
  second.querySelector('.quviz-figure__close').click()
  assert.equal(document.querySelectorAll('iframe').length, 0)

  // document$ emits again after every instant navigation: enhancing twice is a no-op.
  const before = first.children.length
  window.QuvizFigure.enhance()
  assert.equal(first.children.length, before)
  assert.equal(first.querySelectorAll('.quviz-figure__stage').length, 1)

  // After an instant navigation the location changes but the site root does not.
  window.location.href = 'https://example.test/repo/learn/concepts/model-map/'
  const late = article.appendChild(new (first.constructor)('figure'))
  late.className = 'quviz-figure'
  late.setAttribute('data-lab', EIGEN)
  window.QuvizFigure.enhance()
  assert.equal(late.querySelector('.quviz-figure__open').getAttribute('href'), `https://example.test/repo/#${EIGEN}`)
}

// 2. Local default: an absolute lab_url is used verbatim; lab links are revealed.
{
  const { article } = page({
    href: 'http://127.0.0.1:8001/textbook/01-wavefunction/',
    config: JSON.stringify({ base: '../..' }),
    lab: 'http://127.0.0.1:8000/',
    figures: [[EIGEN, '图 1.1']],
    labLinks: ['', 'mode=eigenstate&n=2&l=1&m=0&basis=real&rep=isosurface'],
  })
  assert.equal(article.querySelector('.quviz-figure__open').getAttribute('href'), `http://127.0.0.1:8000/#${EIGEN}`)
  const [rootLink, deepLink] = article.querySelectorAll('a[data-quviz-lab]')
  assert.equal(rootLink.getAttribute('href'), 'http://127.0.0.1:8000/')
  assert.equal(rootLink.hidden, false)
  assert.equal(deepLink.getAttribute('href'), 'http://127.0.0.1:8000/#mode=eigenstate&n=2&l=1&m=0&basis=real&rep=isosurface')
}

// 3. Missing meta, invalid deep links and non-http labs fail visibly and never load.
for (const [lab, deepLink] of [
  [undefined, EIGEN],
  ['', EIGEN],
  ['javascript:alert(1)', EIGEN],
  ['../', `embed=1&${EIGEN}`],
  ['../', 'mode=eigenstate&n=1 l=0'],
  ['../', ''],
]) {
  const { document, article } = page({
    href: 'https://example.test/repo/learn/textbook/01-wavefunction/',
    config: JSON.stringify({ base: '../..' }),
    lab,
    figures: [[deepLink, '图']],
    labLinks: [''],
  })
  const figure = article.querySelector('figure.quviz-figure')
  const load = figure.querySelector('.quviz-figure__load')
  assert.equal(load.disabled, true, `${lab} ${deepLink}`)
  assert.equal(figure.querySelector('.quviz-figure__open').hidden, true)
  assert.equal(figure.getAttribute('data-quviz-state'), 'error')
  load.click()
  assert.equal(document.querySelectorAll('iframe').length, 0)
  if (lab === undefined || lab === '' || lab.startsWith('javascript')) {
    const anchor = article.querySelector('a[data-quviz-lab]')
    assert.equal(anchor.hidden, true)
    assert.equal(anchor.getAttribute('href'), null)
  }
}

// 4. Without Material's __config the page directory is the fallback root.
{
  const { window } = page({ href: 'https://example.test/a/b/page.html', lab: '../' })
  assert.equal(window.QuvizFigure.siteRootFrom('not json', 'https://example.test/a/b/page.html'), 'https://example.test/a/b/')
  assert.equal(window.QuvizFigure.labRoot('../', 'https://example.test/a/b/'), 'https://example.test/a/')
  assert.equal(window.QuvizFigure.labRoot('http://127.0.0.1:8000/#stale', 'https://example.test/'), 'http://127.0.0.1:8000/')
}

console.log('quviz-figure.js: ok')
"""


def test_quviz_figure_script_behaviour_in_a_fake_dom() -> None:
    node = shutil.which("node")
    assert node, "node is required to exercise docs/assets/javascripts/quviz-figure.js"
    run = subprocess.run(
        [node, "-"],
        input=HARNESS,
        env={**os.environ, "QUVIZ_FIGURE_JS": str(SCRIPT)},
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        timeout=60,
    )
    assert run.returncode == 0, run.stdout + run.stderr
    assert run.stdout.strip().splitlines()[-1] == "quviz-figure.js: ok", json.dumps(run.stdout)
```

In `tests/test_mkdocs_system.py`, inside `test_mathjax_and_mermaid_are_exactly_pinned_and_instant_navigation_aware`, change the pinned `scripts == [...]` list so that it ends with the new local script. Keep the CDN entries byte-identical; the test's intent is an exact pin of the runtime script set. Then add the new assertions at the end of that function, after `assert "window.mermaid.run({ nodes })" in mermaid`:

```python
    assert scripts == [
        "assets/javascripts/mathjax.js",
        "https://cdn.jsdelivr.net/npm/mathjax@3.2.2/es5/tex-mml-chtml.js",
        "https://cdn.jsdelivr.net/npm/mermaid@11.17.2/dist/mermaid.min.js",
        "assets/javascripts/mermaid.js",
        "assets/javascripts/quviz-figure.js",
    ]
```

```python
    figure = (DOCS / "assets/javascripts/quviz-figure.js").read_text(encoding="utf-8")
    assert "document$.subscribe(enhance)" in figure
    assert "window.QuvizFigure" in figure
```

- [ ] **Step 2: Run them and watch them fail.**

Run: `uv run --locked --group docs pytest tests/test_quviz_figure_js.py tests/test_mkdocs_system.py -q`
Expected: 2 failures.
- `test_quviz_figure_script_behaviour_in_a_fake_dom` fails because node reports `ENOENT: no such file or directory, open '…quviz-figure.js'`.
- `test_mathjax_and_mermaid_are_exactly_pinned_and_instant_navigation_aware` fails on the list comparison, which is missing `'assets/javascripts/quviz-figure.js'`.

- [ ] **Step 3: Create `docs/assets/javascripts/quviz-figure.js`:**

```js
/*
 * QuViz 教材交互图。
 *
 * Markdown 里的 <figure class="quviz-figure" data-lab="mode=..." markdown> 只携带深链接与图注。
 * 本脚本把它升级成占位卡：“加载交互图”在原位插入实验室 embed 模式的 iframe，
 * “在实验室中打开”在新标签页打开同一深链接。实验室根地址来自主题覆盖注入的
 * <meta name="quviz-lab">（mkdocs.yml 的 extra.quviz.lab_url），相对教材站点根解析。
 */
;(function () {
  'use strict'

  var READY = 'data-quviz-ready'
  var ACTIVE = 'data-quviz-active'
  // allow-popups*：embed 模式里的“在实验室中打开”是 target=_blank 链接，没有它会被沙箱吞掉。
  var SANDBOX = 'allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox'

  function siteRootFrom(configText, pageHref) {
    try {
      var base = JSON.parse(configText).base
      if (typeof base === 'string') return new URL(base, pageHref).href
    } catch (error) {
      // 没有 Material 的 __config（测试或非 Material 页面）时退回页面所在目录。
    }
    return new URL('./', pageHref).href
  }

  function normalizeDeepLink(value) {
    var link = String(value == null ? '' : value).trim().replace(/^#/, '')
    if (/[\s#<>"']/.test(link)) return null
    if (/(^|&)embed=/.test(link)) return null
    return link
  }

  function labRoot(labSetting, siteRoot) {
    var setting = String(labSetting == null ? '' : labSetting).trim()
    if (setting === '') return null
    var lab
    try {
      lab = new URL(setting, siteRoot)
    } catch (error) {
      return null
    }
    if (lab.protocol !== 'http:' && lab.protocol !== 'https:') return null
    lab.hash = ''
    return lab.href
  }

  function labUrls(labSetting, siteRoot, deepLink) {
    var root = labRoot(labSetting, siteRoot)
    var link = normalizeDeepLink(deepLink)
    if (root === null || link === null || link === '') return null
    return { embed: root + '#embed=1&' + link, open: root + '#' + link }
  }

  function textOf(node) {
    return node ? node.textContent || '' : ''
  }

  // Material 的即时导航只替换文章容器，不会重新执行 extra_javascript；__config.base 是相对
  // 首次整页加载的那个页面写的，所以站点根只在脚本首次执行时解析一次。
  var SITE_ROOT = siteRootFrom(textOf(document.getElementById('__config')), window.location.href)

  function labSetting() {
    var meta = document.querySelector('meta[name="quviz-lab"]')
    return meta ? meta.getAttribute('content') : null
  }

  function element(tag, className, text) {
    var node = document.createElement(tag)
    if (className) node.className = className
    if (text) node.textContent = text
    return node
  }

  function unload(figure) {
    var stage = figure.querySelector('.quviz-figure__stage')
    if (!stage) return
    var frame = stage.querySelector('.quviz-figure__frame')
    var close = stage.querySelector('.quviz-figure__close')
    if (frame) stage.removeChild(frame)
    if (close) stage.removeChild(close)
    var placeholder = stage.querySelector('.quviz-figure__placeholder')
    if (placeholder) placeholder.hidden = false
    figure.removeAttribute(ACTIVE)
  }

  function load(figure, urls, caption) {
    var active = document.querySelectorAll('figure.quviz-figure[' + ACTIVE + ']')
    for (var i = 0; i < active.length; i += 1) {
      if (active[i] !== figure) unload(active[i])
    }
    var stage = figure.querySelector('.quviz-figure__stage')
    if (!stage || figure.hasAttribute(ACTIVE)) return
    var frame = element('iframe', 'quviz-figure__frame')
    frame.setAttribute('src', urls.embed)
    frame.setAttribute('title', 'QuViz 交互图：' + caption)
    frame.setAttribute('loading', 'lazy')
    frame.setAttribute('sandbox', SANDBOX)
    frame.setAttribute('allow', 'fullscreen')
    frame.setAttribute('allowfullscreen', '')
    frame.setAttribute('referrerpolicy', 'no-referrer')
    var close = element('button', 'quviz-figure__close', '关闭交互图')
    close.setAttribute('type', 'button')
    close.addEventListener('click', function () {
      unload(figure)
    })
    stage.querySelector('.quviz-figure__placeholder').hidden = true
    stage.appendChild(frame)
    stage.appendChild(close)
    figure.setAttribute(ACTIVE, '')
  }

  function enhanceFigure(figure, setting) {
    if (figure.hasAttribute(READY)) return
    figure.setAttribute(READY, '')
    var caption = textOf(figure).replace(/\s+/g, ' ').trim().slice(0, 80)
    var urls = labUrls(setting, SITE_ROOT, figure.getAttribute('data-lab'))
    var stage = element('div', 'quviz-figure__stage')
    var placeholder = element('div', 'quviz-figure__placeholder')
    var actions = element('div', 'quviz-figure__actions')
    var button = element('button', 'quviz-figure__load md-button md-button--primary', '加载交互图')
    var link = element('a', 'quviz-figure__open md-button', '在实验室中打开')
    var note = element('p', 'quviz-figure__note')
    button.setAttribute('type', 'button')
    if (urls) {
      link.setAttribute('href', urls.open)
      link.setAttribute('target', '_blank')
      link.setAttribute('rel', 'noopener')
      button.addEventListener('click', function () {
        load(figure, urls, caption)
      })
      note.textContent = '点击后才加载实验室（需要 WebGL）；同一页面同时只运行一个交互图。'
    } else {
      button.disabled = true
      link.hidden = true
      figure.setAttribute('data-quviz-state', 'error')
      note.textContent = '无法确定实验室地址或深链接无效（extra.quviz.lab_url / data-lab），交互图不可用。'
    }
    placeholder.appendChild(element('span', 'quviz-figure__badge', '交互图 · WebGL'))
    actions.appendChild(button)
    actions.appendChild(link)
    placeholder.appendChild(actions)
    placeholder.appendChild(note)
    stage.appendChild(placeholder)
    figure.insertBefore(stage, figure.firstChild)
  }

  function enhanceLabLink(anchor, setting) {
    if (anchor.hasAttribute(READY)) return
    anchor.setAttribute(READY, '')
    var root = labRoot(setting, SITE_ROOT)
    var link = normalizeDeepLink(anchor.getAttribute('data-quviz-lab'))
    if (root === null || link === null) return
    anchor.setAttribute('href', link === '' ? root : root + '#' + link)
    anchor.hidden = false
  }

  function enhance() {
    var setting = labSetting()
    var figures = document.querySelectorAll('figure.quviz-figure')
    for (var i = 0; i < figures.length; i += 1) enhanceFigure(figures[i], setting)
    var anchors = document.querySelectorAll('a[data-quviz-lab]')
    for (var j = 0; j < anchors.length; j += 1) enhanceLabLink(anchors[j], setting)
  }

  window.QuvizFigure = { siteRootFrom: siteRootFrom, labRoot: labRoot, labUrls: labUrls, enhance: enhance }

  // document$ 在首次加载和每次 Material 即时导航换页后各发出一次。
  if (typeof document$ !== 'undefined') {
    document$.subscribe(enhance)
  } else if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', enhance)
  } else {
    enhance()
  }
})()
```

Append to the `extra_javascript` list in `mkdocs.yml`, directly after `- assets/javascripts/mermaid.js`:

```yaml
  - assets/javascripts/quviz-figure.js
```

- [ ] **Step 4: Append the figure-card CSS** to the end of `docs/assets/stylesheets/extra.css`:

```css
/* 教材交互图：quviz-figure.js 生成的占位卡。舞台始终是实验室的深色，与配色方案无关。 */
.md-typeset .quviz-figure {
  display: block;
  width: 100%;
  max-width: 100%;
  margin: 1.6em 0;
  border: 1px solid var(--qv-line);
  border-radius: var(--qv-radius-panel);
  background-color: var(--qv-card-bg);
  box-shadow: var(--qv-glow);
  overflow: hidden;
}

.md-typeset .quviz-figure > p {
  margin: 0;
  padding: 0.9rem 1.2rem 1.1rem;
  color: var(--md-default-fg-color--light);
  font-size: 0.72rem;
  line-height: 1.6;
  text-align: left;
}

.md-typeset .quviz-figure > p strong {
  color: var(--md-default-fg-color);
}

.quviz-figure__stage {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  aspect-ratio: 16 / 10;
  min-height: 12rem;
  border-bottom: 1px solid var(--qv-line);
  background:
    radial-gradient(circle at 50% 45%, rgba(138, 180, 248, 0.1), transparent 60%),
    #111316;
}

.quviz-figure__placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.8rem;
  max-width: 30rem;
  padding: 1.2rem;
  text-align: center;
}

.quviz-figure__badge {
  padding: 2px 8px;
  border: 1px solid var(--qv-border-strong);
  border-radius: var(--qv-radius-tag);
  color: var(--qv-text-2);
  font-size: 0.6rem;
  font-weight: 500;
  letter-spacing: 0.04em;
}

.quviz-figure__actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 0.6rem;
}

.md-typeset .quviz-figure__actions .md-button {
  margin: 0;
}

.md-typeset .quviz-figure__open,
.md-typeset .quviz-figure__open:is(:hover, :focus-visible) {
  border-color: var(--qv-border-strong);
  color: var(--qv-text);
}

.md-typeset .quviz-figure__note {
  margin: 0;
  color: var(--qv-text-3);
  font-size: 0.62rem;
}

.md-typeset .quviz-figure[data-quviz-state="error"] .quviz-figure__note {
  color: var(--qv-warn);
}

.quviz-figure__frame {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  border: 0;
  background-color: var(--qv-bg);
}

.quviz-figure__close {
  position: absolute;
  top: 0.6rem;
  right: 0.6rem;
  z-index: 1;
  padding: 0.3rem 0.9rem;
  border: 1px solid var(--qv-border-strong);
  border-radius: var(--qv-radius-pill);
  background-color: var(--qv-glass);
  color: var(--qv-text);
  font: inherit;
  font-size: 0.62rem;
  cursor: pointer;
  -webkit-backdrop-filter: var(--qv-blur);
  backdrop-filter: var(--qv-blur);
}

.quviz-figure__close:is(:hover, :focus-visible) {
  border-color: var(--qv-accent);
  box-shadow: var(--qv-glow);
}

/* .md-button 的 display 会盖过 UA 的 [hidden]，这里显式恢复隐藏语义。 */
.md-typeset .quviz-figure [hidden],
.md-typeset a[data-quviz-lab][hidden] {
  display: none !important;
}

@media screen and (max-width: 44.9375em) {
  .quviz-figure__stage {
    aspect-ratio: 4 / 5;
  }
}
```

Insert this bullet in `docs/reference/quality-gates.md` immediately before line 130 (`- 🔗 MkDocs 在真实 Chromium 中完成渲染 …`):

```markdown
- ✅ 教材交互图脚本 — `tests/test_quviz_figure_js.py` 在 Node 中用最小假 DOM 执行真实的 `docs/assets/javascripts/quviz-figure.js`，逐条检查以下行为：
  - `extra.quviz.lab_url` 相对教材站点根（Material `__config.base`，只在首次整页加载时解析）而不是相对当前页解析；
  - 点击前不产生任何 iframe；iframe 带 `loading="lazy"`、`sandbox`、`allow="fullscreen"` 与图注标题；
  - 同一页只保留一个活动交互图；`document$` 重复触发不会重复升级；
  - 缺失 meta、非 http(s) 地址或带 `embed=` 的深链接一律禁用按钮并显示原因。
```

- [ ] **Step 5: Run and see them pass.**

Run: `uv run --locked --group docs pytest tests/test_quviz_figure_js.py tests/test_mkdocs_system.py tests/test_docs_integrity.py -q`
Expected: all passed.
Run: `uv run --locked --group docs mkdocs build --strict && grep -c "quviz-figure.js" site/index.html` *(bash)*
Expected: exit 0, then `1`.
Run: `uv run --locked ruff check tests/test_quviz_figure_js.py tests/test_mkdocs_system.py && uv run --locked ruff format --check tests/test_quviz_figure_js.py tests/test_mkdocs_system.py`
Expected: `All checks passed!` and `2 files already formatted`. If format reports a diff, run `uv run --locked ruff format` on those two files and re-run.

Planning ran a mutation check on this exact harness. Each of the following three edits to the script made the harness fail:
- resolving `lab_url` against the page instead of `__config.base`;
- dropping the one-active-figure unload;
- dropping the `data-quviz-ready` guard.

- [ ] **Step 6: Pre-commit gate, then commit.** This commit changes `tests/test_quviz_figure_js.py` and `tests/test_mkdocs_system.py`, so the full Python gate runs first (CLAUDE.md, spec §6).

Run: `uv run --locked --group docs pytest --cov=quviz --cov-report=term-missing`
Expected: exit 0. The summary line reports only `passed`, with no `failed`, `error`, `skipped`, `xfailed` or `xpassed`, and the output contains `Required test coverage of 85% reached.` If anything is red, fix it and re-run this step; do not commit.
Run: `uv run --locked ruff check tests/test_quviz_figure_js.py tests/test_mkdocs_system.py && uv run --locked ruff format --check tests/test_quviz_figure_js.py tests/test_mkdocs_system.py`
Expected: `All checks passed!` and `2 files already formatted`.

```bash
git add docs/assets/javascripts/quviz-figure.js tests/test_quviz_figure_js.py mkdocs.yml tests/test_mkdocs_system.py docs/assets/stylesheets/extra.css docs/reference/quality-gates.md
git commit -m "feat(docs): click-to-load lab figures resolved against the textbook root" -m "Claude-Session: https://claude.ai/code/session_01E44DEzsc7Av26fc7nZ5rSo"
```

---

### Task C5: Textbook contract gate — deep-link validator and chapter registry

**Files:**
- Create: `tests/test_textbook.py`
- Modify: `docs/reference/quality-gates.md` (one bullet before the `- 🔗 MkDocs 在真实 Chromium 中完成渲染` bullet)

**Interfaces:**
- Consumes:
  - the deep-link grammar of contracts `src/state/urlState.ts`: key order `embed,mode,n,l,m,z,basis,preset,t,rep,plane,obs`, values `RepresentationKind`, `PrincipalPlane`, `SliceObservable` and `BasisKind`;
  - the static catalogue of contracts `spec.json`: eigenstates `n_max: 4`, `bases: ["real", "complex"]`, 4 representations, 3 planes, 4 observables; superposition `presets`, representations `isosurface/slice/streamlines`, `planes: ["xz"]`, `"frames": "playback-lattice"`;
  - `quviz.api.routes.superposition_catalog()` (`src/quviz/api/routes.py:574-607`) for preset ids and `period_au`;
  - `nextTimeAu` (`web/src/components/sceneRequest.ts:177-194`) for the frame lattice.
- Produces, for Tasks C7–C14:
  - `deep_link_problems(deep_link: str) -> list[str]`, `playback_frames(period_au: float) -> tuple[float, ...]`, `js_number(value: float) -> str` and `figures_in(text: str) -> list[tuple[dict[str, str | None], str]]`;
  - `class Chapter(NamedTuple): sections: tuple[str, ...]; figures: tuple[str, ...]` and the registry `CHAPTERS: dict[str, Chapter]` (initially empty; every chapter task adds entries).

- [ ] **Step 1: Create `tests/test_textbook.py`** with exactly this content (it is `ruff format`-clean):

```python
"""Contracts for the learner textbook under ``docs/textbook/``.

Every chapter embeds the lab through
``<figure class="quviz-figure" data-lab="<deep link>" markdown>``. On GitHub
Pages the lab has no backend and can show only what the static catalogue
precomputed (``design/plans/2026-09-25-contracts.md``, ``spec.json``). That
catalogue holds every eigenstate with ``n <= 4`` in both bases, plus the four
server superposition presets on their playback frames. A figure outside it
would show every reader "未预计算", so each ``data-lab`` is checked here in two
ways: against the lab's deep-link grammar (key order
``embed,mode,n,l,m,z,basis,preset,t,rep,plane,obs``,
``web/src/state/urlState.ts``) and against the catalogue content.

``CHAPTERS`` is the registry the textbook tasks fill in. It records the exact
level-2 section ids and figure deep links of each page, so a chapter cannot
silently lose a figure, change a deep-link anchor or drift from the plan.
"""

from __future__ import annotations

import math
import re
from functools import cache
from html.parser import HTMLParser
from pathlib import Path
from typing import NamedTuple

from quviz.api.routes import superposition_catalog

ROOT = Path(__file__).resolve().parents[1]
TEXTBOOK = ROOT / "docs" / "textbook"

DEEP_LINK_KEY_ORDER = (
    "embed",
    "mode",
    "n",
    "l",
    "m",
    "z",
    "basis",
    "preset",
    "t",
    "rep",
    "plane",
    "obs",
)
OBSERVABLES = ("probability_density", "wavefunction_real", "wavefunction_imag", "phase")
EIGEN_N_MAX = 4
EIGEN_BASES = ("real", "complex")
EIGEN_REPRESENTATIONS = ("point_cloud", "isosurface", "slice", "streamlines")
EIGEN_PLANES = ("xy", "xz", "yz")
SUPERPOSITION_REPRESENTATIONS = ("isosurface", "slice", "streamlines")
SUPERPOSITION_PLANES = ("xz",)
# nextTimeAu in web/src/components/sceneRequest.ts: ceil(T / 0.6) frames per
# period, each snapped to the 0.2 a.u. time lattice (capability.ts).
TARGET_TIME_STEP_AU = 0.6
TIME_GRID_STEP_AU = 0.2
# Measured 2026-09-25: GET /api/superposition/isosurface for 2s-2pz at the
# UI's probability_mass 0.9 answers 422 (topology does not converge before
# the grid cap). A figure must not advertise a precomputed refusal.
KNOWN_REFUSED = frozenset({("2s-2pz", "isosurface")})


class Chapter(NamedTuple):
    sections: tuple[str, ...]
    figures: tuple[str, ...]


#: file name -> exact level-2 heading ids and figure deep links, in page order.
CHAPTERS: dict[str, Chapter] = {}


def js_number(value: float) -> str:
    """How ``String(number)`` spells a lattice time in JavaScript."""

    return str(int(value)) if float(value).is_integer() else repr(float(value))


def playback_frames(period_au: float) -> tuple[float, ...]:
    if not math.isfinite(period_au) or period_au <= 0:
        return (0.0,)
    frames = max(1, math.ceil(period_au / TARGET_TIME_STEP_AU))
    return tuple(
        round(math.floor(k * period_au / frames / TIME_GRID_STEP_AU + 0.5) * TIME_GRID_STEP_AU, 12)
        for k in range(frames)
    )


@cache
def superposition_periods() -> dict[str, float]:
    return {str(entry["id"]): float(entry["period_au"]) for entry in superposition_catalog()}


def _integer(value: str) -> int | None:
    return int(value) if re.fullmatch(r"-?(0|[1-9][0-9]*)", value) else None


def deep_link_problems(deep_link: str) -> list[str]:
    """Why ``deep_link`` is not a precomputed textbook state; empty when it is."""

    if not deep_link or deep_link.startswith("#"):
        return ["the deep link must be non-empty and carry no leading '#'"]
    pairs: list[tuple[str, str]] = []
    for part in deep_link.split("&"):
        key, sep, value = part.partition("=")
        if not sep or not key or not value:
            return [f"malformed pair {part!r}"]
        pairs.append((key, value))
    keys = [key for key, _ in pairs]
    problems: list[str] = []
    if len(set(keys)) != len(keys):
        problems.append(f"duplicate keys in {keys}")
    unknown = [key for key in keys if key not in DEEP_LINK_KEY_ORDER]
    if unknown:
        return [*problems, f"unknown keys {unknown}"]
    if keys != sorted(keys, key=DEEP_LINK_KEY_ORDER.index):
        problems.append(f"keys {keys} are not in the lab's serialisation order")
    if "embed" in keys:
        problems.append("embed=1 is added by quviz-figure.js; a figure must not carry it")
    if "z" in keys:
        problems.append("the static catalogue fixes Z = 1; do not spell z")
    state = dict(pairs)
    mode = state.get("mode")
    rep = state.get("rep")
    if mode == "eigenstate":
        problems.extend(_eigenstate_problems(state, rep))
    elif mode == "superposition":
        problems.extend(_superposition_problems(state, rep))
    else:
        problems.append(f"mode must be eigenstate or superposition, not {mode!r}")
    return problems


def _eigenstate_problems(state: dict[str, str], rep: str | None) -> list[str]:
    problems: list[str] = []
    for key in ("preset", "t"):
        if key in state:
            problems.append(f"{key} belongs to superposition figures")
    n, l, m = (_integer(state.get(key, "")) for key in ("n", "l", "m"))
    if n is None or l is None or m is None:
        return [*problems, "eigenstate figures spell integer n, l and m"]
    if not (1 <= n <= EIGEN_N_MAX and 0 <= l < n and -l <= m <= l):
        problems.append(f"(n, l, m) = ({n}, {l}, {m}) is not a precomputed eigenstate (n <= 4)")
    basis = state.get("basis")
    if basis not in EIGEN_BASES:
        problems.append(f"basis must be one of {EIGEN_BASES}, not {basis!r}")
    if rep not in EIGEN_REPRESENTATIONS:
        problems.append(f"rep must be one of {EIGEN_REPRESENTATIONS}, not {rep!r}")
    problems.extend(_slice_problems(state, rep, EIGEN_PLANES))
    if rep == "streamlines" and (basis != "complex" or m == 0):
        problems.append("only complex-basis m != 0 eigenstates carry a probability current")
    return problems


def _superposition_problems(state: dict[str, str], rep: str | None) -> list[str]:
    problems: list[str] = []
    for key in ("n", "l", "m", "basis"):
        if key in state:
            problems.append(f"{key} belongs to eigenstate figures")
    preset = state.get("preset")
    periods = superposition_periods()
    if preset not in periods:
        return [*problems, f"preset must be one of {sorted(periods)}, not {preset!r}"]
    raw_time = state.get("t")
    frames = playback_frames(periods[preset])
    try:
        time = float(raw_time) if raw_time is not None else math.nan
    except ValueError:
        time = math.nan
    if not any(abs(time - frame) < 1e-9 for frame in frames):
        problems.append(f"t={raw_time!r} is not a playback frame of {preset}: {frames}")
    elif raw_time != js_number(time):
        problems.append(f"t={raw_time!r} must be spelled {js_number(time)!r} like the lab")
    if rep not in SUPERPOSITION_REPRESENTATIONS:
        problems.append(f"rep must be one of {SUPERPOSITION_REPRESENTATIONS}, not {rep!r}")
    problems.extend(_slice_problems(state, rep, SUPERPOSITION_PLANES))
    if (preset, rep) in KNOWN_REFUSED:
        problems.append(f"{preset} {rep} is a known server refusal at the catalogue defaults")
    if rep == "streamlines" and (periods[preset] <= 0 or time == 0):
        problems.append("streamlines need an oscillating preset at t != 0 (otherwise j = 0)")
    return problems


def _slice_problems(state: dict[str, str], rep: str | None, planes: tuple[str, ...]) -> list[str]:
    plane, obs = state.get("plane"), state.get("obs")
    if rep != "slice":
        return ["plane/obs only belong to slice figures"] if plane or obs else []
    problems = []
    if plane not in planes:
        problems.append(f"plane must be one of {planes}, not {plane!r}")
    if obs not in OBSERVABLES:
        problems.append(f"obs must be one of {OBSERVABLES}, not {obs!r}")
    return problems


class _StartTag(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.attrs: dict[str, str | None] = {}

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        self.attrs = dict(attrs)


FIGURE_BLOCK = re.compile(r"(?P<tag><figure\b[^>]*>)(?P<body>.*?)</figure>", re.DOTALL)
HEADING = re.compile(r"^## .*?\{#(?P<id>[a-z0-9]+(?:-[a-z0-9]+)*)\}\s*$")
QUESTION = re.compile(r'^\?\?\? question "[^"“”]+"\s*$', re.MULTILINE)
DEVELOPER_JARGON = re.compile(r"/api/|tests/|web/src|\bPR-\d|Phase 0")
LEARNER_TAIL = ("misconceptions", "exercises", "further-reading")


def figures_in(text: str) -> list[tuple[dict[str, str | None], str]]:
    found = []
    for match in FIGURE_BLOCK.finditer(text):
        parser = _StartTag()
        parser.feed(match.group("tag"))
        parser.close()
        found.append((parser.attrs, match.group("body").strip()))
    return found


def _chapter_number(name: str) -> int | None:
    return int(name[:2]) if name[:2].isdigit() else None


def _figure_label(name: str) -> str | None:
    """The ``N`` of ``**图 N.k**``: the chapter number or the appendix letter."""

    number = _chapter_number(name)
    if number is not None:
        return str(number)
    appendix = re.fullmatch(r"appendix-([a-z])-[a-z0-9-]+\.md", name)
    return appendix.group(1).upper() if appendix else None


def _level_two_ids(name: str, text: str) -> tuple[list[str], list[str]]:
    ids: list[str] = []
    problems: list[str] = []
    for line in text.splitlines():
        if line.startswith("## "):
            match = HEADING.match(line)
            if match is None:
                problems.append(f"{name}: level-2 heading without an explicit ASCII id: {line!r}")
            else:
                ids.append(match.group("id"))
    return ids, problems


def test_playback_frames_mirror_the_lab_lattice() -> None:
    periods = superposition_periods()
    bohr = playback_frames(periods["1s-2pz"])
    assert len(bohr) == 28
    assert bohr[:3] == (0.0, 0.6, 1.2)
    assert bohr[14] == 8.4
    assert bohr[-1] == 16.2
    quadrupole = playback_frames(periods["1s-3dz2"])
    assert len(quadrupole) == 24
    assert quadrupole[9:11] == (5.4, 5.8)
    assert quadrupole[-1] == 13.6
    assert playback_frames(periods["2s-2pz"]) == (0.0,)
    assert playback_frames(periods["2pplus-2pminus"]) == (0.0,)
    assert [js_number(t) for t in (0.0, 3.0, 8.4, 12.0)] == ["0", "3", "8.4", "12"]


def test_deep_link_validator_accepts_catalogue_states_and_rejects_the_rest() -> None:
    valid = (
        "mode=eigenstate&n=2&l=1&m=0&basis=real&rep=point_cloud",
        "mode=eigenstate&n=4&l=3&m=-3&basis=complex&rep=isosurface",
        "mode=eigenstate&n=2&l=1&m=-1&basis=complex&rep=slice&plane=xy&obs=phase",
        "mode=eigenstate&n=3&l=2&m=2&basis=complex&rep=streamlines",
        "mode=superposition&preset=1s-2pz&t=8.4&rep=slice&plane=xz&obs=probability_density",
        "mode=superposition&preset=1s-2pz&t=4.2&rep=streamlines",
        "mode=superposition&preset=1s-3dz2&t=7&rep=isosurface",
        "mode=superposition&preset=2s-2pz&t=0&rep=slice&plane=xz&obs=wavefunction_real",
    )
    for deep_link in valid:
        assert deep_link_problems(deep_link) == [], deep_link
    invalid = (
        "",
        "#mode=eigenstate&n=1&l=0&m=0&basis=real&rep=point_cloud",
        "mode=eigenstate&n=1&l=0&m=0&basis=real&rep",
        "mode=eigenstate&n=5&l=0&m=0&basis=real&rep=point_cloud",
        "mode=eigenstate&n=2&l=2&m=0&basis=real&rep=point_cloud",
        "mode=eigenstate&n=2&l=1&m=2&basis=real&rep=point_cloud",
        "mode=eigenstate&n=2&l=1&m=0&basis=spherical&rep=point_cloud",
        "mode=eigenstate&n=2&l=1&m=0&basis=real&rep=volume",
        "mode=eigenstate&n=2&l=1&m=0&basis=real&rep=slice&plane=xz",
        "mode=eigenstate&n=2&l=1&m=0&basis=real&rep=isosurface&plane=xz",
        "mode=eigenstate&n=2&l=1&m=1&basis=real&rep=streamlines",
        "mode=eigenstate&n=2&l=1&m=0&basis=complex&rep=streamlines",
        "mode=eigenstate&n=1&l=0&m=0&z=1&basis=real&rep=point_cloud",
        "embed=1&mode=eigenstate&n=1&l=0&m=0&basis=real&rep=point_cloud",
        "n=1&mode=eigenstate&l=0&m=0&basis=real&rep=point_cloud",
        "mode=eigenstate&n=1&n=1&l=0&m=0&basis=real&rep=point_cloud",
        "mode=eigenstate&n=01&l=0&m=0&basis=real&rep=point_cloud",
        "mode=superposition&preset=1s-2p&t=0&rep=slice&plane=xz&obs=phase",
        "mode=superposition&preset=1s-2pz&t=3.5&rep=slice&plane=xz&obs=phase",
        "mode=superposition&preset=1s-2pz&t=3.0&rep=slice&plane=xz&obs=phase",
        "mode=superposition&preset=2s-2pz&t=0.6&rep=slice&plane=xz&obs=phase",
        "mode=superposition&preset=1s-2pz&t=0&rep=slice&plane=xy&obs=phase",
        "mode=superposition&preset=1s-2pz&t=0&rep=point_cloud",
        "mode=superposition&preset=2s-2pz&t=0&rep=isosurface",
        "mode=superposition&preset=1s-2pz&t=0&rep=streamlines",
        "mode=superposition&preset=2pplus-2pminus&t=0&rep=streamlines",
        "mode=superposition&preset=1s-2pz&basis=real&t=0&rep=isosurface",
        "mode=superposition&preset=1s-2pz&rep=isosurface",
        "mode=eigenstate&preset=1s-2pz&n=1&l=0&m=0&basis=real&rep=point_cloud",
        "mode=orbital&n=1&l=0&m=0&basis=real&rep=point_cloud",
    )
    for deep_link in invalid:
        assert deep_link_problems(deep_link), deep_link


def test_figures_in_reads_unescaped_attributes_and_the_caption() -> None:
    text = (
        '<figure class="quviz-figure" data-lab="mode=eigenstate&amp;n=1&l=0&m=0&basis=real'
        '&rep=point_cloud" markdown>\n**图 1.1** 正文\n</figure>'
    )
    [(attrs, body)] = figures_in(text)
    assert attrs["class"] == "quviz-figure"
    assert "markdown" in attrs
    assert attrs["data-lab"] == "mode=eigenstate&n=1&l=0&m=0&basis=real&rep=point_cloud"
    assert body == "**图 1.1** 正文"


def test_every_textbook_figure_is_a_precomputed_state() -> None:
    problems: list[str] = []
    for path in sorted(TEXTBOOK.glob("*.md")):
        for index, (attrs, caption) in enumerate(figures_in(path.read_text(encoding="utf-8")), 1):
            where = f"{path.name} figure {index}"
            if "quviz-figure" not in (attrs.get("class") or "").split():
                problems.append(f"{where}: class must include quviz-figure")
            if "markdown" not in attrs:
                problems.append(f"{where}: needs the markdown attribute so its caption renders")
            if not caption:
                problems.append(f"{where}: empty caption")
            problems.extend(
                f"{where}: {p}" for p in deep_link_problems(attrs.get("data-lab") or "")
            )
    assert problems == [], "\n".join(problems)


def test_textbook_pages_are_exactly_the_registered_chapters() -> None:
    present = {path.name for path in TEXTBOOK.glob("*.md")}
    assert present == {"index.md", *CHAPTERS}


def test_registered_chapters_match_their_sections_and_figures() -> None:
    problems: list[str] = []
    for name, chapter in CHAPTERS.items():
        text = (TEXTBOOK / name).read_text(encoding="utf-8")
        ids, heading_problems = _level_two_ids(name, text)
        problems.extend(heading_problems)
        if tuple(ids) != chapter.sections:
            problems.append(f"{name}: sections {tuple(ids)} != registered {chapter.sections}")
        figures = figures_in(text)
        links = tuple(attrs.get("data-lab") or "" for attrs, _ in figures)
        if links != chapter.figures:
            problems.append(f"{name}: figures {links} != registered {chapter.figures}")
        # Spec §1 success criterion 2: every page, appendices included, embeds the lab.
        if not chapter.figures:
            problems.append(f"{name}: every textbook page needs at least one interactive figure")
        label = _figure_label(name)
        if label is None:
            problems.append(f"{name}: name chapters NN-*.md and appendices appendix-<letter>-*.md")
        for index, (_, caption) in enumerate(figures, 1):
            expected = f"**图 {label}.{index}**"
            if not caption.startswith(expected):
                problems.append(f"{name}: figure {index} caption must start with {expected!r}")
    assert problems == [], "\n".join(problems)


def test_numbered_chapters_follow_the_learner_template() -> None:
    problems: list[str] = []
    for name, chapter in CHAPTERS.items():
        if _chapter_number(name) is None:
            continue
        text = (TEXTBOOK / name).read_text(encoding="utf-8")
        if chapter.sections[:1] != ("goals",) or chapter.sections[-3:] != LEARNER_TAIL:
            problems.append(f"{name}: sections must start with goals and end with {LEARNER_TAIL}")
        exercises = text.partition("{#exercises}")[2].partition("{#further-reading}")[0]
        if len(QUESTION.findall(exercises)) < 3:
            problems.append(f"{name}: needs at least three '??? question' blocks under exercises")
        for line in text.splitlines():
            if line.startswith("???") and ("“" in line or "”" in line):
                problems.append(f"{name}: typographic quotes in a ??? title: {line!r}")
        if "[@" not in text:
            problems.append(f"{name}: cites nothing")
        if match := DEVELOPER_JARGON.search(text):
            problems.append(f"{name}: developer jargon {match.group(0)!r} on a learner page")
    assert problems == [], "\n".join(problems)


def test_textbook_index_links_every_chapter_in_order() -> None:
    index = (TEXTBOOK / "index.md").read_text(encoding="utf-8")
    positions = [index.find(f"]({name})") for name in CHAPTERS]
    assert all(position >= 0 for position in positions), dict(zip(CHAPTERS, positions, strict=True))
    assert positions == sorted(positions)
```

- [ ] **Step 2: Prove the gate is red on a bad figure (negative control).** Temporarily append these three lines, with a blank line before them, to `docs/textbook/index.md`:

```markdown
<figure class="quviz-figure" data-lab="mode=eigenstate&n=5&l=0&m=0&basis=real&rep=point_cloud" markdown>
临时负对照
</figure>
```

Run: `uv run --locked --group docs pytest tests/test_textbook.py -q`
Expected: 1 failed, 7 passed. The failure is `test_every_textbook_figure_is_a_precomputed_state` with `index.md figure 1: (n, l, m) = (5, 0, 0) is not a precomputed eigenstate (n <= 4)`. Then delete the three temporary lines, and the blank line added before them, so that `git diff docs/textbook/index.md` is empty.

Planning also ran each of these against a scratch textbook, and every one turned the suite red:
- a spaced id `{ #born-rule }`;
- an `n=5` figure;
- a caption without `**图 1.1**`;
- only two `??? question` blocks;
- the text `Phase 0` on a chapter;
- chapters listed out of order in the index;
- an unregistered `02-extra.md`.

- [ ] **Step 3: Insert the gate description** in `docs/reference/quality-gates.md`, directly after the bullet added in Task C4 and before `- 🔗 MkDocs 在真实 Chromium 中完成渲染`:

```markdown
- ✅ 教材章节契约 — `tests/test_textbook.py` 对 `docs/textbook/` 做两类检查：
  - 每个 `quviz-figure` 的 `data-lab` 必须同时满足实验室深链接语法，并落在静态预计算目录之内：
    - 本征态 $n\le4$，量子数合法；
    - 叠加态只用服务端目录的四个预设，时刻必须是与 `nextTimeAu` 相同的播放帧，并按 JavaScript 的数字写法拼写；
    - 流线只用于复基 $m\ne0$ 的本征态，或 $t\ne0$ 时的振荡叠加态；
    - 已知会被服务端拒绝的组合不得入图。
  - 每章的二级标题 id 与图的深链接必须和注册表逐字一致；每一页（含附录）至少一张交互图，图注以“图 章号.序号”（附录用字母）开头；编号章节必须包含学习目标、常见误区、至少 3 道带答案的思考题与延伸阅读，且不得出现 `/api/`、测试路径等开发者术语。
```

- [ ] **Step 4: Run and see it pass.**

Run: `uv run --locked --group docs pytest tests/test_textbook.py tests/test_docs_integrity.py -q`
Expected: all passed (8 in `test_textbook.py`).
Run: `uv run --locked ruff check tests/test_textbook.py && uv run --locked ruff format --check tests/test_textbook.py`
Expected: `All checks passed!` and `1 file already formatted`.

- [ ] **Step 5: Pre-commit gate, then commit.** This commit changes `tests/test_textbook.py`, so the full Python gate runs first (CLAUDE.md, spec §6).

Run: `uv run --locked --group docs pytest --cov=quviz --cov-report=term-missing`
Expected: exit 0. The summary line reports only `passed`, with no `failed`, `error`, `skipped`, `xfailed` or `xpassed`, and the output contains `Required test coverage of 85% reached.` If anything is red, fix it and re-run this step; do not commit.
Run: `uv run --locked ruff check tests/test_textbook.py && uv run --locked ruff format --check tests/test_textbook.py`
Expected: `All checks passed!` and `1 file already formatted`.

```bash
git add tests/test_textbook.py docs/reference/quality-gates.md
git commit -m "test(docs): gate textbook figures on the static catalogue and the chapter registry" -m "Claude-Session: https://claude.ai/code/session_01E44DEzsc7Av26fc7nZ5rSo"
```

---

### Task C6: Home page as the textbook landing

**Files:**
- Modify: `docs/index.md:1-15` (hero) and `docs/index.md:54-63` (the `## 从哪里开始` list)
- Test: `tests/test_docs_integrity.py` (new test after line 283)

**Interfaces:**
- Consumes: `a[data-quviz-lab]` handling (Task C4) and the `.hero`/`.quviz-pill` CSS (Task C3).
- Produces: the home-page entry points `开始学习` → `textbook/index.md` and `打开实验室` → the lab root (the href is filled in by JavaScript).

The home page keeps every target that `web/fullstack-e2e/app.spec.ts:260-316` and `tests/test_docs_integrity.py:270-283` rely on:
- the display math at lines 21-34;
- the citation `[@react-three-fiber; @threejs]` at line 52, which is the first `.quviz-citation__link` on the page;
- the article link to `concepts/model-map.md`;
- the phrases `解析含时叠加态` and `平面切片` at line 40.

- [ ] **Step 1: Write the failing test** (insert after `test_capability_summaries_do_not_regress_to_pre_slice_status`, line 283):

```python
def test_home_page_leads_into_the_textbook_and_keeps_the_browser_smoke_targets() -> None:
    home = (ROOT / "docs/index.md").read_text(encoding="utf-8")

    assert '<span class="quviz-pill">教学预览</span>' in home
    assert "[开始学习](textbook/index.md){ .md-button .md-button--primary }" in home
    assert '<a class="md-button" data-quviz-lab="" hidden>打开实验室</a>' in home
    assert home.index("[教材](textbook/index.md)") < home.index("[Phase 0 交互工作流]")
    # web/fullstack-e2e/app.spec.ts:260-316 typesets display math on the home
    # page, follows an article link to the model map and clicks a citation.
    assert "$$" in home
    assert "(concepts/model-map.md)" in home
    assert "[@" in home
```

- [ ] **Step 2: Run it and watch it fail.**

Run: `uv run --locked --group docs pytest tests/test_docs_integrity.py -q`
Expected: FAIL in `test_home_page_leads_into_the_textbook_and_keeps_the_browser_smoke_targets` at the first assertion (`quviz-pill`).

- [ ] **Step 3: Replace `docs/index.md:1-15`** (the hero `div`) with:

```markdown
<div class="hero" markdown>

<span class="quviz-pill">教学预览</span>

# QuViz

**从薛定谔方程、波函数与概率流，到浏览器中的可信三维科学可视化。**

QuViz 是一本可以动手的氢原子量子力学教材：每章的交互图都是真实计算出的量子态，点开就能在三维实验室里
旋转、切片、播放时间演化。科学计算与前端渲染分开：Python 负责状态、observable、采样与验证；
React/Three.js 负责点云、等值面、相位和交互。任何图形都必须保留它所代表的物理量、
坐标约定、单位、归一化和来源键。

[开始学习](textbook/index.md){ .md-button .md-button--primary }
<a class="md-button" data-quviz-lab="" hidden>打开实验室</a>
[查看真实状态](project/status.md){ .md-button }

</div>
```

Then replace the list under `## 从哪里开始` (lines 56-63) with:

```markdown
- [教材](textbook/index.md)：按学习顺序讲氢原子的波函数、能级、径向分布、相位、概率流与含时叠加态，每章配交互图；
- [Phase 0 交互工作流](tutorials/phase-0-walkthrough.md)：在本地实时版实验室中复现点云、等密度面、切片、概率流与解析含时叠加态；
- [安装与启动](getting-started/installation.md)：从锁文件复现开发模式或单服务预览；
- [愿景与边界](project/vision.md)：长期问题域与不可混淆的概念；
- [当前状态](project/status.md)：逐项实现、验证与缺陷账本；
- [量子可视化模型地图](concepts/model-map.md)：维度、动力学、observable 和 representation；
- [HTTP API](reference/api.md) 与 [Python API](reference/physics-api.md)：端点契约和 Phase 0 公共模块；
- [用户提供资料审计](references/source-audit.md)：逐条材料判定；
- [开发路线图](project/roadmap.md)：按科学依赖关系排序的里程碑。
```

Lines 17-53 (goal, formula, principles, the `当前 Alpha 基线…` sentence, the browser-native section with its citation) stay byte-identical.

- [ ] **Step 4: Run and see it pass.**

Run: `uv run --locked --group docs pytest tests/test_docs_integrity.py tests/test_mkdocs_system.py -q`
Expected: all passed.
Run: `uv run --locked --group docs mkdocs build --strict && grep -o '<a class="md-button" data-quviz-lab="" hidden>' site/index.html` *(bash)*
Expected: exit 0 and one match. The raw anchor survives Markdown untouched; `quviz-figure.js` fills in its `href` at runtime.

- [ ] **Step 5: Pre-commit gate, then commit.** This commit changes `tests/test_docs_integrity.py`, so the full Python gate runs first (CLAUDE.md, spec §6).

Run: `uv run --locked --group docs pytest --cov=quviz --cov-report=term-missing`
Expected: exit 0. The summary line reports only `passed`, with no `failed`, `error`, `skipped`, `xfailed` or `xpassed`, and the output contains `Required test coverage of 85% reached.` If anything is red, fix it and re-run this step; do not commit.
Run: `uv run --locked ruff check tests/test_docs_integrity.py && uv run --locked ruff format --check tests/test_docs_integrity.py`
Expected: `All checks passed!` and `1 file already formatted`.

```bash
git add docs/index.md tests/test_docs_integrity.py
git commit -m "docs(home): lead the landing page into the textbook and the lab" -m "Claude-Session: https://claude.ai/code/session_01E44DEzsc7Av26fc7nZ5rSo"
```

---

## Chapter tasks — shared rules (C7–C14)

Every chapter task follows the same seven steps. The per-task text gives only what differs: registry entries, the chapter spec, nav lines, index rows and a physics self-check.

1. **Register first (failing test).** Add the task's entries at the end of the `CHAPTERS` dict literal in `tests/test_textbook.py`. For Task C7, this replaces `CHAPTERS: dict[str, Chapter] = {}` with a dict containing the two entries.
2. **Run and see it fail.** Run `uv run --locked --group docs pytest tests/test_textbook.py -q`. Expected: 4 failures, 4 passes.
   - `test_textbook_pages_are_exactly_the_registered_chapters` fails because the new files are missing from the set.
   - `test_registered_chapters_match_their_sections_and_figures` and `test_numbered_chapters_follow_the_learner_template` fail with `FileNotFoundError`. In Task C14 only the first of these two fails, because appendices skip the template test.
   - `test_textbook_index_links_every_chapter_in_order` fails because a position is `-1`.
3. **Write the chapter(s)** exactly to the chapter spec, as learner-facing Chinese prose (target length 120–220 Markdown lines per chapter).
   - The H1 is exactly as specified. Each `##` heading is written `## <中文标题> {#<id>}` in the listed order. Use no other `##` headings; `###` sub-headings are free and need no id.
   - Figures are placed in the section named in the spec, with exactly the given markup and caption. A caption may add sentences after the given one but may not change it.
   - Each misconception is written as `!!! warning "误区：<title>"` followed by an indented body.
   - Each exercise is written as `??? question "思考题 N.k：<question>"` followed by the indented answer.
   - **`!!!`/`???` titles never contain typographic quotes “ ”.** `tests/test_mkdocs_system.py:72-82` rejects them on `!!!` lines and the textbook gate rejects them on `???` lines. To quote a word inside a title, use corner brackets 「」. The spec's titles below already follow this rule.
   - Equations use `$…$`/`$$…$$`. In table rows, use `\lvert…\rvert`, never a raw `|`.
   - **Links may target only pages that already exist when the task runs**: earlier chapters and pre-existing docs. Refer to later chapters in plain text (“第 9 章”). Otherwise MkDocs strict fails.
   - Cite only the listed strings.
4. **Nav + index.** Insert the given nav lines under `教材` in `mkdocs.yml`, after the previous chapter's line (Task C7: directly after `- textbook/index.md`). Append the given rows at the end of the chapter table in `docs/textbook/index.md`.
5. **Run and see it pass:**
   - `uv run --locked --group docs pytest tests/test_textbook.py tests/test_mkdocs_system.py tests/test_docs_integrity.py tests/test_bibliography.py -q`: all passed;
   - `uv run --locked --group docs python scripts/render_reference_index.py --check`: exit 0, no unknown or orphan keys;
   - `uv run --locked --group docs mkdocs build --strict`: exit 0, no warnings.
6. **Physics self-check.** Run the task's recompute command, compare every number in the chapter with its output, and read the chapter once against the "Physics accuracy" bullets. This is the author's own check only. It does not replace the independent adversarial review of spec §7, which Task C15 runs on every chapter after all of them exist.
7. **Pre-commit gate, then commit.** Run the full Python gate (`uv run --locked --group docs pytest --cov=quviz --cov-report=term-missing`) and ruff on `tests/test_textbook.py`, exactly as spelled in the task's Step 7. Then commit the exact paths listed in the task.

---

### Task C7: Chapter 0 (how to use the book and the lab) and chapter 1 (wavefunction and Born rule)

**Files:**
- Create: `docs/textbook/00-how-to-use.md`, `docs/textbook/01-wavefunction.md`
- Modify: `tests/test_textbook.py` (the `CHAPTERS` literal), `mkdocs.yml` (under `教材`), `docs/textbook/index.md` (the `## 章节` section)

**Interfaces:**
- Consumes:
  - `deep_link_problems`/`CHAPTERS` (Task C5);
  - the figure markup (Task C4);
  - the "not precomputed" wording the lab can show:
    - Part D's refusal tag `未预计算`;
    - the Chinese reasons of Part B, all starting with `静态教材版` and ending with the shared hint `本地运行 quviz serve 可实时计算任意参数。`. They are contracts B `NOT_PRECOMPUTED_DETAIL` for a transport miss, plus `STATIC_MISS_REASON` and the per-limit reasons of the capability overlay, `design/plans/2026-09-25-part-b-web-data.md:3175-3254`.
    - No part fixes one canonical sentence, so the chapter quotes only the tag and the hint (Review Focus 5).
- Produces: the anchors `00-how-to-use.md#{goals,reading-path,lab-tour,figures,static-and-live,reading-rules,…}` and `01-wavefunction.md#{wavefunction,schrodinger-equation,born-rule,normalization,volume-element,global-phase,…}`. Task C19 uses the first figure of chapter 1.

- [ ] **Step 1: Register (failing test).** Replace `CHAPTERS: dict[str, Chapter] = {}` in `tests/test_textbook.py` with:

```python
CHAPTERS: dict[str, Chapter] = {
    "00-how-to-use.md": Chapter(
        sections=(
            "goals",
            "reading-path",
            "lab-tour",
            "figures",
            "static-and-live",
            "reading-rules",
            "misconceptions",
            "exercises",
            "further-reading",
        ),
        figures=("mode=eigenstate&n=2&l=1&m=0&basis=real&rep=point_cloud",),
    ),
    "01-wavefunction.md": Chapter(
        sections=(
            "goals",
            "wavefunction",
            "schrodinger-equation",
            "born-rule",
            "normalization",
            "volume-element",
            "global-phase",
            "misconceptions",
            "exercises",
            "further-reading",
        ),
        figures=(
            "mode=eigenstate&n=1&l=0&m=0&basis=real&rep=point_cloud",
            "mode=eigenstate&n=1&l=0&m=0&basis=real&rep=slice&plane=xz&obs=probability_density",
        ),
    ),
}
```

- [ ] **Step 2: Run and see it fail** (shared rule 2: 4 failures).

- [ ] **Step 3a: Write `docs/textbook/00-how-to-use.md`** to this spec.
  - **H1:** `# 第 0 章 如何使用本书与实验室`
  - **Opening (2–3 sentences):** this chapter introduces no new physics. It explains how the book and the lab work together, and what the lab on the public textbook site can and cannot show.
  - `## 学习目标 {#goals}`. Four bullets:
    - say which question each part of the book answers;
    - separate "量子态 / observable / representation" and know that the lab's controls follow these layers;
    - use "加载交互图" and "在实验室中打开";
    - know what the textbook-site lab can show and when to run `quviz serve` locally.
  - `## 阅读路线 {#reading-path}`.
    - Prerequisites: calculus, complex numbers, and "basis and unitary change of basis" from linear algebra.
    - Four stages, in plain text with no links to chapters:
      - 第 1–3 章 "态是什么" (wavefunction, quantum numbers, radial distribution);
      - 第 4–7 章 "怎样画出一个态" (basis choice, electron cloud, isosurface, plane slices);
      - 第 8–9 章 "概率怎样流动、何时随时间变化" (probability current, superpositions);
      - 第 10–11 章 "图与实验、化学的关系".
    - 附录 A collects misconceptions; 附录 B covers units, coordinates and the deep-link grammar.
  - `## 实验室导览 {#lab-tour}`. Describe the redesigned lab with the spec §4.4 names:
    - a full-screen canvas with the z axis pointing up and a neutral dark background; drag to rotate, scroll to zoom;
    - the top bar: QuViz and a "教学预览" pill, where the local live version shows "实时计算" instead; buttons 教材 · 复制链接 · 保存图像 · 指南 · GitHub;
    - the left 控制面板 with the groups 量子态 / 表示法 / 显示, collapsible into one round "调节" button;
    - the bottom 时间胶囊, whose three cases are: an eigenstate shows "定态 · $\lvert\psi\rvert^2$ 与 $t$ 无关"; an oscillating superposition shows step, play and frame number; a degenerate superposition shows "能量简并：密度不随时间变化";
    - the right 详情面板 with the tabs 概览 / 图表 / 场景契约 / 引用. The 图表 tab draws the radial distribution $P(r)$ and the energy ladder for eigenstates, and $\lvert c_k\rvert^2$ with the beat period for superpositions;
    - the top-right "查找量子态";
    - the bottom-right 图例胶囊. **Colour meaning comes only from the legend**;
    - the 指南 dialog;
    - on screens ≤ 820px, control and details panels become bottom drawers.
    - Place **Figure 0.1** at the end of this section:

```markdown
<figure class="quviz-figure" data-lab="mode=eigenstate&n=2&l=1&m=0&basis=real&rep=point_cloud" markdown>
**图 0.1** 实验室的默认场景：实基 $2p_z$ 态的电子云。拖动旋转、滚轮缩放，$z$ 轴朝上；点的颜色表示波函数相位（红为相位 0，青为相位 $\pi$），颜色含义一律以右下角的图例胶囊为准。
</figure>
```

  - `## 交互图怎么用 {#figures}`.
    - Each figure is a card with a caption and two buttons.
    - "加载交互图" runs the lab's embed mode inside the page. Embed mode keeps only the canvas, the legend pill, the time pill and a "在实验室中打开" link.
    - Only one figure per page runs at a time: loading another closes the previous one. "关闭交互图" releases it.
    - "在实验室中打开" opens the full lab in a new tab at the same state. The address-bar part after `#` (for example `#mode=eigenstate&n=2&l=1&m=0&basis=real&rep=point_cloud`) is the deep link; it can be copied and shared, and 附录 B lists its keys.
    - The lab needs WebGL. Without JavaScript the caption still reads as a normal figure caption.
  - `## 教材版与本地实时版 {#static-and-live}`.
    - The lab on the public site has no backend. It shows only a precomputed catalogue:
      - every eigenstate with $n\le4$ in the real and the complex basis at $Z=1$;
      - point clouds of 28,000 samples with seed 7;
      - isosurfaces enclosing 90 % probability, at each state's minimum legal grid;
      - slices on the xy, xz and yz planes for the four fields $\lvert\psi\rvert^2$, $\operatorname{Re}\psi$, $\operatorname{Im}\psi$ and $\arg\psi$;
      - probability-current streamlines for complex-basis $m\ne0$ states, with 48 seed lines;
      - the four superposition presets 1s + 2p_z, 2s + 2p_z, 1s + 3d_z², 2p(+1) + 2p(−1), with isosurfaces, streamlines and xz slices at their playback frames. The degenerate presets are stored at $t=0$ only.
    - Samples, seed, resolution, enclosed probability and $Z$ are read-only there.
    - A combination outside the catalogue is marked 「未预计算」. The lab gives a Chinese reason that names the limit it hit (for example $n\le4$ or $Z=1$) and ends with “本地运行 quviz serve 可实时计算任意参数。”. Quote only this closing sentence and the tag 「未预计算」, never one full reason sentence as "the" message. The reasons differ by limit (Review Focus 5).
    - When the server refused a combination at build time, its reason is displayed unchanged.
    - Locally, `quviz serve` computes any parameter inside the validated limits. Link [安装](../getting-started/installation.md).
  - `## 读图的三条规则 {#reading-rules}`. Restate the three principles of `docs/index.md:42-46` for learners:
    - physical object ≠ drawing: `probability_density` is an observable, an isosurface is a representation;
    - conventions are traceable: units bohr/hartree, basis, normalization and enclosed probability appear in the 场景契约 tab;
    - beauty never distorts: colours encode data, and the legend is the authority.
  - `## 常见误区 {#misconceptions}`. Three warnings:
    - "切换表示法会换一个量子态": no, only the drawing changes;
    - "显示「未预计算」说明这个态在物理上不存在": no, the catalogue simply does not cover it;
    - "颜色越亮说明电子或电荷越多": no, colour meaning depends on the representation and must be read from the legend; in the electron cloud, colour is the phase.
  - `## 思考题 {#exercises}`. Three questions:
    - **0.1** “把表示法从“电子云”切换到“等密度面”，量子态变了吗？” Answer: No. $n,\ell,m$ and the basis are unchanged. Only the drawing of the same $\lvert\psi\rvert^2$ changes: the point cloud shows density through the spatial crowding of random samples, and the isosurface draws the surface $\lvert\psi\rvert^2=c$ that encloses 90 % of the probability.
    - **0.2** “在教材版实验室里，为什么不能把点云样本数从 28,000 改成 50,000？” Answer: the site has no backend; every parameter combination is one precomputed response, and the catalogue fixes the sample count. Run `quviz serve` locally for other values.
    - **0.3** “为什么同一页面同时只保留一个交互图？” Answer: each figure is an independent lab page with its own WebGL context and GPU memory, and browsers limit how many WebGL contexts stay alive at once. Closing the old one before loading a new one keeps the browser from dropping contexts on its own. Do not state a number.
    - The question titles must use straight ASCII quotes around the `???` title, and Chinese corner quotes or no quotes inside. Write the titles as `??? question "思考题 0.1：把表示法从电子云切换到等密度面，量子态变了吗？"`, and similarly for the others.
  - `## 延伸阅读 {#further-reading}`:
    - [愿景与边界](../project/vision.md);
    - [量子可视化模型地图](../concepts/model-map.md);
    - a link with the text "本地实时版操作演练" (not the page title, which contains the banned token `Phase 0`) to `../tutorials/phase-0-walkthrough.md`;
    - one sentence saying that other orbital galleries and popular-science videos are good intuition entry points but not numerical evidence, with `[@orbitron; @minutephysics2021atoms; @science-asylum2020-orbitals]`.
  - **Draws on:** `docs/index.md:42-46`, `docs/project/vision.md:15-34`, `docs/tutorials/phase-0-walkthrough.md:11-24`, and spec §4.4 for the UI names.
  - **Citations (only these):** `[@orbitron; @minutephysics2021atoms; @science-asylum2020-orbitals]`.

- [ ] **Step 3b: Write `docs/textbook/01-wavefunction.md`** to this spec.
  - **H1:** `# 第 1 章 波函数与 Born 规则`
  - `## 学习目标 {#goals}`:
    - write the hydrogen-like time-independent Schrödinger equation and state that $\psi$ is complex-valued;
    - interpret $\lvert\psi\rvert^2\,d^3r$ with the Born rule as a position-measurement probability;
    - carry out a normalization integral in spherical coordinates and explain the $r^2\sin\theta$ factor;
    - separate the global phase (unobservable) from relative phases (used in chapters 7 and 9).
  - `## 波函数 {#wavefunction}`.
    - $\psi(\mathbf r,t)\in\mathbb C$ is an amplitude, not a probability.
    - Its real part, imaginary part, modulus and phase are all derived fields.
    - Strictly, the wavefunction itself is not a Hermitian-operator observable (`docs/concepts/model-map.md:17`).
    - Add a small table (drawn from `docs/concepts/semantics.md:7-16`) of 波函数 / 概率密度 / 相位 with columns 数学定义 and 禁止的解释. Use `\lvert…\rvert` in the table.
  - `## 薛定谔方程 {#schrodinger-equation}`. The SI form:

    $$-\frac{\hbar^2}{2\mu}\nabla^2\psi(\mathbf r)-\frac{Ze^2}{4\pi\varepsilon_0 r}\psi(\mathbf r)=E\,\psi(\mathbf r)$$

    - $\mu$ is the reduced mass.
    - In atomic units ($\hbar=e=m_e=4\pi\varepsilon_0=1$), with $a_\mu=m_e/\mu$, it reads:

      $$-\frac{a_\mu}{2}\nabla^2\psi-\frac{Z}{r}\psi=E\,\psi$$

    - The textbook lab uses $Z=1$ and $a_\mu=1$ (infinite nuclear mass).
    - Cite `[@griffiths2018qm, ch. 4 (pp. 131--197)]`.
  - `## Born 规则 {#born-rule}`.

    $$dP=\lvert\psi(\mathbf r)\rvert^2\,d^3r$$

    - The probability of a region is $\int_V\lvert\psi\rvert^2d^3r$. Cite `[@griffiths2018qm, eq. (1.3), p. 4]`.
    - Points in a cloud are independent samples of this distribution, with no time order (`docs/tutorials/sampling.md:27-37`).
    - Place **Figure 1.1**:

```markdown
<figure class="quviz-figure" data-lab="mode=eigenstate&n=1&l=0&m=0&basis=real&rep=point_cloud" markdown>
**图 1.1** 氢原子基态 $1s$ 的电子云。每个点相当于对一个同样制备的原子做一次位置测量，所有点都独立地从 $\lvert\psi\rvert^2\,d^3r$ 抽取，点的先后顺序没有时间含义；原子核附近的点最拥挤，说明那里的局域概率密度最大。
</figure>
```

  - `## 归一化 {#normalization}`.

    $$\int\lvert\psi\rvert^2\,d^3r=1$$

    The 1s state:

    $$\psi_{100}(r)=\frac{1}{\sqrt\pi}\left(\frac{Z}{a_\mu}\right)^{3/2}e^{-Zr/a_\mu}$$

    Verify it once in the text for $Z=a_\mu=1$: $\int_0^\infty 4\pi r^2\,\tfrac1\pi e^{-2r}\,dr=4\cdot\tfrac{2!}{2^3}=1$.
  - `## 体积元 {#volume-element}`.

    $$d^3r=r^2\sin\theta\,dr\,d\theta\,d\phi$$

    - Cite `[@griffiths2018qm, chs. 1 and 4 (pp. 3--24, 131--197)]`.
    - $\lvert\psi(r,\theta,\phi)\rvert^2$ alone is not the joint density of $(r,\theta,\phi)$ (`docs/concepts/coordinate-measures.md:1-17`).
    - Preview in plain text that chapter 3 separates the local density from the radial distribution.
    - Place **Figure 1.2**:

```markdown
<figure class="quviz-figure" data-lab="mode=eigenstate&n=1&l=0&m=0&basis=real&rep=slice&plane=xz&obs=probability_density" markdown>
**图 1.2** $1s$ 在 $xz$ 平面上的概率密度切片。亮度 $\propto\lvert\psi\rvert/\max\lvert\psi\rvert$，原子核处最亮；第 3 章会说明，这与“电子最可能出现在哪个半径”是两个不同的问题。
</figure>
```

  - `## 全局相位 {#global-phase}`.
    - $\psi$ and $e^{i\alpha}\psi$ give the same $\lvert\psi\rvert^2$ and the same expectation values, so they are the same physical state.
    - The phase difference between components of a sum is physical (chapters 7 and 9, plain text).
    - The absolute colour of a real orbital's lobes is a convention (the Condon–Shortley phase and QuViz's real-basis definition); only colour differences carry meaning.
  - `## 常见误区 {#misconceptions}`. Three warnings:
    - "ψ 就是电子出现的概率": it is an amplitude and can be negative or complex; the density is $\lvert\psi\rvert^2$;
    - "点云里相邻的点是电子先后经过的位置": they are independent samples with no order;
    - "$\lvert\psi(r,\theta,\phi)\rvert^2$ 就是 $(r,\theta,\phi)$ 的联合概率密度": the volume element is missing.
  - `## 思考题 {#exercises}`. Four questions:
    - **1.1** 验证 $\psi_{100}$ 已归一化（取 $Z=a_\mu=1$）. Answer: the integral above equals 1.
    - **1.2** 基态电子出现在 $r\le a_0$ 的概率是多少？ Answer: $\int_0^R4r^2e^{-2r}dr=1-e^{-2R}(1+2R+2R^2)$, so $R=1$ gives $1-5e^{-2}\approx0.323$.
    - **1.3** $\psi$、$-\psi$ 与 $i\psi$ 能被哪种测量区分？ Answer: none. They differ by a global phase, so every probability and expectation value is identical.
    - **1.4** $1s$ 的局域密度在原子核处最大，为什么“电子恰好在原子核上”的概率却趋于 0？ Answer: the probability inside a sphere of radius $\varepsilon$ is about $\tfrac43\pi\varepsilon^3\rho(0)$, which goes to 0 with the volume. Density and probability differ by the volume element.
  - `## 延伸阅读 {#further-reading}`:
    - [坐标与概率测度](../concepts/coordinate-measures.md);
    - [可视对象语义](../concepts/semantics.md);
    - [物理与数值约定](../concepts/conventions.md);
    - [第 0 章](00-how-to-use.md);
    - `[@griffiths2018qm, chs. 1 and 4 (pp. 3--24, 131--197)]`.
  - **Draws on:** `docs/concepts/coordinate-measures.md:1-33`, `docs/concepts/semantics.md:1-18`, `docs/concepts/model-map.md:17`, `docs/concepts/conventions.md:21-35`, `docs/tutorials/sampling.md:27-37`.
  - **Citations (only these):** `[@griffiths2018qm, eq. (1.3), p. 4]`, `[@griffiths2018qm, ch. 4 (pp. 131--197)]`, `[@griffiths2018qm, chs. 1 and 4 (pp. 3--24, 131--197)]`.
  - **Physics accuracy:**
    - $P(r\le a_0)=1-5e^{-2}=0.3233$;
    - the atomic-unit equation carries the factor $a_\mu/2$, not $1/2$;
    - never say that the point order is a trajectory.

- [ ] **Step 4: Nav + index.** Insert under `教材`, after `- textbook/index.md`:

```yaml
      - 0 如何使用本书与实验室: textbook/00-how-to-use.md
      - 1 波函数与 Born 规则: textbook/01-wavefunction.md
```

In `docs/textbook/index.md`, directly after the line `章节按下表顺序展开。`, add a blank line and:

```markdown
| 章 | 主题 | 核心问题 |
|---|---|---|
| 0 | [如何使用本书与实验室](00-how-to-use.md) | 交互图、教材版实验室与本地实时版各能做什么？ |
| 1 | [波函数与 Born 规则](01-wavefunction.md) | 为什么 $\lvert\psi\rvert^2$ 是概率密度，而 $\psi$ 本身不是？ |
```

- [ ] **Step 5: Run and see it pass** (shared rule 5).

- [ ] **Step 6: Physics self-check.**

Run: `uv run --locked --no-sync python -c "import math; print(1-5*math.exp(-2))"`
Expected: `0.3233235838169365`.

- [ ] **Step 7: Pre-commit gate, then commit.** This commit changes `tests/test_textbook.py`, so the full Python gate runs first (CLAUDE.md, spec §6).

Run: `uv run --locked --group docs pytest --cov=quviz --cov-report=term-missing`
Expected: exit 0. The summary line reports only `passed`, with no `failed`, `error`, `skipped`, `xfailed` or `xpassed`, and the output contains `Required test coverage of 85% reached.` If anything is red, fix it and re-run this step; do not commit.
Run: `uv run --locked ruff check tests/test_textbook.py && uv run --locked ruff format --check tests/test_textbook.py`
Expected: `All checks passed!` and `1 file already formatted`.

```bash
git add docs/textbook/00-how-to-use.md docs/textbook/01-wavefunction.md docs/textbook/index.md mkdocs.yml tests/test_textbook.py
git commit -m "docs(textbook): add chapter 0 on using the lab and chapter 1 on the Born rule" -m "Claude-Session: https://claude.ai/code/session_01E44DEzsc7Av26fc7nZ5rSo"
```

---

### Task C8: Chapter 2 (quantum numbers and levels) and chapter 3 (radial distribution and nodes)

**Files:**
- Create: `docs/textbook/02-hydrogen-levels.md`, `docs/textbook/03-radial-nodes.md`
- Modify: `tests/test_textbook.py`, `mkdocs.yml`, `docs/textbook/index.md`

**Interfaces:**
- Consumes: the Task C5 registry and figure markup; the radial numbers of Part A's `RadialProfile` (spec §4.2), which the chapter text describes but does not import.
- Produces:
  - the anchors `02-hydrogen-levels.md#{separation,quantum-numbers,energy-levels,reduced-mass,general-formula,orbital-labels}`;
  - the anchors `03-radial-nodes.md#{radial-function,radial-distribution,most-probable-radius,mean-radius,radial-nodes,angular-nodes,radial-table}`. The lab's detail-panel chart may link `#radial-distribution`.

- [ ] **Step 1: Register (failing test).** Append to `CHAPTERS`:

```python
    "02-hydrogen-levels.md": Chapter(
        sections=(
            "goals",
            "separation",
            "quantum-numbers",
            "energy-levels",
            "reduced-mass",
            "general-formula",
            "orbital-labels",
            "misconceptions",
            "exercises",
            "further-reading",
        ),
        figures=(
            "mode=eigenstate&n=2&l=0&m=0&basis=real&rep=slice&plane=xz&obs=probability_density",
            "mode=eigenstate&n=2&l=1&m=0&basis=real&rep=slice&plane=xz&obs=probability_density",
        ),
    ),
    "03-radial-nodes.md": Chapter(
        sections=(
            "goals",
            "radial-function",
            "radial-distribution",
            "most-probable-radius",
            "mean-radius",
            "radial-nodes",
            "angular-nodes",
            "radial-table",
            "misconceptions",
            "exercises",
            "further-reading",
        ),
        figures=(
            "mode=eigenstate&n=3&l=0&m=0&basis=real&rep=slice&plane=xz&obs=probability_density",
            "mode=eigenstate&n=3&l=1&m=0&basis=real&rep=slice&plane=xz&obs=wavefunction_real",
        ),
    ),
```

- [ ] **Step 2: Run and see it fail** (shared rule 2).

- [ ] **Step 3a: Write `docs/textbook/02-hydrogen-levels.md`.**
  - **H1:** `# 第 2 章 氢原子：量子数与能级`
  - `## 学习目标 {#goals}`:
    - write the separated form and the ranges of the three quantum numbers;
    - compute $E_n$ and explain the $n^2$-fold degeneracy (without spin);
    - convert length and energy scales with $a_\mu$ and $Z$;
    - read every factor of the normalized wavefunction formula.
  - `## 分离变量 {#separation}`.

    $$\psi_{n\ell m}(r,\theta,\phi)=R_{n\ell}(r)\,Y_\ell^m(\theta,\phi)$$

    - Spherical coordinates: $\theta\in[0,\pi]$ is the polar angle and $\phi\in[0,2\pi)$ the azimuth; $x=r\sin\theta\cos\phi$, $y=r\sin\theta\sin\phi$, $z=r\cos\theta$ (`docs/concepts/conventions.md:3-19`).
    - Cite `[@griffiths2018qm, ch. 4 (pp. 131--197)]`.
  - `## 量子数 {#quantum-numbers}`.

    $$n=1,2,3,\dots,\qquad \ell=0,1,\dots,n-1,\qquad m=-\ell,\dots,+\ell$$

    - The number of states for fixed $n$ is $\sum_{\ell=0}^{n-1}(2\ell+1)=n^2$ (spin not counted).
    - A small table for $n=1,2,3$ lists the allowed $\ell$ and the count (1, 4, 9).
    - Place **Figure 2.1** and **Figure 2.2** at the end of this section:

```markdown
<figure class="quviz-figure" data-lab="mode=eigenstate&n=2&l=0&m=0&basis=real&rep=slice&plane=xz&obs=probability_density" markdown>
**图 2.1** $2s$（$n=2,\ell=0$）在 $xz$ 平面上的概率密度：中心明亮，外面隔着一圈暗环；暗环是半径 $2a_0$ 处的径向节点。
</figure>
```

```markdown
<figure class="quviz-figure" data-lab="mode=eigenstate&n=2&l=1&m=0&basis=real&rep=slice&plane=xz&obs=probability_density" markdown>
**图 2.2** $2p_z$（$n=2,\ell=1,m=0$）在 $xz$ 平面上的概率密度：两瓣沿 $z$ 轴分布，$z=0$ 平面是节面。它与图 2.1 的能量完全相同。
</figure>
```

  - `## 能级 {#energy-levels}`.

    $$E_n=-\frac{Z^2}{2a_\mu n^2}\ \text{Ha}$$

    - Cite `[@griffiths2018qm, ch. 4 (pp. 131--197)]`.
    - A table for $Z=1$, $a_\mu=1$, using 1 Ha = 27.2114 eV:

      | $n$ | $E_n$ (Ha) | $E_n$ (eV) |
      |---|---|---|
      | 1 | −0.5 | −13.606 |
      | 2 | −0.125 | −3.401 |
      | 3 | −0.05556 | −1.512 |
      | 4 | −0.03125 | −0.850 |

    - The energy depends only on $n$.
    - The lab's 详情面板 "图表" tab draws this ladder for the selected state.
  - `## 约化质量与尺度 {#reduced-mass}`.
    - $a_\mu=m_e/\mu$. Lengths scale as $a_\mu/Z$, energies as $Z^2/a_\mu$ (`docs/concepts/conventions.md:21-35`).
    - For hydrogen $\mu/m_e\approx0.999456$, so $a_\mu\approx1.000545$ and $E_1\approx-13.598$ eV.
    - The textbook lab uses $a_\mu=1$ (infinite nuclear mass).
  - `## 总公式 {#general-formula}`.
    - Reproduce the boxed normalized $\psi_{n\ell m}$ with $\sigma=Zr/a_\mu$ and $\rho=2Zr/(na_\mu)$ from `docs/tutorials/hydrogenic-orbitals.md:7-25`, and explain each factor: the normalization constant, $e^{-\rho/2}$, $\rho^\ell$, $L_{n-\ell-1}^{2\ell+1}$ and $Y_\ell^m$.
    - Cite `[@griffiths2018qm, eq. (4.89), p. 151]` and `[@dlmf-laguerre, eq. 18.5.12; @dlmf-spherical-harmonics, eq. 14.30.1]`.
    - Say that QuViz evaluates it with SciPy `[@scipy-eval-genlaguerre; @scipy-sph-harm-y]`.
  - `## 轨道记号 {#orbital-labels}`.
    - $\ell=0,1,2,3\to s,p,d,f$.
    - A table of real-basis labels, taken from QuViz's `orbital_label`:
      - $(1,1)\to p_x$, $(1,-1)\to p_y$, $(1,0)\to p_z$;
      - $(2,-2)\to d_{xy}$, $(2,-1)\to d_{yz}$, $(2,0)\to d_{z^2}$, $(2,1)\to d_{xz}$, $(2,2)\to d_{x^2-y^2}$.
    - $f$ states are labelled "4f, m=…" without a Cartesian nickname.
    - Note in plain text that chapter 4 explains why $m$ is not an orientation label.
  - `## 常见误区 {#misconceptions}`:
    - "氢原子里 2s 比 2p 能量低": in hydrogen $E$ depends only on $n$; the $\ell$ splitting is a multi-electron screening effect;
    - "$n$ 越大，电子的平均动能越大": the virial theorem gives $2\langle T\rangle=-\langle V\rangle$, so $\langle T\rangle=-E_n$ decreases with $n$. Cite `[@griffiths2018qm, problem 3.37, p. 125, and problem 4.48, eq. (4.218), p. 187]`;
    - "$m$ 表示轨道朝向": see chapter 4, in plain text.
  - `## 思考题 {#exercises}`:
    - **2.1** $n=3$ 一共有多少个 $(\ell,m)$ 组合？ Answer: $1+3+5=9=n^2$.
    - **2.2** $n=2\to1$ 跃迁发出的光子能量和波长是多少？ Answer: $\Delta E=\tfrac38$ Ha $=10.20$ eV, so $\lambda=hc/\Delta E\approx1239.84\ \text{eV·nm}/10.204\ \text{eV}\approx121.5$ nm (Lyman α). The reduced-mass correction gives ≈ 121.57 nm.
    - **2.3** He$^+$（$Z=2$）基态的能量与 $1s$ 平均半径？ Answer: $E_1=-Z^2/2=-2$ Ha $\approx-54.4$ eV; $\langle r\rangle_{1s}=3a_0/(2Z)=0.75\,a_0$, half the hydrogen value.
    - **2.4** $(n,\ell,m)=(2,2,0)$ 与 $(3,1,-2)$ 允许吗？ Answer: neither. The first needs $\ell\le n-1$, the second needs $\lvert m\rvert\le\ell$.
  - `## 延伸阅读 {#further-reading}`:
    - [氢与类氢轨道](../tutorials/hydrogenic-orbitals.md);
    - [物理与数值约定](../concepts/conventions.md);
    - [第 1 章](01-wavefunction.md);
    - `[@griffiths2018qm, ch. 4 (pp. 131--197); @dlmf-laguerre, eq. 18.5.12]`.
  - **Draws on:** `docs/tutorials/hydrogenic-orbitals.md:3-47,61-63`, `docs/concepts/conventions.md:1-56`, `docs/references/corrections.md:93-103`.
  - **Citations (only these):**
    - `[@griffiths2018qm, ch. 4 (pp. 131--197)]`;
    - `[@griffiths2018qm, eq. (4.89), p. 151]`;
    - `[@dlmf-laguerre, eq. 18.5.12; @dlmf-spherical-harmonics, eq. 14.30.1]`;
    - `[@scipy-eval-genlaguerre; @scipy-sph-harm-y]`;
    - `[@griffiths2018qm, problem 3.37, p. 125, and problem 4.48, eq. (4.218), p. 187]`;
    - `[@griffiths2018qm, ch. 4 (pp. 131--197); @dlmf-laguerre, eq. 18.5.12]`.

- [ ] **Step 3b: Write `docs/textbook/03-radial-nodes.md`.**
  - **H1:** `# 第 3 章 径向分布与节点`
  - `## 学习目标 {#goals}`:
    - separate $R_{n\ell}$, $\lvert R_{n\ell}\rvert^2$ and $P(r)$;
    - find the most probable radius and $\langle r\rangle$;
    - count and place radial and angular nodes;
    - read the 详情面板 "图表" tab.
  - `## 径向函数 {#radial-function}`. $R_{n\ell}(r)$ behaves like $r^\ell$ near the origin, so $\psi=0$ at the nucleus for $\ell\ge1$.
  - `## 径向分布 {#radial-distribution}`.

    $$P(r)=r^2\lvert R_{n\ell}(r)\rvert^2,\qquad \int_0^\infty P(r)\,dr=1$$

    - This follows from the volume element (`docs/concepts/coordinate-measures.md:19-44`).
    - The lab's 图表 tab draws $P(r)$ with vertical lines at the nodes and markers for $\langle r\rangle$ and the most probable radius. These values are computed in Python; the browser only draws them.
  - `## 最可几半径 {#most-probable-radius}`.
    - The maximum of $P(r)$, not of $\lvert R\rvert^2$.
    - $1s$: $P\propto r^2e^{-2Zr/a_\mu}$ peaks at $r=a_\mu/Z$.
    - For $\ell=n-1$: $R\propto r^{n-1}e^{-Zr/(na_\mu)}$, so $P\propto r^{2n}e^{-2Zr/(na_\mu)}$ peaks at $r=n^2a_\mu/Z$ (1, 4, 9 and 16 $a_0$).
    - Contrast with the $1s$ density $\rho\propto e^{-2Zr/a_\mu}$, which is largest at the nucleus (`docs/concepts/coordinate-measures.md:46-63`).
  - `## 平均半径 {#mean-radius}`.

    $$\langle r\rangle=\frac{a_\mu}{2Z}\left[3n^2-\ell(\ell+1)\right]$$

    - Cite `[@griffiths2018qm, ch. 4 (pp. 131--197)]`.
    - At fixed $n$, larger $\ell$ gives a smaller $\langle r\rangle$.
  - `## 径向节点 {#radial-nodes}`.
    - $N_{\mathrm{radial}}=n-\ell-1$.
    - $2s$: $R_{20}\propto(2-r)e^{-r/2}$ has its node at $2a_0$.
    - $3p$: $R_{31}\propto\sigma(6-\sigma)e^{-\sigma/3}$ has its node at $6a_0$ (`docs/references/corrections.md:5-19`).
    - $3s$: nodes at $(9\mp3\sqrt3)/2\,a_0\approx1.902$ and $7.098\,a_0$.
    - $4d$: node at $12a_0$.
    - Cite `[@griffiths2018qm, ch. 4 (pp. 131--197); @dlmf-laguerre, eq. 18.5.12]`.
    - Place **Figure 3.1**:

```markdown
<figure class="quviz-figure" data-lab="mode=eigenstate&n=3&l=0&m=0&basis=real&rep=slice&plane=xz&obs=probability_density" markdown>
**图 3.1** $3s$ 在 $xz$ 平面上的概率密度：两圈暗环是 $r\approx1.90\,a_0$ 与 $r\approx7.10\,a_0$ 处的径向节点，个数 $n-\ell-1=2$。
</figure>
```

  - `## 角向节点 {#angular-nodes}`.
    - In the real basis there are $\ell$ angular nodal surfaces, and $N_{\mathrm{total}}=n-1$.
    - Angular nodes are not always planes: $d_{z^2}\propto3\cos^2\theta-1$ vanishes on the cones $\cos\theta=\pm1/\sqrt3$ ($\theta\approx54.7^\circ$). Cite `[@dlmf-spherical-harmonics, eq. 14.30.3]`.
    - In the complex basis $e^{im\phi}$ has no zeros, so there is a phase winding instead of an azimuthal nodal plane. Cite `[@dlmf-spherical-harmonics, §14.30]`.
    - Place **Figure 3.2**:

```markdown
<figure class="quviz-figure" data-lab="mode=eigenstate&n=3&l=1&m=0&basis=real&rep=slice&plane=xz&obs=wavefunction_real" markdown>
**图 3.2** $3p_z$ 在 $xz$ 平面上的 $\operatorname{Re}\psi$（红为正、青为负）：符号在 $z=0$ 的节面两侧翻转，也在 $r=6a_0$ 的径向节点两侧翻转，所以上下两侧各有红青相间的内外两层。
</figure>
```

  - `## 径向数据表 {#radial-table}`. Give this table exactly ($Z=1$, $a_\mu=1$; recomputed in Step 6):

    | 态 | 径向节点 $r/a_0$ | 最可几半径 $r_{\mathrm{mp}}/a_0$ | $\langle r\rangle/a_0$ |
    |---|---|---|---|
    | $1s$ | — | 1 | 1.5 |
    | $2s$ | 2 | 5.236 | 6 |
    | $2p$ | — | 4 | 5 |
    | $3s$ | 1.902, 7.098 | 13.07 | 13.5 |
    | $3p$ | 6 | 12 | 12.5 |
    | $3d$ | — | 9 | 10.5 |
    | $4s$ | 1.872, 6.611, 15.52 | 24.62 | 24 |
    | $4p$ | 5.528, 14.47 | 23.58 | 23 |
    | $4d$ | 12 | 21.21 | 21 |
    | $4f$ | — | 16 | 18 |

    Follow it with one sentence: the values do not depend on $m$ or on the basis, because they come from $R_{n\ell}$ alone.
  - `## 常见误区 {#misconceptions}`:
    - "最可几半径就是 $\lvert\psi\rvert^2$ 最大的地方". Cite `[@floatheadphysics2025-orbitals, 06:06--10:00]` as a documented instance and link [纠错账本](../references/corrections.md).
    - "平均半径等于最可几半径": compare $1s$ (1.5 vs 1) and $4s$ (24 < 24.62).
    - "角节点都是平面": the $d_{z^2}$ cones, with `[@dlmf-spherical-harmonics, eq. 14.30.3]`.
    - "电子如何「穿过」节点": a stationary state has no trajectory. The question presupposes a path that quantum mechanics does not assign.
  - `## 思考题 {#exercises}`:
    - **3.1** 求 $1s$ 的最可几半径。 Answer: $\tfrac{d}{dr}(r^2e^{-2r})=0$ gives $r=a_0$.
    - **3.2** 求 $2s$ 与 $3p$ 的径向节点。 Answer: $2a_0$ and $6a_0$ from the polynomials above.
    - **3.3** 比较 $3s,3p,3d$ 的 $\langle r\rangle$ 与 $r_{\mathrm{mp}}$。 Answer: 13.5/13.07, 12.5/12, 10.5/9, so larger $\ell$ is more compact.
    - **3.4** 为什么 $4s$ 的最可几半径（24.62）反而大于平均半径（24）？ Answer: the mean averages over all four lobes. The three inner lobes pull it inward and the long tail pushes it outward; for $4s$ the inner lobes win.
    - **3.5** 数一数实基 $4d_{xy}$ 的节点。 Answer: 1 radial node at $12a_0$ plus 2 angular nodal planes $x=0$ and $y=0$, so 3 in total $=n-1$.
  - `## 延伸阅读 {#further-reading}`:
    - [坐标与概率测度](../concepts/coordinate-measures.md);
    - [氢与类氢轨道](../tutorials/hydrogenic-orbitals.md);
    - [纠错账本](../references/corrections.md);
    - [第 2 章](02-hydrogen-levels.md);
    - `[@griffiths2018qm, ch. 4 (pp. 131--197); @dlmf-laguerre, eq. 18.5.12]`.
  - **Draws on:** `docs/concepts/coordinate-measures.md:19-63`, `docs/tutorials/hydrogenic-orbitals.md:29-63`, `docs/references/corrections.md:5-29,81-103`.
  - **Citations (only these):**
    - `[@griffiths2018qm, ch. 4 (pp. 131--197)]`;
    - `[@griffiths2018qm, ch. 4 (pp. 131--197); @dlmf-laguerre, eq. 18.5.12]`;
    - `[@dlmf-spherical-harmonics, eq. 14.30.3]`;
    - `[@dlmf-spherical-harmonics, §14.30]`;
    - `[@floatheadphysics2025-orbitals, 06:06--10:00]`.

- [ ] **Step 4: Nav + index.** Insert after the chapter 1 nav line:

```yaml
      - 2 氢原子：量子数与能级: textbook/02-hydrogen-levels.md
      - 3 径向分布与节点: textbook/03-radial-nodes.md
```

Append to the index table:

```markdown
| 2 | [氢原子：量子数与能级](02-hydrogen-levels.md) | 三个量子数从哪里来，能量为什么只依赖 $n$？ |
| 3 | [径向分布与节点](03-radial-nodes.md) | 电子最可能在哪个半径，节点有几个、在哪里？ |
```

- [ ] **Step 5: Run and see it pass** (shared rule 5).

- [ ] **Step 6: Physics self-check** *(bash)*.

```bash
uv run --locked --no-sync python -c 'from quviz.physics.hydrogenic import hydrogenic_energy_hartree as E
HA = 27.211386245981
print([round(E(n), 5) for n in range(1, 5)], [round(E(n) * HA, 3) for n in range(1, 5)])
d = E(2) - E(1); print(round(d * HA, 3), round(1239.84198 / (d * HA), 2))
mu = 1836.15267343 / 1837.15267343; dm = E(2, reduced_mass_ratio=mu) - E(1, reduced_mass_ratio=mu); print(round(1239.84198 / (dm * HA), 2), round(E(1, reduced_mass_ratio=mu) * HA, 3))
print(round(E(1, z=2.0) * HA, 2))'
```

Expected:

```text
[-0.5, -0.125, -0.05556, -0.03125] [-13.606, -3.401, -1.512, -0.85]
10.204 121.5
121.57 -13.598
-54.42
```

```bash
uv run --locked --no-sync python -c 'import numpy as np
from quviz.physics.hydrogenic import radial_wavefunction as R, radial_node_radii as nodes
r = np.linspace(1e-6, 80, 800001)
for n in range(1, 5):
    for l in range(n):
        p = r**2 * R(n, l, r) ** 2
        print(f"{n}{"spdf"[l]}", np.round(nodes(n, l), 3).tolist(), round(float(r[np.argmax(p)]), 3), (3 * n * n - l * (l + 1)) / 2)'
```

Expected (columns: nodes, most probable radius, $\langle r\rangle$):

```text
1s [] 1.0 1.5
2s [2.0] 5.236 6.0
2p [] 4.0 5.0
3s [1.902, 7.098] 13.074 13.5
3p [6.0] 12.0 12.5
3d [] 9.0 10.5
4s [1.872, 6.611, 15.518] 24.618 24.0
4p [5.528, 14.472] 23.58 23.0
4d [12.0] 21.211 21.0
4f [] 16.0 18.0
```

- [ ] **Step 7: Pre-commit gate, then commit.** This commit changes `tests/test_textbook.py`, so the full Python gate runs first (CLAUDE.md, spec §6).

Run: `uv run --locked --group docs pytest --cov=quviz --cov-report=term-missing`
Expected: exit 0. The summary line reports only `passed`, with no `failed`, `error`, `skipped`, `xfailed` or `xpassed`, and the output contains `Required test coverage of 85% reached.` If anything is red, fix it and re-run this step; do not commit.
Run: `uv run --locked ruff check tests/test_textbook.py && uv run --locked ruff format --check tests/test_textbook.py`
Expected: `All checks passed!` and `1 file already formatted`.

```bash
git add docs/textbook/02-hydrogen-levels.md docs/textbook/03-radial-nodes.md docs/textbook/index.md mkdocs.yml tests/test_textbook.py
git commit -m "docs(textbook): add chapters on quantum numbers, levels and radial nodes" -m "Claude-Session: https://claude.ai/code/session_01E44DEzsc7Av26fc7nZ5rSo"
```

---

### Task C9: Chapter 4 (real and complex orbitals) and chapter 5 (electron cloud and sampling)

**Files:**
- Create: `docs/textbook/04-real-complex.md`, `docs/textbook/05-electron-cloud.md`
- Modify: `tests/test_textbook.py`, `mkdocs.yml`, `docs/textbook/index.md`

**Interfaces:**
- Consumes: the Task C5 registry. Chapter 4 uses the superposition preset `2pplus-2pminus` (`src/quviz/api/routes.py:600-606`).
- Produces: the anchors `04-real-complex.md#{complex-harmonics,real-harmonics,basis-change,meaning-of-m,phase-colour}` and `05-electron-cloud.md#{samples,separable-sampling,density-and-counts,finite-samples,superposition-sampling}`.

- [ ] **Step 1: Register (failing test).** Append to `CHAPTERS`:

```python
    "04-real-complex.md": Chapter(
        sections=(
            "goals",
            "complex-harmonics",
            "real-harmonics",
            "basis-change",
            "meaning-of-m",
            "phase-colour",
            "misconceptions",
            "exercises",
            "further-reading",
        ),
        figures=(
            "mode=eigenstate&n=2&l=1&m=1&basis=complex&rep=isosurface",
            "mode=eigenstate&n=2&l=1&m=1&basis=real&rep=isosurface",
            "mode=superposition&preset=2pplus-2pminus&t=0&rep=isosurface",
        ),
    ),
    "05-electron-cloud.md": Chapter(
        sections=(
            "goals",
            "samples",
            "separable-sampling",
            "density-and-counts",
            "finite-samples",
            "superposition-sampling",
            "misconceptions",
            "exercises",
            "further-reading",
        ),
        figures=(
            "mode=eigenstate&n=3&l=2&m=0&basis=real&rep=point_cloud",
            "mode=eigenstate&n=2&l=0&m=0&basis=real&rep=point_cloud",
        ),
    ),
```

- [ ] **Step 2: Run and see it fail** (shared rule 2).

- [ ] **Step 3a: Write `docs/textbook/04-real-complex.md`.**
  - **H1:** `# 第 4 章 实轨道与复轨道`
  - `## 学习目标 {#goals}`:
    - explain that the complex $Y_\ell^m$ are $L_z$ eigenstates with a $\phi$-independent density;
    - write $p_x$ and $p_y$ as combinations of $m=\pm1$;
    - recognise a basis change inside a degenerate subspace as a unitary transformation, not new physics;
    - read phase colours.
  - `## 复球谐：角动量本征态 {#complex-harmonics}`.

    $$Y_\ell^m(\theta,\phi)\propto P_\ell^{\lvert m\rvert}(\cos\theta)\,e^{im\phi},\qquad \hat L_z Y_\ell^m=\hbar m\,Y_\ell^m$$

    - Since $\lvert e^{im\phi}\rvert^2=1$, the density does not depend on $\phi$.
    - The phase winds around the $z$ axis.
    - QuViz includes the Condon–Shortley phase.
    - Cite `[@dlmf-spherical-harmonics, eqs. 14.30.3, 14.30.6, and 14.30.11_5]`.
    - Place **Figure 4.1**:

```markdown
<figure class="quviz-figure" data-lab="mode=eigenstate&n=2&l=1&m=1&basis=complex&rep=isosurface" markdown>
**图 4.1** 复基 $2p$、$m=+1$ 的等密度面：密度 $\propto\sin^2\theta$，与方位角 $\phi$ 无关，所以曲面绕 $z$ 轴旋转对称、呈环状；颜色（相位）绕 $z$ 轴连续转过一整圈。
</figure>
```

  - `## 实球谐：化学定向轨道 {#real-harmonics}`.
    - Give QuViz's real-basis definition from `docs/concepts/conventions.md:39-47`: $\sqrt2(-1)^m\operatorname{Re}Y_\ell^m$ for $m>0$, $Y_\ell^0$ for $m=0$, and $\sqrt2(-1)^m\operatorname{Im}Y_\ell^{\lvert m\rvert}$ for $m<0$.
    - Give $p_x\propto(Y_1^{-1}-Y_1^{1})/\sqrt2$ and $p_y\propto i(Y_1^{-1}+Y_1^{1})/\sqrt2$.
    - Cite `[@scipy-sph-harm-y]` for the implemented convention.
    - Place **Figure 4.2**:

```markdown
<figure class="quviz-figure" data-lab="mode=eigenstate&n=2&l=1&m=1&basis=real&rep=isosurface" markdown>
**图 4.2** 实基 $2p_x$ 的等密度面：两瓣沿 $x$ 轴，一红一青，相位相差 $\pi$。它是 $m=+1$ 与 $m=-1$ 两个复基态的线性组合。
</figure>
```

  - `## 基变换不是新物理 {#basis-change}`.

    $$\tilde\phi_i=\sum_jU_{ij}\phi_j,\qquad U^\dagger U=I$$

    - A basis change changes how individual functions look, not the subspace. The unitary change used here stays inside one degenerate subspace (`docs/tutorials/real-vs-complex.md:60-69`).
    - Unsöld's sum:

      $$\sum_{m=-\ell}^{\ell}\lvert Y_\ell^m\rvert^2=\frac{2\ell+1}{4\pi}$$

      It is the same in every basis. Cite `[@dlmf-spherical-harmonics, §14.30]`.
    - Introduce the lab's superposition preset 2p(+1) + 2p(−1): $(\psi_{21,+1}+\psi_{21,-1})/\sqrt2=-i\,\psi_{2p_y}$. It is a $p_y$ orbital multiplied by a global phase. Mention in plain text that chapter 9 reuses it as a "degenerate control".
    - Place **Figure 4.3**:

```markdown
<figure class="quviz-figure" data-lab="mode=superposition&preset=2pplus-2pminus&t=0&rep=isosurface" markdown>
**图 4.3** 叠加态预设 2p(+1) + 2p(−1) 的等密度面：$(\psi_{21,+1}+\psi_{21,-1})/\sqrt2=-i\,\psi_{2p_y}$，所以它就是沿 $y$ 轴的 $2p_y$ 两瓣——同一个简并子空间，换了一组基。两瓣的相位仍相差 $\pi$，整体多出的全局相位 $-i$ 不改变任何可观测量。
</figure>
```

  - `## 磁量子数的含义 {#meaning-of-m}`.
    - In the complex basis, $m$ is the $L_z/\hbar$ eigenvalue.
    - QuViz keeps a signed $m$ in the real basis only as an index for the cosine/sine functions (`docs/tutorials/real-vs-complex.md:25-35`).
    - $p_x$ is not an $L_z$ eigenstate: $\hat L_z p_x=i\hbar\,p_y$. Measuring $L_z$ on $p_x$ gives $+\hbar$ or $-\hbar$ with probability $1/2$ each, and $\langle L_z\rangle=0$.
    - Cite `[@dlmf-spherical-harmonics, eqs. 14.30.3, 14.30.6, and 14.30.11_5]`.
  - `## 相位颜色 {#phase-colour}`.
    - The periodic HSV wheel: phase 0 is red, $\pi$ is cyan, and $-\pi$ and $+\pi$ close at the same colour. The same wheel colours point clouds, isosurfaces and phase slices.
    - Real-basis states show only two colours (0 and $\pi$). Complex states show a continuous winding.
    - Colours are not charges (`docs/tutorials/real-vs-complex.md:37-58`).
  - `## 常见误区 {#misconceptions}`:
    - "$m=+1$ 就是 $p_x$". Cite `[@floatheadphysics2025-orbitals, 27:25--30:18]` for the rotating-node picture that helps remember $2\ell+1$ but must not be read as an orientation map.
    - "实轨道与复轨道描述的是不同的物理": same subspace, same energy, same summed density.
    - "红与青表示正电荷与负电荷": it is a phase difference of $\pi$. The charge density is $-e\lvert\psi\rvert^2$ everywhere.
  - `## 思考题 {#exercises}`:
    - **4.1** 证明 $\lvert Y_1^{1}\rvert^2=\lvert Y_1^{-1}\rvert^2$。 Answer: both equal $\tfrac{3}{8\pi}\sin^2\theta$.
    - **4.2** 把 $(Y_1^{1}+Y_1^{-1})/\sqrt2$ 写成实基函数。 Answer: from $p_y\propto i(Y_1^{-1}+Y_1^{1})/\sqrt2$ it equals $-i\,p_y$. This is why the preset in Figure 4.3 shows $2p_y$.
    - **4.3** $p_x$ 是 $\hat L_z$ 的本征函数吗？测 $L_z$ 会得到什么？ Answer: No. $\hat L_zp_x=\hbar(-Y_1^{-1}-Y_1^{1})/\sqrt2=i\hbar\,p_y$. The outcomes are $\pm\hbar$ with probability 1/2 each, and the mean is 0.
    - **4.4** 证明 $\lvert p_x\rvert^2+\lvert p_y\rvert^2+\lvert p_z\rvert^2$ 是球对称的。 Answer: the angular parts are proportional to $x^2+y^2+z^2=r^2$ over $r^2$, a constant. This is Unsöld's sum for $\ell=1$.
  - `## 延伸阅读 {#further-reading}`:
    - [实轨道与复轨道](../tutorials/real-vs-complex.md);
    - [物理与数值约定](../concepts/conventions.md);
    - [纠错账本](../references/corrections.md);
    - [第 2 章](02-hydrogen-levels.md).
  - **Draws on:** `docs/tutorials/real-vs-complex.md:1-69`, `docs/concepts/conventions.md:37-56`, `docs/references/corrections.md:105-109`, `tests/test_slice_science.py:396-406` (the phase values at ±x and ±y).
  - **Citations (only these):**
    - `[@dlmf-spherical-harmonics, eqs. 14.30.3, 14.30.6, and 14.30.11_5]`;
    - `[@dlmf-spherical-harmonics, §14.30]`;
    - `[@scipy-sph-harm-y]`;
    - `[@floatheadphysics2025-orbitals, 27:25--30:18]`.
  - **Physics accuracy:** $(\psi_{21,+1}+\psi_{21,-1})/\sqrt2=-i\,\psi_{2p_y}$. Planning verified this numerically with `quviz.physics.hydrogenic.hydrogenic_wavefunction` at three points; the sum equals $-i$ times the real $m=-1$ ($p_y$) function.

- [ ] **Step 3b: Write `docs/textbook/05-electron-cloud.md`.**
  - **H1:** `# 第 5 章 电子云：从概率到采样`
  - `## 学习目标 {#goals}`:
    - interpret each point as an independent position sample;
    - describe separable inverse-CDF sampling;
    - separate local crowding ($\rho$) from shell counts ($P(r)$);
    - estimate sampling noise;
    - explain why superposition point clouds need the interference term.
  - `## 样本不是轨迹 {#samples}`.

    $$\mathbf r_i\overset{\text{iid}}{\sim}\lvert\psi\rvert^2d^3r$$

    - Each point corresponds to one position measurement on a freshly prepared atom. The order is meaningless.
    - Cite `[@griffiths2018qm, eq. (1.3), p. 4; @tully2013pointillist]`.
    - Point-cloud orbitals have teaching precedents: `[@tully2013pointillist; @evanescence]`.
    - Place **Figure 5.1**:

```markdown
<figure class="quviz-figure" data-lab="mode=eigenstate&n=3&l=2&m=0&basis=real&rep=point_cloud" markdown>
**图 5.1** 实基 $3d_{z^2}$ 的电子云（28,000 个样本）：沿 $z$ 轴的两瓣加上 $xy$ 平面附近的一个环；两瓣与环的颜色不同，因为那里波函数的符号相反。
</figure>
```

  - `## 分离采样 {#separable-sampling}`.

    $$dP=\underbrace{r^2\lvert R_{n\ell}(r)\rvert^2dr}_{P(r)\,dr}\;\underbrace{\lvert Y_\ell^m\rvert^2\sin\theta\,d\theta\,d\phi}_{\text{角向}}$$

    - Radial: $F(r)=\int_0^rP(r')\,dr'$ and $r=F^{-1}(u)$ with $u\sim U(0,1)$.
    - Polar: invert the CDF of $x=\cos\theta$ on $[-1,1]$.
    - Azimuth: uniform in the complex basis; one-dimensional rejection on $\cos^2(m\phi)$ or $\sin^2(m\phi)$ in the real basis.
    - Convert to Cartesian and recompute the phase for colour.
    - Every marker has equal weight; density shows only through crowding.
    - A fixed seed (7) reproduces the same points.
    - Cite `[@griffiths2018qm, Born rule eq. (1.3), p. 4 and hydrogenic separation eq. (4.89), p. 151; @numpy-rng]` (`docs/tutorials/sampling.md:7-25`).
  - `## 局域密度与分壳计数 {#density-and-counts}`.
    - Crowding inside a small volume estimates $\rho$; the count inside a thin shell estimates $P(r)\,dr$. For $1s$ the centre is most crowded, while the shell count peaks at $a_0$ (`docs/concepts/coordinate-measures.md:46-63`).
    - Place **Figure 5.2**:

```markdown
<figure class="quviz-figure" data-lab="mode=eigenstate&n=2&l=0&m=0&basis=real&rep=point_cloud" markdown>
**图 5.2** $2s$ 的电子云：半径 $2a_0$ 处的节点把点分成内外两层。内层只占约 5.3% 的概率，在 28,000 个样本里大约只有 1,500 个点。
</figure>
```

  - `## 有限样本 {#finite-samples}`.
    - The count in a region of probability $p$ is binomial: mean $Np$, standard deviation $\sqrt{Np(1-p)}$.
    - For $N=28{,}000$ and $p=0.323$ that is $9{,}053\pm78$.
    - The finite radial table captures slightly less than all of the probability; the 场景契约 tab reports the captured mass.
  - `## 叠加态的采样 {#superposition-sampling}`.

    $$\lvert\psi\rvert^2=\sum_k\lvert c_k\rvert^2\lvert\phi_k\rvert^2+\sum_{i\ne j}c_ic_j^*\phi_i\phi_j^*$$

    - Picking a component with probability $\lvert c_k\rvert^2$ and then sampling it drops the interference term (`docs/tutorials/sampling.md:39-56`).
    - The lab therefore refuses point clouds for superpositions and says why. General superposition sampling is still future work.
  - `## 常见误区 {#misconceptions}`:
    - "点云是电子运动的轨迹";
    - "点最密的半径就是最可能半径";
    - "叠加态的点云可以按 $\lvert c_k\rvert^2$ 分配点数".
  - `## 思考题 {#exercises}`:
    - **5.1** 28,000 个 $1s$ 样本中预计有多少落在 $r\le a_0$？ Answer: $p=1-5e^{-2}=0.3233$, so about 9,053, with a standard deviation of about 78.
    - **5.2** $2s$ 的节点内大约有多少个点？ Answer: $p\approx0.0527$, so about 1,474.
    - **5.3** 为什么不能对 $(\psi_{1s}+\psi_{2p_z})/\sqrt2$ 先按 $\lvert c_k\rvert^2$ 选分量再采样？ Answer: that samples $\tfrac12(\lvert\psi_{1s}\rvert^2+\lvert\psi_{2p_z}\rvert^2)$, which is symmetric under $z\to-z$ and has $\langle z\rangle=0$. The true density includes the cross term and is shifted toward $+z$, with $\langle z\rangle=\tfrac{128\sqrt2}{243}a_0\approx0.745\,a_0$ at $t=0$.
    - **5.4** 只看点的位置，能区分复基 $m=+1$ 与 $m=-1$ 吗？ Answer: No. The densities are identical; only the phase-colour winding direction differs, and so does the probability current (chapter 8).
  - `## 延伸阅读 {#further-reading}`:
    - [电子云采样](../tutorials/sampling.md);
    - [坐标与概率测度](../concepts/coordinate-measures.md);
    - [第 3 章](03-radial-nodes.md);
    - [第 4 章](04-real-complex.md).
  - **Draws on:** `docs/tutorials/sampling.md:7-56`, `docs/concepts/coordinate-measures.md:19-63`, `docs/getting-started/first-orbital.md:23-36`, `docs/references/corrections.md:43-51`.
  - **Citations (only these):**
    - `[@griffiths2018qm, eq. (1.3), p. 4; @tully2013pointillist]`;
    - `[@griffiths2018qm, Born rule eq. (1.3), p. 4 and hydrogenic separation eq. (4.89), p. 151; @numpy-rng]`;
    - `[@tully2013pointillist; @evanescence]`.

- [ ] **Step 4: Nav + index.** Insert after the chapter 3 nav line:

```yaml
      - 4 实轨道与复轨道: textbook/04-real-complex.md
      - 5 电子云：从概率到采样: textbook/05-electron-cloud.md
```

Append to the index table:

```markdown
| 4 | [实轨道与复轨道](04-real-complex.md) | $p_x$ 和 $m=+1$ 是同一个态吗？ |
| 5 | [电子云：从概率到采样](05-electron-cloud.md) | 点云里的每个点代表什么？ |
```

- [ ] **Step 5: Run and see it pass** (shared rule 5).

- [ ] **Step 6: Physics self-check** *(bash)*.

```bash
uv run --locked --no-sync python -c 'import math
import numpy as np
from quviz.physics.hydrogenic import radial_wavefunction as R
p = 1 - 5 * math.exp(-2); print(round(28000 * p), round(math.sqrt(28000 * p * (1 - p))))
r = np.linspace(0, 2, 200001); q = float(np.trapezoid(r**2 * R(2, 0, r) ** 2, r)); print(round(q, 4), round(28000 * q))'
```

Expected:

```text
9053 78
0.0527 1474
```

- [ ] **Step 7: Pre-commit gate, then commit.** This commit changes `tests/test_textbook.py`, so the full Python gate runs first (CLAUDE.md, spec §6).

Run: `uv run --locked --group docs pytest --cov=quviz --cov-report=term-missing`
Expected: exit 0. The summary line reports only `passed`, with no `failed`, `error`, `skipped`, `xfailed` or `xpassed`, and the output contains `Required test coverage of 85% reached.` If anything is red, fix it and re-run this step; do not commit.
Run: `uv run --locked ruff check tests/test_textbook.py && uv run --locked ruff format --check tests/test_textbook.py`
Expected: `All checks passed!` and `1 file already formatted`.

```bash
git add docs/textbook/04-real-complex.md docs/textbook/05-electron-cloud.md docs/textbook/index.md mkdocs.yml tests/test_textbook.py
git commit -m "docs(textbook): add chapters on real vs complex orbitals and on the electron cloud" -m "Claude-Session: https://claude.ai/code/session_01E44DEzsc7Av26fc7nZ5rSo"
```

---

### Task C10: Chapter 6 (isosurfaces) and chapter 7 (phase and plane slices)

**Files:**
- Create: `docs/textbook/06-isosurface.md`, `docs/textbook/07-phase-slices.md`
- Modify: `tests/test_textbook.py`, `mkdocs.yml`, `docs/textbook/index.md`

**Interfaces:**
- Consumes: the Task C5 registry, plus the colour semantics of the lab's legends (`web/src/components/Legend.tsx` strings such as `亮度 ∝ |ψ|/max|ψ|`, which Part D keeps: spec §4.4 "图例胶囊沿用 Legend 的分支逻辑").
- Produces: the anchors `06-isosurface.md#{threshold,enclosed-probability,phase-colour,finite-grid,shapes}` and `07-phase-slices.md#{planes,four-fields,colour-maps,phase-mask,global-phase}`.

- [ ] **Step 1: Register (failing test).** Append to `CHAPTERS`:

```python
    "06-isosurface.md": Chapter(
        sections=(
            "goals",
            "threshold",
            "enclosed-probability",
            "phase-colour",
            "finite-grid",
            "shapes",
            "misconceptions",
            "exercises",
            "further-reading",
        ),
        figures=(
            "mode=eigenstate&n=3&l=2&m=0&basis=real&rep=isosurface",
            "mode=eigenstate&n=3&l=2&m=-2&basis=real&rep=isosurface",
        ),
    ),
    "07-phase-slices.md": Chapter(
        sections=(
            "goals",
            "planes",
            "four-fields",
            "colour-maps",
            "phase-mask",
            "global-phase",
            "misconceptions",
            "exercises",
            "further-reading",
        ),
        figures=(
            "mode=eigenstate&n=2&l=1&m=0&basis=real&rep=slice&plane=xz&obs=wavefunction_real",
            "mode=eigenstate&n=3&l=2&m=2&basis=complex&rep=slice&plane=xy&obs=wavefunction_real",
            "mode=eigenstate&n=2&l=1&m=1&basis=complex&rep=slice&plane=xy&obs=phase",
            "mode=eigenstate&n=2&l=1&m=-1&basis=complex&rep=slice&plane=xy&obs=phase",
        ),
    ),
```

- [ ] **Step 2: Run and see it fail** (shared rule 2).

- [ ] **Step 3a: Write `docs/textbook/06-isosurface.md`.**
  - **H1:** `# 第 6 章 等值面：轨道的“形状”`
  - `## 学习目标 {#goals}`:
    - explain the isosurface as the level set $\lvert\psi\rvert^2=c$ chosen by enclosed probability;
    - read phase colour on a surface;
    - know why the lab sometimes refuses a surface;
    - recognise the $s,p,d$ shapes and the $d_{z^2}$ cones.
  - `## 阈值曲面 {#threshold}`.
    - The surface $\{\mathbf r:\lvert\psi(\mathbf r)\rvert^2=c\}$ bounds the region $\lvert\psi\rvert^2\ge c$.
    - The geometry comes only from the density (`docs/concepts/semantics.md:7-18`).
  - `## 包围概率 {#enclosed-probability}`.

    $$\int_{\lvert\psi\rvert^2\ge c}\lvert\psi\rvert^2\,d^3r=p$$

    - $c$ is solved from $p$. The textbook lab fixes $p=0.9$.
    - For $1s$ the region is a ball of radius $R$ with $1-e^{-2R}(1+2R+2R^2)=p$, so $R_{0.9}\approx2.66\,a_0$.
    - One fixed $c$ for all orbitals would enclose very different probabilities. Cite `[@solara-orbital-plot; @numpy-meshgrid; @skimage-marching-cubes]` (`docs/references/corrections.md:35-41`).
  - `## 曲面上的相位颜色 {#phase-colour}`.
    - Vertex colour is $\arg\psi$ on the same periodic wheel as chapter 4 (link [第 4 章](04-real-complex.md)). Real states show two colours; complex states wind.
    - The surface is unlit, so lighting never changes the data colours (`docs/tutorials/frontend-rendering.md:57-61`).
  - `## 有限网格与诚实拒绝 {#finite-grid}`.
    - Marching cubes runs on a cubic grid with an odd number of points per axis, at least $\max(65,16n+17)$ (81 for $n=4$). Cite `[@skimage-marching-cubes]`.
    - The 场景契约 tab reports the requested and actual enclosed probability, the grid and the captured mass.
    - If the topology or mass checks cannot pass on the allowed grid, the lab shows the reason instead of an unverified surface (`docs/tutorials/phase-0-walkthrough.md:26-34`).
  - `## 常见形状 {#shapes}`.
    - $s$: spheres (nested shells can appear for $n\ge2$). $p$: two lobes of opposite colour. $d_{z^2}$: two lobes plus a ring, because the angular nodes are the cones $\cos\theta=\pm1/\sqrt3$. $d_{xy}$: four lobes between the axes. Complex $m\ne0$: ring shapes with a winding phase.
    - Cite `[@dlmf-spherical-harmonics, eq. 14.30.3]`.
    - Galleries such as `[@orbitron]` are good for comparison but are not numerical truth.
    - Place **Figure 6.1** and **Figure 6.2**:

```markdown
<figure class="quviz-figure" data-lab="mode=eigenstate&n=3&l=2&m=0&basis=real&rep=isosurface" markdown>
**图 6.1** 实基 $3d_{z^2}$ 的等密度面（包围 90% 概率）：沿 $z$ 轴的两瓣加上 $xy$ 平面上的一个环。角节点是 $\cos\theta=\pm1/\sqrt3$ 的两个圆锥面，所以环与两瓣颜色相反。
</figure>
```

```markdown
<figure class="quviz-figure" data-lab="mode=eigenstate&n=3&l=2&m=-2&basis=real&rep=isosurface" markdown>
**图 6.2** 实基 $3d_{xy}$ 的等密度面：四瓣位于 $xy$ 平面内、夹在两条坐标轴之间，相邻两瓣颜色相反；$x=0$ 与 $y=0$ 两个平面是节面。
</figure>
```

  - `## 常见误区 {#misconceptions}`:
    - "等值面就是电子的边界": 10 % of the probability lies outside, and a different $p$ gives a different surface.
    - "所有轨道用同一个阈值 $c$ 才公平": equal $c$ does not mean equal probability.
    - "$d$ 轨道都是四瓣": $d_{z^2}$ is two lobes and a ring. Cite `[@floatheadphysics2025-orbitals, 21:58--24:08]` for the documented four-lobe overgeneralisation.
  - `## 思考题 {#exercises}`:
    - **6.1** 包围 90% 概率的 $1s$ 球面半径是多少？ Answer: solve $1-e^{-2R}(1+2R+2R^2)=0.9$, which gives $R\approx2.66\,a_0$.
    - **6.2** 为什么 $3d_{z^2}$ 的环与两瓣颜色不同？ Answer: $3\cos^2\theta-1$ is positive near the $z$ axis and negative near the $xy$ plane. The sign flips across the cones, so the phases differ by $\pi$.
    - **6.3** 把包围概率从 0.9 提高到 0.95，轨道“变大”了吗？ Answer: the surface moves outward because $c$ decreases, but the state is unchanged.
    - **6.4** 密度等值面能显示 $\psi$ 的正负号吗？ Answer: its shape cannot, because $\lvert\psi\rvert^2\ge0$ everywhere; its colour (phase) can. Chapter 7 shows the sign directly with $\operatorname{Re}\psi$ slices.
  - `## 延伸阅读 {#further-reading}`:
    - [可视对象语义](../concepts/semantics.md);
    - [纠错账本](../references/corrections.md);
    - [第 3 章](03-radial-nodes.md);
    - [第 5 章](05-electron-cloud.md).
  - **Draws on:** `docs/tutorials/phase-0-walkthrough.md:26-34`, `docs/concepts/semantics.md:7-28`, `docs/tutorials/frontend-rendering.md:57-61`, `docs/references/corrections.md:35-41,105-107`, `docs/tutorials/hydrogenic-orbitals.md:49-59`.
  - **Citations (only these):**
    - `[@solara-orbital-plot; @numpy-meshgrid; @skimage-marching-cubes]`;
    - `[@skimage-marching-cubes]`;
    - `[@dlmf-spherical-harmonics, eq. 14.30.3]`;
    - `[@orbitron]`;
    - `[@floatheadphysics2025-orbitals, 21:58--24:08]`.
  - **Physics accuracy:** do not name any specific state as "refused". Whether a surface is refused depends on Part A's exporter and the server; the chapter states the rule only.

- [ ] **Step 3b: Write `docs/textbook/07-phase-slices.md`.**
  - **H1:** `# 第 7 章 相位与平面切片`
  - `## 学习目标 {#goals}`:
    - pick a principal plane and one of the four fields;
    - read the three colour maps;
    - distinguish the phase mask from a node;
    - predict how a global phase changes each slice.
  - `## 三个主平面 {#planes}`.
    - xy ($z=0$), xz ($y=0$) and yz ($x=0$), each through the origin with a right-handed frame.
    - The lab looks along the plane's normal (`docs/tutorials/phase-0-walkthrough.md:36-42`).
  - `## 四种场 {#four-fields}`.
    - The four fields are $\lvert\psi\rvert^2$, $\operatorname{Re}\psi$, $\operatorname{Im}\psi$ and $\arg\psi$.
    - For real-basis eigenstates $\operatorname{Im}\psi\equiv0$, so the Im slice is uniformly neutral.
    - For complex $m\ne0$, Re and Im show the $\cos m\phi$ and $\sin m\phi$ patterns.
    - Place **Figure 7.1** and **Figure 7.2**:

```markdown
<figure class="quviz-figure" data-lab="mode=eigenstate&n=2&l=1&m=0&basis=real&rep=slice&plane=xz&obs=wavefunction_real" markdown>
**图 7.1** 实基 $2p_z$ 在 $xz$ 平面上的 $\operatorname{Re}\psi$：上半平面为正（红）、下半平面为负（青），零值线就是 $z=0$ 的节面。
</figure>
```

```markdown
<figure class="quviz-figure" data-lab="mode=eigenstate&n=3&l=2&m=2&basis=complex&rep=slice&plane=xy&obs=wavefunction_real" markdown>
**图 7.2** 复基 $3d$、$m=2$ 在 $xy$ 平面上的 $\operatorname{Re}\psi\propto\cos2\phi$：正负四瓣交替；切换到 $\operatorname{Im}\psi$ 会看到同样的图案绕 $z$ 轴转过 $45^\circ$。
</figure>
```

  - `## 色图 {#colour-maps}`. Three maps; the legend pill always names the active one (`docs/tutorials/phase-0-walkthrough.md:44-46`, `docs/tutorials/real-vs-complex.md:47-58`, `docs/tutorials/frontend-rendering.md:63-73`):
    - **Density.** A sequential map from dark neutral through blue to pale blue, with brightness $\propto\lvert\psi\rvert/\max\lvert\psi\rvert=\sqrt{\rho/\rho_{\max}}$, so faint regions stay visible.
    - **Re/Im.** A diverging map: cyan at $-A$, neutral at 0 and red at $+A$, where $A$ is the largest absolute value on this plane. Every slice is normalised to its own extremum, so compare shapes, not magnitudes, across slices.
    - **Phase.** The periodic wheel.
    - Place **Figure 7.3** and **Figure 7.4**:

```markdown
<figure class="quviz-figure" data-lab="mode=eigenstate&n=2&l=1&m=1&basis=complex&rep=slice&plane=xy&obs=phase" markdown>
**图 7.3** 复基 $2p$、$m=+1$ 在 $xy$ 平面上的相位 $\arg\psi$：沿逆时针方向增加一整圈 $2\pi$；由于 Condon–Shortley 相位，$+x$ 轴上的相位是 $\pi$（青）。原点处 $\psi=0$，被遮罩为透明。
</figure>
```

```markdown
<figure class="quviz-figure" data-lab="mode=eigenstate&n=2&l=1&m=-1&basis=complex&rep=slice&plane=xy&obs=phase" markdown>
**图 7.4** 复基 $2p$、$m=-1$ 在同一平面上的相位：绕行方向与图 7.3 相反，$+x$ 轴上的相位是 0（红）。两者的 $\lvert\psi\rvert^2$ 完全相同。
</figure>
```

  - `## 相位遮罩 {#phase-mask}`.
    - Where $\lvert\psi\rvert$ is too small the phase is numerically meaningless, so those texels are transparent.
    - The mask is not a certificate of a node (`docs/concepts/semantics.md:46`).
  - `## 全局相位与切片 {#global-phase}`.
    - Multiplying by $e^{i\alpha}$ leaves $\lvert\psi\rvert^2$ unchanged and rotates the pair (Re, Im): $\operatorname{Re}\psi'=\cos\alpha\operatorname{Re}\psi-\sin\alpha\operatorname{Im}\psi$ and $\operatorname{Im}\psi'=\sin\alpha\operatorname{Re}\psi+\cos\alpha\operatorname{Im}\psi$.
    - The phase wheel shifts by $\alpha$, but phase differences between points do not change.
    - Mention in plain text that chapter 9 meets this again as a degenerate superposition whose Re/Im slices rotate while the density stays still.
    - Cite `[@dlmf-spherical-harmonics, eqs. 14.30.3, 14.30.6, and 14.30.11_5]` for the phase conventions of $Y_\ell^m$.
  - `## 常见误区 {#misconceptions}`:
    - "切片上透明的地方就是节面";
    - "$\operatorname{Re}\psi$ 的红和青是正负电荷";
    - "相位也可以用普通彩虹色条表示": it needs a periodic wheel with no artificial break at $\pm\pi$.
  - `## 思考题 {#exercises}`:
    - **7.1** 在 $xz$ 平面上，$\lvert\psi\rvert^2$ 和 $\operatorname{Re}\psi$ 哪个更能显示 $2p_z$ 的节面？ Answer: $\operatorname{Re}\psi$. Its sign flips across $z=0$, while the density shows only a dark line.
    - **7.2** 复基 $2p$、$m=+1$ 在 $xy$ 平面上的 $\operatorname{Re}\psi$ 与 $\operatorname{Im}\psi$ 有什么关系？ Answer: with the Condon–Shortley minus sign, $\operatorname{Re}\psi\propto-\cos\phi$ and $\operatorname{Im}\psi\propto-\sin\phi$: the same two-lobe pattern rotated by $90^\circ$.
    - **7.3** 为什么 $2p$ 态在原点处的相位无法着色？ Answer: $R_{21}\propto r$, so $\psi(0)=0$ and $\arg\psi$ is undefined there. The mask removes it.
    - **7.4** 把 $\psi$ 乘以 $i$，四种切片各怎样变化？ Answer:
      - $\lvert\psi\rvert^2$ is unchanged;
      - the new $\operatorname{Re}$ is minus the old $\operatorname{Im}$;
      - the new $\operatorname{Im}$ is the old $\operatorname{Re}$;
      - $\arg\psi$ increases by $\pi/2$ everywhere, so the wheel turns a quarter.
  - `## 延伸阅读 {#further-reading}`:
    - [实轨道与复轨道](../tutorials/real-vs-complex.md);
    - [可视对象语义](../concepts/semantics.md);
    - [第 4 章](04-real-complex.md);
    - [第 6 章](06-isosurface.md);
    - `[@griffiths2018qm, ch. 4 (pp. 131--197)]`.
  - **Draws on:** `docs/tutorials/phase-0-walkthrough.md:36-49`, `docs/tutorials/real-vs-complex.md:39-58`, `docs/tutorials/frontend-rendering.md:63-73`, `docs/concepts/semantics.md:18,44-46`, `tests/test_slice_science.py:396-406`.
  - **Citations (only these):** `[@dlmf-spherical-harmonics, eqs. 14.30.3, 14.30.6, and 14.30.11_5]`, `[@griffiths2018qm, ch. 4 (pp. 131--197)]`.

- [ ] **Step 4: Nav + index.** Insert after the chapter 5 nav line:

```yaml
      - 6 等值面：轨道的“形状”: textbook/06-isosurface.md
      - 7 相位与平面切片: textbook/07-phase-slices.md
```

Append to the index table:

```markdown
| 6 | [等值面：轨道的“形状”](06-isosurface.md) | 轨道的“边界”是怎样选出来的？ |
| 7 | [相位与平面切片](07-phase-slices.md) | 怎样在一张平面上读出波函数的符号与相位？ |
```

- [ ] **Step 5: Run and see it pass** (shared rule 5).

- [ ] **Step 6: Physics self-check** *(bash)*.

```bash
uv run --locked --no-sync python -c 'import numpy as np
from scipy.optimize import brentq
from quviz.physics.hydrogenic import hydrogenic_wavefunction as psi
print(round(brentq(lambda R: 1 - np.exp(-2 * R) * (1 + 2 * R + 2 * R**2) - 0.9, 0.5, 10), 3))
r = np.array([3.0, 3.0]); th = np.array([np.pi / 2, np.pi / 2]); ph = np.array([0.0, np.pi / 2])
for m in (1, -1): print(m, np.round(np.angle(psi(2, 1, m, r, th, ph, basis="complex")), 4).tolist())
v = psi(3, 2, 2, np.array([4.0, 4.0]), np.array([np.pi / 2] * 2), np.array([0.0, np.pi / 4]), basis="complex"); print(np.round(v.real, 6).tolist(), np.round(v.imag, 6).tolist())
w = psi(3, 2, 0, np.array([6.0, 6.0]), np.array([0.0, np.pi / 2]), np.array([0.0, 0.0]), basis="real"); print(np.sign(w).tolist())'
```

Expected:

```text
2.661
1 [3.1416, -1.5708]
-1 [0.0, -1.5708]
[0.014688, 0.0] [0.0, 0.014688]
[1.0, -1.0]
```

The lines check, in order:
- $R_{0.9}$;
- the phases of $m=\pm1$ at $+x$ and $+y$;
- the $3d$, $m=2$ values at $\phi=0$ and $\phi=\pi/4$ (Re is peaked where Im is zero, i.e. $\cos2\phi$ versus $\sin2\phi$);
- the sign of $3d_{z^2}$ on the $z$ axis versus the $xy$ plane (lobes versus ring).

- [ ] **Step 7: Pre-commit gate, then commit.** This commit changes `tests/test_textbook.py`, so the full Python gate runs first (CLAUDE.md, spec §6).

Run: `uv run --locked --group docs pytest --cov=quviz --cov-report=term-missing`
Expected: exit 0. The summary line reports only `passed`, with no `failed`, `error`, `skipped`, `xfailed` or `xpassed`, and the output contains `Required test coverage of 85% reached.` If anything is red, fix it and re-run this step; do not commit.
Run: `uv run --locked ruff check tests/test_textbook.py && uv run --locked ruff format --check tests/test_textbook.py`
Expected: `All checks passed!` and `1 file already formatted`.

```bash
git add docs/textbook/06-isosurface.md docs/textbook/07-phase-slices.md docs/textbook/index.md mkdocs.yml tests/test_textbook.py
git commit -m "docs(textbook): add chapters on isosurfaces and on phase and plane slices" -m "Claude-Session: https://claude.ai/code/session_01E44DEzsc7Av26fc7nZ5rSo"
```

---

### Task C11: Chapter 8 (probability current)

**Files:**
- Create: `docs/textbook/08-probability-current.md`
- Modify: `tests/test_textbook.py`, `mkdocs.yml`, `docs/textbook/index.md`

**Interfaces:**
- Consumes: the Task C5 registry, and the textbook catalogue's streamline states (complex $m\ne0$, 48 seed lines; contracts `spec.json`).
- Produces: the anchors `08-probability-current.md#{current,continuity,real-states,complex-states,streamlines,not-trajectories}`.

- [ ] **Step 1: Register (failing test).** Append to `CHAPTERS`:

```python
    "08-probability-current.md": Chapter(
        sections=(
            "goals",
            "current",
            "continuity",
            "real-states",
            "complex-states",
            "streamlines",
            "not-trajectories",
            "misconceptions",
            "exercises",
            "further-reading",
        ),
        figures=(
            "mode=eigenstate&n=2&l=1&m=1&basis=complex&rep=streamlines",
            "mode=eigenstate&n=2&l=1&m=-1&basis=complex&rep=streamlines",
            "mode=eigenstate&n=3&l=2&m=2&basis=complex&rep=streamlines",
        ),
    ),
```

- [ ] **Step 2: Run and see it fail** (shared rule 2).

- [ ] **Step 3: Write `docs/textbook/08-probability-current.md`.**
  - **H1:** `# 第 8 章 概率流`
  - `## 学习目标 {#goals}`:
    - write $\mathbf j$ and the continuity equation;
    - explain why real states carry no current while complex $m\ne0$ states circulate;
    - compute streamline speed and period;
    - keep streamlines separate from trajectories.
  - `## 概率流密度 {#current}`.

    $$\mathbf j=\frac{\hbar}{\mu}\operatorname{Im}\left(\psi^*\nabla\psi\right)$$

    - $\mu$ is the reduced mass, and $\mu\to m_e$ for an infinitely heavy nucleus.
    - Cite `[@griffiths2018qm, problem 4.49, eqs. (4.220)--(4.221), pp. 187--188; @probability-current-wikipedia]`.
  - `## 连续性方程 {#continuity}`.

    $$\frac{\partial\rho}{\partial t}+\nabla\cdot\mathbf j=0$$

    - For a stationary state $\partial\rho/\partial t=0$ only forces $\nabla\cdot\mathbf j=0$, not $\mathbf j=0$ (`docs/concepts/probability-current.md:1-44`).
  - `## 实波函数没有流 {#real-states}`.
    - When $\psi$ is real, $\psi^*\nabla\psi=\psi\nabla\psi$ is real, so $\mathbf j=0$. This holds for $2p_z$ and for every real-basis orbital.
    - Choosing streamlines on a real state in the lab gives an empty result with its reason. That is a physics negative control, not a loading failure (`docs/tutorials/phase-0-walkthrough.md:51-61`).
  - `## 复本征态的环流 {#complex-states}`.

    $$\mathbf j=\frac{\hbar m}{\mu\,r\sin\theta}\,\lvert\psi\rvert^2\,\mathbf e_\phi$$

    - $m$ and $-m$ have identical densities but opposite circulation; only phase colour and current tell them apart.
    - Place **Figure 8.1** and **Figure 8.2**:

```markdown
<figure class="quviz-figure" data-lab="mode=eigenstate&n=2&l=1&m=1&basis=complex&rep=streamlines" markdown>
**图 8.1** 复基 $2p$、$m=+1$ 的概率流线：每条线都是绕 $z$ 轴的水平圆，从 $+z$ 往下看沿逆时针方向；颜色表示速率 $\lvert\mathbf j\rvert/\rho$，含义以图例胶囊为准。
</figure>
```

```markdown
<figure class="quviz-figure" data-lab="mode=eigenstate&n=2&l=1&m=-1&basis=complex&rep=streamlines" markdown>
**图 8.2** 复基 $2p$、$m=-1$ 的概率流线：密度与图 8.1 完全相同，但环流方向相反。
</figure>
```

  - `## 流线 {#streamlines}`.

    $$\mathbf v=\frac{\mathbf j}{\rho}=\frac{\hbar m}{\mu}\,\frac{(-y,\,x,\,0)}{x^2+y^2}$$

    - Every streamline is a circle of constant cylinder radius $s=\sqrt{x^2+y^2}$ and constant $z$. The angular speed is $\hbar m/(\mu s^2)$ and the period is $2\pi\mu s^2/(\hbar m)$.
    - Streamlines start where the density is appreciable; the textbook catalogue uses 48 seed lines. Colour encodes speed.
    - QuViz's integrator is written for a general velocity field and does not know the answer is a circle, so closed circles are an independent check (`docs/concepts/probability-current.md:56-70`).
    - Place **Figure 8.3**:

```markdown
<figure class="quviz-figure" data-lab="mode=eigenstate&n=3&l=2&m=2&basis=complex&rep=streamlines" markdown>
**图 8.3** 复基 $3d$、$m=2$ 的概率流线：同样是绕 $z$ 轴的圆，角速度 $\hbar m/(\mu s^2)$ 随柱半径 $s$ 增大而减小，靠近 $z$ 轴的圆转得最快。
</figure>
```

  - `## 流线不是轨迹 {#not-trajectories}`.
    - Streamlines show probability transport, not measured electron paths. Only under an explicitly adopted Bohmian interpretation would they be called trajectories (`docs/concepts/probability-current.md:46-54`).
    - Mention in plain text that chapter 9 shows non-circular, time-dependent streamlines in a superposition.
  - `## 常见误区 {#misconceptions}`:
    - "定态的电子是静止的，没有流";
    - "流线就是电子的轨道";
    - "密度相同的两个态无法区分": $m$ and $-m$ are told apart by phase and current.
  - `## 思考题 {#exercises}`:
    - **8.1** 证明任何实波函数的概率流为零。 Answer: $\psi^*=\psi$, so $\psi^*\nabla\psi$ is real and its imaginary part vanishes.
    - **8.2** 复基 $2p$、$m=+1$ 在 $(x,y,z)=(4,0,0)\,a_0$ 处的 $\mathbf v$ 是多少（原子单位，$\mu=1$）？ Answer: $\mathbf v=(0,4,0)/16=(0,0.25,0)$ a.u., along $+y$ (counter-clockwise seen from $+z$).
    - **8.3** 复基 $3d$、$m=2$ 在柱半径 $s=2a_0$ 处的流线转一圈要多久？ Answer: the angular speed is $m/s^2=0.5$, so $T=4\pi\approx12.57\,\hbar/E_h$.
    - **8.4** 密度不随时间变化，概率流却不为零，这与连续性方程矛盾吗？ Answer: no. $j_\phi$ does not depend on $\phi$, so $\nabla\cdot\mathbf j=0=-\partial\rho/\partial t$.
  - `## 延伸阅读 {#further-reading}`:
    - [概率流](../concepts/probability-current.md);
    - [第 4 章](04-real-complex.md);
    - [第 7 章](07-phase-slices.md);
    - `[@griffiths2018qm, problem 4.49, eqs. (4.220)--(4.221), pp. 187--188]`.
  - **Draws on:** `docs/concepts/probability-current.md:1-84`, `docs/tutorials/phase-0-walkthrough.md:51-64`, `docs/tutorials/real-vs-complex.md:3-13`.
  - **Citations (only these):** `[@griffiths2018qm, problem 4.49, eqs. (4.220)--(4.221), pp. 187--188; @probability-current-wikipedia]`, `[@griffiths2018qm, problem 4.49, eqs. (4.220)--(4.221), pp. 187--188]`.
  - **Physics accuracy:** keep $\mu$ (not $m$), consistent with `docs/concepts/probability-current.md`. Also avoid the letter clash between the mass and the magnetic quantum number $m$ by always writing the mass as $\mu$.

- [ ] **Step 4: Nav + index.** Insert after the chapter 7 nav line:

```yaml
      - 8 概率流: textbook/08-probability-current.md
```

Append to the index table:

```markdown
| 8 | [概率流](08-probability-current.md) | 密度不随时间变化，概率还能流动吗？ |
```

- [ ] **Step 5: Run and see it pass** (shared rule 5).

- [ ] **Step 6: Physics self-check** *(bash)*. This checks the speeds with an independent finite difference of $\operatorname{Im}(\psi^*\partial_y\psi)/\lvert\psi\rvert^2$ on the project's wavefunctions.

```bash
uv run --locked --no-sync python -c 'import numpy as np
from quviz.physics.hydrogenic import hydrogenic_wavefunction as psi, cartesian_to_spherical as sph
def f(n, l, m, x, y, z):
    r, th, ph = sph(np.array([x]), np.array([y]), np.array([z]))
    return psi(n, l, m, r, th, ph, basis="complex")[0]
h = 1e-5
for n, l, m, x, y in ((2, 1, 1, 4.0, 0.0), (2, 1, -1, 4.0, 0.0), (3, 2, 2, 2.0, 0.0)):
    p = f(n, l, m, x, y, 0.0); vy = ((np.conj(p) * (f(n, l, m, x, y + h, 0.0) - f(n, l, m, x, y - h, 0.0)) / (2 * h)).imag) / abs(p) ** 2
    print(n, l, m, round(float(vy), 6), round(2 * np.pi * x / abs(vy), 4))'
```

Expected (columns: $n,\ell,m$, $v_y$, period):

```text
2 1 1 0.25 100.531
2 1 -1 -0.25 100.531
3 2 2 1.0 12.5664
```

- [ ] **Step 7: Pre-commit gate, then commit.** This commit changes `tests/test_textbook.py`, so the full Python gate runs first (CLAUDE.md, spec §6).

Run: `uv run --locked --group docs pytest --cov=quviz --cov-report=term-missing`
Expected: exit 0. The summary line reports only `passed`, with no `failed`, `error`, `skipped`, `xfailed` or `xpassed`, and the output contains `Required test coverage of 85% reached.` If anything is red, fix it and re-run this step; do not commit.
Run: `uv run --locked ruff check tests/test_textbook.py && uv run --locked ruff format --check tests/test_textbook.py`
Expected: `All checks passed!` and `1 file already formatted`.

```bash
git add docs/textbook/08-probability-current.md docs/textbook/index.md mkdocs.yml tests/test_textbook.py
git commit -m "docs(textbook): add the probability-current chapter" -m "Claude-Session: https://claude.ai/code/session_01E44DEzsc7Av26fc7nZ5rSo"
```

---

### Task C12: Chapter 9 (superposition and time evolution)

**Files:**
- Create: `docs/textbook/09-superposition-time.md`
- Modify: `tests/test_textbook.py`, `mkdocs.yml`, `docs/textbook/index.md`

**Interfaces:**
- Consumes:
  - the Task C5 registry and `playback_frames` (the frame lattice);
  - the catalogue presets `1s-2pz` (period 16.755), `1s-3dz2` (14.137), `2s-2pz` (0) and `2pplus-2pminus` (0) (`src/quviz/api/routes.py:574-607`).
- Produces: the anchors `09-superposition-time.md#{time-evolution,interference,bohr-oscillation,quadrupole-breathing,degenerate-controls,playback}`.

- [ ] **Step 1: Register (failing test).** Append to `CHAPTERS`:

```python
    "09-superposition-time.md": Chapter(
        sections=(
            "goals",
            "time-evolution",
            "interference",
            "bohr-oscillation",
            "quadrupole-breathing",
            "degenerate-controls",
            "playback",
            "misconceptions",
            "exercises",
            "further-reading",
        ),
        figures=(
            "mode=superposition&preset=1s-2pz&t=0&rep=slice&plane=xz&obs=probability_density",
            "mode=superposition&preset=1s-2pz&t=8.4&rep=slice&plane=xz&obs=probability_density",
            "mode=superposition&preset=1s-2pz&t=4.2&rep=streamlines",
            "mode=superposition&preset=1s-3dz2&t=7&rep=slice&plane=xz&obs=probability_density",
            "mode=superposition&preset=2s-2pz&t=0&rep=slice&plane=xz&obs=probability_density",
        ),
    ),
```

- [ ] **Step 2: Run and see it fail** (shared rule 2).

- [ ] **Step 3: Write `docs/textbook/09-superposition-time.md`.**
  - **H1:** `# 第 9 章 叠加态与时间演化`
  - `## 学习目标 {#goals}`:
    - write $\Psi(\mathbf r,t)$ for a superposition of stationary states;
    - find the beat frequency from energy differences;
    - predict whether a superposition moves;
    - read the Bohr oscillation and the degenerate negative controls in the lab.
  - `## 定态与时间因子 {#time-evolution}`.

    $$i\hbar\frac{\partial\Psi}{\partial t}=\hat H\Psi$$

    - A stationary state evolves as $\psi_k\,e^{-iE_kt/\hbar}$. A superposition evolves as

      $$\Psi(\mathbf r,t)=\sum_kc_k\,\psi_k(\mathbf r)\,e^{-iE_kt/\hbar},\qquad\sum_k\lvert c_k\rvert^2=1$$

    - The lab evaluates this exactly with the phase factors; there is no numerical time stepping (`docs/project/roadmap.md:20-30`).
    - Cite `[@griffiths2018qm; @science-asylum2020-orbitals]`.
    - Energies come from [第 2 章](02-hydrogen-levels.md#energy-levels).
  - `## 干涉项与拍频 {#interference}`.

    $$\lvert\Psi\rvert^2=\lvert c_1\rvert^2\lvert\psi_1\rvert^2+\lvert c_2\rvert^2\lvert\psi_2\rvert^2+2\operatorname{Re}\!\left[c_1^*c_2\,\psi_1^*\psi_2\,e^{-i\omega t}\right],\qquad\omega=\frac{E_2-E_1}{\hbar}$$

    - The period is $T=2\pi/\omega$. When $E_1=E_2$ nothing in $\lvert\Psi\rvert^2$ depends on $t$.
    - Cite `[@griffiths2018qm, ch. 4 (pp. 131--197)]` for $E_n$.
  - `## 1s + 2p_z：Bohr 振荡 {#bohr-oscillation}`.
    - $\omega=E_2-E_1=\tfrac38$ Ha, so $T=16\pi/3\approx16.755\,\hbar/E_h\approx0.405$ fs.
    - The dipole:

      $$\langle z\rangle(t)=\frac{2^7\sqrt2}{3^5}\,a_0\cos\omega t\approx0.745\,a_0\cos\omega t$$

      This is the textbook 1s–2p transition dipole (`docs/project/roadmap.md:34-41`).
    - Moving density requires a current (continuity, chapter 8, linked as [第 8 章](08-probability-current.md)).
    - Place **Figures 9.1–9.3**:

```markdown
<figure class="quviz-figure" data-lab="mode=superposition&preset=1s-2pz&t=0&rep=slice&plane=xz&obs=probability_density" markdown>
**图 9.1** $(\psi_{1s}+\psi_{2p_z})/\sqrt2$ 在 $t=0$ 的 $xz$ 平面概率密度：两项同相，干涉项让密度偏向 $+z$，$\langle z\rangle\approx+0.745\,a_0$。
</figure>
```

```markdown
<figure class="quviz-figure" data-lab="mode=superposition&preset=1s-2pz&t=8.4&rep=slice&plane=xz&obs=probability_density" markdown>
**图 9.2** 同一叠加态在 $t=8.4\,\hbar/E_h$（约半个周期）：相对相位转过约 $\pi$，密度偏向 $-z$，$\langle z\rangle\approx-0.745\,a_0$。
</figure>
```

```markdown
<figure class="quviz-figure" data-lab="mode=superposition&preset=1s-2pz&t=4.2&rep=streamlines" markdown>
**图 9.3** 同一叠加态在 $t=4.2\,\hbar/E_h$（约四分之一周期）的概率流线：此刻 $\Psi$ 不能再取为实函数，概率正从 $+z$ 一侧流向 $-z$ 一侧；$t=0$ 时 $\Psi$ 是实函数，流恰好为零。
</figure>
```

  - `## 1s + 3d_z²：四极“呼吸” {#quadrupole-breathing}`. Headings contain no braces other than the trailing id, and no `$…$`.
    - $\omega=E_3-E_1=\tfrac49$ Ha, so $T=9\pi/2\approx14.137\,\hbar/E_h\approx0.342$ fs.
    - Both terms are even under $\mathbf r\to-\mathbf r$, so the density is even and $\langle z\rangle=0$ at all times.
    - The cross term is proportional to $R_{10}R_{32}(3\cos^2\theta-1)\cos\omega t$: the density stretches along $z$ at $t=0$ and flattens toward the $xy$ plane half a period later.
    - Place **Figure 9.4**:

```markdown
<figure class="quviz-figure" data-lab="mode=superposition&preset=1s-3dz2&t=7&rep=slice&plane=xz&obs=probability_density" markdown>
**图 9.4** $(\psi_{1s}+\psi_{3d_{z^2}})/\sqrt2$ 在 $t=7\,\hbar/E_h$（约半个周期）的 $xz$ 平面概率密度：与 $t=0$ 相比，沿 $z$ 轴的密度减弱、$xy$ 平面附近增强；密度始终关于 $z=0$ 对称，$\langle z\rangle=0$。
</figure>
```

  - `## 能量简并的负对照 {#degenerate-controls}`.
    - $(\psi_{2s}+\psi_{2p_z})/\sqrt2$: $E_{2s}=E_{2p}$, so $\Psi(t)=e^{-iE_2t/\hbar}\Psi(0)$ changes only by a global phase.
    - The density is static even though it is lopsided: $\langle z\rangle=\langle200\lvert z\rvert210\rangle=-3a_0$ at every time.
    - Re/Im slices would rotate with the global phase (as described in [第 7 章](07-phase-slices.md#global-phase)), but the density never moves. Any motion of this density in a picture is a bug (`docs/project/roadmap.md:43`).
    - 2p(+1) + 2p(−1) from [第 4 章](04-real-complex.md#basis-change) is also degenerate and carries zero current.
    - Place **Figure 9.5**:

```markdown
<figure class="quviz-figure" data-lab="mode=superposition&preset=2s-2pz&t=0&rep=slice&plane=xz&obs=probability_density" markdown>
**图 9.5** 简并叠加态 $(\psi_{2s}+\psi_{2p_z})/\sqrt2$ 的概率密度：明显偏向 $-z$（$\langle z\rangle=-3a_0$），但两项能量相同，这张图在任何时刻都不变。
</figure>
```

  - `## 实验室里的时间 {#playback}`.
    - The lab divides one period into $\lceil T/0.6\rceil$ frames, each snapped to a $0.2\,\hbar/E_h$ lattice:
      - 28 frames $0,0.6,\dots,16.2$ for 1s + 2p_z;
      - 24 frames for 1s + 3d_z², with a step from 5.4 to 5.8.
    - The textbook catalogue precomputes exactly these frames. Degenerate presets exist only at $t=0$, and the 时间胶囊 then reads “能量简并：密度不随时间变化”.
    - The time unit is $\hbar/E_h\approx24.19$ as.
  - `## 常见误区 {#misconceptions}`:
    - "叠加态是电子在两个轨道之间来回跳": it is one $\Psi$ whose density changes continuously.
    - "任何叠加态都会随时间变化": degenerate combinations are stationary.
    - "切片的颜色在转，说明态在变化": a global phase rotates Re/Im but changes no observable.
    - "实验室里的时间演化是数值积分出来的": it uses exact analytic phase factors.
  - `## 思考题 {#exercises}`:
    - **9.1** 1s + 2p_z 的振荡周期是多少飞秒？ Answer: $T=16\pi/3\approx16.755\,\hbar/E_h$. Since $\hbar/E_h\approx24.19$ as, $T\approx405$ as $\approx0.405$ fs.
    - **9.2** 2s + 2p_z 的密度明显偏向 $-z$，为什么却不动？ Answer: equal energies keep the relative phase constant, so $\lvert\Psi\rvert^2$ does not depend on $t$. $\langle z\rangle=-3a_0$ is a static dipole; chapter 10 (plain text) meets this state again.
    - **9.3** 为什么 1s + 3d_z² 的 $\langle z\rangle$ 恒为零？ Answer: both terms have even parity ($\ell=0,2$), so the density is even and $\langle z\rangle=0$. The motion is quadrupolar.
    - **9.4** 为什么实验室里 1s + 2p_z 一个周期正好 28 帧？ Answer: $\lceil16.755/0.6\rceil=28$. The times, snapped to 0.2, are $0,0.6,\dots,16.2$, after which playback wraps to 0.
    - **9.5** 如果系数改为 $(\psi_{1s}+i\,\psi_{2p_z})/\sqrt2$，$t=0$ 时 $\langle z\rangle$ 是多少？ Answer: $\langle z\rangle(t)=2\operatorname{Re}[c_1^*c_2\,d\,e^{-i\omega t}]=\operatorname{Re}[i\,d\,e^{-i\omega t}]=d\sin\omega t$, which is 0 at $t=0$. The motion is shifted by a quarter period.
  - `## 延伸阅读 {#further-reading}`:
    - [概率流](../concepts/probability-current.md);
    - [开发路线图](../project/roadmap.md) (the three independent checks of the analytic superposition);
    - [第 7 章](07-phase-slices.md);
    - [第 8 章](08-probability-current.md);
    - `[@griffiths2018qm, problem 4.49, eqs. (4.220)--(4.221), pp. 187--188]`.
  - **Draws on:** `docs/project/roadmap.md:20-47`, `docs/tutorials/phase-0-walkthrough.md:66-80`, `docs/tutorials/sampling.md:39-56`, `docs/tutorials/frontend-rendering.md:20`, `docs/concepts/probability-current.md:70`.
  - **Citations (only these):** `[@griffiths2018qm; @science-asylum2020-orbitals]`, `[@griffiths2018qm, ch. 4 (pp. 131--197)]`, `[@griffiths2018qm, problem 4.49, eqs. (4.220)--(4.221), pp. 187--188]`.
  - **Physics accuracy:**
    - $\langle200\lvert z\rvert210\rangle=-3a_0$, so with equal positive coefficients the lobe points to $-z$.
    - $t=8.4$ is $0.5013\,T$, so the phrase is "约半个周期".
    - The $1s$+$3d_{z^2}$ frame $t=7$ is $0.495\,T$.
    - Do not use the words "Phase 0" or a test path in the text.

- [ ] **Step 4: Nav + index.** Insert after the chapter 8 nav line:

```yaml
      - 9 叠加态与时间演化: textbook/09-superposition-time.md
```

Append to the index table:

```markdown
| 9 | [叠加态与时间演化](09-superposition-time.md) | 什么样的叠加态会动，动的频率是多少？ |
```

- [ ] **Step 5: Run and see it pass** (shared rule 5).

- [ ] **Step 6: Physics self-check** *(bash)*.

```bash
uv run --locked --no-sync python -c 'import math
import numpy as np
from quviz.physics.hydrogenic import radial_wavefunction as R
r = np.linspace(0, 80, 400001)
d12 = np.trapezoid(R(1, 0, r) * R(2, 1, r) * r**3, r) / math.sqrt(3)
d22 = np.trapezoid(R(2, 0, r) * R(2, 1, r) * r**3, r) / math.sqrt(3)
print(round(float(d12), 6), round(128 * math.sqrt(2) / 243, 6), round(float(d22), 6))
w1, w2 = 0.5 - 0.125, 0.5 - 1 / 18
print([round(float(d12) * math.cos(w1 * t), 4) for t in (0, 4.2, 8.4)])
print(round(2 * math.pi / w1, 3), round(2 * math.pi / w2, 3), round(2 * math.pi / w1 * 0.024188843, 3), round(2 * math.pi / w2 * 0.024188843, 3))'
```

Expected:

```text
0.744936 0.744936 -3.0
[0.7449, -0.0031, -0.7449]
16.755 14.137 0.405 0.342
```

Also re-run `uv run --locked --group docs pytest tests/test_textbook.py -q -k playback`. Expected: 1 passed; it pins the 28/24-frame lattices quoted in the `playback` section.

- [ ] **Step 7: Pre-commit gate, then commit.** This commit changes `tests/test_textbook.py`, so the full Python gate runs first (CLAUDE.md, spec §6).

Run: `uv run --locked --group docs pytest --cov=quviz --cov-report=term-missing`
Expected: exit 0. The summary line reports only `passed`, with no `failed`, `error`, `skipped`, `xfailed` or `xpassed`, and the output contains `Required test coverage of 85% reached.` If anything is red, fix it and re-run this step; do not commit.
Run: `uv run --locked ruff check tests/test_textbook.py && uv run --locked ruff format --check tests/test_textbook.py`
Expected: `All checks passed!` and `1 file already formatted`.

```bash
git add docs/textbook/09-superposition-time.md docs/textbook/index.md mkdocs.yml tests/test_textbook.py
git commit -m "docs(textbook): add the superposition and time-evolution chapter" -m "Claude-Session: https://claude.ai/code/session_01E44DEzsc7Av26fc7nZ5rSo"
```

---

### Task C13: Chapter 10 (from density to experiment) and chapter 11 (symmetry and hybridization)

**Files:**
- Create: `docs/textbook/10-experiment.md`, `docs/textbook/11-symmetry-hybridization.md`
- Modify: `tests/test_textbook.py`, `mkdocs.yml`, `docs/textbook/index.md`

**Interfaces:**
- Consumes: the Task C5 registry; the degenerate preset `2s-2pz` (slices only, because its isosurface is in `KNOWN_REFUSED`).
- Produces: the anchors `10-experiment.md#{measurement-chain,stark-microscopy,forward-model,what-the-lab-shows,repeated-measurements}` and `11-symmetry-hybridization.md#{basis-freedom,sp3,tetrahedral-angle,what-symmetry-decides,what-symmetry-cannot,hybrids-in-the-lab}`.

- [ ] **Step 1: Register (failing test).** Append to `CHAPTERS`:

```python
    "10-experiment.md": Chapter(
        sections=(
            "goals",
            "measurement-chain",
            "stark-microscopy",
            "forward-model",
            "what-the-lab-shows",
            "repeated-measurements",
            "misconceptions",
            "exercises",
            "further-reading",
        ),
        figures=(
            "mode=superposition&preset=2s-2pz&t=0&rep=slice&plane=xz&obs=probability_density",
            "mode=eigenstate&n=3&l=1&m=0&basis=real&rep=point_cloud",
        ),
    ),
    "11-symmetry-hybridization.md": Chapter(
        sections=(
            "goals",
            "basis-freedom",
            "sp3",
            "tetrahedral-angle",
            "what-symmetry-decides",
            "what-symmetry-cannot",
            "hybrids-in-the-lab",
            "misconceptions",
            "exercises",
            "further-reading",
        ),
        figures=(
            "mode=eigenstate&n=2&l=1&m=0&basis=real&rep=isosurface",
            "mode=superposition&preset=2s-2pz&t=0&rep=slice&plane=xz&obs=wavefunction_real",
        ),
    ),
```

- [ ] **Step 2: Run and see it fail** (shared rule 2).

- [ ] **Step 3a: Write `docs/textbook/10-experiment.md`.**
  - **H1:** `# 第 10 章 从密度到实验图样`
  - `## 学习目标 {#goals}`:
    - place the measurement model between state and representation;
    - describe what photoionization microscopy of Stark states did and did not show;
    - write the schematic forward model;
    - say which lab pictures are intrinsic observables and which would need a detector model.
  - `## 测量链 {#measurement-chain}`.

    $$\text{state preparation}\rightarrow\text{Stark state}\rightarrow\text{photoionization}\rightarrow\text{continuum propagation}\rightarrow\text{detector intensity}$$

    - The measurement model transforms the state before any representation. It is not a display effect added afterwards (`docs/concepts/experiment-vs-density.md:1-14,30-46`, `docs/concepts/model-map.md:19-37`).
    - Cite `[@stodolna2013stark]`.
  - `## Stark 态的光电离显微成像 {#stark-microscopy}`.
    - Stodolna et al. observed the nodal structure of hydrogen Stark states on a two-dimensional detector.
    - Under their specific conditions, the node count along the bound parabolic coordinate survives to the far-field projection. That is not a general theorem about all measurements.
    - Cite `[@stodolna2013stark, pp. 213001-1--213001-4, especially Figs. 2--3]`.
    - Connect to chapter 9 (link [第 9 章](09-superposition-time.md#degenerate-controls)): in a weak uniform field, the first-order Stark eigenstates of $n=2$, $m=0$ are $(\psi_{2s}\pm\psi_{2p_z})/\sqrt2$, because the only coupling in that subspace is $\langle200\lvert z\rvert210\rangle=-3a_0$.
    - Place **Figure 10.1**:

```markdown
<figure class="quviz-figure" data-lab="mode=superposition&preset=2s-2pz&t=0&rep=slice&plane=xz&obs=probability_density" markdown>
**图 10.1** $n=2$ 的简并混合态 $(\psi_{2s}+\psi_{2p_z})/\sqrt2$ 在原空间的概率密度。弱匀强电场中，$n=2$、$m=0$ 的一阶 Stark 本征态正是 $(\psi_{2s}\pm\psi_{2p_z})/\sqrt2$；实验记录的是它经电离与传播后在探测器上的远场投影，而不是这张图本身。
</figure>
```

  - `## 前向模型 {#forward-model}`.

    $$I(\mathbf R)=\left(\left\lvert\mathcal M[\psi]\right\rvert^2*\mathrm{PSF}\right)(\mathbf R)+\epsilon(\mathbf R)$$

    - $\mathcal M$ contains ionization, propagation and the mapping to detector coordinates; $*$ is convolution.
    - This is only a schematic. Real counts are Poisson-distributed, and background, efficiency and instrument response depend on the apparatus (`docs/concepts/experiment-vs-density.md:16-28`).
  - `## 实验室画的是什么 {#what-the-lab-shows}`.
    - The lab draws intrinsic quantities ($\lvert\psi\rvert^2$, $\arg\psi$, $\mathbf j$) directly. It has no detector representation yet; that is future work (`docs/project/roadmap.md:78-86`).
    - Bloom, blur or transparency are display settings and never stand in for a measurement model.
  - `## 重复位置测量 {#repeated-measurements}`.
    - A point cloud models idealized repeated position measurements: one outcome per freshly prepared atom. The count in a region is binomial or multinomial, and its relative noise is about $1/\sqrt{\lambda}$ for an expected count $\lambda$.
    - Place **Figure 10.2**:

```markdown
<figure class="quviz-figure" data-lab="mode=eigenstate&n=3&l=1&m=0&basis=real&rep=point_cloud" markdown>
**图 10.2** 实基 $3p_z$ 的电子云：每个点对应一次理想的位置测量，只有大量点累积起来才显出 $\lvert\psi\rvert^2$ 的结构；真实探测器还要叠加分辨率、效率与噪声。
</figure>
```

  - `## 常见误区 {#misconceptions}`:
    - "实验直接拍到了氢原子的三维电子云";
    - "给渲染加上模糊或光晕就相当于模拟了探测器";
    - "任何测量都会保留波函数的节点".
  - `## 思考题 {#exercises}`:
    - **10.1** 为什么不能把一张光电离显微图像称为「氢原子电子云的照片」？ Answer: the chain includes ionization, propagation and projection onto a 2D detector. The nodes map only in a specific parabolic coordinate under those conditions, and pixel intensities are not $\lvert\psi(\mathbf r)\rvert^2$.
    - **10.2** 探测器某像素的期望计数为 $\lambda=100$，计数的相对涨落约为多少？ Answer: the Poisson standard deviation is $\sqrt\lambda=10$, so about 10 %.
    - **10.3** 用 $\langle200\lvert z\rvert210\rangle=-3a_0$ 说明 $n=2$ 能级在弱电场 $\mathcal E\hat z$ 中出现与场强成正比的能移。 Answer: take the field along $+z$ and the electron charge as $-e$, so $H'=e\mathcal E z$. In the degenerate $\{2s,2p_z\}$ subspace, $H'$ has only the off-diagonal element $-3e\mathcal Ea_0$. Diagonalizing gives $(\psi_{2s}+\psi_{2p_z})/\sqrt2$ with shift $-3e\mathcal Ea_0$ and $(\psi_{2s}-\psi_{2p_z})/\sqrt2$ with $+3e\mathcal Ea_0$. Both shifts are linear in $\mathcal E$ and equal $e\mathcal E\langle z\rangle$.
    - **10.4** 实验室里哪种表示最接近「重复的位置测量」？还缺什么？ Answer: the point cloud. It lacks the measurement operator $\mathcal M$, detector resolution, efficiency, background and Poisson noise.
  - `## 延伸阅读 {#further-reading}`:
    - [实验图样与概率密度](../concepts/experiment-vs-density.md);
    - [量子可视化模型地图](../concepts/model-map.md);
    - [第 5 章](05-electron-cloud.md);
    - [第 9 章](09-superposition-time.md);
    - `[@griffiths2018qm, eq. (1.3), p. 4]`.
  - **Draws on:** `docs/concepts/experiment-vs-density.md:1-46`, `docs/concepts/model-map.md:19-37`, `docs/project/vision.md:15-34`, `docs/project/roadmap.md:78-86`.
  - **Citations (only these):** `[@stodolna2013stark]`, `[@stodolna2013stark, pp. 213001-1--213001-4, especially Figs. 2--3]`, `[@griffiths2018qm, eq. (1.3), p. 4]`. The degenerate-perturbation step in 10.3 is derived in the text from the matrix element; add no textbook locator for it.

- [ ] **Step 3b: Write `docs/textbook/11-symmetry-hybridization.md`.**
  - **H1:** `# 第 11 章 对称性与杂化`
  - `## 学习目标 {#goals}`:
    - see hybrid orbitals as a basis choice inside a subspace;
    - write the $sp^3$ matrix and its tetrahedral angle;
    - separate what symmetry decides from what it cannot;
    - read the $sp$ hybrid in the lab.
  - `## 简并子空间里的基自由 {#basis-freedom}`.
    - Any unitary combination inside a degenerate subspace is an equally valid basis (link [第 4 章](04-real-complex.md#basis-change)). Hybrids are such a choice inside the valence subspace $(s,p_x,p_y,p_z)$ (`docs/concepts/model-map.md:39-48`).
    - Place **Figure 11.1**:

```markdown
<figure class="quviz-figure" data-lab="mode=eigenstate&n=2&l=1&m=0&basis=real&rep=isosurface" markdown>
**图 11.1** 实基 $2p_z$ 的等密度面：在正四面体对称 $T_d$ 中，$(p_x,p_y,p_z)$ 一起构成 $T_2$ 表示，$2p_z$ 只是其中沿 $z$ 轴的一个分量。
</figure>
```

  - `## sp³ 杂化 {#sp3}`. Heading text is plain `sp³ 杂化`, with no math in the heading.
    - $\Gamma_{\mathrm{tetrahedral}}=A_1\oplus T_2$, with $s\sim A_1$ and $(p_x,p_y,p_z)\sim T_2$.
    - Reproduce the $4\times4$ matrix from `docs/tutorials/hybridization.md:25-40`, with rows $\tfrac12(1,1,1,1)$, $\tfrac12(1,1,-1,-1)$, $\tfrac12(1,-1,1,-1)$ and $\tfrac12(1,-1,-1,1)$ acting on $(s,p_x,p_y,p_z)$.
    - Cite `[@maksic1986hybridization, pp. 703--705; @jacobs-character-tables, T_d table]`.
  - `## 四面体夹角 {#tetrahedral-angle}`. $\hat{\mathbf n}_i\cdot\hat{\mathbf n}_j=-\tfrac13$, so the angle is $\arccos(-1/3)\approx109.47^\circ$.
  - `## 对称性能决定什么 {#what-symmetry-decides}`.
    - How a representation decomposes, which orbitals have matching symmetry, and how to build SALCs and orthogonal directed bases (`docs/tutorials/hybridization.md:50-55`).
    - Character tables: `[@jacobs-character-tables; @gelessus1995-character-tables; @shirts2007-character-tables]`.
  - `## 对称性不能决定什么 {#what-symmetry-cannot}`: the actual mixing ratio, energetic optimality, radial contraction, the uniqueness of localized orbitals and electron correlation (`docs/tutorials/hybridization.md:56-64`).
  - `## 在实验室里看杂化 {#hybrids-in-the-lab}`.
    - The lab does not yet render general hybrids.
    - The degenerate preset 2s + 2p_z is exactly an $sp$ hybrid of the $n=2$ shell. Because $2s$ and $2p$ are degenerate in hydrogen, every $n=2$ hybrid is also a stationary state.
    - In multi-electron atoms $E_{2s}<E_{2p}$, so hybrids are a basis for describing bonding, not eigenstates.
    - Place **Figure 11.2**:

```markdown
<figure class="quviz-figure" data-lab="mode=superposition&preset=2s-2pz&t=0&rep=slice&plane=xz&obs=wavefunction_real" markdown>
**图 11.2** $(\psi_{2s}+\psi_{2p_z})/\sqrt2$ 在 $t=0$ 的 $\operatorname{Re}\psi$：这正是一个 $sp$ 杂化函数——$s$ 与 $p_z$ 的等权组合，它的密度大瓣指向 $-z$（$\langle z\rangle=-3a_0$）。在氢原子里 $2s$ 与 $2p$ 简并，所以它同时也是定态。
</figure>
```

  - `## 常见误区 {#misconceptions}`:
    - "杂化轨道是可以直接观测的实在";
    - "$sp^3$ 是唯一正确的成键图景": $sp^3d$ and $sp^3d^2$ are localized interpretive models (`docs/tutorials/hybridization.md:64`);
    - "对称性能决定 $s/p$ 混合比例".
  - `## 思考题 {#exercises}`:
    - **11.1** 验证 $sp^3$ 系数矩阵的行正交归一。 Answer: every row has four entries $\pm\tfrac12$, so its squared norm is $4\cdot\tfrac14=1$; row 1 · row 2 $=(1+1-1-1)/4=0$, and likewise for the other pairs.
    - **11.2** 求 $h_1$ 与 $h_2$ 的方向夹角。 Answer: the $p$-direction vectors are $(1,1,1)$ and $(1,-1,-1)$, so $\cos=(1-1-1)/3=-\tfrac13$ and the angle is $109.47^\circ$.
    - **11.3** 在氢原子里，$(\psi_{2s}+\psi_{2p_x}+\psi_{2p_y}+\psi_{2p_z})/2$ 是定态吗？多电子原子里呢？ Answer: in hydrogen, yes: all four terms have $E_2$. In multi-electron atoms, no: $2s$ and $2p$ have different energies, so the hybrid is a basis choice.
    - **11.4** 群论告诉我们 $\Gamma=A_1\oplus T_2$，它能告诉我们真实分子中成键轨道的能量吗？ Answer: no. Energies need the Hamiltonian; symmetry only classifies and constrains which functions may mix.
  - `## 延伸阅读 {#further-reading}`:
    - [点群与轨道杂化](../tutorials/hybridization.md);
    - [量子可视化模型地图](../concepts/model-map.md);
    - [第 4 章](04-real-complex.md);
    - [第 9 章](09-superposition-time.md);
    - `[@maksic1986hybridization]`.
  - **Draws on:** `docs/tutorials/hybridization.md:1-72`, `docs/tutorials/real-vs-complex.md:60-69`, `docs/concepts/model-map.md:39-48`.
  - **Citations (only these):** `[@maksic1986hybridization, pp. 703--705; @jacobs-character-tables, T_d table]`, `[@jacobs-character-tables; @gelessus1995-character-tables; @shirts2007-character-tables]`, `[@maksic1986hybridization]`.

- [ ] **Step 4: Nav + index.** Insert after the chapter 9 nav line:

```yaml
      - 10 从密度到实验图样: textbook/10-experiment.md
      - 11 对称性与杂化: textbook/11-symmetry-hybridization.md
```

Append to the index table:

```markdown
| 10 | [从密度到实验图样](10-experiment.md) | 实验到底“看见”了什么？ |
| 11 | [对称性与杂化](11-symmetry-hybridization.md) | 杂化轨道是新的量子态，还是换了一组基？ |
```

- [ ] **Step 5: Run and see it pass** (shared rule 5).

- [ ] **Step 6: Physics self-check.** Run `uv run --locked --no-sync python -c "import math; print(round(math.degrees(math.acos(-1/3)), 2))"`. Expected: `109.47`. The $-3a_0$ element is the Task C12 check.

- [ ] **Step 7: Pre-commit gate, then commit.** This commit changes `tests/test_textbook.py`, so the full Python gate runs first (CLAUDE.md, spec §6).

Run: `uv run --locked --group docs pytest --cov=quviz --cov-report=term-missing`
Expected: exit 0. The summary line reports only `passed`, with no `failed`, `error`, `skipped`, `xfailed` or `xpassed`, and the output contains `Required test coverage of 85% reached.` If anything is red, fix it and re-run this step; do not commit.
Run: `uv run --locked ruff check tests/test_textbook.py && uv run --locked ruff format --check tests/test_textbook.py`
Expected: `All checks passed!` and `1 file already formatted`.

```bash
git add docs/textbook/10-experiment.md docs/textbook/11-symmetry-hybridization.md docs/textbook/index.md mkdocs.yml tests/test_textbook.py
git commit -m "docs(textbook): add chapters on measurement and on symmetry and hybridization" -m "Claude-Session: https://claude.ai/code/session_01E44DEzsc7Av26fc7nZ5rSo"
```

---

### Task C14: Appendix A (misconceptions) and appendix B (notation, units, deep links)

**Files:**
- Create: `docs/textbook/appendix-a-misconceptions.md`, `docs/textbook/appendix-b-notation-units.md`
- Modify: `tests/test_textbook.py`, `mkdocs.yml`, `docs/textbook/index.md`

**Interfaces:**
- Consumes: every chapter's `#misconceptions` anchor (Tasks C7–C13), which appendix A links to, and the deep-link grammar (contracts `DeepLinkState`).
- Consumes: the figure rule of Task C5. Every registered page needs at least one figure, and appendix captions start with `**图 A.k**` / `**图 B.k**`.
  - Spec §1 success criterion 2 asks for one interactive figure "per chapter", and spec §4.5 lists the appendices separately from chapters 0–11.
  - Each appendix still gets one figure, so the criterion holds under either reading. Both figures reuse states whose numbers the chapters already verify: the 2s slice of figure 2.1 and the Bohr-oscillation frame of figure 9.2.
- Produces: the anchors `appendix-a-misconceptions.md#<one per misconception>` and `appendix-b-notation-units.md#{atomic-units,coordinates,symbols,representations,deep-links}`.

- [ ] **Step 1: Register (failing test).** Append to `CHAPTERS`:

```python
    "appendix-a-misconceptions.md": Chapter(
        sections=(
            "density-vs-radial",
            "nodes-and-kinetic-energy",
            "nodes-are-not-planes",
            "m-is-not-a-direction",
            "cloud-is-not-a-trajectory",
            "isosurface-is-not-a-boundary",
            "colour-is-not-charge",
            "stationary-is-not-still",
            "superposition-is-not-hopping",
            "detector-image-is-not-density",
            "hybrids-are-not-observables",
        ),
        figures=(
            "mode=eigenstate&n=2&l=0&m=0&basis=real&rep=slice&plane=xz&obs=probability_density",
        ),
    ),
    "appendix-b-notation-units.md": Chapter(
        sections=("atomic-units", "coordinates", "symbols", "representations", "deep-links"),
        figures=(
            "mode=superposition&preset=1s-2pz&t=8.4&rep=slice&plane=xz&obs=probability_density",
        ),
    ),
```

- [ ] **Step 2: Run and see it fail.**

Run: `uv run --locked --group docs pytest tests/test_textbook.py -q`
Expected: 3 failures:
- `test_textbook_pages_are_exactly_the_registered_chapters`;
- `test_registered_chapters_match_their_sections_and_figures`, with `FileNotFoundError`;
- `test_textbook_index_links_every_chapter_in_order`.

Appendices are exempt from the learner template, so that test stays green.

- [ ] **Step 3a: Write `docs/textbook/appendix-a-misconceptions.md`.**
  - **H1:** `# 附录 A 常见误区`
  - **Intro:** one paragraph. Each entry gives the wrong statement, the correct statement in one or two sentences, and a link to the chapter's `#misconceptions` section.
  - **Sections**, in this order, each written `## <标题> {#id}`:
    1. `局域密度与径向分布 {#density-vs-radial}`: links [第 1 章](01-wavefunction.md#misconceptions) and [第 3 章](03-radial-nodes.md#misconceptions); cites `[@floatheadphysics2025-orbitals, 06:06--10:00]`. End this section with **Figure A.1**, the only figure of appendix A:

```markdown
<figure class="quviz-figure" data-lab="mode=eigenstate&n=2&l=0&m=0&basis=real&rep=slice&plane=xz&obs=probability_density" markdown>
**图 A.1** $2s$ 在 $xz$ 平面上的概率密度切片。局域密度 $\lvert\psi\rvert^2$ 在原子核处最大，在半径 $2a_0$ 的球面节点上降为零；径向分布 $P(r)=r^2\lvert R_{20}\rvert^2$ 却在 $r=(3+\sqrt5)\,a_0\approx5.24\,a_0$ 处最大。两者回答的是不同的问题（第 3 章）。
</figure>
```

    2. `节点与平均动能 {#nodes-and-kinetic-energy}`: links [第 2 章](02-hydrogen-levels.md#misconceptions); cites `[@griffiths2018qm, p. 125 (virial theorem) and ch. 4 (pp. 131--197)]` and `[@floatheadphysics2025-orbitals, 05:05--06:05]`.
    3. `节点不一定是平面 {#nodes-are-not-planes}`: links [第 3 章](03-radial-nodes.md#misconceptions) and [第 6 章](06-isosurface.md#misconceptions); cites `[@dlmf-spherical-harmonics, eq. 14.30.3]` and `[@floatheadphysics2025-orbitals, 21:58--24:08]`.
    4. `磁量子数不是朝向 {#m-is-not-a-direction}`: links [第 4 章](04-real-complex.md#misconceptions); cites `[@floatheadphysics2025-orbitals, 27:25--30:18]`.
    5. `电子云不是轨迹 {#cloud-is-not-a-trajectory}`: links [第 1 章](01-wavefunction.md#misconceptions) and [第 5 章](05-electron-cloud.md#misconceptions).
    6. `等值面不是边界 {#isosurface-is-not-a-boundary}`: links [第 6 章](06-isosurface.md#misconceptions).
    7. `颜色不是电荷 {#colour-is-not-charge}`: links [第 4 章](04-real-complex.md#misconceptions) and [第 7 章](07-phase-slices.md#misconceptions).
    8. `定态也可以有概率流 {#stationary-is-not-still}`: links [第 8 章](08-probability-current.md#misconceptions).
    9. `叠加态不是来回跳 {#superposition-is-not-hopping}`: links [第 9 章](09-superposition-time.md#misconceptions).
    10. `探测器图样不是密度照片 {#detector-image-is-not-density}`: links [第 10 章](10-experiment.md#misconceptions); cites `[@stodolna2013stark]`.
    11. `杂化轨道不是可观测量 {#hybrids-are-not-observables}`: links [第 11 章](11-symmetry-hybridization.md#misconceptions); cites `[@maksic1986hybridization]`.
  - **Closing sentence** linking the project's own correction ledger, [纠错账本](../references/corrections.md).
  - **Draws on:** `docs/references/corrections.md:77-109` and the chapters' misconception blocks.
  - **Citations (only these):**
    - `[@floatheadphysics2025-orbitals, 06:06--10:00]`;
    - `[@griffiths2018qm, p. 125 (virial theorem) and ch. 4 (pp. 131--197)]`;
    - `[@floatheadphysics2025-orbitals, 05:05--06:05]`;
    - `[@dlmf-spherical-harmonics, eq. 14.30.3]`;
    - `[@floatheadphysics2025-orbitals, 21:58--24:08]`;
    - `[@floatheadphysics2025-orbitals, 27:25--30:18]`;
    - `[@stodolna2013stark]`;
    - `[@maksic1986hybridization]`.

- [ ] **Step 3b: Write `docs/textbook/appendix-b-notation-units.md`.**
  - **H1:** `# 附录 B 符号与单位`
  - `## 原子单位 {#atomic-units}`.
    - State $\hbar=e=m_e=4\pi\varepsilon_0=1$.
    - A table with columns 量 / 原子单位 / 数值（6 位有效数字）:

      | 量 | 原子单位 | 数值（6 位有效数字） |
      |---|---|---|
      | 长度 | $a_0$ | 0.529177 Å |
      | 能量 | $E_h$ | 27.2114 eV |
      | 时间 | $\hbar/E_h$ | 24.1888 as |
      | 速度 | $a_0E_h/\hbar$ | $2.18769\times10^6$ m/s |

    - The reduced-mass scale is $a_\mu=m_e/\mu$ (≈ 1.000545 for hydrogen). The textbook lab uses $Z=1$, $a_\mu=1$.
    - Cite `[@griffiths2018qm, ch. 4 (pp. 131--197)]`.
  - `## 坐标约定 {#coordinates}`.
    - $\theta\in[0,\pi]$ is the polar angle and $\phi\in[0,2\pi)$ the azimuth; $x=r\sin\theta\cos\phi$, $y=r\sin\theta\sin\phi$, $z=r\cos\theta$.
    - The Condon–Shortley phase is included. Give the real-basis definition link [物理与数值约定](../concepts/conventions.md).
    - The lab's $z$ axis points up.
    - Cite `[@scipy-sph-harm-y]`.
  - `## 符号表 {#symbols}`. A table of symbol, meaning and unit covering:
    - $\psi,\Psi$;
    - $\rho=\lvert\psi\rvert^2$ (bohr⁻³);
    - $P(r)$ (bohr⁻¹);
    - $R_{n\ell}$ and $Y_\ell^m$;
    - $n,\ell,m$;
    - $Z,a_\mu,\mu$;
    - $E_n$ (Ha);
    - $\mathbf j$ and $\mathbf v$ (a.u.);
    - $\omega$ and $T$ ($\hbar/E_h$);
    - $c_k$.

    Use `\lvert…\rvert` inside the table.
  - `## 表示法与场 {#representations}`. A table with columns 界面名称 / 请求中的名称 / 含义:
    - 电子云 `point_cloud`;
    - 等密度面 `isosurface`;
    - 平面切片 `slice`;
    - 概率流线 `streamlines`;
    - $\lvert\psi\rvert^2$ `probability_density`;
    - $\operatorname{Re}\psi$ `wavefunction_real`;
    - $\operatorname{Im}\psi$ `wavefunction_imag`;
    - $\arg\psi$ `phase`.
  - `## 深链接语法 {#deep-links}`.
    - The part after `#` in the lab's address is `key=value` pairs joined by `&`, written in the order `embed, mode, n, l, m, z, basis, preset, t, rep, plane, obs`. Figures add `embed=1`. The lab ignores unknown or invalid keys and falls back to its defaults.
    - A table (no `|` characters inside cells; separate alternatives with “、”) of the keys and the values the textbook catalogue covers:
      - `mode`: eigenstate、superposition;
      - `n`: 1–4;
      - `l`: 0…n−1;
      - `m`: −l…l;
      - `basis`: real、complex;
      - `preset`: 1s-2pz、2s-2pz、1s-3dz2、2pplus-2pminus;
      - `t`: the preset's playback frames;
      - `rep`: point_cloud、isosurface、slice、streamlines;
      - `plane`: xy、xz、yz (superpositions: xz only);
      - `obs`: probability_density、wavefunction_real、wavefunction_imag、phase.
    - Two examples in inline code:
      - `#mode=eigenstate&n=2&l=1&m=0&basis=real&rep=point_cloud`;
      - `#mode=superposition&preset=1s-2pz&t=8.4&rep=slice&plane=xz&obs=probability_density`.
    - The local live lab also accepts `z` and any parameter within its validated limits.
    - End the section with **Figure B.1**. It is the only `<figure>` tag in this appendix; the figure gate scans every file in `docs/textbook/`, so the examples above stay inline code and never become figure markup.

```markdown
<figure class="quviz-figure" data-lab="mode=superposition&preset=1s-2pz&t=8.4&rep=slice&plane=xz&obs=probability_density" markdown>
**图 B.1** 上面第二个示例深链接所描述的状态：$1s+2p_z$ 叠加态在 $t=8.4\,\hbar/E_h$（约半个周期，$T=16\pi/3\approx16.755\,\hbar/E_h$）时 $xz$ 平面上的概率密度切片，$\langle z\rangle\approx-0.745\,a_0$。点“在实验室中打开”，可以在新标签页里从这一帧继续播放或切换表示法。
</figure>
```

  - **Citations (only these):** `[@griffiths2018qm, ch. 4 (pp. 131--197)]`, `[@scipy-sph-harm-y]`.

- [ ] **Step 4: Nav + index.** Insert after the chapter 11 nav line:

```yaml
      - 附录 A 常见误区: textbook/appendix-a-misconceptions.md
      - 附录 B 符号与单位: textbook/appendix-b-notation-units.md
```

Append to the index table:

```markdown
| 附录 A | [常见误区](appendix-a-misconceptions.md) | 各章误区的集中索引 |
| 附录 B | [符号与单位](appendix-b-notation-units.md) | 原子单位、坐标约定与深链接语法 |
```

- [ ] **Step 5: Run and see it pass** (shared rule 5). Also check that the `教材` nav block now equals the final block shown in Task C1 Step 4.

- [ ] **Step 6: Constants and figure self-check.** Appendix B's rounding is plain 6-significant-digit rounding of CODATA values: 0.529177 Å, 27.2114 eV, 24.1888 as, 2.18769e6 m/s. No command is needed. Cross-check $\hbar/E_h$ against Task C12's 0.024188843 fs. The two figure captions repeat numbers that are recomputed here *(bash)*:

```bash
uv run --locked --no-sync python -c 'import math
import numpy as np
from quviz.physics.hydrogenic import radial_wavefunction as R
r = np.linspace(1e-6, 80, 800001); p = r**2 * R(2, 0, r) ** 2
print(round(float(r[np.argmax(p)]), 3), round(3 + math.sqrt(5), 3))
r = np.linspace(0, 80, 400001); d12 = np.trapezoid(R(1, 0, r) * R(2, 1, r) * r**3, r) / math.sqrt(3)
print(round(float(d12) * math.cos(0.375 * 8.4), 4), round(16 * math.pi / 3, 3), round(8.4 / (16 * math.pi / 3), 4))'
```

Expected:

```text
5.236 5.236
-0.7449 16.755 0.5013
```

- [ ] **Step 7: Pre-commit gate, then commit.** This commit changes `tests/test_textbook.py`, so the full Python gate runs first (CLAUDE.md, spec §6).

Run: `uv run --locked --group docs pytest --cov=quviz --cov-report=term-missing`
Expected: exit 0. The summary line reports only `passed`, with no `failed`, `error`, `skipped`, `xfailed` or `xpassed`, and the output contains `Required test coverage of 85% reached.` If anything is red, fix it and re-run this step; do not commit.
Run: `uv run --locked ruff check tests/test_textbook.py && uv run --locked ruff format --check tests/test_textbook.py`
Expected: `All checks passed!` and `1 file already formatted`.

```bash
git add docs/textbook/appendix-a-misconceptions.md docs/textbook/appendix-b-notation-units.md docs/textbook/index.md mkdocs.yml tests/test_textbook.py
git commit -m "docs(textbook): add the misconception index and the notation appendix" -m "Claude-Session: https://claude.ai/code/session_01E44DEzsc7Av26fc7nZ5rSo"
```

---

### Task C15: Independent adversarial physics review of every textbook page

Spec §7 answers the risk "教材内容的物理错误" with "每章独立物理审校（对抗式），公式与数值和既有测试/解析结果对照". The Step 6 self-checks of Tasks C7–C14 are the author's own checks. In this task a reviewer who did not write a page attacks it. Every confirmed P1 or P2 finding, and every confirmed P3 finding whose replacement text is verified, is:
- fixed;
- pinned by a regression test that fails before the fix;
- re-verified by the reviewer before Task C20.

**Files:**
- Modify, only for findings being fixed:
  - the affected pages under `docs/textbook/`;
  - `tests/test_textbook.py`: the `ReviewPin` type, the `PHYSICS_REVIEW_PINS` tuple and `test_physics_review_corrections_stay_fixed`, appended after `test_textbook_index_links_every_chapter_in_order`.
- If no finding is to be fixed, no file changes and there is no commit. The review record goes into the hand-off notes in both cases.

**Interfaces:**
- Consumes:
  - the fourteen pages of Tasks C7–C14;
  - the reference values of Review Focus 1;
  - `CHAPTERS` and `deep_link_problems` (Task C5);
  - the chapter specs in this plan (Tasks C7–C14, Step 3, 3a or 3b).
- Produces:
  - one review record per page. It names the reviewer and the verdict, lists each finding with its evidence, and gives your disposition: confirmed, or refuted with counter-evidence;
  - for every fixed finding, a corrected page and one `ReviewPin`;
  - Task C20 Step 8 checks that the record is complete.

**Independence rules.** These rules make it a review and not a second self-check.
- Each page is reviewed by a fresh subagent, or by a human, that neither wrote nor edited that page. The reviewer does not see the author's conversation or notes.
- The reviewer gets only the Step 2 prompt. It works read-only: it runs commands but edits no file.
- The fourteen pages are independent, so dispatch the reviews in parallel (superpowers:dispatching-parallel-agents).
- Sometimes this plan runs in one session that cannot start an independent reviewer (superpowers:executing-plans). Then stop and ask the user for a reviewer. The authoring session never reviews its own pages.

- [ ] **Step 1: Re-run the recompute kit.** The reviewers receive this kit, so first prove that it still reproduces on this tree. Run K1–K10 from the repo root. The output must match exactly. Any difference means the project code or the environment changed: stop and find out why before any review starts. Planning re-ran K1–K10 on 2026-09-25 and got exactly these outputs.

K1 — $P(r\le a_0)$ for 1s (chapter 1):

Run: `uv run --locked --no-sync python -c "import math; print(1-5*math.exp(-2))"`
Expected: `0.3233235838169365`

K2 — levels, Lyman-α with and without the reduced mass, He⁺ ground state (chapter 2) *(bash)*:

```bash
uv run --locked --no-sync python -c 'from quviz.physics.hydrogenic import hydrogenic_energy_hartree as E
HA = 27.211386245981
print([round(E(n), 5) for n in range(1, 5)], [round(E(n) * HA, 3) for n in range(1, 5)])
d = E(2) - E(1); print(round(d * HA, 3), round(1239.84198 / (d * HA), 2))
mu = 1836.15267343 / 1837.15267343; dm = E(2, reduced_mass_ratio=mu) - E(1, reduced_mass_ratio=mu); print(round(1239.84198 / (dm * HA), 2), round(E(1, reduced_mass_ratio=mu) * HA, 3))
print(round(E(1, z=2.0) * HA, 2))'
```

Expected:

```text
[-0.5, -0.125, -0.05556, -0.03125] [-13.606, -3.401, -1.512, -0.85]
10.204 121.5
121.57 -13.598
-54.42
```

K3 — radial nodes, most probable radius and $\langle r\rangle$ for every $n\le4$ (chapter 3) *(bash)*:

```bash
uv run --locked --no-sync python -c 'import numpy as np
from quviz.physics.hydrogenic import radial_wavefunction as R, radial_node_radii as nodes
r = np.linspace(1e-6, 80, 800001)
for n in range(1, 5):
    for l in range(n):
        p = r**2 * R(n, l, r) ** 2
        print(f"{n}{"spdf"[l]}", np.round(nodes(n, l), 3).tolist(), round(float(r[np.argmax(p)]), 3), (3 * n * n - l * (l + 1)) / 2)'
```

Expected (columns: nodes, most probable radius, $\langle r\rangle$):

```text
1s [] 1.0 1.5
2s [2.0] 5.236 6.0
2p [] 4.0 5.0
3s [1.902, 7.098] 13.074 13.5
3p [6.0] 12.0 12.5
3d [] 9.0 10.5
4s [1.872, 6.611, 15.518] 24.618 24.0
4p [5.528, 14.472] 23.58 23.0
4d [12.0] 21.211 21.0
4f [] 16.0 18.0
```

K4 — $(\psi_{21,+1}+\psi_{21,-1})/\sqrt2=-i\,\psi_{2p_y}$, where the real $m=-1$ function is $p_y$ (chapter 4) *(bash)*:

```bash
uv run --locked --no-sync python -c 'import numpy as np
from quviz.physics.hydrogenic import hydrogenic_wavefunction as psi
rng = np.random.default_rng(0); r = rng.uniform(0.5, 8, 6); th = rng.uniform(0, np.pi, 6); ph = rng.uniform(0, 2 * np.pi, 6)
s = (psi(2, 1, 1, r, th, ph, basis="complex") + psi(2, 1, -1, r, th, ph, basis="complex")) / np.sqrt(2)
py = psi(2, 1, -1, r, th, ph, basis="real")
print(bool(np.allclose(s, -1j * py)), bool(np.allclose(s.real, 0)))'
```

Expected: `True True`

K5 — sample counts inside $a_0$ for 1s, and the 2s probability inside its node (chapter 5) *(bash)*:

```bash
uv run --locked --no-sync python -c 'import math
import numpy as np
from quviz.physics.hydrogenic import radial_wavefunction as R
p = 1 - 5 * math.exp(-2); print(round(28000 * p), round(math.sqrt(28000 * p * (1 - p))))
r = np.linspace(0, 2, 200001); q = float(np.trapezoid(r**2 * R(2, 0, r) ** 2, r)); print(round(q, 4), round(28000 * q))'
```

Expected:

```text
9053 78
0.0527 1474
```

K6 — the 90 % sphere of 1s, the complex 2p phases at $+x$/$+y$, the $3d$ $m=2$ pattern, and the $3d_{z^2}$ signs (chapters 6 and 7) *(bash)*:

```bash
uv run --locked --no-sync python -c 'import numpy as np
from scipy.optimize import brentq
from quviz.physics.hydrogenic import hydrogenic_wavefunction as psi
print(round(brentq(lambda R: 1 - np.exp(-2 * R) * (1 + 2 * R + 2 * R**2) - 0.9, 0.5, 10), 3))
r = np.array([3.0, 3.0]); th = np.array([np.pi / 2, np.pi / 2]); ph = np.array([0.0, np.pi / 2])
for m in (1, -1): print(m, np.round(np.angle(psi(2, 1, m, r, th, ph, basis="complex")), 4).tolist())
v = psi(3, 2, 2, np.array([4.0, 4.0]), np.array([np.pi / 2] * 2), np.array([0.0, np.pi / 4]), basis="complex"); print(np.round(v.real, 6).tolist(), np.round(v.imag, 6).tolist())
w = psi(3, 2, 0, np.array([6.0, 6.0]), np.array([0.0, np.pi / 2]), np.array([0.0, 0.0]), basis="real"); print(np.sign(w).tolist())'
```

Expected:

```text
2.661
1 [3.1416, -1.5708]
-1 [0.0, -1.5708]
[0.014688, 0.0] [0.0, 0.014688]
[1.0, -1.0]
```

K7 — azimuthal speed $v_y$ and the circulation period of complex eigenstates, by an independent finite difference (chapter 8) *(bash)*:

```bash
uv run --locked --no-sync python -c 'import numpy as np
from quviz.physics.hydrogenic import hydrogenic_wavefunction as psi, cartesian_to_spherical as sph
def f(n, l, m, x, y, z):
    r, th, ph = sph(np.array([x]), np.array([y]), np.array([z]))
    return psi(n, l, m, r, th, ph, basis="complex")[0]
h = 1e-5
for n, l, m, x, y in ((2, 1, 1, 4.0, 0.0), (2, 1, -1, 4.0, 0.0), (3, 2, 2, 2.0, 0.0)):
    p = f(n, l, m, x, y, 0.0); vy = ((np.conj(p) * (f(n, l, m, x, y + h, 0.0) - f(n, l, m, x, y - h, 0.0)) / (2 * h)).imag) / abs(p) ** 2
    print(n, l, m, round(float(vy), 6), round(2 * np.pi * x / abs(vy), 4))'
```

Expected (columns: $n,\ell,m$, $v_y$, period):

```text
2 1 1 0.25 100.531
2 1 -1 -0.25 100.531
3 2 2 1.0 12.5664
```

K8 — dipole matrix elements, $\langle z\rangle(t)$ on the playback frames and the two beat periods (chapters 9 and 10) *(bash)*:

```bash
uv run --locked --no-sync python -c 'import math
import numpy as np
from quviz.physics.hydrogenic import radial_wavefunction as R
r = np.linspace(0, 80, 400001)
d12 = np.trapezoid(R(1, 0, r) * R(2, 1, r) * r**3, r) / math.sqrt(3)
d22 = np.trapezoid(R(2, 0, r) * R(2, 1, r) * r**3, r) / math.sqrt(3)
print(round(float(d12), 6), round(128 * math.sqrt(2) / 243, 6), round(float(d22), 6))
w1, w2 = 0.5 - 0.125, 0.5 - 1 / 18
print([round(float(d12) * math.cos(w1 * t), 4) for t in (0, 4.2, 8.4)])
print(round(2 * math.pi / w1, 3), round(2 * math.pi / w2, 3), round(2 * math.pi / w1 * 0.024188843, 3), round(2 * math.pi / w2 * 0.024188843, 3))'
```

Expected:

```text
0.744936 0.744936 -3.0
[0.7449, -0.0031, -0.7449]
16.755 14.137 0.405 0.342
```

K9 — the tetrahedral angle (chapter 11):

Run: `uv run --locked --no-sync python -c "import math; print(round(math.degrees(math.acos(-1/3)), 2))"`
Expected: `109.47`

K10 — the numbers in the captions of figures A.1 and B.1 (appendices) *(bash)*:

```bash
uv run --locked --no-sync python -c 'import math
import numpy as np
from quviz.physics.hydrogenic import radial_wavefunction as R
r = np.linspace(1e-6, 80, 800001); p = r**2 * R(2, 0, r) ** 2
print(round(float(r[np.argmax(p)]), 3), round(3 + math.sqrt(5), 3))
r = np.linspace(0, 80, 400001); d12 = np.trapezoid(R(1, 0, r) * R(2, 1, r) * r**3, r) / math.sqrt(3)
print(round(float(d12) * math.cos(0.375 * 8.4), 4), round(16 * math.pi / 3, 3), round(8.4 / (16 * math.pi / 3), 4))'
```

Expected:

```text
5.236 5.236
-0.7449 16.755 0.5013
```

- [ ] **Step 2: Dispatch one reviewer per page.** Use the prompt below. Fill `{PAGE}`, `{SPEC}` and `{SOURCES}` from this table; the values are copied from each chapter task:

| `{PAGE}` | `{SPEC}` (in this plan) | `{SOURCES}` (audited pages it may draw on) |
|---|---|---|
| `00-how-to-use.md` | Task C7, Step 3a | `docs/index.md:42-46`, `docs/project/vision.md:15-34`, `docs/tutorials/phase-0-walkthrough.md:11-24`, contracts `spec.json` (`design/plans/2026-09-25-contracts.md:27-56`) |
| `01-wavefunction.md` | Task C7, Step 3b | `docs/concepts/coordinate-measures.md:1-33`, `docs/concepts/semantics.md:1-18`, `docs/concepts/model-map.md:17`, `docs/concepts/conventions.md:21-35`, `docs/tutorials/sampling.md:27-37` |
| `02-hydrogen-levels.md` | Task C8, Step 3a | `docs/tutorials/hydrogenic-orbitals.md:3-47,61-63`, `docs/concepts/conventions.md:1-56`, `docs/references/corrections.md:93-103` |
| `03-radial-nodes.md` | Task C8, Step 3b | `docs/concepts/coordinate-measures.md:19-63`, `docs/tutorials/hydrogenic-orbitals.md:29-63`, `docs/references/corrections.md:5-29,81-103` |
| `04-real-complex.md` | Task C9, Step 3a | `docs/tutorials/real-vs-complex.md:1-69`, `docs/concepts/conventions.md:37-56`, `docs/references/corrections.md:105-109`, `tests/test_slice_science.py:396-406` |
| `05-electron-cloud.md` | Task C9, Step 3b | `docs/tutorials/sampling.md:7-56`, `docs/concepts/coordinate-measures.md:19-63`, `docs/getting-started/first-orbital.md:23-36`, `docs/references/corrections.md:43-51` |
| `06-isosurface.md` | Task C10, Step 3a | `docs/tutorials/phase-0-walkthrough.md:26-34`, `docs/concepts/semantics.md:7-28`, `docs/tutorials/frontend-rendering.md:57-61`, `docs/references/corrections.md:35-41,105-107`, `docs/tutorials/hydrogenic-orbitals.md:49-59` |
| `07-phase-slices.md` | Task C10, Step 3b | `docs/tutorials/phase-0-walkthrough.md:36-49`, `docs/tutorials/real-vs-complex.md:39-58`, `docs/tutorials/frontend-rendering.md:63-73`, `docs/concepts/semantics.md:18,44-46`, `tests/test_slice_science.py:396-406` |
| `08-probability-current.md` | Task C11, Step 3 | `docs/concepts/probability-current.md:1-84`, `docs/tutorials/phase-0-walkthrough.md:51-64`, `docs/tutorials/real-vs-complex.md:3-13` |
| `09-superposition-time.md` | Task C12, Step 3 | `docs/project/roadmap.md:20-47`, `docs/tutorials/phase-0-walkthrough.md:66-80`, `docs/tutorials/sampling.md:39-56`, `docs/tutorials/frontend-rendering.md:20`, `docs/concepts/probability-current.md:70` |
| `10-experiment.md` | Task C13, Step 3a | `docs/concepts/experiment-vs-density.md:1-46`, `docs/concepts/model-map.md:19-37`, `docs/project/vision.md:15-34`, `docs/project/roadmap.md:78-86` |
| `11-symmetry-hybridization.md` | Task C13, Step 3b | `docs/tutorials/hybridization.md:1-72`, `docs/tutorials/real-vs-complex.md:60-69`, `docs/concepts/model-map.md:39-48` |
| `appendix-a-misconceptions.md` | Task C14, Step 3a | `docs/references/corrections.md:77-109` and the `#misconceptions` sections of chapters 1–11 |
| `appendix-b-notation-units.md` | Task C14, Step 3b | `docs/concepts/conventions.md:1-56` and the CODATA values of atomic units |

The prompt (send it verbatim apart from the three fields):

~~~text
You are an adversarial physics reviewer for a Chinese undergraduate textbook on the hydrogen atom in
the repository C:\Users\SchrodingerFeiFei\Documents\GitHub\QuViz. Your job is to find errors, not to
approve. You did not write this page. Do not edit, create or delete any file. Run only read-only
commands. Run Python as `uv run --locked --no-sync python -B -c ...`, adding -B to the kit commands
too, so that no bytecode is written.

Page under review: docs/textbook/{PAGE}
What the page was required to say: design/plans/2026-09-25-part-c-textbook.md, {SPEC}
Audited sources it was allowed to draw on: {SOURCES}

Treat every statement as wrong until you have verified it yourself. That includes the reference values
below. Check:
1. Every formula. Look at signs, factors of 2 and pi, units (bohr, hartree, hbar/E_h, eV, nm, fs) and
   normalisation. The atomic-unit Schrodinger equation carries the reduced-mass factor a_mu/2, not 1/2.
   The probability current uses the reduced mass mu, never m, which is the magnetic quantum number.
   Spherical harmonics include the Condon-Shortley phase.
2. Every number. Recompute it with the recompute kit, or derive it independently. Rounding must be
   honest to the digits shown.
3. Every exercise answer (the `??? question` blocks). Re-derive each one from scratch.
4. Every misconception block (`!!! warning`). The "correct statement" must itself be correct and must
   not overreach.
5. Every figure caption. It must describe what the figure's `data-lab` deep link actually shows: the
   state, basis, representation, plane, observable and time. A colour claim must match what colour
   encodes in that representation (docs/concepts/semantics.md:7-28,
   docs/tutorials/frontend-rendering.md:57-73). For example, colour is the phase on point clouds
   and density isosurfaces and the speed on streamlines; the lab's legend is the authority.
   For each data-lab value run
   uv run --locked --no-sync python -B -c "import sys; sys.path.insert(0, 'tests'); from test_textbook import deep_link_problems; print(deep_link_problems('<data-lab value>'))"
   and it must print [].
6. Every citation. The cited locator must support the sentence it is attached to. Compare it with the
   audited source pages above, which already use the same citation strings.
7. Every claim about the static textbook lab. It must match the precomputed catalogue: eigenstates with
   n <= 4 in the real and the complex basis at Z = 1; point clouds of 28000 samples with seed 7;
   isosurfaces enclosing probability 0.9; xy, xz and yz slices of probability_density,
   wavefunction_real, wavefunction_imag and phase; streamlines for complex-basis m != 0 eigenstates; the
   presets 1s-2pz, 2s-2pz, 1s-3dz2 and 2pplus-2pminus on their playback frames with xz slices only; the
   degenerate presets at t = 0 only.

Reference values. The plan's authors recomputed these with the project code; verify any that you rely on:
- Hydrogen levels at Z = 1, a_mu = 1: E_n = -1/(2 n^2) Ha, i.e. -0.5, -0.125, -0.0556, -0.03125 Ha
  for n = 1..4.
- <r> = (a_mu / 2Z) [3 n^2 - l(l+1)]. For every state with l = n-1 the most probable radius is n^2 a0.
- Radial nodes: 2 a0 (2s), 6 a0 (3p), (9 -/+ 3 sqrt 3)/2 a0 (3s), 12 a0 (4d).
- 1s: the sphere enclosing 90 % of the probability has radius 2.661 a0; P(r <= a0) = 1 - 5 e^-2
  = 0.3233.
- Only 5.27 % of the 2s probability lies inside its radial node.
- Bohr oscillation 1s+2p_z: <z> = (128 sqrt 2 / 243) a0 cos(omega t), with omega = 3/8 Ha and
  T = 16 pi / 3 = 16.755 hbar/E_h = 0.405 fs.
- 1s+3d_z2: omega = 4/9 Ha, T = 9 pi / 2 = 14.137 hbar/E_h, and <z> is identically 0.
- The degenerate 2s+2p_z state is stationary, with <z> = <200|z|210> = -3 a0.
- (psi_{21,+1} + psi_{21,-1}) / sqrt 2 = -i psi_{2p_y}.
- j = (hbar/mu) Im(psi* grad psi) vanishes for real psi. For complex eigenstates
  v = hbar m / (mu s) e_phi.
- Complex 2p phases on the xy plane: m = +1 has phase pi at +x, m = -1 has phase 0 at +x, and both have
  -pi/2 at +y (tests/test_slice_science.py:396-406).
- Lyman-alpha: 10.20 eV and 121.5 nm with infinite nuclear mass; 121.57 nm with the reduced mass.

Recompute kit: the commands K1-K10 under "Step 1: Re-run the recompute kit" of "Task C15" in
design/plans/2026-09-25-part-c-textbook.md, each followed by its expected output. Run the ones that
cover the page, and add your own probes with quviz.physics.hydrogenic where the kit does not reach.

Report format. Either the line NO FINDINGS followed by every formula, number, caption and exercise you
checked and how you checked it, or one block per finding:
  id: {PAGE}-<k>
  severity: P1 = wrong physics: a formula, number, sign or unit, or a false claim
            P2 = true but misleading, or missing a necessary condition; or a caption that does not
                 match its figure
            P3 = imprecise wording that a learner could misread
  where: docs/textbook/{PAGE}:<line>
  quote: <exact text copied from the page>
  problem: <one sentence>
  correct: <replacement text in Chinese, ready to paste; empty if the fix is a deletion>
  evidence: <the command and its output, a derivation, or file:line of an audited source>
~~~

- [ ] **Step 3: Adjudicate every finding** (CLAUDE.md, 接收评审). Re-run each finding's evidence yourself.
  - A finding is **confirmed** only when its evidence reproduces and the physics argument holds. Otherwise it is **refuted**, and you record the counter-evidence: a command output, a derivation or an audited `file:line`.
  - Never adopt a finding just because the reviewer asserted it, and never reject one without evidence.
  - Every confirmed P1 or P2 finding must be fixed. A confirmed P3 finding is fixed only when its replacement text is itself verified. Otherwise the record says why the text stays.
  - Record every finding in the review record with these columns:

    | Page | Reviewer | Verdict / finding id | Severity | Disposition | Evidence | Fix commit |
    |---|---|---|---|---|---|---|

  - If no finding is to be fixed on any page, go straight to Step 9.

- [ ] **Step 4: Pin the findings to be fixed (failing test).** Append to `tests/test_textbook.py`, after `test_textbook_index_links_every_chapter_in_order`:

```python
class ReviewPin(NamedTuple):
    """One confirmed finding of the Task C15 physics review."""

    page: str
    wrong: str
    right: str


#: Fixed findings of the independent physics review. Each pin keeps the
#: reviewed error from coming back and keeps its correction on the page.
#: ``right`` is "" when the fix only deletes text.
PHYSICS_REVIEW_PINS: tuple[ReviewPin, ...] = (
    # One ReviewPin per finding being fixed, in review-record order, built from the
    # finding record:
    #   page:  the file name in the finding's "where";
    #   wrong: the shortest fragment of its "quote" that still contains the error
    #          and occurs exactly once on the unfixed page;
    #   right: the shortest fragment of its "correct" text that carries the fix.
)


def test_physics_review_corrections_stay_fixed() -> None:
    problems: list[str] = []
    for pin in PHYSICS_REVIEW_PINS:
        assert pin.page in CHAPTERS, pin.page
        # A wrong fragment inside its own correction could never be absent.
        assert pin.wrong and pin.wrong not in pin.right, pin
        text = (TEXTBOOK / pin.page).read_text(encoding="utf-8")
        if pin.wrong in text:
            problems.append(f"{pin.page}: the reviewed error is back: {pin.wrong!r}")
        if pin.right not in text:
            problems.append(f"{pin.page}: the correction is missing: {pin.right!r}")
    assert problems == [], "\n".join(problems)
```

Fill `PHYSICS_REVIEW_PINS` with one `ReviewPin(page=..., wrong=..., right=...)` per finding being fixed, following the rule in its comment. `NamedTuple` is already imported by Task C5.

Run: `uv run --locked --group docs pytest tests/test_textbook.py -q -k physics_review`
Expected: FAIL in `test_physics_review_corrections_stay_fixed`, with one `the reviewed error is back: …` line for every pin. There is also one `the correction is missing: …` line for every pin whose `right` is not empty. This red run is the proof, which CLAUDE.md requires, that the regression test fails before the fix.

- [ ] **Step 5: Fix the pages.** Apply the `correct` text of each finding being fixed. Keep the H1, the `##` ids, the figure deep links and the citation strings unchanged, unless the finding is about one of them:
  - A caption fix keeps the `**图 N.k**` prefix.
  - A deep-link fix must still pass `deep_link_problems`. Change the page's `CHAPTERS` entry in the same edit.
  - A citation fix may use only the strings that this plan lists for that page. If none supports the sentence, weaken the sentence. Never invent a locator.
  - A fix may touch only the page and `tests/test_textbook.py`. If it would need any other file (nav, the index, another page), stop and raise it with the user.

- [ ] **Step 6: Run and see it pass.**

Run: `uv run --locked --group docs pytest tests/test_textbook.py tests/test_mkdocs_system.py tests/test_docs_integrity.py tests/test_bibliography.py -q`
Expected: all passed, including `test_physics_review_corrections_stay_fixed`.
Run: `uv run --locked --group docs python scripts/render_reference_index.py --check`
Expected: exit 0, no unknown or orphan keys.
Run: `uv run --locked --group docs mkdocs build --strict`
Expected: exit 0, no warnings.
For every number that a fix introduced or changed, re-run the kit command that covers it (Step 1), or the finding's own evidence command, and copy the output into the review record.

- [ ] **Step 7: Re-verify with the reviewer.** Send each corrected page back to the reviewer that found its problems. If that reviewer is gone, send it to a new independent reviewer with the Step 2 prompt. Append this text to the prompt:

~~~text
Your earlier findings on this page, the disposition of each, and the applied corrections follow
(the page's rows of the review record, then the output of `git diff -- docs/textbook/{PAGE}`).
For each confirmed finding, confirm that the correction resolves it. For each refuted finding,
say whether the counter-evidence convinces you. Review every changed line with the same rigour as
before and report any new finding in the same format.
~~~

Expected: every fixed finding is reported as resolved and no new P1 or P2 finding appears. If the reviewer still disputes a refutation, re-check it with a command or derivation; if you cannot settle it, raise it with the user. A new finding goes back through Steps 3–6. Repeat until the record has no open P1 or P2 finding.

- [ ] **Step 8: Pre-commit gate, then commit** (only when Steps 4–7 changed files). This commit changes `tests/test_textbook.py`, so the full Python gate runs first (CLAUDE.md, spec §6).

Run: `uv run --locked --group docs pytest --cov=quviz --cov-report=term-missing`
Expected: exit 0. The summary line reports only `passed`, with no `failed`, `error`, `skipped`, `xfailed` or `xpassed`, and the output contains `Required test coverage of 85% reached.` If anything is red, fix it and re-run this step; do not commit.
Run: `uv run --locked ruff check tests/test_textbook.py && uv run --locked ruff format --check tests/test_textbook.py`
Expected: `All checks passed!` and `1 file already formatted`.
Run: `git status --short -- docs tests mkdocs.yml`
Expected: exactly ` M tests/test_textbook.py` and one ` M docs/textbook/<page>.md` line for each corrected page, and nothing else.

```bash
git add tests/test_textbook.py docs/textbook
git commit -m "fix(textbook): correct the findings of the independent physics review" -m "Claude-Session: https://claude.ai/code/session_01E44DEzsc7Av26fc7nZ5rSo"
```

Fill the commit hash into the "Fix commit" column of every fixed row.

- [ ] **Step 9: Hand off the review record.** Put the review record into the hand-off notes. It must have one row per page (fourteen pages). Each row gives the reviewer, the verdict (`NO FINDINGS` or the finding ids), every disposition with its evidence and, for fixed findings, the fix commit.
  - If nothing was fixed, this task makes no commit, and `git status --short -- docs tests mkdocs.yml` prints nothing.
  - Task C20 Step 8 checks the record.

---

### Task C16: ADR-0005 — static hosting and the precomputed catalogue

**Files:**
- Create: `docs/adr/0005-static-hosting.md`
- Modify: `docs/adr/index.md:1-3`, `mkdocs.yml` (the `决策记录` list)
- Test: `tests/test_mkdocs_system.py` (new test)

**Interfaces:**
- Consumes:
  - spec §3 decisions D1–D6 and D12;
  - the contracts' file layout: the catalogue root `data/`, which holds `manifest.json`, `requests.json`, `spec.json` and the content-addressed `files/<sha256(body)[:24]>.json|.bin`; the static bootstrap loads it from `new URL('data/', document.baseURI)`; the manifest is fetched with `cache: 'no-cache'`;
  - E's generated `mkdocs.pages.yml`.
  - The spec's `data/v1/` (D1, §4.1) is superseded by the binding contracts; the ADR records `data/`.
- Produces: `adr/0005-static-hosting.md`, which Task C17's walkthrough note and Part E's status updates link.

- [ ] **Step 1: Write the failing test** (append to `tests/test_mkdocs_system.py`):

```python
def test_every_adr_is_indexed_and_listed_under_decision_records() -> None:
    nav = _raw_config()["nav"]
    decisions = _nav_paths(_section(_section(nav, "开发者"), "决策记录"))
    adrs = sorted(path.relative_to(DOCS).as_posix() for path in (DOCS / "adr").glob("0*.md"))
    assert "adr/0005-static-hosting.md" in adrs
    assert decisions == ["adr/index.md", *adrs]
    index = (DOCS / "adr" / "index.md").read_text(encoding="utf-8")
    for adr in adrs:
        assert f"]({Path(adr).name})" in index, adr
```

- [ ] **Step 2: Run it and watch it fail.**

Run: `uv run --locked --group docs pytest tests/test_mkdocs_system.py -q -k adr`
Expected: FAIL with `assert 'adr/0005-static-hosting.md' in [...]`.

- [ ] **Step 3: Create `docs/adr/0005-static-hosting.md`:**

```markdown
# ADR-0005：静态托管与预计算目录

- 状态：Accepted
- 日期：2026-09-25

## 背景

公开教材需要一个 GitHub Pages 站点，而 Pages 只托管静态文件，没有 Python 后端。[ADR-0001](0001-core-renderer-boundary.md) 规定物理只在 Python 中计算、浏览器只负责渲染，所以不能把氢样公式、采样或 marching cubes 搬进浏览器。

## 决策

1. **站点布局**：站点根是实验室单页应用，`learn/` 是本 MkDocs 教材，`data/` 是预计算场景目录（`manifest.json` 加按响应体内容哈希命名的 `files/<sha256 前 24 位>.json|.bin`）。不使用 `/docs`，因为本地 FastAPI 已用它提供 Swagger UI。
2. **构建时预计算**：`quviz export-static` 通过 ASGI 逐字回放真实的 FastAPI 应用，把每个响应的状态码、内容类型、`X-QuViz-*` 头与响应体原样写入目录，并生成以内容哈希为版本的 `manifest.json`；服务端在构建时给出的拒绝（非 2xx）同样记录，并在页面上原样显示原因。
3. **请求清单由前端真实代码枚举**：`web/tools/static-requests.ts` 复用运行时的请求构造函数写出 `requests.json`；Python 只按字面键回放，不在 Python 里重写 TypeScript 的参数拼写与顺序。
4. **静态传输层**：`pages` 构建模式下，前端改用按 manifest 查表的传输层；清单之外的组合在能力层被拒绝为“未预计算”，理由为中文可读句。解码与校验代码在两种模式下共用。
5. **目录内容**：全部 $n\le4$ 的本征态（实基与复基，$Z=1$），以及服务端目录中四个叠加态预设在播放帧上的等密度面、概率流与 `xz` 平面切片；样本数、种子、分辨率、包围概率等参数在静态模式下只读。
6. **生成数据不入库**：目录在构建时生成，约 280 MB 原始数据，不提交进 git。
7. **发布与验证分离**：本地 `scripts/build_pages.py` 构建并在子路径下预览，这是发布前的最终验证；`.github/workflows/pages.yml` 只重跑同一脚本并部署，不承担门禁。
8. **教材嵌入**：教材用 `<figure class="quviz-figure" data-lab="…">` 描述交互图；`docs/assets/javascripts/quviz-figure.js` 在读者点击后才以 iframe 加载实验室的 embed 模式。实验室根地址来自主题覆盖注入的 `<meta name="quviz-lab">`（`extra.quviz.lab_url`：本地默认 `http://127.0.0.1:8000/`，Pages 构建为 `../`），相对教材站点根解析；每个交互图的深链接都由测试对照目录内容校验。

## 原因

- 保持单一物理真值源：浏览器端没有第二份物理实现；
- 逐字回放保证静态文件与实时 API 响应字节一致，前端所有解析器无需分叉；
- 用前端真实代码枚举请求，键由构造保证与运行时一致，避免跨语言拼写漂移造成静默未命中；
- 生成数据远大于仓库本身，且 Windows 生成的浮点字节曾在 Linux 上逐字比对失败，不适合入库；
- 项目以本地验证为最终验证，不依赖 CI。

## 后果

- 教材站的实验室只能展示预计算目录；任意参数的实时计算仍需本地 `quviz serve`；
- 目录内容变化会改变 manifest 的 `version`；Pages 固定 `Cache-Control: max-age=600`，所以前端以 `no-cache` 重新验证 `manifest.json`，而场景文件按响应体的内容哈希命名、同名文件内容永不改变，新旧版本的帧不会混用；
- MkDocs 的 Pages 构建使用生成的派生配置（`INHERIT: mkdocs.yml`、`site_url`、`extra.quviz.lab_url: "../"`），因为 Material 的即时导航依赖 `site_url` 生成的 sitemap [@mkdocs-material]；MkDocs 相对派生配置所在目录解析相对路径，所以派生配置还把 `docs_dir` 与 `theme.custom_dir` 写成绝对路径，并设 `watch: []`；`mkdocs.yml` 本身不写子路径，本地 `mkdocs serve` 与浏览器门禁保持在根路径；
- 公开站点会展示参考文献索引；只有维护者可见的私有来源在索引中标注为私有链接，并且只在开发者页面引用。

## 未采用的方案

- 在浏览器里用 TypeScript 重写物理：违反 ADR-0001，形成第二个真值源；
- 把预计算数据提交进仓库或手工推送到 gh-pages 分支：仓库膨胀，且有跨平台字节漂移；
- 把教材放在 `/docs`：与 FastAPI 的 Swagger UI 路径冲突。
```

Replace `docs/adr/index.md` with:

```markdown
# 架构决策记录

ADR 记录“为什么这样做”，避免未来只看到代码而重新争论已解决的边界。

- [ADR-0001：科学内核与渲染器分离](0001-core-renderer-boundary.md)
- [ADR-0002：采用浏览器原生 3D](0002-browser-native-3d.md)
- [ADR-0003：引用采用单一真值源](0003-reference-index.md)
- [ADR-0004：qmsolve 作为参考而非真值内核](0004-qmsolve-boundary.md)
- [ADR-0005：静态托管与预计算目录](0005-static-hosting.md)
```

Append to the `决策记录` list in `mkdocs.yml`:

```yaml
          - ADR-0005 静态托管与预计算目录: adr/0005-static-hosting.md
```

- [ ] **Step 4: Run and see it pass.**

Run: `uv run --locked --group docs pytest tests/test_mkdocs_system.py tests/test_docs_integrity.py tests/test_bibliography.py -q`
Expected: all passed.
Run: `uv run --locked --group docs python scripts/render_reference_index.py --check && uv run --locked --group docs mkdocs build --strict`
Expected: both exit 0. `mkdocs-material` is tooling-tagged; citing it is allowed and does not change the index.

- [ ] **Step 5: Pre-commit gate, then commit.** This commit changes `tests/test_mkdocs_system.py`, so the full Python gate runs first (CLAUDE.md, spec §6).

Run: `uv run --locked --group docs pytest --cov=quviz --cov-report=term-missing`
Expected: exit 0. The summary line reports only `passed`, with no `failed`, `error`, `skipped`, `xfailed` or `xpassed`, and the output contains `Required test coverage of 85% reached.` If anything is red, fix it and re-run this step; do not commit.
Run: `uv run --locked ruff check tests/test_mkdocs_system.py && uv run --locked ruff format --check tests/test_mkdocs_system.py`
Expected: `All checks passed!` and `1 file already formatted`.

```bash
git add docs/adr/0005-static-hosting.md docs/adr/index.md mkdocs.yml tests/test_mkdocs_system.py
git commit -m "docs(adr): record ADR-0005 on static hosting and the precomputed catalogue" -m "Claude-Session: https://claude.ai/code/session_01E44DEzsc7Av26fc7nZ5rSo"
```

---

### Task C17: Bring the stale developer pages in line with the redesigned lab and the static textbook

**Files:**
- Modify: `docs/tutorials/frontend-rendering.md:30`
- Modify: `docs/getting-started/first-orbital.md:9-13`
- Modify: `docs/tutorials/phase-0-walkthrough.md:7-9,13,23,61,68`
- Modify: `docs/getting-started/development.md:12`
- Modify: `docs/getting-started/installation.md:103-106` (a new paragraph after it)
- Test: `tests/test_docs_integrity.py` (new test after the Task C6 test)

**Interfaces:**
- Consumes:
  - spec §4.4 layout and token wording;
  - contracts "D produces": `data-chrome` on every floating overlay, and the static-mode `教材` link;
  - ADR-0005 (Task C16).
- Produces: developer docs that describe the redesigned lab. Pinned strings that must survive are at `tests/test_docs_integrity.py:365-369`: `服务端 orbital catalog 的 \`3d-complex\``, `` `period_au=0` 的简并态不执行播放 ``, `` `aria-disabled` ``, `` `aria-describedby` `` and `` `slice_resolution_floor` ``. They live on lines 18-22 of `frontend-rendering.md`, which this task does not touch.

- [ ] **Step 1: Write the failing test:**

```python
def test_ui_docs_follow_the_redesigned_lab_and_the_static_textbook() -> None:
    frontend = (ROOT / "docs/tutorials/frontend-rendering.md").read_text(encoding="utf-8")
    first_orbital = (ROOT / "docs/getting-started/first-orbital.md").read_text(encoding="utf-8")
    walkthrough = (ROOT / "docs/tutorials/phase-0-walkthrough.md").read_text(encoding="utf-8")
    development = (ROOT / "docs/getting-started/development.md").read_text(encoding="utf-8")
    installation = (ROOT / "docs/getting-started/installation.md").read_text(encoding="utf-8")

    # The old "no glassmorphism" paragraph would contradict the redesigned lab.
    assert "不再使用蓝紫玻璃拟态" not in frontend
    assert "`data-chrome`" in frontend
    assert "$z$ 轴朝上" in frontend
    for page in (first_orbital, walkthrough):
        assert "态制备" not in page
    assert "**量子态**" in first_orbital
    assert "检查器" not in walkthrough
    assert "未预计算" in walkthrough
    assert "(../adr/0005-static-hosting.md)" in walkthrough
    # mkdocs serve on 8000 would collide with the lab that textbook figures embed.
    assert "uv run --locked --no-sync mkdocs serve -a 127.0.0.1:8001" in development
    assert "extra.quviz.lab_url" in installation
```

- [ ] **Step 2: Run it and watch it fail.**

Run: `uv run --locked --group docs pytest tests/test_docs_integrity.py -q -k redesigned`
Expected: FAIL at `assert "不再使用蓝紫玻璃拟态" not in frontend`.

- [ ] **Step 3: Edit the five pages.**
  1. `docs/tutorials/frontend-rendering.md`: replace the whole of line 30 (the paragraph starting `视觉系统是低饱和深色底`) with:

     ```markdown
     视觉系统采用“工具即首页”的全屏版式：画布全屏铺底、$z$ 轴朝上、中性深灰背景，所有控件都是浮在画布上的深色玻璃面板（`rgba(0,0,0,.6)` 底色、`blur(16px)` 背景模糊、`0 0 12px rgba(100,160,255,.2)` 光晕、24px 圆角），每个浮层都带 `data-chrome` 属性，视觉门禁截图前统一隐藏。界面只有一个蓝色强调色系（`#8ab4f8` / `#1a73e8`），字体为自托管的 Google Sans Flex（SIL OFL 1.1）加系统中文字体栈，数值使用 `tabular-nums`；设计令牌 `--qv-*` 与教材站共用。视口不再放描述性大标题，颜色语义只由右下角的图例胶囊承担。科学色轮、发散色标、density ramp 与流线速度色带属于数据，不跟随主题重设计。桌面布局是左侧“控制”面板（量子态 / 表示法 / 显示）、右侧详情面板（概览 / 图表 / 场景契约 / 引用）、底部居中的时间胶囊和右上角的“查找量子态”；`820px` 及以下，控制与详情改为底部抽屉，时间胶囊固定在抽屉之上，图例收为一个小按钮。
     ```

  2. `docs/getting-started/first-orbital.md`: replace lines 9-13 (from `左侧控制面板把操作分成三层：` through the `- **显示**…` bullet) with:

     ```markdown
     界面由浮在全屏画布上的几块面板组成：

     - 左侧**控制**面板分三组：**量子态**（$n,\ell,m$、实/复球谐，以及解析含时叠加态预设）、**表示法**（电子云、等密度面、平面切片或概率流线）、**显示**（点大小、透明度等只改变读图方式的参数）；
     - 右侧**详情面板**给出能量、径向分布图表、场景契约与引用；
     - 底部**时间胶囊**说明当前态是否随时间变化，叠加态在这里播放；
     - 右下**图例胶囊**说明颜色的含义。
     ```

  3. `docs/tutorials/phase-0-walkthrough.md`:
     - After line 9 (`…以下步骤在两种入口中的行为相同。`) insert a blank line and:

       ```markdown
       !!! note "教材站（GitHub Pages）上的静态实验室"

           公开教材站没有 Python 后端。站点根目录的实验室只读取构建时预计算好的目录：全部 $n\le4$ 的本征态（实基与复基，$Z=1$，28,000 个样本、种子 7，包围概率 0.9 与各态最低合法分辨率），以及四个叠加态预设在播放帧上的等密度面、概率流与 `xz` 平面切片。样本数、种子、分辨率、包围概率和 $Z$ 在静态版中只读；目录之外的组合显示“未预计算”，构建时服务端给出的拒绝原因则原样显示。本页凡是需要改这些参数的步骤，都请按[安装与启动](../getting-started/installation.md)在本地运行 `quviz serve`；决策记录见 [ADR-0005](../adr/0005-static-hosting.md)。
       ```

     - Then make these exact replacements (original line numbers):
       - line 13 `检查器显示“电子云”和点数` becomes `右侧详情面板显示“电子云”和点数`;
       - line 23 `在“态制备”中切换` becomes `在“量子态”分组中切换`;
       - line 61 `检查器应显示非零流线数和连续性诊断` becomes `右侧详情面板应显示非零流线数和连续性诊断`;
       - line 68 `回到“态制备”，选择“叠加态”` becomes `回到“量子态”分组，选择“叠加态”`.
  4. `docs/getting-started/development.md:12`: `uv run --locked --no-sync mkdocs serve` becomes `uv run --locked --no-sync mkdocs serve -a 127.0.0.1:8001`.
  5. `docs/getting-started/installation.md`: after line 106 (`不能跳过检查直接发布。`), insert a blank line and:

     ```markdown
     教材页面中的交互图默认嵌入 `http://127.0.0.1:8000/` 的本地实验室（`mkdocs.yml` 的 `extra.quviz.lab_url`）。本地阅读教材时，另开一个终端按上一节运行 `quviz serve`，点“加载交互图”才会显示实验室；文档服务因此固定在 8001 端口，避免与实验室冲突。
     ```

- [ ] **Step 4: Run and see it pass.**

Run: `uv run --locked --group docs pytest tests/test_docs_integrity.py tests/test_mkdocs_system.py tests/test_declared_versions.py -q`
Expected: all passed. `test_declared_versions.py` pins the single Node.js bullet in `installation.md`, which is untouched.
Run: `uv run --locked --group docs mkdocs build --strict`
Expected: exit 0. The ADR-0005 link resolves because Task C16 created it.

- [ ] **Step 5: Pre-commit gate, then commit.** This commit changes `tests/test_docs_integrity.py`, so the full Python gate runs first (CLAUDE.md, spec §6).

Run: `uv run --locked --group docs pytest --cov=quviz --cov-report=term-missing`
Expected: exit 0. The summary line reports only `passed`, with no `failed`, `error`, `skipped`, `xfailed` or `xpassed`, and the output contains `Required test coverage of 85% reached.` If anything is red, fix it and re-run this step; do not commit.
Run: `uv run --locked ruff check tests/test_docs_integrity.py && uv run --locked ruff format --check tests/test_docs_integrity.py`
Expected: `All checks passed!` and `1 file already formatted`.

```bash
git add docs/tutorials/frontend-rendering.md docs/getting-started/first-orbital.md docs/tutorials/phase-0-walkthrough.md docs/getting-started/development.md docs/getting-started/installation.md tests/test_docs_integrity.py
git commit -m "docs: describe the redesigned lab and the static textbook lab on developer pages" -m "Claude-Session: https://claude.ai/code/session_01E44DEzsc7Av26fc7nZ5rSo"
```

---

### Task C18: Label the private `claude-fable-audit` source

Decision: keep the entry, because it is the provenance of the 2026-08-22 audit baseline and the orphan gate needs a citing page. Keep citing it only on the two developer/audit pages. Mark it private in both places:
- in the bibliography, through the supported `note` field, which `scripts/render_reference_index.py:64,98` renders as “Notes”;
- on each citing line.

The textbook never cites it. Whether to drop it before the first public deploy stays a user decision (spec §7).

**Files:**
- Modify: `references.bib:254-260` (add `note`)
- Regenerate: `docs/references/index.md`
- Modify: `docs/project/status.md:36`, `docs/references/source-audit.md:76`
- Test: `tests/test_bibliography.py` (new test at the end)

**Interfaces:**
- Consumes: `quviz.docs.bibliography.parse_bibtex_file`, which reads the `note` field.
- Produces: a published index entry with `| **Notes** | 私有链接：… |`, and a gate that stops the private key from spreading to other pages.

- [ ] **Step 1: Write the failing test** (append to `tests/test_bibliography.py`):

```python
PRIVATE_SOURCES = ("claude-fable-audit",)
PRIVATE_SOURCE_PAGES = ["project/status.md", "references/source-audit.md"]


def test_private_sources_are_labelled_and_cited_only_on_developer_pages() -> None:
    bibliography = parse_bibtex_file(ROOT / "references.bib")
    docs = ROOT / "docs"
    for key in PRIVATE_SOURCES:
        assert "私有链接" in bibliography.entries[key].fields.get("note", "")
        citing = sorted(
            path.relative_to(docs).as_posix()
            for path in docs.rglob("*.md")
            if f"@{key}" in path.read_text(encoding="utf-8")
        )
        assert citing == PRIVATE_SOURCE_PAGES
        for page in citing:
            for line in (docs / page).read_text(encoding="utf-8").splitlines():
                if f"@{key}" in line:
                    assert "私有链接" in line, (page, line)
```

- [ ] **Step 2: Run it and watch it fail.**

Run: `uv run --locked --group docs pytest tests/test_bibliography.py -q -k private`
Expected: FAIL at `assert "私有链接" in ''`.

- [ ] **Step 3: Edit the sources.**
  - In `references.bib`, inside `@online{claude-fable-audit, …}`, add this line after `urldate = {2026-08-22},`. Keep it on one line, with no `|` and no URL:

    ```bibtex
      note = {私有链接：该 claude.ai artifact 只有项目维护者登录后可见，公开读者无法打开；这里仅作为开发审计留痕引用，其中的结论已在 docs/project/status.md 逐条复核。},
    ```

  - In `docs/project/status.md:36`, change `…而不是科学或工程正确性的替代证据 [@claude-fable-audit]：` to `…而不是科学或工程正确性的替代证据（私有链接：公开读者无法打开，仅作开发审计留痕）[@claude-fable-audit]：`.
  - In `docs/references/source-audit.md:76`, change `…具体缺陷仍要以代码、可重复命令和视觉/数值测试确认 [@claude-fable-audit]。` to `…具体缺陷仍要以代码、可重复命令和视觉/数值测试确认（私有链接，公开读者无法打开）[@claude-fable-audit]。`.
  - Regenerate the index: `uv run --locked --group docs python scripts/render_reference_index.py`.

- [ ] **Step 4: Run and see it pass.**

Run: `uv run --locked --group docs pytest tests/test_bibliography.py tests/test_citation_gates.py tests/test_docs_integrity.py -q`
Expected: all passed. `test_generated_index_emits_every_canonical_field` now also finds the note text in the regenerated index.
Run: `uv run --locked --group docs python scripts/render_reference_index.py --check && uv run --locked --group docs mkdocs build --strict`
Expected: both exit 0.
Run: `git diff --stat docs/references/index.md`
Expected: `1 file changed, 1 insertion(+)`, the new `| **Notes** | …` row.

- [ ] **Step 5: Pre-commit gate, then commit.** This commit changes `tests/test_bibliography.py`, so the full Python gate runs first (CLAUDE.md, spec §6).

Run: `uv run --locked --group docs pytest --cov=quviz --cov-report=term-missing`
Expected: exit 0. The summary line reports only `passed`, with no `failed`, `error`, `skipped`, `xfailed` or `xpassed`, and the output contains `Required test coverage of 85% reached.` If anything is red, fix it and re-run this step; do not commit.
Run: `uv run --locked ruff check tests/test_bibliography.py && uv run --locked ruff format --check tests/test_bibliography.py`
Expected: `All checks passed!` and `1 file already formatted`.

```bash
git add references.bib docs/references/index.md docs/project/status.md docs/references/source-audit.md tests/test_bibliography.py
git commit -m "docs(refs): label the private audit artifact and pin where it may be cited" -m "Claude-Session: https://claude.ai/code/session_01E44DEzsc7Av26fc7nZ5rSo"
```

---

### Task C19: Fullstack docs smoke covers textbook figures under instant navigation

**Files:**
- Modify: `web/fullstack-e2e/app.spec.ts` (insert after line 316, the end of the citation block)
- Modify: `tests/test_check_script.py:1559-1569` (the `browser_contract` tuple in `test_fullstack_browser_gate_also_starts_and_exercises_mkdocs`)
- Modify: `docs/reference/quality-gates.md` (the bullet starting `- 🔗 MkDocs 在真实 Chromium 中完成渲染`)

**Interfaces:**
- Consumes:
  - the DOM contract of Task C4 (`.quviz-figure__load`, `.quviz-figure__open`);
  - the meta tag of Task C2;
  - chapter 1's first figure (Task C7);
  - the Material nav, which renders every tab's links in the drawer.
- Produces: a browser-level proof, in real Chromium, that:
  - `document$` re-enhancement works after an instant-navigation swap;
  - the `quviz-lab` meta tag survives the swap;
  - the open link resolves to `http://127.0.0.1:8000/#<deep link>`;
  - nothing auto-loads an iframe (the fullstack lab runs on 8765, so loading one would record a failed local request).

- [ ] **Step 1: Write the failing pin.** In `tests/test_check_script.py`, extend the `browser_contract` tuple (lines 1559-1569) with four entries, keeping all existing entries:

```python
        'meta[name="quviz-lab"]',
        ".quviz-figure__open",
        'a[href$="textbook/01-wavefunction/"]',
        "textbook-document-swap",
```

- [ ] **Step 2: Run it and watch it fail.**

Run: `uv run --locked --group docs pytest tests/test_check_script.py -q -k fullstack_browser_gate_also_starts_and_exercises_mkdocs`
Expected: FAIL with `the full-stack browser smoke no longer asserts 'meta[name="quviz-lab"]'`.

- [ ] **Step 3: Extend the spec.** In `web/fullstack-e2e/app.spec.ts`, insert after line 316 (`await expect(page.locator(\`[id="${citationTarget}"]\`)).toHaveCount(1)`) and before the blank line that precedes `expect(failedApiRequests, …)`:

```ts

  // Textbook figures are enhanced on every Material document swap, not only on
  // full loads. The lab URL comes from the theme's quviz-lab meta tag; nothing
  // may load before the reader asks (the live lab here is on 8765, not 8000).
  await page.evaluate(() => {
    ;(window as Window & { __quvizInstantNavigation?: string }).__quvizInstantNavigation =
      'textbook-document-swap'
  })
  const chapterLink = page.locator('a[href$="textbook/01-wavefunction/"]').first()
  await expect(chapterLink).toHaveCount(1)
  await chapterLink.dispatchEvent('click')
  await expect(page).toHaveURL(/\/textbook\/01-wavefunction\/$/)
  expect(
    await page.evaluate(
      () => (window as Window & { __quvizInstantNavigation?: string }).__quvizInstantNavigation,
    ),
    'navigation.instant reloaded the chapter, so document$ re-enhancement was not exercised',
  ).toBe('textbook-document-swap')
  await expect(page.locator('meta[name="quviz-lab"]')).toHaveAttribute('content', 'http://127.0.0.1:8000/')
  const figure = page.locator('figure.quviz-figure').first()
  await expect(figure.locator('.quviz-figure__load')).toBeVisible()
  await expect(figure.locator('.quviz-figure__open')).toHaveAttribute(
    'href',
    'http://127.0.0.1:8000/#mode=eigenstate&n=1&l=0&m=0&basis=real&rep=point_cloud',
  )
  await expect(page.locator('figure.quviz-figure iframe')).toHaveCount(0)
```

In `docs/reference/quality-gates.md`, replace the whole `- 🔗 MkDocs 在真实 Chromium 中完成渲染 …` bullet (5 lines, ending `任一非空即失败，并由 \`web-fullstack\` CI 作业执行；`) with:

```markdown
- 🔗 MkDocs 在真实 Chromium 中完成渲染 — `npm run test:fullstack` 同时启动生产应用与 `mkdocs serve --strict`，并逐项检查：
  - 直达页面和 `navigation.instant` 换页后的全部 `.arithmatex` 都必须生成 `mjx-container`；
  - 架构页 Mermaid 必须生成 SVG；
  - Python API 必须出现 Phase 0 的 superposition / planes / models / slices / streamlines 模块；
  - 从参考文献页即时导航进入教材第 1 章后：页头仍带 `<meta name="quviz-lab">`；交互图占位卡已由 `document$` 重新升级；“在实验室中打开”指向 `extra.quviz.lab_url` 下的正确深链接；页面没有自动加载任何 iframe；
  - 本地请求、console 或 page error 任一非空即失败。

  这些检查由 `web-fullstack` CI 作业执行；
```

- [ ] **Step 4: Run and see it pass.**

Run: `uv run --locked --group docs pytest tests/test_check_script.py -q -k fullstack_browser_gate_also_starts_and_exercises_mkdocs`
Expected: 1 passed.
Run: `npm --prefix web run typecheck`
Expected: exit 0. `tsconfig.e2e.json` covers `fullstack-e2e/`.
Run: `npm --prefix web run test`
Expected: exit 0. The guards' skip and `.only` scans cover `fullstack-e2e/`, and the fullstack spec inventory stays `['app.spec.ts']`.
Run: `npm --prefix web run test:fullstack`
Expected: `1 passed`, then `assert-fullstack-run.mjs` reports the single required test passed. The run also proves, in a real browser, that:
- the new theme, fonts, Mermaid dark theme and figure script produce no console error;
- the home page still typesets math, follows the model-map link and jumps from the citation;
- the architecture page renders one Mermaid SVG.

- [ ] **Step 5: Pre-commit gate, then commit.** This commit changes `tests/test_check_script.py` (Python) and `web/fullstack-e2e/app.spec.ts` (`web/`, the docs smoke of the live interface). CLAUDE.md therefore requires the full Python gate plus `npm run test`, `npm run typecheck` and `npm run test:fullstack`, all on the tree being committed.

Run: `uv run --locked --group docs pytest --cov=quviz --cov-report=term-missing`
Expected: exit 0. The summary line reports only `passed`, with no `failed`, `error`, `skipped`, `xfailed` or `xpassed`, and the output contains `Required test coverage of 85% reached.` If anything is red, fix it and re-run this step; do not commit.
Run: `uv run --locked ruff check tests/test_check_script.py && uv run --locked ruff format --check tests/test_check_script.py`
Expected: `All checks passed!` and `1 file already formatted`.
Run: `npm --prefix web run typecheck && npm --prefix web run test`
Expected: both exit 0 (the same result as Step 4).
Step 4's `npm --prefix web run test:fullstack` result stands only if nothing changed after it:
- `git diff --stat` must show only the three files staged below;
- none of those three files may have been edited after Step 4.

Otherwise re-run `npm --prefix web run test:fullstack` here. Expected: `1 passed`, and `assert-fullstack-run.mjs` reports the single required test passed.

```bash
git add web/fullstack-e2e/app.spec.ts tests/test_check_script.py docs/reference/quality-gates.md
git commit -m "test(e2e): prove textbook figures survive Material instant navigation" -m "Claude-Session: https://claude.ai/code/session_01E44DEzsc7Av26fc7nZ5rSo"
```

---

### Task C20: Final verification of Part C

**Files:**
- None created or modified. This task only runs the gates and records their output in the PR/hand-off notes.

**Interfaces:**
- Consumes: everything above.
- Produces: the evidence that "C produces" in the contracts holds:
  - a strict build from the repo root;
  - `theme.custom_dir: overrides` and `extra.quviz.lab_url`;
  - the figure markup and script behaviour;
  - no unintended new external URL;
  - a complete Task C15 physics-review record with no open P1 or P2 finding.

- [ ] **Step 1: Python lint, format, types.**

Run: `uv run --locked ruff check . && uv run --locked ruff format --check . && uv run --locked mypy`
Expected: `All checks passed!`, `N files already formatted`, `Success: no issues found`.

- [ ] **Step 2: Full Python suite with coverage.**

Run: `uv run --locked --group docs pytest --cov=quviz --cov-report=term-missing`
Expected: all tests pass, 0 skipped, `Required test coverage of 85% reached` (Part C adds no `src/` code, so coverage is unchanged). The new modules are included:
- `tests/test_textbook.py`: 8 tests, or 9 when Task C15 added `test_physics_review_corrections_stay_fixed`;
- `tests/test_quviz_figure_js.py`: 1 test.

Every earlier commit already passed this gate. This run confirms that the final tree does too.

- [ ] **Step 3: Docs generators and strict build.**

Run: `uv run --locked --group docs python scripts/render_reference_index.py --check`
Run: `uv run --locked --group docs python scripts/render_openapi_reference.py --check`
Run: `uv run --locked --group docs mkdocs build --strict`
Expected: all three exit 0, with no warnings from the build.

- [ ] **Step 4: Built-site spot checks** *(bash)*.

```bash
grep -c '<meta name="quviz-lab" content="http://127.0.0.1:8000/">' site/index.html site/textbook/09-superposition-time/index.html
ls site/assets/fonts
grep -o 'class="quviz-figure"' site/textbook/09-superposition-time/index.html | wc -l
grep -c 'quviz-figure.js' site/textbook/01-wavefunction/index.html
```

Expected:
- `…index.html:1` twice;
- the three font files;
- `5`;
- `1`.

- [ ] **Step 5: No unintended new absolute URL under `docs/`** *(bash)*. `check_links.py --changed-since` diffs `docs/` for added URLs; list them offline first.

```bash
uv run --locked --no-sync python -c 'import subprocess
from quviz.docs.links import added_urls, is_loopback_url
base = subprocess.run(["git", "merge-base", "master", "HEAD"], capture_output=True, text=True, check=True).stdout.strip()
diff = subprocess.run(["git", "diff", base, "HEAD", "--", "docs"], capture_output=True, text=True, encoding="utf-8", check=True).stdout
print(sorted(url for url in added_urls(diff) if not is_loopback_url(url)))'
```

Expected: `['http://scripts.sil.org/OFL']`, the URL inside the verbatim OFL licence. Any other URL is a defect: remove it, or justify it and re-run. If the branch already contains Part A/B merges, their docs changes (e.g. a regenerated `docs/reference/http-schema.md`) may add entries; list and justify them in the hand-off.

Then run the network probe that CI would run: `uv run --locked --no-sync python scripts/check_links.py --changed-since master`
Expected: `probing 1 link(s) added since master`, and a summary ending `1 ok, 0 blocked-by-bot-filter, 0 suspect, 0 broken`. Planning measured `http://scripts.sil.org/OFL` → 301 → `https://openfontlicense.org/` 200. If there is no network, record "not verified (offline)" in the hand-off instead of claiming success.

- [ ] **Step 6: Web gates** (Part C touched `web/fullstack-e2e/app.spec.ts`).

Run: `npm --prefix web run typecheck && npm --prefix web run test`
Expected: both exit 0.
`npm --prefix web run test:fullstack` passed in Task C19 on the same docs tree. Re-run it only if any `docs/`, `overrides/` or `mkdocs.yml` byte changed after Task C19: `git diff --stat <C19 commit> HEAD -- docs overrides mkdocs.yml` must be empty.

- [ ] **Step 7: Clean tree.**

Run: `git status --short`
Expected: no output. There is nothing to commit in this task. `site/` is git-ignored. List `git log --oneline master..HEAD` in the hand-off:
- the eighteen commits of Tasks C1–C14 and C16–C19;
- one more commit from Task C15 when the review led to at least one fix.

- [ ] **Step 8: Physics-review record.** Check the Task C15 record in the hand-off notes:
  - it has one row for each of the fourteen pages in `CHAPTERS`, and each row names an independent reviewer;
  - every finding has a disposition with evidence;
  - no P1 or P2 finding is still open;
  - every fixed finding names its commit, and its `ReviewPin` is in `PHYSICS_REVIEW_PINS`;
  - every confirmed P3 finding left unfixed says why.

Run: `uv run --locked --no-sync python -B -c "import sys; sys.path.insert(0, 'tests'); import test_textbook as t; print(len(t.CHAPTERS), len(getattr(t, 'PHYSICS_REVIEW_PINS', ())))"`
Expected: `14 <k>`, where `<k>` equals the number of fixed findings in the record. When nothing was fixed, the tuple does not exist and `<k>` is `0`.

If the record is missing, incomplete or has an open P1/P2 finding, Part C is not done. Go back to Task C15.

---

## Self-review

**Spec coverage (spec section → task):**

| Spec item | Task(s) |
|---|---|
| §4.5 nav tabs 首页 · 教材 · 深入阅读 · 开发者 · 信源与审计; every page keeps its path, once in nav | C1 (C7–C14 and C16 add lines) |
| §4.5 `docs/textbook/` chapters 0–11 + appendices (学习目标 → 正文与公式 → 交互图 → 常见误区 → 思考题 → 延伸阅读) | C7 (0, 1), C8 (2, 3), C9 (4, 5), C10 (6, 7), C11 (8), C12 (9), C13 (10, 11), C14 (A, B); template enforced by C5 |
| §1 success criterion 2: every chapter has at least one click-to-load figure with "在实验室中打开" | C4 (script); C5 (gate: `test_registered_chapters_match_their_sections_and_figures` requires a figure on every registered page); C7–C14 (figures). The appendices have one figure each (A.1, B.1), so the criterion holds whether or not they count as chapters. |
| §4.5 figure markup, `quviz-figure.js`, lab URL from `<meta name="quviz-lab">` relative to `__config.base` | C2 (meta), C4 (script and CSS), C19 (browser proof) |
| §4.5 / contracts: `theme.custom_dir: overrides`, `extra.quviz.lab_url` | C2 |
| §4.5 theme: dark default + light alternative, glass header/tabs, panel sidebars/admonitions, self-hosted Google Sans Flex, Mermaid dark | C2 (palette, Mermaid), C3 (fonts, CSS) |
| §4.4 `--qv-*` tokens (shared with the lab) | C3 (pinned by `SPEC_TOKENS`) |
| D7 fonts: OFL Google Sans Flex latin wght + math, system CJK stack, no off-site font requests | C3 |
| D12 one active WebGL figure per page, readable without JS | C4 |
| §4.5 home page keeps pinned formula, citation, model-map link, 解析含时叠加态/平面切片 | C6 (and existing pins) |
| §4.5 stale docs: frontend-rendering (visual system and breakpoints), first-orbital, walkthrough static-mode note | C17 (plus the development/installation port fix the figure feature needs) |
| §4.5 ADR-0005 | C16. It records the contracts' `data/` layout (content-addressed `files/`), which supersedes the spec's `data/v1/`. |
| §6 "提交前 `uv run --group docs pytest --cov=quviz`（≥85%）" and CLAUDE.md "提交前" | Every commit step (C1–C19, and C15 when it fixes anything) runs the full Python gate plus ruff on its test files. C19 also runs `npm run typecheck`, `npm run test` and `npm run test:fullstack` (Global Constraints, "Pre-commit gate") |
| §7 risk: physics errors → 每章独立物理审校（对抗式） | C15: one independent reviewer per page, with the Review Focus 1 values and the recompute kit K1–K10. The author's evidence-first adjudication follows. Fixes are pinned by `test_physics_review_corrections_stay_fixed`, which is red before the fix, and re-verified by the reviewer. C20 Step 8 checks the record |
| §7 risk: private `claude-fable-audit` citation | C18 |
| §6 "教材页加载与嵌入图按钮" (browser evidence on the live path) | C19; the Pages path is Part E's pages-e2e |
| §1 success criterion 5: all gates green, affected tests updated with intent preserved | Per-commit gate in C1–C19; C20 re-runs everything on the final tree |
| `reference/quality-gates.md`, `project/status.md`, `roadmap.md`, README (§4.5 list) | Out of Part C scope (Part E owns them); C4/C5/C19 only add or adjust the docs-gate bullets they introduce |

**Cross-part review round (2026-09-25), dispositions:**
- *Full gate before every commit* (major): accepted.
  - All eighteen original commit steps touch a `tests/*.py`. Each now runs `uv run --locked --group docs pytest --cov=quviz --cov-report=term-missing` and ruff on its test files before `git add`.
  - For C19, `npm run typecheck` and `npm run test` were already in Step 4. Its commit step now re-runs them, adds the Python gate, and re-runs `test:fullstack` if anything changed after Step 4.
  - Planning checked that the four pre-existing test files the tasks edit are ruff-clean today.
- *Independent adversarial physics review* (major): accepted as the new Task C15 (after C14, before the ADR). The old C15–C19 are renumbered C16–C20, and every internal reference was updated. No other part cites Part C task numbers (checked by grep over parts A, B, D and E).
  - Planning re-ran K1–K10 on 2026-09-25, and all outputs match the plan.
  - Planning assembled the C5 gate and the `ReviewPin` test from this plan in a scratch copy. The review pin went red with a planted wrong fragment and green after the fix. Both code blocks are `ruff format`/`ruff check` clean under the repo's `pyproject.toml`.
- *ADR `data/v1/`* (minor): accepted. The ADR text and its Consumes line now say `data/`, as in contracts ("A → B/E", "static bootstrap … `new URL('data/', document.baseURI)`"). The cache sentence now rests on content-addressed file names plus the `no-cache` manifest, not on a versioned directory.
- *Spec gaps inside Part C's scope:*
  - Appendices and criterion 2 are handled by giving each appendix a figure, with a gate for it; see the coverage table.
  - The not-precomputed wording: chapter 0 no longer quotes one reason sentence verbatim. It quotes only D's tag 「未预计算」 and the hint that ends every B reason (Review Focus 5).
  - The MkDocs child-config paths: Review Focus 6 now names `docs_dir`, `watch` and `custom_dir` with their `config_options.py` lines, and says `watch: []`.
  - The other listed gaps belong to the contracts file or to Parts A, B, D and E: A/B API additions, the enumerator's cwd, `ParameterBound.step`, 404 handling, D's hooks, and the playback deep links.

**Placeholder scan:** no step says "TBD", "TODO", "similar to Task N" or "add error handling".
- Every test is given as code. Every chapter has an exact H1, section ids, figure markup and captions, citation strings, exercises with answers, and misconceptions.
- The chapter prose is intentionally left to the implementer (brief). Everything that determines equivalence is pinned by `CHAPTERS` and the spec text, and C15 then has it independently reviewed.
- Repeated steps across chapter tasks point at the "Chapter tasks — shared rules" block for the identical commands. Each task still lists its own registry code, nav lines, index rows, self-check commands and pre-commit gate in full.
- C15 contains the only data that depends on an outcome: the `PHYSICS_REVIEW_PINS` entries and the `{PAGE}`/`{SPEC}`/`{SOURCES}` prompt fields.
  - The prompt fields are filled from the table in C15 Step 2.
  - Each pin is built by a fixed rule from a finding record (the comment in the code). Nothing is left to invent.

**Interface consistency with `design/plans/2026-09-25-contracts.md`:**
- *"C produces".*
  - `mkdocs.yml` gets `theme.custom_dir: overrides` and `extra.quviz.lab_url: "http://127.0.0.1:8000/"` (C2).
  - The figure markup is exactly `<figure class="quviz-figure" data-lab="<deep link without leading #>" markdown>caption</figure>` (C4/C5).
  - The script builds `<lab>#embed=1&<data-lab>` for the iframe and `<lab>#<data-lab>` for the link, with `lab_url` resolved against the site root from Material's `__config.base` (C4, test case 1).
  - The strict build runs from the repo root (C20).
- *The Pages config written by Part E* (`INHERIT` + `site_url` + `extra.quviz.lab_url: "../"`) works with C's `overrides/main.html`. Planning built such a child config (strict) and saw `<meta name="quviz-lab" content="../">`.
  - E must also set an absolute `docs_dir`, an absolute `theme.custom_dir` and `watch: []` (Review Focus 6; `mkdocs/config/config_options.py:689-712` and `:842-846`).
  - ADR-0005 (C16) records the same rule.
- *The catalogue path* is `data/` with `manifest.json` and `files/<sha256(body)[:24]>.json|.bin` (contracts "A → B/E"). ADR-0005 uses exactly this.
- *The deep-link grammar* (`serializeDeepLink` key order `embed,mode,n,l,m,z,basis,preset,t,rep,plane,obs`; `RepresentationKind`, `PrincipalPlane`, `SliceObservable` and `BasisKind` values) is mirrored verbatim in `DEEP_LINK_KEY_ORDER` and the value tuples of `tests/test_textbook.py` (C5).
- *The static catalogue* (`spec.json`: eigenstates `n_max 4`, both bases, 4 representations, 3 planes, 4 observables; superposition presets, 3 representations, `planes ["xz"]`, `"frames": "playback-lattice"` = `nextTimeAu`) is mirrored in the same file, and `playback_frames` reproduces `nextTimeAu` (28 and 24 frames, pinned).
  - The appendix figures use only catalogue states: the eigenstate 2s xz density slice, and `1s-2pz` at the lattice time `8.4`.
- *"D produces"* is only consumed:
  - C's iframe sandbox allows popups so D's embed-mode `在实验室中打开` (`target _blank`) works;
  - C17 names `data-chrome` exactly as D will set it.
- *`NOT_PRECOMPUTED_DETAIL`* and the other Part B reasons are not quoted in full anywhere in Part C.
  - Chapter 0 (C7) and the walkthrough note (C17) use the tag 「未预计算」. Chapter 0 also quotes the shared closing hint `本地运行 quviz serve 可实时计算任意参数。`. That hint ends `NOT_PRECOMPUTED_DETAIL` and every reason in `design/plans/2026-09-25-part-b-web-data.md:3175-3254`.
  - If the contracts later fix one canonical sentence, no Part C text contradicts it.
- *Shared commands* are used exactly as listed (the pre-commit gate is the contracts' "Python gate" command), and no npm dependency is added.
