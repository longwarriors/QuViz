import { PanelRightOpen } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'

import type { SceneStatus } from './api/types'
import { ControlPanel } from './components/ControlPanel'
import { EmbedBar } from './components/EmbedBar'
import { ErrorBoundary, LabFailure } from './components/ErrorBoundary'
import { GuideDialog, shouldAutoOpenGuide } from './components/GuideDialog'
import { Header } from './components/Header'
import { Inspector } from './components/Inspector'
import { Legend } from './components/Legend'
import { LoadingOverlay } from './components/LoadingOverlay'
import { OrbitalCanvas } from './components/OrbitalCanvas'
import { SearchPill } from './components/SearchPill'
import { StatusChip } from './components/StatusChip'
import { TimePill } from './components/TimePill'
import { COMPACT_WORKSPACE_QUERY, MOBILE_QUERY, useMediaQuery } from './components/useMediaQuery'
import { WebGLGate } from './components/WebGLGate'
import { useCatalogs } from './state/catalogs'
import { isEmbedMode } from './state/urlState'
import { useSceneStore } from './state/useSceneStore'

/**
 * The lab: a full-bleed canvas layer and a pointer-transparent overlay of
 * glass panels. Every overlay child carries data-chrome, so hiding
 * [data-chrome] leaves exactly the one <canvas> (the visual suite relies on it).
 */
function LabShell() {
  const compact = useMediaQuery(COMPACT_WORKSPACE_QUERY)
  const mobile = useMediaQuery(MOBILE_QUERY)
  const [embed] = useState(() => isEmbedMode())
  const [status, setStatus] = useState<SceneStatus>({ loading: true })
  const [controlsOpen, setControlsOpen] = useState(() => !mobile)
  const [detailOpen, setDetailOpen] = useState(() => !compact)
  const [guideOpen, setGuideOpen] = useState(
    () => !embed && shouldAutoOpenGuide(window.location.hash),
  )
  const bloom = useSceneStore((state) => state.bloom)
  const detailOpenerRef = useRef<HTMLButtonElement | null>(null)
  const restoreDetailFocus = useRef(false)
  const previousCompact = useRef(compact)
  const previousMobile = useRef(mobile)
  const handleStatus = useCallback((value: SceneStatus) => setStatus(value), [])

  // One catalogue load per page, even for an embed that renders no controls:
  // the time pill needs the selected mixture's period and the planner its floors.
  // (The URL hash is bound once, before the first render, by main.tsx -- B11.)
  const { superpositions } = useCatalogs()

  useEffect(() => {
    // A permanent rail must not silently become a canvas-covering overlay when
    // the window narrows; leave the visible opener and wait for intent.
    const entered = compact && !previousCompact.current
    previousCompact.current = compact
    if (!entered) return
    restoreDetailFocus.current = false
    setDetailOpen(false)
  }, [compact])

  useEffect(() => {
    const entered = mobile && !previousMobile.current
    previousMobile.current = mobile
    if (!entered) return
    restoreDetailFocus.current = false
    setControlsOpen(false)
    setDetailOpen(false)
  }, [mobile])

  const openDetail = (): void => {
    restoreDetailFocus.current = false
    setDetailOpen(true)
    // Weather-Lab: the controls fold to their round button when details open on a narrow screen.
    if (compact || mobile) setControlsOpen(false)
  }

  const closeDetail = useCallback((): void => {
    restoreDetailFocus.current = true
    setDetailOpen(false)
  }, [])

  const changeControls = (open: boolean): void => {
    setControlsOpen(open)
    if (open && mobile) setDetailOpen(false)
  }

  useEffect(() => {
    if (detailOpen || !restoreDetailFocus.current) return
    restoreDetailFocus.current = false
    detailOpenerRef.current?.focus()
  }, [detailOpen])

  useEffect(() => {
    if (!detailOpen || guideOpen) return undefined
    const onKeyDown = (event: KeyboardEvent): void => {
      // An Escape some chrome already consumed (the search pill's combobox
      // closing itself, say) was that control's, not a request to close details.
      if (event.key !== 'Escape' || event.defaultPrevented) return
      event.preventDefault()
      closeDetail()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [closeDetail, detailOpen, guideOpen])

  const drawerOpen = mobile && (controlsOpen || detailOpen)

  return (
    <div
      className="qv-app"
      data-embed={embed ? 'true' : undefined}
      data-drawer-open={drawerOpen ? 'true' : 'false'}
    >
      <div className="qv-stage">
        <ErrorBoundary
          fallback={(error, reset) => (
            <LabFailure title="三维场景无法显示" error={error} onRetry={reset} />
          )}
        >
          <WebGLGate>
            <OrbitalCanvas onStatus={handleStatus} />
          </WebGLGate>
        </ErrorBoundary>
      </div>
      <div className="qv-overlay">
        {embed ? null : <Header onOpenGuide={() => setGuideOpen(true)} />}
        <StatusChip status={status} />
        {embed ? null : <ControlPanel open={controlsOpen} onOpenChange={changeControls} />}
        {embed ? null : <SearchPill />}
        {embed || detailOpen ? null : (
          <button
            type="button"
            className="qv-detail-toggle qv-glass"
            data-chrome=""
            ref={detailOpenerRef}
            aria-controls="science-inspector"
            aria-expanded={false}
            aria-label="打开科学详情"
            title="打开科学详情"
            onClick={openDetail}
          >
            <PanelRightOpen size={18} aria-hidden="true" />
            <span>科学详情</span>
          </button>
        )}
        {embed ? null : (
          <Inspector status={status} open={detailOpen} onClose={closeDetail} mixtures={superpositions} />
        )}
        <TimePill status={status} />
        <Legend status={status} bloom={bloom} defaultExpanded={!embed && !mobile} />
        {embed ? <EmbedBar /> : null}
        {/*
          Keyed to `loading` alone, deliberately: `refreshing` means a frame is
          still on screen and still true, and the status chip already says a
          newer one is on its way.
        */}
        <LoadingOverlay visible={status.loading} />
        {embed ? null : <GuideDialog open={guideOpen} onClose={() => setGuideOpen(false)} />}
      </div>
    </div>
  )
}

export default function App() {
  return (
    <ErrorBoundary fallback={(error) => <LabFailure title="实验室遇到错误" error={error} />}>
      <LabShell />
    </ErrorBoundary>
  )
}
