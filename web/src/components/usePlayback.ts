import { useEffect, useMemo } from 'react'

import { capabilityFor, clampToBound, planSceneRequest, type ParameterBound } from '../api/capability'
import { requestsForPlan, type ApiRequest } from '../api/requests'
import { runtimeMode } from '../api/runtimeMode'
import { playbackFrames } from '../api/staticCatalog'
import { getTransport } from '../api/transport'
import { useCatalogs } from '../state/catalogs'
import { useSceneStore } from '../state/useSceneStore'
import { nextTimeAu, selectSceneRequestInputs } from './sceneRequest'

/** One frame per tick. Unchanged from the retired ControlPanel timer. */
export const PLAYBACK_TICK_MS = 420
/** Parallel warm-up requests for one period of precomputed frames. */
export const PREFETCH_CONCURRENCY = 4
export const DEGENERATE_REASON = '该叠加态的能量简并，概率密度严格不随时间变化。'
export const WAITING_REASON = '等待叠加态目录提供物理周期。'

/**
 * stationary  -- the cell declares no time (every eigenstate): nothing to play.
 * waiting     -- time is declared but the catalogue period is not known yet.
 * degenerate  -- the period is 0: |Ψ|² cannot move.
 * oscillating -- a positive period: playback is offered.
 */
export type ClockKind = 'stationary' | 'waiting' | 'degenerate' | 'oscillating'

export interface PlaybackModel {
  kind: ClockKind
  canPlay: boolean
  reason: string | null
  periodAu: number | null
  bound: ParameterBound | undefined
  frames: readonly number[]
  frameIndex: number
  onLattice: boolean
  timeAu: number
  playing: boolean
  step: (direction: 1 | -1) => void
  toggle: () => void
  seek: (index: number) => void
  setTime: (value: number) => void
}

/**
 * The frame nearest `time`, or -1 when there are no frames or no time.
 *
 * A tie goes to the lower frame, and so does a near-tie within float noise
 * (1e-9 a.u.): a time half-way between two frames must not flip to the later
 * one because a sum like 0.1 + 0.2 rounded up.
 */
export function nearestFrameIndex(frames: readonly number[], time: number): number {
  if (frames.length === 0 || !Number.isFinite(time)) return -1
  let best = 0
  for (let index = 1; index < frames.length; index += 1) {
    if (Math.abs(frames[index] - time) < Math.abs(frames[best] - time) - 1e-9) best = index
  }
  return best
}

/** The frame after the one nearest `time`, wrapping; `time` itself when there are none. */
export function nextFrameTime(frames: readonly number[], time: number): number {
  if (frames.length === 0) return time
  return frames[(nearestFrameIndex(frames, time) + 1) % frames.length]
}

const parseFrames = (key: string | null): number[] | null =>
  key === null || key === '' ? null : key.split(',').map(Number)

/**
 * Everything the time pill (and the charts' beat period) need to know about the
 * clock, derived from the capability matrix and the catalogue -- no timers.
 *
 * A clock exists iff the cell declares a `timeAu` bound, so playback can never
 * be offered for a request that would send the same query on every tick. The
 * period is the catalogue's physical period scaled by a_mu/Z² from the PLAN,
 * the values the request actually carries.
 */
export function usePlaybackModel(): PlaybackModel {
  const store = useSceneStore()
  const { superpositions } = useCatalogs()
  const inputs = selectSceneRequestInputs(store)
  const capability = capabilityFor(inputs)
  const bound = capability.status === 'available' ? capability.parameters.timeAu : undefined
  const plan = planSceneRequest(inputs)
  const z = plan.status === 'available' && typeof plan.params.z === 'number' ? plan.params.z : null
  const aMu =
    plan.status === 'available' && typeof plan.params.a_mu === 'number' ? plan.params.a_mu : null
  const mixture = superpositions.find((entry) => entry.terms === store.superpositionTerms)
  const periodAu =
    bound === undefined || mixture === undefined
      ? null
      : mixture.period_au === 0
        ? 0
        : z === null || aMu === null
          ? null
          : (mixture.period_au * aMu) / z ** 2
  const kind: ClockKind =
    bound === undefined
      ? 'stationary'
      : periodAu === 0
        ? 'degenerate'
        : periodAu !== null && periodAu > 0
          ? 'oscillating'
          : 'waiting'
  const canPlay = kind === 'oscillating'
  // The static catalogue's frame list (Part B) is authoritative when present;
  // otherwise the live lattice for one period, which is what the exporter used.
  const valuesKey = bound?.values === undefined ? null : bound.values.join(',')
  const frames = useMemo<readonly number[]>(
    () => parseFrames(valuesKey) ?? (canPlay && periodAu !== null ? playbackFrames(periodAu) : []),
    [valuesKey, canPlay, periodAu],
  )
  const frameIndex = nearestFrameIndex(frames, store.timeAu)
  const onLattice = frameIndex >= 0 && Math.abs(frames[frameIndex] - store.timeAu) < 1e-9
  const { setTimeAu, setPlaying, playing, timeAu } = store

  return {
    kind,
    canPlay,
    reason: kind === 'degenerate' ? DEGENERATE_REASON : kind === 'waiting' ? WAITING_REASON : null,
    periodAu,
    bound,
    frames,
    frameIndex,
    onLattice,
    timeAu,
    playing,
    step: (direction) => {
      if (frames.length === 0) return
      const base = Math.max(0, frameIndex)
      setTimeAu(frames[(base + direction + frames.length) % frames.length])
    },
    toggle: () => {
      if (canPlay) setPlaying(!playing)
    },
    seek: (index) => {
      const time = frames[index]
      if (time !== undefined) setTimeAu(time)
    },
    setTime: (value) => {
      // Clamped here, not left to the planner: the planner clamps what it
      // sends, so a store holding 5000 would label the frame with a time the
      // server never computed.
      if (Number.isFinite(value) && bound !== undefined) setTimeAu(clampToBound(bound, value))
    },
  }
}

