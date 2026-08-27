import { useEffect, useLayoutEffect, useState } from 'react'
import { GraduationCap, X } from 'lucide-react'
import type { ActiveTutorial } from '../hooks/use-tutorial'

interface Rect { top: number; left: number; width: number; height: number }

/**
 * Locates the element a step points at.
 *
 * Targets are `data-tutorial-id` values rather than CSS selectors, so moving or
 * restyling a control does not silently break a walkthrough.
 */
function findTarget(target: string | undefined): Rect | null {
  if (!target) return null
  const element = document.querySelector(`[data-tutorial-id="${target}"]`)
  if (!element) return null
  const box = element.getBoundingClientRect()
  if (box.width === 0 && box.height === 0) return null
  return { top: box.top, left: box.left, width: box.width, height: box.height }
}

/**
 * Coach marks over the live interface.
 *
 * The dimming is produced by an enormous spread shadow around the spotlight rather
 * than a full-viewport scrim, because two existing overlays deliberately start below
 * the header and most tutorial targets are in it. A scrim would cover the very
 * controls being pointed at.
 */
export function TutorialOverlay({ active, next, back, stop }: {
  active: ActiveTutorial
  next: () => void
  back: () => void
  stop: () => void
}): React.JSX.Element {
  const [rect, setRect] = useState<Rect | null>(null)
  const { step, index, total, canAdvance } = active

  useLayoutEffect(() => {
    const measure = (): void => setRect(findTarget(step.target))
    measure()
    // Targets move when panels open, the window resizes, or a list grows.
    const timer = window.setInterval(measure, 250)
    window.addEventListener('resize', measure)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('resize', measure)
    }
  }, [step.target])

  // A tutorial must never trap the user, so Escape always leaves.
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') stop()
      if (event.key === 'ArrowRight' && canAdvance) next()
      if (event.key === 'ArrowLeft' && index > 0) back()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [stop, next, back, canAdvance, index])

  const padding = 6
  const spotlight = rect ? {
    top: rect.top - padding,
    left: rect.left - padding,
    width: rect.width + padding * 2,
    height: rect.height + padding * 2
  } : null

  /*
   * Place the card beside the spotlight, never over it.
   *
   * Tall targets such as a full panel leave no room above or below, so those get a
   * side placement; otherwise the card sits under the target, or above it when the
   * viewport bottom is close.
   */
  const card = ((): { top: number; left: number } | null => {
    if (!spotlight) return null
    const width = 360
    const height = 190
    const gap = 12
    const maxLeft = Math.max(gap, window.innerWidth - width - gap)
    const maxTop = Math.max(gap, window.innerHeight - height - gap)
    const clamp = (value: number, limit: number): number => Math.min(Math.max(gap, value), limit)

    const belowFits = spotlight.top + spotlight.height + gap + height < window.innerHeight
    const aboveFits = spotlight.top - gap - height > 0
    if (belowFits || aboveFits) {
      return {
        top: belowFits ? spotlight.top + spotlight.height + gap : spotlight.top - gap - height,
        left: clamp(spotlight.left, maxLeft)
      }
    }
    // Nothing above or below: sit to whichever side has more room.
    const rightRoom = window.innerWidth - (spotlight.left + spotlight.width)
    const left = rightRoom > spotlight.left
      ? spotlight.left + spotlight.width + gap
      : spotlight.left - width - gap
    return { top: clamp(spotlight.top, maxTop), left: clamp(left, maxLeft) }
  })()

  return (
    <div className="tutorial-layer" role="dialog" aria-label={`${active.definition.title}, step ${index + 1} of ${total}`}>
      {spotlight
        ? <div className="tutorial-spotlight" style={spotlight} aria-hidden="true" />
        : <div className="tutorial-scrim" aria-hidden="true" />}

      <section
        className={card ? 'tutorial-card' : 'tutorial-card tutorial-card-centred'}
        style={card ?? undefined}
      >
        <header>
          <span className="tutorial-progress">
            <GraduationCap size={13} /> Step {index + 1} of {total}
          </span>
          <button className="icon-button" type="button" onClick={stop} title="Close tutorial" aria-label="Close tutorial">
            <X size={15} />
          </button>
        </header>
        <h3>{step.title}</h3>
        <p>{step.description}</p>
        {step.type === 'action' && !canAdvance && (
          <p className="tutorial-waiting">Do this in the app to continue.</p>
        )}
        <footer>
          <button className="button button-secondary" type="button" onClick={stop}>Skip</button>
          <div className="tutorial-nav">
            {index > 0 && <button className="button button-secondary" type="button" onClick={back}>Back</button>}
            <button className="button button-primary" type="button" onClick={next} disabled={!canAdvance}>
              {index === total - 1 ? 'Finish' : 'Next'}
            </button>
          </div>
        </footer>
      </section>
    </div>
  )
}
