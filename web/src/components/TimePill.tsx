import { ChevronLeft, ChevronRight, Pause, Play } from 'lucide-react'

import type { SceneStatus } from '../api/types'
import { useFramePrefetch, usePlaybackClock, usePlaybackModel, type ClockKind } from './usePlayback'

export const STATIONARY_HEADLINE = '定态 · |ψ|² 与 t 无关'

const META_BY_KIND: Readonly<Record<Exclude<ClockKind, 'stationary' | 'oscillating'>, string>> = {
  degenerate: '能量简并：密度不随时间变化',
  waiting: '周期未知',
}

const formatTime = (time: number): string => (Number.isFinite(time) ? time.toFixed(1) : '—')

/**
 * The bottom-centre time pill. Time is a first-class control: eigenstates say
 * why nothing moves, a degenerate superposition says why it cannot move, and an
 * oscillating one gets step, play and one period of frames.
 */
export function TimePill({ status }: { status: SceneStatus }) {
  const model = usePlaybackModel()
  usePlaybackClock(model)
  useFramePrefetch(model)
  const busy = status.loading || status.refreshing === true
  const progress = busy ? (
    <div className="qv-time-progress" role="progressbar" aria-label="正在计算帧" />
  ) : null

  if (model.kind === 'stationary') {
    return (
      <section
        className="qv-time-pill qv-glass"
        data-chrome=""
        data-time-kind="stationary"
        aria-label="时间演化"
      >
        <div className="qv-time-row">
          <span className="qv-time-glyph" aria-hidden="true">
            <Play size={18} />
          </span>
          <p className="qv-time-headline">{STATIONARY_HEADLINE}</p>
        </div>
        <p className="qv-time-note">
          本征态的时间因子只是整体相位 e^(−iEt/ħ)，概率密度不变，因此没有可播放的演化。
        </p>
        {progress}
      </section>
    )
  }

  const { bound, frames, frameIndex, onLattice, periodAu } = model
  const count = frames.length
  const shownIndex = Math.max(0, frameIndex)
  return (
    <section
      className="qv-time-pill qv-glass"
      data-chrome=""
      data-time-kind={model.kind}
      aria-label="时间演化"
    >
      <div className="qv-time-row">
        {count > 1 ? (
          <button
            type="button"
            className="qv-time-step"
            data-time-step="-1"
            aria-label="上一帧"
            onClick={() => model.step(-1)}
          >
            <ChevronLeft size={18} aria-hidden="true" />
          </button>
        ) : null}
        <label className="qv-time-value">
          <span>t =</span>
          {bound !== undefined && bound.values === undefined ? (
            <input
              type="number"
              data-parameter="timeAu"
              aria-label="时间 t（原子单位）"
              min={bound.min}
              max={bound.max}
              step={bound.step}
              value={model.timeAu}
              onChange={(event) => {
                if (event.target.value.trim() !== '') model.setTime(Number(event.target.value))
              }}
            />
          ) : (
            <output data-time-readout="">{formatTime(model.timeAu)}</output>
          )}
          <span className="qv-time-unit">a.u.</span>
        </label>
        {count > 1 ? (
          <button
            type="button"
            className="qv-time-step"
            data-time-step="1"
            aria-label="下一帧"
            onClick={() => model.step(1)}
          >
            <ChevronRight size={18} aria-hidden="true" />
          </button>
        ) : null}
      </div>
      <div className="qv-time-row">
        <button
          type="button"
          className="qv-play"
          data-control="playback"
          aria-pressed={model.playing}
          aria-disabled={!model.canPlay}
          aria-describedby={model.reason === null ? undefined : 'playback-availability-notice'}
          title={
            model.canPlay && periodAu !== null
              ? `按物理周期 ${periodAu.toPrecision(6)} a.u. 循环`
              : (model.reason ?? undefined)
          }
          onClick={model.toggle}
        >
          {model.playing ? <Pause size={18} aria-hidden="true" /> : <Play size={18} aria-hidden="true" />}
          <span className="sr-only">随 t 演化</span>
        </button>
        {count > 1 ? (
          <input
            type="range"
            className="qv-time-scrubber"
            data-time-scrubber=""
            aria-label="一个周期内的帧"
            aria-valuetext={`t = ${formatTime(frames[shownIndex])} a.u.`}
            min={0}
            max={count - 1}
            step={1}
            value={shownIndex}
            onChange={(event) => model.seek(Number(event.target.value))}
          />
        ) : (
          <div className="qv-time-track" aria-hidden="true" />
        )}
      </div>
      <p className="qv-time-meta">
        {model.kind === 'oscillating' && periodAu !== null
          ? `周期 T = ${periodAu.toFixed(2)} a.u. · 帧 ${onLattice ? frameIndex + 1 : '—'}/${count}`
          : META_BY_KIND[model.kind === 'oscillating' ? 'waiting' : model.kind]}
      </p>
      {model.reason === null ? null : (
        <p
          id="playback-availability-notice"
          className="qv-time-note"
          role="note"
          data-playback-notice=""
        >
          {model.reason}
        </p>
      )}
      {progress}
    </section>
  )
}
