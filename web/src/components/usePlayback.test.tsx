/** @vitest-environment jsdom */
import { act, createElement } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { ApiRequest } from '../api/requests'
import { playbackFrames } from '../api/staticCatalog'
import { resetTransport, setTransport } from '../api/transport'
import { resetCatalogs } from '../state/catalogs'
import { useSceneStore } from '../state/useSceneStore'
import { mount } from '../test/mount'
import {
  nearestFrameIndex,
  nextFrameTime,
  prefetchRequests,
  useFramePrefetch,
  usePlaybackModel,
} from './usePlayback'

const runtime = vi.hoisted(() => ({ current: 'live' as 'live' | 'static' }))
vi.mock('../api/runtimeMode', () => ({ runtimeMode: () => runtime.current }))
vi.mock('../api/client', () => ({
  fetchCatalog: () => Promise.resolve([]),
  fetchSuperpositionCatalog: () =>
    Promise.resolve([
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
    ]),
}))

const PRISTINE = useSceneStore.getState()
const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0))

beforeEach(() => {
  runtime.current = 'live'
  resetCatalogs()
  useSceneStore.setState(PRISTINE, true)
})

afterEach(() => {
  resetTransport()
})

describe('nearestFrameIndex / nextFrameTime', () => {
  it('finds the nearest frame and reports -1 when there is none', () => {
    expect(nearestFrameIndex([], 1)).toBe(-1)
    expect(nearestFrameIndex([0, 0.6, 1.2], Number.NaN)).toBe(-1)
    expect(nearestFrameIndex([0, 0.6, 1.2], 0.7)).toBe(1)
    expect(nearestFrameIndex([0, 0.6, 1.2], 0.9)).toBe(1)
    expect(nearestFrameIndex([0, 0.6, 1.2], 5)).toBe(2)
  })

  it('gives a tie, or a float-noise near-tie, to the lower frame', () => {
    expect(nearestFrameIndex([0, 0.6, 1.2], 0.3)).toBe(0)
    // 0.1 + 0.2 sits 1e-16 closer to 0.6 than to 0: rounding noise, not a
    // nearer frame, so the earlier frame keeps it (as clampToBound does).
    expect(nearestFrameIndex([0, 0.6], 0.1 + 0.2)).toBe(0)
    expect(nearestFrameIndex([0, 0.6], 0.31)).toBe(1)
  })

  it('advances to the next frame and wraps to the first', () => {
    expect(nextFrameTime([0, 0.6, 1.2], 0)).toBe(0.6)
    expect(nextFrameTime([0, 0.6, 1.2], 1.2)).toBe(0)
    expect(nextFrameTime([], 3)).toBe(3)
  })
})

describe('prefetchRequests', () => {
  const requests = (count: number): ApiRequest[] =>
    Array.from({ length: count }, (_, index) => ({
      route: '/api/superposition/isosurface',
      query: new URLSearchParams({ time: String(index) }),
    }))

  it('never runs more than the concurrency limit at once, and counts warmed frames', async () => {
    let running = 0
    let peak = 0
    setTransport({
      request: async () => {
        running += 1
        peak = Math.max(peak, running)
        await flush()
        running -= 1
        return new Response(new ArrayBuffer(8))
      },
    })
    const warmed = await prefetchRequests(requests(9), new AbortController().signal, 2)
    expect(warmed).toBe(9)
    expect(peak).toBe(2)
  })

  it('treats a failed or refused frame as a missed warm-up, not an error', async () => {
    let call = 0
    setTransport({
      request: async () => {
        call += 1
        if (call === 1) throw new Error('offline')
        if (call === 2) return new Response('{"detail":"x"}', { status: 404 })
        return new Response(new ArrayBuffer(8))
      },
    })
    await expect(prefetchRequests(requests(3), new AbortController().signal, 1)).resolves.toBe(1)
  })

  it('stops launching requests once aborted', async () => {
    const controller = new AbortController()
    let calls = 0
    setTransport({
      request: async () => {
        calls += 1
        controller.abort()
        return new Response(new ArrayBuffer(8))
      },
    })
    await prefetchRequests(requests(5), controller.signal, 1)
    expect(calls).toBe(1)
    await expect(prefetchRequests([], controller.signal)).resolves.toBe(0)
  })
})

describe('useFramePrefetch', () => {
  function Harness() {
    const model = usePlaybackModel()
    useFramePrefetch(model)
    return createElement('span', { 'data-frames': model.frames.length })
  }

  async function mountPlaying(): Promise<{
    calls: { route: string; signal?: AbortSignal }[]
    unmount: () => Promise<void>
  }> {
    const calls: { route: string; signal?: AbortSignal }[] = []
    setTransport({
      request: (route, _query, signal) => {
        calls.push({ route, signal })
        return Promise.resolve(new Response(new ArrayBuffer(8)))
      },
    })
    useSceneStore.setState({ mode: 'superposition', representation: 'isosurface', playing: true })
    const tree = await mount(createElement(Harness))
    await act(async () => {
      await flush()
    })
    await tree.update(createElement(Harness))
    await act(async () => {
      await flush()
      await flush()
    })
    return { calls, unmount: () => tree.unmount() }
  }

  it('warms every frame of one period in the static build while playing', async () => {
    runtime.current = 'static'
    const { calls, unmount } = await mountPlaying()
    expect(calls).toHaveLength(playbackFrames(39.6).length)
    expect(new Set(calls.map((call) => call.route))).toEqual(new Set(['/api/superposition/isosurface']))
    await unmount()
    expect(calls.every((call) => call.signal?.aborted === true)).toBe(true)
  })

  it('does nothing in live mode, where every frame is computed on demand anyway', async () => {
    runtime.current = 'live'
    const { calls, unmount } = await mountPlaying()
    expect(calls).toHaveLength(0)
    await unmount()
  })
})
