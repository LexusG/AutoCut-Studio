import { useMemo } from 'react'
import { useAppStore } from '../stores/app-store'
import {
  assistantStatus,
  buildSuggestions,
  type AssistantSuggestion
} from '../utils/assistant-suggestions'

/**
 * The assistant's current read on the project.
 *
 * Shared so the workspace can decide which side of the rail to open on without
 * duplicating the derivation the panel itself performs.
 */
export function useAssistant(): { suggestions: AssistantSuggestion[]; status: string } {
  const clipCount = useAppStore((state) => state.clips.length)
  const transcripts = useAppStore((state) => state.transcripts)
  const highlightCandidates = useAppStore((state) => state.highlightCandidates)
  const topics = useAppStore((state) => state.topics)
  const diarizationResults = useAppStore((state) => state.diarizationResults)
  const outputVariants = useAppStore((state) => state.outputVariants)
  const editPlan = useAppStore((state) => state.editPlan)
  const captionMode = useAppStore((state) => state.projectSettings.captions.mode)

  return useMemo(() => {
    const input = {
      clipCount, transcripts, highlightCandidates, topics, diarizationResults,
      outputVariants, editPlan,
      captionsEnabled: captionMode !== 'off',
      hasCaptionTrack: Boolean(editPlan?.captionTrack)
    }
    return { suggestions: buildSuggestions(input), status: assistantStatus(input) }
  }, [clipCount, transcripts, highlightCandidates, topics, diarizationResults, outputVariants, editPlan, captionMode])
}
