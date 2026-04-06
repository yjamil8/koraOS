import { randomUUID } from 'crypto'
import { mkdir, readFile, rename, writeFile } from 'fs/promises'
import { homedir } from 'os'
import { join } from 'path'
import type { DaemonSessionRecord, DaemonSessionSummary } from './types.js'

const KORA_HOME = process.env.KORA_HOME || join(homedir(), '.kora')
const SESSIONS_DIR = join(KORA_HOME, 'sessions')
const SESSION_INDEX_PATH = join(SESSIONS_DIR, 'index.json')
const MAX_SANITIZED_LENGTH = 200

type SessionIndexRecord = Omit<DaemonSessionRecord, 'history'>

type SessionIndex = {
  sessions: Record<string, SessionIndexRecord>
}

function defaultIndex(): SessionIndex {
  return { sessions: {} }
}

function nowIso(): string {
  return new Date().toISOString()
}

function summarize(session: DaemonSessionRecord): DaemonSessionSummary {
  const { history, ...rest } = session
  return {
    ...rest,
    historyCount: history.length,
  }
}

function sanitizePath(input: string): string {
  const sanitized = input.replace(/[^a-zA-Z0-9]/g, '-')
  if (sanitized.length <= MAX_SANITIZED_LENGTH) {
    return sanitized
  }
  return sanitized.slice(0, MAX_SANITIZED_LENGTH)
}

function getClaudeConfigHomeDir(): string {
  return (process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), '.claude')).normalize(
    'NFC',
  )
}

function getDefaultTranscriptPath(projectPath: string, sessionId: string): string {
  const projectsDir = join(getClaudeConfigHomeDir(), 'projects')
  const projectDir = join(projectsDir, sanitizePath(projectPath))
  return join(projectDir, `${sessionId}.jsonl`)
}

function getSessionPath(sessionId: string): string {
  return join(SESSIONS_DIR, `${sessionId}.json`)
}

async function ensureSessionDir(): Promise<void> {
  await mkdir(SESSIONS_DIR, { recursive: true })
}

async function writeJsonAtomic(path: string, data: unknown): Promise<void> {
  await ensureSessionDir()
  const tmpPath = `${path}.tmp-${process.pid}-${Date.now()}`
  await writeFile(tmpPath, JSON.stringify(data, null, 2), 'utf8')
  await rename(tmpPath, path)
}

async function readIndex(): Promise<SessionIndex> {
  try {
    const content = await readFile(SESSION_INDEX_PATH, 'utf8')
    const parsed = JSON.parse(content) as SessionIndex
    if (!parsed || typeof parsed !== 'object' || !parsed.sessions) {
      return defaultIndex()
    }
    return parsed
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code === 'ENOENT') {
      return defaultIndex()
    }
    return defaultIndex()
  }
}

async function writeIndex(index: SessionIndex): Promise<void> {
  await writeJsonAtomic(SESSION_INDEX_PATH, index)
}

async function readSession(sessionId: string): Promise<DaemonSessionRecord | null> {
  try {
    const content = await readFile(getSessionPath(sessionId), 'utf8')
    const parsed = JSON.parse(content) as Partial<DaemonSessionRecord>
    if (!parsed || typeof parsed !== 'object' || typeof parsed.id !== 'string') {
      return null
    }
    const history = Array.isArray(parsed.history) ? parsed.history : []
    return {
      id: parsed.id,
      projectPath:
        typeof parsed.projectPath === 'string' ? parsed.projectPath : process.cwd(),
      transcriptPath:
        typeof parsed.transcriptPath === 'string'
          ? parsed.transcriptPath
          : getDefaultTranscriptPath(process.cwd(), parsed.id),
      createdAt:
        typeof parsed.createdAt === 'string' ? parsed.createdAt : nowIso(),
      updatedAt:
        typeof parsed.updatedAt === 'string' ? parsed.updatedAt : nowIso(),
      ownerPid:
        typeof parsed.ownerPid === 'number' && Number.isInteger(parsed.ownerPid)
          ? parsed.ownerPid
          : null,
      ownerClientId:
        typeof parsed.ownerClientId === 'string' ? parsed.ownerClientId : null,
      state:
        parsed.state === 'active' || parsed.state === 'closed' ? parsed.state : 'idle',
      history,
    }
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code === 'ENOENT') {
      return null
    }
    return null
  }
}

async function writeSession(session: DaemonSessionRecord): Promise<void> {
  await writeJsonAtomic(getSessionPath(session.id), session)
  const index = await readIndex()
  index.sessions[session.id] = {
    id: session.id,
    projectPath: session.projectPath,
    transcriptPath: session.transcriptPath,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    ownerPid: session.ownerPid,
    ownerClientId: session.ownerClientId,
    state: session.state,
  }
  await writeIndex(index)
}

function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    return code === 'EPERM'
  }
}

function parseTranscriptEntries(raw: string): unknown[] {
  const entries: unknown[] = []
  for (const line of raw.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) {
      continue
    }
    try {
      entries.push(JSON.parse(trimmed))
    } catch {
      // Ignore malformed lines.
    }
  }
  return entries
}

