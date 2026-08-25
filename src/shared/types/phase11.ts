/**
 * Phase 11 — professional automatic edit quality.
 *
 * These types describe *how* an edit should be shaped, not what it contains. They are
 * persisted in the project so a saved edit keeps rendering the way it did when it was
 * made, and each style carries its own version for exactly that reason.
 */

export type EditStyleId = 'auto' | 'clean' | 'social-fast' | 'cinematic' | 'energetic' | 'story'

/**
 * A style reference pins both the style and the revision of its definition.
 *
 * Style definitions will change as the automatic editor improves. Recording the version
 * an edit was made with means an old project can be re-rendered the way its author saw
 * it, rather than being silently reinterpreted by a newer definition.
 *
 * `null` on a project means "legacy": the pre-Phase-11 behaviour, unchanged.
 */
export interface EditStyleRef {
  id: EditStyleId
  version: number
}

export type OpeningStrategy =
  | 'automatic'
  | 'strong-visual'
  | 'strong-speech'
  | 'strong-motion'
  | 'chronological'

export type EndingStrategy =
  | 'automatic'
  | 'strong-result'
  | 'natural-conclusion'
  | 'fade-out'
  | 'chronological'

export type TransitionStrategy = 'uniform' | 'automatic' | 'minimal'

export type AutoMotionMode = 'off' | 'subtle' | 'dynamic'

export type VisualConsistencyMode = 'off' | 'basic'

export type SemanticFlowMode = 'off' | 'balanced' | 'strong'

export type EditStructureId =
  | 'auto'
  | 'hook-build-payoff'
  | 'quick-montage'
  | 'story-arc'
  | 'showcase'
  | 'before-after'
  | 'chronological-story'

/** How many alternative auto-generated edits to produce. */
export type VersionCount = 1 | 3 | 5

/**
 * Phases of a whole-video pacing curve.
 *
 * Segments are assigned a phase by their position in the edit, and the phase decides how
 * much of the available duration they compete for.
 */
export type PacingPhase = 'opening' | 'buildup' | 'middle' | 'peak' | 'ending'

/**
 * A style's pacing shape, sampled as normalized positions through the edit.
 *
 * `weight` is relative pull on the available duration: 0.6 at the opening and 1.4 in the
 * middle means opening cuts land shorter than middle cuts, which is what stops an edit
 * reading as a metronome.
 */
export interface PacingCurvePoint {
  position: number
  phase: PacingPhase
  weight: number
}

export interface PacingCurve {
  id: string
  points: PacingCurvePoint[]
  /** 0 = every cut the same length, 1 = maximum controlled variation. Never random. */
  variation: number
}

/** Style-derived target window for the opening hook, in seconds. Guidance, not a clamp. */
export interface HookDurationRange {
  minimum: number
  maximum: number
}

export interface EditStyleAudioProfile {
  musicVolume: number
  duckingStrength: number
  fadeInSeconds: number
  fadeOutSeconds: number
  speechPriority: 'low' | 'normal' | 'high'
}

/**
 * The complete behavioural definition of an edit style.
 *
 * A style is a coherent set of defaults across selection, pacing, transitions, captions,
 * motion and audio — not a single knob. Users may override any of it afterwards.
 */
export interface EditStyleDefinition {
  id: EditStyleId
  version: number
  name: string
  description: string
  recommendedFor: string
  pace: 'slow' | 'normal' | 'fast'
  cutSync: 'natural' | 'beat-assisted' | 'beat-strong'
  contentAwareness: 'off' | 'balanced' | 'strong'
  pacingCurve: PacingCurve
  hookDuration: HookDurationRange
  openingStrategy: OpeningStrategy
  endingStrategy: EndingStrategy
  transitionStrategy: TransitionStrategy
  /** Share of boundaries allowed a transition. The rest stay hard cuts. */
  transitionFrequency: number
  transitionDuration: number
  autoMotion: AutoMotionMode
  visualConsistency: VisualConsistencyMode
  semanticFlow: SemanticFlowMode
  editStructure: EditStructureId
  /** How strongly to penalise visually repetitive neighbouring shots. */
  shotVariety: number
  captionTemplateId: string
  captionMode: 'off' | 'standard' | 'dynamic'
  preferSpeech: boolean
  preferMotion: boolean
  audio: EditStyleAudioProfile
}
