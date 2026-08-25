import { Wand2 } from 'lucide-react'
import { EDIT_STYLES } from '@shared/constants/edit-styles'
import type { EditStyleId } from '@shared/types'
import { useAutoSnapshot } from '../hooks/use-auto-snapshot'
import { useAppStore } from '../stores/app-store'

const AUTO_DESCRIPTION = 'Chooses a style from your footage — speech, motion, people, and clip length.'

/**
 * Edit Style picker.
 *
 * A style rewrites pacing, transitions, captions, motion and audio together, so it is
 * presented above the individual editing controls rather than beside them. Everything it
 * sets stays editable underneath.
 */
export function EditStyleSelector(): React.JSX.Element {
  const editStyle = useAppStore((state) => state.projectSettings.editing.editStyle)
  const selectEditStyle = useAppStore((state) => state.selectEditStyle)
  const takeSnapshot = useAutoSnapshot()

  const selected: EditStyleId | null = editStyle?.id ?? null
  const active = selected && selected !== 'auto' ? EDIT_STYLES.find((style) => style.id === selected) : null

  const choose = (styleId: EditStyleId): void => {
    // A style change rewrites many settings at once, so keep a way back.
    void takeSnapshot('before-style-change').then(() => selectEditStyle(styleId))
  }

  return (
    <section className="edit-style-section">
      <div className="settings-section-title">
        <span>Edit Style</span>
        {selected === null && <strong>Legacy</strong>}
      </div>
      <div className="edit-style-grid" role="listbox" aria-label="Edit style">
        <button
          type="button"
          role="option"
          aria-selected={selected === 'auto'}
          onClick={() => choose('auto')}
        >
          <Wand2 size={13} />
          <strong>Auto</strong>
        </button>
        {EDIT_STYLES.map((style) => (
          <button
            key={style.id}
            type="button"
            role="option"
            aria-selected={selected === style.id}
            onClick={() => choose(style.id)}
          >
            <strong>{style.name}</strong>
          </button>
        ))}
      </div>
      <p className="edit-style-summary">
        {selected === 'auto' ? AUTO_DESCRIPTION : active ? active.description : null}
        {selected === null && 'This project was made before edit styles and keeps its original behaviour.'}
      </p>
      {active && <small className="edit-style-recommended">Best for {active.recommendedFor}.</small>}
    </section>
  )
}
