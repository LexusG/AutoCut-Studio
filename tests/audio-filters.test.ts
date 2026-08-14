import { describe, expect, it } from 'vitest'
import { DEFAULT_RENDER_SETTINGS } from '../src/shared/types'
import { musicMixFilters, sourceAudioFilter } from '../src/main/services/video/audio-filters'

describe('Phase 3 audio filters', () => {
  it('applies normalization and original clip volume', () => {
    const filter = sourceAudioFilter('0:a:0', 5, {
      ...DEFAULT_RENDER_SETTINGS.audio,
      originalAudioVolume: 65,
      normalizeClipAudio: true
    })
    expect(filter).toContain('loudnorm=')
    expect(filter).toContain('volume=0.650')
    expect(filter).toContain('atrim=0:5.000')
  })

  it('calculates music fade out from final video duration and enables ducking', () => {
    const result = musicMixFilters(3, 'baseaudio', 20, {
      ...DEFAULT_RENDER_SETTINGS.audio,
      musicVolume: 25,
      fadeOut: { enabled: true, duration: 2 }
    }, true)
    expect(result.filters.join(';')).toContain('volume=0.250')
    expect(result.filters.join(';')).toContain('afade=t=out:st=18.000:d=2.000')
    expect(result.filters.join(';')).toContain('asplit=2[sourcebed][sidechain]')
    expect(result.filters.join(';')).toContain('sidechaincompress=')
  })
})
