import { describe, expect, test } from 'bun:test'
import {
  computePersistedDaemonHistory,
  didPushNotificationSucceed,
  isHumanTelegramSender,
  resolveDaemonTurnModelFromSources,
  resolvePersistedHistoryForDaemonTurn,
  shouldDenyPushToolUseInTelegramTurn,
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

describe('computePersistedDaemonHistory', () => {
  test('drops new daemon-turn messages and keeps prior history only', () => {
    const prompt = '[SYSTEM: Telegram inbound message.]'
    const history = [
      {
        type: 'user',
        message: { content: 'existing context' },
      },
      {
        type: 'user',
        message: { content: prompt },
      },
      {
        type: 'assistant',
        message: { content: [{ type: 'text', text: 'reply text' }] },
      },
    ]

    const persisted = computePersistedDaemonHistory({
      history,
      initialLength: 1,
      internalPrompt: prompt,
    })

    expect(persisted).toHaveLength(1)
    expect((persisted[0] as any).message.content).toBe('existing context')
  })
})

describe('resolvePersistedHistoryForDaemonTurn', () => {
  test('appends telegram turn messages to master history', () => {
    const mutableHistory = [
      { type: 'user', message: { content: 'keep me' } },
      { type: 'user', message: { content: 'what did you find today?' } },
      { type: 'assistant', message: { content: [{ type: 'text', text: 'I found 2 matches.' }] } },
    ]

    const persisted = resolvePersistedHistoryForDaemonTurn({
      mutableHistory,
      initialLength: 1,
      internalPrompt: 'what did you find today?',
      persistenceMode: 'append_full_turn',
    })

    expect(persisted).toHaveLength(3)
    expect((persisted[0] as any).message.content).toBe('keep me')
    expect((persisted[1] as any).message.content).toBe('what did you find today?')
  })
})

describe('shouldDenyPushToolUseInTelegramTurn', () => {
  test('denies second push tool use in telegram mode', () => {
    expect(
      shouldDenyPushToolUseInTelegramTurn({
        stopAfterFirstPush: true,
        pushToolAttempted: true,
        toolName: 'PushNotification',
      }),
    ).toBe(true)
  })

  test('allows first push and non-push tools', () => {
    expect(
      shouldDenyPushToolUseInTelegramTurn({
        stopAfterFirstPush: true,
        pushToolAttempted: false,
        toolName: 'PushNotification',
      }),
    ).toBe(false)
    expect(
      shouldDenyPushToolUseInTelegramTurn({
        stopAfterFirstPush: true,
        pushToolAttempted: true,
        toolName: 'Read',
      }),
    ).toBe(false)
  })
})
