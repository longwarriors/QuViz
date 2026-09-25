import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import { MIXTURE_COPY } from './stateIndex'

describe('MIXTURE_COPY', () => {
  it('names every preset the server catalogue publishes', () => {
    // The committed catalogue fixture is the server's own response bytes
    // (tests/fixtures/visual/, rebuilt by tests/test_visual_fixtures.py).
    const catalogue = JSON.parse(
      readFileSync(new URL('../../../tests/fixtures/visual/catalog-superposition.json', import.meta.url), 'utf-8'),
    ) as { id: string }[]
    for (const { id } of catalogue) {
      expect(MIXTURE_COPY[id]?.label, id).toBeTruthy()
      expect(MIXTURE_COPY[id]?.note, id).toBeTruthy()
    }
  })
})
