# 开发工作流

## 常用命令

```bash
uv run --locked --group docs pytest --cov=quviz
uv run --locked ruff check .
uv run --locked ruff format .
uv run --locked mypy
uv run --locked --no-sync python scripts/render_reference_index.py --check
uv run --locked --no-sync python scripts/render_openapi_reference.py --check
uv run --locked --no-sync mkdocs serve -a 127.0.0.1:8001
npm --prefix web run build
```

也可以使用：

```bash
make check
```

前端测试可单独运行：

```bash
npm --prefix web run test
```

真实后端与生产前端挂载的浏览器 smoke 另行运行：

```bash
uv sync --locked --all-groups
npm --prefix web ci --no-audit --no-fund
npm --prefix web exec --no -- playwright install chromium
npm --prefix web run test:fullstack
```

该命令生产构建 `web/dist`，从仓库根启动 `quviz serve` 于专用端口 8765，再以 Chromium
依次访问真实点云、等值面、切片、概率流和叠加态 API；它不使用视觉测试的 fixture。
服务器以 `--no-sync` 启动，所以前两步是新 checkout 与陈旧环境的显式前置条件，不会在测试中
临时解析或改写依赖。
Playwright 成功退出后，`assert-fullstack-run.mjs` 还会审计 JSON 报告，要求固定 spec 与标题
恰好运行一次且通过；0 tests、全 skip、重复/额外执行、重试掩盖或错误 testDir 都会失败。
这条门禁由 CI 的 `web-fullstack` job 执行，不在 `make check` / `check.ps1` 内。它验证源码
checkout 的生产挂载路径；当前 wheel 是否携带静态前端仍是独立的发布验证项。

`npm run test` 不只是 vitest，而是一条以 `&&` 串起、逐段被 `tests/test_check_script.py`
按精确元组钉住的链（少一段、多一段、换顺序都会变红）：

1. `node scripts/clean-coverage.mjs` — 删掉上一轮的三份报告，杜绝以旧报告顶账；
2. `tsc -p tsconfig.test.json --noEmit` — 用测试用的 tsconfig 类型检查；
3. `vitest run --coverage`，并写出 JSON 运行结果；
4. `node scripts/assert-no-skips.mjs` — 按运行结果核对零 skip / 零 todo、无缺席 spec；
5. `node scripts/assert-coverage-scope.mjs` — 核对本次运行**解析后**的覆盖率配置，以及本次运行
   **写出的报告**所列的文件集与各模块重算出的覆盖率。

第 5 步读的是报告，不是插桩过程本身；它能挡住配置层面的削弱，挡不住写代码去伪造报告——界线写在
`web/scripts/assert-coverage-scope.mjs` 顶部与[项目状态](../project/status.md)的《门禁的防护边界》。

Windows PowerShell：

```powershell
& .\scripts\check.ps1
```

## 静态教材站（GitHub Pages）

教材站由 `scripts/build_pages.py` 在本地组装到 `build/pages/`（`build/` 已被 `.gitignore` 忽略，预计算数据不入库）：

```bash
uv run --locked --no-sync python scripts/build_pages.py                            # 完整构建：预计算数据 + 实验室 + 教材
uv run --locked --no-sync python scripts/build_pages.py --skip-data                # 复用上次的 build/pages/data，只重建实验室与教材
uv run --locked --no-sync python scripts/build_pages.py --skip-data --serve 4180   # 重建后按仓库子路径预览
```

完整构建依次运行：

1. `quviz export-static plan` 写出目录与规格；
2. `web/tools/static-requests.ts` 由前端真实请求代码枚举 `requests.json`；
3. `quviz export-static render --workers N` 通过 ASGI 逐字回放每个请求。N 默认与导出器相同，取 CPU 数且最多 8：每个进程峰值约 0.3–0.4 GB 内存。导出器只接受 1–32，超出范围时脚本在任何步骤之前拒绝；
4. `npm --prefix web run build:pages` 构建实验室，输出到 `build/pages-web/`，不覆盖 `quviz serve` 挂载的 `web/dist`；
5. 生成 `build/mkdocs.pages.yml` 并 `mkdocs build --strict` 到 `build/pages/learn/`。

