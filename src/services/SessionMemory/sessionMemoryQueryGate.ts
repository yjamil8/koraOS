import type { Message } from '../../types/message.js'
import { getUserMessageText } from '../../utils/messages.js'

const DAEMON_INTERNAL_PROMPT_PREFIXES = [
  '[SYSTEM: Autonomous Background Tick.',
  '[SYSTEM: Morning Weather Routine.',
]

function isDaemonInternalPrompt(text: string | null): boolean {
  if (!text) {
    return false
  }
  const trimmed = text.trim()
  return DAEMON_INTERNAL_PROMPT_PREFIXES.some(prefix =>
    trimmed.startsWith(prefix),
  )
}

function getLastUserMessageText(messages: Message[]): string | null {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const text = getUserMessageText(messages[i])
    if (typeof text === 'string' && text.trim().length > 0) {
      return text.trim()
    }
  }
  return null
}

export function shouldRunSessionMemoryForQuery(input: {
  querySource: string
  sessionSource: string | undefined
  messages: Message[]
}): boolean {
  if (input.querySource.startsWith('repl_main_thread')) {
    return true
  }

  const isDaemonSdkQuery =
    input.querySource === 'sdk' && input.sessionSource === 'daemon'
  if (!isDaemonSdkQuery) {
    return false
  }

  return !isDaemonInternalPrompt(getLastUserMessageText(input.messages))
}
