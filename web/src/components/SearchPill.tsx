import { Search, X } from 'lucide-react'
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react'

import { capabilityFor, chargeBound } from '../api/capability'
import { runtimeMode } from '../api/runtimeMode'
import type { OrbitalParameters } from '../api/types'
import { useCatalogs } from '../state/catalogs'
import { useSceneStore } from '../state/useSceneStore'
import { buildSearchEntries, searchEntries, type SearchEntry } from './stateIndex'

/**
 * A state the static catalogue (or the live server) can actually draw, probed
 * at the charge the store will hold once it is applied: chargeBound() is the
 * one source of the static build's exported Z (the live routes ignore Z here).
 */
const drawable = (orbital: OrbitalParameters): boolean =>
  capabilityFor({
    mode: 'eigenstate',
    orbital: { ...orbital, z: chargeBound().min },
    representation: 'point_cloud',
  }).status === 'available'

/**
 * The top-right "查找量子态" pill. Opens into an ARIA 1.2 combobox: the input
 * keeps focus, aria-activedescendant names the active option, Enter applies it,
 * Escape (or focus leaving) closes without changing anything.
 */
export function SearchPill() {
  const { orbitals, superpositions } = useCatalogs()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const listId = useId()
  const pillRef = useRef<HTMLButtonElement | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const restoreFocus = useRef(false)
  const staticBuild = runtimeMode() === 'static'

  const entries = useMemo(
    () =>
      buildSearchEntries({
        presets: orbitals,
        mixtures: superpositions,
        maxN: staticBuild ? 8 : 4,
        isAvailable: drawable,
      }),
    [orbitals, superpositions, staticBuild],
  )
  const results = useMemo(() => searchEntries(entries, query), [entries, query])
  const optionId = (entry: SearchEntry): string => `${listId}-${entry.id}`
  const current = results[Math.min(active, results.length - 1)]

  useEffect(() => {
    if (open) {
      inputRef.current?.focus()
    } else if (restoreFocus.current) {
      restoreFocus.current = false
      pillRef.current?.focus()
    }
  }, [open])

  const close = (returnFocus: boolean): void => {
    restoreFocus.current = returnFocus
    setOpen(false)
    setQuery('')
    setActive(0)
  }

  const apply = (entry: SearchEntry): void => {
    const store = useSceneStore.getState()
    if (entry.mixture !== undefined) {
      const mixture = entry.mixture
      // Record the preset (and A11's published opening picture) first; the
      // mode switch then opens on that picture, not on a refused isosurface.
      store.setSuperposition(
        mixture.terms,
        mixture.label,
        mixture.slice_resolution_floor,
        mixture.streamline_seed_count_max,
        mixture.default_representation,
      )
      useSceneStore.getState().setMode('superposition')
    } else if (entry.orbital !== undefined) {
      store.setMode('eigenstate')
      useSceneStore.getState().applyPreset(entry.orbital)
    }
    close(true)
  }

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    const last = results.length - 1
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault()
        setActive((index) => Math.min(last, index + 1))
        break
      case 'ArrowUp':
        event.preventDefault()
        setActive((index) => Math.max(0, index - 1))
        break
      case 'Home':
        event.preventDefault()
        setActive(0)
        break
      case 'End':
        event.preventDefault()
        setActive(Math.max(0, last))
        break
      case 'Enter':
        event.preventDefault()
        if (current !== undefined) apply(current)
        break
      case 'Escape':
        event.preventDefault()
        close(true)
        break
      default:
        break
    }
  }

  if (!open) {
    return (
      <div className="qv-search" data-chrome="">
        <button
          type="button"
          className="qv-search-pill qv-glass"
          ref={pillRef}
          aria-haspopup="listbox"
          aria-expanded={false}
          onClick={() => setOpen(true)}
        >
          <span className="qv-search-label">查找量子态</span>
          <Search size={18} aria-hidden="true" />
        </button>
      </div>
    )
  }

  return (
    <div
      className="qv-search"
      data-chrome=""
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) close(false)
      }}
    >
      <div className="qv-search-panel qv-glass">
        <div className="qv-search-field">
          <Search size={18} aria-hidden="true" />
          <input
            ref={inputRef}
            role="combobox"
            aria-label="查找量子态"
            aria-expanded={results.length > 0}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={current === undefined ? undefined : optionId(current)}
            placeholder="例如 2p、3d、叠加"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value)
              setActive(0)
            }}
            onKeyDown={onKeyDown}
          />
          <button type="button" className="qv-icon-button" aria-label="关闭查找" onClick={() => close(true)}>
            <X size={16} aria-hidden="true" />
          </button>
        </div>
        <ul id={listId} role="listbox" aria-label="量子态" className="qv-search-list">
          {results.map((entry, index) => (
            <li
              key={entry.id}
              id={optionId(entry)}
              role="option"
              aria-selected={entry === current}
              data-entry={entry.id}
              className="qv-search-option"
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => setActive(index)}
              onClick={() => apply(entry)}
            >
              <span className="qv-option-label">{entry.label}</span>
              {entry.tags.map((tag) => (
                <span key={tag} className="qv-tag">
                  {tag}
                </span>
              ))}
            </li>
          ))}
        </ul>
        {results.length === 0 ? (
          <p className="qv-search-empty" role="status">
            没有匹配的量子态。
          </p>
        ) : null}
      </div>
    </div>
  )
}
