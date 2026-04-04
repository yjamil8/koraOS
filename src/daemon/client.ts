import { getDaemonBaseUrl } from './config.js'
import type { StoredLoopState } from './loopState.js'
import { isPidAlive, readDaemonState } from './state.js'
import type { DaemonSessionRecord, DaemonSessionSummary } from './types.js'

const DEFAULT_TIMEOUT_MS = 2_000

type DaemonHealthResponse = {
  status: string
  pid: number
  startedAt: string
  host: string
  port: number
}

async function requestJson<T>(
  path: string,
  init?: RequestInit,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<T> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(`${getDaemonBaseUrl()}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        'content-type': 'application/json',
        ...(init?.headers ?? {}),
      },
    })
    if (!response.ok) {
      const body = await response.text()
      throw new Error(`Daemon HTTP ${response.status}: ${body}`)
    }
    return (await response.json()) as T
  } finally {
    clearTimeout(timeout)
  }
}

export async function isDaemonReachable(): Promise<boolean> {
  const state = await readDaemonState()
  if (!state || !isPidAlive(state.pid)) {
    return false
  }
  try {
    const health = await requestJson<DaemonHealthResponse>('/health')
    return health.status === 'ok'
  } catch {
    return false
  }
}

export async function getDaemonHealth(): Promise<DaemonHealthResponse> {
  return requestJson<DaemonHealthResponse>('/health')
}

export async function listDaemonSessions(projectPath?: string): Promise<DaemonSessionSummary[]> {
  const query = projectPath
    ? `?projectPath=${encodeURIComponent(projectPath)}`
    : ''
  const response = await requestJson<{ sessions: DaemonSessionSummary[] }>(
    `/sessions${query}`,
  )
  return response.sessions
}

export async function getDaemonSession(
  sessionId: string,
): Promise<DaemonSessionRecord | null> {
  try {
    const response = await requestJson<{ session: DaemonSessionRecord }>(
      `/sessions/${encodeURIComponent(sessionId)}`,
    )
    return response.session
  } catch {
    return null
  }
}

export async function attachDaemonSession(input: {
  sessionId: string
  ownerPid: number
  ownerClientId: string
  projectPath?: string
  transcriptPath?: string
}): Promise<{ session: DaemonSessionRecord; stolenFromPid: number | null }> {
  return requestJson<{ session: DaemonSessionRecord; stolenFromPid: number | null }>(
    `/sessions/${encodeURIComponent(input.sessionId)}/attach`,
    {
      method: 'POST',
      body: JSON.stringify({
        ownerPid: input.ownerPid,
        ownerClientId: input.ownerClientId,
        projectPath: input.projectPath,
        transcriptPath: input.transcriptPath,
      }),
    },
  )
}

export async function closeDaemonSession(input: {
  sessionId: string
  ownerClientId?: string
}): Promise<DaemonSessionRecord | null> {
  try {
    const response = await requestJson<{ session: DaemonSessionRecord }>(
      `/sessions/${encodeURIComponent(input.sessionId)}/close`,
      {
        method: 'POST',
        body: JSON.stringify({
          ownerClientId: input.ownerClientId,
        }),
      },
    )
    return response.session
  } catch {
    return null
  }
}

export async function getDaemonLoopStatus(): Promise<StoredLoopState> {
  const response = await requestJson<{ loop: StoredLoopState }>(
    '/daemon/loop-status',
  )
  return response.loop
}

export async function tickDaemonLoop(input?: {
  sessionId?: string
  simulateMalformed?: boolean
}): Promise<{ result: unknown; loop: StoredLoopState }> {
  return requestJson<{ result: unknown; loop: StoredLoopState }>(
    '/daemon/loop-tick',
    {
      method: 'POST',
      body: JSON.stringify({
        sessionId: input?.sessionId,
        simulateMalformed: input?.simulateMalformed === true,
      }),
    },
    120_000,
  )
}

export async function pauseDaemonLoop(): Promise<StoredLoopState> {
  const response = await requestJson<{ loop: StoredLoopState }>(
    '/daemon/loop-pause',
    { method: 'POST', body: '{}' },
  )
  return response.loop
}

export async function resumeDaemonLoop(): Promise<StoredLoopState> {
  const response = await requestJson<{ loop: StoredLoopState }>(
    '/daemon/loop-resume',
    { method: 'POST', body: '{}' },
  )
  return response.loop
}
