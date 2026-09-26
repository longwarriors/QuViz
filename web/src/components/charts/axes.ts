/** Plain SVG chart arithmetic. No chart library (spec D10). */
export type Scale = (value: number) => number

export function linearScale(
  domain: readonly [number, number],
  range: readonly [number, number],
): Scale {
  const [d0, d1] = domain
  const [r0, r1] = range
  const span = d1 - d0
  return (value) => (span === 0 ? (r0 + r1) / 2 : r0 + ((value - d0) / span) * (r1 - r0))
}

/** A 1 / 2 / 2.5 / 5 / 10 × 10^k step giving about `count` intervals over `span`. */
export function niceStep(span: number, count: number): number {
  if (!(span > 0) || !Number.isFinite(span)) return 1
  const raw = span / Math.max(1, count)
  const power = 10 ** Math.floor(Math.log10(raw))
  const fraction = raw / power
  const nice =
    fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 2.5 ? 2.5 : fraction <= 5 ? 5 : 10
  return nice * power
}

/** Round ticks from `min` to `max` inclusive; none for an empty or non-finite domain. */
export function niceTicks(min: number, max: number, count = 5): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) return []
  const step = niceStep(max - min, count)
  const ticks: number[] = []
  for (let index = Math.ceil(min / step - 1e-9); index * step <= max + step * 1e-9; index += 1) {
    ticks.push(Number((index * step).toPrecision(12)))
  }
  return ticks
}

export function formatTick(value: number): string {
  return Number.isFinite(value) ? String(Number(value.toPrecision(6))) : '—'
}

export function linePath(points: readonly (readonly [number, number])[]): string {
  return points
    .map(([x, y], index) => `${index === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`)
    .join('')
}

/** Index of the sample nearest `target` in an ascending list; -1 when there is none. */
export function nearestSortedIndex(sorted: readonly number[], target: number): number {
  if (sorted.length === 0 || !Number.isFinite(target)) return -1
  let low = 0
  let high = sorted.length - 1
  while (high - low > 1) {
    const middle = (low + high) >> 1
    if (sorted[middle] <= target) low = middle
    else high = middle
  }
  return Math.abs(sorted[high] - target) < Math.abs(sorted[low] - target) ? high : low
}
