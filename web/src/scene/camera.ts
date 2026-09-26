import { PLANE_FRAMES } from '../api/sliceContract'
import type { BasisKind, PrincipalPlane } from '../api/types'

/**
 * Where to put the camera when a new scene arrives.
 *
 * A real p or d orbital has its lobes on the axes, so there is a direction from
 * which the shape reads as itself and a direction from which two lobes overlap
 * into a blob. Which one depends on m, and only in the real basis: a complex
 * orbital is a ring of constant magnitude about z, and no azimuthal viewpoint
 * is more honest than another, so it keeps the neutral three-quarter view.
 *
 * A plain tuple rather than a three.js Vector3: this is arithmetic, it belongs
 * in the test suite, and importing three here would drag a WebGL harness in
 * with it. The caller normalises and scales it to its own orbit distance;
 * `WORLD_UP` is the up vector for every non-slice view.
 */
export type CameraDirection = readonly [number, number, number]

export interface CameraViewState {
  basis: BasisKind
  l: number
  m: number
}

/**
 * Which way is up: +z, the textbook convention (spec D8). 2p_z's two lobes are
 * stacked vertically on screen, as every chemistry text draws them; a y-up
 * camera laid them on their side.
 */
export const WORLD_UP: CameraDirection = [0, 0, 1]

/**
 * The neutral three-quarter view: azimuth 45° between +x and +y, about 23°
 * above the xy plane. With z up, +x points to the viewer's lower left and +y
 * to the right -- the standard right-handed drawing.
 */
export const DEFAULT_CAMERA_DIRECTION: CameraDirection = [1, 1, 0.6]

/** From the front (−y): screen right ≈ +x, screen up = +z. p_x, p_z, d_z², d_xz. */
const FROM_FRONT: CameraDirection = [0.2, -1, 0.3]
/** From the side (+x): screen right ≈ +y, screen up = +z. p_y, d_yz. */
const FROM_SIDE: CameraDirection = [1, 0.2, 0.3]
/**
 * From above (+z), tilted toward −y so the up vector is never parallel to the
 * line of sight: screen right = +x, screen up ≈ +y. d_xy, d_x²−y².
 */
const FROM_ABOVE: CameraDirection = [0, -0.35, 1]

/**
 * The canonical view direction for a state, as a fresh tuple.
 *
 * Fresh on purpose: the canvas normalises the vector it is handed, in place,
 * so a shared array would be scaled to unit length by the first scene and stay
 * that way for every later one.
 */
export function cameraDirectionFor(state: CameraViewState | undefined): [number, number, number] {
  return [...direction(state)]
}

function direction(state: CameraViewState | undefined): CameraDirection {
  if (state?.basis !== 'real') {
    return DEFAULT_CAMERA_DIRECTION
  }
  if (state.l === 1) {
    // Real basis (hydrogenic.py): m = +1 is p_x, m = −1 is p_y, m = 0 is p_z.
    // The front view shows x across and z up; p_y needs the side view.
    return state.m === -1 ? FROM_SIDE : FROM_FRONT
  }
  if (state.l === 2) {
    // |m| = 2 are d_x²−y² and d_xy, both in the xy plane: look from above.
    if (state.m === 2 || state.m === -2) return FROM_ABOVE
    // m = −1 is d_yz (the yz plane, seen from +x); d_z² and d_xz read from the front.
    return state.m === -1 ? FROM_SIDE : FROM_FRONT
  }
  return DEFAULT_CAMERA_DIRECTION
}

/**
 * Where to stand to look at a principal plane face-on, and which way is up
 * when you do.
 *
 * A slice is a picture of the (u, v) grid the server sampled, so the only
 * honest way to show it is the one where screen +X is u and screen +Y is v:
 * any other viewpoint hands the reader a rotated or mirrored copy of a payload
 * whose whole point is that its handedness is pinned down. Placing the camera
 * along the frame's OWN normal with the frame's v axis as `up` gets that for
 * free -- three's lookAt builds x = up x z and y = z x x, and the frozen frames
 * are orthonormal and right-handed, so x lands on u and y on v -- and it needs
 * no per-plane special case, only the table.
 *
 * The `xz` plane is where a shortcut shows: its normal is -y, because
 * x_hat x z_hat = -y_hat. Reaching for +y instead mirrors the picture, and the
 * usual reflex of "up is +y" is worse still -- there it is parallel to the view
 * direction, where lookAt has no basis to build at all.
 *
 * Both return plain tuples and import nothing from three, for the reason
 * `cameraDirectionFor` does: this is arithmetic over a frozen table, it belongs
 * in the test suite, and the caller scales and normalises what it is handed.
 */
export function cameraDirectionForPlane(plane: PrincipalPlane): [number, number, number] {
  // Copied, not aliased: PLANE_FRAMES is the contract's frozen table, and the
  // canvas normalises the vector it is given in place.
  return [...PLANE_FRAMES[plane].normal]
}

/** The frame's v axis: what screen +Y must be for the slice to read as sampled. */
export function cameraUpForPlane(plane: PrincipalPlane): [number, number, number] {
  return [...PLANE_FRAMES[plane].v_axis]
}
