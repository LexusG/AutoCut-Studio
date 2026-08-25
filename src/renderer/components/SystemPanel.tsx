import { Activity, Check, Clipboard, FolderOpen, RefreshCw, Settings, Wrench, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { ProcessingResourceMode, RuntimeDiagnostics } from '@shared/types'

function bytes(value: number): string {
  if (value < 1024) return `${value} B`
  if (value < 1024 ** 2) return `${(value / 1024).toFixed(1)} KB`
  if (value < 1024 ** 3) return `${(value / 1024 ** 2).toFixed(1)} MB`
  return `${(value / 1024 ** 3).toFixed(2)} GB`
}

interface SystemPanelProps {
  open: boolean
  close: () => void
}

export function SystemPanel({ open, close }: SystemPanelProps): React.JSX.Element | null {
  const [diagnostics, setDiagnostics] = useState<RuntimeDiagnostics | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [resourceMode, setResourceMode] = useState<ProcessingResourceMode>('balanced')

  const refresh = async (force = false): Promise<void> => {
    setBusy(true); setMessage(null)
    try { setDiagnostics(await window.autoCut.getRuntimeDiagnostics(force)) }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Diagnostics are unavailable.') }
    finally { setBusy(false) }
  }

  useEffect(() => { if (open) { void refresh(); void window.autoCut.getProcessingResourceMode().then(setResourceMode) } }, [open])
  if (!open) return null

  const changeMode = (mode: ProcessingResourceMode): void => {
    setResourceMode(mode)
    void window.autoCut.setProcessingResourceMode(mode)
  }
  const installModel = async (id: string): Promise<void> => {
    setBusy(true); setMessage(null)
    try {
      if (id === 'minilm') await window.autoCut.installSemanticModel()
      else if (id === 'sherpa-onnx-diarization') await window.autoCut.installDiarizationModels()
      setMessage('Model installed and verified.')
      await refresh(true)
    } catch (error) { setMessage(error instanceof Error ? error.message : 'The model could not be installed.') }
    finally { setBusy(false) }
  }
  const removeModel = async (id: string): Promise<void> => {
    if (!window.confirm('Remove this regenerable model? Project data and corrections will be kept.')) return
    setBusy(true); setMessage(null)
    try {
      if (id === 'minilm') await window.autoCut.removeSemanticModel()
      else if (id === 'sherpa-onnx-diarization') await window.autoCut.removeDiarizationModels()
      setMessage('Model removed. It can be installed again for offline processing.')
      await refresh(true)
    } catch (error) { setMessage(error instanceof Error ? error.message : 'The model could not be removed.') }
    finally { setBusy(false) }
  }

  return (
    <div className="system-overlay" role="dialog" aria-modal="true" aria-label="Local AI and Processing">
      <section className="system-panel">
        <header>
          <div><Settings size={19} /><div><h2>Local AI &amp; Processing</h2><span>Runtime health, models and storage</span></div></div>
          <button className="icon-button" type="button" title="Close Local AI and Processing" aria-label="Close Local AI and Processing" onClick={close}><X size={18} /></button>
        </header>
        <div className="system-toolbar">
          <label><span>Resource Mode</span><select value={resourceMode} onChange={(event) => changeMode(event.target.value as ProcessingResourceMode)}><option value="low-memory">Low Memory</option><option value="balanced">Balanced</option><option value="maximum-performance">Maximum Performance</option></select></label>
          <button className="button button-secondary" type="button" disabled={busy} onClick={() => void refresh(true)}><RefreshCw size={14} /> Verify All</button>
          <button className="button button-secondary" type="button" onClick={() => void window.autoCut.copyRuntimeDiagnostics().then(() => setMessage('Diagnostics copied.'))}><Clipboard size={14} /> Copy Diagnostics</button>
          <button className="button button-secondary" type="button" onClick={() => void window.autoCut.openProcessingStorage()}><FolderOpen size={14} /> Open Storage</button>
        </div>

        {diagnostics && <div className="system-summary">
          <div><span>Application</span><strong>{diagnostics.environment.applicationVersion}</strong></div>
          <div><span>Electron</span><strong>{diagnostics.environment.electronVersion}</strong></div>
          <div><span>Platform</span><strong>{diagnostics.environment.platform} · {diagnostics.environment.architecture}</strong></div>
          <div><span>Mode</span><strong>{diagnostics.environment.packaged ? 'Packaged' : 'Development'}</strong></div>
        </div>}

        <div className="runtime-list">
          {diagnostics?.components.map((component) => <article className="runtime-row" key={component.id}>
            <div className={`runtime-state runtime-state-${component.status}`}>{component.status === 'ready' ? <Check size={15} /> : <Activity size={15} />}</div>
            <div className="runtime-copy"><strong>{component.name}</strong><span>{component.status.replaceAll('-', ' ')} · {component.source} · {component.architecture}</span><small>{component.version ?? 'Version unavailable'}{component.bytes ? ` · ${bytes(component.bytes)}` : ''}</small>{component.error && <p>{component.error}</p>}</div>
            {component.status === 'not-installed' && (component.id === 'minilm' || component.id === 'sherpa-onnx-diarization')
              ? <button className="button button-secondary" type="button" disabled={busy} onClick={() => void installModel(component.id)}><Wrench size={13} /> Install Model</button>
              : component.status === 'ready' && (component.id === 'minilm' || component.id === 'sherpa-onnx-diarization')
                ? <button className="button button-secondary" type="button" disabled={busy} onClick={() => void removeModel(component.id)}><X size={13} /> Remove Model</button>
                : component.status !== 'ready' && component.source === 'bundled' && <button className="button button-secondary" type="button" onClick={() => void window.autoCut.repairRuntime(component.id).then((result) => { setMessage(result.message); return refresh(true) })}><Wrench size={13} /> Repair</button>}
          </article>)}
        </div>

        {diagnostics && <section className="storage-summary"><h3>Storage</h3><div><span>AI &amp; Models</span><strong>{bytes(diagnostics.storage.models)}</strong></div><div><span>Projects &amp; Previews</span><strong>{bytes(diagnostics.storage.previews)}</strong></div><div><span>Analysis Cache</span><strong>{bytes(diagnostics.storage.analysisCache)}</strong></div><div><span>Packaged Runtime</span><strong>{bytes(diagnostics.storage.runtime)}</strong></div><div className="storage-total"><span>Total AutoCut Studio Data</span><strong>{bytes(diagnostics.storage.total)}</strong></div></section>}
        {message && <div className="system-message" role="status">{message}</div>}
      </section>
    </div>
  )
}
