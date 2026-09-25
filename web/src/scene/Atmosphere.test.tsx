/**
 * What `Atmosphere` puts in the scene, and what it leaves behind when it goes.
 *
 * GO from the T0 harness spike: this component renders under
 * `@react-three/test-renderer` with nothing mocked -- including its drei
 * child -- so the lights and the grid asserted below are the real three.js
 * objects. Nothing here claims the scene LOOKS lit: no frame is drawn in this
 * process and the appearance of the lighting rig is PR-8C's business. What is
 * claimed is structural -- which objects exist, how the grid scales with the
 * scene, and that no GPU buffer survives unmount -- plus one number the grid's
 * own shader decides from the live uniforms: how much of each grid fragment
 * its distance fade lets through (`fadeAt` below).
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
import * as THREE from 'three'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { Atmosphere } from './Atmosphere'
import { cameraDirectionFor, cameraDirectionForPlane, DEFAULT_CAMERA_DIRECTION } from './camera'

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

/**
 * The width of floor the grid's fade leaves anything on, for a scene extent.
 *
 * The fade runs out 4 extents from the nucleus and the floor lies 1.05 extents
 * below it, so the drawn disc has radius sqrt(4² − 1.05²) extents; the plane is
 * the square around that disc. Extents under 4 bohr count as 4.
 */
function floorWidth(extent: number): number {
  const scale = Math.max(extent, 4)
  return 2 * Math.sqrt((4 * scale) ** 2 - (1.05 * scale) ** 2)
}

/** The grid's plane: the one mesh `Atmosphere` adds. */
function gridMesh(renderer: Renderer): THREE.Mesh {
  const found = renderer.scene.children.find((child) => child.instance.type === 'Mesh')
  if (found === undefined) throw new Error('no grid mesh in the scene')
  return found.instance as THREE.Mesh
}

/* ---------------------------------------------------------- the grid fade */

/** The uniforms drei's grid shader reads for its fade, as its `shaderMaterial` stores them. */
interface GridUniforms {
  fadeFrom: { value: number }
  fadeDistance: { value: number }
  fadeStrength: { value: number }
  infiniteGrid: { value: boolean }
  worldCamProjPosition: { value: THREE.Vector3 }
}

/**
 * The factor drei's grid multiplies a grid fragment's alpha by, at a world
 * point on the grid.
 *
 * Its fragment shader restated, not re-derived
 * (`@react-three/drei/core/Grid.js`, fragment `main`):
 *
 *     vec3 from = worldCamProjPosition * vec3(fadeFrom);
 *     float d = 1.0 - min(distance(from, worldPosition.xyz) / fadeDistance, 1.0);
 *     gl_FragColor = vec4(color, (g1 + g2) * pow(d, fadeStrength));
 *     if (gl_FragColor.a <= 0.0) discard;
 *
 * so a factor of 0 is a fragment that is never drawn, whatever line it lies
 * on. `worldCamProjPosition` is the camera's foot on the grid plane, which drei
 * writes from a `useFrame`; `gridSeenFrom` runs that frame first.
 */
function fadeAt(uniforms: GridUniforms, point: THREE.Vector3): number {
  const from = new THREE.Vector3()
    .copy(uniforms.worldCamProjPosition.value)
    .multiplyScalar(uniforms.fadeFrom.value)
  const d = 1 - Math.min(from.distanceTo(point) / uniforms.fadeDistance.value, 1)
  return d ** uniforms.fadeStrength.value
}

const EXTENT = 20

/**
 * How far drei's `Bounds` stands the camera from a slice of this extent.
 *
 * `OrbitalCanvas` fits with margin 1.35 under a 42° camera, and `Bounds` puts
 * the camera `margin * size / (2 atan(pi fov / 360))` from the centre of a box
 * `size` wide. A slice is two extents wide: about 3.84 extents, 77 bohr here --
 * three times the 24 bohr the grid used to fade out within, measured from the
 * camera's own foot.
 */
const FITTED_DISTANCE = (1.35 * 2 * EXTENT) / (2 * Math.atan((Math.PI * 42) / 360))

/** The directions the lab fits scenes from: its default, 2p_z's front view and two slice normals. */
const FITTED_VIEWS: ReadonlyArray<readonly [string, readonly [number, number, number]]> = [
  ['the three-quarter default', DEFAULT_CAMERA_DIRECTION],
  ["2p_z's front view", cameraDirectionFor({ basis: 'real', l: 1, m: 0 })],
  ['an xy slice, from above', cameraDirectionForPlane('xy')],
  ['an xz slice, level', cameraDirectionForPlane('xz')],
]

/**
 * Mount the grid under a camera this spec owns, standing at `position`, and run
 * the frame in which drei measures the camera's foot on the grid.
 *
 * r3f keeps its camera out of the scene graph, so the camera is handed in.
 * `advanceFrames` renders nothing, so nothing refreshes world matrices the way
 * `WebGLRenderer.render` would; drei's frame reads the grid's, so the spec
 * refreshes them first.
 */
