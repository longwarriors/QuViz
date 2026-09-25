import { Atom, Eye, ListTree, PanelRightOpen, SlidersHorizontal } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'

import type { SceneStatus } from './api/types'
import { ControlPanel } from './components/ControlPanel'
import { ErrorBoundary, LabFailure } from './components/ErrorBoundary'
import { Header } from './components/Header'
import { Inspector } from './components/Inspector'
import { Legend } from './components/Legend'
import { LoadingOverlay } from './components/LoadingOverlay'
import { OrbitalCanvas } from './components/OrbitalCanvas'
import { StatusChip } from './components/StatusChip'
import { TimePill } from './components/TimePill'
import { WebGLGate } from './components/WebGLGate'
import { useSceneStore } from './state/useSceneStore'

/** The breakpoint where the permanent analysis rail becomes an overlay. */
const COMPACT_WORKSPACE_QUERY = '(max-width: 1180px)'

function compactWorkspaceQuery(): MediaQueryList | null {
  if (typeof globalThis.matchMedia !== 'function') return null
  return globalThis.matchMedia(COMPACT_WORKSPACE_QUERY)
}

/**
 * Whether the analysis rail has become an on-demand overlay -- live.
 *
 * CSS decides the geometry at this breakpoint, but JavaScript owns whether the
 * overlay is open. Subscribing to the same query keeps those two facts aligned
 * when a window is resized or desktop zoom crosses the breakpoint; without it,
 * a rail that was open on a wide screen can become an invisible, still-focusable
 * overlay on the next layout.
 */
function useCompactWorkspace(): boolean {
  const [compact, setCompact] = useState(() => compactWorkspaceQuery()?.matches === true)

  useEffect(() => {
    const query = compactWorkspaceQuery()
    if (query === null) return undefined
    const onChange = (event: MediaQueryListEvent): void => setCompact(event.matches)
    query.addEventListener('change', onChange)
    setCompact(query.matches)
    return () => query.removeEventListener('change', onChange)
  }, [])

  return compact
}

