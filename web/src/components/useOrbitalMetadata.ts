import { useEffect, useMemo, useState } from 'react'

import { fetchOrbitalMetadata } from '../api/client'
import type { OrbitalMetadata, OrbitalParameters } from '../api/types'

export type MetadataStatus = 'idle' | 'loading' | 'ready' | 'error'

export interface OrbitalMetadataState {
  status: MetadataStatus
  metadata?: OrbitalMetadata
  error?: string
}

/** Every field the metadata request carries, joined. */
export function orbitalKey(orbital: OrbitalParameters | null): string | null {
  return orbital === null
    ? null
    : `${orbital.n}|${orbital.l}|${orbital.m}|${orbital.z}|${orbital.basis}`
}

/** Does this metadata describe exactly this state? */
export function describes(
  metadata: OrbitalMetadata | undefined,
  orbital: OrbitalParameters | null,
): boolean {
  if (metadata === undefined || orbital === null) return false
  const { state } = metadata
  return (
    state.n === orbital.n &&
    state.l === orbital.l &&
    state.m === orbital.m &&
    state.z === orbital.z &&
    state.basis === orbital.basis
  )
}

/**
 * An eigenstate's metadata with its radial profile, for the charts.
 *
 * No request when `preloaded` (the arrived scene's metadata) already carries a
 * profile for the same state -- the common case, since every eigenstate payload
 * embeds it. Otherwise one request per state, through the active transport
 * (live /api or the static catalogue), aborted when the state changes or the
 * chart goes away.
 */
export function useOrbitalMetadata(
  orbital: OrbitalParameters | null,
  preloaded?: OrbitalMetadata,
): OrbitalMetadataState {
  const key = orbitalKey(orbital)
  const usable =
    describes(preloaded, orbital) &&
    preloaded?.radial_profile !== undefined &&
    preloaded.radial_profile !== null
  // The object identity changes every render; the key is what the request depends on.
  const request = useMemo(() => orbital, [key]) // eslint-disable-line react-hooks/exhaustive-deps
  const [fetched, setFetched] = useState<{ key: string; state: OrbitalMetadataState } | null>(null)

  useEffect(() => {
    if (key === null || request === null || usable) return undefined
    const controller = new AbortController()
    setFetched({ key, state: { status: 'loading' } })
    fetchOrbitalMetadata(request, controller.signal).then(
      (metadata) => {
        if (!controller.signal.aborted) setFetched({ key, state: { status: 'ready', metadata } })
      },
      (error: unknown) => {
        if (!controller.signal.aborted) {
          setFetched({
            key,
            state: { status: 'error', error: error instanceof Error ? error.message : String(error) },
          })
        }
      },
    )
    return () => controller.abort()
  }, [key, request, usable])

  if (key === null) return { status: 'idle' }
  if (usable) return { status: 'ready', metadata: preloaded }
  if (fetched === null || fetched.key !== key) return { status: 'loading' }
  return fetched.state
}
