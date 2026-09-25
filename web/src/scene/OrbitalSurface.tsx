import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'

import type { SurfaceGeometry } from '../api/types'
import { phaseToLinearRgb } from './color'

interface OrbitalSurfaceProps {
  /** Geometry only: the stationary and time-dependent payloads share these fields. */
  data: SurfaceGeometry
  opacity: number
}

/**
 * The share of a vertex's phase colour no orientation can take away.
 *
 * A face turned fully away from the light still shows 45 % of its colour in
 * linear light (about 70 % of each sRGB channel): dark enough that 3d_z²'s
 * torus reads as a ring rather than a flat ellipse, bright enough that its hue
 * can still be matched against the legend. Chosen by eye on that torus, from
 * the 0.45-0.6 range the D23 ruling allows.
 */
export const ISOSURFACE_AMBIENT = 0.45

/**
 * The unit direction TO the one light, in view space (+z towards the viewer):
 * above, left of and in front of the camera, so it moves with the view and
 * whatever side the viewer orbits to is the lit side. Oblique enough (about
 * 52° off the view axis) that a face seen head-on is already partly shaded,
 * which is what lets curvature show.
 */
export const ISOSURFACE_LIGHT_DIRECTION: readonly [number, number, number] = (() => {
  const [x, y, z] = [-0.5, 0.6, 0.62]
  const length = Math.hypot(x, y, z)
  return [x / length, y / length, z / length] as const
})()

/**
 * What the isosurface shader multiplies a vertex's phase colour by, for the
 * cosine between the surface normal and the light: `a + (1 − a)·max(0, n·l)`.
 *
 * It lies in [a, 1] and is 1 only for a face turned straight at the light, so
 * shading can only darken and a fully lit surface shows exactly the legend's
 * colour. It is one scalar applied to all three linear channels -- a neutral
 * light -- so it changes lightness and never chromaticity: hue stays the
 * phase. The GLSL below is this function word for word, which the spec holds
 * it to.
 */
export function isosurfaceShade(normalDotLight: number): number {
  return ISOSURFACE_AMBIENT + (1 - ISOSURFACE_AMBIENT) * Math.max(0, normalDotLight)
}

/*
 * Why a ShaderMaterial and not a built-in lit material: Lambert/Phong/Standard
 * multiply the colour by the SUM of the scene's lights and divide by pi, so the
 * brightest shade a face can reach depends on light intensities set elsewhere
 * in the scene -- above 1 it clips channels (and clipping one channel before
 * another shifts hue), below 1 no face ever shows the legend colour -- and a
 * coloured light added to the scene would tint every phase. These few lines
 * make the invariant true by construction instead: the material ignores the
 * scene's lights (`lights: false`), its one light has no colour, and
 * `isosurfaceShade` bounds the result by the vertex colour. The colour stays in
 * Linear-sRGB until the renderer's own output encoding (`colorspace_fragment`),
 * as it did under MeshBasicMaterial; fog and tone mapping are left out for the
 * same reason as before -- either would recolour data.
 */
const ISOSURFACE_VERTEX_SHADER = /* glsl */ `
  varying vec3 vColor;
  varying vec3 vViewNormal;

  void main() {
    vColor = color;
    vViewNormal = normalMatrix * normal;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const ISOSURFACE_FRAGMENT_SHADER = /* glsl */ `
  uniform float opacity;
  uniform float ambient;
  uniform vec3 lightDirection;

  varying vec3 vColor;
  varying vec3 vViewNormal;

  void main() {
    // Each side of the sheet is lit by the normal of the side the viewer sees:
    // the payload's normals point out of the level set, and its winding agrees
    // with them (builders.py), so a back face is the inside, facing the other way.
    vec3 normal = normalize(vViewNormal) * (gl_FrontFacing ? 1.0 : -1.0);
    float shade = ambient + (1.0 - ambient) * max(dot(normal, lightDirection), 0.0);
    gl_FragColor = vec4(vColor * shade, opacity);

    #include <colorspace_fragment>
  }
`

export function OrbitalSurface({ data, opacity }: OrbitalSurfaceProps) {
  const geometry = useMemo(() => {
    const vertices = new Float32Array(data.vertices.flat())
    const normals = new Float32Array(data.normals.flat())
    const indices = new Uint32Array(data.faces.flat())
    const colors = new Float32Array(data.phase.length * 3)
    data.phase.forEach((value, index) => {
      // Buffer attributes live in Three's Linear-sRGB working space. The
      // palette itself is sRGB because it is also printed as CSS bytes.
      const [r, g, b] = phaseToLinearRgb(value)
      colors[index * 3] = r
      colors[index * 3 + 1] = g
      colors[index * 3 + 2] = b
    })

    const value = new THREE.BufferGeometry()
    value.setAttribute('position', new THREE.BufferAttribute(vertices, 3))
    value.setAttribute('normal', new THREE.BufferAttribute(normals, 3))
    value.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    value.setIndex(new THREE.BufferAttribute(indices, 1))
    value.computeBoundingBox()
    value.computeBoundingSphere()
    return value
  }, [data])

  // Seeded once, as in ElectronCloud. r3f copies these entries into the
  // material's own `uniforms` rather than keeping this object, so the effect
  // below writes the opacity through the material: `Material.opacity`, set on
  // the element for sorting and blending, is not what the program reads.
  const materialRef = useRef<THREE.ShaderMaterial | null>(null)
  const uniforms = useMemo(
    () => ({
      opacity: { value: opacity },
      ambient: { value: ISOSURFACE_AMBIENT },
      lightDirection: { value: new THREE.Vector3(...ISOSURFACE_LIGHT_DIRECTION) },
    }),
    [],
  )

  useEffect(() => {
    if (materialRef.current) materialRef.current.uniforms.opacity.value = opacity
  }, [opacity])

  useEffect(() => () => geometry.dispose(), [geometry])

  return (
    <group>
      <mesh geometry={geometry} castShadow={false} receiveShadow={false}>
        <shaderMaterial
          ref={materialRef}
          vertexShader={ISOSURFACE_VERTEX_SHADER}
          fragmentShader={ISOSURFACE_FRAGMENT_SHADER}
          uniforms={uniforms}
          // `color` is declared by three's program prefix only under this flag.
          vertexColors
          lights={false}
          fog={false}
          toneMapped={false}
          transparent={opacity < 0.999}
          opacity={opacity}
          // Both faces: a surface clipped by the grid box, or seen through at
          // reduced opacity, shows its inside, lit by the inward normal.
          side={THREE.DoubleSide}
          depthWrite={opacity > 0.8}
        />
      </mesh>
    </group>
  )
}
