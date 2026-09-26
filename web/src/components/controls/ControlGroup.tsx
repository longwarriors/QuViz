import { ChevronDown, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

/**
 * One group of the control panel: icon + bold title + chevron header, a band
 * of rows below it. A folded group keeps its content in the DOM (`hidden`), so
 * explanations and state survive folding.
 */
export function ControlGroup({
  id,
  title,
  icon: Icon,
  expanded,
  onToggle,
  actions,
  sectionRef,
  children,
}: {
  id: string
  title: string
  icon: LucideIcon
  expanded: boolean
  onToggle: () => void
  actions?: ReactNode
  sectionRef?: (node: HTMLElement | null) => void
  children: ReactNode
}) {
  const bodyId = `qv-group-${id}`
  return (
    <section className="qv-group" data-group={id} ref={sectionRef}>
      <div className="qv-group-header">
        <button
          type="button"
          className="qv-group-head"
          aria-expanded={expanded}
          aria-controls={bodyId}
          onClick={onToggle}
        >
          <span className="qv-group-icon" aria-hidden="true">
            <Icon size={16} />
          </span>
          <span className="qv-group-title">{title}</span>
          <ChevronDown className="qv-group-chevron" size={18} aria-hidden="true" />
        </button>
        {actions}
      </div>
      <div className="qv-group-body" id={bodyId} hidden={!expanded}>
        {children}
      </div>
    </section>
  )
}
