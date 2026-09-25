/**
 * Which data layer this bundle was built for.
 *
 * Decided at build time by Vite's mode: `npm run build:pages` builds with
 * `--mode pages`, and only that bundle answers from the precomputed static
 * catalogue. Every other build -- `npm run build` for `quviz serve`, the dev
 * server, vitest -- talks to the live API. A runtime probe ("is there a
 * manifest?") was rejected: a live server that happened to serve a stale
 * data/manifest.json would silently switch a local user to precomputed answers.
 */
export type RuntimeMode = 'live' | 'static'

export function runtimeMode(): RuntimeMode {
  return import.meta.env.MODE === 'pages' ? 'static' : 'live'
}
