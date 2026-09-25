import { describe, expect, it } from 'vitest'

import { formatTick, linearScale, linePath, nearestSortedIndex, niceStep, niceTicks } from './axes'

describe('linearScale', () => {
  it('maps a domain onto a (possibly inverted) range', () => {
    const y = linearScale([0, 10], [180, 20])
    expect(y(0)).toBe(180)
    expect(y(10)).toBe(20)
    expect(y(5)).toBe(100)
  })

  it('puts everything at the middle of the range for an empty domain', () => {
    expect(linearScale([3, 3], [0, 100])(3)).toBe(50)
  })
})

describe('niceStep / niceTicks', () => {
  it('picks 1, 2, 2.5, 5 or 10 times a power of ten', () => {
    expect(niceStep(17.8, 5)).toBe(5)
    expect(niceStep(0.0019, 4)).toBeCloseTo(5e-4, 12)
    expect(niceStep(9, 9)).toBe(1)
    expect(niceStep(4, 2)).toBe(2)
    expect(niceStep(10, 4)).toBe(2.5)
    expect(niceStep(61, 6)).toBe(20)
    expect(niceStep(0, 5)).toBe(1)
    expect(niceStep(Number.NaN, 5)).toBe(1)
  })

  it('lists round ticks inside the domain, without float dust', () => {
    expect(niceTicks(0, 20, 5)).toEqual([0, 5, 10, 15, 20])
    expect(niceTicks(0, 0.2109, 4)).toEqual([0, 0.1, 0.2])
    expect(niceTicks(-0.5, 0, 5)).toEqual([-0.5, -0.4, -0.3, -0.2, -0.1, 0])
  })

  it('has no ticks for an empty or non-finite domain', () => {
    expect(niceTicks(5, 5)).toEqual([])
    expect(niceTicks(0, Number.NaN)).toEqual([])
  })
})

describe('formatTick / linePath / nearestSortedIndex', () => {
  it('prints short numbers and a dash for nothing', () => {
    expect(formatTick(0.30000000000000004)).toBe('0.3')
    expect(formatTick(-0)).toBe('0')
    expect(formatTick(Number.NaN)).toBe('—')
  })

  it('builds an SVG path with two decimals', () => {
    expect(linePath([[0, 1], [2.345, 3.456]])).toBe('M0.00,1.00L2.35,3.46')
    expect(linePath([])).toBe('')
  })

  it('finds the nearest sample in a sorted list', () => {
    expect(nearestSortedIndex([], 1)).toBe(-1)
    expect(nearestSortedIndex([0, 1, 2], Number.NaN)).toBe(-1)
    expect(nearestSortedIndex([0, 1, 2], 1.4)).toBe(1)
    expect(nearestSortedIndex([0, 1, 2], 1.6)).toBe(2)
    expect(nearestSortedIndex([0, 1, 2], -5)).toBe(0)
    expect(nearestSortedIndex([0, 1, 2], 9)).toBe(2)
    expect(nearestSortedIndex([4], 0)).toBe(0)
  })
})
