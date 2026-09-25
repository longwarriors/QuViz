/** @vitest-environment jsdom */
import { act, createElement } from 'react'
import { afterEach, describe, expect, it } from 'vitest'

import { serializeDeepLink } from '../state/urlState'
import { mount } from '../test/mount'
import { EmbedBar, embedLabHref } from './EmbedBar'

afterEach(() => {
  window.history.replaceState(null, '', window.location.pathname)
})

const expected = (state: Parameters<typeof serializeDeepLink>[0]): string =>
  `./#${serializeDeepLink(state).replace(/^#/, '')}`

describe('embedLabHref', () => {
  it('opens the same state in the full lab, without the embed flag', () => {
    const state = { mode: 'eigenstate', n: 3, l: 2, m: 2, basis: 'complex' } as const
    const hash = `#${serializeDeepLink({ ...state, embed: true }).replace(/^#/, '')}`
    expect(embedLabHref(hash)).toBe(expected(state))
    expect(embedLabHref(hash)).not.toContain('embed')
  })

  it('opens the lab root when the embed carried nothing else', () => {
    expect(embedLabHref('#embed=1')).toBe('./')
    expect(embedLabHref('')).toBe('./')
  })
})

describe('EmbedBar', () => {
  it('is a new-tab link, marked as chrome, that follows the live hash', async () => {
    window.history.replaceState(null, '', '#embed=1&mode=eigenstate&n=2&l=1&m=0&basis=real')
    const tree = await mount(createElement(EmbedBar))
    try {
      const link = tree.container.querySelector<HTMLAnchorElement>('a.qv-embed-open')
      expect(link?.textContent).toBe('在实验室中打开')
      expect(link?.target).toBe('_blank')
      expect(link?.rel).toBe('noopener')
      expect(link?.hasAttribute('data-chrome')).toBe(true)
      expect(link?.getAttribute('href')).toBe(expected({ mode: 'eigenstate', n: 2, l: 1, m: 0, basis: 'real' }))

      // bindUrlState rewrites the hash whenever the store changes (t is written
      // only while paused, B10); the link reads whatever the hash says now.
      window.history.replaceState(null, '', '#embed=1&mode=eigenstate&n=3&l=0&m=0&basis=real')
      const scope = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
      scope.IS_REACT_ACT_ENVIRONMENT = true
      try {
        await act(async () => link?.focus())
      } finally {
        delete scope.IS_REACT_ACT_ENVIRONMENT
      }
      expect(link?.getAttribute('href')).toBe(expected({ mode: 'eigenstate', n: 3, l: 0, m: 0, basis: 'real' }))
      // Each reach -- pointer, then click -- re-reads the hash on its own.
      window.history.replaceState(null, '', '#embed=1&mode=eigenstate&n=4&l=3&m=-2&basis=complex')
      link?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
      expect(link?.getAttribute('href')).toBe(expected({ mode: 'eigenstate', n: 4, l: 3, m: -2, basis: 'complex' }))
      window.history.replaceState(null, '', '#embed=1&mode=superposition&preset=1s-2pz&rep=slice')
      link?.addEventListener('click', (event) => event.preventDefault(), { once: true })
      link?.click()
      expect(link?.getAttribute('href')).toBe(expected({ mode: 'superposition', preset: '1s-2pz', rep: 'slice' }))
    } finally {
      await tree.unmount()
    }
  })
})
