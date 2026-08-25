import type { CaptionSettings, CaptionTemplate } from '../types'
import { DEFAULT_CAPTION_SETTINGS } from './caption-defaults'

const BUILT_IN_DATE = '2026-01-01T00:00:00.000Z'

function withStyle(id: string, name: string, patch: Partial<CaptionSettings>): CaptionTemplate {
  const base = DEFAULT_CAPTION_SETTINGS
  const settings: CaptionSettings = {
    ...base,
    ...patch,
    mode: patch.mode ?? 'standard',
    subtitleOutput: patch.subtitleOutput ?? 'burned-in',
    templateId: id,
    style: { ...base.style, ...(patch.style ?? {}) }
  }
  return { id, name, builtIn: true, settings, createdAt: BUILT_IN_DATE, updatedAt: BUILT_IN_DATE }
}

export const BUILT_IN_CAPTION_TEMPLATES: CaptionTemplate[] = [
  withStyle('clean', 'Clean', { style: { preset: 'clean', fontSize: 48, fontWeight: 600, backgroundEnabled: true, position: 'bottom' } as CaptionSettings['style'] }),
  withStyle('social-bold', 'Social Bold', { mode: 'dynamic', animation: 'pop', style: { preset: 'social-bold', fontSize: 68, fontWeight: 800, backgroundEnabled: true, position: 'lower-middle', maximumWidth: 78 } as CaptionSettings['style'] }),
  withStyle('minimal', 'Minimal', { style: { preset: 'minimal', fontSize: 38, fontWeight: 500, backgroundEnabled: false, outline: 1, shadow: 1, position: 'bottom' } as CaptionSettings['style'] }),
  withStyle('karaoke', 'Karaoke Highlight', { mode: 'dynamic', animation: 'fade', highlightBehavior: 'color', style: { preset: 'karaoke', fontSize: 58, fontWeight: 700, backgroundEnabled: false, outline: 3, shadow: 2, position: 'lower-middle' } as CaptionSettings['style'] }),
  withStyle('interview', 'Interview', { showSpeakerNames: true, style: { preset: 'interview', fontSize: 44, fontWeight: 600, backgroundEnabled: true, alignment: 'left', position: 'bottom', maximumWidth: 82 } as CaptionSettings['style'] }),
  withStyle('documentary', 'Documentary', { style: { preset: 'documentary', fontSize: 40, fontWeight: 500, backgroundEnabled: false, outline: 2, shadow: 2, position: 'bottom', maximumWidth: 80 } as CaptionSettings['style'] }),
  withStyle('lower-third', 'Lower Third', { showSpeakerNames: true, style: { preset: 'lower-third', fontSize: 38, fontWeight: 600, backgroundEnabled: true, alignment: 'left', position: 'bottom', maximumWidth: 68 } as CaptionSettings['style'] })
]

export function getBuiltInCaptionTemplate(id: string): CaptionTemplate | null {
  return BUILT_IN_CAPTION_TEMPLATES.find((template) => template.id === id) ?? null
}
