import { describe, expect, test } from 'bun:test'
import {
  calculateAllInCost,
  matchWatchlistRule,
  type JustBidItemDetails,
} from './justbidRules.js'
import type { JustBidWatchRule } from './justbidWatchConfig.js'

describe('calculateAllInCost', () => {
  test('includes buyer premium and lot fee', () => {
    expect(
      calculateAllInCost(41.73, {
        buyerPremiumRate: 0.15,
        lotFee: 2,
      }),
    ).toBe(49.99)
  })
})

describe('matchWatchlistRule', () => {
  const baseRule: JustBidWatchRule = {
    id: 'airpods-max',
    name: 'AirPods Max',
    enabled: true,
    keywords: ['airpods max'],
    excludeKeywords: ['case'],
    requiredCondition: ['Appears New'],
    maxCurrentBid: null,
    maxAllInCost: 300,
    minRetail: null,
  }

  const baseItem: JustBidItemDetails = {
    itemId: '123',
    url: 'https://www.justbid.com/item/example/123',
    title: 'Apple AirPods Max Headphones',
    condition: 'Appears New',
    location: 'Sacramento',
    currentBid: 200,
    retail: 549,
  }

  test('matches when keyword + condition + all-in budget are satisfied', () => {
    const result = matchWatchlistRule(baseItem, baseRule, {
      buyerPremiumRate: 0.15,
      lotFee: 2,
      taxRate: 0,
      defaultLocations: [],
    })
    expect(result.match).toBe(true)
    expect(result.allInCost).toBe(232)
  })

  test('rejects when all-in budget is exceeded', () => {
    const result = matchWatchlistRule(
      {
        ...baseItem,
        currentBid: 280,
      },
      baseRule,
      {
        buyerPremiumRate: 0.15,
        lotFee: 2,
        defaultLocations: [],
      },
    )
    expect(result.match).toBe(false)
    expect(result.reasons).toContain('max_all_in_cost_exceeded')
  })

  test('accepts equivalent location formatting with punctuation/zip differences', () => {
    const result = matchWatchlistRule(
      {
        ...baseItem,
        location: '2975 Venture Dr, Lincoln, CA 95648',
      },
      baseRule,
      {
        buyerPremiumRate: 0.15,
        lotFee: 2,
        defaultLocations: ['2975 Venture Dr Lincoln, CA'],
      },
    )
    expect(result.match).toBe(true)
  })

  test('accepts location when parsed value is a shorter prefix', () => {
    const result = matchWatchlistRule(
      {
        ...baseItem,
        location: '320 Commerce Cir, Sacramento',
      },
      baseRule,
      {
        buyerPremiumRate: 0.15,
        lotFee: 2,
        defaultLocations: ['320 Commerce Cir Sacramento, CA'],
      },
    )
    expect(result.match).toBe(true)
  })

  test('rejects when item location does not match global default locations', () => {
    const result = matchWatchlistRule(
      {
        ...baseItem,
        location: 'Miami, FL',
      },
      baseRule,
      {
        buyerPremiumRate: 0.15,
        lotFee: 2,
        defaultLocations: ['320 Commerce Cir Sacramento, CA'],
      },
    )
    expect(result.match).toBe(false)
    expect(result.reasons).toContain('location_mismatch')
  })
})
