import { useLayoutEffect, useState, type ReactNode } from 'react'

import { runtimeMode } from '../api/runtimeMode'

/**
 * Can this browser create the WebGL2 context the scene needs? WebGL1 does not
 * count: three's WebGLRenderer (r163+) asks for 'webgl2' only and throws
 * otherwise. Probed on a DETACHED canvas (the document keeps exactly one
 * canvas, the scene's), and the probe context is released at once so it does
 * not count against the browser's context cap.
 */
export function detectWebGL(
  create: () => HTMLCanvasElement = () => document.createElement('canvas'),
): boolean {
  try {
    const canvas = create()
    const context = canvas.getContext('webgl2')
    if (context === null) return false
    context.getExtension('WEBGL_lose_context')?.loseContext()
    return true
  } catch {
    return false
  }
}

/** The notice's heading, also what the shell reports as its status. */
export const WEBGL_UNAVAILABLE = '此设备无法创建 WebGL 画布'

/**
 * The scene, or a readable reason there is none. Probed once per mount.
 *
 * A refusal is reported through `onUnavailable` before paint: the
 * scene it replaces is the only thing that reports status, so without it the
 * shell would wait for a first frame forever and cover this notice with its
 * loading card. Inside an embed there is no textbook link -- the page around
 * the figure IS the textbook, and the figure's sandboxed frame could only
 * load a second copy of it into itself.
 */
export function WebGLGate({
  children,
  probe = detectWebGL,
  embed = false,
  onUnavailable,
}: {
  children: ReactNode
  probe?: () => boolean
  embed?: boolean
  onUnavailable?: () => void
}) {
  const [supported] = useState(probe)
  useLayoutEffect(() => {
    if (!supported) onUnavailable?.()
  }, [supported, onUnavailable])
  if (supported) return <>{children}</>
  return (
    <div className="qv-fallback" role="alert" data-webgl-unavailable="" data-chrome="">
      <h1>{WEBGL_UNAVAILABLE}</h1>
      <p>
        三维实验室需要 WebGL。请在浏览器设置中开启硬件加速，或换用最新版 Chrome、Edge、Firefox 或 Safari。
      </p>
      {runtimeMode() === 'static' && !embed ? (
        <p>
          <a href="./learn/">改为阅读教材</a>
        </p>
      ) : null}
    </div>
  )
}
