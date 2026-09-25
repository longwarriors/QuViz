import type { SceneStatus } from '../api/types'
import { representationLabel } from './sceneStatus'

export type StatusKind = 'error' | 'unavailable' | 'loading' | 'refreshing' | 'ready'

/** A clock reading, always with its unit and always to the same precision. */
const timeText = (timeAu: number): string => `t=${timeAu.toFixed(1)} a.u.`

/**
 * What the status chip says (moved verbatim from App.tsx's StatusBar).
 *
 * Ordered by how much each case invalidates: an error and a standing refusal
 * both mean the numbers elsewhere are not about a current frame, `loading`
 * means there is no frame, `refreshing` means the frame is the previous one.
 * Only the last case may say the asset is ready.
 */
export function statusLine(status: SceneStatus): { kind: StatusKind; text: string } {
  if (status.error !== undefined) {
    return { kind: 'error', text: `场景错误 · ${status.error}` }
  }
  if (status.unavailable !== undefined) {
    return {
      kind: 'unavailable',
      text: `${representationLabel(status.unavailable.kind)}暂不可用 · ${status.unavailable.reason}`,
    }
  }
  if (status.loading) {
    return { kind: 'loading', text: '正在计算' }
  }
  if (status.refreshing === true) {
    // Both times, always: the frame on screen and the one on its way.
    const showing =
      status.renderedTimeAu !== undefined
        ? `正在显示 ${timeText(status.renderedTimeAu)}`
        : '正在显示上一帧'
    const computing =
      status.timeAu !== undefined ? `正在计算 ${timeText(status.timeAu)}` : '正在计算下一帧'
    return { kind: 'refreshing', text: `${showing} · ${computing}` }
  }
  return { kind: 'ready', text: '科学资产已就绪' }
}

/** The floating status chip; `span[data-status]` is what every e2e suite waits on. */
export function StatusChip({ status }: { status: SceneStatus }) {
  const { kind, text } = statusLine(status)
  return (
    <div className="qv-status-chip" data-chrome="" title={text}>
      <span data-status={kind}>
        <i className="qv-status-dot" data-kind={kind} aria-hidden="true" /> {text}
      </span>
    </div>
  )
}
