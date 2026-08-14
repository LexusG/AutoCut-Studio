import { Clock3, FolderOpen, Plus, Trash2 } from 'lucide-react'
import { BrandMark } from '../components/BrandMark'
import { FfmpegNotice } from '../components/FfmpegNotice'
import { useAppStore } from '../stores/app-store'
import { formatRecentDate, sortRecentProjects, useProjectFiles } from '../hooks/use-project-files'

export function HomePage(): React.JSX.Element {
  const startProject = useAppStore((state) => state.startProject)
  const ffmpegStatus = useAppStore((state) => state.ffmpegStatus)
  const recentProjects = useAppStore((state) => state.recentProjects)
  const { chooseAndOpen, openRecent, removeRecent, busy, error } = useProjectFiles()

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
            onClick={() => void chooseAndOpen()}
            disabled={busy}
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
        {recentProjects.length === 0 ? (
          <div className="recent-empty">
            <span>No recent projects</span>
            <button type="button" onClick={startProject}>Create your first project</button>
          </div>
        ) : (
          <div className="recent-list">
            {sortRecentProjects(recentProjects).map((project) => (
              <article className="recent-project" key={project.filePath}>
                <button className="recent-project-open" type="button" onClick={() => void openRecent(project.filePath)} disabled={busy}>
                  <strong>{project.projectName}</strong>
                  <span>{project.clipCount} {project.clipCount === 1 ? 'clip' : 'clips'} • {formatRecentDate(project.lastOpened)}</span>
                </button>
                <button className="recent-project-remove" type="button" onClick={() => void removeRecent(project.filePath)} title="Remove from recents" aria-label={`Remove ${project.projectName} from recents`}>
                  <Trash2 size={15} />
                </button>
              </article>
            ))}
          </div>
        )}
        {error && <div className="home-error" role="alert">{error}</div>}
      </section>

      <footer className="home-footer">Local processing. Your footage stays on this computer.</footer>
    </main>
  )
}
