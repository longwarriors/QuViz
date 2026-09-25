import { ExternalLink } from 'lucide-react'
import type { SyntheticEvent } from 'react'

import { parseDeepLink, serializeDeepLink, type DeepLinkState } from '../state/urlState'

/** The full-lab link for an embed: the same deep link, minus `embed`. */
export function embedLabHref(hash: string): string {
  const state: DeepLinkState = { ...parseDeepLink(hash) }
  delete state.embed
  const query = serializeDeepLink(state).replace(/^#/, '')
  return query === '' ? './' : `./#${query}`
}

/**
 * "在实验室中打开" -- the one control an embedded figure keeps. The href is
 * re-read from the live hash (main.tsx's bindUrlState keeps it equal to the
 * store; t only once playback pauses) at the moment the reader reaches for
 * the link, so it opens what they are looking at.
 */
export function EmbedBar() {
  const refresh = (event: SyntheticEvent<HTMLAnchorElement>): void => {
    event.currentTarget.setAttribute('href', embedLabHref(window.location.hash))
  }
  return (
    <a
      className="qv-embed-open qv-glass"
      data-chrome=""
      href={embedLabHref(window.location.hash)}
      target="_blank"
      rel="noopener"
      onPointerDown={refresh}
      onFocus={refresh}
      onClick={refresh}
    >
      <ExternalLink size={16} aria-hidden="true" />
      在实验室中打开
    </a>
  )
}
