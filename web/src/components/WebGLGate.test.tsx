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

  it('rejects a WebGL1-only canvas: the renderer it guards creates only WebGL2', () => {
    // three r163+ (this build pins 0.185.1) asks for 'webgl2' alone and throws
    // 'Error creating WebGL context.' otherwise, so passing a WebGL1-only
    // device would trade this message for a scene crash that 重试 cannot fix.
    const context = { getExtension: () => null }
    expect(detectWebGL(() => fakeCanvas((kind) => (kind === 'webgl' ? context : null)))).toBe(false)
    // A WebGL2 context without the lose-context extension still passes.
    expect(detectWebGL(() => fakeCanvas((kind) => (kind === 'webgl2' ? context : null)))).toBe(true)
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

  it('offers no textbook link inside an embed: the page around the figure is the textbook', async () => {
    // Followed from inside the figure's frame, the link would load a second
    // textbook into the figure; the sandbox forbids navigating the page itself.
    runtime.current = 'static'
    const tree = await mount(createElement(WebGLGate, { probe: () => false, embed: true, children: null }))
    try {
      expect(tree.container.querySelector('[data-webgl-unavailable]')).not.toBeNull()
      expect(tree.container.querySelector('a')).toBeNull()
    } finally {
      await tree.unmount()
    }
  })

  it('tells the shell once that no scene is coming, and never when one is', async () => {
    const refused = vi.fn()
    const off = await mount(createElement(WebGLGate, { probe: () => false, onUnavailable: refused, children: null }))
    try {
      expect(refused).toHaveBeenCalledOnce()
    } finally {
      await off.unmount()
    }

    const drawn = vi.fn()
    const on = await mount(createElement(WebGLGate, { probe: () => true, onUnavailable: drawn, children: null }))
    try {
      expect(drawn).not.toHaveBeenCalled()
    } finally {
      await on.unmount()
    }
  })
})
