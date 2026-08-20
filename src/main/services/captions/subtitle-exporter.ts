import { mkdir, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import type { CaptionAnimation, CaptionHighlight, CaptionStyle, CaptionTrack } from '@shared/types'

function validChunks(track: CaptionTrack): CaptionTrack['chunks'] {
  const normalized = []
  let previousEnd = 0
  for (const chunk of track.chunks.filter((item) => !item.deleted && item.end > item.start).sort((left, right) => left.start - right.start)) {
    const start = Math.max(previousEnd, chunk.start)
    if (chunk.end <= start) continue
    normalized.push({ ...chunk, start })
    previousEnd = chunk.end
  }
  return normalized
}

function pad(value: number, length = 2): string { return Math.floor(value).toString().padStart(length, '0') }

export function srtTimestamp(seconds: number): string {
  const totalMilliseconds = Math.max(0, Math.round(seconds * 1000))
  const hours = Math.floor(totalMilliseconds / 3_600_000)
  const minutes = Math.floor((totalMilliseconds % 3_600_000) / 60_000)
  const wholeSeconds = Math.floor((totalMilliseconds % 60_000) / 1000)
  const milliseconds = totalMilliseconds % 1000
  return `${pad(hours)}:${pad(minutes)}:${pad(wholeSeconds)},${pad(milliseconds, 3)}`
}

export function vttTimestamp(seconds: number): string { return srtTimestamp(seconds).replace(',', '.') }

export function serializeSrt(track: CaptionTrack): string {
  return `${validChunks(track).map((chunk, index) =>
    `${index + 1}\n${srtTimestamp(chunk.start)} --> ${srtTimestamp(chunk.end)}\n${chunk.text}\n`
  ).join('\n')}\n`
}

export function serializeVtt(track: CaptionTrack): string {
  return `WEBVTT\n\n${validChunks(track).map((chunk) =>
    `${vttTimestamp(chunk.start)} --> ${vttTimestamp(chunk.end)}\n${chunk.text}\n`
  ).join('\n')}\n`
}

export async function writeSubtitleFile(path: string, format: 'srt' | 'vtt', track: CaptionTrack): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, format === 'srt' ? serializeSrt(track) : serializeVtt(track), 'utf8')
}

function assColor(hex: string, alpha = 0): string {
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex)
  if (!match) return '&H00FFFFFF'
  return `&H${pad(alpha, 2)}${match[3]}${match[2]}${match[1]}`.toUpperCase()
}

function assTime(seconds: number): string {
  const centiseconds = Math.max(0, Math.round(seconds * 100))
  return `${Math.floor(centiseconds / 360000)}:${pad((centiseconds % 360000) / 6000)}:${pad((centiseconds % 6000) / 100)}.${pad(centiseconds % 100, 2)}`
}

function alignment(style: CaptionStyle): number {
  const row = style.position === 'top' || style.position === 'upper-middle' ? 7
    : style.position === 'center' ? 4 : 1
  return row + (style.alignment === 'left' ? 0 : style.alignment === 'center' ? 1 : 2)
}

function escapeAss(text: string): string { return text.replace(/[{}]/g, '').replace(/\n/g, '\\N') }

export function serializeAss(
  track: CaptionTrack,
  style: CaptionStyle,
  width: number,
  height: number,
  highlightSpokenWord: boolean,
  highlightBehavior: CaptionHighlight = 'color',
  animation: CaptionAnimation = 'none'
): string {
  const marginV = Math.round(height * Math.max(0.03, style.verticalOffset / 100))
  const marginH = Math.round(width * Math.max(0.02, (100 - style.maximumWidth) / 200))
  const outline = style.backgroundEnabled ? 0 : style.outline
  const borderStyle = style.backgroundEnabled ? 3 : 1
  const backgroundAlpha = Math.round((1 - style.backgroundOpacity) * 255)
  const header = `[Script Info]\nScriptType: v4.00+\nPlayResX: ${width}\nPlayResY: ${height}\nScaledBorderAndShadow: yes\nWrapStyle: 0\n\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: Default,${style.fontFamily},${style.fontSize},${assColor(style.textColor)},${assColor(style.highlightColor)},&H00000000,${assColor('#000000', backgroundAlpha)},${style.fontWeight >= 600 ? -1 : 0},0,0,0,100,100,0,0,${borderStyle},${outline},${style.shadow},${alignment(style)},${marginH},${marginH},${marginV},1\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n`
  const events: string[] = []
  const entrance = animation === 'fade' ? '{\\fad(120,0)}'
    : animation === 'pop' ? '{\\fscx85\\fscy85\\t(0,120,\\fscx100\\fscy100)}' : ''
  for (const chunk of validChunks(track)) {
    if (!highlightSpokenWord || track.mode !== 'dynamic' || !chunk.words.length) {
      events.push(`Dialogue: 0,${assTime(chunk.start)},${assTime(chunk.end)},Default,,0,0,0,,${entrance}${escapeAss(chunk.text)}`)
      continue
    }
    for (let index = 0; index < chunk.words.length; index += 1) {
      const word = chunk.words[index]
      const highlight = highlightBehavior === 'bold' ? '{\\b1}'
        : highlightBehavior === 'scale' ? '{\\fscx110\\fscy110\\b1}'
        : highlightBehavior === 'background' ? `{\\bord5\\3c${assColor(style.highlightColor)}}`
        : `{\\c${assColor(style.highlightColor)}\\b1}`
      const text = chunk.words.map((item, itemIndex) => itemIndex === index
        ? `${highlight}${escapeAss(item.text)}{\\r}`
        : escapeAss(item.text)).join(' ')
      events.push(`Dialogue: 0,${assTime(Math.max(chunk.start, word.start))},${assTime(Math.min(chunk.end, word.end))},Default,,0,0,0,,${entrance}${text}`)
    }
  }
  return `${header}${events.join('\n')}\n`
}
