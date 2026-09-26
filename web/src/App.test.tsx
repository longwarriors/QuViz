/** @vitest-environment jsdom */
import { act, createElement, useEffect, type ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import App from './App'
import type { SceneStatus, SuperpositionMetadata, SuperpositionPreset } from './api/types'
import { GUIDE_SEEN_KEY } from './components/GuideDialog'
import { mount, type MountedTree } from './test/mount'

/**
 * The shell, measured with its heavy children replaced: the canvas becomes a
 * source of SceneStatus values, the control panel and the detail panel become
 * open/close probes. What is under test is the layout contract -- chrome vs
 * canvas, drawers, embed mode, focus, guide -- not those components.
 */
const reported = vi.hoisted(() => ({ current: { loading: true } as SceneStatus }))
const embed = vi.hoisted(() => ({ current: false }))
const webgl = vi.hoisted(() => ({ current: true }))
const crash = vi.hoisted(() => ({ scene: false, shell: false }))
const binding = vi.hoisted(() => ({ bound: 0 }))
const catalogue = vi.hoisted(() => ({ superpositions: [] as SuperpositionPreset[] }))

vi.mock('./components/OrbitalCanvas', () => ({
  OrbitalCanvas: ({ onStatus }: { onStatus: (status: SceneStatus) => void }) => {
    if (crash.scene) throw new Error('WebGL context lost')
    useEffect(() => {
      onStatus(reported.current)
    }, [onStatus])
    return null
  },
}))

vi.mock('./components/ControlPanel', async () => {
  const { createElement: element } = await import('react')
  return {
    ControlPanel: ({ open, onOpenChange }: { open?: boolean; onOpenChange?: (open: boolean) => void }) =>
      element(
        'section',
        { 'data-mock-controls': '', 'data-chrome': '', 'data-open': String(open) },
        element('button', { type: 'button', 'data-mock-toggle-controls': '', onClick: () => onOpenChange?.(!open) }, 'toggle'),
      ),
  }
})

vi.mock('./components/Inspector', async () => {
  const { createElement: element } = await import('react')
  return {
    Inspector: ({
      open,
      onClose,
      mixtures,
    }: {
      open?: boolean
      onClose?: () => void
      mixtures?: ReadonlyArray<{ id: string }>
    }) => {
      if (crash.shell) throw new Error('inspector exploded')
      return element(
        'aside',
        {
          'data-mock-inspector': '',
          'data-chrome': '',
          'data-open': String(open),
          'data-mixtures': (mixtures ?? []).map((mixture) => mixture.id).join(','),
          id: 'science-inspector',
        },
        element('button', { type: 'button', 'data-mock-close-inspector': '', onClick: onClose }, 'close'),
      )
    },
  }
})

vi.mock('./components/WebGLGate', async () => {
  const { createElement: element } = await import('react')
  return {
    WebGLGate: ({ children }: { children: ReactNode }) =>
      webgl.current ? children : element('div', { 'data-webgl-unavailable': '', 'data-chrome': '' }, 'no WebGL'),
  }
})

vi.mock('./state/catalogs', () => ({
  useCatalogs: () => ({
    orbitals: [],
    superpositions: catalogue.superpositions,
    orbitalStatus: 'ready',
    superpositionStatus: 'ready',
  }),
  ensureCatalogsLoaded: () => undefined,
}))

vi.mock('./state/urlState', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./state/urlState')>()),
  isEmbedMode: () => embed.current,
  // Counted only to prove the shell never calls it: main.tsx binds (B11).
  bindUrlState: () => {
    binding.bound += 1
    return () => undefined
  },
}))

interface MediaStub {
  change(query: string, matches: boolean): Promise<void>
  listenerCount(): number
}

function stubMedia(initial: Readonly<Record<string, boolean>>): MediaStub {
  const lists = new Map<string, { matches: boolean; listeners: Set<(event: MediaQueryListEvent) => void> }>()
  vi.stubGlobal('matchMedia', (query: string) => {
    const existing = lists.get(query) ?? { matches: initial[query] === true, listeners: new Set() }
    lists.set(query, existing)
    return {
      get matches() {
        return existing.matches
      },
      addEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => existing.listeners.add(listener),
      removeEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => existing.listeners.delete(listener),
    }
  })
  return {
    async change(query, matches) {
      const list = lists.get(query)
      if (list === undefined) throw new Error(`nobody asked about ${query}`)
      list.matches = matches
      await interact(() => {
        for (const listener of [...list.listeners]) listener({ matches } as MediaQueryListEvent)
      })
    },
    listenerCount: () => [...lists.values()].reduce((total, list) => total + list.listeners.size, 0),
  }
}

