import { useId } from 'react'

import { formatFiniteUnit } from '../format'
import { linearScale } from './axes'

const WIDTH = 320
const HEIGHT = 200
const MARGIN = { top: 18, right: 98, bottom: 14, left: 44 } as const
const FIXED4 = { kind: 'fixed', digits: 4 } as const

export interface LevelMark {
  n: number
  energy: number
  y: number
}

/**
 * Which levels get text labels. Highlighted ones always do; every other level
 * does only if it sits at least `minGap` px from every label already placed
 * (and from the reserved y's), lowest n first -- hydrogenic levels crowd
 * towards E = 0, and overlapping labels are worse than missing ones.
 */
export function labelledLevels(
  levels: readonly LevelMark[],
  highlight: readonly number[],
  reservedYs: readonly number[] = [],
  minGap = 12,
): Set<number> {
  const taken = [...reservedYs]
  const chosen = new Set<number>()
  const place = (level: LevelMark): void => {
    chosen.add(level.n)
    taken.push(level.y)
  }
  for (const level of levels) if (highlight.includes(level.n)) place(level)
  for (const level of levels) {
    if (chosen.has(level.n)) continue
    if (taken.every((y) => Math.abs(y - level.y) >= minGap)) place(level)
  }
  return chosen
}

/** E_n for n = 1..K as reported by the server (Part A); the current state's level(s) in the accent. */
export function EnergyLadderChart({
  levels,
  highlight,
}: {
  levels: readonly number[]
  highlight: readonly number[]
}) {
  const titleId = useId()
  const descId = useId()
  const finite = levels
    .map((energy, index) => ({ n: index + 1, energy }))
    .filter((level) => Number.isFinite(level.energy))
  if (finite.length === 0) {
    return (
      <figure className="qv-chart" data-chart="levels">
        <figcaption className="qv-chart-title">能级 Eₙ</figcaption>
        <p className="qv-chart-empty">能级数据缺失。</p>
      </figure>
    )
  }

  const lowest = Math.min(0, ...finite.map((level) => level.energy))
  const y = linearScale([lowest, 0], [HEIGHT - MARGIN.bottom, MARGIN.top])
  const marks: LevelMark[] = finite.map((level) => ({ ...level, y: y(level.energy) }))
  const zeroY = y(0)
  const labelled = labelledLevels(marks, highlight, [zeroY])
  const current = marks.filter((mark) => highlight.includes(mark.n)).map((mark) => mark.n)
  const description =
    `氢样能级 Eₙ（${marks.length} 个），最低能级 = ${formatFiniteUnit(lowest, FIXED4, 'Ha')}；` +
    `强调色为当前态${current.length === 0 ? '' : `（n = ${current.join('、')}）`}；E = 0 为电离极限。`

  return (
    <figure className="qv-chart" data-chart="levels">
      <figcaption className="qv-chart-title">能级 Eₙ</figcaption>
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-labelledby={`${titleId} ${descId}`}>
        <title id={titleId}>氢样能级 Eₙ</title>
        <desc id={descId}>{description}</desc>
        <line className="qv-level-ionization" x1={MARGIN.left} x2={WIDTH - MARGIN.right} y1={zeroY} y2={zeroY} />
        <text className="qv-chart-label" x={WIDTH - MARGIN.right + 6} y={zeroY + 3}>
          E = 0 电离
        </text>
        {marks.map((mark) => {
          const isCurrent = highlight.includes(mark.n)
          return (
            <g key={mark.n} data-level={mark.n}>
              <line
                className="qv-level"
                data-current={isCurrent ? 'true' : 'false'}
                x1={MARGIN.left}
                x2={WIDTH - MARGIN.right}
                y1={mark.y}
                y2={mark.y}
              />
              {labelled.has(mark.n) ? (
                <>
                  <text className="qv-chart-label" x={MARGIN.left - 6} y={mark.y + 3} textAnchor="end">
                    {`n=${mark.n}`}
                  </text>
                  <text className="qv-chart-label" x={WIDTH - MARGIN.right + 6} y={mark.y + 3}>
                    {formatFiniteUnit(mark.energy, FIXED4, 'Ha')}
                  </text>
                </>
              ) : null}
            </g>
          )
        })}
      </svg>
    </figure>
  )
}
