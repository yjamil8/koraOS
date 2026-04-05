import { mkdir, readFile, rename, writeFile } from 'fs/promises'
import { homedir } from 'os'
import { join } from 'path'

const KORA_HOME = process.env.KORA_HOME || join(homedir(), '.kora')
const JUSTBID_WATCH_CONFIG_PATH = join(KORA_HOME, 'justbid-watch.json')
const DEFAULT_ALLOWED_LOCATIONS = [
  '320 Commerce Cir Sacramento, CA',
  '8425 Belvedere Ave Suite 300 Sacramento, CA',
  '2975 Venture Dr Lincoln, CA',
  '2477 Mercantile Dr Rancho Cordova, CA',
]

export type JustBidWatchRule = {
  id: string
  name: string
  enabled: boolean
  keywords: string[]
  excludeKeywords: string[]
  requiredCondition: string[]
  locations: string[]
  maxCurrentBid: number | null
  maxAllInCost: number | null
  minRetail: number | null
  notifyOnce: boolean
}

export type JustBidWatchConfig = {
  enabled: boolean
  baseUrl: string
  listingPath: string
  pagesToScan: number
  deepProbeEnabled: boolean
  deepProbeIntervalMs: number
  deepProbePagesToScan: number
  deepProbeBaselinePages: number
  pollIntervalMs: number
  jitterMs: number
  requestTimeoutMs: number
  buyerPremiumRate: number
  lotFee: number
  taxRate: number
  watchlists: JustBidWatchRule[]
}

const DEFAULT_JUSTBID_WATCH_CONFIG: JustBidWatchConfig = {
  enabled: true,
  baseUrl: 'https://www.justbid.com',
  listingPath: '/items?sort=newly_posted',
  pagesToScan: 3,
  deepProbeEnabled: true,
  deepProbeIntervalMs: 60 * 60 * 1000,
  deepProbePagesToScan: 20,
  deepProbeBaselinePages: 5,
  pollIntervalMs: 5 * 60 * 1000,
  jitterMs: 30 * 1000,
  requestTimeoutMs: 10_000,
  buyerPremiumRate: 0.15,
  lotFee: 2,
  taxRate: 0,
  watchlists: [
    {
      id: 'airpods-max',
      name: 'AirPods Max',
      enabled: true,
      keywords: ['airpods max', 'air pods max'],
      excludeKeywords: ['case', 'cover', 'stand', 'replacement', 'ear pad', 'ear cushion'],
      requiredCondition: ['Appears New'],
      locations: DEFAULT_ALLOWED_LOCATIONS,
      maxCurrentBid: null,
      maxAllInCost: null,
      minRetail: null,
      notifyOnce: true,
    },
    {
      id: 'la-roche-posay-toleriane-double-repair-face-moisturizer',
      name: 'La Roche-Posay Toleriane Double Repair Face Moisturizer',
      enabled: true,
      keywords: [
        'la roche-posay toleriane double repair face moisturizer',
        'la roche-posay toleriane',
        'toleriane double repair',
      ],
      excludeKeywords: ['sample', 'travel size'],
      requiredCondition: ['Appears New'],
      locations: DEFAULT_ALLOWED_LOCATIONS,
      maxCurrentBid: null,
      maxAllInCost: null,
      minRetail: null,
      notifyOnce: true,
    },
  ],
}

function cloneDefaultConfig(): JustBidWatchConfig {
  return JSON.parse(JSON.stringify(DEFAULT_JUSTBID_WATCH_CONFIG)) as JustBidWatchConfig
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .map(item => (typeof item === 'string' ? item.trim() : ''))
    .filter(Boolean)
}

function coerceNullableNumber(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    return null
  }
  return value
}

function normalizeRule(input: unknown): JustBidWatchRule | null {
  if (!input || typeof input !== 'object') {
    return null
  }
  const typed = input as Record<string, unknown>
  const id = typeof typed.id === 'string' ? typed.id.trim() : ''
  const name = typeof typed.name === 'string' ? typed.name.trim() : ''
  const keywords = normalizeStringArray(typed.keywords)
  if (!id || !name || keywords.length === 0) {
    return null
  }

  return {
    id,
    name,
    enabled: typed.enabled !== false,
    keywords,
    excludeKeywords: normalizeStringArray(typed.excludeKeywords),
    requiredCondition: normalizeStringArray(typed.requiredCondition),
    locations: normalizeStringArray(typed.locations),
    maxCurrentBid: coerceNullableNumber(typed.maxCurrentBid),
    maxAllInCost: coerceNullableNumber(typed.maxAllInCost),
    minRetail: coerceNullableNumber(typed.minRetail),
    notifyOnce: typed.notifyOnce !== false,
  }
}

