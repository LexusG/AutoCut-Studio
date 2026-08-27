import { useEffect, useMemo, useState } from 'react'
import { Check, GraduationCap, PlayCircle, RotateCcw, Search, X } from 'lucide-react'
import { TUTORIALS } from '../tutorials/catalogue'
import type { TutorialCategory } from '../tutorials/types'
import type { TutorialController } from '../hooks/use-tutorial'

/**
 * The place to go when you do not know how to do something.
 *
 * Reachable from the header and from `?` anywhere in the editor, because the previous
 * build offered no route into guidance at all.
 */
export function HelpPanel({ open, close, tutorials }: {
  open: boolean
  close: () => void
  tutorials: TutorialController
}): React.JSX.Element | null {
  const [query, setQuery] = useState('')

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent): void => { if (event.key === 'Escape') close() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, close])

  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return TUTORIALS
    return TUTORIALS.filter((tutorial) =>
      tutorial.title.toLowerCase().includes(needle) ||
      tutorial.summary.toLowerCase().includes(needle) ||
      tutorial.category.toLowerCase().includes(needle) ||
      tutorial.steps.some((step) => step.title.toLowerCase().includes(needle))
    )
  }, [query])

  if (!open) return null

  const startHere = matches.find((tutorial) => tutorial.startHere)
  const listed = query ? matches : matches.filter((tutorial) => tutorial !== startHere)
  const grouped = listed.reduce<Record<string, typeof TUTORIALS>>((accumulator, tutorial) => {
    const list = accumulator[tutorial.category] ?? []
    list.push(tutorial)
    accumulator[tutorial.category] = list
    return accumulator
  }, {})

  const launch = (id: string, resume: boolean): void => {
    tutorials.start(id, resume ? tutorials.progress[id]?.step ?? 0 : 0)
    close()
  }

  return (
    <div className="help-overlay" role="dialog" aria-label="Help and tutorials">
      <section className="help-panel">
        <header className="help-header">
          <div className="help-title">
            <GraduationCap size={18} />
            <h2>Help &amp; Tutorials</h2>
          </div>
          <button className="icon-button" type="button" onClick={close} title="Close" aria-label="Close help"><X size={18} /></button>
        </header>

        <label className="help-search">
          <Search size={15} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search tutorials"
            aria-label="Search tutorials"
          />
        </label>

        <div className="help-body">
          {startHere && !query && (
            <button className="help-start-here" type="button" onClick={() => launch(startHere.id, false)}>
              <span className="help-start-label">Start here</span>
              <strong>{startHere.title}</strong>
              <span className="help-start-summary">{startHere.summary}</span>
              <span className="help-start-action"><PlayCircle size={15} /> {startHere.minutes} min walkthrough</span>
            </button>
          )}

          {matches.length === 0 && <p className="help-empty">No tutorial matches “{query}”.</p>}

          {Object.entries(grouped).map(([category, list]) => (
            <section key={category} className="help-group">
              <h3>{category as TutorialCategory}</h3>
              {list.map((tutorial) => {
                const state = tutorials.stateOf(tutorial.id)
                const resumable = state === 'in-progress' && (tutorials.progress[tutorial.id]?.step ?? 0) > 0
                return (
                  <article key={tutorial.id} className="help-item">
                    <div className="help-item-text">
                      <strong>
                        {tutorial.title}
                        {state === 'completed' && <span className="help-done"><Check size={12} /> Done</span>}
                      </strong>
                      <span>{tutorial.summary}</span>
                      <span className="help-meta">{tutorial.minutes} min · {tutorial.steps.length} steps</span>
                    </div>
                    <div className="help-item-actions">
                      {resumable && (
                        <button className="button button-secondary" type="button" onClick={() => launch(tutorial.id, true)}>Resume</button>
                      )}
                      <button className="button button-primary" type="button" onClick={() => launch(tutorial.id, false)}>
                        {resumable ? 'Start over' : 'Start'}
                      </button>
                    </div>
                  </article>
                )
              })}
            </section>
          ))}
        </div>

        <footer className="help-footer">
          <span>Press <kbd>?</kbd> anywhere to open this. <kbd>Esc</kbd> closes it.</span>
          <button className="button button-secondary" type="button" onClick={tutorials.reset}>
            <RotateCcw size={14} /> Reset progress
          </button>
        </footer>
      </section>
    </div>
  )
}
