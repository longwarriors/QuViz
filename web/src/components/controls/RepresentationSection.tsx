import { Cloud, Grid2x2, Layers3, Waves, type LucideIcon } from 'lucide-react'
import { useState } from 'react'

import {
  capabilityFor,
  planSceneRequest,
  type Capability,
  type ParameterId,
} from '../../api/capability'
import type { PrincipalPlane, RepresentationKind, SliceObservable } from '../../api/types'
import { useCatalogs } from '../../state/catalogs'
import { useSceneStore } from '../../state/useSceneStore'
import { selectSceneRequestInputs } from '../sceneRequest'
import { REPRESENTATION_LABELS } from '../sceneStatus'
import { ChoiceRow, OptionRow, ParameterRow, type OptionTag } from './rows'

const PLANE_LABEL: Readonly<Record<PrincipalPlane, string>> = { xy: 'xy', xz: 'xz', yz: 'yz' }

const OBSERVABLE_LABEL: Readonly<Record<SliceObservable, string>> = {
  probability_density: '|ψ|²',
  wavefunction_real: 'Re ψ',
  wavefunction_imag: 'Im ψ',
  phase: 'arg ψ',
}

/**
 * The four representations and what each is FOR. `purpose` is the title of an
 * available row only; a refused row's title is the matrix's reason, verbatim.
 */
const REPRESENTATIONS: readonly {
  id: RepresentationKind
  icon: LucideIcon
  purpose: string
}[] = [
  { id: 'point_cloud', icon: Cloud, purpose: '从 |ψ|² d³r 采样位置；每个点具有相同视觉权重' },
  { id: 'isosurface', icon: Layers3, purpose: '包围指定概率质量的 |ψ|² 等值面' },
  { id: 'slice', icon: Grid2x2, purpose: '在过原子核的主平面上采样一个标量场' },
  { id: 'streamlines', icon: Waves, purpose: 'j/ρ 的流线（概率流，不是电子轨迹）' },
]

/** A Record over the refusal statuses: a new refusal kind is a compile error here. */
const REFUSAL_TAG: Readonly<Record<Exclude<Capability['status'], 'available'>, string>> = {
  unsupported: '不支持',
  not_implemented: '未实现',
  not_precomputed: '未预计算',
}

/**
 * Order is this list's; membership is the capability's. `timeAu` lives in the
 * time pill and `aMu` is read-only (see the read-out below), so neither is here.
 */
const PARAMETER_ROWS: readonly { id: Exclude<ParameterId, 'timeAu' | 'aMu'>; label: string }[] = [
  { id: 'samples', label: '样本数' },
  { id: 'seed', label: '随机种子' },
  { id: 'resolution', label: '网格' },
  { id: 'probabilityMass', label: '包围概率' },
  { id: 'seedCount', label: '流线种子' },
]

/**
 * 表示法: a radio list of the four representations -- every availability
 * decision comes from capabilityFor -- then the cell's own parameters.
 */
