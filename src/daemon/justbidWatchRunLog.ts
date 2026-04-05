import { appendFile, mkdir } from 'fs/promises'
import { homedir } from 'os'
import { join } from 'path'

const KORA_HOME = process.env.KORA_HOME || join(homedir(), '.kora')
const JUSTBID_WATCH_RUN_LOG_PATH = join(KORA_HOME, 'justbid-watch-runs.jsonl')

export type JustBidRunStatus =
  | 'success'
  | 'failure'
  | 'disabled'
  | 'backoff_skip'
  | 'no_rules'

export type JustBidWatchRunLogEntry = {
  timestamp: string
  runStartedAt: string
  runFinishedAt: string
  durationMs: number
  status: JustBidRunStatus
  error: string | null
  pagesConfigured: number
  pagesScanned: number
  scannedCount: number
  unseenCount: number
  detailFetchCount: number
  matchedCount: number
  notifiedCount: number
  matchesByRule: Record<string, number>
  notificationsByRule: Record<string, number>
  skipReasonCounts: Record<string, number>
  page1TopItemIds: string[]
  page1Fingerprint: string | null
  page1Changed: boolean | null
  deepProbeRan: boolean
  deepProbeIntervalMs: number
  deepProbePagesToScan: number
  deepProbeBaselinePages: number
  deepProbePagesScanned: number
  deepProbeUnseenBeyondBaseline: number
  deepProbeUnseenIdsSample: string[]
}

async function ensureKoraHome(): Promise<void> {
  await mkdir(KORA_HOME, { recursive: true })
}

export function getJustBidWatchRunLogPath(): string {
  return JUSTBID_WATCH_RUN_LOG_PATH
}

export async function appendJustBidWatchRunLog(
  entry: JustBidWatchRunLogEntry,
): Promise<void> {
  await ensureKoraHome()
  await appendFile(JUSTBID_WATCH_RUN_LOG_PATH, `${JSON.stringify(entry)}\n`, 'utf8')
}
