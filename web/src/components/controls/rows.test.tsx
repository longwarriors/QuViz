/** @vitest-environment jsdom */
import { act, createElement } from 'react'
import { Atom } from 'lucide-react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { RuntimeMode } from '../../api/runtimeMode'
import { mount } from '../../test/mount'
import {
  ChoiceRow,
  DisplayRow,
  formatForStep,
  OptionRow,
  ParameterRow,
  stepDigits,
  SwitchRow,
} from './rows'

const runtime = vi.hoisted(() => ({ current: 'live' as RuntimeMode }))
vi.mock('../../api/runtimeMode', () => ({ runtimeMode: () => runtime.current }))

beforeEach(() => {
  runtime.current = 'live'
})

async function interact(body: () => void): Promise<void> {
  const scope = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  const had = 'IS_REACT_ACT_ENVIRONMENT' in scope
  const previous = scope.IS_REACT_ACT_ENVIRONMENT
  scope.IS_REACT_ACT_ENVIRONMENT = true
  try {
    await act(async () => body())
  } finally {
    if (had) scope.IS_REACT_ACT_ENVIRONMENT = previous
    else delete scope.IS_REACT_ACT_ENVIRONMENT
  }
}

async function change(input: HTMLInputElement, value: string): Promise<void> {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
  await interact(() => {
    setter?.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

describe('stepDigits / formatForStep', () => {
  it('shows as many decimals as the step has, and never more than 12', () => {
    expect(stepDigits(undefined)).toBeNull()
    expect(stepDigits(-1)).toBeNull()
    expect(stepDigits(1000)).toBe(0)
    expect(stepDigits(0.005)).toBe(3)
    expect(stepDigits(1e-20)).toBe(12)
    expect(formatForStep(0.90000000001, 0.01)).toBe('0.9')
    expect(formatForStep(28000, 1000)).toBe('28000')
    expect(formatForStep(3.14159, undefined)).toBe('3.14159')
  })
})

describe('ParameterRow', () => {
  it('is a slider bounded only by the capability, showing its value to the step', async () => {
    const onChange = vi.fn()
    const tree = await mount(
      createElement(ParameterRow, {
        parameter: 'probabilityMass',
        label: '包围概率',
        bound: { min: 0.5, max: 0.99, step: 0.01 },
        value: 0.9,
        onChange,
      }),
    )
    try {
      const input = tree.container.querySelector<HTMLInputElement>('input[data-parameter="probabilityMass"]')
      expect(input?.type).toBe('range')
      expect([input?.min, input?.max, input?.step]).toEqual(['0.5', '0.99', '0.01'])
      expect(tree.container.querySelector('[data-value-of="probabilityMass"]')?.textContent).toBe('0.9')
      await change(input as HTMLInputElement, '0.75')
      expect(onChange).toHaveBeenCalledWith(0.75)
    } finally {
      await tree.unmount()
    }
  })

  it('shows a pinned bound (min === max) as a read-only value, not a slider over one value', async () => {
    runtime.current = 'static'
    const tree = await mount(
      createElement(ParameterRow, {
        parameter: 'samples',
        label: '样本数',
        bound: { min: 28000, max: 28000, step: 1000 },
        value: 40000,
        suffix: ' pts',
        onChange: () => undefined,
      }),
    )
    try {
      expect(tree.container.querySelector('input')).toBeNull()
      const output = tree.container.querySelector('output[data-parameter="samples"]')
      // The value the wire carries (the clamped bound), not the store's 40000.
      expect(output?.textContent).toBe('28000 pts')
      expect(output?.getAttribute('data-readonly-parameter')).toBe('true')
      expect(output?.getAttribute('title')).toBe('静态教材版固定此参数')
    } finally {
      await tree.unmount()
    }
  })

  it('does not blame the static textbook for a bound the live route itself pins', async () => {
    // Live `quviz serve`: every n = 4 isosurface has resolution {min: 81, max: 81},
    // because the state's floor 16n + 17 already equals the grid cap. Nothing
    // static fixed it, so the title must not say so.
    const tree = await mount(
      createElement(ParameterRow, {
        parameter: 'resolution',
        label: '网格',
        bound: { min: 81, max: 81, step: 2 },
        value: 81,
        onChange: () => undefined,
      }),
    )
    try {
      const output = tree.container.querySelector('output[data-parameter="resolution"]')
      expect(output?.textContent).toBe('81')
      expect(output?.getAttribute('title')).toBe('此态的合法取值只有这一个')
    } finally {
      await tree.unmount()
    }
  })
})

describe('DisplayRow / SwitchRow / ChoiceRow / OptionRow', () => {
  it('drives a local display knob, never a request parameter', async () => {
    const onChange = vi.fn()
    const tree = await mount(
      createElement(DisplayRow, { control: 'opacity', label: '透明度', value: 60, min: 25, max: 100, step: 1, suffix: '%', onChange }),
    )
    try {
      const input = tree.container.querySelector<HTMLInputElement>('input[data-display="opacity"]')
      expect(input?.hasAttribute('data-parameter')).toBe(false)
      expect(tree.container.textContent).toContain('60%')
      await change(input as HTMLInputElement, '40')
      expect(onChange).toHaveBeenCalledWith(40)
    } finally {
      await tree.unmount()
    }
  })

  it('is a real switch with aria-checked', async () => {
    const onChange = vi.fn()
    const tree = await mount(createElement(SwitchRow, { toggle: 'showGrid', label: '地面网格（xy 平面）', checked: true, onChange }))
    try {
      const button = tree.container.querySelector<HTMLButtonElement>('button[role="switch"][data-toggle="showGrid"]')
      expect(button?.getAttribute('aria-checked')).toBe('true')
      await interact(() => button?.click())
      expect(onChange).toHaveBeenCalledWith(false)
    } finally {
      await tree.unmount()
    }
  })

  it('offers exactly the declared choices and marks the standing one', async () => {
    const onChange = vi.fn()
    const tree = await mount(
      createElement(ChoiceRow<'xy' | 'xz'>, {
        choice: 'plane',
        label: '平面',
        options: ['xy', 'xz'],
        labels: { xy: 'xy', xz: 'xz' },
        value: 'xz',
        onChange,
      }),
    )
    try {
      const buttons = Array.from(tree.container.querySelectorAll<HTMLButtonElement>('[data-choice="plane"] button[data-choice-value]'))
      expect(buttons.map((button) => button.dataset.choiceValue)).toEqual(['xy', 'xz'])
      expect(buttons.map((button) => button.className)).toEqual(['', 'active'])
      expect(buttons[1].getAttribute('aria-pressed')).toBe('true')
      await interact(() => buttons[0].click())
      expect(onChange).toHaveBeenCalledWith('xy')
    } finally {
      await tree.unmount()
    }
  })

  it('names a radio row by its label alone and describes it by its note', async () => {
    const onClick = vi.fn()
    const onFocus = vi.fn()
    const tree = await mount(
      createElement(OptionRow, {
        icon: Atom,
        label: '叠加态',
        note: '解析含时本征态叠加',
        pressed: false,
        tags: [{ text: '简并' }, { text: '未预计算', tone: 'warn' as const }],
        title: '解析含时本征态叠加',
        ariaDescribedBy: 'extra-note',
        data: { 'data-state-kind': 'superposition' },
        onClick,
        onFocus,
      }),
    )
    try {
      const button = tree.container.querySelector<HTMLButtonElement>('button[data-state-kind="superposition"]')
      expect(button?.getAttribute('aria-label')).toBe('叠加态')
      expect(button?.getAttribute('aria-pressed')).toBe('false')
      const note = tree.container.querySelector('.qv-option-note')
      expect(button?.getAttribute('aria-describedby')).toBe(`extra-note ${note?.id}`)
      expect(Array.from(tree.container.querySelectorAll('.qv-tag')).map((tag) => [tag.textContent, tag.getAttribute('data-tone')])).toEqual([
        ['简并', null],
        ['未预计算', 'warn'],
      ])
      await interact(() => button?.focus())
      await interact(() => button?.click())
      expect(onFocus).toHaveBeenCalledOnce()
      expect(onClick).toHaveBeenCalledOnce()
    } finally {
      await tree.unmount()
    }
  })

  it('uses an explicit accessible name and no description when given no note', async () => {
    const tree = await mount(
      createElement(OptionRow, { label: '电子云', ariaLabel: '电子云暂不可用：x', pressed: true, onClick: () => undefined }),
    )
    try {
      const button = tree.container.querySelector('button')
      expect(button?.getAttribute('aria-label')).toBe('电子云暂不可用：x')
      expect(button?.hasAttribute('aria-describedby')).toBe(false)
      expect(button?.querySelector('svg')).toBeNull()
    } finally {
      await tree.unmount()
    }
  })
})
