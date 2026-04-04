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
import {
  getAssistantMessageText,
  getUserMessageText,
  hasSuccessfulToolCall,
} from 'src/utils/messages.js'
import { parseUserSpecifiedModel } from 'src/utils/model/model.js'
import {
  createFileStateCacheWithSizeLimit,
  READ_FILE_STATE_CACHE_SIZE,
} from 'src/utils/fileStateCache.js'
import { hasPermissionsToUseTool } from 'src/utils/permissions/permissions.js'
import {
  getSettings_DEPRECATED,
  getSettingsWithSources,
} from 'src/utils/settings/settings.js'
import { attachSession, getSession, listSessions, updateSessionHistory } from './sessions.js'
import { readLoopState, type StoredLoopState, writeLoopState } from './loopState.js'

const WAKE_PROMPT =
  "[SYSTEM: Autonomous Background Tick. Review your active objectives and execute necessary tools. If no action is required, reply strictly with '<idle>' and nothing else.]"
const MORNING_WEATHER_PROMPT = `[SYSTEM: Morning Weather Routine.
It is the scheduled 8:00 AM Pacific weather update.
1. Call WeatherScout with lat=38.5816, lon=-121.4944, timezone="America/Los_Angeles".
2. Write a concise Sacramento daily briefing with conditions, high/low, and rain chance.
3. Send the briefing to the user with PushNotification.
4. If the weather call fails, still send a short failure notice via PushNotification.
5. After PushNotification succeeds, respond strictly with '<idle>' and nothing else.]`
const IDLE_TOKEN = '<idle>'
const PUSH_NOTIFICATION_TOOL_NAME = 'PushNotification'
const PUSH_NOTIFICATION_TOOL_ALIAS = 'PushNotificationTool'
const TELEGRAM_PUSH_TOOL_ALIAS = 'TelegramPushTool'
const LOOP_OWNER_ID = 'daemon-loop'
const MORNING_WEATHER_TIMEZONE = 'America/Los_Angeles'
const MORNING_WEATHER_HOUR_PT = 8
const LOOP_INTERVAL_MS = 5 * 60 * 1000
const TELEGRAM_POLL_INTERVAL_MS = 15 * 1000
const BACKOFF_AFTER_FAILURES = 3
const BACKOFF_MS = 30 * 60 * 1000
const TELEGRAM_MESSAGE_MAX_PROMPT_CHARS = 4_000
const TELEGRAM_GET_UPDATES_LIMIT = 20
const TELEGRAM_MAX_SAFE_CHARS = 4_000

type TelegramUpdate = {
  update_id?: number
  message?: {
    text?: string
    date?: number
    from?: {
      is_bot?: boolean
      username?: string
      first_name?: string
    }
    chat?: {
      id?: string | number
      username?: string
    }
  }
}

type TelegramGetUpdatesResponse = {
  ok?: boolean
  result?: TelegramUpdate[]
  description?: string
}

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
  telegramMessage?: {
    text: string
    username?: string
  }
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

