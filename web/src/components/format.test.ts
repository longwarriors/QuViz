import { describe, expect, it } from 'vitest'

import { formatFinite, formatFiniteUnit, PLACEHOLDER } from './format'

describe('formatFinite', () => {
  it('shows the absence of a number as an em dash, never NaN or Infinity', () => {
    for (const value of [undefined, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      expect(formatFinite(value, { kind: 'fixed', digits: 2 })).toBe(PLACEHOLDER)
    }
    expect(PLACEHOLDER).toBe('—')
  })

  it('formats each style the panel uses', () => {
    expect(formatFinite(-0.125, { kind: 'fixed', digits: 6 })).toBe('-0.125000')
    expect(formatFinite(0.002, { kind: 'exponential', digits: 3 })).toBe('2.000e-3')
    expect(formatFinite(900, { kind: 'count' })).toBe('900')
  })

  it('switches a magnitude to scientific notation outside [1e-3, 1e3), keeping exact zero', () => {
    expect(formatFinite(0.7071, { kind: 'magnitude', digits: 3 })).toBe('0.707')
    expect(formatFinite(1e-12, { kind: 'magnitude', digits: 3 })).toBe('1.00e-12')
    expect(formatFinite(12345, { kind: 'magnitude', digits: 3 })).toBe('1.23e+4')
    expect(formatFinite(0, { kind: 'magnitude', digits: 3 })).toBe('0.000')
  })
})

describe('formatFiniteUnit', () => {
  it('drops the unit when there is no number to carry it', () => {
    expect(formatFiniteUnit(Number.NaN, { kind: 'fixed', digits: 6 }, 'Ha')).toBe('—')
    expect(formatFiniteUnit(-0.125, { kind: 'fixed', digits: 6 }, 'Ha')).toBe('-0.125000 Ha')
    expect(formatFiniteUnit(98.5, { kind: 'fixed', digits: 1 }, '%', '')).toBe('98.5%')
  })
})
