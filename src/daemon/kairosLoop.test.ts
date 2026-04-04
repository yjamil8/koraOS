import { describe, expect, test } from 'bun:test'
import {
  didPushNotificationSucceed,
  isHumanTelegramSender,
  resolveDaemonTurnModelFromSources,
  shouldAdvanceTelegramOffsetAfterTick,
} from './kairosLoop.js'

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

describe('didPushNotificationSucceed', () => {
  test('accepts canonical PushNotification tool name', () => {
    const messages = [
      {
        type: 'assistant',
        message: {
          content: [{ type: 'tool_use', id: 'tool-1', name: 'PushNotification' }],
        },
      },
      {
        type: 'user',
        message: {
          content: [{ type: 'tool_result', tool_use_id: 'tool-1', content: 'ok' }],
        },
      },
    ]
    expect(didPushNotificationSucceed(messages)).toBe(true)
  })

  test('accepts PushNotificationTool alias', () => {
    const messages = [
      {
        type: 'assistant',
        message: {
          content: [
            { type: 'tool_use', id: 'tool-2', name: 'PushNotificationTool' },
          ],
        },
      },
      {
        type: 'user',
        message: {
          content: [{ type: 'tool_result', tool_use_id: 'tool-2', content: 'ok' }],
        },
      },
    ]
    expect(didPushNotificationSucceed(messages)).toBe(true)
  })

  test('returns false when tool result is an error', () => {
    const messages = [
      {
        type: 'assistant',
        message: {
          content: [{ type: 'tool_use', id: 'tool-3', name: 'PushNotification' }],
        },
      },
      {
        type: 'user',
        message: {
          content: [
            { type: 'tool_result', tool_use_id: 'tool-3', is_error: true, content: 'failed' },
          ],
        },
      },
    ]
    expect(didPushNotificationSucceed(messages)).toBe(false)
  })
})

describe('isHumanTelegramSender', () => {
  test('returns true only for explicit non-bot senders', () => {
    expect(isHumanTelegramSender({ from: { is_bot: false } })).toBe(true)
    expect(isHumanTelegramSender({ from: { is_bot: true } })).toBe(false)
    expect(isHumanTelegramSender(undefined)).toBe(false)
    expect(isHumanTelegramSender({})).toBe(false)
  })
})

describe('shouldAdvanceTelegramOffsetAfterTick', () => {
  test('does not advance only for busy skip', () => {
    expect(
      shouldAdvanceTelegramOffsetAfterTick({
        status: 'skipped',
        reason: 'busy',
      }),
    ).toBe(false)
  })

  test('advances for ok and failed outcomes', () => {
    expect(
      shouldAdvanceTelegramOffsetAfterTick({
        status: 'ok',
        sessionId: 's',
        idle: false,
        assistantText: 'hi',
      }),
    ).toBe(true)

    expect(
      shouldAdvanceTelegramOffsetAfterTick({
        status: 'failed',
        sessionId: 's',
        error: 'x',
        consecutiveFailures: 1,
        backoffUntil: null,
      }),
    ).toBe(true)
  })
})
