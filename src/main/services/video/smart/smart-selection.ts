import type { RenderPlan, RenderSettings } from '@shared/types'
import { appendFile } from 'node:fs/promises'
import { readAnalysisCache, writeAnalysisCache, type CachedSelection } from './analysis-cache'
import { analyzeClipCandidates } from './clip-analyzer'
import { SMART_ANALYSIS_VERSION } from './scoring'
import type { PersonPresenceProvider } from './optional-ml'

function selectAlternate(candidates: CachedSelection[], seed: number): CachedSelection {
  const sorted = [...candidates].sort((left, right) => right.metadata.scores.total - left.metadata.scores.total)
  const bestScore = sorted[0]?.metadata.scores.total ?? 0
  const strong = sorted.filter((candidate) => candidate.metadata.scores.total >= bestScore - 0.12)
  return strong[Math.abs(seed) % strong.length] ?? sorted[0]
}

export async function applySmartSelection(
  ffmpegPath: string,
  plan: RenderPlan,
  settings: RenderSettings,
  signal: AbortSignal,
  onClip: (index: number, filename: string, stage: 'Detecting scenes' | 'Detecting people' | 'Evaluating candidate segments') => void,
  logPath?: string,
  personProvider?: PersonPresenceProvider
): Promise<RenderPlan> {
  if (settings.selectionMode !== 'smart') return plan
  const warnings = [...plan.warnings]
  const profile = JSON.stringify({
    preferences: settings.smartPreferences,
    personAnalysis: settings.personAnalysis
  })
  const segments = []
  for (let index = 0; index < plan.segments.length; index += 1) {
    const segment = plan.segments[index]
    onClip(index, segment.filename, 'Detecting scenes')
    let candidates = await readAnalysisCache(
      segment.sourcePath,
      segment.duration,
      settings.analysisQuality,
      profile
    )
    const cacheHit = Boolean(candidates)
    try {
      if (!candidates) {
        onClip(index, segment.filename, 'Evaluating candidate segments')
        if (settings.personAnalysis.enabled) onClip(index, segment.filename, 'Detecting people')
        candidates = await analyzeClipCandidates(
          ffmpegPath,
          { path: segment.sourcePath, duration: segment.sourceDuration, hasAudio: segment.hasAudio },
          segment.duration,
          settings.analysisQuality,
          settings,
          signal,
          personProvider
        )
        const analysisHealthy = candidates.every(
          (candidate) => (candidate.metadata.personAnalysis?.warnings.length ?? 0) === 0
        )
        if (analysisHealthy) {
          await writeAnalysisCache(
            segment.sourcePath,
            segment.duration,
            settings.analysisQuality,
            profile,
            candidates
          )
        }
      }
      const selected = selectAlternate(candidates, plan.selectionSeed + index)
      if (selected.metadata.personAnalysis?.warnings.length) {
        warnings.push(`Person scoring skipped for ${segment.filename}; visual and audio analysis continued.`)
      }
      segments.push({
        ...segment,
        start: selected.start,
        end: Math.round((selected.start + segment.duration) * 1000) / 1000,
        automaticStart: selected.start,
        automaticEnd: Math.round((selected.start + segment.duration) * 1000) / 1000,
        selectionSource: 'smart' as const,
        selectedCandidate: {
          ...selected.metadata,
          alternatives: [...candidates]
            .filter((candidate) => candidate.metadata.candidateId !== selected.metadata.candidateId)
            .sort((left, right) => right.metadata.scores.total - left.metadata.scores.total)
            .slice(0, 3)
            .map((candidate) => ({
              candidateId: candidate.metadata.candidateId,
              start: candidate.start,
              end: candidate.end,
              scores: candidate.metadata.scores,
              reasons: candidate.metadata.reasons,
              personAnalysis: candidate.metadata.personAnalysis
            }))
        }
      })
      if (logPath) {
        await appendFile(logPath, `${JSON.stringify({
          timestamp: new Date().toISOString(),
          stage: 'smart-selection',
          filename: segment.filename,
          cache: cacheHit ? 'hit' : 'miss',
          candidates,
          selected: selected.metadata.candidateId
        })}\n`, 'utf8')
      }
    } catch (error) {
      if (signal.aborted) throw error
      warnings.push(`Smart analysis unavailable for ${segment.filename}; Classic selection used.`)
      segments.push({
        ...segment,
        selectedCandidate: {
          candidateId: 'classic-fallback',
          scores: {
            sharpness: 0, exposure: 0, motion: 0, stability: 0, audioActivity: 0,
            personPresence: 0, sceneQuality: 0, blackFramePenalty: 0, duplicatePenalty: 0,
            speechActivity: 0, speechBoundaryQuality: 0, speechCompleteness: 0, total: 0
          },
          reasons: ['Classic selection used after analysis failure'],
          analysisFallback: true
        }
      })
    }
  }
  return { ...plan, segments, warnings, selectionMode: 'smart', analysisVersion: SMART_ANALYSIS_VERSION }
}
