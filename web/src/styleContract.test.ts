import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

const read = (relative: string): string =>
  readFileSync(new URL(relative, import.meta.url), 'utf-8')

/**
 * lab.css with comments stripped, so prose (e.g. the file-level header
 * comment) can never satisfy or defeat a regex assertion below. Every
 * lab.css-matching assertion in this file reads through this helper.
 */
const labCss = (): string => read('./lab.css').replace(/\/\*[\s\S]*?\*\//g, '')

/**
 * Spec §4.4's token table, transcribed once. lab.css is the only place these
 * values are written; this list is the review copy the design is held to.
 */
const SPEC_TOKENS: Readonly<Record<string, string>> = {
  '--qv-bg': '#0e0f11',
  '--qv-glass': 'rgba(0,0,0,.6)',
  '--qv-glass-strong': 'rgba(16,17,20,.86)',
  '--qv-border': 'rgba(255,255,255,.15)',
  '--qv-border-strong': 'rgba(255,255,255,.3)',
  '--qv-glow': '0 0 12px rgba(100,160,255,.2)',
  '--qv-blur': 'blur(16px)',
  '--qv-radius-panel': '24px',
  '--qv-radius-pill': '100px',
  '--qv-radius-tag': '4px',
  '--qv-text': '#fff',
  '--qv-text-2': 'rgba(255,255,255,.62)',
  '--qv-text-3': 'rgba(255,255,255,.4)',
  '--qv-band': 'rgba(255,255,255,.045)',
  '--qv-accent': '#8ab4f8',
  '--qv-accent-strong': '#1a73e8',
  '--qv-ok': '#81c995',
  '--qv-warn': '#fdd663',
  '--qv-danger': '#f28b82',
  '--qv-font':
    '"Google Sans Flex", system-ui, "PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC", sans-serif',
}

/** The declarations of the FIRST `:root` block (media-query overrides come later). */
export function declaredTokens(css: string): Map<string, string> {
  const root = /:root\s*\{([^}]*)\}/.exec(css)
  if (root === null) throw new Error('lab.css has no :root block')
  return new Map(
    [...root[1].matchAll(/(--qv-[a-z0-9-]+)\s*:\s*([^;]+);/g)].map((match) => [
      match[1],
      match[2].trim(),
    ]),
  )
}

describe('lab.css design tokens', () => {
  it('declares every spec token with the spec value', () => {
    const tokens = declaredTokens(labCss())
    for (const [name, value] of Object.entries(SPEC_TOKENS)) {
      expect(tokens.get(name), name).toBe(value)
    }
  })

  it('sets tabular numerals on the root, so readouts do not jitter', () => {
    expect(labCss()).toMatch(/:root\s*\{[^}]*font-variant-numeric:\s*tabular-nums/)
  })

  it('draws one visible focus ring in the accent colour', () => {
    expect(labCss()).toMatch(/:focus-visible\s*\{[^}]*outline:\s*2px solid var\(--qv-accent\)/)
  })

  it('honours prefers-reduced-motion for every transition and animation', () => {
    expect(labCss()).toMatch(
      /@media \(prefers-reduced-motion: reduce\)\s*\{[^@]*animation-duration:\s*0\.01ms !important/,
    )
  })

  it('never re-shows a descendant of hidden chrome', () => {
    // e2e/slice.spec.ts hides [data-chrome] with inline visibility:hidden;
    // an explicit visibility:visible below it would leak into a screenshot.
    // Comments are stripped first so the file's own prose warning about this
    // rule (which necessarily contains the phrase) cannot trip the check.
    expect(labCss()).not.toMatch(/visibility:\s*visible/)
  })

  it('keeps the hidden attribute hiding elements that carry a display rule', () => {
    // The user-agent `[hidden] { display: none }` loses to any author display
    // rule, so a folded `.qv-group-body` (display: grid) stayed on screen while
    // its header announced aria-expanded="false". jsdom computes no stylesheet,
    // so the component specs that assert `hidden` cannot see this; the global
    // override is what makes every `hidden={...}` in the lab actually hide.
    expect(labCss()).toMatch(/(?:^|\})\s*\[hidden\]\s*\{\s*display:\s*none\s*!important;?\s*\}/)
  })

  it('paints the page with the scene background, so the canvas has no seam', async () => {
    const { SCENE_BACKGROUND } = await import('./scene/fog')
    expect(declaredTokens(read('./lab.css')).get('--qv-bg')).toBe(SCENE_BACKGROUND)
  })

  it('keeps styles.css to the byte-checked data colours, with the old visual system gone', () => {
    const data = read('./styles.css')
    expect(data).not.toMatch(/:root|\.app-shell|\.workspace|\.topbar|\.viewport-copy|font-family/)
    for (const selector of ['.phase-wheel', '.phase-dot.red', '.phase-dot.cyan', '.diverging-ramp', '.density-ramp', '.speed-ramp']) {
      expect(data).toContain(selector)
    }
    expect(existsSync(new URL('./quantum-observatory.css', import.meta.url))).toBe(false)
    expect(read('./main.tsx')).not.toContain('quantum-observatory')
  })
})

