import { readFileSync } from 'node:fs'

import { Color, SRGBColorSpace } from 'three'
import { describe, expect, it } from 'vitest'

import {
  SPEED_FAST_HEX,
  SPEED_LEGEND_STOPS,
  SPEED_SLOW_HEX,
  speedRampCoordinate,
  speedRampHex,
  speedRampLinearRgb,
} from './speedColor'

/** The `.speed-ramp` stops the app ships, as (hex, position) pairs. */
function speedRampStops(): { hex: string; position: number }[] {
  const css = readFileSync(new URL('../styles.css', import.meta.url), 'utf-8')
  const rule = /\.speed-ramp\s*\{[^}]*?linear-gradient\(([^)]*)\)/.exec(css)
  if (rule === null) throw new Error('styles.css has no .speed-ramp gradient')
  return [...rule[1].matchAll(/(#[0-9a-f]{6})\s+(\d+(?:\.\d+)?)%/gi)].map((match) => ({
    hex: match[1].toLowerCase(),
    position: Number(match[2]) / 100,
  }))
}

const bytesOf = (hex: string): number[] =>
  [1, 3, 5].map((offset) => parseInt(hex.slice(offset, offset + 2), 16))

/** What the canvas shows for ramp coordinate t, as unrounded sRGB 0..255. */
function renderedSrgb(t: number): number[] {
  const target = { r: 0, g: 0, b: 0 }
  new Color().setRGB(...speedRampLinearRgb(t)).getRGB(target, SRGBColorSpace)
  return [target.r * 255, target.g * 255, target.b * 255]
}

describe('speedRampCoordinate', () => {
  it('puts a quarter of the maximum speed at the middle of the ramp', () => {
    expect(speedRampCoordinate(1, 4)).toBe(0.5)
    expect(speedRampCoordinate(4, 4)).toBe(1)
  })

  it('clamps out-of-range and missing speeds instead of inventing colours', () => {
    expect(speedRampCoordinate(5, 4)).toBe(1)
    expect(speedRampCoordinate(-1, 4)).toBe(0)
    expect(speedRampCoordinate(undefined, 4)).toBe(0)
    expect(speedRampCoordinate(Number.NaN, 4)).toBe(0)
  })

  it('treats a field at rest (max 0) as a unit scale, never dividing by zero', () => {
    expect(speedRampCoordinate(0.25, 0)).toBe(0.5)
    expect(speedRampCoordinate(2, Number.NaN)).toBe(1)
  })
})

describe('the speed legend is the renderer', () => {
  it('starts and ends at the two named colours, and clamps t', () => {
    expect(speedRampHex(0)).toBe(SPEED_SLOW_HEX)
    expect(speedRampHex(1)).toBe(SPEED_FAST_HEX)
    expect(speedRampHex(-3)).toBe(SPEED_SLOW_HEX)
    expect(speedRampHex(Number.NaN)).toBe(SPEED_SLOW_HEX)
  })

  it('names the midpoint by the linear-light blend, not by an sRGB average', () => {
    // Measured with three 0.185. The retired legend printed a hand-picked
    // #7a5bd6 at 50%; the renderer draws #be5ec8 there.
    expect(speedRampHex(0.5)).toBe('#be5ec8')
    expect(speedRampHex(0.5)).not.toBe('#7a5bd6')
  })

  it('is the byte-exact source of every shipped .speed-ramp stop', () => {
    const stops = speedRampStops()
    expect(stops.map((stop) => stop.position)).toEqual([...SPEED_LEGEND_STOPS])
    for (const stop of stops) {
      expect(stop.hex, `stop at ${stop.position}`).toBe(speedRampHex(stop.position))
    }
  })

  it('keeps the CSS interpolation between stops within 8/255 of the renderer', () => {
    const stops = speedRampStops()
    let worst = 0
    for (let sample = 0; sample <= 400; sample += 1) {
      const t = sample / 400
      const right = Math.max(1, stops.findIndex((stop) => stop.position >= t))
      const [low, high] = [stops[right - 1], stops[right]]
      const fraction = (t - low.position) / (high.position - low.position)
      const lowBytes = bytesOf(low.hex)
      const highBytes = bytesOf(high.hex)
      const css = lowBytes.map((value, channel) => value + (highBytes[channel] - value) * fraction)
      const truth = renderedSrgb(t)
      worst = Math.max(worst, ...css.map((value, channel) => Math.abs(value - truth[channel])))
    }
    // 7.76 measured for nine evenly spaced stops; the old three stops were 27.7.
    expect(worst).toBeLessThanOrEqual(8)
  })
})
