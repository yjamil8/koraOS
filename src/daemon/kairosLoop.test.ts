import { describe, expect, test } from 'bun:test'
import {
  canonicalizeDaemonConversationHistory,
  compactDaemonSessionHistory,
  computePersistedDaemonHistory,
  didPushNotificationSucceed,
  getMostRecentSuccessfulPushNotificationText,
  hasPersistedTelegramUpdate,
  isHumanTelegramSender,
  resolveDaemonTurnModelFromSources,
  resolvePersistedHistoryForDaemonTurn,
  selectDaemonPromptHistoryWindow,
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

describe('getMostRecentSuccessfulPushNotificationText', () => {
  test('returns message payload from latest successful push tool call', () => {
    const messages = [
      {
        type: 'assistant',
        message: {
          content: [
            {
              type: 'tool_use',
              id: 'tool-old',
              name: 'PushNotification',
              input: { message: 'older delivery' },
            },
          ],
        },
      },
      {
        type: 'user',
        message: {
          content: [{ type: 'tool_result', tool_use_id: 'tool-old', content: 'ok' }],
        },
      },
      {
        type: 'assistant',
        message: {
          content: [
            {
              type: 'tool_use',
              id: 'tool-new',
              name: 'TelegramPushTool',
              input: { message: 'final delivery' },
            },
          ],
        },
      },
      {
        type: 'user',
        message: {
          content: [{ type: 'tool_result', tool_use_id: 'tool-new', content: 'ok' }],
        },
      },
    ]

    expect(getMostRecentSuccessfulPushNotificationText(messages)).toBe(
      'final delivery',
    )
  })

  test('ignores failed tool results', () => {
    const messages = [
      {
        type: 'assistant',
        message: {
          content: [
            {
              type: 'tool_use',
              id: 'tool-err',
              name: 'PushNotificationTool',
              input: { message: 'should not count' },
            },
          ],
        },
      },
      {
        type: 'user',
        message: {
          content: [
            {
              type: 'tool_result',
              tool_use_id: 'tool-err',
              is_error: true,
              content: 'failed',
            },
          ],
        },
      },
    ]

    expect(getMostRecentSuccessfulPushNotificationText(messages)).toBeNull()
  })
})

describe('hasPersistedTelegramUpdate', () => {
  test('matches telegram-origin user messages by update id', () => {
    const history = [
      {
        type: 'user',
        message: { content: 'hello' },
        origin: { kind: 'telegram', updateId: 123 },
      },
    ]

    expect(hasPersistedTelegramUpdate(history, 123)).toBe(true)
    expect(hasPersistedTelegramUpdate(history, 124)).toBe(false)
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

describe('canonicalizeDaemonConversationHistory', () => {
  test('keeps only user/assistant text and strips transcript noise types', () => {
    const history = [
      { type: 'last-prompt', value: 'nope' },
      { type: 'file-history-snapshot', value: 'nope' },
      {
        type: 'user',
        message: { content: 'hello from telegram' },
        origin: { kind: 'telegram', updateId: 42, username: 'yousuf' },
      },
      {
        type: 'assistant',
        message: { content: [{ type: 'text', text: 'Hi there' }] },
      },
      {
        type: 'assistant',
        message: { content: [{ type: 'text', text: '<idle>' }] },
      },
    ]

    const canonical = canonicalizeDaemonConversationHistory(history)
    expect(canonical).toHaveLength(2)
    expect((canonical[0] as any).type).toBe('user')
    expect((canonical[0] as any).message.content).toBe('hello from telegram')
    expect((canonical[0] as any).origin.kind).toBe('telegram')
    expect((canonical[0] as any).origin.updateId).toBe(42)
    expect((canonical[1] as any).type).toBe('assistant')
    const assistantText = (((canonical[1] as any).message?.content ?? [])[0] as any)?.text
    expect(assistantText).toBe('Hi there')
  })
})

describe('compactDaemonSessionHistory', () => {
  test('compacts oversized history into summary + tail window', () => {
    const history = Array.from({ length: 12 }, (_, i) => ({
      type: i % 2 === 0 ? 'user' : 'assistant',
      message:
        i % 2 === 0
          ? { content: `user message ${i}` }
          : { content: [{ type: 'text', text: `assistant message ${i}` }] },
    }))

    const compacted = compactDaemonSessionHistory({
      history,
      maxMessages: 6,
      tailMessages: 3,
    })

    expect(compacted.length).toBe(4)
    expect((compacted[0] as any).type).toBe('assistant')
    const summaryText = (((compacted[0] as any).message?.content ?? [])[0] as any)?.text
    expect(summaryText).toContain('[DAEMON_COMPACTION_SUMMARY_V1]')
    expect((compacted[2] as any).message.content).toBe('user message 10')
  })

  test('returns history as-is when below threshold', () => {
    const history = [{ type: 'user', message: { content: 'hello' } }]
    const compacted = compactDaemonSessionHistory({
      history,
      maxMessages: 5,
      tailMessages: 2,
    })
    expect(compacted).toHaveLength(1)
    expect((compacted[0] as any).message.content).toBe('hello')
  })
})

describe('selectDaemonPromptHistoryWindow', () => {
  test('keeps latest summary marker with tail slice', () => {
    const summary = {
      type: 'assistant',
      message: {
        content: [{ type: 'text', text: '[DAEMON_COMPACTION_SUMMARY_V1]\nsummary' }],
      },
    }
    const tail = Array.from({ length: 10 }, (_, i) => ({
      type: 'user',
      message: { content: `tail ${i}` },
    }))
    const selected = selectDaemonPromptHistoryWindow({
      history: [summary, ...tail],
      maxMessages: 4,
    })

    expect(selected).toHaveLength(5)
    const firstText = (((selected[0] as any).message?.content ?? [])[0] as any)?.text
    expect(firstText).toContain('[DAEMON_COMPACTION_SUMMARY_V1]')
    expect((selected.at(-1) as any).message.content).toBe('tail 9')
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