async function interact(body: () => void): Promise<void> {
  const scope = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  const had = 'IS_REACT_ACT_ENVIRONMENT' in scope
  const previous = scope.IS_REACT_ACT_ENVIRONMENT
  scope.IS_REACT_ACT_ENVIRONMENT = true
  try {
    await act(async () => body())
  } finally {
    if (had) scope.IS_REACT_ACT_ENVIRONMENT = previous
    else delete scope.IS_REACT_ACT_ENVIRONMENT
  }
}

async function shell(status: SceneStatus = { loading: false }): Promise<MountedTree> {
  reported.current = status
  return mount(createElement(App))
}

const q = <T extends Element = HTMLElement>(tree: MountedTree, selector: string): T | null =>
  tree.container.querySelector<T>(selector)

beforeEach(() => {
  embed.current = false
  webgl.current = true
  crash.scene = false
  crash.shell = false
  binding.bound = 0
  catalogue.superpositions = []
  localStorage.setItem(GUIDE_SEEN_KEY, 'seen')
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  localStorage.clear()
  window.history.replaceState(null, '', window.location.pathname)
})

describe('App: canvas and chrome', () => {
  it('puts the scene on its own layer and marks every floating element as chrome', async () => {
    const tree = await shell({ loading: true })
    try {
      const overlay = q(tree, '.qv-overlay')
      const children = Array.from(overlay?.children ?? [])
      expect(children.length).toBeGreaterThanOrEqual(8)
      for (const child of children) {
        expect(child.hasAttribute('data-chrome'), child.outerHTML.slice(0, 60)).toBe(true)
      }
      expect(q(tree, '.qv-stage')?.hasAttribute('data-chrome')).toBe(false)
      expect(q(tree, '.qv-stage [data-chrome]')).toBeNull()
    } finally {
      await tree.unmount()
    }
  })

  it('no longer tells every representation that colour means arg ψ (spec D9)', async () => {
    const tree = await shell()
    try {
      expect(q(tree, '.viewport-copy')).toBeNull()
      expect(tree.container.textContent).not.toContain('色彩表示 arg ψ，不表示电荷')
      expect(tree.container.textContent).not.toContain('实时量子场')
    } finally {
      await tree.unmount()
    }
  })

  it('hands the superposition catalogue to the detail panel, which titles presets by it', async () => {
    const preset = (id: string, terms: string): SuperpositionPreset => ({
      id,
      label: id,
      terms,
      period_au: 0,
      note: '',
      slice_resolution_floor: 65,
      streamline_seed_count_max: 40,
      default_representation: 'isosurface',
    })
    catalogue.superpositions = [
      preset('1s-2pz', '1,0,0,0.7071067811865476;2,1,0,0.7071067811865476'),
      preset('2s-2pz', '2,0,0,0.7071067811865476;2,1,0,0.7071067811865476'),
    ]
    const tree = await shell()
    try {
      expect(q(tree, '[data-mock-inspector]')?.getAttribute('data-mixtures')).toBe('1s-2pz,2s-2pz')
    } finally {
      await tree.unmount()
    }
  })

  it('shows the loading overlay only while there is no frame to keep', async () => {
    const tree = await shell({ loading: true })
    try {
      expect(q(tree, '.loading-overlay')).not.toBeNull()
      expect(q(tree, '[data-status]')?.getAttribute('data-status')).toBe('loading')
    } finally {
      await tree.unmount()
    }
  })

  it('keeps the last frame visible while refreshing: no overlay, but both times', async () => {
    const tree = await shell({ loading: false, refreshing: true, renderedTimeAu: 3.6, timeAu: 9.0 })
    try {
      expect(q(tree, '.loading-overlay')).toBeNull()
      const text = q(tree, '[data-status]')?.textContent ?? ''
      expect(text).toContain('正在显示 t=3.6 a.u.')
      expect(text).toContain('正在计算 t=9.0 a.u.')
    } finally {
      await tree.unmount()
    }
  })

  it('passes a standing refusal through to the status and the legend', async () => {
    const reason = 'nothing implements this cell yet'
    const tree = await shell({ loading: false, unavailable: { kind: 'point_cloud', reason } })
    try {
      expect(q(tree, '.loading-overlay')).toBeNull()
      expect(q(tree, '[data-status]')?.textContent).toContain(reason)
      expect(q(tree, '.legend')?.textContent).toContain(reason)
    } finally {
      await tree.unmount()
    }
  })

  it('keys no colours for a failed first request, and keeps describing a frame kept after one', async () => {
    const bare = await shell({ loading: false, error: 'topology did not converge' })
    try {
      expect(q(bare, '[data-status]')?.getAttribute('data-status')).toBe('error')
      expect(q(bare, '.legend-title')?.textContent).toBe('无可绘制资产')
      expect(q(bare, '.legend')?.textContent).toContain('topology did not converge')
      expect(q(bare, '.legend .phase-dot, .legend .phase-wheel')).toBeNull()
    } finally {
      await bare.unmount()
    }

    const superposition = { basis: 'complex', representation: 'streamlines' } as unknown as SuperpositionMetadata
    const kept = await shell({ loading: false, error: 'network down', superposition, maxSpeed: 0.5, lineCount: 3 })
    try {
      expect(q(kept, '[data-status]')?.getAttribute('data-status')).toBe('error')
      expect(q(kept, '.legend-title')?.textContent).toBe('概率流速率 |j|/ρ')
    } finally {
      await kept.unmount()
    }
  })

  it('says why there is no scene when WebGL is unavailable, keeping the chrome usable', async () => {
    webgl.current = false
    const tree = await shell()
    try {
      expect(q(tree, '.qv-stage [data-webgl-unavailable]')).not.toBeNull()
      expect(q(tree, 'header.qv-header')).not.toBeNull()
    } finally {
      await tree.unmount()
    }
  })

  it('contains a crashed scene and offers a retry, and a crashed shell shows the lab failure', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    crash.scene = true
    const scene = await shell()
    try {
      expect(q(scene, '.qv-stage [role="alert"]')?.textContent).toContain('三维场景无法显示')
      expect(q(scene, 'header.qv-header')).not.toBeNull()
      crash.scene = false
      await interact(() => q<HTMLButtonElement>(scene, '.qv-stage [role="alert"] button')?.click())
      expect(q(scene, '.qv-stage [role="alert"]')).toBeNull()
    } finally {
      await scene.unmount()
    }

    crash.shell = true
    const whole = await shell()
    try {
      expect(q(whole, '[role="alert"]')?.textContent).toContain('实验室遇到错误')
      expect(q(whole, '.qv-overlay')).toBeNull()
    } finally {
      await whole.unmount()
    }
  })
})

