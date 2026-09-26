import { describe, expect, it } from 'vitest'

import { nextRovingIndex } from './rovingTabs'

describe('nextRovingIndex', () => {
  it('wraps the horizontal arrows and jumps with Home / End', () => {
    const count = 4
    expect(nextRovingIndex('ArrowRight', 0, count)).toBe(1)
    expect(nextRovingIndex('ArrowRight', 3, count)).toBe(0)
    expect(nextRovingIndex('ArrowLeft', 2, count)).toBe(1)
    expect(nextRovingIndex('ArrowLeft', 0, count)).toBe(3)
    expect(nextRovingIndex('Home', 2, count)).toBe(0)
    expect(nextRovingIndex('End', 1, count)).toBe(3)
    // A single tab is its own neighbour on both sides.
    expect(nextRovingIndex('ArrowRight', 0, 1)).toBe(0)
    expect(nextRovingIndex('ArrowLeft', 0, 1)).toBe(0)
  })

  it('leaves every other key, and an empty tablist, to the caller', () => {
    // Vertical arrows are not part of a horizontal tablist's model; Tab, Enter
    // and Space must keep their native behaviour (the caller only calls
    // preventDefault when an index comes back).
    for (const key of ['ArrowUp', 'ArrowDown', 'Tab', 'Enter', ' ', 'Escape', 'a']) {
      expect(nextRovingIndex(key, 1, 3), key).toBeUndefined()
    }
    // No tabs: never a NaN index from `% 0`.
    for (const key of ['ArrowRight', 'ArrowLeft', 'Home', 'End']) {
      expect(nextRovingIndex(key, 0, 0), key).toBeUndefined()
    }
  })
})
