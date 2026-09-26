import { BookOpen, Braces, CircleHelp, Download, GitBranch, Link2, Orbit } from 'lucide-react'
import { useEffect, useState } from 'react'

import { runtimeMode } from '../api/runtimeMode'
import { captureSceneCanvas } from './sceneCapture'

export const REPOSITORY_URL = 'https://github.com/longwarriors/QuViz'
/** How long a confirmation toast stays up. */
export const TOAST_MS = 2400

/**
 * The 56 px glass header: brand, runtime pill, icon actions. No state read-out
 * -- the detail panel's title names the state on screen.
 */
export function Header({ onOpenGuide }: { onOpenGuide?: () => void }) {
  const mode = runtimeMode()
  const [toast, setToast] = useState<string | null>(null)

  useEffect(() => {
    if (toast === null) return undefined
    const timer = window.setTimeout(() => setToast(null), TOAST_MS)
    return () => window.clearTimeout(timer)
  }, [toast])

  const copyLink = async (): Promise<void> => {
    try {
      // The URL hash carries the whole state (Part B's bindUrlState).
      await navigator.clipboard.writeText(window.location.href)
      setToast('链接已复制')
    } catch {
      setToast('无法写入剪贴板，请手动复制地址栏')
    }
  }

  const saveImage = (): void => {
    setToast(captureSceneCanvas() ? '图像已保存' : '画布尚未就绪，无法保存')
  }

  return (
    <header className="qv-header" data-chrome="">
      <div className="qv-brand">
        <span className="qv-brand-mark" aria-hidden="true">
          <Orbit size={20} strokeWidth={1.6} />
        </span>
        <span className="qv-brand-name">QuViz</span>
        <span className="qv-pill-tag" data-runtime={mode}>
          {mode === 'static' ? '教学预览' : '实时计算'}
        </span>
      </div>
      <nav className="qv-header-actions" aria-label="页面操作">
        {mode === 'static' ? (
          <a className="qv-icon-button" href="./learn/" aria-label="教材" title="打开教材">
            <BookOpen size={18} aria-hidden="true" />
            <span className="qv-icon-label">教材</span>
          </a>
        ) : (
          <a
            className="qv-icon-button"
            href="/docs"
            target="_blank"
            rel="noreferrer"
            aria-label="查看 OpenAPI"
            title="查看 OpenAPI"
          >
            <Braces size={18} aria-hidden="true" />
            <span className="qv-icon-label">OpenAPI</span>
          </a>
        )}
        <button
          type="button"
          className="qv-icon-button"
          data-action="copy-link"
          aria-label="复制链接"
          title="复制当前状态的链接"
          onClick={() => void copyLink()}
        >
          <Link2 size={18} aria-hidden="true" />
        </button>
        <button
          type="button"
          className="qv-icon-button"
          data-action="save-image"
          aria-label="保存图像"
          title="保存当前画布为 PNG"
          onClick={saveImage}
        >
          <Download size={18} aria-hidden="true" />
        </button>
        {onOpenGuide === undefined ? null : (
          <button
            type="button"
            className="qv-icon-button"
            data-action="open-guide"
            aria-label="指南"
            title="打开使用指南"
            onClick={onOpenGuide}
          >
            <CircleHelp size={18} aria-hidden="true" />
          </button>
        )}
        <a
          className="qv-icon-button"
          href={REPOSITORY_URL}
          target="_blank"
          rel="noreferrer"
          aria-label="GitHub 仓库"
          title="在 GitHub 查看源代码"
        >
          <GitBranch size={18} aria-hidden="true" />
        </a>
      </nav>
      {toast === null ? null : (
        <p className="qv-toast qv-glass-strong" role="status" data-chrome="">
          {toast}
        </p>
      )}
    </header>
  )
}
