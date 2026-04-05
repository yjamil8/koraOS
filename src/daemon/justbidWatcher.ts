import { createHash } from 'crypto'
import { getSettings_DEPRECATED } from 'src/utils/settings/settings.js'
import {
  readJustBidWatchConfig,
  type JustBidWatchConfig,
  type JustBidWatchRule,
} from './justbidWatchConfig.js'
import {
  readJustBidWatchState,
  writeJustBidWatchState,
  type JustBidWatchState,
} from './justbidWatchState.js'
import {
  appendJustBidWatchRunLog,
  type JustBidRunStatus,
} from './justbidWatchRunLog.js'
import {
  calculateAllInCost,
  matchWatchlistRule,
  titleMightMatchRule,
  type JustBidItemDetails,
} from './justbidRules.js'

const DEFAULT_RETRY_BACKOFF_MS = 15 * 60 * 1000
const TELEGRAM_MAX_SAFE_CHARS = 4_000

type ListingCandidate = {
  itemId: string
  url: string
  title: string
}

type MutableRunMetrics = {
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
  deepProbePagesScanned: number
  deepProbeUnseenBeyondBaseline: number
  deepProbeUnseenIdsSample: string[]
}

function nowIso(): string {
  return new Date().toISOString()
}

function isoAfter(ms: number): string {
  return new Date(Date.now() + ms).toISOString()
}

function addCount(counter: Record<string, number>, key: string): void {
  counter[key] = (counter[key] ?? 0) + 1
}

function buildPage1Fingerprint(itemIds: string[]): string | null {
  if (itemIds.length === 0) {
    return null
  }
  return createHash('sha1').update(itemIds.join(',')).digest('hex')
}

function shouldRunDeepProbe(state: JustBidWatchState, config: JustBidWatchConfig): boolean {
  if (!config.deepProbeEnabled) {
    return false
  }
  if (!state.lastDeepProbeAt) {
    return true
  }
  const nextProbeAt =
    new Date(state.lastDeepProbeAt).getTime() + config.deepProbeIntervalMs
  return nextProbeAt <= Date.now()
}

function normalizeWhitespace(input: string): string {
  return input.replace(/\s+/g, ' ').trim()
}

function stripTags(input: string): string {
  return normalizeWhitespace(input.replace(/<[^>]*>/g, ' '))
}

function decodeHtmlEntities(input: string): string {
  return input
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&nbsp;/gi, ' ')
    .replace(/&#(\d+);/g, (_, num) => {
      const code = Number.parseInt(num, 10)
      return Number.isFinite(code) ? String.fromCharCode(code) : ''
    })
}

function parseMoney(input: string | null | undefined): number | null {
  if (!input) return null
  const cleaned = input.replace(/[^0-9.]/g, '')
  if (!cleaned) return null
  const parsed = Number.parseFloat(cleaned)
  return Number.isFinite(parsed) ? parsed : null
}

function formatMoney(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return 'n/a'
  return `$${value.toFixed(2)}`
}

function buildListingPageUrl(config: JustBidWatchConfig, page: number): string {
  const url = new URL(config.listingPath, config.baseUrl)
  if (!url.searchParams.get('sort')) {
    url.searchParams.set('sort', 'newly_posted')
  }
  if (page > 1) {
    url.searchParams.set('page', String(page))
  } else {
    url.searchParams.delete('page')
  }
  return url.toString()
}

function buildAbsoluteItemUrl(config: JustBidWatchConfig, href: string): string {
  return new URL(href, config.baseUrl).toString()
}

function extractListingCandidates(html: string, config: JustBidWatchConfig): ListingCandidate[] {
  const candidates: ListingCandidate[] = []
  const seenIds = new Set<string>()
  const anchorPattern =
    /<a[^>]+href=["'](?<href>\/item\/[^"'?#\s>]+\/(?<id>\d+))["'][^>]*>(?<body>[\s\S]*?)<\/a>/gi

  let match: RegExpExecArray | null = anchorPattern.exec(html)
  while (match) {
    const href = match.groups?.href
    const itemId = match.groups?.id
    if (href && itemId && !seenIds.has(itemId)) {
      const body = match.groups?.body ?? ''
      const title = decodeHtmlEntities(stripTags(body))
      candidates.push({
        itemId,
        url: buildAbsoluteItemUrl(config, href),
        title,
      })
      seenIds.add(itemId)
    }
    match = anchorPattern.exec(html)
  }

  return candidates
}

