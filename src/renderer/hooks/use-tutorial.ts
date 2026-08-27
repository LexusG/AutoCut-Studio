import { useCallback, useEffect, useState } from 'react'
import { useAppStore } from '../stores/app-store'
import { findTutorial } from '../tutorials/catalogue'
import type { TutorialDefinition, TutorialProgress, TutorialState, TutorialStep } from '../tutorials/types'

const STORAGE_KEY = 'autocut.tutorial-progress'

/** Progress is a local convenience, so a browser that refuses storage must not break the app. */
function readProgress(): TutorialProgress {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as TutorialProgress) : {}
  } catch {
    return {}
  }
}

function writeProgress(progress: TutorialProgress): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(progress))
  } catch {
    // Storage is optional; losing progress is preferable to failing the session.
  }
}

export interface ActiveTutorial {
  definition: TutorialDefinition
  step: TutorialStep
  index: number
  total: number
  /** False while an action step's requirement is unmet, which disables Next. */
  canAdvance: boolean
}

export interface TutorialController {
  active: ActiveTutorial | null
  progress: TutorialProgress
  start: (id: string, fromStep?: number) => void
  next: () => void
  back: () => void
  stop: () => void
  reset: () => void
  stateOf: (id: string) => TutorialState
}

export function useTutorial(): TutorialController {
  const [activeId, setActiveId] = useState<string | null>(null)
  const [index, setIndex] = useState(0)
  const [progress, setProgress] = useState<TutorialProgress>(() => readProgress())

  const clipCount = useAppStore((state) => state.clips.length)
  const editPlan = useAppStore((state) => state.editPlan)
  const previewResult = useAppStore((state) => state.previewResult)

  useEffect(() => { writeProgress(progress) }, [progress])

  const definition = activeId ? findTutorial(activeId) : null
  const step = definition?.steps[index] ?? null

  const met = useCallback((requirement: TutorialStep['requires']): boolean => {
    if (!requirement) return true
    if (requirement === 'clips-imported') return clipCount > 0
    if (requirement === 'edit-plan') return Boolean(editPlan)
    return Boolean(previewResult)
  }, [clipCount, editPlan, previewResult])

  const record = useCallback((id: string, state: TutorialState, stepIndex: number) => {
    setProgress((current) => ({ ...current, [id]: { state, step: stepIndex } }))
  }, [])

  const start = useCallback((id: string, fromStep = 0) => {
    setActiveId(id)
    setIndex(fromStep)
    record(id, 'in-progress', fromStep)
  }, [record])

  const stop = useCallback(() => {
    if (activeId && definition) {
      const finished = index >= definition.steps.length - 1
      record(activeId, finished ? 'completed' : 'in-progress', index)
    }
    setActiveId(null)
    setIndex(0)
  }, [activeId, definition, index, record])

  const next = useCallback(() => {
    if (!definition || !activeId) return
    if (index >= definition.steps.length - 1) {
      record(activeId, 'completed', index)
      setActiveId(null)
      setIndex(0)
      return
    }
    const advanced = index + 1
    setIndex(advanced)
    record(activeId, 'in-progress', advanced)
  }, [definition, activeId, index, record])

  const back = useCallback(() => setIndex((current) => Math.max(0, current - 1)), [])

  const reset = useCallback(() => {
    setProgress({})
    setActiveId(null)
    setIndex(0)
  }, [])

  const stateOf = useCallback(
    (id: string): TutorialState => progress[id]?.state ?? 'not-started',
    [progress]
  )

  return {
    active: definition && step
      ? { definition, step, index, total: definition.steps.length, canAdvance: met(step.requires) }
      : null,
    progress, start, next, back, stop, reset, stateOf
  }
}
