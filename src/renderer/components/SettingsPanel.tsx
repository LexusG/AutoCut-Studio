import { useEffect, useState } from 'react'
import { ChevronDown, Gauge, Scissors, SlidersHorizontal, Video } from 'lucide-react'
import type {
  AspectRatio,
  OutputFrameRate,
  RenderQuality,
  TargetDurationMode
} from '@shared/types'
import { MANUAL_RESOLUTIONS } from '@shared/utils/project-settings'
import { validateProjectSettings } from '@shared/utils/project-validation'
import { useAppStore } from '../stores/app-store'
import { AudioPanel } from './AudioPanel'
import { PlatformPresetSelector } from './PlatformPresetSelector'
import { StoragePanel } from './StoragePanel'

const aspectDimensions: Record<Exclude<AspectRatio, 'original'>, { width: number; height: number }> = {
  '16:9': { width: 1920, height: 1080 },
  '9:16': { width: 1080, height: 1920 },
  '1:1': { width: 1080, height: 1080 },
  '4:5': { width: 1080, height: 1350 }
}

function ToggleSetting({
  label,
  description,
  checked,
  onChange
}: {
  label: string
  description?: string
  checked: boolean
  onChange: (value: boolean) => void
}): React.JSX.Element {
  return (
    <label className="settings-toggle-row settings-toggle-emphasis">
      <span><strong>{label}</strong>{description && <small>{description}</small>}</span>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
    </label>
  )
}

