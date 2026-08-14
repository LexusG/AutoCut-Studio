import { Gauge, Monitor, Ratio, Scan, Shuffle, SlidersHorizontal } from 'lucide-react'
import type { RenderSettings } from '@shared/types'
import { useAppStore } from '../stores/app-store'

interface SelectFieldProps<Key extends keyof RenderSettings> {
  label: string
  setting: Key
  options: Array<{ label: string; value: RenderSettings[Key] }>
}

function SelectField<Key extends keyof RenderSettings>({
  label,
  setting,
  options
}: SelectFieldProps<Key>): React.JSX.Element {
  const value = useAppStore((state) => state.renderSettings[setting])
  const update = useAppStore((state) => state.updateRenderSetting)
  return (
    <label className="setting-field">
      <span>{label}</span>
      <select
        value={String(value)}
        onChange={(event) => {
          const next = options.find((option) => String(option.value) === event.target.value)
          if (next) update(setting, next.value)
        }}
      >
        {options.map((option) => (
          <option key={String(option.value)} value={String(option.value)}>{option.label}</option>
        ))}
      </select>
    </label>
  )
}

export function SettingsPanel(): React.JSX.Element {
  const useEveryClip = useAppStore((state) => state.renderSettings.useEveryClip)
  const update = useAppStore((state) => state.updateRenderSetting)

  return (
    <aside className="settings-panel" aria-label="Output settings">
      <div className="settings-heading">
        <div><SlidersHorizontal size={17} /><h2>Output Settings</h2></div>
        <span>MP4</span>
      </div>

      <div className="settings-scroll">
        <section className="settings-group">
          <h3><Ratio size={14} /> Frame</h3>
          <SelectField
            label="Aspect ratio"
            setting="aspectRatio"
            options={[
              { label: 'Original', value: 'original' },
              { label: 'Landscape 16:9', value: '16:9' },
              { label: 'Portrait 9:16', value: '9:16' },
              { label: 'Square 1:1', value: '1:1' },
              { label: 'Portrait 4:5', value: '4:5' }
            ]}
          />
          <SelectField
            label="Fit mode"
            setting="fitMode"
            options={[
              { label: 'Crop to Fill', value: 'crop' },
              { label: 'Fit', value: 'fit' }
            ]}
          />
        </section>

        <section className="settings-group">
          <h3><Monitor size={14} /> Format</h3>
          <SelectField
            label="Resolution"
            setting="resolution"
            options={[
              { label: '1080p', value: '1080p' },
              { label: '720p', value: '720p' }
            ]}
          />
          <SelectField
            label="Frame rate"
            setting="frameRate"
            options={[
              { label: 'Auto', value: 'auto' },
              { label: '24 FPS', value: 24 },
              { label: '30 FPS', value: 30 },
              { label: '60 FPS', value: 60 }
            ]}
          />
        </section>

        <section className="settings-group">
          <h3><Shuffle size={14} /> Arrangement</h3>
          <SelectField
            label="Editing mode"
            setting="editingMode"
            options={[
              { label: 'Keep Original Order', value: 'original-order' },
              { label: 'Automatic Arrangement', value: 'automatic' },
              { label: 'Random Montage', value: 'random' }
            ]}
          />
          <SelectField
            label="Editing pace"
            setting="pace"
            options={[
              { label: 'Slow', value: 'slow' },
              { label: 'Normal', value: 'normal' },
              { label: 'Fast', value: 'fast' }
            ]}
          />
        </section>

        <section className="settings-group">
          <h3><Gauge size={14} /> Encoding</h3>
          <SelectField
            label="Quality"
            setting="quality"
            options={[
              { label: 'Draft', value: 'draft' },
              { label: 'Balanced', value: 'balanced' },
              { label: 'High Quality', value: 'high' }
            ]}
          />
        </section>

        <label className="toggle-setting">
          <span className="toggle-copy">
            <Scan size={15} />
            <span><strong>Use Every Clip</strong><small>Keep all source files in the result</small></span>
          </span>
          <input
            type="checkbox"
            checked={useEveryClip}
            onChange={(event) => update('useEveryClip', event.target.checked)}
          />
        </label>
      </div>
    </aside>
  )
}
