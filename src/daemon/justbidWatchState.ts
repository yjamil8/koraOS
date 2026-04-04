import { mkdir, readFile, rename, writeFile } from 'fs/promises'
import { homedir } from 'os'
import { join } from 'path'

const KORA_HOME = process.env.KORA_HOME || join(homedir(), '.kora')
const JUSTBID_WATCH_STATE_PATH = join(KORA_HOME, 'justbid-watch-state.json')
const MAX_TRACKED_ITEMS = 20_000

export type JustBidWatchState = {
  lastRunAt: string | null
  lastSuccessAt: string | null
  lastError: string | null
  consecutiveFailures: number
  backoffUntil: string | null
  seen: Record<string, string>
  notified: Record<string, string>
  lastScannedCount: number
  lastMatchedCount: number
  lastNotifiedCount: number
}

const DEFAULT_WATCH_STATE: JustBidWatchState = {
  lastRunAt: null,
  lastSuccessAt: null,
  lastError: null,
  consecutiveFailures: 0,
  backoffUntil: null,
  seen: {},
  notified: {},
  lastScannedCount: 0,
  lastMatchedCount: 0,
  lastNotifiedCount: 0,
}

function cloneDefaultState(): JustBidWatchState {
  return {
    ...DEFAULT_WATCH_STATE,
    seen: {},
    notified: {},
  }
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

function normalizeStringMap(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object') {
    return {}
  }
  const map = value as Record<string, unknown>
  const entries = Object.entries(map)
    .filter(([key, timestamp]) => Boolean(key) && typeof timestamp === 'string')
    .sort((a, b) => Date.parse(b[1] as string) - Date.parse(a[1] as string))
    .slice(0, MAX_TRACKED_ITEMS)
  return Object.fromEntries(entries) as Record<string, string>
}

function normalizeState(input: unknown): JustBidWatchState {
  if (!input || typeof input !== 'object') {
    return cloneDefaultState()
  }
  const typed = input as Record<string, unknown>
  return {
    lastRunAt: coerceIso(typed.lastRunAt),
    lastSuccessAt: coerceIso(typed.lastSuccessAt),
    lastError: typeof typed.lastError === 'string' ? typed.lastError : null,
    consecutiveFailures:
      typeof typed.consecutiveFailures === 'number' &&
      Number.isFinite(typed.consecutiveFailures) &&
      typed.consecutiveFailures >= 0
        ? Math.floor(typed.consecutiveFailures)
        : 0,
    backoffUntil: coerceIso(typed.backoffUntil),
    seen: normalizeStringMap(typed.seen),
    notified: normalizeStringMap(typed.notified),
    lastScannedCount:
      typeof typed.lastScannedCount === 'number' &&
      Number.isFinite(typed.lastScannedCount) &&
      typed.lastScannedCount >= 0
        ? Math.floor(typed.lastScannedCount)
        : 0,
    lastMatchedCount:
      typeof typed.lastMatchedCount === 'number' &&
      Number.isFinite(typed.lastMatchedCount) &&
      typed.lastMatchedCount >= 0
        ? Math.floor(typed.lastMatchedCount)
        : 0,
    lastNotifiedCount:
      typeof typed.lastNotifiedCount === 'number' &&
      Number.isFinite(typed.lastNotifiedCount) &&
      typed.lastNotifiedCount >= 0
        ? Math.floor(typed.lastNotifiedCount)
        : 0,
  }
}

async function ensureKoraHome(): Promise<void> {
  await mkdir(KORA_HOME, { recursive: true })
}

async function writeJsonAtomic(path: string, data: unknown): Promise<void> {
  await ensureKoraHome()
  const tmpPath = `${path}.tmp-${process.pid}-${Date.now()}`
  await writeFile(tmpPath, JSON.stringify(data, null, 2), 'utf8')
  await rename(tmpPath, path)
}

export function getJustBidWatchStatePath(): string {
  return JUSTBID_WATCH_STATE_PATH
}

export function trimStateMaps(
  state: JustBidWatchState,
  maxItems: number = MAX_TRACKED_ITEMS,
): JustBidWatchState {
  const trimMap = (map: Record<string, string>): Record<string, string> =>
    Object.fromEntries(
      Object.entries(map)
        .sort((a, b) => Date.parse(b[1]) - Date.parse(a[1]))
        .slice(0, maxItems),
    )

  return {
    ...state,
    seen: trimMap(state.seen),
    notified: trimMap(state.notified),
  }
}

export async function readJustBidWatchState(): Promise<JustBidWatchState> {
  try {
    const content = await readFile(JUSTBID_WATCH_STATE_PATH, 'utf8')
    const parsed = JSON.parse(content)
    return normalizeState(parsed)
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code === 'ENOENT') {
      await writeJsonAtomic(JUSTBID_WATCH_STATE_PATH, DEFAULT_WATCH_STATE)
    }
    return cloneDefaultState()
  }
}

export async function writeJustBidWatchState(state: JustBidWatchState): Promise<void> {
  await writeJsonAtomic(JUSTBID_WATCH_STATE_PATH, trimStateMaps(state))
}
