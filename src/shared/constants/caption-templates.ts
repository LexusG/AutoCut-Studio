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
  withStyle('lower-third', 'Lower Third', { showSpeakerNames: true, style: { preset: 'lower-third', fontSize: 38, fontWeight: 600, backgroundEnabled: true, alignment: 'left', position: 'bottom', maximumWidth: 68 } as CaptionSettings['style'] }),
  withStyle('impact-pop', 'Impact Pop', { mode: 'dynamic', animation: 'bounce', highlightBehavior: 'box-pop', wordDisplay: 'cumulative', style: { preset: 'impact-pop', fontSize: 76, fontWeight: 800, textColor: '#ffffff', highlightColor: '#22d3ee', backgroundEnabled: false, outline: 5, shadow: 2, position: 'center', maximumWidth: 74 } as CaptionSettings['style'] }),
  withStyle('karaoke-fill', 'Karaoke Fill', { mode: 'dynamic', animation: 'slide-up', highlightBehavior: 'karaoke-fill', style: { preset: 'karaoke-fill', fontSize: 62, fontWeight: 700, highlightColor: '#facc15', backgroundEnabled: false, outline: 4, shadow: 2, position: 'lower-middle', maximumWidth: 80 } as CaptionSettings['style'] }),
  withStyle('neon-glow', 'Neon Glow', { mode: 'dynamic', animation: 'blur-in', highlightBehavior: 'glow', style: { preset: 'neon-glow', fontSize: 66, fontWeight: 800, textColor: '#ffffff', highlightColor: '#f472b6', backgroundEnabled: false, outline: 2, shadow: 0, position: 'lower-middle', maximumWidth: 76 } as CaptionSettings['style'] }),
  withStyle('word-pop', 'One Word Punch', { mode: 'dynamic', animation: 'zoom-punch', highlightBehavior: 'color', wordDisplay: 'single', style: { preset: 'word-pop', fontSize: 104, fontWeight: 800, textColor: '#ffffff', highlightColor: '#fde047', backgroundEnabled: false, outline: 6, shadow: 3, position: 'center', maximumWidth: 88 } as CaptionSettings['style'] })
]

export function getBuiltInCaptionTemplate(id: string): CaptionTemplate | null {
  return BUILT_IN_CAPTION_TEMPLATES.find((template) => template.id === id) ?? null
}
