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

/**
 * A hydrogen profile as Part A publishes it: 256 radii on r = r_max s² (s
 * uniform), P(r) = r²|R_nl|², and the analytic <r> and most probable radius.
 * The r_max values are radial_profile()'s own (99.9 % of the mass).
 */
function hydrogenProfile(
  rMax: number,
  density: (r: number) => number,
  expectation: number,
  mostProbable: number,
  nodes: number[],
): RadialProfileView {
  const r = Array.from({ length: 256 }, (_, index) => rMax * (index / 255) ** 2)
  return {
    r_bohr: r,
    radial_density: r.map(density),
    nodes_bohr: nodes,
    expectation_r_bohr: expectation,
    most_probable_r_bohr: mostProbable,
  }
}

/** 2p: P = r⁴e^{−r}/24, <r> = 5 and r_mp = 4 bohr -- 17 px apart on this chart. */
const P2 = hydrogenProfile(15.533857, (r) => (r ** 4 * Math.exp(-r)) / 24, 5, 4, [])
/** 3s: P = (4/19683) r²(27 − 18r + 2r²)² e^{−2r/3}, <r> = 13.5 and r_mp = 13.074 bohr -- 4 px apart. */
const S3 = hydrogenProfile(
  32.21132,
  (r) => (4 / 19683) * r * r * (27 - 18 * r + 2 * r * r) ** 2 * Math.exp((-2 * r) / 3),
  13.5,
  13.0740328,
  [1.9019237886466842, 7.098076211353316],
)

/** 4s: <r> = 24 lies LEFT of r_mp = 24.618 bohr, the other way round from 2p and 3s. */
const S4 = hydrogenProfile(
  52.28826,
  (r) => r * r * (0.25 * (1 - 0.75 * r + (r * r) / 8 - r ** 3 / 192) * Math.exp(-r / 4)) ** 2,
  24,
  24.618092,
  [1.8716444550481757, 6.610814578664558, 15.517540966287267],
)

interface Box {
  left: number
  right: number
  top: number
  bottom: number
}

/**
 * The rendered size of a marker label, in viewBox units, measured with
 * getBBox() in the built lab (Chromium, the chart's 10 px label font): "r_mp"
 * is 23.5 wide and "⟨r⟩" 10.9, both 12.7 tall with the box top 9.5 above the
 * baseline. Rounded up here, and deliberately not read from the component, so
 * the component's own layout box has to cover what is actually drawn.
 */
const MEASURED_LABEL = { width: 24, ascent: 9.5, descent: 3.2 } as const

/**
 * The box a marker label occupies, from the attributes the chart emitted: its
 * anchor point and its `text-anchor` (absent means SVG's default, start).
 */
function labelBox(markup: string, marker: 'expectation' | 'peak'): Box {
  const document = new DOMParser().parseFromString(markup, 'text/html')
  const text = document.querySelector(`[data-marker="${marker}"] text`)
  if (text === null) throw new Error(`no ${marker} label`)
  const x = Number(text.getAttribute('x'))
  const y = Number(text.getAttribute('y'))
  const anchor = text.getAttribute('text-anchor') ?? 'start'
  expect(['start', 'end']).toContain(anchor)
  const left = anchor === 'end' ? x - MEASURED_LABEL.width : x
  return {
    left,
    right: left + MEASURED_LABEL.width,
    top: y - MEASURED_LABEL.ascent,
    bottom: y + MEASURED_LABEL.descent,
  }
}

const overlap = (a: Box, b: Box): boolean =>
  Math.min(a.right, b.right) > Math.max(a.left, b.left) && Math.min(a.bottom, b.bottom) > Math.max(a.top, b.top)