export function SettingsPanel(): React.JSX.Element {
  const settings = useAppStore((state) => state.projectSettings)
  const clipCount = useAppStore((state) => state.clips.length)
  const firstClip = useAppStore((state) => state.clips[0] ?? null)
  const updateOutput = useAppStore((state) => state.updateOutput)
  const updateEditing = useAppStore((state) => state.updateEditing)
  const updateTargetDuration = useAppStore((state) => state.updateTargetDuration)
  const setOutputFilename = useAppStore((state) => state.setOutputFilename)
  const setPreviewQuality = useAppStore((state) => state.setPreviewQuality)
  const personStatus = useAppStore((state) => state.personDetectionStatus)
  const [outputFilenameDraft, setOutputFilenameDraft] = useState(settings.outputFilename)
  useEffect(() => setOutputFilenameDraft(settings.outputFilename), [settings.outputFilename])
  const warnings = validateProjectSettings(settings, clipCount).filter(
    (issue) => issue.severity === 'warning'
  )
  const output = settings.output
  const editing = settings.editing
  const resolutionValue =
    MANUAL_RESOLUTIONS.find(
      (resolution) => resolution.width === output.width && resolution.height === output.height
    )?.label ?? 'Custom'

  const changeAspect = (aspectRatio: AspectRatio): void => {
    if (aspectRatio === 'original') {
      const quarterTurn = firstClip && Math.abs(firstClip.video.rotation) % 180 === 90
      updateOutput({
        aspectRatio,
        ...(firstClip
          ? {
              width: quarterTurn ? firstClip.video.height : firstClip.video.width,
              height: quarterTurn ? firstClip.video.width : firstClip.video.height
            }
          : {})
      })
    }
    else updateOutput({ aspectRatio, ...aspectDimensions[aspectRatio] })
  }

  const changeTargetMode = (mode: TargetDurationMode): void => {
    updateTargetDuration({
      mode,
      seconds: mode === 'auto' ? null : mode === 'custom' ? (editing.targetDuration.seconds ?? 30) : Number(mode)
    })
  }

  return (
    <aside className="settings-panel" aria-label="Project configuration">
      <div className="settings-heading">
        <div><SlidersHorizontal size={17} /><h2>Project Settings</h2></div>
        <span>PHASE 5</span>
      </div>

      <div className="settings-scroll">
        <PlatformPresetSelector />

        <details className="settings-details" open>
          <summary><Video size={14} /> Video Settings <ChevronDown size={13} /></summary>
          <div className="settings-details-body">
            <label className="stacked-setting">
              <span>Arrangement</span>
              <select value={editing.arrangement} onChange={(event) => updateEditing('arrangement', event.target.value as typeof editing.arrangement)}>
                <option value="original-order">Keep Original Order</option>
                <option value="automatic">Automatic Arrangement</option>
                <option value="random">Random Montage</option>
              </select>
            </label>
            <label className="stacked-setting">
              <span>Resolution</span>
              <select
                value={resolutionValue}
                onChange={(event) => {
                  const resolution = MANUAL_RESOLUTIONS.find((item) => item.label === event.target.value)
                  if (resolution) updateOutput({ width: resolution.width, height: resolution.height, aspectRatio: resolution.aspectRatio })
                }}
              >
                {MANUAL_RESOLUTIONS.map((resolution) => <option key={resolution.label}>{resolution.label}</option>)}
                <option>Custom</option>
              </select>
            </label>
            <div className="dimension-inputs">
              <label><span>Width</span><input aria-label="Output width" type="number" min="2" max="7680" step="2" value={output.width} onChange={(event) => updateOutput({ width: Number(event.target.value) })} /></label>
              <span>×</span>
              <label><span>Height</span><input aria-label="Output height" type="number" min="2" max="7680" step="2" value={output.height} onChange={(event) => updateOutput({ height: Number(event.target.value) })} /></label>
            </div>
            <label className="stacked-setting">
              <span>Aspect ratio</span>
              <select value={output.aspectRatio} onChange={(event) => changeAspect(event.target.value as AspectRatio)}>
                <option value="original">Original</option>
                <option value="16:9">16:9</option>
                <option value="9:16">9:16</option>
                <option value="1:1">1:1</option>
                <option value="4:5">4:5</option>
              </select>
            </label>
            <label className="stacked-setting">
              <span>Frame rate</span>
              <select
                value={String(output.frameRate)}
                onChange={(event) => {
                  const value = event.target.value
                  updateOutput({ frameRate: value === 'auto' ? 'auto' : Number(value) as OutputFrameRate })
                }}
              >
                <option value="auto">Auto</option>
                <option value="24">24 FPS</option>
                <option value="30">30 FPS</option>
                <option value="60">60 FPS</option>
              </select>
            </label>
            <label className="stacked-setting">
              <span>Fit mode</span>
              <select value={output.fitMode} onChange={(event) => updateOutput({ fitMode: event.target.value as 'crop' | 'fit' })}>
                <option value="crop">Crop to Fill</option>
                <option value="fit">Fit</option>
              </select>
            </label>
            {output.fitMode === 'fit' && (
              <>
                <label className="stacked-setting">
                  <span>Fit background</span>
                  <select value={output.fitBackground} onChange={(event) => updateOutput({ fitBackground: event.target.value as typeof output.fitBackground })}>
                    <option value="black">Black</option>
                    <option value="blurred">Blurred</option>
                  </select>
                </label>
                {output.fitBackground === 'blurred' && (
                  <label className="stacked-setting">
                    <span>Blur strength</span>
                    <select value={output.blurStrength} onChange={(event) => updateOutput({ blurStrength: event.target.value as typeof output.blurStrength })}>
                      <option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option>
                    </select>
                  </label>
                )}
              </>
            )}
          </div>
        </details>

        <details className="settings-details" open>
          <summary><Scissors size={14} /> Editing Settings <ChevronDown size={13} /></summary>
          <div className="settings-details-body">
            <label className="stacked-setting">
              <span>Selection mode</span>
              <select value={editing.selectionMode} onChange={(event) => updateEditing('selectionMode', event.target.value as typeof editing.selectionMode)}>
                <option value="classic">Classic</option>
                <option value="smart">Smart</option>
              </select>
              {editing.selectionMode === 'smart' && <small>Analyzes clips locally for stronger visual, motion, and audio moments.</small>}
            </label>
            {editing.selectionMode === 'smart' && (
              <>
                <label className="stacked-setting">
                  <span>Analysis quality</span>
                  <select value={editing.analysisQuality} onChange={(event) => updateEditing('analysisQuality', event.target.value as typeof editing.analysisQuality)}>
                    <option value="fast">Fast</option><option value="balanced">Balanced</option><option value="detailed">Detailed</option>
                  </select>
                </label>
                <details className="smart-preferences">
                  <summary>Advanced Smart Settings</summary>
                  <div className={`model-status model-status-${personStatus?.state ?? 'ready'}`}><span>Person Detection</span><strong>{personStatus?.label ?? 'Checking local model'}</strong>{personStatus?.detail && <small>{personStatus.detail} Smart Selection will continue without person scoring.</small>}</div>
                  <ToggleSetting label="Prefer People" checked={editing.smartPreferences.preferPeople} onChange={(preferPeople) => updateEditing('smartPreferences', { ...editing.smartPreferences, preferPeople })} />
                  <ToggleSetting label="Prefer Motion" checked={editing.smartPreferences.preferMotion} onChange={(preferMotion) => updateEditing('smartPreferences', { ...editing.smartPreferences, preferMotion })} />
                  <ToggleSetting label="Prefer Clear Footage" checked={editing.smartPreferences.preferClearFootage} onChange={(preferClearFootage) => updateEditing('smartPreferences', { ...editing.smartPreferences, preferClearFootage })} />
                  <ToggleSetting label="Prefer Audible Moments" checked={editing.smartPreferences.preferAudibleMoments} onChange={(preferAudibleMoments) => updateEditing('smartPreferences', { ...editing.smartPreferences, preferAudibleMoments })} />
                </details>
              </>
            )}
            <label className="stacked-setting">
              <span>Editing pace</span>
              <select value={editing.pace} onChange={(event) => updateEditing('pace', event.target.value as 'slow' | 'normal' | 'fast')}>
                <option value="slow">Slow</option>
                <option value="normal">Normal</option>
                <option value="fast">Fast</option>
              </select>
              <small>{editing.pace === 'slow' ? 'Prefers 5–10 second sections.' : editing.pace === 'fast' ? 'Prefers 1.5–4 second sections.' : 'Prefers 3–6 second sections.'}</small>
            </label>
            <ToggleSetting
              label="Use Every Clip"
              description="Guarantees that every imported clip appears in the final video."
              checked={editing.useEveryClip}
              onChange={(value) => updateEditing('useEveryClip', value)}
            />
            <label className="stacked-setting">
              <span>Target duration</span>
              <select value={editing.targetDuration.mode} onChange={(event) => changeTargetMode(event.target.value as TargetDurationMode)}>
                <option value="auto">Auto</option>
                <option value="15">15 seconds</option>
                <option value="30">30 seconds</option>
                <option value="60">60 seconds</option>
                <option value="90">90 seconds</option>
                <option value="custom">Custom</option>
              </select>
            </label>
            {editing.targetDuration.mode === 'custom' && (
              <label className="setting-field setting-field-number">
                <span>Seconds</span>
                <div><input aria-label="Custom target duration" type="number" min="1" step="1" value={editing.targetDuration.seconds ?? 30} onChange={(event) => updateTargetDuration({ mode: 'custom', seconds: Number(event.target.value) })} /><small>sec</small></div>
              </label>
            )}
            <label className="stacked-setting">
              <span>Transition preference</span>
              <select value={editing.transitionPreference} onChange={(event) => updateEditing('transitionPreference', event.target.value as typeof editing.transitionPreference)}>
                <option value="none">None</option>
                <option value="crossfade">Crossfade</option>
                <option value="fade">Fade</option>
                <option value="dip-to-black">Dip to Black</option>
              </select>
            </label>
            {editing.transitionPreference !== 'none' && (
              <label className="stacked-setting">
                <span>Transition duration</span>
                <select
                  value={String(editing.transitionDuration)}
                  onChange={(event) => updateEditing('transitionDuration', Number(event.target.value))}
                >
                  <option value="0.25">0.25 seconds</option>
                  <option value="0.5">0.5 seconds</option>
                  <option value="1">1 second</option>
                </select>
              </label>
            )}
            {warnings.map((warning) => <div className="settings-warning" key={warning.code}>{warning.message}</div>)}
          </div>
        </details>

        <AudioPanel />

        <StoragePanel />

        <details className="settings-details" open>
          <summary><Gauge size={14} /> Export Settings <ChevronDown size={13} /></summary>
          <div className="settings-details-body">
            <label className="stacked-setting">
              <span>Preview quality</span>
              <select value={settings.previewQuality} onChange={(event) => setPreviewQuality(event.target.value as 'fast' | 'full')}>
                <option value="fast">Fast Preview</option>
                <option value="full">Full Quality Preview</option>
              </select>
            </label>
            <label className="stacked-setting">
              <span>Output quality</span>
              <select value={output.quality} onChange={(event) => updateOutput({ quality: event.target.value as RenderQuality })}>
                <option value="draft">Draft</option>
                <option value="balanced">Balanced</option>
                <option value="high">High Quality</option>
              </select>
            </label>
            <label className="stacked-setting">
              <span>Output filename</span>
              <input
                value={outputFilenameDraft}
                onChange={(event) => setOutputFilenameDraft(event.target.value)}
                onBlur={() => setOutputFilename(outputFilenameDraft)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') event.currentTarget.blur()
                  if (event.key === 'Escape') {
                    setOutputFilenameDraft(settings.outputFilename)
                    event.currentTarget.blur()
                  }
                }}
              />
            </label>
            <div className="codec-summary"><span>Video</span><strong>H.264</strong><span>Audio</span><strong>AAC</strong></div>
          </div>
        </details>
      </div>
    </aside>
  )
}
