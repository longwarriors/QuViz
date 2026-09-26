/** @vitest-environment jsdom */
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

import { act, createElement } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { mount, type MountedTree } from '../test/mount'
import {
  focusableWithin,
  GUIDE_SEEN_KEY,
  GuideDialog,
  guideSeen,
  markGuideSeen,
  shouldAutoOpenGuide,
  TEXTBOOK_CHAPTERS,
} from './GuideDialog'

const runtime = vi.hoisted(() => ({ current: 'live' as 'live' | 'static' }))
vi.mock('../api/runtimeMode', () => ({ runtimeMode: () => runtime.current }))

beforeEach(() => {
  runtime.current = 'live'
  localStorage.clear()
})

afterEach(() => {
  vi.restoreAllMocks()
})

async function interact(body: () => void): Promise<void> {
  const scope = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  scope.IS_REACT_ACT_ENVIRONMENT = true
  try {
    await act(async () => {
      body()
    })
  } finally {
    delete scope.IS_REACT_ACT_ENVIRONMENT
  }
}

const press = (target: Element | null, key: string, shiftKey = false): Promise<void> =>
  interact(() => {
    target?.dispatchEvent(new KeyboardEvent('keydown', { key, shiftKey, bubbles: true, cancelable: true }))
  })

async function dialog(onClose = vi.fn()): Promise<MountedTree> {
  return mount(createElement(GuideDialog, { open: true, onClose }))
}

describe('first-visit memory', () => {
  it('opens once, then remembers, and never over a deep link', () => {
    expect(shouldAutoOpenGuide('')).toBe(true)
    expect(shouldAutoOpenGuide('#')).toBe(true)
    expect(shouldAutoOpenGuide('#mode=eigenstate&n=2')).toBe(false)
    markGuideSeen()
    expect(localStorage.getItem(GUIDE_SEEN_KEY)).toBe('seen')
    expect(guideSeen()).toBe(true)
    expect(shouldAutoOpenGuide('')).toBe(false)
  })

  it('stays silent when storage is refused', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError')
    })
    expect(guideSeen()).toBe(false)
    expect(() => markGuideSeen()).not.toThrow()
    expect(shouldAutoOpenGuide('')).toBe(true)
  })

  it('stays silent when even reading window.localStorage throws', () => {
    // Browsers that block site data throw on the property access itself,
    // before any getItem/setItem call could.
    vi.spyOn(globalThis, 'localStorage', 'get').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError')
    })
    expect(guideSeen()).toBe(false)
    expect(() => markGuideSeen()).not.toThrow()
    expect(shouldAutoOpenGuide('')).toBe(true)
  })
})

