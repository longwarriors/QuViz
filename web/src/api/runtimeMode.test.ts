import { afterEach, describe, expect, it, vi } from 'vitest'

import { runtimeMode } from './runtimeMode'

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('runtimeMode', () => {
  it('is live in every build mode but pages (vitest itself runs in "test")', () => {
    expect(import.meta.env.MODE).toBe('test')
    expect(runtimeMode()).toBe('live')
  })

  it('is static only for the pages build mode', () => {
    vi.stubEnv('MODE', 'pages')
    expect(runtimeMode()).toBe('static')
  })

  it('does not mistake a production build for the static site', () => {
    vi.stubEnv('MODE', 'production')
    expect(runtimeMode()).toBe('live')
  })
})
