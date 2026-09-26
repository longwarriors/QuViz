/** @vitest-environment jsdom */
import { act, createElement } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { mount, type MountedTree } from '../test/mount'
import { Header, REPOSITORY_URL, TOAST_MS } from './Header'

const runtime = vi.hoisted(() => ({ current: 'live' as 'live' | 'static' }))
vi.mock('../api/runtimeMode', () => ({ runtimeMode: () => runtime.current }))

/**
 * jsdom has no canvas backend, so `toDataURL` does not exist; the stub lets
 * the capture path run and is removed afterwards.
 */
const DATA_URL = 'data:image/png;base64,QUJD'
const canvasPrototype = HTMLCanvasElement.prototype as unknown as {
  toDataURL?: (type?: string) => string
}
let clicked: HTMLAnchorElement[] = []

beforeEach(() => {
  runtime.current = 'live'
  clicked = []
  canvasPrototype.toDataURL = () => DATA_URL
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    clicked.push(this)
  })
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  delete canvasPrototype.toDataURL
  delete (navigator as { clipboard?: unknown }).clipboard
  document.querySelectorAll('canvas, #quviz-scene').forEach((node) => node.remove())
})

async function interact(body: () => void | Promise<void>): Promise<void> {
  const scope = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  scope.IS_REACT_ACT_ENVIRONMENT = true
  try {
    await act(async () => {
      await body()
    })
  } finally {
    delete scope.IS_REACT_ACT_ENVIRONMENT
  }
}

const header = (onOpenGuide?: () => void): Promise<MountedTree> =>
  mount(createElement(Header, { onOpenGuide }))
const action = (tree: MountedTree, name: string): HTMLButtonElement => {
  const button = tree.container.querySelector<HTMLButtonElement>(`button[data-action="${name}"]`)
  if (button === null) throw new Error(`the header offers no ${name} action`)
  return button
}
const toast = (tree: MountedTree): string | null =>
  tree.container.querySelector('.qv-toast[role="status"]')?.textContent ?? null

describe('Header capture', () => {
  it('saves the scene canvas, not whichever canvas comes first', async () => {
    const decoy = document.createElement('canvas')
    Object.defineProperty(decoy, 'toDataURL', { value: () => 'data:image/png;base64,REVDT1k=' })
    document.body.appendChild(decoy)
    const host = document.createElement('div')
    host.id = 'quviz-scene'
    host.appendChild(document.createElement('canvas'))
    document.body.appendChild(host)
    const tree = await header()
    try {
      await interact(() => action(tree, 'save-image').click())
      expect(clicked).toHaveLength(1)
      expect(clicked[0].href).toBe(DATA_URL)
      expect(clicked[0].download).toMatch(/^quviz-[^:]*\.png$/)
      expect(toast(tree)).toBe('图像已保存')
      expect(action(tree, 'save-image').getAttribute('aria-label')).toBe('保存图像')
    } finally {
      await tree.unmount()
    }
  })

  it('says it cannot save before the scene exists, and raises nothing', async () => {
    const raised: unknown[] = []
    const onError = (event: ErrorEvent): void => {
      raised.push(event.error)
      event.preventDefault()
    }
    window.addEventListener('error', onError)
    const tree = await header()
    try {
      await interact(() => action(tree, 'save-image').click())
      expect(clicked).toHaveLength(0)
      expect(raised).toEqual([])
      expect(toast(tree)).toBe('画布尚未就绪，无法保存')
    } finally {
      window.removeEventListener('error', onError)
      await tree.unmount()
    }
  })
})

describe('Header links', () => {
  it('keeps the OpenAPI link in live mode and labels the runtime 实时计算', async () => {
    const tree = await header()
    try {
      const link = tree.container.querySelector<HTMLAnchorElement>('a[aria-label="查看 OpenAPI"]')
      expect(link?.getAttribute('href')).toBe('/docs')
      expect(link?.rel).toBe('noreferrer')
      expect(link?.target).toBe('_blank')
      expect(link?.textContent).toBe('OpenAPI')
      expect(tree.container.querySelector('a[aria-label="教材"]')).toBeNull()
      expect(tree.container.querySelector('.qv-pill-tag')?.textContent).toBe('实时计算')
      expect(tree.container.querySelector('.qv-brand-name')?.textContent).toBe('QuViz')
      expect(tree.container.querySelector('header')?.hasAttribute('data-chrome')).toBe(true)
    } finally {
      await tree.unmount()
    }
  })

  it('links the textbook in the static build and labels the runtime 教学预览', async () => {
    runtime.current = 'static'
    const tree = await header()
    try {
      expect(tree.container.querySelector('a[aria-label="教材"]')?.getAttribute('href')).toBe('./learn/')
      expect(tree.container.querySelector('a[aria-label="查看 OpenAPI"]')).toBeNull()
      expect(tree.container.querySelector('.qv-pill-tag')?.textContent).toBe('教学预览')
    } finally {
      await tree.unmount()
    }
  })

  it('links the source repository in a new tab', async () => {
    const tree = await header()
    try {
      const repo = tree.container.querySelector<HTMLAnchorElement>('a[aria-label="GitHub 仓库"]')
      expect(repo?.href).toBe(REPOSITORY_URL)
      expect(repo?.rel).toBe('noreferrer')
      expect(repo?.target).toBe('_blank')
    } finally {
      await tree.unmount()
    }
  })
})

describe('Header actions', () => {
  it('copies the current link and confirms it briefly', async () => {
    vi.useFakeTimers()
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    const tree = await header()
    try {
      await interact(() => action(tree, 'copy-link').click())
      expect(writeText).toHaveBeenCalledWith(window.location.href)
      expect(toast(tree)).toBe('链接已复制')
      await interact(() => {
        vi.advanceTimersByTime(TOAST_MS + 1)
      })
      expect(toast(tree)).toBeNull()
    } finally {
      await tree.unmount()
    }
  })

  it('says so when the clipboard is unavailable', async () => {
    const tree = await header()
    try {
      await interact(() => action(tree, 'copy-link').click())
      expect(toast(tree)).toBe('无法写入剪贴板，请手动复制地址栏')
    } finally {
      await tree.unmount()
    }
  })

  it('opens the guide when there is one, and offers no guide button otherwise', async () => {
    const onOpenGuide = vi.fn()
    const withGuide = await header(onOpenGuide)
    try {
      await interact(() => action(withGuide, 'open-guide').click())
      expect(onOpenGuide).toHaveBeenCalledOnce()
      expect(action(withGuide, 'open-guide').getAttribute('aria-label')).toBe('指南')
    } finally {
      await withGuide.unmount()
    }
    const without = await header()
    try {
      expect(without.container.querySelector('button[data-action="open-guide"]')).toBeNull()
    } finally {
      await without.unmount()
    }
  })
})
