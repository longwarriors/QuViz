/**
 * The id of the element r3f's `<Canvas>` renders into. The save action looks
 * the scene canvas up by it, so another canvas earlier in the document (a
 * chart library, a probe, an embed) can never be what gets saved.
 */
export const SCENE_CANVAS_ID = 'quviz-scene'

/** The scene's own canvas, or null before the scene has mounted. */
export function sceneCanvas(root: ParentNode = document): HTMLCanvasElement | null {
  const canvas = root.querySelector(`#${SCENE_CANVAS_ID} canvas`)
  return canvas instanceof HTMLCanvasElement ? canvas : null
}

/** An ISO time stamp with ':' replaced -- Windows refuses ':' in file names. */
export function captureFileName(now: Date = new Date()): string {
  return `quviz-${now.toISOString().replaceAll(':', '-')}.png`
}

/**
 * Save the scene canvas as a PNG. Returns false, and saves nothing, when there
 * is no scene canvas yet or the drawing buffer cannot be read back.
 */
export function captureSceneCanvas(root: ParentNode = document, now: Date = new Date()): boolean {
  const canvas = sceneCanvas(root)
  if (canvas === null) return false
  let url: string
  try {
    url = canvas.toDataURL('image/png')
  } catch {
    return false
  }
  const link = document.createElement('a')
  link.download = captureFileName(now)
  link.href = url
  link.click()
  return true
}
