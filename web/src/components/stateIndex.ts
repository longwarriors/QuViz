import type { BasisKind } from '../api/types'

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

/** The short basis tag a state row carries (the copy deck's 实基 / 复基). */
export const BASIS_TAG: Readonly<Record<BasisKind, string>> = { real: '实基', complex: '复基' }