describe('RadialDistributionChart marker labels', () => {
  it.each([
    ['2p', P2],
    ['3s', S3],
    ['4s', S4],
  ])('never lets the <r> and r_mp labels of %s overlap', (_state, profile) => {
    const markup = render(profile)
    const expectation = labelBox(markup, 'expectation')
    const peak = labelBox(markup, 'peak')
    expect(overlap(expectation, peak), JSON.stringify({ expectation, peak })).toBe(false)
    // Both stay inside the plot's horizontal span, clear of the y-axis ticks.
    for (const box of [expectation, peak]) {
      expect(box.left).toBeGreaterThanOrEqual(44)
      expect(box.right).toBeLessThanOrEqual(320 - 12)
    }
  })

  it.each([
    ['3s, r_mp left of <r>', S3, 'peak'],
    ['4s, <r> left of r_mp', S4, 'expectation'],
  ] as const)('puts each label on the outer side of its own mark (%s)', (_case, profile, leftMarker) => {
    const markup = render(profile)
    const document = new DOMParser().parseFromString(markup, 'text/html')
    const ruleX = Number(document.querySelector('.qv-chart-expectation')?.getAttribute('x1'))
    const peakX = Number(document.querySelector('.qv-chart-marker')?.getAttribute('cx'))
    const expectation = labelBox(markup, 'expectation')
    const peak = labelBox(markup, 'peak')
    if (leftMarker === 'peak') {
      expect(peak.right).toBeLessThan(peakX)
      expect(expectation.left).toBeGreaterThan(ruleX)
    } else {
      expect(expectation.right).toBeLessThan(ruleX)
      expect(peak.left).toBeGreaterThan(peakX)
    }
  })

  it('leaves labels where they were when the two radii are far apart', () => {
    const markup = render({ ...PROFILE, expectation_r_bohr: 12, most_probable_r_bohr: 2 })
    const document = new DOMParser().parseFromString(markup, 'text/html')
    for (const marker of ['expectation', 'peak']) {
      expect(document.querySelector(`[data-marker="${marker}"] text`)?.getAttribute('text-anchor') ?? 'start').toBe(
        'start',
      )
    }
    expect(overlap(labelBox(markup, 'expectation'), labelBox(markup, 'peak'))).toBe(false)
  })

  it('puts a lone label beside its own mark when the other radius cannot be placed', () => {
    const noExpectation = new DOMParser().parseFromString(
      render({ ...P2, expectation_r_bohr: Number.NaN }),
      'text/html',
    )
    const peakText = noExpectation.querySelector('[data-marker="peak"] text')
    expect(Number(peakText?.getAttribute('x'))).toBeCloseTo(
      Number(noExpectation.querySelector('.qv-chart-marker')?.getAttribute('cx')) + 7,
      9,
    )
    const noPeak = new DOMParser().parseFromString(render({ ...P2, most_probable_r_bohr: -1 }), 'text/html')
    const ruleText = noPeak.querySelector('[data-marker="expectation"] text')
    expect(ruleText?.getAttribute('text-anchor')).toBe('start')
    expect(Number(ruleText?.getAttribute('x'))).toBeCloseTo(
      Number(noPeak.querySelector('.qv-chart-expectation')?.getAttribute('x1')) + 4,
      9,
    )
  })

  it('stacks the labels instead when the left one has no room before the axis', () => {
    // The same r²e^{−r} drawn out to 60 bohr: its peak (r_mp = 2) and <r> = 3
    // sit within 13 px of the y axis, so flipping r_mp's label to its left
    // would run it into the tick labels; <r> drops below r_mp instead.
    const wide = Array.from({ length: 121 }, (_, index) => index * 0.5)
    const markup = render({
      ...PROFILE,
      r_bohr: wide,
      radial_density: wide.map((r) => r * r * Math.exp(-r)),
      nodes_bohr: [],
    })
    const expectation = labelBox(markup, 'expectation')
    const peak = labelBox(markup, 'peak')
    expect(overlap(expectation, peak)).toBe(false)
    expect(expectation.top).toBeGreaterThanOrEqual(peak.bottom)
    expect(Math.min(expectation.left, peak.left)).toBeGreaterThanOrEqual(44)
  })
})