function extractLocation(text: string): string | null {
  const strictPickupMatch = text.match(
    /Pickup Details\s*([0-9A-Za-z .#'-]{2,120},\s*[A-Za-z][A-Za-z .'-]{2,60},\s*[A-Z]{2}(?:\s+\d{5})?)/i,
  )
  if (strictPickupMatch?.[1]) {
    return normalizeWhitespace(strictPickupMatch[1])
  }

  const relaxedPickupMatch = text.match(
    /Pickup Details\s*([0-9A-Za-z .#'-]{2,120},\s*[A-Za-z][A-Za-z .'-]{2,60})/i,
  )
  if (relaxedPickupMatch?.[1]) {
    return normalizeWhitespace(relaxedPickupMatch[1])
  }

  const genericMatch = text.match(
    /([A-Za-z0-9 .,'#-]{2,80},\s*(?:Sacramento|Rancho Cordova|Lincoln|Brookline|Kansas City))/i,
  )
  if (genericMatch?.[1]) {
    return normalizeWhitespace(genericMatch[1])
  }
  return null
}

function parseItemPage(html: string, url: string, itemId: string): JustBidItemDetails {
  const titleMatch = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i) ?? html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
  const title = decodeHtmlEntities(stripTags(titleMatch?.[1] ?? ''))

  const text = decodeHtmlEntities(stripTags(html))
  const conditionFromJson = html.match(/"customCondition"\s*:\s*"([^"]+)"/i)?.[1]
  const conditionFromText = text.match(/\bCondition\b\s*:\s*([A-Za-z0-9 /+-]{2,60})/i)?.[1]
  const currentBidMatch =
    text.match(/\bCurrent Bid\b\s*:?\s*\$?\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)/i) ??
    text.match(/\bCurrent\b\s*\$?\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)/i)
  const retailMatch =
    text.match(/\bRetail(?: Price)?\b\s*:?\s*\$?\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)/i) ??
    text.match(/\bMSRP\b\s*:?\s*\$?\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)/i)

  return {
    itemId,
    url,
    title,
    condition:
      conditionFromJson
        ? normalizeWhitespace(decodeHtmlEntities(conditionFromJson))
        : conditionFromText
          ? normalizeWhitespace(conditionFromText)
          : null,
    location: extractLocation(text),
    currentBid: parseMoney(currentBidMatch?.[1]),
    retail: parseMoney(retailMatch?.[1]),
  }
}

