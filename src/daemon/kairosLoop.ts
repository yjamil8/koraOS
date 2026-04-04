import { ask } from 'src/QueryEngine.js'
import {
  setCwdState,
  setIsInteractive,
  setKairosActive,
  setOriginalCwd,
  setSessionPersistenceDisabled,
  setSessionSource,
  switchSession,
} from 'src/bootstrap/state.js'
import { getCommands } from 'src/commands.js'
import { createStore } from 'src/state/store.js'
import { getDefaultAppState, type AppState } from 'src/state/AppStateStore.js'
import { type CanUseToolFn } from 'src/hooks/useCanUseTool.js'
import { getTools } from 'src/tools.js'
import { getAssistantMessageText, getUserMessageText } from 'src/utils/messages.js'
import {
  createFileStateCacheWithSizeLimit,
  READ_FILE_STATE_CACHE_SIZE,
} from 'src/utils/fileStateCache.js'
import { hasPermissionsToUseTool } from 'src/utils/permissions/permissions.js'
import { attachSession, getSession, listSessions, updateSessionHistory } from './sessions.js'
import { readLoopState, type StoredLoopState, writeLoopState } from './loopState.js'

const WAKE_PROMPT =
  "[SYSTEM: Autonomous Background Tick. Review your active objectives and execute necessary tools. If no action is required, reply strictly with '<idle>' and nothing else.]"
const IDLE_TOKEN = '<idle>'
const LOOP_OWNER_ID = 'daemon-loop'
const LOOP_INTERVAL_MS = 5 * 60 * 1000
const BACKOFF_AFTER_FAILURES = 3
const BACKOFF_MS = 30 * 60 * 1000

type TickResult =
  | {
      status: 'ok'
      sessionId: string
      idle: boolean
      assistantText: string | null
    }
  | {
      status: 'skipped'
      reason: 'paused' | 'backoff' | 'no_session' | 'busy'
      backoffUntil?: string | null
    }
  | {
      status: 'failed'
      sessionId: string | null
      error: string
      consecutiveFailures: number
      backoffUntil: string | null
    }

export type KairosTickOptions = {
  manual?: boolean
  sessionId?: string
  simulateMalformed?: boolean
}

function nowIso(): string {
  return new Date().toISOString()
}

function isoAfter(ms: number): string {
  return new Date(Date.now() + ms).toISOString()
}

function isBackoffActive(state: StoredLoopState): boolean {
  if (!state.backoffUntil) {
    return false
  }
  return new Date(state.backoffUntil).getTime() > Date.now()
}

function extractAssistantTextFromSdkMessage(message: unknown): string | null {
  if (!message || typeof message !== 'object') {
    return null
  }
  const typed = message as Record<string, unknown>
  if (typed.type !== 'assistant') {
    return null
  }
  const messageField = typed.message
  if (!messageField || typeof messageField !== 'object') {
    return null
  }
  const content = (messageField as Record<string, unknown>).content
  if (typeof content === 'string') {
    const trimmed = content.trim()
    return trimmed.length > 0 ? trimmed : null
  }
  if (!Array.isArray(content)) {
    return null
  }
  const text = content
    .filter(block => (block as { type?: string }).type === 'text')
    .map(block => ((block as { text?: string }).text ?? '').toString())
    .join('\n')
    .trim()
  return text.length > 0 ? text : null
}

function pruneInternalTickMessages(history: unknown[]): unknown[] {
  return history.filter(message => {
    const userText = getUserMessageText(message as any)
    if (userText?.trim() === WAKE_PROMPT) {
      return false
    }
    const assistantText = getAssistantMessageText(message as any)
    if (assistantText?.trim() === IDLE_TOKEN) {
      return false
    }
    return true
  })
}

function getLastAssistantText(history: unknown[]): string | null {
  for (let i = history.length - 1; i >= 0; i--) {
    const text = getAssistantMessageText(history[i] as any)
    if (text && text.trim().length > 0) {
      return text.trim()
    }
  }
  return null
}

