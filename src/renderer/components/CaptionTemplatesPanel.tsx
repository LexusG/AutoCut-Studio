import { Copy, Save, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { CaptionSettings, CaptionTemplate } from '@shared/types'

export function CaptionTemplatesPanel({ settings, apply }: {
  settings: CaptionSettings
  apply: (settings: CaptionSettings) => void
}): React.JSX.Element {
  const [templates, setTemplates] = useState<CaptionTemplate[]>([])
  const [error, setError] = useState<string | null>(null)
  const reload = (): void => { void window.autoCut.getCaptionTemplates().then(setTemplates).catch((reason) => setError(reason instanceof Error ? reason.message : 'Templates could not be loaded.')) }
  useEffect(reload, [])
  const save = async (): Promise<void> => {
    const name = window.prompt('Template name')?.trim()
    if (!name) return
    try { await window.autoCut.saveCaptionTemplate(name, settings); reload() }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Template could not be saved.') }
  }
  const rename = async (template: CaptionTemplate): Promise<void> => {
    const name = window.prompt('Template name', template.name)?.trim()
    if (!name) return
    try { setTemplates(await window.autoCut.renameCaptionTemplate(template.id, name)) }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Template could not be renamed.') }
  }
  return <section className="caption-template-section">
    <header><div><h3>Caption Templates</h3><span>Applying a template keeps the current caption renderer.</span></div><button className="icon-button" title="Save current style as template" type="button" onClick={() => void save()}><Save size={15} /></button></header>
    <div className="caption-template-grid">
      {templates.map((template) => <article className={settings.templateId === template.id ? 'caption-template-card caption-template-active' : 'caption-template-card'} key={template.id}>
        <button className="caption-template-preview" type="button" onClick={() => apply({ ...structuredClone(template.settings), templateId: template.id })}>
          <span style={{ color: template.settings.style.textColor, fontWeight: template.settings.style.fontWeight, background: template.settings.style.backgroundEnabled ? `rgba(0,0,0,${template.settings.style.backgroundOpacity})` : 'transparent' }}>Ready for the next cut</span>
        </button>
        <div><strong>{template.name}</strong><small>{template.builtIn ? 'Built in' : 'Custom'}</small></div>
        <div className="caption-template-actions">
          {!template.builtIn && <button title="Rename template" type="button" onClick={() => void rename(template)}>Rename</button>}
          <button title="Duplicate template" type="button" onClick={() => void window.autoCut.duplicateCaptionTemplate(template.id).then(reload)}><Copy size={13} /></button>
          {!template.builtIn && <button title="Delete template" type="button" onClick={() => void window.autoCut.deleteCaptionTemplate(template.id).then(setTemplates)}><Trash2 size={13} /></button>}
        </div>
      </article>)}
    </div>
    {error && <div className="inline-error" role="alert">{error}</div>}
  </section>
}