describe('legend placement does not collide with other chrome', () => {
  it('gates the compact embed legend to >=821px, so it cannot stretch full-height at mobile widths', () => {
    // Unconditional, the embed rule's higher specificity beat the <=820px
    // mobile rule's `bottom: auto` on `right`/`bottom`/`width` but left `top`
    // untouched, so the mobile rule's `top: calc(...)` still applied: a
    // fixed-position box with both `top` and `bottom` set and `height: auto`
    // stretches to fill the gap between them. Gating this rule to >=821px
    // means <=820px has no embed-specific override at all, and the plain
    // (top-anchored) mobile `.legend` rule applies uniformly.
    expect(labCss()).toMatch(
      /@media \(min-width: 821px\)\s*\{\s*\.qv-app\[data-embed="true"\] \.legend \{ right: 12px; bottom: 12px; width: 240px; \}\s*\}/,
    )
  })

  it('narrows the time pill and the legend so they cannot overlap from 821 to 1091px', () => {
    // Both are `position: fixed; bottom: ...px; z-index: 10`. The pill is
    // centred at width min(500px, 100vw-32px) and the legend is right-anchored
    // at 280px (240px embed): they overlap horizontally whenever the
    // viewport is narrower than 1092px, down to 821px where the mobile
    // block below takes over. This band must narrow both so neither reaches
    // into the other's column.
    const css = labCss()
    const start = css.indexOf('@media (min-width: 821px) and (max-width: 1091px)')
    expect(start, 'the 821-1091px band must exist').toBeGreaterThan(-1)
    const nextMedia = css.indexOf('@media', start + 1)
    const band = css.slice(start, nextMedia === -1 ? undefined : nextMedia)
    expect(band).toContain('.qv-time-pill { width: min(320px, calc(100vw - 2 * var(--qv-edge))); }')
    expect(band).toContain('.legend { width: 200px; }')
    expect(band).toContain('.qv-app[data-embed="true"] .legend { width: 180px; }')
  })
})

describe('self-hosted Google Sans Flex', () => {
  const FONT_DIRECTORY = new URL('../public/fonts/', import.meta.url)

  /** @fontsource-variable/google-sans-flex@5.3.1, SHA-256 of the files as published. */
  const PINNED_SHA256: Readonly<Record<string, string>> = {
    'google-sans-flex-latin-wght-normal.woff2':
      '4f2ce47af77a0bb9ec3dbd2e81bab7eb97fbcfcd94e47fa63510bb4271b09113',
    'google-sans-flex-math-wght-normal.woff2':
      'f266d6cc9d343ae3da3de6ee68a772a76a27277ba864a1a07f8bc7ec4bcfd68d',
    'OFL.txt': '7168a081fbcea8dbe975e3a015c4e340761b3b4ddf8de0c8a818543f773a29e0',
  }

  it('ships the pinned OFL font bytes and their licence', () => {
    for (const [name, digest] of Object.entries(PINNED_SHA256)) {
      const bytes = readFileSync(new URL(name, FONT_DIRECTORY))
      expect(createHash('sha256').update(bytes).digest('hex'), name).toBe(digest)
    }
    expect(readFileSync(new URL('OFL.txt', FONT_DIRECTORY), 'utf-8')).toContain(
      'SIL OPEN FONT LICENSE Version 1.1',
    )
  })

  it('references only the two shipped files, relative to its own location', () => {
    const css = readFileSync(new URL('google-sans-flex.css', FONT_DIRECTORY), 'utf-8')
    const files = [...css.matchAll(/url\('\.\/([^']+)'\)/g)].map((match) => match[1])
    expect(new Set(files)).toEqual(
      new Set([
        'google-sans-flex-latin-wght-normal.woff2',
        'google-sans-flex-math-wght-normal.woff2',
      ]),
    )
    for (const file of files) {
      expect(existsSync(new URL(file, FONT_DIRECTORY)), file).toBe(true)
    }
    expect(css).toContain("font-family: 'Google Sans Flex'")
  })

  it('is linked from index.html, imported by main.tsx, and nothing loads from a font CDN', () => {
    const html = read('../index.html')
    expect(html).toContain('<link rel="stylesheet" href="/fonts/google-sans-flex.css" />')
    expect(html).not.toMatch(/fonts\.googleapis|fonts\.gstatic/)
    expect(read('./main.tsx')).toContain("import './lab.css'")
  })
})