describe('GuideDialog', () => {
  it('renders nothing while closed', async () => {
    const tree = await mount(createElement(GuideDialog, { open: false, onClose: vi.fn() }))
    try {
      expect(tree.container.innerHTML).toBe('')
    } finally {
      await tree.unmount()
    }
  })

  it('is a labelled modal dialog that takes focus and marks the guide as seen', async () => {
    const opener = document.createElement('button')
    document.body.appendChild(opener)
    opener.focus()
    const tree = await dialog()
    try {
      const node = tree.container.querySelector('[role="dialog"]')
      expect(node?.getAttribute('aria-modal')).toBe('true')
      expect(document.getElementById(node?.getAttribute('aria-labelledby') ?? '')?.textContent).toBe('关于 QuViz 实验室')
      expect(tree.container.querySelector('.qv-dialog-backdrop')?.hasAttribute('data-chrome')).toBe(true)
      expect(document.activeElement?.getAttribute('role')).toBe('tab')
      expect(guideSeen()).toBe(true)
    } finally {
      await tree.unmount()
      // Focus goes back where it came from.
      expect(document.activeElement).toBe(opener)
      opener.remove()
    }
  })

  it('closes on Escape without letting the key reach the page', async () => {
    const onClose = vi.fn()
    const pageListener = vi.fn()
    document.addEventListener('keydown', pageListener)
    const tree = await dialog(onClose)
    try {
      await press(tree.container.querySelector('[role="tab"]'), 'Escape')
      expect(onClose).toHaveBeenCalledOnce()
      expect(pageListener).not.toHaveBeenCalled()
    } finally {
      document.removeEventListener('keydown', pageListener)
      await tree.unmount()
    }
  })

  it('traps Tab inside the dialog in both directions', async () => {
    const tree = await dialog()
    try {
      const root = tree.container.querySelector<HTMLElement>('[role="dialog"]')
      if (root === null) throw new Error('no dialog')
      const items = focusableWithin(root)
      // The close button and the selected tab are the only tab stops: the
      // inactive tabs (tabIndex -1) are reached with the arrow keys instead.
      expect(items).toHaveLength(2)
      expect(items[0]).toBe(root.querySelector('button[aria-label="关闭指南"]'))
      expect(items[1]).toBe(root.querySelector('[role="tab"][aria-selected="true"]'))
      const first = items[0]
      const last = items[items.length - 1]
      last.focus()
      await press(last, 'Tab')
      expect(document.activeElement).toBe(first)
      await press(first, 'Tab', true)
      expect(document.activeElement).toBe(last)
    } finally {
      await tree.unmount()
    }
  })

  it('keeps Escape and the Tab trap working after focus has left the dialog', async () => {
    // A click on the dialog's own text (nothing focusable) used to send focus
    // to <body>, where the dialog's keydown handler never saw a key: Escape
    // stopped closing it and Tab walked into the page behind the backdrop.
    const onClose = vi.fn()
    const pageListener = vi.fn()
    document.addEventListener('keydown', pageListener)
    const tree = await dialog(onClose)
    try {
      const root = tree.container.querySelector<HTMLElement>('[role="dialog"]')
      if (root === null) throw new Error('no dialog')
      // Focusable itself, so a click on its text lands focus on it, not on <body>.
      // (The attribute, not `tabIndex`: that reads -1 on any plain div too.)
      expect(root.getAttribute('tabindex')).toBe('-1')
      const [first, last] = focusableWithin(root)

      ;(document.activeElement as HTMLElement | null)?.blur()
      expect(document.activeElement).toBe(document.body)
      await press(document.body, 'Tab')
      expect(document.activeElement).toBe(first)

      ;(document.activeElement as HTMLElement | null)?.blur()
      await press(document.body, 'Tab', true)
      expect(document.activeElement).toBe(last)

      // From the dialog element itself (where a text click leaves focus),
      // Shift+Tab must not step back out into the page.
      root.focus()
      await press(root, 'Tab', true)
      expect(document.activeElement).toBe(last)

      ;(document.activeElement as HTMLElement | null)?.blur()
      await press(document.body, 'Escape')
      expect(onClose).toHaveBeenCalledOnce()
      // Tab is the browser's to act on; the guide's Escape is the guide's alone.
      const heard = pageListener.mock.calls.map(([event]) => (event as KeyboardEvent).key)
      expect(heard).not.toContain('Escape')
    } finally {
      document.removeEventListener('keydown', pageListener)
      await tree.unmount()
    }
  })

  it('stops listening to the page once closed', async () => {
    const onClose = vi.fn()
    const tree = await mount(createElement(GuideDialog, { open: false, onClose }))
    try {
      await press(document.body, 'Escape')
      expect(onClose).not.toHaveBeenCalled()
    } finally {
      await tree.unmount()
    }
  })

  it('switches tabs with the roving keyboard pattern and closes from the button or the backdrop', async () => {
    const onClose = vi.fn()
    const tree = await dialog(onClose)
    try {
      const tabs = Array.from(tree.container.querySelectorAll<HTMLButtonElement>('[role="tab"]'))
      const panel = (tab: HTMLButtonElement): HTMLElement | null =>
        document.getElementById(tab.getAttribute('aria-controls') ?? '')
      expect(tabs.map((tab) => tab.textContent)).toEqual(['概览', '读图指南', '教材章节'])
      await press(tabs[0], 'ArrowRight')
      expect(document.activeElement).toBe(tabs[1])
      expect(tabs[1].getAttribute('aria-selected')).toBe('true')
      expect(panel(tabs[1])?.getAttribute('role')).toBe('tabpanel')
      expect(panel(tabs[1])?.hasAttribute('hidden')).toBe(false)
      expect(panel(tabs[0])?.hasAttribute('hidden')).toBe(true)
      await press(tabs[1], 'End')
      expect(document.activeElement).toBe(tabs[2])
      await press(tabs[2], 'ArrowRight')
      expect(document.activeElement).toBe(tabs[0])
      await press(tabs[0], 'ArrowLeft')
      expect(document.activeElement).toBe(tabs[2])
      await press(tabs[2], 'Home')
      expect(document.activeElement).toBe(tabs[0])
      await interact(() => tabs[2].click())
      expect(tabs[2].getAttribute('aria-selected')).toBe('true')

      await interact(() => tree.container.querySelector<HTMLButtonElement>('button[aria-label="关闭指南"]')?.click())
      const backdrop = tree.container.querySelector('.qv-dialog-backdrop')
      await interact(() => backdrop?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })))
      await interact(() =>
        tree.container.querySelector('[role="dialog"]')?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })),
      )
      expect(onClose).toHaveBeenCalledTimes(2)
    } finally {
      await tree.unmount()
    }
  })

  it('links every chapter in the static build and explains their absence in live mode', async () => {
    runtime.current = 'static'
    const staticTree = await dialog()
    try {
      const root = staticTree.container.querySelector<HTMLElement>('[role="dialog"]')
      if (root === null) throw new Error('no dialog')
      // Links inside a hidden panel are not tab stops until their tab is shown.
      expect(focusableWithin(root).some((item) => item.tagName === 'A')).toBe(false)
      await interact(() => staticTree.container.querySelectorAll<HTMLButtonElement>('[role="tab"]')[2].click())
      const links = Array.from(staticTree.container.querySelectorAll<HTMLAnchorElement>('.qv-chapter-list a'))
      expect(links.map((link) => link.getAttribute('href'))).toEqual(
        TEXTBOOK_CHAPTERS.map((chapter) => `./${chapter.path}`),
      )
      const stops = focusableWithin(root).filter((item) => item.tagName === 'A')
      expect(stops).toHaveLength(TEXTBOOK_CHAPTERS.length)
      expect(stops.every((stop, index) => stop === links[index])).toBe(true)
    } finally {
      await staticTree.unmount()
    }
    runtime.current = 'live'
    const liveTree = await dialog()
    try {
      await interact(() => liveTree.container.querySelectorAll<HTMLButtonElement>('[role="tab"]')[2].click())
      expect(liveTree.container.querySelectorAll('.qv-chapter-list a')).toHaveLength(0)
      expect(liveTree.container.textContent).toContain('mkdocs serve')
    } finally {
      await liveTree.unmount()
    }
  })
})

