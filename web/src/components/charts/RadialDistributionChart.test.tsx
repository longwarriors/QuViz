/** @vitest-environment jsdom */
import { act, createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { mount } from '../../test/mount'
import { RadialDistributionChart, radialSeries, type RadialProfileView } from './RadialDistributionChart'

/** r = 0 .. 20 bohr in 0.5 steps; P(r) = r² e^{−r}, which peaks at r = 2. */
const R = Array.from({ length: 41 }, (_, index) => index * 0.5)
const PROFILE: RadialProfileView = {
  r_bohr: R,
  radial_density: R.map((r) => r * r * Math.exp(-r)),
  nodes_bohr: [0.8],
  expectation_r_bohr: 3,
  most_probable_r_bohr: 2,
}

const render = (profile: RadialProfileView): string =>
  renderToStaticMarkup(createElement(RadialDistributionChart, { profile, label: '2s' }))

describe('radialSeries', () => {
  it('keeps only finite (r, P) pairs and reports their extremes', () => {
    const series = radialSeries({
      ...PROFILE,
      r_bohr: [0, 1, Number.NaN, 3],
      radial_density: [0, 0.4, 0.2, Number.POSITIVE_INFINITY],
    })
    expect(series.r).toEqual([0, 1])
    expect(series.p).toEqual([0, 0.4])
    expect(series.rMax).toBe(1)
    expect(series.pMax).toBe(0.4)
    expect(radialSeries({ ...PROFILE, r_bohr: [], radial_density: [] })).toMatchObject({ rMax: 0, pMax: 0 })
  })
})

describe('RadialDistributionChart', () => {
  it('names the state and says every marked number in its accessible description', () => {
    const markup = render(PROFILE)
    expect(markup).toContain('2s 的径向分布 P(r)')
    expect(markup).toContain('⟨r⟩ = 3.00 bohr')
    expect(markup).toContain('最可几半径 = 2.00 bohr')
    expect(markup).toContain('径向节点 1 个：0.800 bohr')
    expect(markup).toContain('data-chart="radial"')
    expect(markup).toContain('role="img"')
  })

  it('draws the curve, the node rule, the ⟨r⟩ rule, the peak marker and round ticks', () => {
    const markup = render(PROFILE)
    expect(markup.match(/data-series="radial"/g)).toHaveLength(1)
    expect(markup).toContain('data-node="0.8"')
    expect(markup).toContain('data-marker="expectation"')
    expect(markup).toContain('data-marker="peak"')
    for (const tick of ['>0<', '>5<', '>10<', '>15<', '>20<']) expect(markup).toContain(tick)
    expect(markup).toContain('r / bohr')
  })

  it('tabulates the markers and says 无 when there is no node', () => {
    const markup = render({ ...PROFILE, nodes_bohr: [] })
    expect(markup).toContain('<summary>数据表</summary>')
    expect(markup).toContain('<th scope="row">径向节点</th><td>无</td>')
    expect(markup).toContain('<th scope="row">P(r) 峰值</th><td>5.413e-1 bohr⁻¹</td>')
  })

  it('shows a dash, never NaN, and omits markers it cannot place', () => {
    const markup = render({
      ...PROFILE,
      expectation_r_bohr: Number.NaN,
      most_probable_r_bohr: Number.POSITIVE_INFINITY,
      nodes_bohr: [Number.NaN, 50],
    })
    expect(markup).toContain('⟨r⟩ = —')
    expect(markup).not.toContain('data-marker="expectation"')
    expect(markup).not.toContain('data-marker="peak"')
    expect(markup).not.toContain('data-node')
    expect(markup).not.toContain('NaN')
    expect(markup).not.toContain('Infinity')
  })

  it('refuses to draw a profile with fewer than two finite samples', () => {
    const markup = render({ ...PROFILE, r_bohr: [0], radial_density: [0] })
    expect(markup).toContain('径向分布数据不完整，无法绘制。')
    expect(markup).not.toContain('<svg')
  })

  it('reads out the sample under the pointer and forgets it on leave', async () => {
    const tree = await mount(createElement(RadialDistributionChart, { profile: PROFILE, label: '2s' }))
    try {
      const hit = tree.container.querySelector<SVGRectElement>('.qv-chart-hit')
      if (hit === null) throw new Error('no hover target')
      hit.getBoundingClientRect = () =>
        ({ left: 0, top: 0, width: 264, height: 138, right: 264, bottom: 138, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect
      const scope = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
      scope.IS_REACT_ACT_ENVIRONMENT = true
      try {
        // 10 % of the plot width = r of 2 bohr.
        await act(async () => {
          hit.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: 26.4 }))
        })
        expect(tree.container.querySelector('.qv-chart-readout')?.textContent).toBe(
          'r = 2.00 bohr · P = 5.413e-1',
        )
        await act(async () => {
          hit.dispatchEvent(new PointerEvent('pointerout', { bubbles: true, relatedTarget: document.body }))
        })
        expect(tree.container.querySelector('[data-hover]')).toBeNull()
      } finally {
        delete scope.IS_REACT_ACT_ENVIRONMENT
      }
    } finally {
      await tree.unmount()
    }
  })
})
