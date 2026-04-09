import { describe, expect, test } from 'bun:test'
import type { JustBidWatchConfig, JustBidWatchRule } from './justbidWatchConfig.js'
import { __justbidWatcherTestUtils } from './justbidWatcher.js'

const baseRule = (overrides: Partial<JustBidWatchRule> = {}): JustBidWatchRule => ({
  id: 'r1',
  name: 'Rule 1',
  enabled: true,
  keywords: ['AirPods Max'],
  excludeKeywords: [],
  requiredCondition: [],
  maxCurrentBid: null,
  maxAllInCost: null,
  minRetail: null,
  ...overrides,
})

const baseConfig: JustBidWatchConfig = {
  enabled: true,
  baseUrl: 'https://www.justbid.com',
  listingPath: '/items?sort=newly_posted',
  pagesToScan: 5,
  searchEnabled: true,
  searchPagesToScan: 3,
  searchSort: 'newly_posted',
  warmStartPending: false,
  defaultLocations: [],
  deepProbeEnabled: true,
  deepProbeIntervalMs: 3_600_000,
  deepProbePagesToScan: 20,
  deepProbeBaselinePages: 5,
  pollIntervalMs: 300_000,
  jitterMs: 30_000,
  requestTimeoutMs: 10_000,
  buyerPremiumRate: 0.15,
  lotFee: 2,
  taxRate: 0,
  watchlists: [baseRule()],
}

describe('justbidWatcher search helpers', () => {
  test('buildSearchTerms dedupes and normalizes keywords', () => {
    const terms = __justbidWatcherTestUtils.buildSearchTerms([
      baseRule({ keywords: ['AirPods Max', ' airpods   max '] }),
      baseRule({ id: 'r2', keywords: ['Nuna MIXX', 'airpods max'] }),
    ])
    expect(terms).toEqual(['airpods max', 'nuna mixx'])
  })

  test('buildSearchPageUrl encodes term and includes paging', () => {
    const page1 = __justbidWatcherTestUtils.buildSearchPageUrl(baseConfig, 'airpods max', 1)
    const page2 = __justbidWatcherTestUtils.buildSearchPageUrl(baseConfig, 'airpods max', 2)
    expect(page1).toContain('/items?')
    expect(page1).toContain('search=airpods+max')
    expect(page1).toContain('sort=newly_posted')
    expect(page1).not.toContain('page=')
    expect(page2).toContain('page=2')
  })

  test('extractListingCandidates dedupes repeated anchors by item id', () => {
    const html = `
      <a href="/item/OLARR123/111">First title</a>
      <a href="/item/OLARR123/111">Duplicate title</a>
      <a href="/item/OLARR456/222">Second title</a>
    `
    const candidates = __justbidWatcherTestUtils.extractListingCandidates(html, baseConfig)
    expect(candidates.length).toBe(2)
    expect(candidates[0]?.itemId).toBe('111')
    expect(candidates[1]?.itemId).toBe('222')
  })
})
