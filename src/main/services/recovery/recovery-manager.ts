import { readdir, readFile, rm, stat } from 'node:fs/promises'
import { join, resolve, sep } from 'node:path'
import type { ProjectFile, RecoveryCandidate, RecoveryJournalEntry, RecoverySessionState } from '@shared/types'
import { parseProjectFile, serializeProjectFile } from '@shared/utils/project-codec'
import { writeFileAtomic } from '../filesystem/atomic-write'
import { beginSession, recoveryRoot } from './session-marker'

const JOURNAL_FILE = 'journal.json'
const PROJECT_FILE = 'project.json'

const safeId = (value: string): string => {
  if (!/^[a-zA-Z0-9_-]+$/.test(value)) throw new Error('The project identifier is invalid.')
  return value
}

function journalDirectory(projectId: string): string {
  const directory = join(recoveryRoot(), safeId(projectId))
  const root = resolve(recoveryRoot())
  const candidate = resolve(directory)
  if (!candidate.startsWith(`${root}${sep}`)) {
    throw new Error('Refusing to write outside recovery storage.')
  }
  return directory
}

/**
 * Record the in-memory project so an abrupt exit cannot lose it.
 *
 * The journal deliberately holds only project metadata — never media — and is written
 * separately from the user's project file, so a crash can never damage the last
 * version the user explicitly saved.
 */
export async function writeRecoveryJournal(
  project: ProjectFile,
  projectFilePath: string | null,
  dirty: boolean
): Promise<void> {
  const directory = journalDirectory(project.id)
  const entry: RecoveryJournalEntry = {
    projectId: project.id,
    projectName: project.settings.name,
    projectFilePath,
    savedAt: new Date().toISOString(),
    projectRevision: project.projectRevision,
    dirty
  }
  await writeFileAtomic(join(directory, PROJECT_FILE), serializeProjectFile(project))
  await writeFileAtomic(join(directory, JOURNAL_FILE), `${JSON.stringify(entry, null, 2)}\n`)
}

export async function discardRecovery(projectId: string): Promise<void> {
  await rm(journalDirectory(projectId), { recursive: true, force: true })
}

async function readJournalEntry(projectId: string): Promise<RecoveryJournalEntry | null> {
  try {
    const parsed = JSON.parse(
      await readFile(join(journalDirectory(projectId), JOURNAL_FILE), 'utf8')
    ) as Partial<RecoveryJournalEntry>
    if (typeof parsed.projectId !== 'string' || typeof parsed.savedAt !== 'string') return null
    return {
      projectId: parsed.projectId,
      projectName: typeof parsed.projectName === 'string' ? parsed.projectName : 'Untitled project',
      projectFilePath: typeof parsed.projectFilePath === 'string' ? parsed.projectFilePath : null,
      savedAt: parsed.savedAt,
      projectRevision: Number.isInteger(parsed.projectRevision) ? (parsed.projectRevision as number) : 0,
      dirty: parsed.dirty === true
    }
  } catch {
    return null
  }
}

/** The project as it stood when the journal was last written. */
export async function readRecoveredProject(projectId: string): Promise<ProjectFile> {
  const contents = await readFile(join(journalDirectory(projectId), PROJECT_FILE), 'utf8')
  return parseProjectFile(contents)
}

async function buildCandidate(entry: RecoveryJournalEntry): Promise<RecoveryCandidate> {
  let savedProjectAt: string | null = null
  if (entry.projectFilePath) {
    try {
      savedProjectAt = (await stat(entry.projectFilePath)).mtime.toISOString()
    } catch {
      savedProjectAt = null
    }
  }
  // A journal that has never been written to a file is always worth offering; otherwise
  // it only matters when it holds work the saved file does not already contain.
  const journalIsNewer =
    entry.projectFilePath === null || savedProjectAt === null
      ? true
      : Date.parse(entry.savedAt) > Date.parse(savedProjectAt)
  return { entry, savedProjectAt, journalIsNewer }
}

export async function listRecoveryCandidates(): Promise<RecoveryCandidate[]> {
  let directories: string[]
  try {
    directories = (await readdir(recoveryRoot(), { withFileTypes: true }))
      .filter((item) => item.isDirectory())
      .map((item) => item.name)
  } catch {
    return []
  }

  const candidates: RecoveryCandidate[] = []
  for (const projectId of directories) {
    const entry = await readJournalEntry(projectId).catch(() => null)
    if (!entry || !entry.dirty) continue
    candidates.push(await buildCandidate(entry))
  }
  return candidates
    .filter((candidate) => candidate.journalIsNewer)
    .sort((a, b) => Date.parse(b.entry.savedAt) - Date.parse(a.entry.savedAt))
}

/**
 * Start a session and collect anything worth offering to recover.
 *
 * Candidates are reported whether or not the previous shutdown was clean: a journal
 * newer than its saved project means unsaved work exists regardless of how the last
 * run ended.
 */
export async function inspectRecoveryState(): Promise<RecoverySessionState> {
  const { previousSessionCleanlyClosed } = await beginSession()
  return { previousSessionCleanlyClosed, candidates: await listRecoveryCandidates() }
}
