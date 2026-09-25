/** The one numeric formatter the lab uses; see formatFinite. The Inspector, the charts and the time pill all route numbers through here. */

/** What a non-finite (or absent) number is displayed as. Never "NaN"/"Infinity". */
export const PLACEHOLDER = '—'

export type NumericStyle =
  /** Fixed decimals, for numbers whose scale is known (energies, extents, times). */
  | { kind: 'fixed'; digits: number }
  /** Scientific notation, for residuals and bounds that span many decades. */
  | { kind: 'exponential'; digits: number }
  /**
   * Fixed decimals near unity, scientific notation outside [1e-3, 1e3): the
   * amplitude/coefficient style, so a retained tiny amplitude never reads as
   * an exact zero.
   */
  | { kind: 'magnitude'; digits: number }
  /** Whole counts, grouped for readability. */
  | { kind: 'count' }

/**
 * The one numeric formatter this panel uses.
 *
 * Every numeric cell goes through it so a non-finite value cannot reach the
 * screen as "NaN" or "Infinity" dressed up in units — a NaN energy rendered as
 * "NaN Ha" reads like a measurement, and an "Infinity" bound reads like a
 * proven one. Both are the absence of a number, and are shown as such. Routing
 * every site here also means the guard exists in exactly one place: weaken it
 * and every non-finite case in Inspector.test.tsx fails at once.
 */
export function formatFinite(value: number | undefined, style: NumericStyle): string {
  if (value === undefined || !Number.isFinite(value)) return PLACEHOLDER
  switch (style.kind) {
    case 'fixed':
      return value.toFixed(style.digits)
    case 'exponential':
      return value.toExponential(style.digits)
    case 'count':
      return value.toLocaleString()
    case 'magnitude': {
      const magnitude = Math.abs(value)
      return magnitude !== 0 && (magnitude < 0.001 || magnitude >= 1_000)
        ? value.toExponential(style.digits - 1)
        : value.toFixed(style.digits)
    }
  }
}

/**
 * `formatFinite` plus a unit, dropped when there is no number: "— Ha" would
 * still assert that a hartree value was measured.
 */
export function formatFiniteUnit(
  value: number | undefined,
  style: NumericStyle,
  unit: string,
  separator = ' ',
): string {
  const text = formatFinite(value, style)
  return text === PLACEHOLDER ? text : `${text}${separator}${unit}`
}
