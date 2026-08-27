import type { TutorialDefinition } from './types'

/**
 * Walkthroughs over the real interface.
 *
 * Every `target` names a `data-tutorial-id` present in the running UI rather than a
 * CSS selector, because accessible names are already ambiguous here: "Generate
 * Preview" exists in both the header and the Edit Plan footer.
 */
export const TUTORIALS: TutorialDefinition[] = [
  {
    id: 'first-video',
    title: 'Make Your First Video',
    summary: 'The whole workflow start to finish: import clips, pick a platform, let the assistant build an edit, then preview and export.',
    category: 'Getting Started',
    minutes: 4,
    startHere: true,
    steps: [
      {
        id: 'welcome',
        type: 'information',
        title: 'AutoCut Studio edits for you',
        description: 'You do not need to work a timeline. Import footage, say where it is going, and the app builds an edit you can review. This tour walks the whole path.',
        screen: 'editor'
      },
      {
        id: 'import',
        type: 'action',
        title: 'Add your clips',
        description: 'Drop video files here, or browse for them. Import at least one clip to continue.',
        target: 'add-media',
        screen: 'editor',
        requires: 'clips-imported'
      },
      {
        id: 'platform',
        type: 'highlight',
        title: 'Choose where it is going',
        description: 'Pick the platform you are posting to. That sets resolution, aspect ratio, and sensible duration limits, so you never have to work them out yourself.',
        target: 'platform-selector',
        screen: 'editor'
      },
      {
        id: 'assistant',
        type: 'highlight',
        title: 'The assistant watches your footage',
        description: 'As analysis runs, findings appear here: strong moments, dead space, unclear audio. Each one explains its reasoning and you decide whether to act.',
        target: 'assistant-rail',
        screen: 'editor'
      },
      {
        id: 'create-plan',
        type: 'action',
        title: 'Build the edit',
        description: 'This analyses your clips and assembles an Edit Plan: which parts are used, in what order, with what pacing.',
        target: 'create-edit-plan',
        screen: 'editor',
        requires: 'edit-plan'
      },
      {
        id: 'preview',
        type: 'highlight',
        title: 'Watch it before exporting',
        description: 'Generate a preview to see the real cut. You can keep several versions and compare them before committing to an export.',
        target: 'generate-preview',
        screen: 'editor'
      },
      {
        id: 'done',
        type: 'completion',
        title: 'That is the whole loop',
        description: 'Import, choose a platform, build, preview, export. Everything else — captions, music, manual trims — refines this same path.',
        screen: 'editor'
      }
    ]
  },
  {
    id: 'captions',
    title: 'Add Captions',
    summary: 'Transcribe speech and burn in captions, including the animated styles used for short-form video.',
    category: 'Captions',
    minutes: 3,
    steps: [
      {
        id: 'open-content',
        type: 'highlight',
        title: 'Captions live under Content',
        description: 'Transcription, captions, speakers, and highlights all sit behind this button. Open it and choose the Captions tab.',
        target: 'content-button',
        screen: 'editor'
      },
      {
        id: 'transcribe',
        type: 'information',
        title: 'Transcribe first',
        description: 'Captions are built from a transcript, so run transcription before generating them. It runs locally — nothing is uploaded.',
        screen: 'editor'
      },
      {
        id: 'style',
        type: 'information',
        title: 'Pick a caption style',
        description: 'Templates cover everything from clean subtitles to animated social styles: Impact Pop, Karaoke Fill, Neon Glow, One Word Punch. Word emphasis and entrance animation can be set separately.',
        screen: 'editor'
      },
      {
        id: 'done',
        type: 'completion',
        title: 'Captions ready',
        description: 'Generate the caption track, then preview to see them burned in. You can also export SRT or VTT separately.',
        screen: 'editor'
      }
    ]
  },
  {
    id: 'platforms',
    title: 'Platforms and Output Presets',
    summary: 'How platform choice drives resolution, aspect ratio, and duration targets.',
    category: 'Platforms & Presets',
    minutes: 2,
    steps: [
      {
        id: 'selector',
        type: 'highlight',
        title: 'Start from the platform',
        description: 'Choosing TikTok, Reels, Shorts, or YouTube applies the right frame size and duration ceiling. Override width and height afterwards if you need something custom.',
        target: 'platform-selector',
        screen: 'editor'
      },
      {
        id: 'inspector',
        type: 'highlight',
        title: 'Everything else is in the Inspector',
        description: 'Output size, edit style, music, and audio levels live here. The rail switches to the assistant once analysis has something to report.',
        target: 'inspector-tab',
        screen: 'editor'
      },
      {
        id: 'done',
        type: 'completion',
        title: 'Presets set the frame',
        description: 'Set the platform first and the rest of the project follows it.',
        screen: 'editor'
      }
    ]
  }
]

export function findTutorial(id: string): TutorialDefinition | null {
  return TUTORIALS.find((tutorial) => tutorial.id === id) ?? null
}
