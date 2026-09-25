/**
 * Depth fog for the scene, in scene units.
 *
 * Fog here is a depth cue, not an effect: it has to sit relative to the object
 * on screen, and the object's size changes by two orders of magnitude between a
 * 1s and a 6h orbital. So both distances are multiples of the scene extent
 * rather than fixed numbers, and the strength slider slides them inwards
 * together.
 */
export interface FogRange {
  /** Distance at which fog starts, in scene units. */
  near: number
  /** Distance at which fog is total. */
  far: number
}

/** Below this the fog would be tighter than the camera's own orbit distance. */
const MINIMUM_SCALE = 4
/** Stand-in extent before the first asset has arrived and measured the scene. */
const FALLBACK_EXTENT = 8

/**
 * The fog distances for a scene of this extent, or null for no fog at all.
 *
 * Null rather than a range pushed out to infinity: the caller clears
 * `scene.fog`, and "no fog" is a different statement from "fog you cannot
 * reach".
 */
export function fogRangeFor(extent: number | undefined, fogStrength: number): FogRange | null {
  if (fogStrength <= 0) {
    return null
  }
  const scale = Math.max(extent ?? FALLBACK_EXTENT, MINIMUM_SCALE)
  return {
    near: scale * (3.0 - 1.5 * fogStrength),
    far: scale * (8.0 - 4.0 * fogStrength),
  }
}

/**
 * The scene's own background, and the colour depth fog recedes into.
 *
 * Neutral and identical to the page's --qv-bg (styleContract.test.ts), so the
 * full-bleed canvas has no seam against the page, and the slice neutral
 * #383838 keeps its "readable surface, quieter than the poles" contrast
 * (1.635:1, sliceColor.test.ts).
 */
export const SCENE_BACKGROUND = '#0e0f11'
