import type { CaptionSettings } from '../types'

/**
 * Baseline caption configuration.
 *
 * Lives on its own so both `createDefaultProjectSettings` and the built-in caption
 * templates can use it without importing each other.
 */
export const DEFAULT_CAPTION_SETTINGS: CaptionSettings = {
  mode: 'off',
  subtitleOutput: 'none',
  style: {
    preset: 'clean',
    fontFamily: 'DejaVu Sans',
    fontSize: 48,
    fontWeight: 600,
    textColor: '#ffffff',
    highlightColor: '#facc15',
    backgroundEnabled: true,
    backgroundOpacity: 0.58,
    outline: 2,
    shadow: 1,
    alignment: 'center',
    position: 'bottom',
    verticalOffset: 8,
    maximumWidth: 84,
    lineSpacing: 1
  },
  safeAreaPreset: 'youtube-standard',
  safeAreaVisible: false,
  highlightSpokenWord: true,
  highlightBehavior: 'color',
  animation: 'none',
  wordDisplay: 'full'
}
