/** @vitest-environment jsdom */
import { act, createElement } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { planSceneRequest, type Capability, type CapabilityInputs } from '../api/capability'
import { playbackFrames } from '../api/staticCatalog'
import type { SceneStatus, SuperpositionPreset } from '../api/types'
import { resetCatalogs } from '../state/catalogs'
import { useSceneStore } from '../state/useSceneStore'
import { mount, type MountedTree } from '../test/mount'
import { nextTimeAu, selectSceneRequestInputs } from './sceneRequest'
import { STATIONARY_HEADLINE, TimePill } from './TimePill'
import { DEGENERATE_REASON, WAITING_REASON } from './usePlayback'

const override = vi.hoisted(() => ({
  current: null as ((inputs: CapabilityInputs) => Capability | null) | null,
}))

vi.mock('../api/capability', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/capability')>()
  return {
    ...actual,
    capabilityFor: (inputs: CapabilityInputs): Capability =>
      override.current?.(inputs) ?? actual.capabilityFor(inputs),
  }
})

// Typed as the generated catalogue entry, so a fixture missing a required
// field (A10's default_representation) fails tsc -p tsconfig.test.json.
const CATALOGUE = vi.hoisted(() => {
  const mixtures: SuperpositionPreset[] = [
    {
      id: 'bohr',
      label: '1s + 2p_z',
      terms: '1,0,0,0.7071067811865476;2,1,0,0.7071067811865476',
      period_au: 39.6,
      note: 'Bohr oscillation',
      slice_resolution_floor: 65,
      streamline_seed_count_max: 40,
      default_representation: 'isosurface',
    },
    {
      id: 'ring',
      label: '2p_+1 + 3d_+2',
      terms: '2,1,1,0.7071067811865476;3,2,2,0.7071067811865476',
      period_au: 12.1,
      note: 'ring current',
      slice_resolution_floor: 65,
      streamline_seed_count_max: 40,
      default_representation: 'isosurface',
    },
  ]
  return { omitSelected: false, mixtures }
})

vi.mock('../api/client', () => ({
  fetchCatalog: () => Promise.resolve([]),
  fetchSuperpositionCatalog: () =>
    Promise.resolve(CATALOGUE.omitSelected ? CATALOGUE.mixtures.slice(1) : CATALOGUE.mixtures),
}))

const PRISTINE = useSceneStore.getState()

beforeEach(() => {
  override.current = null
  CATALOGUE.omitSelected = false
  resetCatalogs()
  useSceneStore.setState(PRISTINE, true)
})

afterEach(() => {
  vi.useRealTimers()
})

async function interact(body: () => void): Promise<void> {
  const scope = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  const had = 'IS_REACT_ACT_ENVIRONMENT' in scope
  const previous = scope.IS_REACT_ACT_ENVIRONMENT
  scope.IS_REACT_ACT_ENVIRONMENT = true
  try {
    await act(async () => {
      body()
    })
  } finally {
    if (had) scope.IS_REACT_ACT_ENVIRONMENT = previous
    else delete scope.IS_REACT_ACT_ENVIRONMENT
  }
}

async function press(element: Element | null, what: string): Promise<void> {
  if (!(element instanceof HTMLElement)) throw new Error(`no ${what} to press`)
  await interact(() => element.click())
}

async function setValue(element: HTMLInputElement | null, what: string, value: string): Promise<void> {
  if (element === null) throw new Error(`no ${what} control on screen`)
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
  if (setter === undefined) throw new Error('no value setter')
  await interact(() => {
    setter.call(element, value)
    element.dispatchEvent(new Event('input', { bubbles: true }))
    element.dispatchEvent(new Event('change', { bubbles: true }))
  })
}

async function pill(status: SceneStatus = { loading: false }): Promise<MountedTree> {
  const tree = await mount(createElement(TimePill, { status }))
  await interact(() => undefined) // let the mocked catalogue settle
  return tree
}

