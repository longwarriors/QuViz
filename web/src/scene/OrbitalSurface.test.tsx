/**
 * What `OrbitalSurface` builds, asserted on the real three.js geometry it
 * constructs.
 *
 * GO from the T0 harness spike: this component renders under
 * `@react-three/test-renderer` with nothing mocked, so the attribute counts and
 * colours below are read off the `THREE.BufferGeometry` the component created.
 * Nothing here claims the surface LOOKS right -- there is no GPU in this
 * process and no frame is drawn. What the shading does to a colour is pinned
 * instead through `isosurfaceShade`, the CPU statement of the formula, and
 * the shader source is held to that formula word for word.
 *
 * Harness facts from the spike that this file depends on: specs cannot use JSX
 * (vitest.config.ts declares no React plugin, so esbuild uses the classic
 * runtime and JSX dies with "React is not defined"), and
 * `renderer.scene.children[i]` is a `ReactThreeTestInstance` wrapper whose
 * `.geometry` is `undefined` -- assertions therefore go through `.instance`
 * and `.type` rather than `instanceof`, which is false across the test
 * renderer's second copy of three.
 */
import ReactThreeTestRenderer from '@react-three/test-renderer'
import { createElement } from 'react'
import * as THREE from 'three'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { SurfaceGeometry } from '../api/types'
import { phaseToLinearRgb, phaseToRgb } from './color'
import {
  ISOSURFACE_AMBIENT,
  ISOSURFACE_LIGHT_DIRECTION,
  isosurfaceShade,
  OrbitalSurface,
} from './OrbitalSurface'

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

/* --------------------------------------------------------------- fixtures */

/** A tetrahedron: four vertices, four faces, one phase per vertex. */
function surface(): SurfaceGeometry {
  return {
    vertices: [
      [0, 0, 0],
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
    ],
    normals: [
      [0, 0, -1],
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
    ],
    faces: [
      [0, 2, 1],
      [0, 1, 3],
      [0, 3, 2],
      [1, 2, 3],
    ],
    phase: [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2],
  }
}

/* ---------------------------------------------------------------- harness */

interface Rendered {
  renderer: Awaited<ReturnType<typeof ReactThreeTestRenderer.create>>
  group: THREE.Object3D
  mesh: THREE.Mesh
  geometry: THREE.BufferGeometry
}

async function render(data: SurfaceGeometry, opacity = 1): Promise<Rendered> {
  const renderer = await ReactThreeTestRenderer.create(
    createElement(OrbitalSurface, { data, opacity }),
  )
  const groupNode = renderer.scene.children[0]
  const meshNode = groupNode.children[0]
  const mesh = meshNode.instance as THREE.Mesh
  return {
    renderer,
    group: groupNode.instance,
    mesh,
    geometry: mesh.geometry as THREE.BufferGeometry,
  }
}

const attributeOf = (geometry: THREE.BufferGeometry, name: string): THREE.BufferAttribute =>
  geometry.getAttribute(name) as THREE.BufferAttribute

/* ------------------------------------------------------------------ specs */

