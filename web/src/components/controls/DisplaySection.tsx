import { useSceneStore } from '../../state/useSceneStore'
import { DisplayRow, SwitchRow } from './rows'

/**
 * 显示: renderer-specific knobs only -- a knob exists exactly where the frame's
 * renderer consumes it. Exposure stays internal (no audited tone-mapping
 * policy), fog has no consumer since D2, and Bloom carries its honesty note.
 */
export function DisplaySection() {
  const store = useSceneStore()
  const { representation } = store
  const ownsBloom = representation === 'slice' || representation === 'streamlines'
  return (
    <div className="qv-band display-section" data-control-section="display">
      {representation === 'point_cloud' ? (
        <DisplayRow control="pointSize" label="点尺寸" value={store.pointSize} min={1.5} max={7} step={0.1} onChange={store.setPointSize} />
      ) : null}
      {representation !== 'slice' ? (
        <DisplayRow
          control="opacity"
          label="透明度"
          value={Math.round(store.opacity * 100)}
          min={25}
          max={100}
          step={1}
          suffix="%"
          onChange={(value) => store.setOpacity(value / 100)}
        />
      ) : null}
      {ownsBloom ? (
        <>
          <DisplayRow
            control="bloom"
            label="Bloom 光晕"
            value={Math.round(store.bloom * 100)}
            min={0}
            max={50}
            step={1}
            suffix="%"
            onChange={(value) => store.setBloom(value / 100)}
          />
          <p className="qv-notice" data-tone="info" data-bloom-note="">
            Bloom 只是展示效果：大于 0 时屏幕颜色不再与图例色带逐字一致。
          </p>
        </>
      ) : null}
      <SwitchRow toggle="autoRotate" label="自动旋转" checked={store.autoRotate} onChange={store.setAutoRotate} />
      <SwitchRow toggle="showGrid" label="地面网格（xy 平面）" checked={store.showGrid} onChange={store.setShowGrid} />
    </div>
  )
}
