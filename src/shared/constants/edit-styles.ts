import type { EditStyleDefinition, EditStyleId, PacingCurve } from '../types/phase11'

/**
 * Bumped whenever a style definition changes in a way that would alter output.
 * Projects record the version they were made with so old edits keep their look.
 */
export const EDIT_STYLE_VERSION = 1

const curve = (id: string, variation: number, weights: [number, number, number, number, number]): PacingCurve => ({
  id,
  variation,
  points: [
    { position: 0, phase: 'opening', weight: weights[0] },
    { position: 0.16, phase: 'buildup', weight: weights[1] },
    { position: 0.5, phase: 'middle', weight: weights[2] },
    { position: 0.8, phase: 'peak', weight: weights[3] },
    { position: 1, phase: 'ending', weight: weights[4] }
  ]
})

/**
 * The five concrete edit styles.
 *
 * `auto` is deliberately absent: it is not a style but an instruction to pick one from
 * the footage, resolved by `recommendEditStyle`.
 */
export const EDIT_STYLES: readonly EditStyleDefinition[] = [
  {
    id: 'clean',
    version: EDIT_STYLE_VERSION,
    name: 'Clean',
    description: 'Professional and balanced, with natural pacing and simple transitions.',
    recommendedFor: 'LinkedIn, business content, product demos, general-purpose video',
    pace: 'normal',
    cutSync: 'natural',
    contentAwareness: 'balanced',
    // Near-flat: a shorter opening to get moving, a slightly longer final shot to land.
    pacingCurve: curve('clean-balanced', 0.25, [0.85, 1, 1.05, 1, 1.1]),
    hookDuration: { minimum: 2, maximum: 5 },
    openingStrategy: 'automatic',
    endingStrategy: 'automatic',
    transitionStrategy: 'automatic',
    transitionFrequency: 0.25,
    transitionPreference: 'crossfade',
    transitionDuration: 0.5,
    autoMotion: 'subtle',
    visualConsistency: 'basic',
    semanticFlow: 'balanced',
    editStructure: 'auto',
    shotVariety: 0.55,
    captionTemplateId: 'clean',
    captionMode: 'standard',
    preferSpeech: false,
    preferMotion: true,
    audio: { musicVolume: 20, duckingStrength: 0.3, fadeInSeconds: 1, fadeOutSeconds: 2, speechPriority: 'normal' }
  },
  {
    id: 'social-fast',
    version: EDIT_STYLE_VERSION,
    name: 'Social Fast',
    description: 'High-energy with a fast hook, short clips, and beat-assisted cuts.',
    recommendedFor: 'Instagram Reels, YouTube Shorts, TikTok-style formats',
    pace: 'fast',
    cutSync: 'beat-assisted',
    contentAwareness: 'balanced',
    // Very short opening so the hook lands immediately, then quick throughout.
    pacingCurve: curve('social-fast-hook', 0.45, [0.55, 0.8, 0.95, 0.85, 1.05]),
    hookDuration: { minimum: 1.5, maximum: 3 },
    openingStrategy: 'automatic',
    endingStrategy: 'automatic',
    transitionStrategy: 'minimal',
    // Almost everything is a hard cut; social edits look wrong when decorated.
    transitionFrequency: 0.08,
    transitionPreference: 'crossfade',
    transitionDuration: 0.25,
    autoMotion: 'dynamic',
    visualConsistency: 'basic',
    semanticFlow: 'balanced',
    editStructure: 'hook-build-payoff',
    shotVariety: 0.75,
    captionTemplateId: 'social-bold',
    captionMode: 'dynamic',
    preferSpeech: true,
    preferMotion: true,
    audio: { musicVolume: 34, duckingStrength: 0.42, fadeInSeconds: 0.4, fadeOutSeconds: 1, speechPriority: 'normal' }
  },
  {
    id: 'cinematic',
    version: EDIT_STYLE_VERSION,
    name: 'Cinematic',
    description: 'Slower pacing with longer shots, visual breathing room, and subtle fades.',
    recommendedFor: 'Travel, cars, landscapes, events, showcase videos',
    pace: 'slow',
    cutSync: 'natural',
    contentAwareness: 'balanced',
    // A long establishing opening and a calm, unhurried close.
    pacingCurve: curve('cinematic-establish', 0.3, [1.35, 1.15, 1.2, 1.05, 1.3]),
    hookDuration: { minimum: 3, maximum: 7 },
    openingStrategy: 'strong-visual',
    endingStrategy: 'natural-conclusion',
    transitionStrategy: 'automatic',
    transitionFrequency: 0.6,
    transitionPreference: 'crossfade',
    transitionDuration: 0.8,
    autoMotion: 'subtle',
    visualConsistency: 'basic',
    semanticFlow: 'balanced',
    editStructure: 'showcase',
    shotVariety: 0.6,
    captionTemplateId: 'minimal',
    captionMode: 'standard',
    preferSpeech: false,
    preferMotion: false,
    audio: { musicVolume: 42, duckingStrength: 0.22, fadeInSeconds: 2, fadeOutSeconds: 3, speechPriority: 'low' }
  },
  {
    id: 'energetic',
    version: EDIT_STYLE_VERSION,
    name: 'Energetic',
    description: 'Strong motion, frequent cuts, beat-oriented timing, and a punchy opening.',
    recommendedFor: 'Events, cars, sports, product reels',
    pace: 'fast',
    cutSync: 'beat-strong',
    contentAwareness: 'balanced',
    // High energy throughout, but still varied so it does not read as a metronome.
    pacingCurve: curve('energetic-drive', 0.5, [0.6, 0.85, 0.9, 0.75, 1]),
    hookDuration: { minimum: 1.5, maximum: 3.5 },
    openingStrategy: 'strong-motion',
    endingStrategy: 'automatic',
    transitionStrategy: 'minimal',
    transitionFrequency: 0.15,
    transitionPreference: 'crossfade',
    transitionDuration: 0.3,
    autoMotion: 'dynamic',
    visualConsistency: 'basic',
    semanticFlow: 'off',
    editStructure: 'quick-montage',
    shotVariety: 0.8,
    captionTemplateId: 'social-bold',
    captionMode: 'dynamic',
    preferSpeech: false,
    preferMotion: true,
    audio: { musicVolume: 46, duckingStrength: 0.36, fadeInSeconds: 0.5, fadeOutSeconds: 1.5, speechPriority: 'low' }
  },
  {
    id: 'story',
    version: EDIT_STYLE_VERSION,
    name: 'Story',
    description: 'Prioritizes speech continuity and natural progression over beat timing.',
    recommendedFor: 'Talking videos, behind-the-scenes, walkthroughs, mini-documentaries',
    pace: 'normal',
    cutSync: 'natural',
    contentAwareness: 'strong',
    // Speech decides the real rhythm here, so the curve stays close to flat.
    pacingCurve: curve('story-flow', 0.2, [1, 1.05, 1.1, 1, 1.15]),
    hookDuration: { minimum: 2.5, maximum: 6 },
    openingStrategy: 'strong-speech',
    endingStrategy: 'natural-conclusion',
    transitionStrategy: 'automatic',
    transitionFrequency: 0.3,
    transitionPreference: 'fade',
    transitionDuration: 0.6,
    autoMotion: 'subtle',
    visualConsistency: 'basic',
    semanticFlow: 'strong',
    editStructure: 'story-arc',
    shotVariety: 0.4,
    captionTemplateId: 'documentary',
    captionMode: 'standard',
    preferSpeech: true,
    preferMotion: false,
    audio: { musicVolume: 12, duckingStrength: 0.5, fadeInSeconds: 1.5, fadeOutSeconds: 2.5, speechPriority: 'high' }
  }
]