/**
 * The 420 ms tick. It reads the clock from the store, not from a render's
 * closure, and depends only on what decides whether it runs -- so an unrelated
 * store write (dragging another slider) cannot restart the interval.
 */
export function usePlaybackClock(
  model: Pick<PlaybackModel, 'playing' | 'canPlay' | 'periodAu' | 'bound'>,
): void {
  const { playing, canPlay, periodAu } = model
  const valuesKey = model.bound?.values === undefined ? null : model.bound.values.join(',')
  useEffect(() => {
    if (!playing || !canPlay || periodAu === null) return undefined
    const frames = parseFrames(valuesKey)
    const timer = window.setInterval(() => {
      const state = useSceneStore.getState()
      state.setTimeAu(
        frames === null ? nextTimeAu(state.timeAu, periodAu) : nextFrameTime(frames, state.timeAu),
      )
    }, PLAYBACK_TICK_MS)
    return () => window.clearInterval(timer)
  }, [playing, canPlay, periodAu, valuesKey])
}

/**
 * Warm one period of frames through the active transport, at most
 * `concurrency` at a time. Returns how many frames came back OK. A failed
 * warm-up is not an error: the frame's own request reports any real failure.
 */
export async function prefetchRequests(
  requests: readonly ApiRequest[],
  signal: AbortSignal,
  concurrency = PREFETCH_CONCURRENCY,
): Promise<number> {
  const transport = getTransport()
  let cursor = 0
  let warmed = 0
  const worker = async (): Promise<void> => {
    while (!signal.aborted && cursor < requests.length) {
      const request = requests[cursor]
      cursor += 1
      try {
        const response = await transport.request(request.route, request.query, signal)
        if (response.ok) {
          await response.arrayBuffer()
          warmed += 1
        }
      } catch {
        // A missed warm-up only means the frame is fetched when it is shown.
      }
    }
  }
  const workers = Math.max(0, Math.min(concurrency, requests.length))
  await Promise.all(Array.from({ length: workers }, () => worker()))
  return warmed
}

/**
 * Static build only: while a superposition plays, fetch every frame of one
 * period ahead of the 420 ms clock so a cold Pages cache does not stall the
 * animation. Live mode computes on demand and is left alone.
 */
export function useFramePrefetch(model: Pick<PlaybackModel, 'canPlay' | 'playing' | 'frames'>): void {
  const store = useSceneStore()
  const enabled =
    runtimeMode() === 'static' && model.canPlay && model.playing && model.frames.length > 1
  const key = enabled
    ? `${model.frames.join(',')}|${JSON.stringify({ ...selectSceneRequestInputs(store), timeAu: 0 })}`
    : null
  useEffect(() => {
    if (key === null) return undefined
    const frames = key.slice(0, key.indexOf('|')).split(',').map(Number)
    const base = selectSceneRequestInputs(useSceneStore.getState())
    const requests = frames.flatMap((timeAu) => {
      const inputs = { ...base, timeAu }
      const plan = planSceneRequest(inputs)
      return plan.status === 'available' ? [...requestsForPlan(plan, inputs)] : []
    })
    const controller = new AbortController()
    void prefetchRequests(requests, controller.signal)
    return () => controller.abort()
  }, [key])
}
