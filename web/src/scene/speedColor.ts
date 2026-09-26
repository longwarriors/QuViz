import { Color } from 'three'

/**
 * The probability-flow speed ramp: one definition for the renderer and the
 * legend.
 *
 * Colour = lerp(SLOW, FAST, t) in three's LINEAR working space with
 * t = √(|j|/ρ ÷ max). The line material is unlit, un-tone-mapped and unfogged,
 * so the canvas shows exactly `speedRampHex(t)`; the legend's CSS stops are
 * those hexes at SPEED_LEGEND_STOPS and speedColor.test.ts reads them back.
 */
export const SPEED_SLOW_HEX = '#2b6cff'
export const SPEED_FAST_HEX = '#ff4d6d'

/**
 * Nine evenly spaced stops along t. CSS interpolates between stops in sRGB,
 * the renderer in linear light; nine stops keep that disagreement under 8/255
 * per channel (measured 7.76), three stops were 27.7/255.
 */
export const SPEED_LEGEND_STOPS: readonly number[] = [
  0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875, 1,
]

const SLOW = new Color(SPEED_SLOW_HEX)
const FAST = new Color(SPEED_FAST_HEX)

const clampUnit = (value: number): number =>
  Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0

/** t = √(clamp(speed / max, 0, 1)); a non-positive or non-finite max is a unit scale. */
export function speedRampCoordinate(speed: number | undefined, maxSpeed: number): number {
  const scale = maxSpeed > 0 ? maxSpeed : 1
  return Math.sqrt(clampUnit((speed ?? 0) / scale))
}

/** The vertex colour at t, in three's linear working space. */
export function speedRampLinearRgb(t: number): [number, number, number] {
  const color = SLOW.clone().lerp(FAST, clampUnit(t))
  return [color.r, color.g, color.b]
}

/** The on-screen sRGB colour at t for an unlit, un-tone-mapped, unfogged line. */
export function speedRampHex(t: number): string {
  return `#${SLOW.clone().lerp(FAST, clampUnit(t)).getHexString()}`
}