describe('App: panels on desktop, compact and phone widths', () => {
  it('opens both panels on a wide screen and keeps the detail panel closed after narrowing', async () => {
    const media = stubMedia({ '(max-width: 1180px)': false, '(max-width: 820px)': false })
    const tree = await shell()
    try {
      expect(q(tree, '[data-mock-inspector]')?.dataset.open).toBe('true')
      expect(q(tree, '[data-mock-controls]')?.dataset.open).toBe('true')
      expect(q(tree, '.qv-detail-toggle')).toBeNull()

      await media.change('(max-width: 1180px)', true)
      expect(q(tree, '[data-mock-inspector]')?.dataset.open).toBe('false')
      // Widening again does not override the reader's (or the layout's) closed state.
      await media.change('(max-width: 1180px)', false)
      expect(q(tree, '[data-mock-inspector]')?.dataset.open).toBe('false')
    } finally {
      await tree.unmount()
    }
    expect(media.listenerCount()).toBe(0)
  })

  it('starts a compact workspace with a reachable opener, and opening it folds the controls', async () => {
    stubMedia({ '(max-width: 1180px)': true, '(max-width: 820px)': false })
    const tree = await shell()
    try {
      const opener = q<HTMLButtonElement>(tree, '.qv-detail-toggle')
      expect(opener?.getAttribute('aria-label')).toBe('打开科学详情')
      expect(opener?.hasAttribute('data-chrome')).toBe(true)
      await interact(() => opener?.click())
      expect(q(tree, '[data-mock-inspector]')?.dataset.open).toBe('true')
      expect(q(tree, '[data-mock-controls]')?.dataset.open).toBe('false')
    } finally {
      await tree.unmount()
    }
  })

  it('uses one bottom drawer at a time on a phone', async () => {
    const media = stubMedia({ '(max-width: 1180px)': true, '(max-width: 820px)': true })
    const tree = await shell()
    try {
      const app = q(tree, '.qv-app')
      expect(q(tree, '[data-mock-controls]')?.dataset.open).toBe('false')
      expect(q(tree, '[data-mock-inspector]')?.dataset.open).toBe('false')
      expect(app?.dataset.drawerOpen).toBe('false')
      expect(q(tree, '.legend')?.dataset.expanded).toBe('false')

      await interact(() => q<HTMLButtonElement>(tree, '.qv-detail-toggle')?.click())
      expect(app?.dataset.drawerOpen).toBe('true')
      await interact(() => q<HTMLButtonElement>(tree, '[data-mock-toggle-controls]')?.click())
      expect(q(tree, '[data-mock-controls]')?.dataset.open).toBe('true')
      expect(q(tree, '[data-mock-inspector]')?.dataset.open).toBe('false')
      await media.change('(max-width: 820px)', false)
      await media.change('(max-width: 820px)', true)
      expect(q(tree, '[data-mock-controls]')?.dataset.open).toBe('false')
    } finally {
      await tree.unmount()
    }
  })

  it('closes the detail panel on Escape and returns focus to its opener', async () => {
    stubMedia({ '(max-width: 1180px)': false, '(max-width: 820px)': false })
    const tree = await shell()
    try {
      // Only Escape closes it: another key reaching the document leaves it open.
      await interact(() => {
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }))
      })
      expect(q(tree, '[data-mock-inspector]')?.dataset.open).toBe('true')
      await interact(() => {
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
      })
      expect(q(tree, '[data-mock-inspector]')?.dataset.open).toBe('false')
      expect(document.activeElement).toBe(q(tree, '.qv-detail-toggle'))

      await interact(() => q<HTMLButtonElement>(tree, '.qv-detail-toggle')?.click())
      await interact(() => q<HTMLButtonElement>(tree, '[data-mock-close-inspector]')?.click())
      expect(document.activeElement).toBe(q(tree, '.qv-detail-toggle'))
    } finally {
      await tree.unmount()
    }
  })

  it('lets Escape in the open search close the search alone, focus back on its pill', async () => {
    // The real SearchPill: its input consumes Escape (preventDefault) and the
    // native event still bubbles to the document, where the page's own Escape
    // must not treat it as a second, unhandled press.
    stubMedia({ '(max-width: 1180px)': false, '(max-width: 820px)': false })
    const tree = await shell()
    try {
      await interact(() => q<HTMLButtonElement>(tree, '.qv-search-pill')?.click())
      const input = q<HTMLInputElement>(tree, '.qv-search input[role="combobox"]')
      expect(input).not.toBeNull()
      expect(document.activeElement).toBe(input)
      await interact(() => {
        input?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
      })
      expect(q(tree, '.qv-search input')).toBeNull()
      expect(q(tree, '[data-mock-inspector]')?.dataset.open).toBe('true')
      expect(q(tree, '.qv-detail-toggle')).toBeNull()
      expect(document.activeElement).toBe(q(tree, '.qv-search-pill'))
    } finally {
      await tree.unmount()
    }
  })
})

