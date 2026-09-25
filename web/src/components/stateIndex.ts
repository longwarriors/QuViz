import type {
  BasisKind,
  OrbitalParameters,
  OrbitalPreset,
  SuperpositionMetadata,
  SuperpositionPreset,
} from '../api/types'

/**
 * Chinese UI copy for the fixed server superposition catalogue. Formulas and
 * ket labels stay untouched; stateIndex.test.ts checks that every preset the
 * server publishes has an entry.
 */
export const MIXTURE_COPY: Readonly<Record<string, { label: string; note: string }>> = {
  '1s-2pz': { label: '1s + 2p_z · Bohr 振荡', note: 'ω = 3/8 Ha；偶极矩随 t 振荡。' },
  '2s-2pz': { label: '2s + 2p_z · 简并定态', note: '两项能量相同，概率密度不随 t 变化。' },
  '1s-3dz2': { label: '1s + 3d_z²', note: 'ω = 4/9 Ha；无偶极耦合，呈四极“呼吸”。' },
  '2pplus-2pminus': { label: '2p(+1) + 2p(−1)', note: '简并叠加；等价于实 p 轨道，净概率流为 0。' },
}

/** A catalogue preset's name in the panel: the copy deck's, or the server's own label. */
export function mixtureLabel(mixture: SuperpositionPreset): string {
  return MIXTURE_COPY[mixture.id]?.label ?? mixture.label
}

type MixtureTerm = SuperpositionMetadata['terms'][number]

/** How far two coefficients may differ and still be the catalogue's (they are unit-normalised). */
const COEFFICIENT_TOLERANCE = 1e-9

/**
 * A catalogue `terms` string -- `n,l,m,re[,im]` joined by `;` -- read the way
 * routes.py's `_parse_superposition` reads it, keeping only the non-zero
 * amplitudes the server keeps (`SuperpositionState`). `null` when malformed.
 */
function catalogueTerms(spec: string): MixtureTerm[] | null {
  const terms: MixtureTerm[] = []
  for (const chunk of spec.split(';')) {
    const fields = chunk.split(',').map(Number)
    if (fields.length !== 4 && fields.length !== 5) return null
    if (!fields.every(Number.isFinite)) return null
    const [n, l, m, re, im = 0] = fields
    if (re === 0 && im === 0) continue
    terms.push({ n, l, m, coefficient_real: re, coefficient_imag: im })
  }
  return terms
}

/**
 * The catalogue preset an ARRIVED superposition is, if it is one: the same kets
 * in the same order with the same complex coefficients. Read off the payload's
 * own terms, not the store's selection, so the name belongs to the frame on
 * screen. Like the catalogue itself, the match does not look at the basis.
 */
export function catalogueMixtureFor(
  terms: readonly MixtureTerm[],
  catalogue: readonly SuperpositionPreset[],
): SuperpositionPreset | undefined {
  const close = (a: number, b: number): boolean => Math.abs(a - b) <= COEFFICIENT_TOLERANCE
  return catalogue.find((preset) => {
    const expected = catalogueTerms(preset.terms)
    return (
      expected !== null &&
      expected.length === terms.length &&
      expected.every((term, index) => {
        const arrived = terms[index]
        return (
          term.n === arrived.n &&
          term.l === arrived.l &&
          term.m === arrived.m &&
          close(term.coefficient_real, arrived.coefficient_real) &&
          close(term.coefficient_imag, arrived.coefficient_imag)
        )
      })
    )
  })
}

/** The short basis tag a state row carries (the copy deck's 实基 / 复基). */
export const BASIS_TAG: Readonly<Record<BasisKind, string>> = { real: '实基', complex: '复基' }

/** Spectroscopic letters for ℓ = 0..7 (j is skipped by convention). */
const L_LETTERS = ['s', 'p', 'd', 'f', 'g', 'h', 'i', 'k'] as const

/**
 * Real-basis Cartesian names, per hydrogenic.py's real_spherical_harmonic:
 * m = +1 is x-like, m = −1 is y-like, |m| = 2 are x²−y² / xy.
 */
const REAL_NAMES: Readonly<Record<string, string>> = {
  '1,1': 'p_x',
  '1,-1': 'p_y',
  '1,0': 'p_z',
  '2,0': 'd_z²',
  '2,1': 'd_xz',
  '2,-1': 'd_yz',
  '2,2': 'd_x²−y²',
  '2,-2': 'd_xy',
}

