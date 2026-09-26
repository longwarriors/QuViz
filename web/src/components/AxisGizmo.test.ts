import ReactThreeTestRenderer from '@react-three/test-renderer'
import { createElement } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * drei's gizmo renders through a Hud portal with its own render pass, which
 * the test renderer's mock GL cannot run. What this file checks is the
 * CONFIGURATION handed to it: neutral, non-interactive, at the priority that
 * cooperates with the post chain, sized to the canvas.
 */
const recorded = vi.hoisted(() => ({
  helper: null as Record<string, unknown> | null,
  viewport: null as Record<string, unknown> | null,
}))

vi.mock('@react-three/drei', async () => {
  const { createElement: element, Fragment } = await import('react')
  return {
    GizmoHelper: (props: Record<string, unknown>) => {
      recorded.helper = props
      return element(Fragment, null, props.children as never)
    },
    GizmoViewport: (props: Record<string, unknown>) => {
      recorded.viewport = props
      return null
    },
  }
})

import {
  AxisGizmo,
  GIZMO_AXIS_COLOR,
  GIZMO_FONT,
  GIZMO_LABEL_COLOR,
  gizmoLayout,
  gizmoRenderPriority,
} from './AxisGizmo'

let restoreActEnvironment: () => void = () => undefined

beforeEach(() => {
  const scope = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  const had = 'IS_REACT_ACT_ENVIRONMENT' in scope
  const previous = scope.IS_REACT_ACT_ENVIRONMENT
  scope.IS_REACT_ACT_ENVIRONMENT = true
  restoreActEnvironment = () => {
    if (had) scope.IS_REACT_ACT_ENVIRONMENT = previous
    else delete scope.IS_REACT_ACT_ENVIRONMENT
  }
  recorded.helper = null
  recorded.viewport = null
})

afterEach(() => restoreActEnvironment())

describe('gizmoRenderPriority', () => {
  it('draws over the composer while Bloom is on, and renders the scene itself otherwise', () => {
    expect(gizmoRenderPriority(true)).toBe(2)
    expect(gizmoRenderPriority(false)).toBe(1)
  })
})

describe('gizmoLayout', () => {
  it('sits in the free bottom-left band on a desktop canvas', () => {
    expect(gizmoLayout(1280)).toEqual({ margin: [76, 76], scale: 34 })
    expect(gizmoLayout(821)).toEqual({ margin: [76, 76], scale: 34 })
  })

  it('shrinks and lifts above the phone controls at 820 px and below', () => {
    expect(gizmoLayout(820)).toEqual({ margin: [44, 136], scale: 26 })
    expect(gizmoLayout(400)).toEqual({ margin: [44, 136], scale: 26 })
  })
})

describe('AxisGizmo', () => {
  it('draws a neutral, non-interactive x/y/z triad in the bottom-left corner', async () => {
    const renderer = await ReactThreeTestRenderer.create(
      createElement(AxisGizmo, { presentationChain: false }),
      { width: 1280, height: 800 },
    )

    expect(recorded.helper).toMatchObject({
      alignment: 'bottom-left',
      margin: [76, 76],
      renderPriority: 1,
    })
    expect(recorded.viewport).toMatchObject({
      disabled: true,
      hideNegativeAxes: true,
      axisColors: [GIZMO_AXIS_COLOR, GIZMO_AXIS_COLOR, GIZMO_AXIS_COLOR],
      labelColor: GIZMO_LABEL_COLOR,
      labels: ['x', 'y', 'z'],
      font: GIZMO_FONT,
      scale: 34,
    })

    await renderer.unmount()
  })

  it('hands the Hud priority 2 while the post chain renders the scene', async () => {
    const renderer = await ReactThreeTestRenderer.create(
      createElement(AxisGizmo, { presentationChain: true }),
    )
    expect(recorded.helper?.renderPriority).toBe(2)
    await renderer.unmount()
  })

  it('uses the phone layout on a narrow canvas', async () => {
    const renderer = await ReactThreeTestRenderer.create(
      createElement(AxisGizmo, { presentationChain: false }),
      { width: 400, height: 860 },
    )
    expect(recorded.helper?.margin).toEqual([44, 136])
    expect(recorded.viewport?.scale).toBe(26)
    await renderer.unmount()
  })
})
