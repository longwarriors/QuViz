# Python API

本页列出 Phase 0 已公开并由测试覆盖的科学内核、采样与 Scene Contract 模块。
HTTP 端点及其可服务参数另见 [HTTP API](api.md) 和[生成的 HTTP Schema](http-schema.md)。

## Shared conventions

::: quviz.conventions

## Hydrogenic states

::: quviz.physics.hydrogenic

## Analytic superpositions

::: quviz.physics.superposition

## Observables

::: quviz.physics.observables

## Plane primitives

::: quviz.physics.planes

## Hybridization

::: quviz.physics.hybridization

## Continuity diagnostics

::: quviz.physics.continuity

## Finite-box diagnostics

::: quviz.physics.finite_box

## Sampling

::: quviz.sampling.inverse_cdf

::: quviz.sampling.point_cloud

## Scene contracts and builders

::: quviz.scene.models

::: quviz.scene.builders

## Slice assets

::: quviz.scene.slices

## Probability-flow assets

::: quviz.scene.streamlines

## Binary browser payloads

::: quviz.scene.binary

## Grid contracts

::: quviz.solvers.grid

## Static export

教材站（GitHub Pages）没有 Python 后端。`quviz export-static plan|render` 在构建时把前端将要发出的每个字面请求经进程内 ASGI 逐字回放成内容寻址文件与 `manifest.json`；请求键由前端自己的请求构造枚举，Python 不重新拼写查询串。

::: quviz.export.catalog_spec

::: quviz.export.asgi

::: quviz.export.static_site
