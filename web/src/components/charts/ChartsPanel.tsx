import type { OrbitalParameters, SceneStatus, SuperpositionTermSpec } from '../../api/types'
import { useOrbitalMetadata, type OrbitalMetadataState } from '../useOrbitalMetadata'
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
 * Why a superposition's energies are not drawn, and only the true reason.
 *
 * The a_μ sentence is for a reduced mass the level list does not describe.
 * For hydrogen (a_μ = 1) the levels are merely not here yet -- the term
 * metadata loads on every first open of the tab -- or they failed to load, or
 * the server sent none; saying "needs a_μ = 1" then gives a false reason.
 */
function MissingLevels({ aMu, metadata }: { aMu: number; metadata: OrbitalMetadataState }) {
  if (aMu !== 1) return <p className="qv-chart-note">能级需 a_μ = 1 的元数据，当前未显示。</p>
  // No term to ask about (the chart says the mixture reported none): nothing is loading.
  if (metadata.status === 'idle') return null
  if (metadata.status === 'error') {
    return (
      <p className="qv-chart-note" role="alert">
        能级载入失败：{metadata.error}
      </p>
    )
  }
  if (metadata.status === 'ready') return <p className="qv-chart-note">服务端未提供能级。</p>
  return (
    <p className="qv-chart-note" role="status">
      正在载入能级…
    </p>
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
        {levels === null ? (
          <MissingLevels aMu={mixture.a_mu} metadata={termMeta} />
        ) : (
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
