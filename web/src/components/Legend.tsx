import { ChevronUp } from 'lucide-react'
import { useId, useState, type ReactNode } from 'react'

import type { SceneStatus, SliceObservable } from '../api/types'
import { representationLabel } from './sceneStatus'

/** What an absent or non-finite number is shown as. Never "NaN", never a guess. */
const PLACEHOLDER = '—'

/**
 * A reported number with its unit, or the placeholder.
 *
 * Three significant figures, matching the streamline legend's `toPrecision(3)`:
 * a legend labels a ramp, and a ramp labelled to fifteen digits claims a
 * precision the eye cannot read off it.
 */
function amountWithUnit(value: number, unit: string, separator = ' '): string {
  if (!Number.isFinite(value)) return PLACEHOLDER
  const text = value.toPrecision(3)
  return unit === '' ? text : `${text}${separator}${unit}`
}

/**
 * The title of a slice legend, by the field the plane carries.
 *
 * Keyed on the SLICE observable, never on `metadata.observable`: the server
 * maps `wavefunction_real` and `wavefunction_imag` onto the single
 * `wavefunction` observable, so metadata cannot tell a real section from an
 * imaginary one, and a phase section's metadata observable is `phase` only by
 * coincidence of the same mapping. `Record<SliceObservable, string>` also makes
 * a fifth observable a compile error here rather than an unnamed picture.
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

/**
 * The ramp, its labels and the sentence naming what the colour means, for one
 * slice observable.
 *
 * Each arm names the map `scene/sliceTexture.ts` actually applies -- the phase
 * wheel, the diverging map normalised by the plane's own extreme, the
 * sequential map through a square root -- so the legend cannot drift into
 * describing a colouring the renderer does not perform.
 */
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

  // No ramp is drawn for an observable that was never reported: a legend that
  // guessed one would name a colour scheme the texture may not be using.
  return { visual: null, text: <p>该切片没有报告 observable，因此无法为其颜色命名。</p> }
}

/**
 * The frame every legend body shares: a floating glass pill that starts open,
 * can be collapsed to just its title, and never removes the explanatory
 * sentences from the DOM -- collapsing hides them, it does not discard them.
 */
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
 * The bottom-right legend pill. It must describe the asset actually on
 * screen: a phase wheel over streamlines, whose colour encodes speed, would
 * misname the one thing a legend exists to name.
 */
export function Legend({ status, bloom = 0, defaultExpanded = true }: LegendProps) {
  const basis = status.metadata?.state.basis ?? status.superposition?.basis
  const representation = status.metadata?.representation ?? status.superposition?.representation
  const bloomWarning =
    bloom > 0 && (representation === 'slice' || representation === 'streamlines') ? (
      <p data-bloom-warning="">Bloom 已开启：屏幕颜色含光晕，不再与色带逐字一致。</p>
    ) : null

  if (status.unavailable !== undefined) {
    // Nothing is drawn, so there is no colour to name. The legend says which
    // representation was asked for and why it produced nothing -- a phase wheel
    // here would describe a picture that does not exist, and "Waiting for asset
    // metadata" would promise one that is not coming.
    return (
      <LegendFrame title="无可绘制资产" defaultExpanded={defaultExpanded}>
        <p>
          <strong>{representationLabel(status.unavailable.kind)}</strong> 对当前量子态不可用。{' '}
          {status.unavailable.reason}
        </p>
      </LegendFrame>
    )
  }

  if (representation === undefined) {
    // No asset has described itself -- the first frame is still loading, or
    // the request for it failed -- so nothing is drawn and there is no colour
    // to name. A phase key here would describe a picture that does not exist,
    // and after a failure "waiting for metadata" would promise one that is not
    // coming. (A frame kept on screen after a later failure still carries its
    // metadata, and is described by the branches below.)
    return status.error !== undefined ? (
      <LegendFrame title="无可绘制资产" defaultExpanded={defaultExpanded}>
        <p>场景请求失败，画面上没有资产。{status.error}</p>
      </LegendFrame>
    ) : (
      <LegendFrame title="等待资产" defaultExpanded={defaultExpanded}>
        <p>等待资产元数据。</p>
      </LegendFrame>
    )
  }

  // BEFORE the streamlines chain, and therefore before the trailing branch it
  // falls through to: that branch is the isosurface/point-cloud legend, and a
  // slice reaching it is shown a phase wheel over whatever field the plane
  // actually carries -- a density labelled as an angle.
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
            ? // The surface is shaded by its own neutral headlight
              // (OrbitalSurface): hue is the key, lightness is not.
              '几何是 |ψ|² level set；色相承载 phase，明暗只表示曲面朝向（光照），不表示数值。'
            : '等待资产元数据。'}
      </p>
    </LegendFrame>
  )
}