const playback = (tree: MountedTree): HTMLButtonElement | null =>
  tree.container.querySelector<HTMLButtonElement>('[data-control="playback"]')
const clock = (tree: MountedTree): HTMLInputElement | null =>
  tree.container.querySelector<HTMLInputElement>('input[data-parameter="timeAu"]')

describe('TimePill: where a clock exists', () => {
  it('offers a clock and playback only where the matrix declares timeAu', async () => {
    useSceneStore.setState({ mode: 'eigenstate', representation: 'point_cloud' })
    const stationary = await pill()
    try {
      expect(clock(stationary)).toBeNull()
      expect(playback(stationary)).toBeNull()
      expect(stationary.container.textContent).toContain(STATIONARY_HEADLINE)
      expect(stationary.container.querySelector('[data-time-kind]')?.getAttribute('data-time-kind')).toBe('stationary')
      expect(stationary.container.querySelector('[data-chrome]')).not.toBeNull()
    } finally {
      await stationary.unmount()
    }

    useSceneStore.setState({ mode: 'superposition', representation: 'isosurface' })
    const timeDependent = await pill()
    try {
      expect(clock(timeDependent)).not.toBeNull()
      expect(playback(timeDependent)).not.toBeNull()
      expect(timeDependent.container.querySelector('[data-time-kind]')?.getAttribute('data-time-kind')).toBe('oscillating')
    } finally {
      await timeDependent.unmount()
    }
  })

  it('writes an exact time through the capability-bounded entry', async () => {
    useSceneStore.setState({ mode: 'superposition', representation: 'isosurface' })
    const tree = await pill()
    try {
      const input = clock(tree)
      expect(input?.type).toBe('number')
      expect(input?.step).toBe('0.2')
      expect(input?.min).toBe('-1000')
      expect(input?.max).toBe('1000')
      expect(input?.value).toBe('0')
      expect(input?.validity.stepMismatch).toBe(false)
      await setValue(input, 'time', '8.4')
      expect(input?.value).toBe('8.4')
      expect(input?.validity.stepMismatch).toBe(false)
      expect(useSceneStore.getState().timeAu).toBe(8.4)
      await setValue(input, 'time', '')
      expect(useSceneStore.getState().timeAu).toBe(8.4)
    } finally {
      await tree.unmount()
    }
  })

  it('keeps a typed time inside the bound, so the pill names the time actually requested', async () => {
    // The planner clamps what it sends; a store that kept 5000 would have the
    // pill and the status chip name a time the server never computed.
    useSceneStore.setState({ mode: 'superposition', representation: 'isosurface' })
    const tree = await pill()
    try {
      const input = clock(tree)
      await setValue(input, 'time', '5000')
      expect(useSceneStore.getState().timeAu).toBe(1000)
      expect(input?.value).toBe('1000')
      const plan = planSceneRequest(selectSceneRequestInputs(useSceneStore.getState()))
      expect(plan.status === 'available' ? plan.params.time : undefined).toBe(1000)
      await setValue(input, 'time', '-5000')
      expect(useSceneStore.getState().timeAu).toBe(-1000)
    } finally {
      await tree.unmount()
    }
  })
})

