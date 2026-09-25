import { X } from 'lucide-react'
import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'

import { runtimeMode } from '../api/runtimeMode'
import { nextRovingIndex } from './rovingTabs'

export const GUIDE_SEEN_KEY = 'quviz.guide.v1'

export interface GuideChapter {
  title: string
  /** Relative to the Pages site root, where the lab lives; the textbook is at learn/. */
  path: string
}

/**
 * Part C's textbook nav (mkdocs.yml `教材`), in reading order, with the nav
 * titles verbatim. GuideDialog.test.tsx checks each file exists under docs/.
 */
export const TEXTBOOK_CHAPTERS: readonly GuideChapter[] = [
  { title: '0 如何使用本书与实验室', path: 'learn/textbook/00-how-to-use/' },
  { title: '1 波函数与 Born 规则', path: 'learn/textbook/01-wavefunction/' },
  { title: '2 氢原子：量子数与能级', path: 'learn/textbook/02-hydrogen-levels/' },
  { title: '3 径向分布与节点', path: 'learn/textbook/03-radial-nodes/' },
  { title: '4 实轨道与复轨道', path: 'learn/textbook/04-real-complex/' },
  { title: '5 电子云：从概率到采样', path: 'learn/textbook/05-electron-cloud/' },
  { title: '6 等值面：轨道的“形状”', path: 'learn/textbook/06-isosurface/' },
  { title: '7 相位与平面切片', path: 'learn/textbook/07-phase-slices/' },
  { title: '8 概率流', path: 'learn/textbook/08-probability-current/' },
  { title: '9 叠加态与时间演化', path: 'learn/textbook/09-superposition-time/' },
  { title: '10 从密度到实验图样', path: 'learn/textbook/10-experiment/' },
  { title: '11 对称性与杂化', path: 'learn/textbook/11-symmetry-hybridization/' },
  { title: '附录 A 常见误区', path: 'learn/textbook/appendix-a-misconceptions/' },
  { title: '附录 B 符号与单位', path: 'learn/textbook/appendix-b-notation-units/' },
]

function storage(): Storage | null {
  try {
    return globalThis.localStorage ?? null
  } catch {
    return null
  }
}

export function guideSeen(): boolean {
  try {
    return storage()?.getItem(GUIDE_SEEN_KEY) === 'seen'
  } catch {
    return false
  }
}

export function markGuideSeen(): void {
  try {
    storage()?.setItem(GUIDE_SEEN_KEY, 'seen')
  } catch {
    // Storage refused (private mode, policy): the guide may open again next visit.
  }
}

/** Auto-open on a first visit without a deep link; a deep link means "show me this state". */
export function shouldAutoOpenGuide(hash: string): boolean {
  return hash.replace(/^#/, '') === '' && !guideSeen()
}

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]'

/** Tab stops inside `root`: focusable, not hidden, not a roving tabindex -1. */
export function focusableWithin(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (element) => element.tabIndex >= 0 && element.closest('[hidden]') === null,
  )
}

type GuideTab = 'overview' | 'reading' | 'chapters'

const GUIDE_TABS: readonly { id: GuideTab; label: string }[] = [
  { id: 'overview', label: '概览' },
  { id: 'reading', label: '读图指南' },
  { id: 'chapters', label: '教材章节' },
]

function OverviewGuide() {
  const staticBuild = runtimeMode() === 'static'
  return (
    <>
      <p>
        QuViz 把氢样原子的量子态画成可以旋转、切片和播放的三维场景。<strong>说的 = 画的</strong>：
        每一种颜色、每一个数字都来自 Python 计算核心（或它预先导出的目录），浏览器只负责绘制。
      </p>
      <h3>当前模式</h3>
      <p>
        {staticBuild
          ? '教学预览：所有场景来自预计算目录；未预计算的组合会如实标注“未预计算”。本地运行 quviz serve 可实时计算任意参数。'
          : '实时计算：每个场景都由本地 FastAPI 服务按需计算。'}
      </p>
      <h3>怎么用</h3>
      <ul>
        <li><strong>左侧“控制”</strong>：选择本征态或叠加态、表示法与显示选项；可收起为“调节”按钮。</li>
        <li><strong>底部时间胶囊</strong>：叠加态可播放、逐帧步进，或拖动一个周期内的帧。</li>
        <li><strong>右侧“科学详情”</strong>：概览、图表（径向分布、能级、叠加系数）、场景契约与引用。</li>
        <li><strong>右上“查找量子态”</strong>：输入 2p、3d 或“叠加”即可跳转。</li>
        <li><strong>复制链接</strong>会把当前状态写进网址，发给别人就能打开同一幅图。</li>
      </ul>
      <p className="qv-dialog-meta">QuViz 0.1.0 · 坐标约定：z 轴朝上，左下角为坐标指示。</p>
    </>
  )
}

