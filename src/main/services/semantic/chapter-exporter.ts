import type { TopicSegment } from '@shared/types'

function timestamp(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds))
  const hours = Math.floor(whole / 3600)
  const minutes = Math.floor((whole % 3600) / 60)
  const remaining = whole % 60
  return hours > 0
    ? `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${remaining.toString().padStart(2, '0')}`
    : `${minutes.toString().padStart(2, '0')}:${remaining.toString().padStart(2, '0')}`
}

export function serializeChapters(topics: TopicSegment[]): string {
  return `${topics.filter((topic) => topic.chapterEnabled && topic.importance !== 'exclude')
    .sort((left, right) => left.chapterStart - right.chapterStart)
    .map((topic, index) => `${timestamp(topic.chapterStart)} ${topic.userLabel?.trim() || `Topic ${index + 1}`}`)
    .join('\n')}\n`
}
