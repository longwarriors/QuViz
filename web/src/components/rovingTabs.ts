/**
 * The roving-tabindex key model every horizontal tablist in the lab shares
 * (WAI-ARIA APG "Tabs", automatic activation): ArrowRight / ArrowLeft move to
 * the next / previous tab and wrap, Home / End jump to the first / last.
 *
 * Returns the index of the tab to select and focus, or `undefined` when the key
 * is not part of the model (or there are no tabs), in which case the caller
 * must leave the event alone -- no preventDefault, so Tab, Enter and Space keep
 * their native behaviour. Inspector and GuideDialog both route through here, so
 * a change to the model (vertical arrows, skipping disabled tabs, RTL) reaches
 * every tablist at once.
 */
export function nextRovingIndex(key: string, index: number, count: number): number | undefined {
  if (count <= 0) return undefined
  switch (key) {
    case 'ArrowRight':
      return (index + 1) % count
    case 'ArrowLeft':
      return (index - 1 + count) % count
    case 'Home':
      return 0
    case 'End':
      return count - 1
    default:
      return undefined
  }
}