最后合并实验室文件、写入 `.nojekyll`，并打印体积报告（总量、各顶层目录、最大 10 个文件）。实验室构建里出现 sourcemap，或整站超过 GitHub Pages 的 1 GB 上限，构建都会失败。只有成功的构建才写出构建记录 `build/pages-build.json`（站点地址、子路径与数据版本）；构建一开始就删掉上一次的记录，所以失败的构建不会留下一份描述旧站点的记录。完整构建的耗时主要花在第 3 步。

`site_url` 默认由 `git remote get-url origin` 推导为 `https://<owner>.github.io/<repo>/`，也可以用 `--site-url` 指定。它只影响教材的 sitemap、canonical 与预览子路径；实验室本身全部使用相对路径。`--serve` 在 `http://127.0.0.1:<端口>/<repo>/` 预览，并且只在这个子路径下应答，与 Pages 一致：`/` 跳转到子路径，子路径之外一律 404。所以任何写死根路径的资源都会在预览里暴露。预览与 Pages 的两处刻意差异如下：

- 预览发送 `Cache-Control: no-cache`，不压缩；
- Material 的 instant navigation 按 sitemap 重定位链接时只替换协议与主机名、不替换端口，所以在本地端口上退化为整页跳转，在 Pages 上正常。

`.github/workflows/pages.yml` 在 master 更新时用同一脚本完整重建站点，`site_url` 取自 `actions/configure-pages`，然后部署。它是发布器而不是门禁：可发布的判据仍是本地的完整构建与浏览器门禁。首次使用前，需要维护者在仓库设置中把 Pages 的构建来源设为 GitHub Actions。

## 提交前门禁

`scripts/check.ps1` 按顺序跑完下面九道门禁，任何一道非零退出即整体失败：

1. `uv run ruff check .`；
2. `uv run ruff format --check .`；
3. `uv run mypy`；
4. `uv run --group docs pytest --cov=quviz --cov-report=term-missing`（科学不变量、采样统计、引用与门禁自身的测试都在其中；`tests/conftest.py` 把任何 skip 记为会话失败）；
5. `uv run --group docs python scripts/render_reference_index.py --check`（引用键与索引同步）；
6. `uv run --group docs python scripts/render_openapi_reference.py --check`（HTTP 参数页与 live OpenAPI 同步）；
7. `uv run --group docs mkdocs build --strict`；
8. `web/` 下 `npm run test`（上面那五段链）；
9. `web/` 下 `npm run build`（Vite 生产构建）。

判定以**整条命令的退出码**为准：`exit 0` 才算通过。屏幕上那行 `All checks passed!` 是 **ruff**
自己打印的，不是 check.ps1 的结论——看到它并不代表后面八道门禁跑过了。

九道门禁一律在**这个脚本自己所在的那份 checkout** 里运行，而不是调用者的当前目录：脚本解析
`$PSCommandPath`（文件本身，不只是它所在的目录）、跟随文件符号链接与目录 junction 到真实位置，
拒绝以硬链接方式调用（硬链接没有可跟随的目标；注意只要存在任一硬链接，仓库自己的
`scripts/check.ps1` 也会一并拒绝运行，这是刻意的失效安全方向），再用
`git rev-parse --show-toplevel --show-prefix` 确认解析出的目录确实是某个工作区的 `scripts/`，
并要求该根目录的 `pyproject.toml` 声明 `name = "QuViz"`。这些检查合起来取代了原先"存在 `.git` 和
`pyproject.toml` 两个文件"的判据——两个**空文件**就能满足它。

本地脚本假定前置安装已经由受支持的 Node 版本完成；它不会在每次 `npm run` 前重新解释
`web/package.json` 的 semver 范围。`npm ci` 由 `web/.npmrc` 的 `engine-strict=true` 拒绝不受支持
的运行时，三个前端 CI job 则显式固定 Node 22.22.2。仅凭一棵既有 `node_modules` 上的本地
`check.ps1` 通过，不能反推当前 Node 版本受支持。

## 添加依赖

运行时依赖：

```bash
uv add package-name
```

开发依赖：

```bash
uv add --group dev package-name
```

文档依赖：

```bash
uv add --group docs package-name
```
