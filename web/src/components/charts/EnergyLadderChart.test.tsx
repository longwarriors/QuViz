import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { EnergyLadderChart, labelledLevels } from './EnergyLadderChart'

/** E_n = −1/(2n²) Ha for hydrogen, n = 1..6. */
const LEVELS = [1, 2, 3, 4, 5, 6].map((n) => -0.5 / (n * n))

const render = (levels: readonly number[], highlight: readonly number[]): string =>
  renderToStaticMarkup(createElement(EnergyLadderChart, { levels, highlight }))

describe('labelledLevels', () => {
  it('always labels the highlighted levels, then any level with room, bottom first', () => {
    const chosen = labelledLevels(
      [
        { n: 1, energy: -0.5, y: 186 },
        { n: 2, energy: -0.125, y: 60 },
        { n: 3, energy: -0.056, y: 36.7 },
        { n: 4, energy: -0.031, y: 28.5 },
      ],
      [4],
      [18],
    )
    expect([...chosen].sort()).toEqual([1, 2, 4])
  })
})

describe('EnergyLadderChart', () => {
  it('draws every level, marks the current one, and labels only what fits', () => {
    const markup = render(LEVELS, [2])
    expect(markup.match(/class="qv-level"/g)).toHaveLength(6)
    expect(markup).toContain('data-level="2"')
    expect(markup.match(/data-current="true"/g)).toHaveLength(1)
    for (const label of ['n=1', 'n=2', 'n=3']) expect(markup).toContain(`>${label}<`)
    expect(markup).not.toContain('>n=4<')
    expect(markup).toContain('-0.1250 Ha')
    expect(markup).toContain('E = 0 电离')
    expect(markup).toContain('当前态（n = 2）')
  })

  it('drops non-finite levels and says so when none are left', () => {
    const partial = render([Number.NaN, -0.125], [])
    expect(partial.match(/class="qv-level"/g)).toHaveLength(1)
    expect(partial).not.toContain('NaN')
    expect(render([Number.NaN], [1])).toContain('能级数据缺失。')
  })
})
