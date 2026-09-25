/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  captureFileName,
  captureSceneCanvas,
  SCENE_CANVAS_ID,
  sceneCanvas,
} from './sceneCapture'

const SCENE_URL = 'data:image/png;base64,U0NFTkU='
const DECOY_URL = 'data:image/png;base64,REVDT1k='
let clicked: HTMLAnchorElement[] = []

function canvasReturning(url: string): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  Object.defineProperty(canvas, 'toDataURL', { value: () => url })
  return canvas
}

beforeEach(() => {
  clicked = []
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    clicked.push(this)
  })
})

afterEach(() => {
  vi.restoreAllMocks()
  document.body.innerHTML = ''
})

describe('sceneCanvas', () => {
  it('finds the canvas inside the scene container, not the first canvas on the page', () => {
    document.body.appendChild(canvasReturning(DECOY_URL))
    const host = document.createElement('div')
    host.id = SCENE_CANVAS_ID
    const scene = canvasReturning(SCENE_URL)
    host.appendChild(scene)
    document.body.appendChild(host)

    expect(sceneCanvas()).toBe(scene)
  })

  it('reports no canvas when the scene has not mounted', () => {
    document.body.appendChild(canvasReturning(DECOY_URL))
    expect(sceneCanvas()).toBeNull()
  })
})

describe('captureSceneCanvas', () => {
  it('saves the scene canvas under a file-system-safe name', () => {
    document.body.appendChild(canvasReturning(DECOY_URL))
    const host = document.createElement('div')
    host.id = SCENE_CANVAS_ID
    host.appendChild(canvasReturning(SCENE_URL))
    document.body.appendChild(host)

    expect(captureSceneCanvas(document, new Date('2026-09-25T01:02:03.004Z'))).toBe(true)
    expect(clicked).toHaveLength(1)
    expect(clicked[0].href).toBe(SCENE_URL)
    expect(clicked[0].download).toBe('quviz-2026-09-25T01-02-03.004Z.png')
  })

  it('saves nothing, and says so, when there is no scene canvas', () => {
    expect(captureSceneCanvas()).toBe(false)
    expect(clicked).toHaveLength(0)
  })

  it('saves nothing when the canvas cannot be read back (tainted or lost)', () => {
    const host = document.createElement('div')
    host.id = SCENE_CANVAS_ID
    const canvas = document.createElement('canvas')
    Object.defineProperty(canvas, 'toDataURL', {
      value: () => {
        throw new DOMException('tainted', 'SecurityError')
      },
    })
    host.appendChild(canvas)
    document.body.appendChild(host)

    expect(captureSceneCanvas()).toBe(false)
    expect(clicked).toHaveLength(0)
  })

  it('never puts a colon in the file name (Windows refuses it)', () => {
    expect(captureFileName(new Date('2026-01-02T03:04:05.000Z'))).not.toContain(':')
    expect(captureFileName()).toMatch(/^quviz-.*\.png$/)
  })
})
