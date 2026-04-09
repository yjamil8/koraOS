import { describe, expect, test } from 'bun:test'
import { normalizeJustBidWatchConfig } from './justbidWatchConfig.js'

describe('normalizeJustBidWatchConfig', () => {
  test('keeps an explicit empty watchlist array', () => {
    const normalized = normalizeJustBidWatchConfig({ watchlists: [] })
    expect(normalized.watchlists).toEqual([])
  })

  test('falls back to default watchlists when watchlists is missing', () => {
    const normalized = normalizeJustBidWatchConfig({})
    expect(normalized.watchlists.length).toBeGreaterThan(0)
  })

  test('keeps explicit empty defaultLocations array', () => {
    const normalized = normalizeJustBidWatchConfig({ defaultLocations: [] })
    expect(normalized.defaultLocations).toEqual([])
  })

  test('migrates legacy per-rule locations to defaultLocations when missing', () => {
    const normalized = normalizeJustBidWatchConfig({
      watchlists: [
        {
          id: 'r1',
          name: 'Rule 1',
          keywords: ['foo'],
          locations: ['320 Commerce Cir Sacramento, CA', '2975 Venture Dr Lincoln, CA'],
        },
        {
          id: 'r2',
          name: 'Rule 2',
          keywords: ['bar'],
          locations: ['2975 Venture Dr Lincoln, CA'],
        },
      ],
    })
    expect(normalized.defaultLocations).toEqual([
      '320 Commerce Cir Sacramento, CA',
      '2975 Venture Dr Lincoln, CA',
    ])
    expect(normalized.watchlists[0]).not.toHaveProperty('locations')
  })
})