export class KairosLoopController {
  private state: StoredLoopState = {
    status: 'running',
    lastTickAt: null,
    lastSuccessAt: null,
    consecutiveFailures: 0,
    backoffUntil: null,
    activeSessionId: null,
    lastError: null,
  }
  private tickTimer: Timer | null = null
  private inFlightTick: Promise<TickResult> | null = null

  async initialize(): Promise<void> {
    this.state = await readLoopState()
  }

  start(): void {
    if (this.tickTimer) {
      return
    }
    this.tickTimer = setInterval(() => {
      void this.tick({ manual: false })
    }, LOOP_INTERVAL_MS)
  }

  stop(): void {
    if (this.tickTimer) {
      clearInterval(this.tickTimer)
      this.tickTimer = null
    }
  }

  getStatus(): StoredLoopState {
    return { ...this.state }
  }

  async pause(): Promise<StoredLoopState> {
    this.state.status = 'paused'
    await writeLoopState(this.state)
    return this.getStatus()
  }

  async resume(): Promise<StoredLoopState> {
    this.state.status = 'running'
    this.state.backoffUntil = null
    this.state.lastError = null
    await writeLoopState(this.state)
    return this.getStatus()
  }

  async tick(options: KairosTickOptions = {}): Promise<TickResult> {
    if (this.inFlightTick) {
      return { status: 'skipped', reason: 'busy' }
    }
    this.inFlightTick = this.performTick(options)
    try {
      return await this.inFlightTick
    } finally {
      this.inFlightTick = null
    }
  }

