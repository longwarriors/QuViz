import { Grid } from '@react-three/drei'

interface AtmosphereProps {
  showGrid: boolean
  extent?: number
}

/** Neutral greys: the grid is a depth cue, not a colour anyone should read. */
export const GRID_CELL_COLOR = '#2a2c30'
export const GRID_SECTION_COLOR = '#3c3f45'

/** How far below the nucleus the floor lies, in scene extents: just under the object. */
const GRID_DROP_EXTENTS = 1.05

/** How far from the nucleus the grid fades to nothing, in scene extents. */
const GRID_FADE_EXTENTS = 4

/**
 * Lights and the ground grid -- and nothing decorative.
 *
 * Every data material (points, isosurface, slice, streamlines) is unlit, so
 * the lights change no data pixel; they stay neutral for anything lit later.
 * The grid lies in the world xy plane (z is up, spec D8) just below the
 * object, scaled to what is on screen.
 *
 * The grid fades with distance from the NUCLEUS (`fadeFrom` 0: drei measures
 * from `worldCamProjPosition * fadeFrom`, and its default of 1 is the camera's
 * foot on the plane). Measured from the camera's foot, the fade has to reach
 * past the fitted camera distance -- about 3.8 extents -- before any floor in
 * view is drawn; at an absolute 24 bohr it never was, and the 地面网格 switch
 * changed no pixel. From the nucleus, the floor under the object is drawn from
 * every viewpoint and stays with the object, not with the viewer. The plane is
 * exactly as wide as the disc the fade leaves on it (no infinite mode, which
 * would stretch it by 1 + fadeDistance in the vertex shader), so it never ends
 * in a hard edge.
 *
 * Slices get the same floor: below and beside a face-on xz or yz section, and
 * under an xy one, where it shows -- faintly, and only in neutral grey --
 * through the samples a phase mask leaves transparent.
 */
export function Atmosphere({ showGrid, extent = 8 }: AtmosphereProps) {
  const gridExtent = Math.max(extent, 4)
  const drop = GRID_DROP_EXTENTS * gridExtent
  const fadeDistance = GRID_FADE_EXTENTS * gridExtent
  // Where the fade sphere around the nucleus meets the floor.
  const gridSize = 2 * Math.sqrt(fadeDistance ** 2 - drop ** 2)
  return (
    <>
      <ambientLight intensity={0.6} />
      <directionalLight position={[7, -9, 12]} intensity={1.2} color="#ffffff" />
      {showGrid ? (
        <Grid
          position={[0, 0, -drop]}
          rotation={[Math.PI / 2, 0, 0]}
          args={[gridSize, gridSize]}
          cellSize={1}
          cellThickness={0.45}
          cellColor={GRID_CELL_COLOR}
          sectionSize={5}
          sectionThickness={0.7}
          sectionColor={GRID_SECTION_COLOR}
          fadeDistance={fadeDistance}
          fadeFrom={0}
          fadeStrength={1.6}
        />
      ) : null}
    </>
  )
}
