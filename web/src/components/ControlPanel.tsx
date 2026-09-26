import { Atom, Layers3, RotateCcw, SlidersHorizontal, X, type LucideIcon } from 'lucide-react'
import { useRef, useState } from 'react'

import { useCatalogs } from '../state/catalogs'
import { useSceneStore } from '../state/useSceneStore'
import { ControlGroup } from './controls/ControlGroup'
import { DisplaySection } from './controls/DisplaySection'
import { RepresentationSection } from './controls/RepresentationSection'
import { StateSection } from './controls/StateSection'

export type ControlGroupId = 'state' | 'representation' | 'display'

const GROUPS: readonly { id: ControlGroupId; label: string; icon: LucideIcon }[] = [
  { id: 'state', label: '量子态', icon: Atom },
  { id: 'representation', label: '表示法', icon: Layers3 },
  { id: 'display', label: '显示', icon: SlidersHorizontal },
]

export interface ControlPanelProps {
  /** Expanded panel, or the single round "调节" button. Uncontrolled default: open. */
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

/**
 * The floating "控制" panel. `nav[aria-label=控制上下文]` survives from the old
 * context rail: its three buttons reveal (expand and scroll to) their group.
 */
export function ControlPanel({ open: controlledOpen, onOpenChange }: ControlPanelProps) {
  const [localOpen, setLocalOpen] = useState(true)
  const open = controlledOpen ?? localOpen
  const setOpen = onOpenChange ?? setLocalOpen
  const [expanded, setExpanded] = useState<Record<ControlGroupId, boolean>>({
    state: true,
    representation: true,
    display: false,
  })
  const [active, setActive] = useState<ControlGroupId>('state')
  const sections = useRef<Partial<Record<ControlGroupId, HTMLElement | null>>>({})
  const applyPreset = useSceneStore((state) => state.applyPreset)
  // The panel alone (tests, and pages without the App shell) still loads the catalogues.
  useCatalogs()

  if (!open) {
    return (
      <button
        type="button"
        className="qv-controls-fab qv-glass"
        data-chrome=""
        data-action="open-controls"
        aria-label="调节"
        title="展开控制面板"
        onClick={() => setOpen(true)}
      >
        <SlidersHorizontal size={22} aria-hidden="true" />
      </button>
    )
  }

  const reveal = (id: ControlGroupId): void => {
    setActive(id)
    setExpanded((current) => ({ ...current, [id]: true }))
    sections.current[id]?.scrollIntoView?.({ block: 'nearest' })
  }
  const toggle = (id: ControlGroupId): void => {
    setActive(id)
    setExpanded((current) => ({ ...current, [id]: !current[id] }))
  }

  return (
    <aside className="qv-controls qv-glass" data-chrome="" aria-label="控制面板">
      <div className="qv-controls-head">
        <h2>控制</h2>
        <button
          type="button"
          className="qv-icon-button"
          data-action="collapse-controls"
          aria-label="收起控制面板"
          title="收起为“调节”按钮"
          onClick={() => setOpen(false)}
        >
          <X size={18} aria-hidden="true" />
        </button>
      </div>
      <nav className="qv-context-nav" aria-label="控制上下文">
        {GROUPS.map(({ id, label }) => (
          <button type="button" key={id} aria-pressed={active === id} onClick={() => reveal(id)}>
            {label}
          </button>
        ))}
      </nav>
      <div className="qv-controls-body">
        {GROUPS.map(({ id, label, icon }) => (
          <ControlGroup
            key={id}
            id={id}
            title={label}
            icon={icon}
            expanded={expanded[id]}
            onToggle={() => toggle(id)}
            sectionRef={(node) => {
              sections.current[id] = node
            }}
            actions={
              id === 'state' ? (
                <button
                  type="button"
                  className="qv-icon-button"
                  data-action="reset-state"
                  aria-label="恢复 2p_z 默认值"
                  title="恢复 2p_z 默认值"
                  onClick={() => applyPreset({ n: 2, l: 1, m: 0, z: 1, basis: 'real' })}
                >
                  <RotateCcw size={16} aria-hidden="true" />
                </button>
              ) : undefined
            }
          >
            {id === 'state' ? (
              <StateSection />
            ) : id === 'representation' ? (
              <RepresentationSection onActivate={() => setActive('representation')} />
            ) : (
              <DisplaySection />
            )}
          </ControlGroup>
        ))}
      </div>
    </aside>
  )
}