  private async performTick(options: KairosTickOptions): Promise<TickResult> {
    this.state.lastTickAt = nowIso()

    if (this.state.status === 'paused' && !options.manual) {
      await writeLoopState(this.state)
      return { status: 'skipped', reason: 'paused' }
    }

    if (isBackoffActive(this.state) && !options.manual) {
      this.state.status = 'backoff'
      await writeLoopState(this.state)
      return {
        status: 'skipped',
        reason: 'backoff',
        backoffUntil: this.state.backoffUntil,
      }
    }

    if (!isBackoffActive(this.state) && this.state.status === 'backoff') {
      this.state.status = 'running'
      this.state.backoffUntil = null
    }

    const targetSession = await this.selectTargetSession(options.sessionId)
    if (!targetSession) {
      this.state.activeSessionId = null
      await writeLoopState(this.state)
      return { status: 'skipped', reason: 'no_session' }
    }

    this.state.activeSessionId = targetSession.id
    await writeLoopState(this.state)

    if (options.simulateMalformed) {
      return this.failTick(targetSession.id, 'Simulated malformed output')
    }

    try {
      const attached = await attachSession({
        sessionId: targetSession.id,
        ownerPid: process.pid,
        ownerClientId: LOOP_OWNER_ID,
        projectPath: targetSession.projectPath,
        transcriptPath: targetSession.transcriptPath,
      })

      const turn = await this.runNativeTurn(attached.session)
      if (turn.malformed) {
        return this.failTick(attached.session.id, turn.error)
      }

      this.state.consecutiveFailures = 0
      this.state.status = 'running'
      this.state.backoffUntil = null
      this.state.lastError = null
      this.state.lastSuccessAt = nowIso()
      await writeLoopState(this.state)

      return {
        status: 'ok',
        sessionId: attached.session.id,
        idle: turn.idle,
        assistantText: turn.assistantText,
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return this.failTick(targetSession.id, message)
    }
  }

  private async failTick(sessionId: string, error: string): Promise<TickResult> {
    this.state.lastError = error
    this.state.consecutiveFailures += 1
    this.state.status = 'running'
    if (this.state.consecutiveFailures >= BACKOFF_AFTER_FAILURES) {
      this.state.status = 'backoff'
      this.state.backoffUntil = isoAfter(BACKOFF_MS)
    }
    await writeLoopState(this.state)
    return {
      status: 'failed',
      sessionId,
      error,
      consecutiveFailures: this.state.consecutiveFailures,
      backoffUntil: this.state.backoffUntil,
    }
  }

  private async selectTargetSession(sessionId?: string): Promise<{
    id: string
    projectPath: string
    transcriptPath: string
  } | null> {
    if (sessionId) {
      const exact = await getSession(sessionId)
      if (!exact) {
        return null
      }
      return {
        id: exact.id,
        projectPath: exact.projectPath,
        transcriptPath: exact.transcriptPath,
      }
    }

    const sessions = await listSessions()
    const preferred = sessions.find(
      session =>
        session.ownerPid === null ||
        session.ownerPid === process.pid ||
        session.ownerClientId === LOOP_OWNER_ID,
    )
    if (!preferred) {
      return null
    }

    return {
      id: preferred.id,
      projectPath: preferred.projectPath,
      transcriptPath: preferred.transcriptPath,
    }
  }

  private async runNativeTurn(session: {
    id: string
    projectPath: string
    transcriptPath: string
    history: unknown[]
  }): Promise<{
    idle: boolean
    malformed: boolean
    assistantText: string | null
    error: string
  }> {
    setSessionSource('daemon')
    setIsInteractive(false)
    setSessionPersistenceDisabled(true)
    setKairosActive(true)
    setOriginalCwd(session.projectPath)
    setCwdState(session.projectPath)
    switchSession(session.id as any, null)

    const appStore = createStore<AppState>(getDefaultAppState())
    const getAppState = () => appStore.getState()
    const setAppState = (f: (prev: AppState) => AppState) => appStore.setState(f)

    const tools = getTools(getAppState().toolPermissionContext)
    const commands = await getCommands(session.projectPath)
    const readFileCache = createFileStateCacheWithSizeLimit(READ_FILE_STATE_CACHE_SIZE)
    const mutableMessages = Array.isArray(session.history) ? [...session.history] : []
    const initialLength = mutableMessages.length
    const abortController = new AbortController()
    let sawIdle = false
    let streamError: string | null = null

    const canUseTool: CanUseToolFn = async (
      tool,
      input,
      toolUseContext,
      assistantMessage,
      toolUseId,
      forceDecision,
    ) =>
      forceDecision ??
      (await hasPermissionsToUseTool(
        tool,
        input,
        toolUseContext,
        assistantMessage,
        toolUseId,
      ))

    try {
      for await (const message of ask({
        commands,
        prompt: WAKE_PROMPT,
        cwd: session.projectPath,
        tools,
        mcpClients: [],
        canUseTool,
        mutableMessages,
        getReadFileCache: () => readFileCache,
        setReadFileCache: () => {},
        getAppState,
        setAppState,
        abortController,
      })) {
        const assistantText = extractAssistantTextFromSdkMessage(message)
        if (assistantText?.trim() === IDLE_TOKEN) {
          sawIdle = true
          abortController.abort()
          break
        }
      }
    } catch (error) {
      if (!abortController.signal.aborted) {
        streamError = error instanceof Error ? error.message : String(error)
      }
    }

    const assistantText = getLastAssistantText(mutableMessages)
    const idle = sawIdle || assistantText === IDLE_TOKEN
    const persistedHistory = idle
      ? pruneInternalTickMessages(mutableMessages.slice(0, initialLength))
      : pruneInternalTickMessages(mutableMessages)

    await updateSessionHistory({
      sessionId: session.id,
      history: persistedHistory,
      ownerPid: process.pid,
      ownerClientId: LOOP_OWNER_ID,
      state: 'active',
    })

    if (streamError) {
      return {
        idle: false,
        malformed: true,
        assistantText: null,
        error: streamError,
      }
    }

    const newMessagesCount = mutableMessages.length - initialLength
    if (!idle && (newMessagesCount <= 0 || !assistantText)) {
      return {
        idle: false,
        malformed: true,
        assistantText: null,
        error: 'Malformed output: no assistant text was produced',
      }
    }

    return {
      idle,
      malformed: false,
      assistantText: idle ? null : assistantText,
      error: '',
    }
  }
}
