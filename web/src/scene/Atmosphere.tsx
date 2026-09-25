import { Grid } from '@react-three/drei'

interface AtmosphereProps {
  showGrid: boolean
  extent?: number
}

/** Neutral greys: the grid is a depth cue, not a colour anyone should read. */
export const GRID_CELL_COLOR = '#2a2c30'
export const GRID_SECTION_COLOR = '#3c3f45'

/**
 * Lights and the ground grid -- and nothing decorative.
 *
 * Every data material (points, isosurface, slice, streamlines) is unlit, so
 * the lights change no data pixel; they stay neutral for anything lit later.
 * The grid lies in the world xy plane (z is up, spec D8) just below the
 * object, scaled to what is on screen.
 */
export function Atmosphere({ showGrid, extent = 8 }: AtmosphereProps) {
  const gridExtent = Math.max(extent, 4)
  const gridSize = Math.min(2.4 * gridExtent, 100)
  return (
    <>
      <ambientLight intensity={0.6} />
      <directionalLight position={[7, -9, 12]} intensity={1.2} color="#ffffff" />
      {showGrid ? (
        <Grid
          position={[0, 0, -1.05 * gridExtent]}
          rotation={[Math.PI / 2, 0, 0]}
          args={[gridSize, gridSize]}
          cellSize={1}
          cellThickness={0.45}
          cellColor={GRID_CELL_COLOR}
          sectionSize={5}
          sectionThickness={0.7}
          sectionColor={GRID_SECTION_COLOR}
          fadeDistance={24}
          fadeStrength={1.6}
          infiniteGrid
        />
      ) : null}
    </>
  )
}
