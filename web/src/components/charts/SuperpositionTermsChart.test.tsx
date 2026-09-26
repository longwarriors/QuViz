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

  it('draws a dash for an energy it was not given instead of guessing it', () => {
    // Why the energies are missing is ChartsPanel's to say: the chart cannot
    // tell a reduced mass from a level list that is still loading.
    const markup = render(BOHR, null, 16.76)
    expect(markup).toContain('0.500 · —')
    expect(markup).not.toContain('ΔE =')
    expect(markup).not.toContain('a_μ')
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
