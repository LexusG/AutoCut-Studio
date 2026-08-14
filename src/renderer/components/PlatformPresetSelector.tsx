import { BriefcaseBusiness, Clapperboard, Image, Settings2 } from 'lucide-react'
import { getPreset, getPresetsForPlatform, PLATFORM_LABELS } from '@shared/constants/presets'
import type { PlatformId } from '@shared/types'
import { getPresetDisplayName } from '@shared/utils/project-settings'
import { useAppStore } from '../stores/app-store'

const platformIcons = {
  instagram: Image,
  youtube: Clapperboard,
  linkedin: BriefcaseBusiness,
  custom: Settings2
} as const

const platforms: PlatformId[] = ['instagram', 'youtube', 'linkedin', 'custom']

export function PlatformPresetSelector(): React.JSX.Element {
  const settings = useAppStore((state) => state.projectSettings)
  const selectPlatform = useAppStore((state) => state.selectPlatform)
  const selectPreset = useAppStore((state) => state.selectPreset)
  const presets = getPresetsForPlatform(settings.platform)
  const activePreset = getPreset(settings.presetId)

  return (
    <section className="preset-section">
      <div className="settings-section-title">
        <span>Platform Preset</span>
        {settings.presetModified && <strong>Modified</strong>}
      </div>
      <div className="platform-grid" role="tablist" aria-label="Export platform">
        {platforms.map((platform) => {
          const Icon = platformIcons[platform]
          return (
            <button
              key={platform}
              type="button"
              role="tab"
              aria-selected={settings.platform === platform}
              onClick={() => selectPlatform(platform)}
            >
              <Icon size={14} />
              <span>{PLATFORM_LABELS[platform]}</span>
            </button>
          )
        })}
      </div>

      {presets.length > 0 && (
        <div className="preset-options" role="listbox" aria-label={`${PLATFORM_LABELS[settings.platform]} formats`}>
          {presets.map((preset) => (
            <button
              key={preset.id}
              type="button"
              role="option"
              aria-selected={settings.presetId === preset.id}
              onClick={() => selectPreset(preset.id)}
            >
              <strong>{preset.name}</strong>
              <span>{preset.width} × {preset.height}</span>
            </button>
          ))}
        </div>
      )}

      <div className="preset-summary">
        <div>
          <strong>{getPresetDisplayName(settings)}</strong>
          <span>
            {settings.output.width} × {settings.output.height} • {settings.output.aspectRatio} •{' '}
            {settings.output.frameRate === 'auto' ? 'Auto FPS' : `${settings.output.frameRate} FPS`}
          </span>
        </div>
        {activePreset && <p>{activePreset.description}</p>}
        {settings.platform === 'custom' && <p>Manual output configuration for any destination.</p>}
      </div>
    </section>
  )
}
