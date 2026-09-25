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

/** About how many sections one scene extent spans (rounded to a 1-2-5 length). */
const GRID_SECTIONS_PER_EXTENT = 4

/** Cells per section. */
const GRID_CELLS_PER_SECTION = 5

/** The floor's geometry, every length in bohr. */
export interface GroundGrid {
  /** How far below the nucleus the plane lies. */
  drop: number
  /** Distance from the nucleus at which the grid has faded to nothing. */
  fadeDistance: number
  /** Side of the square plane: exactly the disc the fade leaves on it. */
  size: number
  cellSize: number
  sectionSize: number
}

/** The 1, 2 or 5 times a power of ten nearest `length` on a log scale. */
function roundLength(length: number): number {
  const decade = 10 ** Math.floor(Math.log10(length))
  const candidates = [1, 2, 5, 10].map((mantissa) => mantissa * decade)
  return candidates.reduce((best, candidate) =>
    Math.abs(Math.log(candidate / length)) < Math.abs(Math.log(best / length)) ? candidate : best,
  )
}

/**
 * The ground grid for a scene extent: every length scales with the scene, so a
 * large state gets the same floor as a small one rather than a fixed 1-bohr
 * mesh that closes up into a grey sheet (n = 8's cells were about a pixel
 * apart). Sections are a round 1-2-5 length near a quarter of the extent --
 * 5 bohr with 1-bohr cells for the n = 2 states, as before -- and extents under
 * 4 bohr count as 4, keeping the floor off the camera for a tiny scene.
 */
export function groundGrid(extent: number): GroundGrid {
  const scale = Math.max(extent, 4)
  const drop = GRID_DROP_EXTENTS * scale
  const fadeDistance = GRID_FADE_EXTENTS * scale
  const sectionSize = roundLength(scale / GRID_SECTIONS_PER_EXTENT)
  return {
    drop,
    fadeDistance,
    // Where the fade sphere around the nucleus meets the floor.
    size: 2 * Math.sqrt(fadeDistance ** 2 - drop ** 2),
    cellSize: sectionSize / GRID_CELLS_PER_SECTION,
    sectionSize,
  }
}

/**
 * Lights and the ground grid -- and nothing decorative.
 *
 * No data material takes these lights: points, slices and streamlines are
 * unlit, and the isosurface shades itself with its own neutral headlight
 * (`OrbitalSurface`, `lights: false`), so the lights change no data pixel; they
 * stay neutral for anything lit later.
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
 * through the samples a phase mask leaves transparent. It is never drawn over
 * a slice or any other data: drei's default BackSide draws only the plane's
 * upper face, so seen from above it lies under everything and from below it
 * is culled.
 *
 * Cells and sections scale with the scene too (`groundGrid`).
 */
export function Atmosphere({ showGrid, extent = 8 }: AtmosphereProps) {
  const grid = groundGrid(extent)
  return (
    <>
      <ambientLight intensity={0.6} />
      <directionalLight position={[7, -9, 12]} intensity={1.2} color="#ffffff" />
      {showGrid ? (
        <Grid
          position={[0, 0, -grid.drop]}
          rotation={[Math.PI / 2, 0, 0]}
          args={[grid.size, grid.size]}
          cellSize={grid.cellSize}
          cellThickness={0.45}
          cellColor={GRID_CELL_COLOR}
          sectionSize={grid.sectionSize}
          sectionThickness={0.7}
          sectionColor={GRID_SECTION_COLOR}
          fadeDistance={grid.fadeDistance}
          fadeFrom={0}
          fadeStrength={1.6}
        />
      ) : null}
    </>
  )
}
