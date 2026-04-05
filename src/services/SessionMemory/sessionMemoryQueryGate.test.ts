import { describe, expect, test } from 'bun:test'
import { createUserMessage } from '../../utils/messages.js'
import { shouldRunSessionMemoryForQuery } from './sessionMemoryQueryGate.js'

describe('shouldRunSessionMemoryForQuery', () => {
  test('allows main repl thread queries', () => {
    expect(
      shouldRunSessionMemoryForQuery({
        querySource: 'repl_main_thread',
        sessionSource: undefined,
        messages: [],
      }),
    ).toBe(true)
  })

  test('allows daemon sdk queries for user telegram messages', () => {
    expect(
      shouldRunSessionMemoryForQuery({
        querySource: 'sdk',
        sessionSource: 'daemon',
        messages: [createUserMessage({ content: 'check latest Nvidia news' })],
      }),
    ).toBe(true)
  })

  test('skips internal daemon wake prompts', () => {
    expect(
      shouldRunSessionMemoryForQuery({
        querySource: 'sdk',
        sessionSource: 'daemon',
        messages: [
          createUserMessage({
            content:
              "[SYSTEM: Autonomous Background Tick. Review your active objectives and execute necessary tools. If no action is required, reply strictly with '<idle>' and nothing else.]",
          }),
        ],
      }),
    ).toBe(false)
  })

  test('skips non-daemon sdk queries', () => {
    expect(
      shouldRunSessionMemoryForQuery({
        querySource: 'sdk',
        sessionSource: undefined,
        messages: [createUserMessage({ content: 'hello' })],
      }),
    ).toBe(false)
  })
})
