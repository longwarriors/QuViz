import { useEffect } from 'react'
import { create } from 'zustand'

import { fetchCatalog, fetchSuperpositionCatalog } from '../api/client'
import type { OrbitalPreset, SuperpositionPreset } from '../api/types'
import { useSceneStore } from './useSceneStore'

export type CatalogStatus = 'idle' | 'loading' | 'ready' | 'error'

export interface CatalogState {
  orbitals: readonly OrbitalPreset[]
  superpositions: readonly SuperpositionPreset[]
  orbitalStatus: CatalogStatus
  superpositionStatus: CatalogStatus
}

const EMPTY: CatalogState = {
  orbitals: [],
  superpositions: [],
  orbitalStatus: 'idle',
  superpositionStatus: 'idle',
}

/** The two server catalogues, loaded once per page for every component that needs them. */
export const useCatalogStore = create<CatalogState>()(() => EMPTY)

let inFlight: AbortController | null = null

/**
 * The selected mixture's builder-derived capabilities, or a fail-closed
 * invalidation when the catalogue does not list it -- exactly what
 * ControlPanel.tsx did inline before this module existed.
 */
function syncSelectedMixture(catalogue: readonly SuperpositionPreset[]): void {
  const scene = useSceneStore.getState()
  const selected = catalogue.find((mixture) => mixture.terms === scene.superpositionTerms)
  if (selected === undefined) {
    scene.invalidateSuperpositionStreamlineCapability()
    return
  }
  // The fourth argument is A11's 2s-2pz fix: the preset's server-probed
  // opening picture. Dropping it would silently reopen 2s-2pz on a refused
  // isosurface.
  scene.syncSuperpositionCapabilities(
    selected.terms,
    selected.slice_resolution_floor,
    selected.streamline_seed_count_max,
    selected.default_representation,
  )
}

/**
 * Start the catalogue load unless it has already started. Idempotent: the
 * visual harness counts catalogue responses, so a page asks exactly once.
 */
export function ensureCatalogsLoaded(): void {
  if (inFlight !== null) return
  const controller = new AbortController()
  inFlight = controller
  useCatalogStore.setState({ orbitalStatus: 'loading', superpositionStatus: 'loading' })

  fetchCatalog(controller.signal).then(
    (orbitals) => {
      if (!controller.signal.aborted) useCatalogStore.setState({ orbitals, orbitalStatus: 'ready' })
    },
    () => {
      if (!controller.signal.aborted) {
        useCatalogStore.setState({ orbitals: [], orbitalStatus: 'error' })
      }
    },
  )

  fetchSuperpositionCatalog(controller.signal).then(
    (superpositions) => {
      if (controller.signal.aborted) return
      useCatalogStore.setState({ superpositions, superpositionStatus: 'ready' })
      syncSelectedMixture(superpositions)
    },
    () => {
      if (controller.signal.aborted) return
      useCatalogStore.setState({ superpositions: [], superpositionStatus: 'error' })
      useSceneStore.getState().invalidateSuperpositionStreamlineCapability()
    },
  )
}

/** Abort anything in flight and forget the catalogues (a fresh page, or a test). */
export function resetCatalogs(): void {
  inFlight?.abort()
  inFlight = null
  useCatalogStore.setState(EMPTY, true)
}

/** The catalogues, with the load started on first use. */
export function useCatalogs(): CatalogState {
  useEffect(() => {
    ensureCatalogsLoaded()
  }, [])
  return useCatalogStore()
}