async function gridSeenFrom(
  position: THREE.Vector3,
): Promise<{ renderer: Renderer; mesh: THREE.Mesh; uniforms: GridUniforms }> {
  const camera = new THREE.PerspectiveCamera(42, 1.6, 0.01, 5000)
  camera.position.copy(position)
  camera.updateMatrixWorld(true)
  const renderer = await ReactThreeTestRenderer.create(
    createElement(Atmosphere, { showGrid: true, extent: EXTENT }),
    { camera },
  )
  renderer.scene.instance.updateMatrixWorld(true)
  await renderer.advanceFrames(1, 1 / 60)
  const mesh = gridMesh(renderer)
  const uniforms = (mesh.material as THREE.ShaderMaterial).uniforms as unknown as GridUniforms
  return { renderer, mesh, uniforms }
}

/** A camera at the fitted distance along a view direction. */
function fittedCamera(direction: readonly [number, number, number]): THREE.Vector3 {
  return new THREE.Vector3(...direction).normalize().multiplyScalar(FITTED_DISTANCE)
}

/* ------------------------------------------------------------------ specs */

describe('Atmosphere', () => {
  it('lights neutrally and hangs no decoration in the data frame', async () => {
    const renderer = await render(false)

    // Ambient plus one neutral key light. The starfield and the violet/cyan
    // fills are gone: no data material takes the scene's lights (the
    // isosurface carries its own neutral headlight), so they only ever added
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
    expect(parameters.width).toBeCloseTo(floorWidth(20), 6)
    expect(parameters.height).toBeCloseTo(floorWidth(20), 6)

    await renderer.unmount()
  })

  it('keeps the grid off the camera for a tiny scene and fits the floor to a huge one', async () => {
    const tiny = await render(true, 0.5)
    const tinyMesh = tiny.scene.children.find((child) => child.instance.type === 'Mesh')
      ?.instance as THREE.Mesh
    expect(tinyMesh.position.z).toBeCloseTo(-1.05 * 4, 6)
    expect((tinyMesh.geometry as THREE.PlaneGeometry).parameters.width).toBeCloseTo(floorWidth(4), 6)
    await tiny.unmount()

    // No size cap: a capped plane would cut the faded disc off in a hard
    // square edge, which is what the fade exists to avoid.
    const huge = await render(true, 400)
    const hugeMesh = huge.scene.children.find((child) => child.instance.type === 'Mesh')
      ?.instance as THREE.Mesh
    expect((hugeMesh.geometry as THREE.PlaneGeometry).parameters.width).toBeCloseTo(floorWidth(400), 6)
    expect((hugeMesh.geometry as THREE.PlaneGeometry).parameters.height).toBeCloseTo(floorWidth(400), 6)
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

describe("the grid's distance fade", () => {
  // Regression: the fade used to be centred on the camera's foot with an
  // absolute 24-bohr radius, and the fit stands the camera ~77 bohr away, so
  // every grid fragment in view was discarded and the 地面网格 switch changed
  // no pixel at all (D22's review, measured on the built lab).
  it('fades from the nucleus, so the floor under the object is drawn from every fitted view', async () => {
    const underNucleus: number[] = []
    for (const [view, direction] of FITTED_VIEWS) {
      const { renderer, mesh, uniforms } = await gridSeenFrom(fittedCamera(direction))
      const floor = mesh.position.z
      // Under the nucleus, under the middle of a side of the object's
      // footprint, and under a corner of it.
      const under = [
        new THREE.Vector3(0, 0, floor),
        new THREE.Vector3(EXTENT, 0, floor),
        new THREE.Vector3(-EXTENT, EXTENT, floor),
      ]
      for (const point of under) {
        expect(fadeAt(uniforms, point), `${view}, at ${point.toArray().join(', ')}`).toBeGreaterThan(0.2)
      }
      underNucleus.push(fadeAt(uniforms, under[0]))
      await renderer.unmount()
    }
    // The same floor wherever the camera stands: orbiting moves the grid
    // with the object, not with the viewer.
    for (const factor of underNucleus) expect(factor).toBeCloseTo(underNucleus[0], 12)
  })

  it('runs the fade out exactly at the edge of the plane, so the floor never ends in a hard line', async () => {
    const { renderer, mesh, uniforms } = await gridSeenFrom(fittedCamera(DEFAULT_CAMERA_DIRECTION))
    // drei's infinite mode stretches the plane by 1 + fadeDistance in its
    // vertex shader; off, the geometry measured below is the plane drawn.
    expect(uniforms.infiniteGrid.value).toBe(false)
    const parameters = (mesh.geometry as THREE.PlaneGeometry).parameters
    expect(parameters.height).toBe(parameters.width)
    const half = parameters.width / 2
    const floor = mesh.position.z

    // Each edge's midpoint is where the square comes closest to the nucleus:
    // the fade has run out there, so it runs out everywhere along the edge.
    for (const [x, y] of [[half, 0], [-half, 0], [0, half], [0, -half]]) {
      expect(fadeAt(uniforms, new THREE.Vector3(x, y, floor))).toBeLessThan(1e-9)
    }
    // And the disc does reach it: just inside the edge the grid still draws.
    expect(fadeAt(uniforms, new THREE.Vector3(0.9 * half, 0, floor))).toBeGreaterThan(0)

    await renderer.unmount()
  })
})
