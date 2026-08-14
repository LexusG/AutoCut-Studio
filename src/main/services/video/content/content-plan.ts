import type { RenderPlan, RenderPlanSegment, RenderSettings, SelectedCandidateMetadata, SpeechAnalysisResult } from '@shared/types'
import { analyzeSpeechActivity } from './speech-analysis'
import { adjustRangeForSpeech } from './speech-boundaries'
import { analyzeSoundtrackBeats } from './beat-analysis'
import { snapSegmentsToBeats } from './beat-snap'
import { applySubjectCropPlans } from './subject-crop'
import { calculatePlanDuration, rebalancePlan } from '@shared/utils/edit-plan'

function emptyMetadata(reason: string): SelectedCandidateMetadata {
  return {
    candidateId: 'classic-content-aware',
    scores: {
      sharpness: 0, exposure: 0, motion: 0, stability: 0, audioActivity: 0,
      personPresence: 0, sceneQuality: 0, blackFramePenalty: 0, duplicatePenalty: 0,
      speechActivity: 0, speechBoundaryQuality: 0, speechCompleteness: 0, total: 0
    },
    reasons: [reason], analysisFallback: false
  }
}

export function applySpeechAwarenessToSegment(
  segment: RenderPlanSegment,
  speech: SpeechAnalysisResult,
  settings: RenderSettings
): RenderPlanSegment {
  let metadata = segment.selectedCandidate ?? emptyMetadata('Classic selection with content-aware timing')
  const contentWeight = settings.contentAwareness === 'strong' ? 0.14 : 0.08
  const options = [
    {
      candidateId: metadata.candidateId,
      start: segment.start,
      end: segment.end,
      scores: metadata.scores,
      reasons: metadata.reasons,
      personAnalysis: metadata.personAnalysis
    },
    ...(metadata.alternatives ?? [])
  ]
  const chosen = options.map((option) => {
    const metrics = adjustRangeForSpeech({
      ...segment,
      start: option.start,
      end: option.end,
      duration: option.end - option.start
    }, speech, 'off')
    return {
      option,
      rank: option.scores.total + metrics.boundaryQuality * contentWeight +
        (settings.smartPreferences.preferSpeech
          ? metrics.speechActivity * 0.18 + metrics.completeness * 0.05
          : 0)
    }
  }).sort((left, right) => right.rank - left.rank)[0]?.option ?? options[0]
  const chosenSegment = {
    ...segment,
    start: chosen.start,
    end: chosen.end,
    duration: chosen.end - chosen.start
  }
  metadata = {
    ...metadata,
    candidateId: chosen.candidateId,
    scores: chosen.scores,
    reasons: chosen.reasons,
    personAnalysis: chosen.personAnalysis,
    alternatives: options.filter((option) => option.candidateId !== chosen.candidateId).slice(0, 3)
  }
  const adjusted = adjustRangeForSpeech(chosenSegment, speech, settings.speechCutProtection)
  const speechPreference = settings.smartPreferences.preferSpeech ? adjusted.speechActivity * 0.12 : 0
  return {
    ...chosenSegment,
    start: adjusted.start,
    end: adjusted.end,
    automaticStart: adjusted.start,
    automaticEnd: adjusted.end,
    selectedCandidate: {
      ...metadata,
      speechAnalysis: speech,
      scores: {
        ...metadata.scores,
        speechActivity: adjusted.speechActivity,
        speechBoundaryQuality: adjusted.boundaryQuality,
        speechCompleteness: adjusted.completeness,
        total: Math.min(1, metadata.scores.total + adjusted.boundaryQuality * contentWeight + speechPreference)
      },
      reasons: settings.smartPreferences.preferSpeech && adjusted.speechActivity >= 0.35
        ? [...metadata.reasons, 'Spoken moment preferred'].slice(0, 5)
        : metadata.reasons,
      decisionNotes: adjusted.note
        ? [...(metadata.decisionNotes ?? []), adjusted.note]
        : metadata.decisionNotes
    }
  }
}

export async function applyContentAwareness(
  ffmpegPath: string,
  initial: RenderPlan,
  settings: RenderSettings,
  signal: AbortSignal,
  onStage: (stage: 'Detecting speech' | 'Analyzing music' | 'Planning smart crop', index?: number, filename?: string) => void
): Promise<RenderPlan> {
  let plan = initial
  const needSpeech = settings.contentAwareness !== 'off' && (
    settings.smartPreferences.preferSpeech ||
    (settings.audio.preserveOriginalAudio && (
      settings.speechCutProtection !== 'off' || settings.audio.duckingTrigger !== 'audio-level'
    ))
  )
  if (needSpeech) {
    const segments: RenderPlanSegment[] = []
    for (let index = 0; index < plan.segments.length; index += 1) {
      const segment = plan.segments[index]
      onStage('Detecting speech', index, segment.filename)
      try {
        const analyzed = await analyzeSpeechActivity(ffmpegPath, {
          path: segment.sourcePath, duration: segment.sourceDuration, hasAudio: segment.hasAudio
        }, signal)
        segments.push(applySpeechAwarenessToSegment(segment, analyzed.result, settings))
      } catch (error) {
        if (signal.aborted) throw error
        segments.push(segment)
        plan = { ...plan, warnings: [...plan.warnings, `Speech analysis unavailable for ${segment.filename}; existing cut retained.`] }
      }
    }
    plan = { ...plan, segments }
  }

  if (settings.cutSync !== 'natural') {
    onStage('Analyzing music')
    try {
      const analyzed = await analyzeSoundtrackBeats(ffmpegPath, settings.audio, plan.expectedDuration, signal)
      plan = {
        ...plan,
        beatAnalysis: analyzed.result,
        segments: snapSegmentsToBeats(plan.segments, analyzed.result, settings.cutSync)
      }
    } catch (error) {
      if (signal.aborted) throw error
      plan = { ...plan, beatAnalysis: null, warnings: [...plan.warnings, 'Beat analysis unavailable; Natural cut timing used.'] }
    }
  }

  if (settings.fitMode === 'crop' && settings.cropFocus === 'smart-subject') {
    onStage('Planning smart crop')
    plan = applySubjectCropPlans(plan)
  }
  return plan
}

export function preserveLockedSegments(plan: RenderPlan, current: RenderPlan | null): RenderPlan {
  if (!current) return plan
  const locked = new Map(current.segments.filter((segment) => segment.locked).map((segment) => [segment.sourcePath, segment]))
  if (locked.size === 0) return { ...plan, revision: current.revision + 1 }
  const preserved = {
    ...plan,
    revision: current.revision + 1,
    segments: plan.segments.map((segment) => {
      const prior = locked.get(segment.sourcePath)
      return prior ? { ...prior, transitionToNext: segment.transitionToNext } : segment
    })
  }
  preserved.expectedDuration = calculatePlanDuration(preserved.segments)
  if (preserved.requestedDuration == null || preserved.segments.every((segment) => segment.locked)) {
    return preserved
  }
  try {
    const balanced = rebalancePlan(preserved, false)
    return { ...balanced, revision: current.revision + 1 }
  } catch {
    return preserved
  }
}
