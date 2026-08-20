import { useEffect, useRef, useState } from 'react'
import { Check, Download, Layers3, LoaderCircle, Play, Plus, Square, Trash2, X } from 'lucide-react'
import type { OutputVariant, PreviewVersion, VariantPresetSelection } from '@shared/types'
import { createOutputVariant, toVariantProjectSettings, toVariantRenderSettings, VARIANT_PRESETS } from '@shared/utils/output-variants'
import { sanitizeFilenamePart } from '@shared/utils/project-settings'
import { useAppStore } from '../stores/app-store'

export function VersionsPanel(): React.JSX.Element {
  const projectId = useAppStore((state) => state.projectId)
  const settings = useAppStore((state) => state.projectSettings)
  const clips = useAppStore((state) => state.clips)
  const transcripts = useAppStore((state) => state.transcripts)
  const topics = useAppStore((state) => state.topics)
  const hints = useAppStore((state) => state.semanticHints)
  const highlights = useAppStore((state) => state.highlightCandidates)
  const variants = useAppStore((state) => state.outputVariants)
  const addVariants = useAppStore((state) => state.addOutputVariants)
  const updateVariant = useAppStore((state) => state.updateOutputVariant)
  const removeVariant = useAppStore((state) => state.removeOutputVariant)
  const [selectedPresets, setSelectedPresets] = useState<VariantPresetSelection['presetId'][]>(['instagram-reel', 'youtube-shorts', 'linkedin-portrait'])
  const [queueRunning, setQueueRunning] = useState(false)
  const [currentVariantId, setCurrentVariantId] = useState<string | null>(null)
  const [currentRenderId, setCurrentRenderId] = useState<string | null>(null)
  const [progress, setProgress] = useState(0)
  const cancelAll = useRef(false)

  useEffect(() => window.autoCut.onRenderProgress((renderProgress) => {
    if (renderProgress.renderId === currentRenderId) setProgress(renderProgress.percent)
  }), [currentRenderId])

  const createVersions = (): void => addVariants(selectedPresets.map((presetId) => createOutputVariant(projectId, settings, presetId)))

  const planVariant = async (variant: OutputVariant): Promise<OutputVariant> => {
    const renderId = crypto.randomUUID()
    setCurrentRenderId(renderId)
    updateVariant(variant.id, { previewStatus: 'rendering' })
    const fingerprint = `phase8-variant-${variant.id}-${variant.revision}`
    const outcome = await window.autoCut.createEditPlan({
      renderId,
      projectId,
      generation: variant.renderPlan?.generation ? variant.renderPlan.generation + 1 : 0,
      sourcePaths: clips.map((clip) => clip.path),
      settingsFingerprint: fingerprint,
      settings: toVariantRenderSettings(settings, variant),
      currentPlan: variant.renderPlan,
      semanticHints: hints,
      topicSelections: topics.map((topic) => ({ topicId: topic.id, importance: topic.importance })),
      variantId: variant.id,
      generationMode: 'social-cut'
    })
    if (!outcome.success) throw new Error(outcome.issue.message)
    let plan = outcome.plan
    const selectedHighlights = highlights.filter((highlight) => highlight.selected && !highlight.excluded)
    if (selectedHighlights.length) {
      try {
        plan = await window.autoCut.createHighlightReel({
          projectId, parentPlan: plan, highlights, targetDuration: variant.targetDuration,
          preserveIntro: variant.preserveIntro, preserveOutro: variant.preserveOutro,
          mode: 'social-cut', variantId: variant.id
        })
      } catch { /* Smart semantic selection remains a valid social plan fallback. */ }
    }
    if (variant.captionSettings.mode !== 'off') {
      const captionTrack = await window.autoCut.buildCaptionTrack({ plan, transcripts, settings: variant.captionSettings })
      plan = {
        ...plan,
        captionTrack,
        captionMode: variant.captionSettings.mode,
        subtitleOutput: variant.captionSettings.subtitleOutput,
        captionStyle: structuredClone(variant.captionSettings.style),
        captionSafeArea: variant.captionSettings.safeAreaPreset,
        captionHighlightSpokenWord: variant.captionSettings.highlightSpokenWord,
        captionHighlightBehavior: variant.captionSettings.highlightBehavior,
        captionAnimation: variant.captionSettings.animation
      }
    }
    updateVariant(variant.id, { renderPlan: plan, previewStatus: 'idle', approval: 'needs-changes' })
    return { ...variant, renderPlan: plan }
  }

  const previewVariant = async (id: string): Promise<void> => {
    let variant = useAppStore.getState().outputVariants.find((item) => item.id === id)
    if (!variant) return
    setCurrentVariantId(id); setProgress(0)
    try {
      if (!variant.renderPlan) variant = await planVariant(variant)
      const renderId = crypto.randomUUID()
      setCurrentRenderId(renderId)
      updateVariant(id, { previewStatus: 'rendering' })
      const outcome = await window.autoCut.generatePreview({
        renderId, projectId, generation: variant.renderPlan!.generation,
        sourcePaths: clips.map((clip) => clip.path), settingsFingerprint: variant.renderPlan!.settingsFingerprint,
        settings: toVariantRenderSettings(settings, variant), plan: variant.renderPlan!
      })
      if (!outcome.success) throw new Error(outcome.issue.message)
      const current = useAppStore.getState().outputVariants.find((item) => item.id === id) ?? variant
      const result = outcome.result
      const versionNumber = Math.max(0, ...current.previewHistory.map((preview) => preview.versionNumber)) + 1
      const record: PreviewVersion = {
        id: result.plan.id, versionNumber, createdAt: new Date().toISOString(), artifact: result,
        thumbnailPath: result.thumbnailPath, thumbnailUrl: result.thumbnailUrl, approved: false,
        outdated: false, pinned: false,
        storage: { key: result.plan.id, relativePath: `projects/${projectId}/previews/${result.plan.id}`, state: 'available' },
        presetName: current.name, pace: settings.editing.pace, selectionMode: 'smart',
        targetDuration: current.targetDuration, settingsSnapshot: toVariantProjectSettings(settings, current), variantId: current.id
      }
      updateVariant(id, { renderPlan: result.plan, previewHistory: [record, ...current.previewHistory], previewStatus: 'complete', approval: 'needs-changes' })
    } catch (operationError) {
      const cancelled = operationError instanceof Error && operationError.message.toLowerCase().includes('cancel')
      updateVariant(id, { previewStatus: cancelled ? 'cancelled' : 'failed' })
    } finally { setCurrentVariantId(null); setCurrentRenderId(null); setProgress(0) }
  }

  const generateSelectedPreviews = async (): Promise<void> => {
    setQueueRunning(true); cancelAll.current = false
    for (const variant of useAppStore.getState().outputVariants) {
      if (cancelAll.current) break
      if (variant.previewStatus === 'complete' && variant.previewHistory[0] && !variant.previewHistory[0].outdated) continue
      updateVariant(variant.id, { previewStatus: 'waiting' })
    }
    for (const variant of useAppStore.getState().outputVariants) {
      if (cancelAll.current) break
      if (variant.previewStatus !== 'waiting') continue
      await previewVariant(variant.id)
    }
    setQueueRunning(false)
  }

  const exportApproved = async (): Promise<void> => {
    setQueueRunning(true); cancelAll.current = false
    for (const variant of useAppStore.getState().outputVariants.filter((item) => item.approval === 'approved')) {
      if (cancelAll.current) break
      const preview = variant.previewHistory.find((item) => !item.outdated)
      if (!preview) { updateVariant(variant.id, { exportStatus: 'failed' }); continue }
      const outputPath = await window.autoCut.chooseOutputPath(`${sanitizeFilenamePart(settings.name)}_${sanitizeFilenamePart(variant.name)}.mp4`)
      if (!outputPath) continue
      const renderId = crypto.randomUUID()
      setCurrentVariantId(variant.id); setCurrentRenderId(renderId); setProgress(0)
      updateVariant(variant.id, { exportStatus: 'rendering' })
      try {
        const result = await window.autoCut.exportApprovedPreview({ renderId, outputPath, plan: preview.artifact.plan,
          previewPath: preview.artifact.outputPath, previewQuality: preview.artifact.previewQuality,
          previewFinalLoudness: preview.artifact.finalLoudness })
        updateVariant(variant.id, { exportStatus: 'complete', outputPath: result.outputPath, fileSize: result.fileSize })
      } catch (operationError) {
        updateVariant(variant.id, { exportStatus: operationError instanceof Error && operationError.message.toLowerCase().includes('cancel') ? 'cancelled' : 'failed' })
      }
    }
    setCurrentVariantId(null); setCurrentRenderId(null); setQueueRunning(false)
  }

  const cancelCurrent = async (): Promise<void> => { if (currentRenderId) await window.autoCut.cancelRender(currentRenderId) }
  const cancelQueue = async (): Promise<void> => { cancelAll.current = true; await cancelCurrent() }

  return (
    <div className="versions-layout">
      <aside className="version-presets">
        <h3>Create Versions</h3>
        {VARIANT_PRESETS.map((preset) => <label className="version-preset" key={preset.id}><input type="checkbox" checked={selectedPresets.includes(preset.id)} onChange={(event) => setSelectedPresets(event.target.checked ? [...selectedPresets, preset.id] : selectedPresets.filter((id) => id !== preset.id))} /><span><strong>{preset.name}</strong><small>{preset.duration}s default</small></span></label>)}
        <button className="button button-secondary" type="button" disabled={!selectedPresets.length} onClick={createVersions}><Plus size={15} /> Generate Versions</button>
        <button className="button button-primary" type="button" disabled={!variants.length || queueRunning} onClick={() => void generateSelectedPreviews()}><Play size={15} /> Generate Previews</button>
        <button className="button button-secondary" type="button" disabled={!variants.some((variant) => variant.approval === 'approved') || queueRunning} onClick={() => void exportApproved()}><Download size={15} /> Export Approved</button>
        {currentVariantId && <div className="variant-queue-progress"><LoaderCircle className="spin" size={15} /><strong>{variants.find((item) => item.id === currentVariantId)?.name}</strong><progress max="100" value={progress} /><button type="button" onClick={() => void cancelCurrent()}><Square size={13} /> Cancel Current</button><button type="button" onClick={() => void cancelQueue()}><X size={13} /> Cancel All</button></div>}
      </aside>

      <section className="variant-dashboard">
        <header><div><h3>Output Versions</h3><span>{variants.length} independent RenderPlan{variants.length === 1 ? '' : 's'}</span></div></header>
        {!variants.length && <div className="transcript-empty"><Layers3 size={30} /><strong>No output versions</strong><span>Select platform presets to create independent social edits that share source analysis.</span></div>}
        {variants.map((variant) => <article className="variant-card" key={variant.id}>
          <header><div><strong>{variant.name}</strong><span>{variant.width}×{variant.height} · {variant.aspectRatio}</span></div><button className="icon-button" type="button" title="Remove version" onClick={() => removeVariant(variant.id)}><Trash2 size={15} /></button></header>
          <div className="variant-config"><label><span>Duration</span><input type="number" min="5" max="600" value={variant.targetDuration} onChange={(event) => updateVariant(variant.id, { targetDuration: Math.max(5, Number(event.target.value)) })} /></label><label><span>Captions</span><select value={variant.captionSettings.mode} onChange={(event) => updateVariant(variant.id, { captionSettings: { ...variant.captionSettings, mode: event.target.value as typeof variant.captionSettings.mode } })}><option value="off">Off</option><option value="standard">Standard</option><option value="dynamic">Dynamic</option></select></label></div>
          <dl><div><dt>Plan</dt><dd>{variant.renderPlan ? `${variant.renderPlan.segments.length} segments` : 'Not generated'}</dd></div><div><dt>Preview</dt><dd>{variant.previewStatus}</dd></div><div><dt>Approval</dt><dd>{variant.approval}</dd></div><div><dt>Export</dt><dd>{variant.exportStatus}</dd></div>{variant.fileSize != null && <div><dt>File size</dt><dd>{(variant.fileSize / 1_000_000).toFixed(1)} MB</dd></div>}</dl>
          {variant.previewHistory[0]?.thumbnailUrl && <button className="variant-preview-thumb" type="button" onClick={() => void window.autoCut.openFile(variant.previewHistory[0].artifact.outputPath)}><img src={variant.previewHistory[0].thumbnailUrl} alt="" /><span>V{variant.previewHistory[0].versionNumber}</span></button>}
          <footer><button type="button" disabled={queueRunning} onClick={() => void previewVariant(variant.id)}><Play size={13} /> Preview</button><button type="button" disabled={!variant.previewHistory.some((preview) => !preview.outdated)} onClick={() => updateVariant(variant.id, { approval: variant.approval === 'approved' ? 'needs-changes' : 'approved' })}>{variant.approval === 'approved' ? <><X size={13} /> Unapprove</> : <><Check size={13} /> Approve</>}</button></footer>
        </article>)}
      </section>
    </div>
  )
}
