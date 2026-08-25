import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { CaptionSettings, CaptionTemplate } from '@shared/types'
import { createDefaultProjectSettings } from '@shared/utils/project-settings'
import { applicationStoragePaths } from '../filesystem/application-storage'
import { writeFileAtomic } from '../filesystem/atomic-write'

const BUILT_IN_DATE = '2026-01-01T00:00:00.000Z'

function withStyle(id: string, name: string, patch: Partial<CaptionSettings>): CaptionTemplate {
  const base = createDefaultProjectSettings().captions
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

function settingsPath(): string {
  return join(applicationStoragePaths().root, 'settings', 'caption-templates.json')
}

async function customTemplates(): Promise<CaptionTemplate[]> {
  try {
    const value = JSON.parse(await readFile(settingsPath(), 'utf8')) as unknown
    if (!Array.isArray(value)) return []
    return value.filter((item): item is CaptionTemplate => Boolean(item && typeof item === 'object' && typeof (item as CaptionTemplate).id === 'string' && typeof (item as CaptionTemplate).name === 'string' && !(item as CaptionTemplate).builtIn))
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw error
  }
}

async function persist(templates: CaptionTemplate[]): Promise<void> {
  await writeFileAtomic(settingsPath(), `${JSON.stringify(templates, null, 2)}\n`, { mode: 0o600 })
}

export async function getCaptionTemplates(): Promise<CaptionTemplate[]> {
  return [...structuredClone(BUILT_IN_CAPTION_TEMPLATES), ...await customTemplates()]
}

export async function saveCaptionTemplate(name: string, settings: CaptionSettings): Promise<CaptionTemplate> {
  const trimmed = name.trim().slice(0, 80)
  if (!trimmed) throw new Error('Enter a template name.')
  const now = new Date().toISOString()
  const template: CaptionTemplate = {
    id: crypto.randomUUID(), name: trimmed, builtIn: false,
    settings: { ...structuredClone(settings), templateId: undefined }, createdAt: now, updatedAt: now
  }
  const templates = await customTemplates()
  templates.push(template)
  await persist(templates)
  return template
}

export async function renameCaptionTemplate(id: string, name: string): Promise<CaptionTemplate[]> {
  const trimmed = name.trim().slice(0, 80)
  if (!trimmed) throw new Error('Enter a template name.')
  const templates = await customTemplates()
  const template = templates.find((item) => item.id === id)
  if (!template) throw new Error('Only custom templates can be renamed.')
  template.name = trimmed
  template.updatedAt = new Date().toISOString()
  await persist(templates)
  return getCaptionTemplates()
}

export async function duplicateCaptionTemplate(id: string): Promise<CaptionTemplate> {
  const source = (await getCaptionTemplates()).find((item) => item.id === id)
  if (!source) throw new Error('Caption template not found.')
  return saveCaptionTemplate(`${source.name} Copy`, source.settings)
}

export async function deleteCaptionTemplate(id: string): Promise<CaptionTemplate[]> {
  if (BUILT_IN_CAPTION_TEMPLATES.some((item) => item.id === id)) throw new Error('Built-in templates are protected.')
  const templates = (await customTemplates()).filter((item) => item.id !== id)
  await persist(templates)
  return getCaptionTemplates()
}
