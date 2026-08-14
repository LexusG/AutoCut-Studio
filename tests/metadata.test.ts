import { describe, expect, it } from 'vitest'
import { parseFrameRate } from '../src/main/services/video/metadata'

describe('parseFrameRate', () => {
  it('parses fractional NTSC frame rates', () => {
    expect(parseFrameRate('30000/1001')).toBeCloseTo(29.97, 2)
  })

  it('parses whole frame rates', () => {
    expect(parseFrameRate('30/1')).toBe(30)
  })

  it('returns zero for invalid frame rates', () => {
    expect(parseFrameRate('0/0')).toBe(0)
    expect(parseFrameRate(undefined)).toBe(0)
  })
})
