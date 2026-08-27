import { useMemo, useState } from 'react'
import {
  AudioLines, Captions, ChevronDown, Check, Layers, ScissorsLineDashed,
  Sparkles, Star, Users, Wand2
} from 'lucide-react'

import { useAppStore } from '../stores/app-store'
import { useAssistant } from '../hooks/use-assistant'
import type { AssistantSuggestion, SuggestionTarget } from '../utils/assistant-suggestions'

const ICONS: Record<string, React.ComponentType<{ size?: number }>> = {
  'audio-quality': AudioLines,
  'dead-space': ScissorsLineDashed,
  'filler-words': ScissorsLineDashed,
  highlights: Star,
  speakers: Users,
  'captions-pending': Captions,
  topics: Layers,
  variants: Wand2
}

/**
 * The assistant's read on the project.
 *
 * Every row is derived from analysis the project already ran, so this panel adds a
 * decision surface rather than new work: the user accepts or ignores findings
 * instead of hunting for the settings that produced them.
 */
export function AssistantPanel({ openWorkspace }: { openWorkspace: (tab: SuggestionTarget) => void }): React.JSX.Element {
  const [expanded, setExpanded] = useState<string | null>(null)
  const [dismissed, setDismissed] = useState<string[]>([])

  const clipCount = useAppStore((state) => state.clips.length)
  const { suggestions: all, status } = useAssistant()
  const suggestions = useMemo(
    () => all.filter((item) => !dismissed.includes(item.id)),
    [all, dismissed]
  )
  const attention = suggestions.filter((item) => item.severity === 'attention').length

  return (
    <aside className="assistant-panel" aria-label="AI assistant">
      <header className="assistant-header">
        <p className="assistant-status">{status}</p>
        {suggestions.length > 0 && (
          <span className={attention > 0 ? 'assistant-count assistant-count-attention' : 'assistant-count'}>
            {suggestions.length}
          </span>
        )}
      </header>

      {suggestions.length === 0 ? (
        <div className="assistant-empty">
          <Check size={22} />
          <strong>Nothing needs your attention</strong>
          <span>
            {clipCount === 0
              ? 'Import clips and the assistant will analyse them.'
              : 'Suggestions appear here as analysis finds them.'}
          </span>
        </div>
      ) : (
        <ul className="assistant-list">
          {suggestions.map((suggestion) => (
            <SuggestionRow
              key={suggestion.id}
              suggestion={suggestion}
              expanded={expanded === suggestion.id}
              toggle={() => setExpanded(expanded === suggestion.id ? null : suggestion.id)}
              act={() => openWorkspace(suggestion.target)}
              dismiss={() => setDismissed([...dismissed, suggestion.id])}
            />
          ))}
        </ul>
      )}

      {dismissed.length > 0 && (
        <button className="assistant-restore" type="button" onClick={() => setDismissed([])}>
          Show {dismissed.length} dismissed
        </button>
      )}
    </aside>
  )
}

function SuggestionRow({ suggestion, expanded, toggle, act, dismiss }: {
  suggestion: AssistantSuggestion
  expanded: boolean
  toggle: () => void
  act: () => void
  dismiss: () => void
}): React.JSX.Element {
  const Icon = ICONS[suggestion.id] ?? Sparkles
  return (
    <li className={`assistant-item assistant-${suggestion.severity}`}>
      <button className="assistant-item-head" type="button" onClick={toggle} aria-expanded={expanded}>
        <span className="assistant-item-icon"><Icon size={15} /></span>
        <span className="assistant-item-text">
          <strong>{suggestion.title}</strong>
          <span>{suggestion.detail}</span>
        </span>
        <ChevronDown size={14} className={expanded ? 'assistant-chevron assistant-chevron-open' : 'assistant-chevron'} />
      </button>
      {expanded && (
        <div className="assistant-item-body">
          <p>{suggestion.reasoning}</p>
          <div className="assistant-item-actions">
            <button className="button button-primary" type="button" onClick={act}>{suggestion.actionLabel}</button>
            <button className="button button-secondary" type="button" onClick={dismiss}>Dismiss</button>
          </div>
        </div>
      )}
    </li>
  )
}