describe('App: embed mode and the guide', () => {
  it('embeds only the canvas, legend, time pill, status and an open-in-lab link', async () => {
    embed.current = true
    localStorage.clear()
    const tree = await shell()
    try {
      expect(q(tree, '.qv-app')?.dataset.embed).toBe('true')
      expect(q(tree, 'header.qv-header')).toBeNull()
      expect(q(tree, '[data-mock-controls]')).toBeNull()
      expect(q(tree, '.qv-search')).toBeNull()
      expect(q(tree, '[data-mock-inspector]')).toBeNull()
      expect(q(tree, '[role="dialog"]')).toBeNull()
      expect(q(tree, '.legend')?.dataset.expanded).toBe('false')
      expect(q(tree, '.qv-time-pill')).not.toBeNull()
      expect(q(tree, '[data-status]')).not.toBeNull()
      const link = q<HTMLAnchorElement>(tree, 'a.qv-embed-open')
      expect(link?.textContent).toBe('在实验室中打开')
      expect(link?.target).toBe('_blank')
    } finally {
      await tree.unmount()
    }
  })

  it('opens the guide on a first visit, from the header later, and never over a deep link', async () => {
    localStorage.clear()
    const first = await shell()
    try {
      expect(q(first, '[role="dialog"]')?.getAttribute('aria-modal')).toBe('true')
      await interact(() => q<HTMLButtonElement>(first, 'button[aria-label="关闭指南"]')?.click())
      expect(q(first, '[role="dialog"]')).toBeNull()
      await interact(() => q<HTMLButtonElement>(first, 'button[data-action="open-guide"]')?.click())
      expect(q(first, '[role="dialog"]')).not.toBeNull()
      // While the guide is up, the page's own Escape (focus fell to the body,
      // e.g. after a click on the dialog's text) leaves the panel under it alone...
      await interact(() => {
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
      })
      expect(q(first, '[data-mock-inspector]')?.dataset.open).toBe('true')
      // ...and Escape in the guide closes the guide alone.
      await interact(() => {
        q(first, '[role="dialog"]')?.dispatchEvent(
          new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
        )
      })
      expect(q(first, '[role="dialog"]')).toBeNull()
      expect(q(first, '[data-mock-inspector]')?.dataset.open).toBe('true')
    } finally {
      await first.unmount()
    }

    localStorage.clear()
    window.history.replaceState(null, '', '#mode=eigenstate&n=3')
    const linked = await shell()
    try {
      expect(q(linked, '[role="dialog"]')).toBeNull()
    } finally {
      await linked.unmount()
    }
  })

  it('leaves the URL binding to main.tsx: the shell never binds it a second time', async () => {
    // B11's bootstrap binds once per page. A second binding here would add a
    // second store subscriber and a second catalogue fetch for preset links.
    const tree = await shell()
    await tree.update(createElement(App))
    await tree.unmount()
    expect(binding.bound).toBe(0)
  })
})
