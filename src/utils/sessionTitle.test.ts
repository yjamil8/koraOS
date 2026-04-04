import { afterEach, describe, expect, test } from 'bun:test'
import { generateSessionTitle } from './sessionTitle.js'

const ENV_KEYS = [
  'CLAUDE_CODE_USE_BEDROCK',
  'CLAUDE_CODE_USE_VERTEX',
  'CLAUDE_CODE_USE_FOUNDRY',
  'ANTHROPIC_BASE_URL',
  'USER_TYPE',
] as const

const originalEnv = new Map<string, string | undefined>()
for (const key of ENV_KEYS) {
  originalEnv.set(key, process.env[key])
}

afterEach(() => {
  for (const key of ENV_KEYS) {
    const value = originalEnv.get(key)
    if (value === undefined) {
      delete process.env[key]
    } else {
      process.env[key] = value
    }
  }
})

describe('generateSessionTitle fallback path', () => {
  test('uses local fallback title when provider is non-first-party', async () => {
    process.env.CLAUDE_CODE_USE_BEDROCK = '1'

    const title = await generateSessionTitle(
      '   Fix    login   button   ',
      new AbortController().signal,
    )

    expect(title).toBe('Fix login button')
  })

  test('uses local fallback title when ANTHROPIC_BASE_URL is non-first-party', async () => {
    process.env.ANTHROPIC_BASE_URL = 'http://localhost:1234/v1'

    const title = await generateSessionTitle(
      '/help    check model routing',
      new AbortController().signal,
    )

    expect(title).toBe('help check model routing')
  })

  test('truncates long fallback titles', async () => {
    process.env.CLAUDE_CODE_USE_BEDROCK = '1'

    const title = await generateSessionTitle(
      'Investigate and resolve inconsistent model routing and first turn latency across daemon and interactive sessions',
      new AbortController().signal,
    )

    expect(title?.endsWith('...')).toBe(true)
    expect(title!.length).toBeLessThanOrEqual(78)
  })

  test('returns null for empty description', async () => {
    process.env.CLAUDE_CODE_USE_BEDROCK = '1'

    const title = await generateSessionTitle('   ', new AbortController().signal)
    expect(title).toBeNull()
  })
})
