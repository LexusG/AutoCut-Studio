import { describe, expect, it } from 'vitest'
import { formatDuration, formatFileSize, formatFrameRate } from '../src/renderer/utils/format'

describe('renderer formatters', () => {
  it('formats video durations', () => {
    expect(formatDuration(65)).toBe('1:05')
    expect(formatDuration(3661)).toBe('1:01:01')
  })

  it('formats file sizes', () => {
    expect(formatFileSize(1_048_576)).toBe('1.0 MB')
  })

  it('formats frame rates without hiding fractional values', () => {
    expect(formatFrameRate(29.970029)).toBe('29.97 FPS')
  })
})