export function getEditStyle(id: EditStyleId): EditStyleDefinition | null {
  return EDIT_STYLES.find((style) => style.id === id) ?? null
}

/**
 * Signals used to pick a style when the user leaves it on Auto.
 *
 * Structural signals are knowable from FFprobe alone. The refined signals require Smart
 * analysis and are `null` until it has run, so the recommendation degrades to structure
 * rather than guessing at content it cannot see yet.
 */
export interface StyleRecommendationSignals {
  clipCount: number
  averageClipDuration: number
  hasMusic: boolean
  /** Fraction of clips carrying an audio stream. */
  audioRatio: number
  portraitRatio: number
  speechRatio: number | null
  motionRatio: number | null
  personRatio: number | null
}

/**
 * Choose a style from what the footage actually looks like.
 *
 * A coarse heuristic over signals the pipeline already produces, always overridable and
 * always shown to the user rather than applied invisibly.
 */
export function recommendEditStyle(signals: StyleRecommendationSignals): EditStyleId {
  const { speechRatio, motionRatio, personRatio } = signals

  // Speech-led footage is about what is being said, so protect it above all else.
  if (speechRatio !== null && speechRatio >= 0.45) return 'story'

  if (speechRatio === null && signals.audioRatio >= 0.8 && !signals.hasMusic && signals.averageClipDuration >= 8) {
    // Long clips that all carry sound and have no soundtrack are most likely talking
    // footage. Weaker evidence than a real speech ratio, but better than ignoring it.
    return 'story'
  }

  if (signals.hasMusic && motionRatio !== null && motionRatio >= 0.55) {
    // Movement with music: long takes suit a driving edit, short ones rapid social cutting.
    return signals.averageClipDuration >= 8 ? 'energetic' : 'social-fast'
  }

  // Scenery with little movement and few people reads as establishing footage.
  if (
    personRatio !== null &&
    motionRatio !== null &&
    personRatio <= 0.25 &&
    motionRatio <= 0.4 &&
    signals.averageClipDuration >= 6
  ) {
    return 'cinematic'
  }

  if (signals.hasMusic && signals.clipCount >= 8 && signals.averageClipDuration <= 5) return 'social-fast'

  // Portrait footage with music and no speech evidence is most likely a social edit.
  if (signals.hasMusic && signals.portraitRatio >= 0.6 && speechRatio === null) return 'social-fast'

  return 'clean'
}

/**
 * Resolve the style a plan should actually be built with.
 *
 * Returns `null` for a legacy project, which every Phase 11 planner treats as "change
 * nothing". Auto is resolved here so the choice is made once, recorded on the plan, and
 * visible to the user.
 */
export function resolveEditStyle(
  reference: { id: EditStyleId; version: number } | null,
  signals: StyleRecommendationSignals
): EditStyleDefinition | null {
  if (!reference) return null
  const id = reference.id === 'auto' ? recommendEditStyle(signals) : reference.id
  return getEditStyle(id)
}
