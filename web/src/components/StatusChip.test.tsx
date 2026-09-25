/** @vitest-environment jsdom */
import { createElement } from 'react'
import { describe, expect, it } from 'vitest'

import type { SceneStatus } from '../api/types'
import { mount, type MountedTree } from '../test/mount'
import { StatusChip, statusLine } from './StatusChip'

async function chip(status: SceneStatus): Promise<MountedTree> {
  return mount(createElement(StatusChip, { status }))
}

function line(tree: MountedTree): HTMLElement {
  const node = tree.container.querySelector<HTMLElement>('[data-status]')
  if (node === null) throw new Error('the status chip reports no status at all')
  return node
}

describe('StatusChip says which frame the numbers describe', () => {
  it('names the rendered time AND the in-flight time while refreshing', async () => {
    const tree = await chip({
      loading: false,
      refreshing: true,
      renderedTimeAu: 3.6,
      timeAu: 9.0,
      triangleCount: 4096,
    })
    try {
      expect(line(tree).dataset.status).toBe('refreshing')
      expect(line(tree).textContent).toContain('正在显示 t=3.6 a.u.')
      expect(line(tree).textContent).toContain('正在计算 t=9.0 a.u.')
      // The unqualified ready text would present the OLD frame's diagnostics
      // as the current ones.
      expect(line(tree).textContent).not.toContain('科学资产已就绪')
    } finally {
      await tree.unmount()
    }
  })

  it('still says a stale frame is stale when it does not know the frame time', async () => {
    const tree = await chip({ loading: false, refreshing: true, timeAu: 9 })
    try {
      expect(line(tree).dataset.status).toBe('refreshing')
      expect(line(tree).textContent).toContain('正在计算 t=9.0 a.u.')
      expect(line(tree).textContent).not.toContain('科学资产已就绪')
    } finally {
      await tree.unmount()
    }
  })

  it('names the frame on screen even when the requested time is missing', async () => {
    const tree = await chip({ loading: false, refreshing: true, renderedTimeAu: 3.6 })
    try {
      expect(line(tree).dataset.status).toBe('refreshing')
      expect(line(tree).textContent).toContain('正在显示 t=3.6 a.u.')
      expect(line(tree).textContent).toContain('正在计算下一帧')
    } finally {
      await tree.unmount()
    }
  })

  it('reports a standing refusal with its kind and its reason, not as an error', async () => {
    const reason = 'No route samples a time-dependent state as a point cloud.'
    const tree = await chip({ loading: false, unavailable: { kind: 'point_cloud', reason } })
    try {
      expect(line(tree).dataset.status).toBe('unavailable')
      expect(line(tree).textContent).toContain('电子云暂不可用')
      expect(line(tree).textContent).not.toContain('point_cloud 暂不可用')
      expect(line(tree).textContent).toContain(reason)
      expect(line(tree).textContent).not.toContain('场景错误')
      expect(line(tree).textContent).not.toContain('科学资产已就绪')
    } finally {
      await tree.unmount()
    }
  })

  it('reports an error with the message, not just the word', async () => {
    const tree = await chip({ loading: false, error: 'HTTP 422 from /api/orbitals/isosurface' })
    try {
      expect(line(tree).dataset.status).toBe('error')
      expect(line(tree).textContent).toContain('HTTP 422 from /api/orbitals/isosurface')
    } finally {
      await tree.unmount()
    }
  })

  it('says computing while there is nothing on screen', async () => {
    const tree = await chip({ loading: true })
    try {
      expect(line(tree).dataset.status).toBe('loading')
      expect(line(tree).textContent).toContain('正在计算')
    } finally {
      await tree.unmount()
    }
  })

  it('says the asset is ready only when it is the current one', async () => {
    const tree = await chip({ loading: false, renderedTimeAu: 12, pointCount: 28000 })
    try {
      expect(line(tree).dataset.status).toBe('ready')
      expect(line(tree).textContent).toContain('科学资产已就绪')
    } finally {
      await tree.unmount()
    }
  })

  it('floats as chrome and carries the full text as a tooltip', async () => {
    const reason = 'a long refusal reason that the chip may have to truncate on a phone'
    const tree = await chip({ loading: false, unavailable: { kind: 'isosurface', reason } })
    try {
      const root = tree.container.querySelector<HTMLElement>('.qv-status-chip')
      expect(root?.hasAttribute('data-chrome')).toBe(true)
      expect(root?.title).toBe(`等密度面暂不可用 · ${reason}`)
      expect(root?.querySelector('.qv-status-dot')?.getAttribute('data-kind')).toBe('unavailable')
    } finally {
      await tree.unmount()
    }
  })
})

describe('statusLine precedence', () => {
  it('ranks error > unavailable > loading > refreshing > ready', () => {
    const all: SceneStatus = {
      loading: true,
      refreshing: true,
      error: 'boom',
      unavailable: { kind: 'slice', reason: 'no' },
    }
    expect(statusLine(all).kind).toBe('error')
    expect(statusLine({ ...all, error: undefined }).kind).toBe('unavailable')
    expect(statusLine({ ...all, error: undefined, unavailable: undefined }).kind).toBe('loading')
    expect(statusLine({ loading: false, refreshing: true }).kind).toBe('refreshing')
    expect(statusLine({ loading: false }).kind).toBe('ready')
    expect(statusLine({ loading: false, refreshing: true }).text).toBe('正在显示上一帧 · 正在计算下一帧')
  })
})