async function fetchText(url: string, timeoutMs: number): Promise<string> {
  let lastError: unknown = null
  for (let attempt = 0; attempt < 2; attempt++) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'user-agent': 'kora-justbid-watch/1.0',
        },
      })
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} for ${url}`)
      }
      return await response.text()
    } catch (error) {
      lastError = error
      if (attempt === 1) {
        throw error
      }
    } finally {
      clearTimeout(timeout)
    }
  }
  throw lastError instanceof Error ? lastError : new Error(`Request failed for ${url}`)
}

function getRuntimeValue(name: 'TELEGRAM_BOT_TOKEN' | 'TELEGRAM_CHAT_ID'): string | undefined {
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
    // Settings may not be initialized in startup races.
  }

  return undefined
}

function truncateForTelegram(input: string): string {
  if (input.length <= TELEGRAM_MAX_SAFE_CHARS) {
    return input
  }
  return `${input.slice(0, TELEGRAM_MAX_SAFE_CHARS)}...[Truncated]`
}

async function sendTelegramMessage(message: string): Promise<void> {
  const botToken = getRuntimeValue('TELEGRAM_BOT_TOKEN')
  const chatId = getRuntimeValue('TELEGRAM_CHAT_ID')
  if (!botToken || !chatId) {
    throw new Error('TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID is missing')
  }

  const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text: truncateForTelegram(message),
      disable_web_page_preview: true,
    }),
  })
  if (!response.ok) {
    const body = await response.text()
    throw new Error(`Telegram send failed (${response.status}): ${body}`)
  }
}

function activeRules(config: JustBidWatchConfig): JustBidWatchRule[] {
  return config.watchlists.filter(rule => rule.enabled)
}

function canMatchByTitle(title: string, rules: JustBidWatchRule[]): boolean {
  if (!title) return true
  return rules.some(rule => titleMightMatchRule(title, rule))
}

function isBackoffActive(state: JustBidWatchState): boolean {
  if (!state.backoffUntil) {
    return false
  }
  return new Date(state.backoffUntil).getTime() > Date.now()
}

function buildNotificationMessage(input: {
  rule: JustBidWatchRule
  item: JustBidItemDetails
  allInCost: number | null
}): string {
  return [
    `JustBid match: ${input.rule.name}`,
    `Title: ${input.item.title || '(untitled)'}`,
    `Condition: ${input.item.condition ?? 'n/a'}`,
    `Current bid: ${formatMoney(input.item.currentBid)}`,
    `Est. all-in (premium + lot fee): ${formatMoney(input.allInCost)}`,
    `Retail: ${formatMoney(input.item.retail)}`,
    `Location: ${input.item.location ?? 'n/a'}`,
    input.item.url,
  ].join('\n')
}

export class JustBidWatcherController {
  private config: JustBidWatchConfig | null = null
  private state: JustBidWatchState | null = null
  private timer: ReturnType<typeof setTimeout> | null = null
  private inFlight: Promise<void> | null = null
  private stopped = false

  async initialize(): Promise<void> {
    this.config = await readJustBidWatchConfig()
    this.state = await readJustBidWatchState()
  }

  start(): void {
    if (this.timer) {
      return
    }
    this.stopped = false
    this.scheduleNext(10_000)
  }

  stop(): void {
    this.stopped = true
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
  }

  private scheduleNext(baseMs: number): void {
    if (this.stopped || !this.config) {
      return
    }
    const jitter = Math.floor((Math.random() * 2 - 1) * this.config.jitterMs)
    const delayMs = Math.max(5_000, baseMs + jitter)
    this.timer = setTimeout(() => {
      this.timer = null
      void this.tick()
    }, delayMs)
  }

  async tick(): Promise<void> {
    if (this.inFlight) {
      return this.inFlight
    }
    this.inFlight = this.performTick()
    try {
      await this.inFlight
    } finally {
      this.inFlight = null
      if (this.config) {
        const base = this.state && isBackoffActive(this.state)
          ? DEFAULT_RETRY_BACKOFF_MS
          : this.config.pollIntervalMs
        this.scheduleNext(base)
      }
    }
  }

  private async appendRunLog(input: {
    status: JustBidRunStatus
    runStartedAt: string
    runFinishedAt: string
    error: string | null
    pagesConfigured: number
    metrics: MutableRunMetrics
  }): Promise<void> {
    const durationMs = Math.max(
      0,
      new Date(input.runFinishedAt).getTime() - new Date(input.runStartedAt).getTime(),
    )
    try {
      await appendJustBidWatchRunLog({
        timestamp: input.runFinishedAt,
        runStartedAt: input.runStartedAt,
        runFinishedAt: input.runFinishedAt,
        durationMs,
        status: input.status,
        error: input.error,
        pagesConfigured: input.pagesConfigured,
        pagesScanned: input.metrics.pagesScanned,
        scannedCount: input.metrics.scannedCount,
        unseenCount: input.metrics.unseenCount,
        detailFetchCount: input.metrics.detailFetchCount,
        matchedCount: input.metrics.matchedCount,
        notifiedCount: input.metrics.notifiedCount,
        matchesByRule: input.metrics.matchesByRule,
        notificationsByRule: input.metrics.notificationsByRule,
        skipReasonCounts: input.metrics.skipReasonCounts,
        page1TopItemIds: input.metrics.page1TopItemIds,
        page1Fingerprint: input.metrics.page1Fingerprint,
        page1Changed: input.metrics.page1Changed,
        deepProbeRan: input.metrics.deepProbeRan,
        deepProbeIntervalMs: this.config?.deepProbeIntervalMs ?? 0,
        deepProbePagesToScan: this.config?.deepProbePagesToScan ?? 0,
        deepProbeBaselinePages: this.config?.deepProbeBaselinePages ?? 0,
        deepProbePagesScanned: input.metrics.deepProbePagesScanned,
        deepProbeUnseenBeyondBaseline: input.metrics.deepProbeUnseenBeyondBaseline,
        deepProbeUnseenIdsSample: input.metrics.deepProbeUnseenIdsSample,
      })
    } catch {
      // Logging should never break watcher execution.
    }
  }

  private async runDeepProbe(input: {
    state: JustBidWatchState
    config: JustBidWatchConfig
    pendingSeen: Record<string, string>
    pageCandidatesByPage: Map<number, ListingCandidate[]>
    metrics: MutableRunMetrics
  }): Promise<void> {
    const baselinePages = Math.max(
      1,
      Math.min(input.config.deepProbeBaselinePages, input.config.deepProbePagesToScan),
    )
    const knownIds = new Set<string>([
      ...Object.keys(input.state.seen),
      ...Object.keys(input.pendingSeen),
    ])
    const unseenBeyond = new Set<string>()

    for (let page = 1; page <= input.config.deepProbePagesToScan; page++) {
      let candidates = input.pageCandidatesByPage.get(page)
      if (!candidates) {
        const listUrl = buildListingPageUrl(input.config, page)
        const html = await fetchText(listUrl, input.config.requestTimeoutMs)
        candidates = extractListingCandidates(html, input.config)
      }

      input.metrics.deepProbePagesScanned += 1
      if (page <= baselinePages) {
        for (const candidate of candidates) {
          knownIds.add(candidate.itemId)
        }
        continue
      }

      for (const candidate of candidates) {
        if (!knownIds.has(candidate.itemId)) {
          unseenBeyond.add(candidate.itemId)
          knownIds.add(candidate.itemId)
        }
      }
    }

    input.metrics.deepProbeRan = true
    input.metrics.deepProbeUnseenBeyondBaseline = unseenBeyond.size
    input.metrics.deepProbeUnseenIdsSample = Array.from(unseenBeyond).slice(0, 30)
    if (unseenBeyond.size > 0) {
      addCount(input.metrics.skipReasonCounts, 'deep_probe_unseen_beyond_baseline')
    }

    input.state.lastDeepProbeAt = nowIso()
    input.state.lastDeepProbePagesScanned = input.metrics.deepProbePagesScanned
    input.state.lastDeepProbeBaselinePages = baselinePages
    input.state.lastDeepProbeUnseenBeyondBaseline = unseenBeyond.size
  }

  private async performTick(): Promise<void> {
    this.config = await readJustBidWatchConfig()
    this.state = await readJustBidWatchState()
    const runStartedAt = nowIso()
    const pagesConfigured = this.config.pagesToScan
    const metrics: MutableRunMetrics = {
      pagesScanned: 0,
      scannedCount: 0,
      unseenCount: 0,
      detailFetchCount: 0,
      matchedCount: 0,
      notifiedCount: 0,
      matchesByRule: {},
      notificationsByRule: {},
      skipReasonCounts: {},
      page1TopItemIds: [],
      page1Fingerprint: null,
      page1Changed: null,
      deepProbeRan: false,
      deepProbePagesScanned: 0,
      deepProbeUnseenBeyondBaseline: 0,
      deepProbeUnseenIdsSample: [],
    }

    if (!this.config.enabled) {
      await this.appendRunLog({
        status: 'disabled',
        runStartedAt,
        runFinishedAt: nowIso(),
        error: null,
        pagesConfigured,
        metrics,
      })
      return
    }

    const state = this.state
    state.lastRunAt = runStartedAt

    if (isBackoffActive(state)) {
      await writeJustBidWatchState(state)
      await this.appendRunLog({
        status: 'backoff_skip',
        runStartedAt,
        runFinishedAt: nowIso(),
        error: null,
        pagesConfigured,
        metrics,
      })
      return
    }

    const rules = activeRules(this.config)
    if (rules.length === 0) {
      state.lastSuccessAt = state.lastRunAt
      state.lastError = null
      state.consecutiveFailures = 0
      state.backoffUntil = null
      await writeJustBidWatchState(state)
      await this.appendRunLog({
        status: 'no_rules',
        runStartedAt,
        runFinishedAt: nowIso(),
        error: null,
        pagesConfigured,
        metrics,
      })
      return
    }

    try {
      const pendingSeen: Record<string, string> = {}
      const observedIds = new Set<string>()
      const pageCandidatesByPage = new Map<number, ListingCandidate[]>()

      for (let page = 1; page <= this.config.pagesToScan; page++) {
        const listUrl = buildListingPageUrl(this.config, page)
        const html = await fetchText(listUrl, this.config.requestTimeoutMs)
        const candidates = extractListingCandidates(html, this.config)
        pageCandidatesByPage.set(page, candidates)
        metrics.pagesScanned += 1
        metrics.scannedCount += candidates.length
        if (page === 1) {
          metrics.page1TopItemIds = candidates.slice(0, 30).map(candidate => candidate.itemId)
          metrics.page1Fingerprint = buildPage1Fingerprint(metrics.page1TopItemIds)
          if (metrics.page1Fingerprint) {
            metrics.page1Changed =
              state.lastPage1Fingerprint === null
                ? true
                : state.lastPage1Fingerprint !== metrics.page1Fingerprint
            state.lastPage1Fingerprint = metrics.page1Fingerprint
            state.lastPage1TopItemIds = metrics.page1TopItemIds
            if (metrics.page1Changed) {
              state.lastPage1ChangedAt = nowIso()
            }
          }
        }

        for (const candidate of candidates) {
          if (observedIds.has(candidate.itemId)) {
            addCount(metrics.skipReasonCounts, 'duplicate_in_page_window')
            continue
          }
          observedIds.add(candidate.itemId)
          if (state.seen[candidate.itemId]) {
            addCount(metrics.skipReasonCounts, 'already_seen')
            continue
          }
          metrics.unseenCount += 1

          const seenAt = nowIso()
          if (!canMatchByTitle(candidate.title, rules)) {
            pendingSeen[candidate.itemId] = seenAt
            addCount(metrics.skipReasonCounts, 'title_prefilter_miss')
            continue
          }

          metrics.detailFetchCount += 1
          const detailHtml = await fetchText(candidate.url, this.config.requestTimeoutMs)
          const item = parseItemPage(detailHtml, candidate.url, candidate.itemId)
          if (!item.title && candidate.title) {
            item.title = candidate.title
          }

          for (const rule of rules) {
            const result = matchWatchlistRule(item, rule, {
              buyerPremiumRate: this.config.buyerPremiumRate,
              lotFee: this.config.lotFee,
              taxRate: this.config.taxRate,
            })
            if (!result.match) {
              addCount(
                metrics.skipReasonCounts,
                result.reasons[0] ? `rule_${result.reasons[0]}` : 'rule_mismatch',
              )
              continue
            }
            metrics.matchedCount += 1
            addCount(metrics.matchesByRule, rule.id)

            const notificationKey = `${rule.id}:${item.itemId}`
            if (rule.notifyOnce && state.notified[notificationKey]) {
              addCount(metrics.skipReasonCounts, 'already_notified')
              continue
            }

            await sendTelegramMessage(
              buildNotificationMessage({ rule, item, allInCost: result.allInCost }),
            )
            metrics.notifiedCount += 1
            addCount(metrics.notificationsByRule, rule.id)
            state.notified[notificationKey] = seenAt
          }

          // Keep all new items deduped after first scan, regardless of match outcome.
          pendingSeen[candidate.itemId] = seenAt
        }
      }

      if (shouldRunDeepProbe(state, this.config)) {
        try {
          await this.runDeepProbe({
            state,
            config: this.config,
            pendingSeen,
            pageCandidatesByPage,
            metrics,
          })
        } catch {
          addCount(metrics.skipReasonCounts, 'deep_probe_failed')
        }
      }

      state.seen = { ...state.seen, ...pendingSeen }
      state.lastScannedCount = metrics.scannedCount
      state.lastMatchedCount = metrics.matchedCount
      state.lastNotifiedCount = metrics.notifiedCount
      state.lastSuccessAt = nowIso()
      state.lastError = null
      state.consecutiveFailures = 0
      state.backoffUntil = null
      await writeJustBidWatchState(state)
      await this.appendRunLog({
        status: 'success',
        runStartedAt,
        runFinishedAt: nowIso(),
        error: null,
        pagesConfigured,
        metrics,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      state.lastError = message
      state.consecutiveFailures += 1
      state.lastScannedCount = metrics.scannedCount
      state.lastMatchedCount = metrics.matchedCount
      state.lastNotifiedCount = metrics.notifiedCount
      if (state.consecutiveFailures >= 3) {
        state.backoffUntil = isoAfter(DEFAULT_RETRY_BACKOFF_MS)
      }
      await writeJustBidWatchState(state)
      await this.appendRunLog({
        status: 'failure',
        runStartedAt,
        runFinishedAt: nowIso(),
        error: message,
        pagesConfigured,
        metrics,
      })
    }
  }
}
