import type { OrbitalParameters, SceneStatus, SuperpositionTermSpec } from '../../api/types'
import { useOrbitalMetadata } from '../useOrbitalMetadata'
import { usePlaybackModel } from '../usePlayback'
import { EnergyLadderChart } from './EnergyLadderChart'
import { RadialDistributionChart } from './RadialDistributionChart'
import { SuperpositionTermsChart } from './SuperpositionTermsChart'

/** The term with the largest n: its level list (k = 1..max(n+2, 5)) covers every term. */
export function highestTerm(
  terms: readonly SuperpositionTermSpec[],
): SuperpositionTermSpec | undefined {
  return terms.reduce<SuperpositionTermSpec | undefined>(
    (best, term) => (best === undefined || term.n > best.n ? term : best),
    undefined,
  )
}

/**
 * The detail panel's 图表 tab. Mounted only while that tab is open (Inspector),
 * so a closed tab issues no metadata request -- the visual suite's request
 * ledger would otherwise see an undeclared question.
 */
export function ChartsPanel({ status }: { status: SceneStatus }) {
  const { periodAu } = usePlaybackModel()
  const metadata = status.metadata
  const mixture = status.superposition
  const eigenstate: OrbitalParameters | null =
    metadata === undefined
      ? null
      : {
          n: metadata.state.n,
          l: metadata.state.l,
          m: metadata.state.m,
          z: metadata.state.z,
          basis: metadata.state.basis,
        }
  const heaviest = mixture === undefined ? undefined : highestTerm(mixture.terms)
  const termState: OrbitalParameters | null =
    mixture === undefined || heaviest === undefined
      ? null
      : { n: heaviest.n, l: heaviest.l, m: heaviest.m, z: mixture.z, basis: mixture.basis }
  const eigenMeta = useOrbitalMetadata(eigenstate, metadata)
  const termMeta = useOrbitalMetadata(termState)

  if (metadata !== undefined) {
    if (eigenMeta.status === 'loading') {
      return (
        <p className="inspector-empty" role="status">
          正在载入径向分布…
        </p>
      )
    }
    if (eigenMeta.status === 'error') {
      return (
        <p className="inspector-empty" role="alert">
          径向分布载入失败：{eigenMeta.error}
        </p>
      )
    }
    const profile = eigenMeta.metadata?.radial_profile
    if (profile === undefined || profile === null) {
      return <p className="inspector-empty">服务端未提供径向分布。</p>
    }
    return (
      <div className="qv-charts" data-charts="eigenstate">
        <RadialDistributionChart profile={profile} label={metadata.label} />
        <EnergyLadderChart levels={profile.energy_levels_hartree} highlight={[metadata.state.n]} />
      </div>
    )
  }

  if (mixture !== undefined) {
    // The level list is for a_μ = 1 (the metadata request carries no a_μ); for
    // any other reduced mass the energies are withheld rather than mis-stated.
    const levels =
      mixture.a_mu === 1 ? (termMeta.metadata?.radial_profile?.energy_levels_hartree ?? null) : null
    return (
      <div className="qv-charts" data-charts="superposition">
        <SuperpositionTermsChart terms={mixture.terms} levels={levels} periodAu={periodAu} />
        {levels === null ? null : (
          <EnergyLadderChart
            levels={levels}
            highlight={[...new Set(mixture.terms.map((term) => term.n))]}
          />
        )}
      </div>
    )
  }

  return <p className="inspector-empty">载入一个量子态后，这里会显示径向分布、能级与叠加系数。</p>
}
