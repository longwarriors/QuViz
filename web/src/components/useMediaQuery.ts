import { useEffect, useState } from 'react'

/** Where the detail panel stops being a permanent rail. */
export const COMPACT_WORKSPACE_QUERY = '(max-width: 1180px)'
/** Where panels become bottom drawers. */
export const MOBILE_QUERY = '(max-width: 820px)'

function listFor(query: string): MediaQueryList | null {
  if (typeof globalThis.matchMedia !== 'function') return null
  return globalThis.matchMedia(query)
}

/**
 * A media query, LIVE. CSS decides the geometry at a breakpoint and this hook
 * lets JavaScript own what is open there; subscribing keeps the two aligned
 * when a window is resized or zoom crosses the breakpoint.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => listFor(query)?.matches === true)
  useEffect(() => {
    const list = listFor(query)
    if (list === null) return undefined
    const onChange = (event: MediaQueryListEvent): void => setMatches(event.matches)
    list.addEventListener('change', onChange)
    setMatches(list.matches)
    return () => list.removeEventListener('change', onChange)
  }, [query])
  return matches
}
