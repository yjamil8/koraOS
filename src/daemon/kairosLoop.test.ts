import { describe, expect, test } from 'bun:test'
import { resolveDaemonTurnModelFromSources } from './kairosLoop.js'

describe('resolveDaemonTurnModelFromSources', () => {
  test('uses configured model when provided', () => {
    expect(
      resolveDaemonTurnModelFromSources({
        configuredModel: 'google/gemma-4-26b-a4b',
      }),
    ).toBe('google/gemma-4-26b-a4b')
  })

  test('returns undefined for default/unset model', () => {
    expect(
      resolveDaemonTurnModelFromSources({
        configuredModel: null,
      }),
    ).toBeUndefined()
  })
})
