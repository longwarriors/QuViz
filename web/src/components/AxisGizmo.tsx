import { GizmoHelper, GizmoViewport } from '@react-three/drei'
import { useThree } from '@react-three/fiber'

/** Neutral grey: data colours (the red/cyan phase poles) are the only saturated things. */
export const GIZMO_AXIS_COLOR = '#9aa0a6'
export const GIZMO_LABEL_COLOR = '#0e0f11'
/**
 * A system face on purpose: the label textures are drawn once at mount, and a
 * web font that has not finished loading by then would make the baseline pixels
 * depend on a network race.
 */
export const GIZMO_FONT = '600 22px sans-serif'

/**
 * The Hud's useFrame priority. EffectComposer renders the scene at priority 1
 * while Bloom is on, so the Hud must only draw its overlay after it (2); with
 * no composer the Hud is what renders the scene (1). Any priority > 0 turns off
 * r3f's automatic render, so the other combinations draw twice or not at all.
 */
export function gizmoRenderPriority(presentationChain: boolean): 1 | 2 {
  return presentationChain ? 2 : 1
}

export interface GizmoLayout {
  margin: [number, number]
  scale: number
}

/** Bottom-left, clear of the control panel band on desktop and the phone buttons below 820 px. */
export function gizmoLayout(canvasWidth: number): GizmoLayout {
  return canvasWidth <= 820 ? { margin: [44, 136], scale: 26 } : { margin: [76, 76], scale: 34 }
}

/**
 * The world axes as the camera currently sees them -- z up (spec D8) -- drawn
 * in the scene's own WebGL context. Clicking is disabled: a tween would rewrite
 * camera.up and fight the slice views' frame-aligned up.
 */
export function AxisGizmo({ presentationChain }: { presentationChain: boolean }) {
  const width = useThree((state) => state.size.width)
  const { margin, scale } = gizmoLayout(width)
  return (
    <GizmoHelper
      alignment="bottom-left"
      margin={margin}
      renderPriority={gizmoRenderPriority(presentationChain)}
    >
      <GizmoViewport
        scale={scale}
        disabled
        hideNegativeAxes
        axisColors={[GIZMO_AXIS_COLOR, GIZMO_AXIS_COLOR, GIZMO_AXIS_COLOR]}
        labelColor={GIZMO_LABEL_COLOR}
        labels={['x', 'y', 'z']}
        font={GIZMO_FONT}
      />
    </GizmoHelper>
  )
}
