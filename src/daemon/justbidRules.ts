import type { JustBidWatchRule } from './justbidWatchConfig.js'

export type JustBidItemDetails = {
  itemId: string
  url: string
  title: string
  condition: string | null
  location: string | null
  currentBid: number | null
  retail: number | null
}

export type CostParams = {
  buyerPremiumRate: number
  lotFee: number
  taxRate?: number
}

export type WatchMatchResult = {
  match: boolean
  allInCost: number | null
  reasons: string[]
}

function normalize(text: string | null | undefined): string {
  return (text ?? '').trim().toLowerCase()
}

function normalizeLocation(text: string | null | undefined): string {
  return normalize(text).replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim()
}

function roundToCents(value: number): number {
  return Math.round(value * 100) / 100
}

export function calculateAllInCost(
  currentBid: number | null,
  params: CostParams,
): number | null {
  if (typeof currentBid !== 'number' || !Number.isFinite(currentBid) || currentBid < 0) {
    return null
  }
  const subtotal = currentBid * (1 + params.buyerPremiumRate) + params.lotFee
  const taxRate = params.taxRate ?? 0
  const total = subtotal * (1 + taxRate)
  return roundToCents(total)
}

export function titleMightMatchRule(title: string, rule: JustBidWatchRule): boolean {
  const normalizedTitle = normalize(title)
  if (!normalizedTitle) {
    return true
  }
  const hasKeyword = rule.keywords.some(keyword => normalizedTitle.includes(normalize(keyword)))
  if (!hasKeyword) {
    return false
  }
  return !rule.excludeKeywords.some(keyword =>
    normalizedTitle.includes(normalize(keyword)),
  )
}

export function matchWatchlistRule(
  item: JustBidItemDetails,
  rule: JustBidWatchRule,
  params: CostParams,
): WatchMatchResult {
  const reasons: string[] = []
  const allInCost = calculateAllInCost(item.currentBid, params)

  if (!rule.enabled) {
    reasons.push('rule_disabled')
    return { match: false, allInCost, reasons }
  }

  if (!titleMightMatchRule(item.title, rule)) {
    reasons.push('keyword_mismatch')
    return { match: false, allInCost, reasons }
  }

  if (
    rule.requiredCondition.length > 0 &&
    !rule.requiredCondition.some(condition => normalize(condition) === normalize(item.condition))
  ) {
    reasons.push('condition_mismatch')
    return { match: false, allInCost, reasons }
  }

  if (rule.locations.length > 0) {
    const location = normalizeLocation(item.location)
    const locationMatches = rule.locations.some(expected => {
      const expectedLocation = normalizeLocation(expected)
      return (
        location.includes(expectedLocation) || expectedLocation.includes(location)
      )
    })
    if (!locationMatches) {
      reasons.push('location_mismatch')
      return { match: false, allInCost, reasons }
    }
  }

  if (
    rule.maxCurrentBid !== null &&
    (item.currentBid === null || item.currentBid > rule.maxCurrentBid)
  ) {
    reasons.push('max_current_bid_exceeded')
    return { match: false, allInCost, reasons }
  }

  if (rule.maxAllInCost !== null && (allInCost === null || allInCost > rule.maxAllInCost)) {
    reasons.push('max_all_in_cost_exceeded')
    return { match: false, allInCost, reasons }
  }

  if (rule.minRetail !== null && (item.retail === null || item.retail < rule.minRetail)) {
    reasons.push('min_retail_not_met')
    return { match: false, allInCost, reasons }
  }

  return { match: true, allInCost, reasons }
}
