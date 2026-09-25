/**
 * What `Atmosphere` puts in the scene, and what it leaves behind when it goes.
 *
 * GO from the T0 harness spike: this component renders under
 * `@react-three/test-renderer` with nothing mocked -- including its two drei
 * children -- so the lights, the starfield and the grid asserted below are the
 * real three.js objects. Nothing here claims the scene LOOKS lit: no frame is
 * drawn in this process and the appearance of the lighting rig is PR-8C's
 * business. What is claimed is structural -- which objects exist, how the grid
 * scales with the scene, and that no GPU buffer survives unmount.
 *
 * Harness facts from the spike this file depends on: specs cannot use JSX
 * (vitest.config.ts declares no React plugin, so esbuild compiles with the
 * classic runtime and JSX dies with "React is not defined"), and
 * `renderer.scene.children[i]` is a `ReactThreeTestInstance` wrapper, not a
 * three object -- so assertions read `.instance` and `.type` rather than
 * `instanceof`, which is false across the test renderer's second copy of three.
 */
import ReactThreeTestRenderer from '@react-three/test-renderer'
import { createElement } from 'react'
import type * as THREE from 'three'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { Atmosphere } from './Atmosphere'

/* ------------------------------------------------------------- act scope */

interface ActScope {
  IS_REACT_ACT_ENVIRONMENT?: boolean
}

let restoreActEnvironment: () => void = () => undefined

beforeEach(() => {
  const scope = globalThis as ActScope
  const had = 'IS_REACT_ACT_ENVIRONMENT' in scope
  const previous = scope.IS_REACT_ACT_ENVIRONMENT
  scope.IS_REACT_ACT_ENVIRONMENT = true
  restoreActEnvironment = () => {
    if (had) {
      scope.IS_REACT_ACT_ENVIRONMENT = previous
    } else {
      delete scope.IS_REACT_ACT_ENVIRONMENT
    }
  }
})

afterEach(() => {
  restoreActEnvironment()
  vi.restoreAllMocks()
})

/* ---------------------------------------------------------------- harness */

type Renderer = Awaited<ReturnType<typeof ReactThreeTestRenderer.create>>

async function render(showGrid: boolean, extent?: number): Promise<Renderer> {
  return ReactThreeTestRenderer.create(createElement(Atmosphere, { showGrid, extent }))
}

const typesIn = (renderer: Renderer): string[] =>
  renderer.scene.children.map((child) => child.instance.type)

/** Every three object anywhere under the scene, wrappers unwrapped. */
function everyObject(renderer: Renderer): THREE.Object3D[] {
  return renderer.scene.allChildren.map((child) => child.instance)
}

/**
 * Every geometry reachable from the scene.
 *
 * `Object3D` has no `geometry`, so this reads the field structurally rather
 * than narrowing on a class -- `instanceof THREE.Mesh` is false here, by the
 * spike's finding, and would silently collect nothing.
 */
function everyGeometry(renderer: Renderer): THREE.BufferGeometry[] {
  const found: THREE.BufferGeometry[] = []
  for (const object of everyObject(renderer)) {
    const geometry = (object as { geometry?: THREE.BufferGeometry }).geometry
    if (geometry !== undefined && typeof geometry.dispose === 'function') {
      found.push(geometry)
    }
  }
  return found
}

/* ------------------------------------------------------------------ specs */

describe('Atmosphere', () => {
  it('lights neutrally and hangs no decoration in the data frame', async () => {
    const renderer = await render(false)

    // Ambient plus one neutral key light. The starfield and the violet/cyan
    // fills are gone: every data material is unlit, so they only ever added
    // saturated colour that was not data (spec §4.4, "画布内").
    expect(typesIn(renderer)).toEqual(['AmbientLight', 'DirectionalLight'])
    const key = renderer.scene.children[1].instance as THREE.DirectionalLight
    expect(key.color.getHexString()).toBe('ffffff')

    await renderer.unmount()
  })

  it('adds the ground grid only when it is asked for', async () => {
    const without = await render(false)
    expect(typesIn(without)).not.toContain('Mesh')
    await without.unmount()

    const including = await render(true)
    expect(typesIn(including)).toContain('Mesh')
    await including.unmount()
  })

  it('lays the grid in the xy plane, below the object along z', async () => {
    const renderer = await render(true, 20)
    const mesh = renderer.scene.children.find((child) => child.instance.type === 'Mesh')
      ?.instance as THREE.Mesh
    const parameters = (mesh.geometry as THREE.PlaneGeometry).parameters

    // z is up (spec D8), so the floor is a z = const plane. drei's Grid draws
    // in its local xz plane; a +90° turn about x lays it in world xy.
    expect(mesh.position.z).toBeCloseTo(-1.05 * 20, 6)
    expect(mesh.position.y).toBe(0)
    expect(mesh.rotation.x).toBeCloseTo(Math.PI / 2, 12)
    expect(parameters.width).toBeCloseTo(2.4 * 20, 6)
    expect(parameters.height).toBeCloseTo(2.4 * 20, 6)

    await renderer.unmount()
  })

  it('keeps the grid off the camera and out of the far distance at the extremes', async () => {
    const tiny = await render(true, 0.5)
    const tinyMesh = tiny.scene.children.find((child) => child.instance.type === 'Mesh')
      ?.instance as THREE.Mesh
    expect(tinyMesh.position.z).toBeCloseTo(-1.05 * 4, 6)
    expect((tinyMesh.geometry as THREE.PlaneGeometry).parameters.width).toBeCloseTo(2.4 * 4, 6)
    await tiny.unmount()

    const huge = await render(true, 400)
    const hugeMesh = huge.scene.children.find((child) => child.instance.type === 'Mesh')
      ?.instance as THREE.Mesh
    expect((hugeMesh.geometry as THREE.PlaneGeometry).parameters.width).toBe(100)
    expect((hugeMesh.geometry as THREE.PlaneGeometry).parameters.height).toBe(100)
    await huge.unmount()
  })

  it('stands in for an unmeasured scene until the first asset arrives', async () => {
    const renderer = await render(true)
    const mesh = renderer.scene.children.find((child) => child.instance.type === 'Mesh')
      ?.instance as THREE.Mesh
    expect(mesh.position.z).toBeCloseTo(-1.05 * 8, 6)
    await renderer.unmount()
  })

  it('leaves no undisposed geometry behind when it is unmounted', async () => {
    const renderer = await render(true, 20)
    const geometries = everyGeometry(renderer)
    // The grid's plane: if this ever reads 0 the audit below is vacuous.
    expect(geometries.length).toBeGreaterThanOrEqual(1)
    const disposals = geometries.map((geometry) => vi.spyOn(geometry, 'dispose'))

    await renderer.unmount()

    disposals.forEach((dispose) => expect(dispose).toHaveBeenCalled())
  })
})