describe('OrbitalSurface', () => {
  it('renders one indexed mesh inside a group', async () => {
    const { renderer, group, mesh } = await render(surface())

    expect(group.type).toBe('Group')
    expect(mesh.type).toBe('Mesh')
    // Shading is the material's own headlight; the surface neither receives a
    // shadow nor casts a second, unlabeled silhouette onto the grid.
    expect(mesh.castShadow).toBe(false)
    expect(mesh.receiveShadow).toBe(false)

    await renderer.unmount()
  })

  it('carries one position and one normal per payload vertex, and every face index', async () => {
    const data = surface()
    const { renderer, geometry } = await render(data)

    expect(attributeOf(geometry, 'position').count).toBe(data.vertices.length)
    expect(attributeOf(geometry, 'normal').count).toBe(data.normals.length)
    // Indexed, not expanded: 4 triangles addressing 4 shared vertices. The
    // API's normals stay with those vertices: the headlight shades by them.
    expect(geometry.getIndex()?.count).toBe(data.faces.length * 3)

    const position = attributeOf(geometry, 'position')
    expect([position.getX(1), position.getY(1), position.getZ(1)]).toEqual([1, 0, 0])
    const normal = attributeOf(geometry, 'normal')
    expect([normal.getX(0), normal.getY(0), normal.getZ(0)]).toEqual([0, 0, -1])
    expect(Array.from(geometry.getIndex()?.array ?? [])).toEqual(data.faces.flat())

    await renderer.unmount()
  })

  it('colours every vertex by its own phase', async () => {
    const data = surface()
    const { renderer, geometry } = await render(data)
    const color = attributeOf(geometry, 'color')

    expect(color.count).toBe(data.phase.length)
    data.phase.forEach((phase, index) => {
      const [r, g, b] = phaseToLinearRgb(phase)
      expect(color.getX(index)).toBeCloseTo(r, 6)
      expect(color.getY(index)).toBeCloseTo(g, 6)
      expect(color.getZ(index)).toBeCloseTo(b, 6)
    })
    // Phase is the whole point of the colour: two different phases must not
    // land on the same colour.
    expect(color.getX(0)).not.toBeCloseTo(color.getX(2), 3)
    // The legend values are sRGB bytes. Writing those bytes directly into a
    // vertex attribute makes Three encode them a second time on output.
    expect(color.getY(0)).not.toBeCloseTo(phaseToRgb(0)[1], 3)

    await renderer.unmount()
  })

  it('shades with one neutral headlight of its own: no scene light, fog or tone mapping reaches it', async () => {
    const { renderer, mesh } = await render(surface())
    const material = mesh.material as THREE.ShaderMaterial

    // The phase colour still comes from the per-vertex attribute checked above.
    expect(material.vertexColors).toBe(true)
    expect(material.fog).toBe(false)
    expect(material.toneMapped).toBe(false)
    // The scene's lights never reach the surface, so no light added to the
    // scene later -- coloured or not -- can tint a phase.
    expect(material.lights).toBe(false)
    // Its one light has a direction and a strength and nothing else: there is
    // no colour-valued uniform a hue could come from.
    expect(Object.keys(material.uniforms).sort()).toEqual(['ambient', 'lightDirection', 'opacity'])
    expect(material.uniforms.ambient.value).toBe(ISOSURFACE_AMBIENT)
    const light = material.uniforms.lightDirection.value as THREE.Vector3
    expect(light.length()).toBeCloseTo(1, 12)
    // View space: +z points at the viewer, so a face turned to the camera is lit.
    expect(light.z).toBeGreaterThan(0.5)
    expect([light.x, light.y, light.z]).toEqual([...ISOSURFACE_LIGHT_DIRECTION])

    // The shader applies exactly `isosurfaceShade`, as ONE scalar per fragment.
    expect(material.fragmentShader).toContain(
      'float shade = ambient + (1.0 - ambient) * max(dot(normal, lightDirection), 0.0);',
    )
    expect(material.fragmentShader).toContain('gl_FragColor = vec4(vColor * shade, opacity);')
    const included = [...material.fragmentShader.matchAll(/#include\s*<([^>]+)>/g)].map((match) => match[1])
    // Only the renderer's output encoding; fog and tone mapping would recolour data.
    expect(included).toEqual(['colorspace_fragment'])
    expect(material.vertexShader).not.toContain('#include')

    await renderer.unmount()
  })

  it('lets shading only darken, so a fully lit vertex shows exactly the legend colour', async () => {
    const data = surface()
    const { renderer, geometry } = await render(data)
    const color = attributeOf(geometry, 'color')

    // A documented ambient floor in the ruled range: dark sides stay readable.
    expect(ISOSURFACE_AMBIENT).toBeGreaterThanOrEqual(0.45)
    expect(ISOSURFACE_AMBIENT).toBeLessThanOrEqual(0.6)
    expect(isosurfaceShade(1)).toBe(1)
    expect(isosurfaceShade(0)).toBe(ISOSURFACE_AMBIENT)
    expect(isosurfaceShade(-1)).toBe(ISOSURFACE_AMBIENT)
    let previous = -Infinity
    for (let cosine = -1; cosine <= 1.0000001; cosine += 0.125) {
      const shade = isosurfaceShade(cosine)
      expect(shade).toBeGreaterThanOrEqual(previous)
      expect(shade).toBeLessThanOrEqual(1)
      previous = shade
    }

    data.phase.forEach((phase, index) => {
      const linear = [color.getX(index), color.getY(index), color.getZ(index)]
      // Fully lit: the colour the canvas shows after the output encoding is the
      // legend's sRGB colour for this phase.
      const lit = new THREE.Color()
        .setRGB(linear[0] * isosurfaceShade(1), linear[1] * isosurfaceShade(1), linear[2] * isosurfaceShade(1))
        .getRGB({ r: 0, g: 0, b: 0 }, THREE.SRGBColorSpace)
      // To the byte the legend's CSS prints (the attribute is Float32, so the
      // round trip carries ~1e-6 of single-precision error, far below a byte).
      const byte = (channel: number): number => Math.round(channel * 255)
      const [r, g, b] = phaseToRgb(phase)
      expect([byte(lit.r), byte(lit.g), byte(lit.b)]).toEqual([byte(r), byte(g), byte(b)])
      expect(lit.r).toBeCloseTo(r, 4)
      expect(lit.g).toBeCloseTo(g, 4)
      expect(lit.b).toBeCloseTo(b, 4)
      // In shadow: every channel scaled by one factor, so the chromaticity --
      // the hue the legend names -- is the lit one.
      const dark = linear.map((channel) => channel * isosurfaceShade(-1))
      const largest = linear.indexOf(Math.max(...linear))
      linear.forEach((channel, component) => {
        expect(dark[component] / dark[largest]).toBeCloseTo(channel / linear[largest], 12)
      })
    })

    await renderer.unmount()
  })

  it('lights both faces, each by the normal of the side facing the viewer', async () => {
    const { renderer, mesh } = await render(surface())
    const material = mesh.material as THREE.ShaderMaterial

    // A clipped or translucent surface shows its inside; it must not go black.
    expect(material.side).toBe(THREE.DoubleSide)
    expect(material.fragmentShader).toContain(
      'vec3 normal = normalize(vViewNormal) * (gl_FrontFacing ? 1.0 : -1.0);',
    )
    // Normals go to view space, the space the headlight is given in.
    expect(material.vertexShader).toContain('vViewNormal = normalMatrix * normal;')
    expect(material.vertexShader).toContain('vColor = color;')

    await renderer.unmount()
  })

  it('measures its own bounds so the camera fit has something to frame', async () => {
    const { renderer, geometry } = await render(surface())

    expect(geometry.boundingBox).not.toBeNull()
    expect(geometry.boundingSphere).not.toBeNull()
    expect(geometry.boundingBox?.max.x).toBe(1)

    await renderer.unmount()
  })

  it('writes depth only while the surface is nearly opaque', async () => {
    const opaque = await render(surface(), 1)
    const opaqueMaterial = opaque.mesh.material as THREE.Material
    expect(opaqueMaterial.transparent).toBe(false)
    expect(opaqueMaterial.depthWrite).toBe(true)
    await opaque.renderer.unmount()

    const glassy = await render(surface(), 0.5)
    const glassyMaterial = glassy.mesh.material as THREE.Material
    expect(glassyMaterial.transparent).toBe(true)
    expect(glassyMaterial.opacity).toBe(0.5)
    expect((glassyMaterial as THREE.ShaderMaterial).uniforms.opacity.value).toBe(0.5)
    // A translucent lobe that wrote depth would occlude the lobe behind it and
    // hide half the orbital.
    expect(glassyMaterial.depthWrite).toBe(false)
    await glassy.renderer.unmount()
  })

  it('disposes its geometry on unmount', async () => {
    const { renderer, geometry } = await render(surface())
    const dispose = vi.spyOn(geometry, 'dispose')

    await renderer.unmount()

    expect(dispose).toHaveBeenCalledTimes(1)
  })

  it('disposes the superseded geometry when a new payload arrives', async () => {
    const { renderer, geometry } = await render(surface())
    const dispose = vi.spyOn(geometry, 'dispose')

    await renderer.update(createElement(OrbitalSurface, { data: surface(), opacity: 1 }))

    expect(dispose).toHaveBeenCalledTimes(1)
    const next = (renderer.scene.children[0].children[0].instance as THREE.Mesh).geometry
    expect(next).not.toBe(geometry)

    await renderer.unmount()
  })

  it('keeps the geometry it has when only the opacity changes', async () => {
    const data = surface()
    const { renderer, geometry } = await render(data, 1)
    const dispose = vi.spyOn(geometry, 'dispose')

    await renderer.update(createElement(OrbitalSurface, { data, opacity: 0.4 }))

    // Rebuilding a 40k-triangle isosurface because a slider moved would stall
    // the frame for no new information.
    expect(dispose).not.toHaveBeenCalled()
    const meshNode = renderer.scene.children[0].children[0]
    expect((meshNode.instance as THREE.Mesh).geometry).toBe(geometry)
    const material = (meshNode.instance as THREE.Mesh).material as THREE.ShaderMaterial
    expect(material.opacity).toBe(0.4)
    // The shader reads its own uniform, not Material.opacity: it must follow too.
    expect(material.uniforms.opacity.value).toBe(0.4)

    await renderer.unmount()
  })
})
