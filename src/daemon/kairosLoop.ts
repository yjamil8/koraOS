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
import { prefetchAllMcpResources } from 'src/services/mcp/client.js'
import { getClaudeCodeMcpConfigs } from 'src/services/mcp/config.js'
import { createStore } from 'src/state/store.js'
import { getDefaultAppState, type AppState } from 'src/state/AppStateStore.js'
import { type CanUseToolFn } from 'src/hooks/useCanUseTool.js'
import { assembleToolPool } from 'src/tools.js'
import {
  createAssistantMessage,
  createUserMessage,
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
import { isEnvTruthy } from 'src/utils/envUtils.js'
import { isFirstPartyAnthropicBaseUrl } from 'src/utils/model/providers.js'
import {
  getSettings_DEPRECATED,
  getSettingsWithSources,
} from 'src/utils/settings/settings.js'
import {
  renderResonancePolicyPrompt,
  resolveResonancePolicy,
} from 'src/utils/resonanceEngine.js'
import {
  attachSession,
  createSession,
  getSession,
  updateSessionHistory,
} from './sessions.js'
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
const DAEMON_TICK_MAX_TURNS = 4
const TELEGRAM_REPLY_MAX_TURNS = 6
const DAEMON_TICK_TIMEOUT_MS = 90_000
const TELEGRAM_REPLY_TIMEOUT_MS = 120_000
const MAX_ACTIVE_DAEMON_HISTORY_MESSAGES = 10_000
const TARGET_PERSISTED_DAEMON_HISTORY_MESSAGES = 2_000
const TARGET_PERSISTED_DAEMON_TAIL_MESSAGES = 1_000
const TELEGRAM_PROMPT_HISTORY_MESSAGES = 220
const AUTONOMOUS_PROMPT_HISTORY_MESSAGES = 140
const DAEMON_COMPACTION_SUMMARY_MARKER = '[DAEMON_COMPACTION_SUMMARY_V1]'
const COMPACTION_SUMMARY_MAX_ITEMS = 20
const COMPACTION_SUMMARY_MAX_CHARS = 2_000
const COMPACTION_ITEM_MAX_CHARS = 180

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

type DaemonChannelMode = 'telegram_reply' | 'autonomous_tick'
type DaemonHistoryPersistenceMode = 'drop_new_turn' | 'append_full_turn'

export function isHumanTelegramSender(
  message: TelegramUpdate['message'],
): boolean {
  return message?.from?.is_bot === false
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

export function shouldAdvanceTelegramOffsetAfterTick(
  result: TickResult,
): boolean {
  return !(result.status === 'skipped' && result.reason === 'busy')
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

export function computePersistedDaemonHistory(input: {
  history: unknown[]
  initialLength: number
  internalPrompt: string
}): unknown[] {
  const safeInitialLength = Math.max(0, Math.min(input.initialLength, input.history.length))
  return pruneInternalTickMessages(
    input.history.slice(0, safeInitialLength),
    input.internalPrompt,
  )
}

export function resolvePersistedHistoryForDaemonTurn(input: {
  mutableHistory: unknown[]
  initialLength: number
  internalPrompt: string
  persistenceMode: DaemonHistoryPersistenceMode
}): unknown[] {
  if (input.persistenceMode === 'append_full_turn') {
    return input.mutableHistory.filter(message => {
      const assistantText = getAssistantMessageText(message as any)
      return assistantText?.trim() !== IDLE_TOKEN
    })
  }
  return computePersistedDaemonHistory({
    history: input.mutableHistory,
    initialLength: input.initialLength,
    internalPrompt: input.internalPrompt,
  })
}

function truncateInline(input: string, maxChars: number): string {
  if (input.length <= maxChars) {
    return input
  }
  return `${input.slice(0, maxChars)}...[Truncated]`
}

function isDaemonCompactionSummaryMessage(message: unknown): boolean {
  const assistantText = getAssistantMessageText(message as any)
  return assistantText?.startsWith(DAEMON_COMPACTION_SUMMARY_MARKER) === true
}

function buildDaemonCompactionSummaryMessage(input: {
  droppedHistory: unknown[]
  retainedMessageCount: number
}): unknown {
  const snippets: string[] = []
  for (
    let i = input.droppedHistory.length - 1;
    i >= 0 && snippets.length < COMPACTION_SUMMARY_MAX_ITEMS;
    i--
  ) {
    const message = input.droppedHistory[i]
    if (isDaemonCompactionSummaryMessage(message)) {
      continue
    }
    const userText = getUserMessageText(message as any)?.trim()
    if (userText) {
      snippets.push(`User: ${truncateInline(userText, COMPACTION_ITEM_MAX_CHARS)}`)
      continue
    }
    const assistantText = getAssistantMessageText(message as any)?.trim()
    if (assistantText && assistantText !== IDLE_TOKEN) {
      snippets.push(
        `Kora: ${truncateInline(assistantText, COMPACTION_ITEM_MAX_CHARS)}`,
      )
    }
  }
  snippets.reverse()

  const header = `${DAEMON_COMPACTION_SUMMARY_MARKER}
Compacted ${input.droppedHistory.length} older messages.
Retained ${input.retainedMessageCount} recent messages below.`
  const body =
    snippets.length > 0
      ? `Recent compacted highlights:\n${snippets
          .map((line, index) => `${index + 1}. ${line}`)
          .join('\n')}`
      : 'Recent compacted highlights:\n1. No textual highlights available.'
  const text = truncateInline(
    `${header}\n${body}`,
    COMPACTION_SUMMARY_MAX_CHARS,
  )

  return {
    type: 'assistant',
    message: {
      content: [{ type: 'text', text }],
    },
  }
}

export function compactDaemonSessionHistory(input: {
  history: unknown[]
  maxMessages: number
  tailMessages: number
}): unknown[] {
  const baseHistory = input.history.filter(
    message => !isDaemonCompactionSummaryMessage(message),
  )
  const safeMax = Math.max(1, input.maxMessages)
  if (baseHistory.length <= safeMax) {
    return baseHistory
  }

  const safeTail = Math.max(1, Math.min(input.tailMessages, safeMax - 1))
  const splitIndex = Math.max(0, baseHistory.length - safeTail)
  const droppedHistory = baseHistory.slice(0, splitIndex)
  const retainedTail = baseHistory.slice(splitIndex)
  if (droppedHistory.length === 0) {
    return baseHistory.slice(-safeMax)
  }

  const summaryMessage = buildDaemonCompactionSummaryMessage({
    droppedHistory,
    retainedMessageCount: retainedTail.length,
  })
  return [summaryMessage, ...retainedTail]
}

export function selectDaemonPromptHistoryWindow(input: {
  history: unknown[]
  maxMessages: number
}): unknown[] {
  const safeMax = Math.max(1, input.maxMessages)
  if (input.history.length <= safeMax) {
    return [...input.history]
  }

  const tail = input.history.slice(-safeMax)
  const mostRecentSummary = [...input.history]
    .reverse()
    .find(message => isDaemonCompactionSummaryMessage(message))
  if (!mostRecentSummary || tail.includes(mostRecentSummary)) {
    return tail
  }

  return [mostRecentSummary, ...tail]
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

function buildTelegramFailureNotice(error: string): string {
  const summary = error.trim().replace(/\s+/g, ' ')
  return [
    'Kora daemon is running, but your request failed.',
    summary ? `Reason: ${summary}` : null,
    'Please retry in a moment.',
  ]
    .filter(Boolean)
    .join('\n')
}

export function didPushNotificationSucceed(messages: unknown[]): boolean {
  return [PUSH_NOTIFICATION_TOOL_NAME, PUSH_NOTIFICATION_TOOL_ALIAS, TELEGRAM_PUSH_TOOL_ALIAS].some(
    toolName => hasSuccessfulToolCall(messages as any, toolName),
  )
}

function extractPushNotificationMessageFromInput(input: unknown): string | null {
  const readMessageField = (candidate: Record<string, unknown>): string | null => {
    const message = candidate.message
    if (typeof message !== 'string') {
      return null
    }
    const trimmed = message.trim()
    return trimmed.length > 0 ? trimmed : null
  }

  if (input && typeof input === 'object' && !Array.isArray(input)) {
    return readMessageField(input as Record<string, unknown>)
  }

  if (typeof input === 'string') {
    try {
      const parsed = JSON.parse(input) as unknown
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return readMessageField(parsed as Record<string, unknown>)
      }
    } catch {
      // Ignore non-JSON string inputs.
    }
  }

  return null
}

export function getMostRecentSuccessfulPushNotificationText(
  messages: unknown[],
): string | null {
  const pushToolMessagesByUseId = new Map<string, string>()

  for (const message of messages) {
    if (!message || typeof message !== 'object') {
      continue
    }
    const typedMessage = message as Record<string, unknown>
    if (typedMessage.type !== 'assistant') {
      continue
    }
    const rawMessage = typedMessage.message
    if (!rawMessage || typeof rawMessage !== 'object') {
      continue
    }
    const content = (rawMessage as Record<string, unknown>).content
    if (!Array.isArray(content)) {
      continue
    }

    for (const block of content) {
      if (!block || typeof block !== 'object') {
        continue
      }
      const typedBlock = block as Record<string, unknown>
      if (
        typedBlock.type !== 'tool_use' ||
        typeof typedBlock.id !== 'string' ||
        !isPushNotificationToolName(
          typeof typedBlock.name === 'string' ? typedBlock.name : undefined,
        )
      ) {
        continue
      }
      const text = extractPushNotificationMessageFromInput(typedBlock.input)
      if (text) {
        pushToolMessagesByUseId.set(typedBlock.id, text)
      }
    }
  }

  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i]
    if (!message || typeof message !== 'object') {
      continue
    }
    const typedMessage = message as Record<string, unknown>
    if (typedMessage.type !== 'user') {
      continue
    }
    const rawMessage = typedMessage.message
    if (!rawMessage || typeof rawMessage !== 'object') {
      continue
    }
    const content = (rawMessage as Record<string, unknown>).content
    if (!Array.isArray(content)) {
      continue
    }

    for (let j = content.length - 1; j >= 0; j--) {
      const block = content[j]
      if (!block || typeof block !== 'object') {
        continue
      }
      const typedBlock = block as Record<string, unknown>
      if (typedBlock.type !== 'tool_result' || typedBlock.is_error === true) {
        continue
      }
      if (typeof typedBlock.tool_use_id !== 'string') {
        continue
      }
      const pushText = pushToolMessagesByUseId.get(typedBlock.tool_use_id)
      if (pushText) {
        return pushText
      }
    }
  }

  return null
}

function isTelegramUserMessageForUpdate(
  message: unknown,
  updateId: number,
): boolean {
  if (!message || typeof message !== 'object') {
    return false
  }
  const typedMessage = message as Record<string, unknown>
  if (typedMessage.type !== 'user') {
    return false
  }
  const origin = typedMessage.origin
  if (!origin || typeof origin !== 'object') {
    return false
  }
  const typedOrigin = origin as Record<string, unknown>
  return typedOrigin.kind === 'telegram' && typedOrigin.updateId === updateId
}

export function hasPersistedTelegramUpdate(
  history: unknown[],
  updateId: number,
): boolean {
  return history.some(message => isTelegramUserMessageForUpdate(message, updateId))
}

function isPushNotificationToolName(name: string | undefined): boolean {
  return (
    name === PUSH_NOTIFICATION_TOOL_NAME ||
    name === PUSH_NOTIFICATION_TOOL_ALIAS ||
    name === TELEGRAM_PUSH_TOOL_ALIAS
  )
}

export function shouldDenyPushToolUseInTelegramTurn(input: {
  stopAfterFirstPush: boolean
  pushToolAttempted: boolean
  toolName: string | undefined
}): boolean {
  return (
    input.stopAfterFirstPush &&
    input.pushToolAttempted &&
    isPushNotificationToolName(input.toolName)
  )
}

function buildTelegramTransportDirective(input: { username?: string }): string {
  const sender = input.username ? `@${input.username}` : 'the user'
  return `[SYSTEM: Telegram reply delivery contract.
You are replying to a live Telegram message from ${sender}.
Send your final user-facing reply using PushNotification.
After PushNotification succeeds, respond strictly with '<idle>' and nothing else.]`
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
  private mcpClients: Awaited<ReturnType<typeof prefetchAllMcpResources>>['clients'] =
    []
  private mcpTools: Awaited<ReturnType<typeof prefetchAllMcpResources>>['tools'] = []
  private mcpCommands: Awaited<ReturnType<typeof prefetchAllMcpResources>>['commands'] =
    []

  async initialize(): Promise<void> {
    this.state = await readLoopState()
    await this.loadMcpRuntime()
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
      const isHumanSender = isHumanTelegramSender(message)
      const messageEpochMs =
        typeof message?.date === 'number' ? message.date * 1000 : null
      const isHistoricalBootstrapMessage =
        isBootstrapPoll &&
        (messageEpochMs === null ||
          messageEpochMs < this.telegramListenerStartedAtMs - 5_000)

      if (
        !text ||
        !isHumanSender ||
        !isAllowedTelegramChat(allowedChatId, message?.chat) ||
        isHistoricalBootstrapMessage
      ) {
        nextOffset = updateId + 1
        continue
      }

      if (this.inFlightTick) {
        break
      }

      const targetSession = await this.selectTargetSession()
      if (!targetSession) {
        break
      }
      const persisted = await this.persistTelegramInboundMessage({
        sessionId: targetSession.id,
        updateId,
        text,
        username: message?.from?.username ?? message?.from?.first_name,
      })
      if (!persisted) {
        break
      }

      nextOffset = updateId + 1
      if (nextOffset !== this.state.telegramLastUpdateId) {
        this.state.telegramLastUpdateId = nextOffset
        await writeLoopState(this.state)
      }

      const result = await this.tick({
        manual: true,
        sessionId: targetSession.id,
        telegramMessage: {
          text,
          username: message?.from?.username ?? message?.from?.first_name,
        },
      })
      if (result.status === 'skipped' && result.reason === 'busy') {
        break
      }
    }

    if (
      typeof nextOffset === 'number' &&
      nextOffset !== this.state.telegramLastUpdateId
    ) {
      this.state.telegramLastUpdateId = nextOffset
      await writeLoopState(this.state)
    }
  }

  private async persistTelegramInboundMessage(input: {
    sessionId: string
    updateId: number
    text: string
    username?: string
  }): Promise<boolean> {
    const session = await getSession(input.sessionId)
    if (!session) {
      return false
    }
    const trimmedText = input.text.trim()
    if (!trimmedText) {
      return false
    }

    const currentHistory = Array.isArray(session.history) ? [...session.history] : []
    if (hasPersistedTelegramUpdate(currentHistory, input.updateId)) {
      return true
    }

    const nextHistory = compactDaemonSessionHistory({
      history: [
        ...currentHistory,
        createUserMessage({
          content: trimmedText,
          origin: {
            kind: 'telegram',
            updateId: input.updateId,
            username: input.username,
          },
        }),
      ],
      maxMessages: TARGET_PERSISTED_DAEMON_HISTORY_MESSAGES,
      tailMessages: TARGET_PERSISTED_DAEMON_TAIL_MESSAGES,
    })

    await updateSessionHistory({
      sessionId: session.id,
      history: nextHistory,
      ownerPid: process.pid,
      ownerClientId: LOOP_OWNER_ID,
      state: 'active',
    })
    return true
  }

  private async persistTelegramAssistantReply(
    sessionId: string,
    replyText: string,
  ): Promise<void> {
    const trimmed = stripTrailingIdleToken(replyText).trim()
    if (!trimmed) {
      return
    }

    const session = await getSession(sessionId)
    if (!session) {
      return
    }

    const currentHistory = Array.isArray(session.history) ? [...session.history] : []
    const nextHistory = compactDaemonSessionHistory({
      history: [...currentHistory, createAssistantMessage({ content: trimmed })],
      maxMessages: TARGET_PERSISTED_DAEMON_HISTORY_MESSAGES,
      tailMessages: TARGET_PERSISTED_DAEMON_TAIL_MESSAGES,
    })
    await updateSessionHistory({
      sessionId: session.id,
      history: nextHistory,
      ownerPid: process.pid,
      ownerClientId: LOOP_OWNER_ID,
      state: 'active',
    })
  }

  private async loadMcpRuntime(): Promise<void> {
    try {
      const { servers } = await getClaudeCodeMcpConfigs()
      const loaded = await prefetchAllMcpResources(servers)
      this.mcpClients = loaded.clients
      this.mcpTools = loaded.tools
      this.mcpCommands = loaded.commands
    } catch {
      this.mcpClients = []
      this.mcpTools = []
      this.mcpCommands = []
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

    let targetSession = await this.selectTargetSession(options.sessionId)
    if (!targetSession && options.telegramMessage) {
      const created = await createSession({
        projectPath: process.cwd(),
      })
      targetSession = {
        id: created.id,
        projectPath: created.projectPath,
        transcriptPath: created.transcriptPath,
      }
    }

    if (!targetSession) {
      this.state.activeSessionId = null
      await writeLoopState(this.state)
      return { status: 'skipped', reason: 'no_session' }
    }

    this.state.activeSessionId = targetSession.id
    await writeLoopState(this.state)

    if (options.simulateMalformed) {
      return this.failTick(targetSession.id, 'Simulated malformed output', {
        notifyTelegramOnFailure: options.telegramMessage !== undefined,
      })
    }

    try {
      const attached = await attachSession({
        sessionId: targetSession.id,
        ownerPid: process.pid,
        ownerClientId: LOOP_OWNER_ID,
        projectPath: targetSession.projectPath,
        transcriptPath: targetSession.transcriptPath,
        syncHistoryFromTranscript: options.telegramMessage === undefined,
      })

      const morningWeatherDateKey =
        options.telegramMessage === undefined
          ? this.getPendingMorningWeatherDateKey()
          : null
      const prompt = options.telegramMessage
        ? truncateForPrompt(options.telegramMessage.text)
        : morningWeatherDateKey
          ? MORNING_WEATHER_PROMPT
          : WAKE_PROMPT
      const turn = await this.runNativeTurn(attached.session, prompt, {
        channelMode:
          options.telegramMessage === undefined
            ? 'autonomous_tick'
            : 'telegram_reply',
        stopAfterFirstPush: options.telegramMessage !== undefined,
        telegramUsername: options.telegramMessage?.username,
      })
      if (turn.malformed) {
        if (options.telegramMessage && turn.pushNotificationSucceeded) {
          const pushedText = turn.pushNotificationText ?? turn.assistantText
          if (pushedText) {
            await this.persistTelegramAssistantReply(attached.session.id, pushedText)
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
        }
        return this.failTick(attached.session.id, turn.error, {
          suppressBackoff: options.telegramMessage !== undefined,
          notifyTelegramOnFailure: options.telegramMessage !== undefined,
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
          await this.persistTelegramAssistantReply(attached.session.id, fallbackText)
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
          { suppressBackoff: true, notifyTelegramOnFailure: true },
        )
      }
      if (morningWeatherDateKey && turn.pushNotificationSucceeded) {
        this.state.lastWeatherPingDatePt = morningWeatherDateKey
      }
      if (options.telegramMessage && turn.pushNotificationSucceeded) {
        const pushedText = turn.pushNotificationText ?? turn.assistantText
        if (pushedText) {
          await this.persistTelegramAssistantReply(attached.session.id, pushedText)
        }
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
        notifyTelegramOnFailure: options.telegramMessage !== undefined,
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
    options: {
      suppressBackoff?: boolean
      notifyTelegramOnFailure?: boolean
    } = {},
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
    if (options.notifyTelegramOnFailure) {
      const notice = buildTelegramFailureNotice(error)
      const delivered = await this.sendTelegramFallbackMessage(notice)
      if (delivered) {
        await this.persistTelegramAssistantReply(sessionId, notice)
      }
    }
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

    if (this.state.activeSessionId) {
      const active = await getSession(this.state.activeSessionId)
      if (active) {
        if (active.history.length > MAX_ACTIVE_DAEMON_HISTORY_MESSAGES) {
          const compacted = compactDaemonSessionHistory({
            history: active.history,
            maxMessages: TARGET_PERSISTED_DAEMON_HISTORY_MESSAGES,
            tailMessages: TARGET_PERSISTED_DAEMON_TAIL_MESSAGES,
          })
          if (compacted.length < active.history.length) {
            await updateSessionHistory({
              sessionId: active.id,
              history: compacted,
              ownerPid: process.pid,
              ownerClientId: LOOP_OWNER_ID,
              state: 'active',
            })
            active.history = compacted
          }
        }
        return {
          id: active.id,
          projectPath: active.projectPath,
          transcriptPath: active.transcriptPath,
        }
      }

      this.state.activeSessionId = null
      await writeLoopState(this.state)
    }

    const created = await createSession({
      projectPath: process.cwd(),
    })
    this.state.activeSessionId = created.id
    await writeLoopState(this.state)

    return {
      id: created.id,
      projectPath: created.projectPath,
      transcriptPath: created.transcriptPath,
    }
  }

  private async runNativeTurn(session: {
    id: string
    projectPath: string
    transcriptPath: string
    history: unknown[]
  }, prompt: string, options: {
    channelMode: DaemonChannelMode
    stopAfterFirstPush?: boolean
    telegramUsername?: string
  }): Promise<{
    idle: boolean
    malformed: boolean
    assistantText: string | null
    error: string
    pushNotificationSucceeded: boolean
    pushNotificationText: string | null
  }> {
    setSessionSource('daemon')
    setIsInteractive(false)
    setSessionPersistenceDisabled(true)
    setKairosActive(true)
    setOriginalCwd(session.projectPath)
    setCwdState(session.projectPath)
    switchSession(session.id as any, null)

    const defaultAppState = getDefaultAppState()
    const appStore = createStore<AppState>({
      ...defaultAppState,
      toolPermissionContext: {
        ...defaultAppState.toolPermissionContext,
        shouldAvoidPermissionPrompts: true,
      },
      mcp: {
        ...defaultAppState.mcp,
        clients: this.mcpClients,
        tools: this.mcpTools,
        commands: this.mcpCommands,
      },
    })
    const getAppState = () => appStore.getState()
    const setAppState = (f: (prev: AppState) => AppState) => appStore.setState(f)

    const fullToolPool = assembleToolPool(
      getAppState().toolPermissionContext,
      getAppState().mcp.tools,
    )
    const fullCommandPool = [
      ...(await getCommands(session.projectPath)),
      ...getAppState().mcp.commands,
    ]
    const isNonFirstPartyEndpoint = !isFirstPartyAnthropicBaseUrl(
      process.env.ANTHROPIC_BASE_URL ?? '',
    )
    const useToollessTelegramFallback =
      options.channelMode === 'telegram_reply' &&
      isNonFirstPartyEndpoint &&
      !isEnvTruthy(process.env.KORA_TELEGRAM_FORCE_TOOLS)
    const tools = useToollessTelegramFallback ? [] : fullToolPool
    const commands = useToollessTelegramFallback ? [] : fullCommandPool
    const mcpClients = getAppState().mcp.clients
    const readFileCache = createFileStateCacheWithSizeLimit(READ_FILE_STATE_CACHE_SIZE)
    const sourceHistory = Array.isArray(session.history) ? [...session.history] : []
    const compactedSourceHistory = compactDaemonSessionHistory({
      history: sourceHistory,
      maxMessages: TARGET_PERSISTED_DAEMON_HISTORY_MESSAGES,
      tailMessages: TARGET_PERSISTED_DAEMON_TAIL_MESSAGES,
    })
    const promptHistory = selectDaemonPromptHistoryWindow({
      history: compactedSourceHistory,
      maxMessages:
        options.channelMode === 'telegram_reply'
          ? TELEGRAM_PROMPT_HISTORY_MESSAGES
          : AUTONOMOUS_PROMPT_HISTORY_MESSAGES,
    })
    const mutableMessages = [...promptHistory]
    const daemonTurnModel = resolveDaemonTurnModel()
    const resonancePrompt = renderResonancePolicyPrompt(
      resolveResonancePolicy({
        channel: options.channelMode === 'telegram_reply' ? 'telegram' : 'daemon',
        turnMode: options.channelMode,
      }),
    )
    const transportPrompt =
      options.channelMode === 'telegram_reply'
        ? buildTelegramTransportDirective({
            username: options.telegramUsername,
          })
        : null
    const effectiveAppendPrompt = [resonancePrompt, transportPrompt]
      .filter(Boolean)
      .join('\n\n')
    const initialLength = mutableMessages.length
    const abortController = new AbortController()
    const maxTurns =
      options.channelMode === 'telegram_reply'
        ? TELEGRAM_REPLY_MAX_TURNS
        : DAEMON_TICK_MAX_TURNS
    const turnTimeoutMs =
      options.channelMode === 'telegram_reply'
        ? TELEGRAM_REPLY_TIMEOUT_MS
        : DAEMON_TICK_TIMEOUT_MS
    let timedOut = false
    const timeoutHandle = setTimeout(() => {
      timedOut = true
      abortController.abort()
    }, turnTimeoutMs)
    let sawIdle = false
    let streamError: string | null = null
    let pushToolAttempted = false

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
        if (
          shouldDenyPushToolUseInTelegramTurn({
            stopAfterFirstPush: options.stopAfterFirstPush === true,
            pushToolAttempted,
            toolName: tool.name,
          })
        ) {
          return Promise.resolve({
            behavior: 'deny' as const,
          })
        }
        if (options.stopAfterFirstPush && isPushNotificationToolName(tool.name)) {
          pushToolAttempted = true
        }

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
        mcpClients,
        canUseTool,
        mutableMessages,
        getReadFileCache: () => readFileCache,
        setReadFileCache: () => {},
        getAppState,
        setAppState,
        abortController,
        userSpecifiedModel: daemonTurnModel,
        appendSystemPrompt: effectiveAppendPrompt,
        maxTurns,
      })) {
        const assistantText = extractAssistantTextFromSdkMessage(message)
        if (assistantText?.trim() === IDLE_TOKEN) {
          sawIdle = true
          abortController.abort()
          break
        }
        if (
          options.stopAfterFirstPush &&
          didPushNotificationSucceed(mutableMessages as any)
        ) {
          abortController.abort()
          break
        }
      }
    } catch (error) {
      if (!abortController.signal.aborted || timedOut) {
        streamError = error instanceof Error ? error.message : String(error)
      }
    } finally {
      clearTimeout(timeoutHandle)
    }

    if (timedOut) {
      streamError = `Daemon turn timed out after ${Math.round(turnTimeoutMs / 1000)}s`
    }

    const assistantText = getLastAssistantText(mutableMessages)
    const idle = sawIdle || assistantText === IDLE_TOKEN
    const pushNotificationSucceeded =
      didPushNotificationSucceed(mutableMessages as any)
    const pushNotificationText = getMostRecentSuccessfulPushNotificationText(
      mutableMessages,
    )
    if (options.channelMode === 'autonomous_tick') {
      const persistedHistory = compactDaemonSessionHistory({
        history: compactedSourceHistory.filter(message => {
          const assistantText = getAssistantMessageText(message as any)
          return assistantText?.trim() !== IDLE_TOKEN
        }),
        maxMessages: TARGET_PERSISTED_DAEMON_HISTORY_MESSAGES,
        tailMessages: TARGET_PERSISTED_DAEMON_TAIL_MESSAGES,
      })

      await updateSessionHistory({
        sessionId: session.id,
        history: persistedHistory,
        ownerPid: process.pid,
        ownerClientId: LOOP_OWNER_ID,
        state: 'active',
      })
    }

    if (streamError) {
      return {
        idle: false,
        malformed: true,
        assistantText: null,
        error: streamError,
        pushNotificationSucceeded,
        pushNotificationText,
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
        pushNotificationText,
      }
    }

    return {
      idle,
      malformed: false,
      assistantText: idle ? null : assistantText,
      error: '',
      pushNotificationSucceeded,
      pushNotificationText,
    }
  }
}
