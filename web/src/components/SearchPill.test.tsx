/** @vitest-environment jsdom */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { act, createElement } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { setStaticCatalog } from '../api/capability'
import { parseStaticSpec, type StaticManifest } from '../api/staticCatalog'
import { resetCatalogs } from '../state/catalogs'
import { useSceneStore } from '../state/useSceneStore'
import { mount, type MountedTree } from '../test/mount'
import { SearchPill } from './SearchPill'

const runtime = vi.hoisted(() => ({ current: 'live' as 'live' | 'static' }))
vi.mock('../api/runtimeMode', () => ({ runtimeMode: () => runtime.current }))
vi.mock('../api/client', () => ({
  fetchCatalog: () =>
    Promise.resolve([{ id: '2pz', label: '2p_z', n: 2, l: 1, m: 0, basis: 'real', z: 1 }]),
  fetchSuperpositionCatalog: () =>
    Promise.resolve([
      {
        id: '1s-2pz',
        label: '1s + 2p_z (Bohr oscillation)',
        terms: '1,0,0,0.7071067811865476;2,1,0,0.7071067811865476',
        period_au: 16.755160819145562,
        note: 'Bohr',
        slice_resolution_floor: 65,
        streamline_seed_count_max: 40,
        default_representation: 'isosurface',
      },
      {
        id: '2s-2pz',
        label: '2s + 2p_z (degenerate, stationary)',
        terms: '2,0,0,0.7071067811865476;2,1,0,0.7071067811865476',
        period_au: 0,
        note: 'control',
        slice_resolution_floor: 65,
        streamline_seed_count_max: 40,
        default_representation: 'slice',
      },
    ]),
}))

const PRISTINE = useSceneStore.getState()

beforeEach(() => {
  runtime.current = 'live'
  resetCatalogs()
  useSceneStore.setState(PRISTINE, true)
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

async function openSearch(): Promise<MountedTree> {
  const tree = await mount(createElement(SearchPill))
  await interact(() => undefined) // catalogues settle
  await interact(() => tree.container.querySelector<HTMLButtonElement>('.qv-search-pill')?.click())
  return tree
}

const input = (tree: MountedTree): HTMLInputElement => {
  const node = tree.container.querySelector<HTMLInputElement>('input[role="combobox"]')
  if (node === null) throw new Error('the search is not open')
  return node
}

async function type(tree: MountedTree, text: string): Promise<void> {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
  await interact(() => {
    setter?.call(input(tree), text)
    input(tree).dispatchEvent(new Event('input', { bubbles: true }))
  })
}

async function key(tree: MountedTree, name: string): Promise<void> {
  await interact(() => {
    input(tree).dispatchEvent(new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true }))
  })
}

const options = (tree: MountedTree): HTMLLIElement[] =>
  Array.from(tree.container.querySelectorAll<HTMLLIElement>('[role="option"]'))

