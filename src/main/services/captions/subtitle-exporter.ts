import { mkdir, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import type { CaptionAnimation, CaptionHighlight, CaptionStyle, CaptionTrack, CaptionWord, CaptionWordDisplay } from '@shared/types'

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

/**
 * Resolves the on-screen anchor the styled alignment and margins produce.
 *
 * Motion tags such as `\\move` need absolute coordinates, so animations that travel
 * have to reproduce the position libass would have derived from the style itself.
 */
function anchorPoint(style: CaptionStyle, width: number, height: number, marginH: number, marginV: number): { x: number; y: number } {
  const code = alignment(style)
  const column = (code - 1) % 3
  const x = column === 0 ? marginH : column === 1 ? Math.round(width / 2) : width - marginH
  const y = code >= 7 ? marginV : code >= 4 ? Math.round(height / 2) : height - marginV
  return { x, y }
}

/**
 * Entrance tags for a caption event.
 *
 * `slide-up` is the only animation that needs geometry: it re-anchors the event with
 * `\\an` so the `\\move` it emits lands exactly where the static caption would sit.
 */
function entranceTags(
  animation: CaptionAnimation,
  style: CaptionStyle,
  width: number,
  height: number,
  marginH: number,
  marginV: number
): string {
  switch (animation) {
    case 'fade':
      return '{\\fad(120,0)}'
    case 'pop':
      return '{\\fscx85\\fscy85\\t(0,120,\\fscx100\\fscy100)}'
    case 'bounce':
      return '{\\fscx55\\fscy55\\t(0,90,\\fscx112\\fscy112)\\t(90,170,\\fscx100\\fscy100)}'
    case 'zoom-punch':
      return '{\\fad(60,0)\\fscx145\\fscy145\\t(0,110,\\fscx100\\fscy100)}'
    case 'blur-in':
      return '{\\blur8\\alpha&H60&\\t(0,170,\\blur0\\alpha&H00&)}'
    case 'slide-up': {
      const { x, y } = anchorPoint(style, width, height, marginH, marginV)
      const travel = Math.max(12, Math.round(height * 0.06))
      return `{\\an${alignment(style)}\\move(${x},${y + travel},${x},${y},0,170)\\fad(90,0)}`
    }
    default:
      return ''
  }
}

/** Override tags that emphasise the word currently being spoken. */
function highlightTags(behavior: CaptionHighlight, style: CaptionStyle): string {
  switch (behavior) {
    case 'bold':
      return '{\\b1}'
    case 'scale':
      return '{\\fscx110\\fscy110\\b1}'
    case 'background':
      return `{\\bord5\\3c${assColor(style.highlightColor)}}`
    case 'box-pop':
      return `{\\b1\\bord9\\shad0\\3c${assColor(style.highlightColor)}\\fscx112\\fscy112\\t(0,90,\\fscx100\\fscy100)}`
    case 'glow':
      return `{\\b1\\c${assColor(style.highlightColor)}\\bord4\\3c${assColor(style.highlightColor)}\\blur10}`
    case 'underline':
      return `{\\u1\\c${assColor(style.highlightColor)}}`
    default:
      return `{\\c${assColor(style.highlightColor)}\\b1}`
  }
}

/**
 * Selects the words visible while `index` is spoken.
 *
 * `full` keeps the whole chunk on screen, `cumulative` builds the line up word by
 * word, and `single` shows only the spoken word.
 */
function visibleWords(words: CaptionWord[], index: number, display: CaptionWordDisplay): Array<{ word: CaptionWord; active: boolean }> {
  if (display === 'single') return [{ word: words[index], active: true }]
  const slice = display === 'cumulative' ? words.slice(0, index + 1) : words
  return slice.map((word, itemIndex) => ({ word, active: itemIndex === index }))
}

/**
 * Builds one karaoke line per chunk using `\\kf` fill timings.
 *
 * Unlike the per-word events the other behaviours emit, a karaoke line is a single
 * event whose colours sweep as it plays: `\\2c` is the unsung colour and `\\1c` the
 * sung one, so the fill runs from the caption text colour into the highlight colour.
 */
function karaokeLine(chunk: CaptionTrack['chunks'][number], style: CaptionStyle): string {
  const pieces: string[] = [`{\\1c${assColor(style.highlightColor)}\\2c${assColor(style.textColor)}}`]
  let cursor = Math.max(chunk.start, chunk.words[0]?.start ?? chunk.start)
  for (const word of chunk.words) {
    const lead = Math.max(0, Math.round((Math.max(cursor, word.start) - cursor) * 100))
    if (lead > 0) pieces.push(`{\\kf${lead}}`)
    const duration = Math.max(1, Math.round((Math.min(chunk.end, word.end) - Math.max(cursor, word.start)) * 100))
    pieces.push(`{\\kf${duration}}${escapeAss(word.text)} `)
    cursor = Math.max(cursor, word.end)
  }
  return pieces.join('').trimEnd()
}

function escapeAss(text: string): string { return text.replace(/[{}]/g, '').replace(/\n/g, '\\N') }

export function serializeAss(
  track: CaptionTrack,
  style: CaptionStyle,
  width: number,
  height: number,
  highlightSpokenWord: boolean,
  highlightBehavior: CaptionHighlight = 'color',
  animation: CaptionAnimation = 'none',
  wordDisplay: CaptionWordDisplay = 'full'
): string {
  const marginV = Math.round(height * Math.max(0.03, style.verticalOffset / 100))
  const marginH = Math.round(width * Math.max(0.02, (100 - style.maximumWidth) / 200))
  const outline = style.backgroundEnabled ? 0 : style.outline
  const borderStyle = style.backgroundEnabled ? 3 : 1
  const backgroundAlpha = Math.round((1 - style.backgroundOpacity) * 255)
  const header = `[Script Info]\nScriptType: v4.00+\nPlayResX: ${width}\nPlayResY: ${height}\nScaledBorderAndShadow: yes\nWrapStyle: 0\n\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: Default,${style.fontFamily},${style.fontSize},${assColor(style.textColor)},${assColor(style.highlightColor)},&H00000000,${assColor('#000000', backgroundAlpha)},${style.fontWeight >= 600 ? -1 : 0},0,0,0,100,100,0,0,${borderStyle},${outline},${style.shadow},${alignment(style)},${marginH},${marginH},${marginV},1\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n`
  const events: string[] = []
  const entrance = entranceTags(animation, style, width, height, marginH, marginV)
  const highlight = highlightTags(highlightBehavior, style)
  for (const chunk of validChunks(track)) {
    const perWord = highlightSpokenWord && track.mode === 'dynamic' && chunk.words.length > 0
    if (!perWord) {
      events.push(`Dialogue: 0,${assTime(chunk.start)},${assTime(chunk.end)},Default,,0,0,0,,${entrance}${escapeAss(chunk.text)}`)
      continue
    }
    // A karaoke sweep is timed by its own fill tags, so the chunk stays a single event.
    if (highlightBehavior === 'karaoke-fill') {
      events.push(`Dialogue: 0,${assTime(chunk.start)},${assTime(chunk.end)},Default,,0,0,0,,${entrance}${karaokeLine(chunk, style)}`)
      continue
    }
    for (let index = 0; index < chunk.words.length; index += 1) {
      const word = chunk.words[index]
      const text = visibleWords(chunk.words, index, wordDisplay)
        .map((item) => item.active ? `${highlight}${escapeAss(item.word.text)}{\\r}` : escapeAss(item.word.text))
        .join(' ')
      events.push(`Dialogue: 0,${assTime(Math.max(chunk.start, word.start))},${assTime(Math.min(chunk.end, word.end))},Default,,0,0,0,,${entrance}${text}`)
    }
  }
  return `${header}${events.join('\n')}\n`
}
