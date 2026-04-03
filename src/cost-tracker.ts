import {
  addToTotalCostState,
  addToTotalLinesChanged as addToTotalLinesChangedState,
  getModelUsage as getModelUsageState,
  getSessionId,
  getTotalAPIDuration as getTotalAPIDurationState,
  getTotalCostUSD,
  getTotalDuration as getTotalDurationState,
  getTotalInputTokens as getTotalInputTokensState,
  getTotalLinesAdded as getTotalLinesAddedState,
  getTotalLinesRemoved as getTotalLinesRemovedState,
  getTotalOutputTokens as getTotalOutputTokensState,
  resetCostState as resetCostStateInBootstrap,
  setCostStateForRestore,
} from './bootstrap/state.js'

type UsageLike = {
  input_tokens?: number
  output_tokens?: number
  cache_read_input_tokens?: number
  cache_creation_input_tokens?: number
  server_tool_use?: {
    web_search_requests?: number
  }
}

type ModelUsage = {
  inputTokens: number
  outputTokens: number
  cacheReadInputTokens: number
  cacheCreationInputTokens: number
  webSearchRequests: number
}

type StoredSessionCostState = {
  totalCostUSD: number
  totalAPIDuration: number
  totalAPIDurationWithoutRetries: number
  totalToolDuration: number
  totalLinesAdded: number
  totalLinesRemoved: number
  lastDuration: number | undefined
  modelUsage: Record<string, ModelUsage> | undefined
}

const storedSessionCosts = new Map<string, StoredSessionCostState>()

function usageToModelUsage(usage: UsageLike | undefined): ModelUsage {
  return {
    inputTokens: usage?.input_tokens ?? 0,
    outputTokens: usage?.output_tokens ?? 0,
    cacheReadInputTokens: usage?.cache_read_input_tokens ?? 0,
    cacheCreationInputTokens: usage?.cache_creation_input_tokens ?? 0,
    webSearchRequests: usage?.server_tool_use?.web_search_requests ?? 0,
  }
}

function addModelUsage(a: ModelUsage, b: ModelUsage): ModelUsage {
  return {
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    cacheReadInputTokens: a.cacheReadInputTokens + b.cacheReadInputTokens,
    cacheCreationInputTokens:
      a.cacheCreationInputTokens + b.cacheCreationInputTokens,
    webSearchRequests: a.webSearchRequests + b.webSearchRequests,
  }
}

export function addToTotalSessionCost(
  costUSD: number,
  usage: UsageLike,
  model: string,
): number {
  const currentUsage =
    (getModelUsageState()[model] as ModelUsage | undefined) ??
    usageToModelUsage(undefined)
  const nextUsage = addModelUsage(currentUsage, usageToModelUsage(usage))
  addToTotalCostState(costUSD, nextUsage, model)
  return costUSD
}

export function addToTotalLinesChanged(added: number, removed: number): void {
  addToTotalLinesChangedState(added, removed)
}

export function getTotalCost(): number {
  return getTotalCostUSD()
}

export function getTotalAPIDuration(): number {
  return getTotalAPIDurationState()
}

export function getTotalDuration(): number {
  return getTotalDurationState()
}

export function getTotalLinesAdded(): number {
  return getTotalLinesAddedState()
}

export function getTotalLinesRemoved(): number {
  return getTotalLinesRemovedState()
}

export function getTotalInputTokens(): number {
  return getTotalInputTokensState()
}

export function getTotalOutputTokens(): number {
  return getTotalOutputTokensState()
}

export function getModelUsage(): Record<string, ModelUsage> {
  return getModelUsageState() as Record<string, ModelUsage>
}

export function formatCost(value: number, precision = 2): string {
  return `$${value.toFixed(precision)}`
}

export function formatTotalCost(): string {
  return `Total cost: ${formatCost(getTotalCost())}`
}

export function resetCostState(): void {
  resetCostStateInBootstrap()
}

export function saveCurrentSessionCosts(_fpsMetrics?: unknown): void {
  const sessionId = getSessionId()
  if (!sessionId) return

  const snapshot: StoredSessionCostState = {
    totalCostUSD: getTotalCostUSD(),
    totalAPIDuration: getTotalAPIDurationState(),
    totalAPIDurationWithoutRetries: getTotalAPIDurationState(),
    totalToolDuration: 0,
    totalLinesAdded: getTotalLinesAddedState(),
    totalLinesRemoved: getTotalLinesRemovedState(),
    lastDuration: getTotalDurationState(),
    modelUsage: getModelUsageState() as Record<string, ModelUsage>,
  }
  storedSessionCosts.set(sessionId, snapshot)
}

export function getStoredSessionCosts(
  sessionId: string,
): StoredSessionCostState | undefined {
  return storedSessionCosts.get(sessionId)
}

export function restoreCostStateForSession(sessionId: string): void {
  const stored = storedSessionCosts.get(sessionId)
  if (!stored) return
  setCostStateForRestore(stored)
}
