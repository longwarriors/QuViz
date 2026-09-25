# ADR-0005：静态托管与预计算目录

- 状态：Accepted
- 日期：2026-09-25

## 背景

公开教材需要一个 GitHub Pages 站点，而 Pages 只托管静态文件，没有 Python 后端。[ADR-0001](0001-core-renderer-boundary.md) 规定物理只在 Python 中计算、浏览器只负责渲染，所以不能把氢样公式、采样或 marching cubes 搬进浏览器。

## 决策

1. **站点布局**：站点根是实验室单页应用，`learn/` 是本 MkDocs 教材，`data/` 是预计算场景目录（`manifest.json` 加按响应体内容哈希命名的 `files/<sha256 前 24 位>.json|.bin`）。不使用 `/docs`，因为本地 FastAPI 已用它提供 Swagger UI。
2. **构建时预计算**：`quviz export-static` 通过 ASGI 逐字回放真实的 FastAPI 应用，把每个响应的状态码、内容类型、`X-QuViz-*` 头与响应体原样写入目录，并生成以内容哈希为版本的 `manifest.json`。4xx 拒绝（如 422）同样记录，并在页面上原样显示原因；5xx、404 或传输异常使导出失败（不写 manifest）。
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
- 公开站点会展示参考文献索引；只有维护者可见的私有来源 `claude-fable-audit` 在索引中标注为私有链接，只在开发者与信源审计页面引用（`project/status.md`、`references/source-audit.md`），教材从不引用。

## 未采用的方案

- 在浏览器里用 TypeScript 重写物理：违反 ADR-0001，形成第二个真值源；
- 把预计算数据提交进仓库或手工推送到 gh-pages 分支：仓库膨胀，且有跨平台字节漂移；
- 把教材放在 `/docs`：与 FastAPI 的 Swagger UI 路径冲突。
