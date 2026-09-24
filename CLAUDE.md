# QuViz

## 工作原则

- 调试：先稳定复现、定位根因，再动手修；不凭猜测连改多处。
- 完成前验证：没有实际跑过验证命令并看到输出，不声称“已修复 / 已通过 / 已完成”。
- 接收评审：对外部评审或审计意见逐条查证据再采纳，技术上不成立的直接指出，不表演式认同。

## 测试与验证

- 按改动风险选最小、最快且足以验证行为的测试。不机械地为每个函数补单测，不重复测已被可靠覆盖的行为。
- 修缺陷，或改物理数值（归一化、网格/差分精度、等值面）、Python↔web 数据契约等关键逻辑时，为重要失败场景留针对性回归测试；修缺陷的测试须确认在修复前会失败。
- 端到端测试（Playwright fullstack/visual）只用于关键用户流程和前后端连接；改到 UI 呈现才跑 visual，视觉基线只在确认是有意变化时更新（`npm run test:visual:update`）。
- 开发中只跑受影响的测试，不在每次编辑后跑全套或端到端。
- 提交前：改 Python 跑 `uv run pytest --cov=quviz`（覆盖率门槛 85%）；改 `web/` 跑 `npm run test` 和 `npm run typecheck`；触及接口或渲染再跑 `npm run test:fullstack` / `npm run test:visual`。
- CI（`.github/workflows/ci.yml`）会跑以上全部；本地不必全跑，但不能靠 CI 代替本地对改动部分的验证。
- 测试不能 skip，xfail 意外通过即失败（见 `tests/conftest.py`、`xfail_strict`）；不要为过门禁而绕开这两条策略。
- 报告实际跑了什么、结果如何、哪些没验证。
