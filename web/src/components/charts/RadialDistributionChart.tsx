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