describe('TimePill: playback', () => {
  it('toggles playback on and off', async () => {
    useSceneStore.setState({ mode: 'superposition', representation: 'isosurface' })
    const tree = await pill()
    try {
      await press(playback(tree), 'the playback toggle')
      expect(useSceneStore.getState().playing).toBe(true)
      expect(playback(tree)?.getAttribute('aria-pressed')).toBe('true')
      await press(playback(tree), 'the playback toggle')
      expect(useSceneStore.getState().playing).toBe(false)
    } finally {
      await tree.unmount()
    }
  })

  it('advances the clock on its own while playback is on', async () => {
    vi.useFakeTimers()
    useSceneStore.setState({ mode: 'superposition', representation: 'isosurface', timeAu: 0 })
    const tree = await pill()
    try {
      await press(playback(tree), 'playback')
      expect(useSceneStore.getState().playing).toBe(true)
      await vi.advanceTimersByTimeAsync(900)
      // Two ticks of the 0.6 a.u. frame grid, landing exactly on the grid.
      expect(useSceneStore.getState().timeAu).toBe(1.2)
    } finally {
      await tree.unmount()
    }
  })

  it('uses the selected catalogue period for playback', async () => {
    vi.useFakeTimers()
    useSceneStore.setState({ mode: 'superposition', representation: 'isosurface', timeAu: 0 })
    const tree = await pill()
    try {
      const ring = CATALOGUE.mixtures[1]
      await interact(() =>
        useSceneStore
          .getState()
          .setSuperposition(
            ring.terms,
            ring.label,
            ring.slice_resolution_floor,
            ring.streamline_seed_count_max,
            ring.default_representation,
          ),
      )
      await press(playback(tree), 'playback')
      await vi.advanceTimersByTimeAsync(5 * 420 + 1)

      let expected = 0
      let oldFixedPeriod = 0
      for (let frame = 0; frame < 5; frame += 1) {
        expected = nextTimeAu(expected, ring.period_au)
        oldFixedPeriod = nextTimeAu(oldFixedPeriod, 39.6)
      }
      expect(expected).toBe(2.8)
      expect(oldFixedPeriod).toBe(3)
      expect(useSceneStore.getState().timeAu).toBe(expected)
      expect(useSceneStore.getState().timeAu).not.toBe(oldFixedPeriod)
      expect(clock(tree)?.validity.stepMismatch).toBe(false)
      expect(clock(tree)?.value).toMatch(/^\d+(?:\.\d)?$/)
    } finally {
      await tree.unmount()
    }
  })

  it('does not offer motion for a degenerate catalogue state', async () => {
    const mixture = CATALOGUE.mixtures[0]
    const originalPeriod = mixture.period_au
    mixture.period_au = 0
    useSceneStore.setState({ mode: 'superposition', representation: 'isosurface' })
    const tree = await pill()
    try {
      const button = playback(tree)
      expect(button?.disabled).toBe(false)
      expect(button?.getAttribute('aria-disabled')).toBe('true')
      expect(button?.title).toContain('能量简并')
      button?.focus()
      expect(document.activeElement).toBe(button)
      const notice = tree.container.querySelector('[data-playback-notice]')
      expect(notice?.textContent).toBe(DEGENERATE_REASON)
      expect(notice?.getAttribute('role')).toBe('note')
      expect(button?.getAttribute('aria-describedby')).toBe(notice?.id)
      expect(tree.container.textContent).toContain('能量简并：密度不随时间变化')
      await press(button, 'the inert degenerate playback control')
      expect(useSceneStore.getState().playing).toBe(false)

      // A real rerender: the explanation must survive later store writes.
      await interact(() => useSceneStore.getState().setBloom(0.31))
      const rerendered = playback(tree)
      const rerenderedNotice = tree.container.querySelector('[data-playback-notice]')
      expect(rerenderedNotice?.textContent).toContain('能量简并')
      expect(rerendered?.getAttribute('aria-disabled')).toBe('true')
      expect(rerendered?.getAttribute('aria-describedby')).toBe(rerenderedNotice?.id)
    } finally {
      await tree.unmount()
      mixture.period_au = originalPeriod
    }
  })

  it('waits for the catalogue period before it offers playback', async () => {
    CATALOGUE.omitSelected = true
    useSceneStore.setState({ mode: 'superposition', representation: 'isosurface' })
    const tree = await pill()
    try {
      expect(playback(tree)?.getAttribute('aria-disabled')).toBe('true')
      expect(tree.container.querySelector('[data-playback-notice]')?.textContent).toBe(WAITING_REASON)
      expect(tree.container.textContent).toContain('周期未知')
    } finally {
      await tree.unmount()
    }
  })

  it('runs no clock for a cell the matrix gives no time parameter', async () => {
    vi.useFakeTimers()
    useSceneStore.setState({ mode: 'eigenstate', representation: 'point_cloud', playing: true })
    const tree = await pill()
    try {
      await vi.advanceTimersByTimeAsync(2000)
      expect(useSceneStore.getState().timeAu).toBe(0)
    } finally {
      await tree.unmount()
    }
  })
})

