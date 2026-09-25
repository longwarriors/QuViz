/** @vitest-environment jsdom */
import { act, createElement } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { mount } from '../test/mount'
import { COMPACT_WORKSPACE_QUERY, MOBILE_QUERY, useMediaQuery } from './useMediaQuery'

afterEach(() => vi.unstubAllGlobals())

let seen: boolean[] = []
function Probe({ query }: { query: string }) {
  seen.push(useMediaQuery(query))
  return null
}

describe('useMediaQuery', () => {
  it('names the two layout breakpoints', () => {
    expect(COMPACT_WORKSPACE_QUERY).toBe('(max-width: 1180px)')
    expect(MOBILE_QUERY).toBe('(max-width: 820px)')
  })

  it('is false where the platform cannot be asked', async () => {
    seen = []
    vi.stubGlobal('matchMedia', undefined)
    const tree = await mount(createElement(Probe, { query: MOBILE_QUERY }))
    expect(seen.at(-1)).toBe(false)
    await tree.unmount()
  })

  it('follows the query live and stops listening on unmount', async () => {
    seen = []
    const listeners = new Set<(event: MediaQueryListEvent) => void>()
    const list = {
      matches: true,
      addEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => listeners.add(listener),
      removeEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => listeners.delete(listener),
    }
    const asked: string[] = []
    vi.stubGlobal('matchMedia', (query: string) => {
      asked.push(query)
      return list
    })
    const tree = await mount(createElement(Probe, { query: MOBILE_QUERY }))
    expect(asked).toContain(MOBILE_QUERY)
    expect(seen.at(-1)).toBe(true)
    const scope = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    scope.IS_REACT_ACT_ENVIRONMENT = true
    try {
      await act(async () => {
        for (const listener of [...listeners]) listener({ matches: false } as MediaQueryListEvent)
      })
    } finally {
      delete scope.IS_REACT_ACT_ENVIRONMENT
    }
    expect(seen.at(-1)).toBe(false)
    await tree.unmount()
    expect(listeners.size).toBe(0)
  })
})