async function syncSessionHistory(session: DaemonSessionRecord): Promise<DaemonSessionRecord> {
  try {
    const raw = await readFile(session.transcriptPath, 'utf8')
    session.history = parseTranscriptEntries(raw)
    session.updatedAt = nowIso()
    await writeSession(session)
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code !== 'ENOENT') {
      // Keep old history on failure.
    }
  }
  return session
}

export async function listSessions(projectPath?: string): Promise<DaemonSessionSummary[]> {
  const index = await readIndex()
  const all = Object.values(index.sessions)
    .filter(item => (projectPath ? item.projectPath === projectPath : true))
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))

  const summaries: DaemonSessionSummary[] = []
  for (const item of all) {
    const session = await readSession(item.id)
    if (!session) {
      continue
    }
    summaries.push(summarize(session))
  }
  return summaries
}

export async function getSession(sessionId: string): Promise<DaemonSessionRecord | null> {
  const session = await readSession(sessionId)
  if (!session) {
    return null
  }
  return session
}

export async function createSession(input: {
  projectPath: string
  sessionId?: string
  transcriptPath?: string
}): Promise<DaemonSessionRecord> {
  const sessionId = input.sessionId ?? randomUUID()
  const existing = await readSession(sessionId)
  if (existing) {
    return existing
  }

  const createdAt = nowIso()
  const session: DaemonSessionRecord = {
    id: sessionId,
    projectPath: input.projectPath,
    transcriptPath:
      input.transcriptPath ??
      getDefaultTranscriptPath(input.projectPath, sessionId),
    createdAt,
    updatedAt: createdAt,
    ownerPid: null,
    ownerClientId: null,
    state: 'idle',
    history: [],
  }
  await writeSession(session)
  return session
}

export async function attachSession(input: {
  sessionId: string
  ownerPid: number
  ownerClientId: string
  projectPath?: string
  transcriptPath?: string
  syncHistoryFromTranscript?: boolean
}): Promise<{ session: DaemonSessionRecord; stolenFromPid: number | null }> {
  let session = await readSession(input.sessionId)
  if (!session) {
    session = await createSession({
      projectPath: input.projectPath ?? process.cwd(),
      sessionId: input.sessionId,
      transcriptPath: input.transcriptPath,
    })
  }

  if (input.projectPath) {
    session.projectPath = input.projectPath
  }
  if (input.transcriptPath) {
    session.transcriptPath = input.transcriptPath
  }

  const previousOwnerPid =
    session.ownerPid && session.ownerPid !== input.ownerPid ? session.ownerPid : null

  if (
    previousOwnerPid &&
    previousOwnerPid !== process.pid &&
    isPidAlive(previousOwnerPid)
  ) {
    try {
      process.kill(previousOwnerPid, 'SIGTERM')
    } catch {
      // Ignore if the previous owner already exited.
    }
  }

  session.ownerPid = input.ownerPid
  session.ownerClientId = input.ownerClientId
  session.state = 'active'
  session.updatedAt = nowIso()
  await writeSession(session)
  if (input.syncHistoryFromTranscript !== false) {
    session = await syncSessionHistory(session)
  }

  return {
    session,
    stolenFromPid: previousOwnerPid,
  }
}

export async function closeSession(input: {
  sessionId: string
  ownerClientId?: string
}): Promise<DaemonSessionRecord | null> {
  const session = await readSession(input.sessionId)
  if (!session) {
    return null
  }
  if (
    input.ownerClientId &&
    session.ownerClientId &&
    session.ownerClientId !== input.ownerClientId
  ) {
    return session
  }
  session.ownerPid = null
  session.ownerClientId = null
  session.state = 'idle'
  session.updatedAt = nowIso()
  await writeSession(session)
  return session
}

export async function updateSessionHistory(input: {
  sessionId: string
  history: unknown[]
  ownerPid?: number | null
  ownerClientId?: string | null
  state?: DaemonSessionRecord['state']
}): Promise<DaemonSessionRecord | null> {
  const session = await readSession(input.sessionId)
  if (!session) {
    return null
  }
  session.history = Array.isArray(input.history) ? input.history : []
  session.ownerPid =
    input.ownerPid === undefined ? session.ownerPid : input.ownerPid
  session.ownerClientId =
    input.ownerClientId === undefined
      ? session.ownerClientId
      : input.ownerClientId
  session.state = input.state ?? session.state
  session.updatedAt = nowIso()
  await writeSession(session)
  return session
}

export async function syncActiveSessions(): Promise<void> {
  const index = await readIndex()
  const activeIds = Object.values(index.sessions)
    .filter(item => item.state === 'active')
    .map(item => item.id)
  for (const sessionId of activeIds) {
    const session = await readSession(sessionId)
    if (!session) {
      continue
    }
    if (session.ownerPid && !isPidAlive(session.ownerPid)) {
      session.ownerPid = null
      session.ownerClientId = null
      session.state = 'idle'
      session.updatedAt = nowIso()
      await writeSession(session)
      continue
    }
    await syncSessionHistory(session)
  }
}