export default function App() {
  const compactWorkspace = useCompactWorkspace()
  const bloom = useSceneStore((state) => state.bloom)
  const [status, setStatus] = useState<SceneStatus>({ loading: true })
  // The wide rail is useful on first load; a compact overlay must wait for an
  // explicit request so it does not cover the canvas merely because it exists.
  const [inspectorOpen, setInspectorOpen] = useState(() => !compactWorkspace)
  const [mobileSurface, setMobileSurface] = useState<'controls' | 'inspector' | null>('controls')
  const inspectorOpenerRef = useRef<HTMLButtonElement | null>(null)
  const stageInspectorOpenerRef = useRef<HTMLButtonElement | null>(null)
  const mobileInspectorOpenerRef = useRef<HTMLButtonElement | null>(null)
  const restoreInspectorFocusRef = useRef(false)
  const previousCompactWorkspaceRef = useRef(compactWorkspace)
  const handleStatus = useCallback((value: SceneStatus) => setStatus(value), [])

  const openInspector = (opener: HTMLButtonElement): void => {
    inspectorOpenerRef.current = opener
    restoreInspectorFocusRef.current = false
    setInspectorOpen(true)
    setMobileSurface('inspector')
  }

  const closeInspector = useCallback((): void => {
    restoreInspectorFocusRef.current = true
    setInspectorOpen(false)
    setMobileSurface((surface) => (surface === 'inspector' ? null : surface))
  }, [])

  useEffect(() => {
    const enteredCompactWorkspace = compactWorkspace && !previousCompactWorkspaceRef.current
    previousCompactWorkspaceRef.current = compactWorkspace
    if (!enteredCompactWorkspace) return

    // A permanent rail must not silently turn into a canvas-covering overlay
    // when a window narrows. Leave a visible opener and wait for intent.
    restoreInspectorFocusRef.current = false
    setInspectorOpen(false)
    setMobileSurface((surface) => (surface === 'inspector' ? null : surface))
  }, [compactWorkspace])

  useEffect(() => {
    if (inspectorOpen || !restoreInspectorFocusRef.current) return
    restoreInspectorFocusRef.current = false

    const isRendered = (element: HTMLElement | null): element is HTMLElement => {
      if (element === null || !element.isConnected) return false
      for (let node: HTMLElement | null = element; node !== null; node = node.parentElement) {
        const style = getComputedStyle(node)
        if (style.display === 'none' || style.visibility === 'hidden' || node.inert) return false
      }
      return true
    }
    const opener = [
      inspectorOpenerRef.current,
      stageInspectorOpenerRef.current,
      mobileInspectorOpenerRef.current,
    ].find(isRendered)
    opener?.focus()
  }, [inspectorOpen])

  useEffect(() => {
    if (!inspectorOpen) return undefined
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      closeInspector()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [closeInspector, inspectorOpen])

  return (
    <div className="app-shell">
      <Header />
      <main className="workspace" data-inspector-open={inspectorOpen}>
        <ControlPanel />
        <section className="viewport-card" aria-label="量子态三维视口">
          <div className="viewport-copy">
            <span className="viewport-signal"><i />实时量子场</span>
            <h1>氢样量子态</h1>
            <p>拖动旋转 · 滚轮缩放 · 色彩表示 arg ψ，不表示电荷</p>
          </div>
          <ErrorBoundary
            fallback={(error, reset) => (
              <LabFailure title="三维场景无法显示" error={error} onRetry={reset} />
            )}
          >
            <WebGLGate>
              <OrbitalCanvas onStatus={handleStatus} />
            </WebGLGate>
          </ErrorBoundary>
          <Legend status={status} bloom={bloom} />
          <TimePill status={status} />
          <button
            type="button"
            className="stage-inspector-toggle"
            ref={stageInspectorOpenerRef}
            data-inspector-visible={inspectorOpen}
            onClick={(event) => openInspector(event.currentTarget)}
            aria-controls="science-inspector"
            aria-expanded={inspectorOpen}
            aria-label="打开科学详情"
            title="打开科学详情"
          >
            <PanelRightOpen size={18} />
            <span>科学详情</span>
          </button>
          {/*
            Keyed to `loading` alone, deliberately. `refreshing` means a frame
            is still on screen and still true; covering it with "Computing
            quantum scene" would throw away the keep-last-frame behaviour the
            fetch layer exists to provide. The status bar is what says a newer
            frame is on its way.
          */}
          <LoadingOverlay visible={status.loading} />
          <div className="corner-mark top-left" />
          <div className="corner-mark bottom-right" />
        </section>
        <Inspector
          status={status}
          open={inspectorOpen}
          mobileOpen={inspectorOpen && mobileSurface === 'inspector'}
          onClose={closeInspector}
        />
      </main>
      <nav className="mobile-actionbar" aria-label="移动端工作区">
        <button
          type="button"
          className={mobileSurface === 'controls' ? 'active' : ''}
          aria-pressed={mobileSurface === 'controls'}
          onClick={() => setMobileSurface('controls')}
        >
          <Atom size={20} />
          <span>态</span>
        </button>
        <button
          type="button"
          className={mobileSurface === 'controls' ? 'active' : ''}
          aria-pressed={mobileSurface === 'controls'}
          onClick={() => setMobileSurface('controls')}
        >
          <SlidersHorizontal size={20} />
          <span>参数</span>
        </button>
        <button
          type="button"
          className={mobileSurface === 'controls' ? 'active' : ''}
          aria-pressed={mobileSurface === 'controls'}
          onClick={() => setMobileSurface('controls')}
        >
          <Eye size={20} />
          <span>显示</span>
        </button>
        <button
          type="button"
          ref={mobileInspectorOpenerRef}
          className={inspectorOpen && mobileSurface === 'inspector' ? 'active' : ''}
          aria-pressed={inspectorOpen && mobileSurface === 'inspector'}
          aria-controls="science-inspector"
          aria-expanded={inspectorOpen && mobileSurface === 'inspector'}
          onClick={(event) => openInspector(event.currentTarget)}
        >
          <ListTree size={20} />
          <span>详情</span>
        </button>
      </nav>
      <StatusChip status={status} />
    </div>
  )
}
