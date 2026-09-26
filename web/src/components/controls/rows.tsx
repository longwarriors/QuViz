import type { LucideIcon } from 'lucide-react'
import { useId } from 'react'

import type { ParameterBound, ParameterId } from '../../api/capability'
import { runtimeMode } from '../../api/runtimeMode'

/** Decimals a value is shown with: as many as the step has, never more than 12. */
export function stepDigits(step: number | undefined): number | null {
  if (step === undefined || !(step > 0)) return null
  return Math.min(12, Math.max(0, -Math.floor(Math.log10(step))))
}

export function formatForStep(value: number, step: number | undefined): string {
  const digits = stepDigits(step)
  return digits === null ? String(value) : String(Number(value.toFixed(digits)))
}

/**
 * A request parameter. `min`, `max` and `step` are NOT arguments: they come
 * from the capability's ParameterBound, so a slider cannot offer a value the
 * route rejects. A bound with min === max is how the static catalogue pins a
 * value; a slider over one value is a control over nothing, so it is shown as
 * the read-only value the request actually carries. Live routes pin values
 * too -- every n = 4 isosurface's grid floor 16n + 17 already equals the cap
 * 81 -- so the title names the static textbook only in the static build.
 */
export function ParameterRow({
  parameter,
  label,
  bound,
  value,
  suffix = '',
  onChange,
}: {
  parameter: ParameterId
  label: string
  bound: ParameterBound
  value: number
  suffix?: string
  onChange: (value: number) => void
}) {
  if (bound.min === bound.max) {
    return (
      <div className="qv-param-row" data-parameter-row={parameter}>
        <span className="qv-param-label">{label}</span>
        <output
          data-parameter={parameter}
          data-readonly-parameter="true"
          title={runtimeMode() === 'static' ? '静态教材版固定此参数' : '此态的合法取值只有这一个'}
        >
          {`${formatForStep(bound.min, bound.step)}${suffix}`}
        </output>
      </div>
    )
  }
  return (
    <label className="qv-param-row" data-parameter-row={parameter}>
      <span className="qv-param-label">{label}</span>
      <input
        type="range"
        data-parameter={parameter}
        min={bound.min}
        max={bound.max}
        step={bound.step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      <span className="qv-param-value" data-value-of={parameter}>
        {`${formatForStep(value, bound.step)}${suffix}`}
      </span>
    </label>
  )
}

/**
 * A purely local rendering knob. Deliberately not a ParameterRow: nothing here
 * is sent to a route, so there is no bound to read and no data-parameter.
 */
export function DisplayRow({
  control,
  label,
  value,
  min,
  max,
  step,
  suffix = '',
  onChange,
}: {
  control: string
  label: string
  value: number
  min: number
  max: number
  step: number
  suffix?: string
  onChange: (value: number) => void
}) {
  return (
    <label className="qv-param-row" data-display-row={control}>
      <span className="qv-param-label">{label}</span>
      <input
        type="range"
        data-display={control}
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      <span className="qv-param-value">{`${value}${suffix}`}</span>
    </label>
  )
}

/** An enumerated request choice; `options` is the list the capability declares. */
export function ChoiceRow<T extends string>({
  choice,
  label,
  options,
  labels,
  value,
  onChange,
}: {
  choice: string
  label: string
  options: readonly T[]
  labels: Readonly<Record<T, string>>
  value: T
  onChange: (value: T) => void
}) {
  return (
    <div className="qv-choice-row">
      <span className="qv-param-label">{label}</span>
      <div className="qv-chips" data-choice={choice} role="group" aria-label={label}>
        {options.map((option) => (
          <button
            type="button"
            key={option}
            data-choice-value={option}
            className={value === option ? 'active' : ''}
            aria-pressed={value === option}
            onClick={() => onChange(option)}
          >
            {labels[option]}
          </button>
        ))}
      </div>
    </div>
  )
}

export interface OptionTag {
  text: string
  tone?: 'warn'
}

export interface OptionRowProps {
  label: string
  note?: string
  icon?: LucideIcon
  pressed: boolean
  tags?: readonly OptionTag[]
  title?: string
  /** Defaults to `label`, so a note or a tag never pollutes the accessible name. */
  ariaLabel?: string
  ariaDescribedBy?: string
  data?: Readonly<Record<string, string | undefined>>
  onClick: () => void
  onFocus?: () => void
}

/**
 * A Weather-Lab radio row: icon, label (and note) on the left, tags, then a
 * radio disc on the right. Semantically a pressed button -- the refused
 * representation rows must stay focusable explanation actions, which a
 * disabled radio input could not be.
 */
export function OptionRow({
  label,
  note,
  icon: Icon,
  pressed,
  tags = [],
  title,
  ariaLabel,
  ariaDescribedBy,
  data = {},
  onClick,
  onFocus,
}: OptionRowProps) {
  const noteId = useId()
  const describedBy =
    [ariaDescribedBy, note === undefined ? undefined : noteId]
      .filter((id): id is string => id !== undefined)
      .join(' ') || undefined
  return (
    <button
      type="button"
      className="qv-option-row"
      aria-pressed={pressed}
      aria-label={ariaLabel ?? label}
      aria-describedby={describedBy}
      title={title}
      onClick={onClick}
      onFocus={onFocus}
      {...data}
    >
      {Icon === undefined ? null : <Icon className="qv-option-icon" size={18} aria-hidden="true" />}
      <span className="qv-option-text">
        <span className="qv-option-label">{label}</span>
        {note === undefined ? null : (
          <span className="qv-option-note" id={noteId}>
            {note}
          </span>
        )}
      </span>
      {tags.map((tag) => (
        <span key={tag.text} className="qv-tag" data-tone={tag.tone}>
          {tag.text}
        </span>
      ))}
      <span className="qv-radio" aria-hidden="true" />
    </button>
  )
}

/** A Weather-Lab toggle: label left, switch right, `role=switch`. */
export function SwitchRow({
  toggle,
  label,
  checked,
  onChange,
}: {
  toggle: string
  label: string
  checked: boolean
  onChange: (next: boolean) => void
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      className="qv-switch-row"
      data-toggle={toggle}
      onClick={() => onChange(!checked)}
    >
      <span>{label}</span>
      <span className="qv-switch" aria-hidden="true" />
    </button>
  )
}
