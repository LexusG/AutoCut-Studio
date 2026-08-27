/**
 * Where a step points, and what it expects of the user.
 *
 * `highlight` and `action` need a target; `information` and `completion` are centred
 * because they explain rather than point.
 */
export type TutorialStepType = 'highlight' | 'information' | 'action' | 'completion'

/** Screens a tutorial can run on. A step naming the wrong screen is skipped. */
export type TutorialScreen = 'home' | 'editor' | 'any'

export interface TutorialStep {
  id: string
  type: TutorialStepType
  title: string
  description: string
  /** Value of the `data-tutorial-id` attribute to spotlight. */
  target?: string
  screen?: TutorialScreen
  /**
   * Gate for `action` steps. When present, Next stays disabled until it passes, so
   * the user actually performs the step rather than reading past it.
   */
  requires?: 'clips-imported' | 'edit-plan' | 'preview'
}

export type TutorialCategory =
  | 'Getting Started'
  | 'Importing Media'
  | 'Platforms & Presets'
  | 'Auto Editing'
  | 'Captions'
  | 'Exporting'

export interface TutorialDefinition {
  id: string
  title: string
  summary: string
  category: TutorialCategory
  /** Roughly how long the walkthrough takes, in minutes. */
  minutes: number
  /** Marks the recommended first tutorial. */
  startHere?: boolean
  steps: TutorialStep[]
}

export type TutorialState = 'not-started' | 'in-progress' | 'completed'

export interface TutorialProgress {
  /** Tutorial id to the furthest step index reached. */
  [tutorialId: string]: { state: TutorialState; step: number }
}
