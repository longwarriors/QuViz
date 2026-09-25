import { Atom, ChevronRight, Clock } from 'lucide-react'
import { useMemo, useState } from 'react'

import { capabilityFor, chargeBound, planSceneRequest } from '../../api/capability'
import type { BasisKind } from '../../api/types'
import { useCatalogs } from '../../state/catalogs'
import { useSceneStore } from '../../state/useSceneStore'
import { selectSceneRequestInputs } from '../sceneRequest'
import { BASIS_TAG, MIXTURE_COPY } from '../stateIndex'
import { OptionRow } from './rows'

/** The n values the store can hold (normalizeOrbital clamps to 1..8). */
const N_RANGE = [1, 2, 3, 4, 5, 6, 7, 8] as const
const BASIS_LABEL: Readonly<Record<BasisKind, string>> = {
  real: '实基（化学轨道）',
  complex: '复基（Lz 本征态）',
}

/**
 * 量子态: the state kind, the catalogue presets (a radio list), the
 * "更多轨道" expander with n / ℓ / m / Z and the basis, or -- for a
 * superposition -- the mixture presets and the basis/Z read-outs the request
 * actually carries.
 */
export function StateSection() {
  const store = useSceneStore()
  const { orbitals: presets, superpositions: mixtures, orbitalStatus, superpositionStatus } =
    useCatalogs()
  const [moreOpen, setMoreOpen] = useState(false)
  const { orbital, mode } = store
  // One source of truth for Z: B8's chargeBound() -- the route's range live,
  // the single exported Z on the static site -- which is also what B9's store
  // clamp and the planner use. min === max leaves nothing to choose.
  const charge = chargeBound()
  const zFixed = charge.min === charge.max
  // Offered n: those the matrix can draw at all (point clouds are the one
  // representation every eigenstate has), plus the current n so the select
  // never holds a value it cannot show.
  const nOptions = useMemo(
    () =>
      N_RANGE.filter(
        (n) =>
          n === orbital.n ||
          capabilityFor({
            mode: 'eigenstate',
            orbital: { n, l: 0, m: 0, z: orbital.z, basis: orbital.basis },
            representation: 'point_cloud',
          }).status === 'available',
      ),
    [orbital.n, orbital.z, orbital.basis],
  )
  const lOptions = Array.from({ length: orbital.n }, (_, index) => index)
  const mOptions = Array.from({ length: 2 * orbital.l + 1 }, (_, index) => index - orbital.l)
  const plan = planSceneRequest(selectSceneRequestInputs(store))

  return (
    <>
      <div className="qv-band" role="group" aria-label="态类型" data-control-section="state-kind">
        <div className="qv-subhead">态类型</div>
        <OptionRow
          icon={Atom}
          label="本征态"
          note="能量本征态：|ψ|² 不随时间变化"
          pressed={mode === 'eigenstate'}
          data={{ 'data-state-kind': 'eigenstate' }}
          onClick={() => store.setMode('eigenstate')}
        />
        <OptionRow
          icon={Clock}
          label="叠加态"
          note="解析含时本征态叠加"
          title="解析含时本征态叠加"
          pressed={mode === 'superposition'}
          data={{ 'data-state-kind': 'superposition' }}
          onClick={() => store.setMode('superposition')}
        />
      </div>

      {mode === 'eigenstate' ? (
        <div className="qv-band" data-control-section="presets">
          <div className="qv-subhead">轨道预设</div>
          {presets.length === 0 ? (
            <p className="qv-empty">
              {orbitalStatus === 'error'
                ? '轨道目录不可用；仍可在“更多轨道”中直接选择量子数。'
                : '正在载入轨道目录…'}
            </p>
          ) : (
            presets.map((preset) => (
              <OptionRow
                key={preset.id}
                label={preset.label}
                pressed={
                  preset.n === orbital.n &&
                  preset.l === orbital.l &&
                  preset.m === orbital.m &&
                  preset.basis === orbital.basis
                }
                tags={[{ text: BASIS_TAG[preset.basis] }]}
                data={{ 'data-preset': preset.id }}
                onClick={() => store.applyPreset(preset)}
              />
            ))
          )}
          <button
            type="button"
            className="qv-expander"
            data-action="more-orbitals"
            aria-expanded={moreOpen}
            aria-controls="qv-more-orbitals"
            onClick={() => setMoreOpen((open) => !open)}
          >
            <ChevronRight size={16} aria-hidden="true" />
            <span>更多轨道</span>
            <span className="qv-expander-summary">
              ψ({orbital.n},{orbital.l},{orbital.m}) · {BASIS_TAG[orbital.basis]}
            </span>
          </button>
          <div
            id="qv-more-orbitals"
            className="qv-more"
            hidden={!moreOpen}
            data-control-section="eigenstate-quantum-numbers"
          >
            <div className="qv-quantum-grid">
              <label>
                <span>n</span>
                <select
                  data-quantum="n"
                  value={orbital.n}
                  onChange={(event) => store.setOrbital({ n: Number(event.target.value) })}
                >
                  {nOptions.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>ℓ</span>
                <select
                  data-quantum="l"
                  value={orbital.l}
                  onChange={(event) => store.setOrbital({ l: Number(event.target.value) })}
                >
                  {lOptions.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>m</span>
                <select
                  data-quantum="m"
                  value={orbital.m}
                  onChange={(event) => store.setOrbital({ m: Number(event.target.value) })}
                >
                  {mOptions.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Z</span>
                {zFixed ? (
                  <output data-quantum="z" title={`静态教材版固定 Z = ${charge.min}`}>
                    {charge.min}
                  </output>
                ) : (
                  <input
                    type="number"
                    data-quantum="z"
                    min={charge.min}
                    max={charge.max}
                    step={charge.step}
                    value={orbital.z}
                    onChange={(event) => store.setOrbital({ z: Number(event.target.value) })}
                  />
                )}
              </label>
            </div>
            <div className="qv-basis-row" role="group" aria-label="基">
              {(['real', 'complex'] as const).map((basis) => (
                <button
                  type="button"
                  key={basis}
                  data-basis={basis}
                  aria-pressed={orbital.basis === basis}
                  onClick={() => store.setOrbital({ basis })}
                >
                  {BASIS_LABEL[basis]}
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="qv-band" data-control-section="mixtures">
          <div className="qv-subhead">叠加预设</div>
          {mixtures.length === 0 ? (
            <p className="qv-empty">
              {superpositionStatus === 'error' ? '叠加态目录不可用。' : '正在载入叠加态目录…'}
            </p>
          ) : (
            mixtures.map((mixture) => {
              const copy = MIXTURE_COPY[mixture.id]
              return (
                <OptionRow
                  key={mixture.id}
                  label={copy?.label ?? mixture.label}
                  note={copy?.note ?? mixture.note}
                  title={copy?.note ?? mixture.note}
                  pressed={store.superpositionTerms === mixture.terms}
                  tags={mixture.period_au === 0 ? [{ text: '简并' }] : []}
                  data={{ 'data-mixture': mixture.id }}
                  onClick={() =>
                    // The fifth argument is A11's 2s-2pz fix: open the preset
                    // on the picture the server probed it can build.
                    store.setSuperposition(
                      mixture.terms,
                      mixture.label,
                      mixture.slice_resolution_floor,
                      mixture.streamline_seed_count_max,
                      mixture.default_representation,
                    )
                  }
                />
              )
            })
          )}
          {plan.status === 'available' ? (
            // Read from the PLAN, so the read-out cannot name a basis or a
            // charge different from the one the query carries.
            <dl className="qv-readout" data-readonly-group="superposition">
              <div>
                <dt>基</dt>
                <dd data-readonly="basis">{String(plan.params.basis)}</dd>
              </div>
              <div>
                <dt>Z</dt>
                <dd data-readonly="z">{String(plan.params.z)}</dd>
              </div>
            </dl>
          ) : null}
        </div>
      )}
    </>
  )
}