export function orbitalName(n: number, l: number, m: number, basis: BasisKind): string {
  if (l === 0) return `${n}s`
  if (basis === 'real') {
    const named = REAL_NAMES[`${l},${m}`]
    if (named !== undefined) return `${n}${named}`
  }
  return `${n}${L_LETTERS[l] ?? `ℓ${l}`}, m=${m > 0 ? `+${m}` : m}`
}

export type SearchEntryKind = 'preset' | 'eigenstate' | 'superposition'

export interface SearchEntry {
  id: string
  kind: SearchEntryKind
  label: string
  tags: readonly string[]
  /** Normalised alternatives joined by U+0001, so no token matches across two of them. */
  haystack: string
  orbital?: Omit<OrbitalParameters, 'z'> & { z?: number }
  mixture?: SuperpositionPreset
}

/** Lower-case, and drop what people leave out when typing a state's name. */
function normalise(text: string): string {
  return text
    .toLowerCase()
    .replaceAll('²', '2')
    .replaceAll('−', '-')
    .replace(/[\s_·,()（）|⟩⟨]+/g, '')
}

const haystack = (...alternatives: string[]): string => alternatives.map(normalise).join('\u0001')

function stateWords(n: number, l: number, m: number, basis: BasisKind): string[] {
  return [
    orbitalName(n, l, m, basis),
    `${n}${L_LETTERS[l] ?? ''}`,
    `n=${n}`,
    `l=${l}`,
    `ℓ=${l}`,
    `m=${m}`,
    `ψ(${n},${l},${m})`,
    basis === 'real' ? '实基 real' : '复基 complex',
  ]
}

/**
 * Everything the search offers, in display order: catalogue presets, the
 * superposition presets, then every eigenstate up to `maxN` that
 * `isAvailable` accepts. A state already offered as a preset is not repeated;
 * m = 0 is listed once (real basis), since both bases give the same function.
 */
export function buildSearchEntries({
  presets,
  mixtures,
  maxN,
  isAvailable,
}: {
  presets: readonly OrbitalPreset[]
  mixtures: readonly SuperpositionPreset[]
  maxN: number
  isAvailable: (orbital: OrbitalParameters) => boolean
}): SearchEntry[] {
  const entries: SearchEntry[] = []
  const offered = new Set<string>()
  const key = (n: number, l: number, m: number, basis: BasisKind): string => `${n},${l},${m},${basis}`

  for (const preset of presets) {
    offered.add(key(preset.n, preset.l, preset.m, preset.basis))
    entries.push({
      id: `preset-${preset.id}`,
      kind: 'preset',
      label: preset.label,
      tags: ['预设', BASIS_TAG[preset.basis]],
      haystack: haystack(preset.label, '预设', ...stateWords(preset.n, preset.l, preset.m, preset.basis)),
      orbital: {
        n: preset.n,
        l: preset.l,
        m: preset.m,
        basis: preset.basis,
        ...(preset.z === undefined ? {} : { z: preset.z }),
      },
    })
  }

  for (const mixture of mixtures) {
    const label = mixtureLabel(mixture)
    entries.push({
      id: `mix-${mixture.id}`,
      kind: 'superposition',
      label,
      tags: mixture.period_au === 0 ? ['叠加', '简并'] : ['叠加'],
      haystack: haystack(label, mixture.label, mixture.id, '叠加 superposition'),
      mixture,
    })
  }

  for (let n = 1; n <= maxN; n += 1) {
    for (let l = 0; l < n; l += 1) {
      // `0 - l`, not `-l`: for l = 0 the latter is −0, which the store would
      // then hold as the s state's m (Object.is(−0, 0) is false).
      for (let m = 0 - l; m <= l; m += 1) {
        for (const basis of ['real', 'complex'] as const) {
          if (m === 0 && basis === 'complex') continue
          if (offered.has(key(n, l, m, basis))) continue
          if (!isAvailable({ n, l, m, z: 1, basis })) continue
          entries.push({
            id: `eig-${n}-${l}-${m}-${basis}`,
            kind: 'eigenstate',
            label: orbitalName(n, l, m, basis),
            tags: ['本征', BASIS_TAG[basis]],
            haystack: haystack('本征 eigenstate', ...stateWords(n, l, m, basis)),
            orbital: { n, l, m, basis },
          })
        }
      }
    }
  }
  return entries
}

/** Entries matching every whitespace-separated token of `query`, at most `limit`. */
export function searchEntries(entries: readonly SearchEntry[], query: string, limit = 40): SearchEntry[] {
  const tokens = query
    .split(/\s+/)
    .map(normalise)
    .filter((token) => token !== '')
  const matches =
    tokens.length === 0
      ? entries
      : entries.filter((entry) => tokens.every((token) => entry.haystack.includes(token)))
  return matches.slice(0, limit)
}