function pruneInternalTickMessages(
  history: unknown[],
  internalPrompt: string,
): unknown[] {
  return history.filter(message => {
    const userText = getUserMessageText(message as any)
    if (userText?.trim() === internalPrompt) {
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

function getPacificDateAndHour(now: Date): { dateKey: string; hour: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: MORNING_WEATHER_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now)
  const bag = new Map(parts.map(part => [part.type, part.value]))

  const year = bag.get('year')
  const month = bag.get('month')
  const day = bag.get('day')
  const hour = bag.get('hour')

  if (year && month && day && hour && /^\d{1,2}$/.test(hour)) {
    return {
      dateKey: `${year}-${month}-${day}`,
      hour: parseInt(hour, 10),
    }
  }

  return {
    dateKey: now.toISOString().slice(0, 10),
    hour: now.getHours(),
  }
}

function getRuntimeValue(name: 'TELEGRAM_BOT_TOKEN' | 'TELEGRAM_CHAT_ID'):
  | string
  | undefined {
  const fromEnv = process.env[name]?.trim()
  if (fromEnv) return fromEnv

  try {
    const envSettings = getSettings_DEPRECATED()?.env
    const value = envSettings?.[name]
    if (typeof value === 'string') {
      const trimmed = value.trim()
      if (trimmed) return trimmed
    }
  } catch {
    // Settings may not be initialized at startup.
  }

  return undefined
}

function getFreshConfiguredModel(): string | null {
  const envModel = process.env.ANTHROPIC_MODEL?.trim()
  if (envModel) {
    return envModel
  }

  try {
    const configuredModel = getSettingsWithSources().effective.model
    if (typeof configuredModel === 'string') {
      const trimmed = configuredModel.trim()
      if (trimmed.length > 0) {
        return trimmed
      }
    }
  } catch {
    // Settings refresh can fail during startup races; fall back to history/default.
  }

  return null
}

export function resolveDaemonTurnModelFromSources(input: {
  configuredModel: string | null
}): string | undefined {
  if (!input.configuredModel) {
    return undefined
  }
  return parseUserSpecifiedModel(input.configuredModel)
}

function resolveDaemonTurnModel(): string | undefined {
  return resolveDaemonTurnModelFromSources({
    configuredModel: getFreshConfiguredModel(),
  })
}

function truncateForPrompt(input: string): string {
  if (input.length <= TELEGRAM_MESSAGE_MAX_PROMPT_CHARS) {
    return input
  }
  return `${input.slice(0, TELEGRAM_MESSAGE_MAX_PROMPT_CHARS)}...[Truncated]`
}

function truncateForTelegram(input: string): string {
  if (input.length <= TELEGRAM_MAX_SAFE_CHARS) {
    return input
  }
  return `${input.slice(0, TELEGRAM_MAX_SAFE_CHARS)}...[Truncated]`
}

function stripTrailingIdleToken(input: string): string {
  return input.replace(/\s*<idle>\s*$/i, '').trim()
}

export function didPushNotificationSucceed(messages: unknown[]): boolean {
  return [PUSH_NOTIFICATION_TOOL_NAME, PUSH_NOTIFICATION_TOOL_ALIAS, TELEGRAM_PUSH_TOOL_ALIAS].some(
    toolName => hasSuccessfulToolCall(messages as any, toolName),
  )
}

function buildTelegramPrompt(input: {
  text: string
  username?: string
}): string {
  const sender = input.username ? `@${input.username}` : 'the user'
  const message = truncateForPrompt(input.text)
  return `[SYSTEM: Telegram inbound message.
Reply to ${sender} as Kora.
1. Read the Telegram message below.
2. Draft a concise, helpful response.
3. Send the response using PushNotification.
4. After PushNotification succeeds, respond strictly with '<idle>' and nothing else.

<telegram_message>
${message}
</telegram_message>]`
}

function isAllowedTelegramChat(
  allowedChatId: string,
  chat: { id?: string | number; username?: string } | undefined,
): boolean {
  if (!chat) return false
  const configured = allowedChatId.trim()
  if (!configured) return false
  if (configured.startsWith('@')) {
    const configuredUsername = configured.slice(1).toLowerCase()
    const actualUsername =
      typeof chat.username === 'string' ? chat.username.toLowerCase() : ''
    return configuredUsername.length > 0 && actualUsername === configuredUsername
  }
  const actualId = chat.id !== undefined ? String(chat.id) : ''
  return actualId === configured
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
    lastWeatherPingDatePt: null,
    telegramLastUpdateId: null,
  }
  private tickTimer: Timer | null = null
  private telegramPollTimer: Timer | null = null
  private inFlightTick: Promise<TickResult> | null = null
  private inFlightTelegramPoll: Promise<void> | null = null
  private readonly telegramListenerStartedAtMs = Date.now()

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
    this.telegramPollTimer = setInterval(() => {
      void this.pollTelegramAndRespond()
    }, TELEGRAM_POLL_INTERVAL_MS)
    void this.pollTelegramAndRespond()
  }

  stop(): void {
    if (this.tickTimer) {
      clearInterval(this.tickTimer)
      this.tickTimer = null
    }
    if (this.telegramPollTimer) {
      clearInterval(this.telegramPollTimer)
      this.telegramPollTimer = null
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

  async pollTelegramAndRespond(): Promise<void> {
    if (this.inFlightTelegramPoll) {
      return this.inFlightTelegramPoll
    }

    this.inFlightTelegramPoll = this.performTelegramPoll()
    try {
      await this.inFlightTelegramPoll
    } finally {
      this.inFlightTelegramPoll = null
    }
  }

  private async performTelegramPoll(): Promise<void> {
    const botToken = getRuntimeValue('TELEGRAM_BOT_TOKEN')
    const allowedChatId = getRuntimeValue('TELEGRAM_CHAT_ID')
    if (!botToken || !allowedChatId) {
      return
    }

    const url = new URL(`https://api.telegram.org/bot${botToken}/getUpdates`)
    const offset = this.state.telegramLastUpdateId
    if (typeof offset === 'number' && Number.isInteger(offset) && offset >= 0) {
      url.searchParams.set('offset', String(offset))
    }
    url.searchParams.set('limit', String(TELEGRAM_GET_UPDATES_LIMIT))
    url.searchParams.set('allowed_updates', '["message"]')

    let parsed: TelegramGetUpdatesResponse
    try {
      const response = await fetch(url.toString())
      if (!response.ok) {
        return
      }
      parsed = (await response.json()) as TelegramGetUpdatesResponse
    } catch {
      return
    }

    if (!parsed.ok || !Array.isArray(parsed.result) || parsed.result.length === 0) {
      return
    }

    const updates = parsed.result
      .filter(update => typeof update.update_id === 'number')
      .sort((a, b) => (a.update_id ?? 0) - (b.update_id ?? 0))
    if (updates.length === 0) {
      return
    }

    const isBootstrapPoll = this.state.telegramLastUpdateId === null
    let nextOffset =
      this.state.telegramLastUpdateId ??
      updates[0]?.update_id ??
      this.state.telegramLastUpdateId

    for (const update of updates) {
      const updateId = update.update_id
      if (typeof updateId !== 'number') {
        continue
      }

      const message = update.message
      const text = typeof message?.text === 'string' ? message.text.trim() : ''
      const isBot = message?.from?.is_bot === true
      const messageEpochMs =
        typeof message?.date === 'number' ? message.date * 1000 : null
      const isHistoricalBootstrapMessage =
        isBootstrapPoll &&
        (messageEpochMs === null ||
          messageEpochMs < this.telegramListenerStartedAtMs - 5_000)

      if (
        !text ||
        isBot ||
        !isAllowedTelegramChat(allowedChatId, message?.chat) ||
        isHistoricalBootstrapMessage
      ) {
        nextOffset = updateId + 1
        continue
      }

      if (this.inFlightTick) {
        break
      }

      const result = await this.tick({
        manual: true,
        telegramMessage: {
          text,
          username: message?.from?.username ?? message?.from?.first_name,
        },
      })
      if (result.status === 'skipped' && result.reason === 'busy') {
        break
      }
      if (result.status !== 'ok') {
        break
      }

      nextOffset = updateId + 1
    }

    if (
      typeof nextOffset === 'number' &&
      nextOffset !== this.state.telegramLastUpdateId
    ) {
      this.state.telegramLastUpdateId = nextOffset
      await writeLoopState(this.state)
    }
  }

  private async sendTelegramFallbackMessage(message: string): Promise<boolean> {
    const botToken = getRuntimeValue('TELEGRAM_BOT_TOKEN')
    const chatId = getRuntimeValue('TELEGRAM_CHAT_ID')
    if (!botToken || !chatId) {
      return false
    }

    const text = truncateForTelegram(message.trim())
    if (!text) {
      return false
    }

    try {
      const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text,
        }),
      })
      return response.ok
    } catch {
      return false
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

      const morningWeatherDateKey =
        options.telegramMessage === undefined
          ? this.getPendingMorningWeatherDateKey()
          : null
      const prompt = options.telegramMessage
        ? buildTelegramPrompt(options.telegramMessage)
        : morningWeatherDateKey
          ? MORNING_WEATHER_PROMPT
          : WAKE_PROMPT
      const turn = await this.runNativeTurn(attached.session, prompt)
      if (turn.malformed) {
        if (options.telegramMessage && turn.pushNotificationSucceeded) {
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
        }
        return this.failTick(attached.session.id, turn.error, {
          suppressBackoff: options.telegramMessage !== undefined,
        })
      }
      if (options.telegramMessage && !turn.pushNotificationSucceeded) {
        const fallbackText = stripTrailingIdleToken(
          turn.assistantText ??
            "I couldn't complete that request right now. Please try again.",
        )
        const fallbackDelivered =
          fallbackText.length > 0
            ? await this.sendTelegramFallbackMessage(fallbackText)
            : false
        if (fallbackDelivered) {
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
        }
        return this.failTick(
          attached.session.id,
          'Telegram reply turn completed without a successful PushNotification call or fallback delivery',
          { suppressBackoff: true },
        )
      }
      if (morningWeatherDateKey && turn.pushNotificationSucceeded) {
        this.state.lastWeatherPingDatePt = morningWeatherDateKey
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
      return this.failTick(targetSession.id, message, {
        suppressBackoff: options.telegramMessage !== undefined,
      })
    }
  }

  private getPendingMorningWeatherDateKey(): string | null {
    const { dateKey, hour } = getPacificDateAndHour(new Date())
    if (hour !== MORNING_WEATHER_HOUR_PT) {
      return null
    }
    if (this.state.lastWeatherPingDatePt === dateKey) {
      return null
    }
    return dateKey
  }

  private async failTick(
    sessionId: string,
    error: string,
    options: { suppressBackoff?: boolean } = {},
  ): Promise<TickResult> {
    this.state.lastError = error
    if (!options.suppressBackoff) {
      this.state.consecutiveFailures += 1
      this.state.status = 'running'
      if (this.state.consecutiveFailures >= BACKOFF_AFTER_FAILURES) {
        this.state.status = 'backoff'
        this.state.backoffUntil = isoAfter(BACKOFF_MS)
      }
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
  }, prompt: string): Promise<{
    idle: boolean
    malformed: boolean
    assistantText: string | null
    error: string
    pushNotificationSucceeded: boolean
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
    const daemonTurnModel = resolveDaemonTurnModel()
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
      (() => {
        let isReadOnly = false
        try {
          isReadOnly = tool.isReadOnly(input as any)
        } catch {
          isReadOnly = false
        }
        if (isReadOnly) {
          return Promise.resolve({
            behavior: 'allow' as const,
            updatedInput: input,
          })
        }
        return hasPermissionsToUseTool(
          tool,
          input,
          toolUseContext,
          assistantMessage,
          toolUseId,
        )
      })()

    try {
      for await (const message of ask({
        commands,
        prompt,
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
        userSpecifiedModel: daemonTurnModel,
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
    const pushNotificationSucceeded =
      didPushNotificationSucceed(mutableMessages as any)
    const persistedHistory = idle
      ? pruneInternalTickMessages(mutableMessages.slice(0, initialLength), prompt)
      : pruneInternalTickMessages(mutableMessages, prompt)

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
        pushNotificationSucceeded,
      }
    }

    const newMessagesCount = mutableMessages.length - initialLength
    if (!idle && (newMessagesCount <= 0 || !assistantText)) {
      return {
        idle: false,
        malformed: true,
        assistantText: null,
        error: 'Malformed output: no assistant text was produced',
        pushNotificationSucceeded,
      }
    }

    return {
      idle,
      malformed: false,
      assistantText: idle ? null : assistantText,
      error: '',
      pushNotificationSucceeded,
    }
  }
}