describe('SearchPill', () => {
  it('is a single 查找量子态 pill until it is opened', async () => {
    const tree = await mount(createElement(SearchPill))
    try {
      const pill = tree.container.querySelector<HTMLButtonElement>('.qv-search-pill')
      expect(pill?.textContent).toContain('查找量子态')
      expect(pill?.getAttribute('aria-expanded')).toBe('false')
      expect(tree.container.querySelector('.qv-search')?.hasAttribute('data-chrome')).toBe(true)
      expect(tree.container.querySelector('[role="listbox"]')).toBeNull()
    } finally {
      await tree.unmount()
    }
  })

  it('opens a focused combobox over presets, superpositions and n ≤ 4 states', async () => {
    const tree = await openSearch()
    try {
      expect(document.activeElement).toBe(input(tree))
      expect(input(tree).getAttribute('aria-controls')).toBe(tree.container.querySelector('[role="listbox"]')?.id)
      expect(options(tree)).toHaveLength(40)
      expect(options(tree)[0].textContent).toContain('2p_z')
      expect(options(tree)[0].textContent).toContain('预设')
      expect(options(tree)[1].textContent).toContain('1s + 2p_z · Bohr 振荡')
      expect(options(tree)[0].getAttribute('aria-selected')).toBe('true')
    } finally {
      await tree.unmount()
    }
  })

  it('filters as you type and says so when nothing matches', async () => {
    const tree = await openSearch()
    try {
      await type(tree, '3dxy')
      expect(options(tree).map((option) => option.dataset.entry)).toEqual(['eig-3-2--2-real'])
      await type(tree, 'zzz')
      expect(options(tree)).toHaveLength(0)
      expect(tree.container.querySelector('[role="status"]')?.textContent).toBe('没有匹配的量子态。')
      expect(input(tree).hasAttribute('aria-activedescendant')).toBe(false)
    } finally {
      await tree.unmount()
    }
  })

  it('moves the active option with the keyboard and applies it with Enter', async () => {
    const tree = await openSearch()
    try {
      await type(tree, 'complex n=2')
      const [first, second] = options(tree)
      await key(tree, 'ArrowDown')
      expect(input(tree).getAttribute('aria-activedescendant')).toBe(second.id)
      expect(second.getAttribute('aria-selected')).toBe('true')
      await key(tree, 'ArrowDown')
      expect(input(tree).getAttribute('aria-activedescendant')).toBe(second.id)
      await key(tree, 'Home')
      expect(input(tree).getAttribute('aria-activedescendant')).toBe(first.id)
      await key(tree, 'ArrowUp')
      expect(input(tree).getAttribute('aria-activedescendant')).toBe(first.id)
      await key(tree, 'End')
      await key(tree, 'Enter')

      expect(useSceneStore.getState().mode).toBe('eigenstate')
      expect(useSceneStore.getState().orbital).toMatchObject({ n: 2, l: 1, m: 1, basis: 'complex' })
      expect(tree.container.querySelector('[role="listbox"]')).toBeNull()
      expect(document.activeElement).toBe(tree.container.querySelector('.qv-search-pill'))
    } finally {
      await tree.unmount()
    }
  })

  it('follows the pointer, and pressing an option keeps focus in the input', async () => {
    const tree = await openSearch()
    try {
      await type(tree, 'complex n=2')
      const [, second] = options(tree)
      await interact(() => second.dispatchEvent(new MouseEvent('mouseover', { bubbles: true })))
      expect(input(tree).getAttribute('aria-activedescendant')).toBe(second.id)

      // Were mousedown not cancelled, focus would leave the input and the
      // blur would close the list before the click could land on the option.
      const press = new MouseEvent('mousedown', { bubbles: true, cancelable: true })
      await interact(() => second.dispatchEvent(press))
      expect(press.defaultPrevented).toBe(true)

      // A key the listbox does not own is left to the input (typing).
      const letter = new KeyboardEvent('keydown', { key: 'a', bubbles: true, cancelable: true })
      await interact(() => input(tree).dispatchEvent(letter))
      expect(letter.defaultPrevented).toBe(false)
      expect(input(tree).getAttribute('aria-activedescendant')).toBe(second.id)
    } finally {
      await tree.unmount()
    }
  })

  it('applies a superposition picked with the pointer', async () => {
    const tree = await openSearch()
    try {
      await type(tree, 'bohr')
      await interact(() => options(tree)[0].click())
      expect(useSceneStore.getState().mode).toBe('superposition')
      expect(useSceneStore.getState().superpositionTerms).toBe(
        '1,0,0,0.7071067811865476;2,1,0,0.7071067811865476',
      )
    } finally {
      await tree.unmount()
    }
  })

  it('opens a searched preset on the picture its catalogue entry publishes (A11, 2s-2pz)', async () => {
    // From an eigenstate: setSuperposition records the default, and the mode
    // switch that follows opens on it -- a slice, not a refused isosurface.
    useSceneStore.setState({ mode: 'eigenstate', representation: 'point_cloud' })
    const tree = await openSearch()
    try {
      await type(tree, 'degenerate')
      expect(options(tree).map((option) => option.dataset.entry)).toEqual(['mix-2s-2pz'])
      await interact(() => options(tree)[0].click())
      const state = useSceneStore.getState()
      expect(state.mode).toBe('superposition')
      expect(state.superpositionDefaultRepresentation).toBe('slice')
      expect(state.representation).toBe('slice')
    } finally {
      await tree.unmount()
    }
  })

  it('closes on Escape or when focus leaves, changing nothing', async () => {
    const before = useSceneStore.getState().orbital
    const tree = await openSearch()
    const outside = document.createElement('button')
    document.body.appendChild(outside)
    try {
      await key(tree, 'Escape')
      expect(tree.container.querySelector('[role="listbox"]')).toBeNull()
      expect(document.activeElement).toBe(tree.container.querySelector('.qv-search-pill'))

      await interact(() => tree.container.querySelector<HTMLButtonElement>('.qv-search-pill')?.click())
      await interact(() => outside.focus())
      expect(tree.container.querySelector('[role="listbox"]')).toBeNull()
      expect(useSceneStore.getState().orbital).toEqual(before)

      await interact(() => tree.container.querySelector<HTMLButtonElement>('.qv-search-pill')?.click())
      await interact(() => tree.container.querySelector<HTMLButtonElement>('button[aria-label="关闭查找"]')?.click())
      expect(tree.container.querySelector('[role="listbox"]')).toBeNull()
    } finally {
      outside.remove()
      await tree.unmount()
    }
  })

  it('offers every precomputed state, up to n = 8, in the static build', async () => {
    runtime.current = 'static'
    const tree = await openSearch()
    try {
      await type(tree, '8s')
      expect(options(tree).map((option) => option.textContent)).toContain('8s本征实基')
    } finally {
      await tree.unmount()
    }
  })

  it('offers only what the installed static catalogue covers, at the charge it was exported at', async () => {
    // The fixture specification stops at n = 4; exported here at Z = 2, so a
    // probe that assumed Z = 1 instead of asking chargeBound() would find
    // every eigenstate "not precomputed" and offer none of them.
    const raw = JSON.parse(readFileSync(resolve(process.cwd(), 'tools', 'fixtures', 'spec.json'), 'utf-8')) as {
      eigenstates: Record<string, unknown>
    }
    const manifest: StaticManifest = {
      format: 'quviz-static/1',
      version: '0000000000000000',
      spec: parseStaticSpec({ ...raw, eigenstates: { ...raw.eigenstates, z: 2 } }),
      entries: {},
    }
    runtime.current = 'static'
    setStaticCatalog(manifest)
    const tree = await openSearch()
    try {
      await type(tree, '5s')
      expect(options(tree)).toHaveLength(0)
      await type(tree, '4s')
      expect(options(tree).map((option) => option.dataset.entry)).toEqual(['eig-4-0-0-real'])
      await key(tree, 'Enter')
      // What was offered is exactly what the store now holds.
      expect(useSceneStore.getState().orbital).toMatchObject({ n: 4, l: 0, m: 0, z: 2 })
    } finally {
      setStaticCatalog(null)
      await tree.unmount()
    }
  })
})