function normalizeConfig(input: unknown): JustBidWatchConfig {
  if (!input || typeof input !== 'object') {
    return cloneDefaultConfig()
  }
  const typed = input as Record<string, unknown>
  const watchlists = Array.isArray(typed.watchlists)
    ? typed.watchlists.map(normalizeRule).filter(Boolean)
    : []

  return {
    enabled: typed.enabled !== false,
    baseUrl:
      typeof typed.baseUrl === 'string' && typed.baseUrl.trim()
        ? typed.baseUrl.trim()
        : DEFAULT_JUSTBID_WATCH_CONFIG.baseUrl,
    listingPath:
      typeof typed.listingPath === 'string' && typed.listingPath.trim()
        ? typed.listingPath.trim()
        : DEFAULT_JUSTBID_WATCH_CONFIG.listingPath,
    pagesToScan:
      typeof typed.pagesToScan === 'number' &&
      Number.isInteger(typed.pagesToScan) &&
      typed.pagesToScan > 0
        ? typed.pagesToScan
        : DEFAULT_JUSTBID_WATCH_CONFIG.pagesToScan,
    deepProbeEnabled: typed.deepProbeEnabled !== false,
    deepProbeIntervalMs:
      typeof typed.deepProbeIntervalMs === 'number' &&
      Number.isFinite(typed.deepProbeIntervalMs) &&
      typed.deepProbeIntervalMs >= 60_000
        ? typed.deepProbeIntervalMs
        : DEFAULT_JUSTBID_WATCH_CONFIG.deepProbeIntervalMs,
    deepProbePagesToScan:
      typeof typed.deepProbePagesToScan === 'number' &&
      Number.isInteger(typed.deepProbePagesToScan) &&
      typed.deepProbePagesToScan >= 1
        ? typed.deepProbePagesToScan
        : DEFAULT_JUSTBID_WATCH_CONFIG.deepProbePagesToScan,
    deepProbeBaselinePages:
      typeof typed.deepProbeBaselinePages === 'number' &&
      Number.isInteger(typed.deepProbeBaselinePages) &&
      typed.deepProbeBaselinePages >= 1
        ? typed.deepProbeBaselinePages
        : DEFAULT_JUSTBID_WATCH_CONFIG.deepProbeBaselinePages,
    pollIntervalMs:
      typeof typed.pollIntervalMs === 'number' &&
      Number.isFinite(typed.pollIntervalMs) &&
      typed.pollIntervalMs >= 5_000
        ? typed.pollIntervalMs
        : DEFAULT_JUSTBID_WATCH_CONFIG.pollIntervalMs,
    jitterMs:
      typeof typed.jitterMs === 'number' &&
      Number.isFinite(typed.jitterMs) &&
      typed.jitterMs >= 0
        ? typed.jitterMs
        : DEFAULT_JUSTBID_WATCH_CONFIG.jitterMs,
    requestTimeoutMs:
      typeof typed.requestTimeoutMs === 'number' &&
      Number.isFinite(typed.requestTimeoutMs) &&
      typed.requestTimeoutMs >= 1_000
        ? typed.requestTimeoutMs
        : DEFAULT_JUSTBID_WATCH_CONFIG.requestTimeoutMs,
    buyerPremiumRate:
      typeof typed.buyerPremiumRate === 'number' &&
      Number.isFinite(typed.buyerPremiumRate) &&
      typed.buyerPremiumRate >= 0
        ? typed.buyerPremiumRate
        : DEFAULT_JUSTBID_WATCH_CONFIG.buyerPremiumRate,
    lotFee:
      typeof typed.lotFee === 'number' && Number.isFinite(typed.lotFee) && typed.lotFee >= 0
        ? typed.lotFee
        : DEFAULT_JUSTBID_WATCH_CONFIG.lotFee,
    taxRate:
      typeof typed.taxRate === 'number' && Number.isFinite(typed.taxRate) && typed.taxRate >= 0
        ? typed.taxRate
        : DEFAULT_JUSTBID_WATCH_CONFIG.taxRate,
    watchlists:
      watchlists.length > 0
        ? (watchlists as JustBidWatchRule[])
        : cloneDefaultConfig().watchlists,
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

export function getJustBidWatchConfigPath(): string {
  return JUSTBID_WATCH_CONFIG_PATH
}

export async function readJustBidWatchConfig(): Promise<JustBidWatchConfig> {
  try {
    const content = await readFile(JUSTBID_WATCH_CONFIG_PATH, 'utf8')
    const parsed = JSON.parse(content)
    return normalizeConfig(parsed)
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code === 'ENOENT') {
      await writeJsonAtomic(JUSTBID_WATCH_CONFIG_PATH, DEFAULT_JUSTBID_WATCH_CONFIG)
      return cloneDefaultConfig()
    }
    return cloneDefaultConfig()
  }
}

export async function writeJustBidWatchConfig(config: JustBidWatchConfig): Promise<void> {
  await writeJsonAtomic(JUSTBID_WATCH_CONFIG_PATH, config)
}
