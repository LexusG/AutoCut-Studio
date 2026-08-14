import { Clapperboard } from 'lucide-react'

export function BrandMark({ compact = false }: { compact?: boolean }): React.JSX.Element {
  return (
    <div className="brand-mark">
      <span className="brand-icon" aria-hidden="true">
        <Clapperboard size={compact ? 18 : 22} strokeWidth={2.2} />
      </span>
      <span className={compact ? 'brand-name brand-name-compact' : 'brand-name'}>AutoCut Studio</span>
    </div>
  )
}
