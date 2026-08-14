import { Clock3, FolderOpen, Plus } from 'lucide-react'
import { BrandMark } from '../components/BrandMark'
import { FfmpegNotice } from '../components/FfmpegNotice'
import { useAppStore } from '../stores/app-store'

export function HomePage(): React.JSX.Element {
  const startProject = useAppStore((state) => state.startProject)
  const ffmpegStatus = useAppStore((state) => state.ffmpegStatus)

  return (
    <main className="home-page">
      <header className="home-header">
        <BrandMark />
        <FfmpegNotice status={ffmpegStatus} />
      </header>

      <section className="home-intro" aria-labelledby="home-title">
        <div className="home-kicker">LOCAL VIDEO WORKSPACE</div>
        <h1 id="home-title">AutoCut Studio</h1>
        <p>Turn your clips into a finished video automatically.</p>
        <div className="home-actions">
          <button className="button button-primary button-large" type="button" onClick={startProject}>
            <Plus size={19} /> New Project
          </button>
          <button
            className="button button-secondary button-large"
            type="button"
            disabled
            title="Project files are planned for Phase 5"
          >
            <FolderOpen size={18} /> Open Existing Project
          </button>
        </div>
      </section>

      <section className="recent-section" aria-labelledby="recent-title">
        <div className="section-heading">
          <Clock3 size={17} />
          <h2 id="recent-title">Recent Projects</h2>
        </div>
        <div className="recent-empty">
          <span>No recent projects</span>
          <button type="button" onClick={startProject}>Create your first project</button>
        </div>
      </section>

      <footer className="home-footer">Local processing. Your footage stays on this computer.</footer>
    </main>
  )
}