describe('TEXTBOOK_CHAPTERS', () => {
  it('points only at chapters Part C actually wrote', () => {
    // Resolved from the vitest root (web/), NOT from import.meta.url: under
    // the jsdom environment that URL is an http:// one and node:fs rejects it
    // ("The URL must be of scheme file"), so existsSync would always be false
    // -- the same hazard the `goldenBinary` comment in useSceneAsset.test.tsx documents.
    const docs = resolve(process.cwd(), '..', 'docs')
    expect(existsSync(resolve(docs, 'textbook', 'index.md'))).toBe(true)
    for (const chapter of TEXTBOOK_CHAPTERS) {
      const page = chapter.path.replace(/^learn\//, '').replace(/\/$/, '')
      expect(existsSync(resolve(docs, `${page}.md`)), chapter.path).toBe(true)
    }
  })

  it('lists the fourteen chapters in the textbook nav order', () => {
    expect(TEXTBOOK_CHAPTERS.map((chapter) => chapter.path)).toEqual([
      'learn/textbook/00-how-to-use/',
      'learn/textbook/01-wavefunction/',
      'learn/textbook/02-hydrogen-levels/',
      'learn/textbook/03-radial-nodes/',
      'learn/textbook/04-real-complex/',
      'learn/textbook/05-electron-cloud/',
      'learn/textbook/06-isosurface/',
      'learn/textbook/07-phase-slices/',
      'learn/textbook/08-probability-current/',
      'learn/textbook/09-superposition-time/',
      'learn/textbook/10-experiment/',
      'learn/textbook/11-symmetry-hybridization/',
      'learn/textbook/appendix-a-misconceptions/',
      'learn/textbook/appendix-b-notation-units/',
    ])
  })
})
