import type { OutputVariant, ProjectSettings, RenderSettings, VariantPresetSelection } from '../types'
import { applyPlatformPreset, toRenderSettings } from './project-settings'

export const VARIANT_PRESETS: Array<{
  id: VariantPresetSelection['presetId']
  name: string
  duration: number
}> = [
  { id: 'instagram-reel', name: 'Instagram Reel', duration: 60 },
  { id: 'instagram-story', name: 'Instagram Story', duration: 30 },
  { id: 'youtube-shorts', name: 'YouTube Short', duration: 60 },
  { id: 'linkedin-portrait', name: 'LinkedIn Portrait', duration: 45 },
  { id: 'custom', name: 'Custom', duration: 30 }
]

export function createOutputVariant(
  parentProjectId: string,
  settings: ProjectSettings,
  presetId: VariantPresetSelection['presetId']
): OutputVariant {
  const preset = VARIANT_PRESETS.find((item) => item.id === presetId) ?? VARIANT_PRESETS.at(-1)!
  const variantSettings = presetId === 'custom' ? structuredClone(settings) : applyPlatformPreset(structuredClone(settings), presetId)
  const now = new Date().toISOString()
  const social = presetId === 'instagram-reel' || presetId === 'instagram-story' || presetId === 'youtube-shorts'
  const linkedIn = presetId === 'linkedin-portrait'
  const captionSettings = structuredClone(variantSettings.captions)
  if (social || linkedIn) {
    captionSettings.mode = social ? 'dynamic' : 'standard'
    captionSettings.subtitleOutput = 'burned-in'
    captionSettings.style = {
      ...captionSettings.style,
      preset: social ? 'bold' : 'clean',
      position: social ? 'lower-middle' : 'bottom'
    }
  }
  return {
    id: crypto.randomUUID(),
    parentProjectId,
    name: preset.name,
    platformPresetId: presetId,
    targetDuration: preset.duration,
    aspectRatio: variantSettings.output.aspectRatio,
    width: variantSettings.output.width,
    height: variantSettings.output.height,
    captionSettings,
    selectionMode: 'social-cut',
    editGoal: settings.semantic.editGoal,
    editGoalStrength: settings.semantic.editGoalStrength,
    preserveIntro: false,
    preserveOutro: false,
    renderPlan: null,
    previewHistory: [],
    approval: 'not-generated',
    previewStatus: 'idle',
    exportStatus: 'idle',
    outputPath: null,
    fileSize: null,
    revision: 1,
    createdAt: now,
    updatedAt: now
  }
}

export function toVariantProjectSettings(settings: ProjectSettings, variant: OutputVariant): ProjectSettings {
  const variantProject = variant.platformPresetId === 'custom'
    ? structuredClone(settings)
    : applyPlatformPreset(structuredClone(settings), variant.platformPresetId)
  variantProject.output = {
    ...variantProject.output,
    width: variant.width,
    height: variant.height,
    aspectRatio: variant.aspectRatio,
    cropFocus: 'smart-subject'
  }
  variantProject.editing = {
    ...variantProject.editing,
    targetDuration: { mode: 'custom', seconds: variant.targetDuration },
    selectionMode: 'smart',
    useEveryClip: false
  }
  variantProject.captions = structuredClone(variant.captionSettings)
  variantProject.semantic = {
    ...variantProject.semantic,
    editGoal: variant.editGoal,
    editGoalStrength: variant.editGoalStrength
  }
  return variantProject
}

export function toVariantRenderSettings(settings: ProjectSettings, variant: OutputVariant): RenderSettings {
  return toRenderSettings(toVariantProjectSettings(settings, variant))
}

export function updateOutputVariant(variant: OutputVariant, patch: Partial<OutputVariant>): OutputVariant {
  const affectsPlan = ['targetDuration', 'aspectRatio', 'width', 'height', 'captionSettings', 'selectionMode', 'editGoal', 'editGoalStrength', 'preserveIntro', 'preserveOutro']
    .some((key) => key in patch)
  return {
    ...variant,
    ...patch,
    renderPlan: affectsPlan ? null : (patch.renderPlan ?? variant.renderPlan),
    previewHistory: affectsPlan ? variant.previewHistory.map((preview) => ({ ...preview, outdated: true })) : (patch.previewHistory ?? variant.previewHistory),
    approval: affectsPlan ? 'needs-changes' : (patch.approval ?? variant.approval),
    previewStatus: affectsPlan ? 'idle' : (patch.previewStatus ?? variant.previewStatus),
    revision: variant.revision + 1,
    updatedAt: new Date().toISOString()
  }
}