describe('TimePill: frames', () => {
  it('steps one frame at a time along the playback lattice, wrapping at both ends', async () => {
    useSceneStore.setState({ mode: 'superposition', representation: 'isosurface', timeAu: 0 })
    const tree = await pill()
    const frames = playbackFrames(39.6)
    try {
      await press(tree.container.querySelector('[data-time-step="-1"]'), 'previous frame')
      expect(useSceneStore.getState().timeAu).toBe(frames[frames.length - 1])
      await press(tree.container.querySelector('[data-time-step="1"]'), 'next frame')
      expect(useSceneStore.getState().timeAu).toBe(frames[0])
      await press(tree.container.querySelector('[data-time-step="1"]'), 'next frame')
      expect(useSceneStore.getState().timeAu).toBe(frames[1])
    } finally {
      await tree.unmount()
    }
  })

  it('scrubs one period with a range over frame indices and names the frame', async () => {
    useSceneStore.setState({ mode: 'superposition', representation: 'isosurface', timeAu: 0 })
    const tree = await pill()
    const frames = playbackFrames(39.6)
    try {
      const scrubber = tree.container.querySelector<HTMLInputElement>('input[data-time-scrubber]')
      expect(scrubber?.max).toBe(String(frames.length - 1))
      await setValue(scrubber, 'scrubber', '10')
      expect(useSceneStore.getState().timeAu).toBe(frames[10])
      expect(scrubber?.getAttribute('aria-valuetext')).toBe(`t = ${frames[10].toFixed(1)} a.u.`)
      expect(tree.container.textContent).toContain(`周期 T = 39.60 a.u. · 帧 11/${frames.length}`)

      await interact(() => useSceneStore.getState().setTimeAu(0.1))
      expect(tree.container.textContent).toContain(`帧 —/${frames.length}`)
    } finally {
      await tree.unmount()
    }
  })

  it('reads a precomputed frame list instead of offering free time entry', async () => {
    vi.useFakeTimers()
    override.current = (inputs) =>
      inputs.mode === 'superposition'
        ? {
            status: 'available',
            endpoint: '/api/superposition/isosurface',
            parameters: { timeAu: { min: 0, max: 1.2, step: 0.2, values: [0, 0.6, 1.2] } },
            latency: 'slow',
          }
        : null
    useSceneStore.setState({ mode: 'superposition', representation: 'isosurface', timeAu: 0 })
    const tree = await pill()
    try {
      expect(clock(tree)).toBeNull()
      expect(tree.container.querySelector('output[data-time-readout]')?.textContent).toBe('0.0')
      expect(tree.container.querySelector<HTMLInputElement>('input[data-time-scrubber]')?.max).toBe('2')
      await press(playback(tree), 'playback')
      await vi.advanceTimersByTimeAsync(3 * 420 + 1)
      // 0 -> 0.6 -> 1.2 -> 0: the static catalogue's frames, wrapping.
      expect(useSceneStore.getState().timeAu).toBe(0)
    } finally {
      await tree.unmount()
    }
  })

  it('shows a thin progress bar only while a frame is being computed', async () => {
    useSceneStore.setState({ mode: 'superposition', representation: 'isosurface' })
    for (const [status, busy] of [
      [{ loading: true }, true],
      [{ loading: false, refreshing: true }, true],
      [{ loading: false }, false],
    ] as const) {
      const tree = await pill(status)
      try {
        expect(tree.container.querySelector('[role="progressbar"]') !== null).toBe(busy)
      } finally {
        await tree.unmount()
      }
    }
  })
})
