import { mkdir, readFile, rename, writeFile } from 'fs/promises'
import { homedir } from 'os'
import { join } from 'path'

const KORA_HOME = process.env.KORA_HOME || join(homedir(), '.kora')
const LOOP_STATE_PATH = join(KORA_HOME, 'daemon-loop.json')

export type LoopStatus = 'running' | 'paused' | 'backoff'

export type StoredLoopState = {
  status: LoopStatus
  lastTickAt: string | null
  lastSuccessAt: string | null
  consecutiveFailures: number
  backoffUntil: string | null
  activeSessionId: string | null
  lastError: string | null
  lastWeatherPingDatePt: string | null
  telegramLastUpdateId: number | null
}

const DEFAULT_LOOP_STATE: StoredLoopState = {
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

function coerceIso(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null
  }
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return null
  }
  return date.toISOString()
}

function normalizeState(input: Partial<StoredLoopState>): StoredLoopState {
  return {
    status:
      input.status === 'paused' || input.status === 'backoff'
        ? input.status
        : 'running',
    lastTickAt: coerceIso(input.lastTickAt),
    lastSuccessAt: coerceIso(input.lastSuccessAt),
    consecutiveFailures:
      typeof input.consecutiveFailures === 'number' &&
      Number.isFinite(input.consecutiveFailures) &&
      input.consecutiveFailures >= 0
        ? Math.floor(input.consecutiveFailures)
        : 0,
    backoffUntil: coerceIso(input.backoffUntil),
    activeSessionId:
      typeof input.activeSessionId === 'string' ? input.activeSessionId : null,
    lastError: typeof input.lastError === 'string' ? input.lastError : null,
    lastWeatherPingDatePt:
      typeof input.lastWeatherPingDatePt === 'string'
        ? input.lastWeatherPingDatePt
        : null,
    telegramLastUpdateId:
      typeof input.telegramLastUpdateId === 'number' &&
      Number.isInteger(input.telegramLastUpdateId) &&
      input.telegramLastUpdateId >= 0
        ? input.telegramLastUpdateId
        : null,
  }
}

async function ensureKoraHome(): Promise<void> {
  await mkdir(KORA_HOME, { recursive: true })
}

export function getLoopStatePath(): string {
  return LOOP_STATE_PATH
}

export async function readLoopState(): Promise<StoredLoopState> {
  try {
    const content = await readFile(LOOP_STATE_PATH, 'utf8')
    const parsed = JSON.parse(content) as Partial<StoredLoopState>
    return normalizeState(parsed)
  } catch {
    return { ...DEFAULT_LOOP_STATE }
  }
}

export async function writeLoopState(state: StoredLoopState): Promise<void> {
  await ensureKoraHome()
  const tmpPath = `${LOOP_STATE_PATH}.tmp-${process.pid}-${Date.now()}`
  await writeFile(tmpPath, JSON.stringify(state, null, 2), 'utf8')
  await rename(tmpPath, LOOP_STATE_PATH)
}