function ReadingGuide() {
  return (
    <>
      <h3>电子云</h3>
      <p>每个点按 |ψ|² d³r 独立采样，视觉权重相同；点的颜色是波函数的相位 arg ψ，不是电荷。</p>
      <h3>等值面</h3>
      <p>曲面包围指定的概率质量（默认 90%），是 |ψ|² 的一个等值面，不是“电子的边界”；颜色同样表示相位。</p>
      <h3>平面切片</h3>
      <p>
        在过原子核的主平面上采样一个标量场：|ψ|²（亮度 ∝ |ψ|/max|ψ|）、Re ψ / Im ψ（青—灰—红，按平面最大值归一化）
        或 arg ψ（色轮）。相位切片中的透明像素是振幅太小、相位无定义的区域，不是节点。
      </p>
      <h3>概率流线</h3>
      <p>j/ρ 的流线，颜色表示速率（色带按 √(速率 ÷ 最大值) 排布）。它们是概率流，不是电子轨迹。</p>
      <h3>时间演化</h3>
      <p>本征态的 |ψ|² 不随时间变化；能量不同的本征态叠加会以拍周期 T = 2π/ΔE 振荡，能量相同则不动。</p>
      <h3>图例与 Bloom</h3>
      <p>右下角图例与渲染器逐字节核对；把 Bloom 调到大于 0 后，屏幕颜色不再与图例完全一致。</p>
    </>
  )
}

function ChaptersGuide() {
  if (runtimeMode() !== 'static') {
    return (
      <>
        <p>
          教材随 GitHub Pages 版本发布。在本地阅读：运行{' '}
          <code>uv run --group docs mkdocs serve -a 127.0.0.1:8001</code>，然后打开 http://127.0.0.1:8001/。
        </p>
        <ol className="qv-chapter-list">
          {TEXTBOOK_CHAPTERS.map((chapter) => (
            <li key={chapter.path}>{chapter.title}</li>
          ))}
        </ol>
      </>
    )
  }
  return (
    <>
      <p>按学习顺序排列；每章都有可交互的嵌入图，并能一键在实验室中打开。</p>
      <ol className="qv-chapter-list">
        {TEXTBOOK_CHAPTERS.map((chapter) => (
          <li key={chapter.path}>
            <a href={`./${chapter.path}`}>{chapter.title}</a>
          </li>
        ))}
      </ol>
    </>
  )
}

/**
 * The in-app guide: the lab's "About" modal, with its textbook entry points.
 * The first role=dialog in the app: aria-modal, focus moved in and trapped,
 * Escape closes (and does not reach the page's own Escape handler), focus
 * returns to where it was.
 */
export function GuideDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [tab, setTab] = useState<GuideTab>('overview')
  const dialogRef = useRef<HTMLDivElement | null>(null)
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([])
  const titleId = useId()
  const baseId = useId()

  useEffect(() => {
    if (!open) return undefined
    markGuideSeen()
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    dialogRef.current?.querySelector<HTMLElement>('[role="tab"][tabindex="0"]')?.focus()
    return () => previous?.focus()
  }, [open])

  if (!open) return null

  const tabId = (id: GuideTab): string => `${baseId}-${id}-tab`
  const panelId = (id: GuideTab): string => `${baseId}-${id}-panel`

  const onDialogKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      onClose()
      return
    }
    if (event.key !== 'Tab' || dialogRef.current === null) return
    const items = focusableWithin(dialogRef.current)
    if (items.length === 0) return
    const first = items[0]
    const last = items[items.length - 1]
    const active = document.activeElement
    if (event.shiftKey && (active === first || !dialogRef.current.contains(active))) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && (active === last || !dialogRef.current.contains(active))) {
      event.preventDefault()
      first.focus()
    }
  }

  const onTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number): void => {
    const next = nextRovingIndex(event.key, index, GUIDE_TABS.length)
    if (next === undefined) return
    event.preventDefault()
    setTab(GUIDE_TABS[next].id)
    tabRefs.current[next]?.focus()
  }

  return (
    <div
      className="qv-dialog-backdrop"
      data-chrome=""
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        className="qv-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        ref={dialogRef}
        onKeyDown={onDialogKeyDown}
      >
        <div className="qv-dialog-head">
          <h2 id={titleId}>关于 QuViz 实验室</h2>
          <button type="button" className="qv-icon-button qv-dialog-close" aria-label="关闭指南" onClick={onClose}>
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        <div className="qv-tabs" role="tablist" aria-label="指南视图">
          {GUIDE_TABS.map((entry, index) => (
            <button
              type="button"
              role="tab"
              key={entry.id}
              id={tabId(entry.id)}
              ref={(node) => {
                tabRefs.current[index] = node
              }}
              aria-selected={tab === entry.id}
              aria-controls={panelId(entry.id)}
              tabIndex={tab === entry.id ? 0 : -1}
              onClick={() => setTab(entry.id)}
              onKeyDown={(event) => onTabKeyDown(event, index)}
            >
              {entry.label}
            </button>
          ))}
        </div>
        <div className="qv-dialog-body">
          <section role="tabpanel" id={panelId('overview')} aria-labelledby={tabId('overview')} hidden={tab !== 'overview'}>
            <OverviewGuide />
          </section>
          <section role="tabpanel" id={panelId('reading')} aria-labelledby={tabId('reading')} hidden={tab !== 'reading'}>
            <ReadingGuide />
          </section>
          <section role="tabpanel" id={panelId('chapters')} aria-labelledby={tabId('chapters')} hidden={tab !== 'chapters'}>
            <ChaptersGuide />
          </section>
        </div>
      </div>
    </div>
  )
}