export function RepresentationSection({ onActivate }: { onActivate?: () => void }) {
  const store = useSceneStore()
  const { orbitals: presets } = useCatalogs()
  const [notice, setNotice] = useState<RepresentationKind | null>(null)
  const { mode } = store
  // Exactly the inputs useSceneAsset plans from.
  const inputs = selectSceneRequestInputs(store)
  const current = capabilityFor(inputs)
  const bounds = current.status === 'available' ? current.parameters : {}
  const planes = current.status === 'available' ? current.planes : undefined
  const observables = current.status === 'available' ? current.observables : undefined
  const serverValidation = current.status === 'available' ? current.serverValidation : undefined
  const plan = planSceneRequest(inputs)

  const capabilityOf = (representation: RepresentationKind): Capability =>
    capabilityFor({
      mode,
      orbital: inputs.orbital,
      representation,
      // B8's static overlay finds a superposition's exported frames by terms;
      // without them every superposition row would read as not precomputed.
      superpositionTerms: inputs.superpositionTerms,
      superpositionSliceResolutionFloor: inputs.superpositionSliceResolutionFloor,
      superpositionStreamlineSeedCountMax: inputs.superpositionStreamlineSeedCountMax,
    })
  const noticed = notice === null ? null : capabilityOf(notice)
  const noticeText = noticed !== null && noticed.status !== 'available' ? noticed.reason : null

  const flowExample = presets.find((preset) => preset.id === '3d-complex')
  const flowExampleCapability =
    flowExample === undefined
      ? undefined
      : capabilityFor({
          mode: 'eigenstate',
          orbital: { ...inputs.orbital, ...flowExample },
          representation: 'streamlines',
        })
  const offerFlowExample =
    mode === 'eigenstate' &&
    capabilityOf('streamlines').status !== 'available' &&
    flowExample !== undefined &&
    flowExampleCapability?.status === 'available'

  const loadFlowExample = (): void => {
    // A separate, plainly labelled action: the refused button itself never
    // rewrites the state. The example is the server catalogue entry.
    if (flowExample === undefined) return
    store.applyPreset(flowExample)
    useSceneStore.getState().setRepresentation('streamlines')
    setNotice(null)
  }

  const parameterValue: Record<ParameterId, number> = {
    samples: store.samples,
    seed: store.seed,
    resolution: store.resolution,
    probabilityMass: store.probabilityMass,
    seedCount: store.seedCount,
    timeAu: store.timeAu,
    aMu: store.aMu,
  }
  const parameterSetter: Record<ParameterId, (value: number) => void> = {
    samples: store.setSamples,
    seed: store.setSeed,
    resolution: store.setResolution,
    probabilityMass: store.setProbabilityMass,
    seedCount: store.setSeedCount,
    timeAu: store.setTimeAu,
    aMu: store.setAMu,
  }
  const declaredRows = PARAMETER_ROWS.filter(({ id }) => bounds[id] !== undefined)
  const carriesAMu = plan.status === 'available' && plan.params.a_mu !== undefined

  return (
    <>
      <div className="qv-band" role="group" aria-label="表示方式" data-control-section="representations">
        <div className="qv-subhead">表示方式</div>
        {REPRESENTATIONS.map(({ id, icon, purpose }) => {
          const label = REPRESENTATION_LABELS[id]
          const capability = capabilityOf(id)
          const available = capability.status === 'available'
          const validation = available ? capability.serverValidation : undefined
          const tags: OptionTag[] = !available
            ? [{ text: REFUSAL_TAG[capability.status], tone: 'warn' }]
            : validation === undefined
              ? []
              : [{ text: '需数值验证' }]
          return (
            <OptionRow
              key={id}
              icon={icon}
              label={label}
              pressed={store.representation === id}
              tags={tags}
              ariaLabel={
                !available
                  ? `${label}暂不可用：${capability.reason}`
                  : validation === undefined
                    ? label
                    : `${label}；需服务端数值验证：${validation.reason}`
              }
              ariaDescribedBy={
                !available && notice === id
                  ? 'representation-availability-notice'
                  : available && store.representation === id && validation !== undefined
                    ? 'representation-server-validation-notice'
                    : undefined
              }
              title={
                !available
                  ? capability.reason
                  : validation === undefined
                    ? purpose
                    : `${purpose}；需服务端数值验证：${validation.reason}`
              }
              data={{
                'data-representation': id,
                'data-unavailable': available ? undefined : 'true',
                'data-server-validation': validation === undefined ? undefined : 'required',
              }}
              onFocus={() => {
                if (!available) setNotice(id)
              }}
              onClick={() => {
                onActivate?.()
                if (available) {
                  setNotice(null)
                  store.setRepresentation(id)
                } else {
                  setNotice(id)
                }
              }}
            />
          )
        })}
        {noticeText === null ? null : (
          <p
            id="representation-availability-notice"
            className="qv-notice"
            role="status"
            data-representation-notice={notice ?? undefined}
          >
            {noticeText}
          </p>
        )}
        {serverValidation === undefined ? null : (
          <p
            id="representation-server-validation-notice"
            className="qv-notice"
            data-tone="info"
            role="note"
            data-server-validation-notice={store.representation}
          >
            <strong>需服务端数值验证：</strong>
            {serverValidation.reason}
          </p>
        )}
        {offerFlowExample && flowExample !== undefined ? (
          <button type="button" className="qv-action-row" data-flow-example onClick={loadFlowExample}>
            <Waves size={14} aria-hidden="true" /> 载入并显示概率流示例 · {flowExample.label} ·{' '}
            {flowExample.basis}
          </button>
        ) : null}
      </div>

      {planes !== undefined || observables !== undefined || declaredRows.length > 0 || carriesAMu ? (
        <div className="qv-band" data-control-section="representation-parameters">
          <div className="qv-subhead">参数</div>
          {planes === undefined ? null : (
            <ChoiceRow
              choice="plane"
              label="平面"
              options={planes}
              labels={PLANE_LABEL}
              value={store.plane}
              onChange={store.setPlane}
            />
          )}
          {observables === undefined ? null : (
            <ChoiceRow
              choice="observable"
              label="场"
              options={observables}
              labels={OBSERVABLE_LABEL}
              value={store.sliceObservable}
              onChange={store.setSliceObservable}
            />
          )}
          {declaredRows.map(({ id, label }) => (
            <ParameterRow
              key={id}
              parameter={id}
              label={label}
              bound={bounds[id] as NonNullable<(typeof bounds)[typeof id]>}
              value={parameterValue[id]}
              onChange={parameterSetter[id]}
            />
          ))}
          {carriesAMu && plan.status === 'available' ? (
            // Read-only by decision, and read out iff the request carries one;
            // the value is the plan's clamped one, not the store's raw number.
            <dl className="qv-readout" data-readonly-group="request">
              <div>
                <dt>
                  a<sub>μ</sub>
                </dt>
                <dd data-readonly="a_mu">{String(plan.params.a_mu)}</dd>
              </div>
            </dl>
          ) : null}
        </div>
      ) : null}
    </>
  )
}
