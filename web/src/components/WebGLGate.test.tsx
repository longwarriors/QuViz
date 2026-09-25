/** @vitest-environment jsdom */
import { createElement } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { mount } from '../test/mount'
import { detectWebGL, WebGLGate } from './WebGLGate'

const runtime = vi.hoisted(() => ({ current: 'live' as 'live' | 'static' }))
vi.mock('../api/runtimeMode', () => ({ runtimeMode: () => runtime.current }))

afterEach(() => {
  runtime.current = 'live'
  vi.restoreAllMocks()
})

const fakeCanvas = (getContext: (kind: string) => unknown): HTMLCanvasElement =>
  ({ getContext }) as unknown as HTMLCanvasElement

describe('detectWebGL', () => {
  it('accepts WebGL2 and releases the probe context at once', () => {
    const loseContext = vi.fn()
    const context = { getExtension: () => ({ loseContext }) }
    expect(detectWebGL(() => fakeCanvas((kind) => (kind === 'webgl2' ? context : null)))).toBe(true)
    expect(loseContext).toHaveBeenCalledOnce()
  })

  it('falls back to WebGL1, with or without the lose-context extension', () => {
    const context = { getExtension: () => null }
    expect(detectWebGL(() => fakeCanvas((kind) => (kind === 'webgl' ? context : null)))).toBe(true)
  })

  it('reports no WebGL when neither context exists or the probe throws', () => {
    expect(detectWebGL(() => fakeCanvas(() => null))).toBe(false)
    expect(
      detectWebGL(() =>
        fakeCanvas(() => {
          throw new Error('blocked by policy')
        }),
      ),
    ).toBe(false)
  })

  it('probes with a detached canvas: the document keeps exactly its scene canvas', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
    expect(detectWebGL()).toBe(false)
    expect(document.querySelectorAll('canvas')).toHaveLength(0)
  })
})

describe('WebGLGate', () => {
  it('renders the scene when WebGL is available', async () => {
    const tree = await mount(
      createElement(WebGLGate, { probe: () => true, children: createElement('p', { 'data-scene': '' }) }),
    )
    try {
      expect(tree.container.querySelector('[data-scene]')).not.toBeNull()
      expect(tree.container.querySelector('[data-webgl-unavailable]')).toBeNull()
    } finally {
      await tree.unmount()
    }
  })

  it('says why the scene is missing instead of leaving a blank page', async () => {
    const tree = await mount(
      createElement(WebGLGate, { probe: () => false, children: createElement('p', { 'data-scene': '' }) }),
    )
    try {
      const alert = tree.container.querySelector('[data-webgl-unavailable]')
      expect(alert?.getAttribute('role')).toBe('alert')
      expect(alert?.hasAttribute('data-chrome')).toBe(true)
      expect(alert?.textContent).toContain('此设备无法创建 WebGL 画布')
      expect(tree.container.querySelector('[data-scene]')).toBeNull()
      expect(tree.container.querySelector('a')).toBeNull()
    } finally {
      await tree.unmount()
    }
  })

  it('points a static-build reader at the textbook instead', async () => {
    runtime.current = 'static'
    const tree = await mount(createElement(WebGLGate, { probe: () => false, children: null }))
    try {
      const link = tree.container.querySelector('a')
      expect(link?.getAttribute('href')).toBe('./learn/')
      expect(link?.textContent).toBe('改为阅读教材')
    } finally {
      await tree.unmount()
    }
  })
})
