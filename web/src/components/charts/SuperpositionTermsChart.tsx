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
