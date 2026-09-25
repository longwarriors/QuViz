/** @vitest-environment jsdom */
import { act, createElement } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { mount } from '../test/mount'
import { asError, ErrorBoundary, LabFailure, reloadPage } from './ErrorBoundary'

const bomb = { armed: true }

function Bomb() {
  if (bomb.armed) throw new Error('shader failed to compile')
  return createElement('p', { 'data-recovered': '' }, 'recovered')
}

function StringBomb(): null {
  throw 'a bare string'
}

beforeEach(() => {
  bomb.armed = true
  // React reports every caught render error on console.error; silence it here.
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
})

afterEach(() => {
  vi.restoreAllMocks()
})

async function click(element: Element | null): Promise<void> {
  const scope = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  scope.IS_REACT_ACT_ENVIRONMENT = true
  try {
    await act(async () => (element as HTMLElement).click())
  } finally {
    delete scope.IS_REACT_ACT_ENVIRONMENT
  }
}

describe('ErrorBoundary', () => {
  it('renders its children when nothing throws', async () => {
    bomb.armed = false
    const tree = await mount(
      createElement(ErrorBoundary, {
        fallback: () => createElement('p', null, 'fallback'),
        children: createElement(Bomb),
      }),
    )
    try {
      expect(tree.container.querySelector('[data-recovered]')).not.toBeNull()
    } finally {
      await tree.unmount()
    }
  })

  it('replaces a crashed subtree with a readable failure, reports it, and can retry', async () => {
    const onError = vi.fn()
    const onReload = vi.fn()
    const tree = await mount(
      createElement(ErrorBoundary, {
        onError,
        fallback: (error: Error, reset: () => void) =>
          createElement(LabFailure, { title: '三维场景无法显示', error, onRetry: reset, onReload }),
        children: createElement(Bomb),
      }),
    )
    try {
      const alert = tree.container.querySelector('[role="alert"]')
      expect(alert?.hasAttribute('data-chrome')).toBe(true)
      expect(alert?.textContent).toContain('三维场景无法显示')
      expect(alert?.textContent).toContain('shader failed to compile')
      expect(onError).toHaveBeenCalledOnce()
      expect(onError.mock.calls[0][0]).toBeInstanceOf(Error)

      const buttons = Array.from(tree.container.querySelectorAll('button'))
      expect(buttons.map((button) => button.textContent)).toEqual(['重试', '重新载入页面'])
      await click(buttons[1])
      expect(onReload).toHaveBeenCalledOnce()

      bomb.armed = false
      await click(buttons[0])
      expect(tree.container.querySelector('[data-recovered]')).not.toBeNull()
    } finally {
      await tree.unmount()
    }
  })

  it('turns a thrown non-Error into an Error with its text', async () => {
    const tree = await mount(
      createElement(ErrorBoundary, {
        fallback: (error: Error) => createElement(LabFailure, { title: '实验室遇到错误', error }),
        children: createElement(StringBomb),
      }),
    )
    try {
      expect(tree.container.textContent).toContain('a bare string')
      // No retry offered when there is nothing to retry.
      expect(Array.from(tree.container.querySelectorAll('button')).map((button) => button.textContent)).toEqual([
        '重新载入页面',
      ])
    } finally {
      await tree.unmount()
    }
  })
})

describe('asError / reloadPage', () => {
  it('keeps Errors and wraps everything else', () => {
    const error = new Error('x')
    expect(asError(error)).toBe(error)
    expect(asError(42).message).toBe('42')
  })

  it('reloads the location it is given', () => {
    const target = { reload: vi.fn() }
    reloadPage(target)
    expect(target.reload).toHaveBeenCalledOnce()
  })
})
