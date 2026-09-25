import { useState, type ReactNode } from 'react'

import { runtimeMode } from '../api/runtimeMode'

/**
 * Can this browser create a WebGL context at all? Probed on a DETACHED canvas
 * (the document keeps exactly one canvas, the scene's), and the probe context
 * is released at once so it does not count against the browser's context cap.
 */
export function detectWebGL(
  create: () => HTMLCanvasElement = () => document.createElement('canvas'),
): boolean {
  try {
    const canvas = create()
    const context = canvas.getContext('webgl2') ?? canvas.getContext('webgl')
    if (context === null) return false
    context.getExtension('WEBGL_lose_context')?.loseContext()
    return true
  } catch {
    return false
  }
}

/** The scene, or a readable reason there is none. Probed once per mount. */
export function WebGLGate({
  children,
  probe = detectWebGL,
}: {
  children: ReactNode
  probe?: () => boolean
}) {
  const [supported] = useState(probe)
  if (supported) return <>{children}</>
  return (
    <div className="qv-fallback" role="alert" data-webgl-unavailable="" data-chrome="">
      <h1>此设备无法创建 WebGL 画布</h1>
      <p>
        三维实验室需要 WebGL。请在浏览器设置中开启硬件加速，或换用最新版 Chrome、Edge、Firefox 或 Safari。
      </p>
      {runtimeMode() === 'static' ? (
        <p>
          <a href="./learn/">改为阅读教材</a>
        </p>
      ) : null}
    </div>
  )
}
