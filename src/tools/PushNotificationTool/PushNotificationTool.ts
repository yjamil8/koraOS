import React from 'react'
import { z } from 'zod/v4'
import { MessageResponse } from '../../components/MessageResponse.js'
import { buildTool, type ToolDef } from '../../Tool.js'
import { Text } from '../../ink.js'
import { lazySchema } from '../../utils/lazySchema.js'
import { getSettings_DEPRECATED } from '../../utils/settings/settings.js'
import { jsonStringify } from '../../utils/slowOperations.js'

const PUSH_NOTIFICATION_TOOL_NAME = 'PushNotification'
const TELEGRAM_MAX_SAFE_CHARS = 4000

const inputSchema = lazySchema(() =>
  z.strictObject({
    message: z
      .string()
      .min(1)
      .describe(
        'The text message to send to the user. Prefer concise, high-signal notifications.',
      ),
  }),
)
type InputSchema = ReturnType<typeof inputSchema>

const outputSchema = lazySchema(() =>
  z.object({
    success: z.boolean(),
    message: z.string(),
    error: z.string().optional(),
    delivery: z.enum(['telegram']).optional(),
    usedMarkdown: z.boolean().optional(),
    truncated: z.boolean().optional(),
  }),
)
type OutputSchema = ReturnType<typeof outputSchema>
type Output = z.infer<OutputSchema>

function scrubSecrets(raw: string, secrets: Array<string | undefined>): string {
  let out = raw
  for (const secret of secrets) {
    if (!secret) continue
    if (secret.length > 0) {
      out = out.split(secret).join('[REDACTED]')
    }
    const encoded = encodeURIComponent(secret)
    if (encoded.length > 0) {
      out = out.split(encoded).join('[REDACTED]')
    }
  }
  return out
}

function truncateForTelegram(message: string): {
  text: string
  truncated: boolean
} {
  if (message.length <= TELEGRAM_MAX_SAFE_CHARS) {
    return { text: message, truncated: false }
  }
  return {
    text: `${message.slice(0, TELEGRAM_MAX_SAFE_CHARS)}...[Truncated]`,
    truncated: true,
  }
}

async function parseTelegramResponse(
  response: Response,
): Promise<{ ok: true } | { ok: false; status: number; description: string }> {
  const bodyText = await response.text()
  let description = bodyText
  try {
    const parsed = JSON.parse(bodyText) as { description?: unknown }
    if (typeof parsed.description === 'string' && parsed.description.length > 0) {
      description = parsed.description
    }
  } catch {
    // Keep raw text fallback for non-JSON responses.
  }

  if (response.ok) {
    return { ok: true }
  }
  return { ok: false, status: response.status, description }
}

function isMarkdownParseError(description: string): boolean {
  const lower = description.toLowerCase()
  return (
    lower.includes('parse') ||
    lower.includes("can't parse entities") ||
    lower.includes('cant parse entities') ||
    lower.includes('entity')
  )
}

function getRuntimeValue(name: 'TELEGRAM_BOT_TOKEN' | 'TELEGRAM_CHAT_ID'):
  | string
  | undefined {
  const fromEnv = process.env[name]?.trim()
  if (fromEnv) return fromEnv

  try {
    const envSettings = getSettings_DEPRECATED()?.env
    const value = envSettings?.[name]
    if (typeof value === 'string') {
      const trimmed = value.trim()
      if (trimmed) return trimmed
    }
  } catch {
    // Settings may not be available in very early startup.
  }

  return undefined
}

export const PushNotificationTool = buildTool({
  name: PUSH_NOTIFICATION_TOOL_NAME,
  aliases: ['PushNotificationTool', 'TelegramPushTool'],
  searchHint: 'send Telegram bot message to user',
  maxResultSizeChars: 100_000,
  get inputSchema(): InputSchema {
    return inputSchema()
  },
  get outputSchema(): OutputSchema {
    return outputSchema()
  },
  isConcurrencySafe() {
    return true
  },
  isReadOnly() {
    return false
  },
  toAutoClassifierInput(input) {
    return input.message
  },
  async description() {
    return 'Send a Telegram message to the user via Telegram Bot API (not desktop notifications)'
  },
  async prompt() {
    return "Use this tool for Telegram outbound alerts. This is not an OS/desktop notifier. For user requests like 'ping me on Telegram', call this tool directly with a concise message."
  },
  renderToolUseMessage() {
    return React.createElement(Text, { dimColor: true }, 'Sending push notification')
  },
  renderToolResultMessage(output) {
    if (output.success) {
      return React.createElement(
        MessageResponse,
        null,
        React.createElement(Text, null, output.message),
      )
    }
    return React.createElement(
      MessageResponse,
      null,
      React.createElement(Text, { color: 'error' }, output.error ?? output.message),
    )
  },
  mapToolResultToToolResultBlockParam(content, toolUseID) {
    return {
      tool_use_id: toolUseID,
      type: 'tool_result',
      content: jsonStringify(content),
    }
  },
  async call({ message }): Promise<{ data: Output }> {
    const botToken = getRuntimeValue('TELEGRAM_BOT_TOKEN')
    const chatId = getRuntimeValue('TELEGRAM_CHAT_ID')

    if (!botToken || !chatId) {
      return {
        data: {
          success: false,
          message: 'Failed to send Telegram notification.',
          error:
            'TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID is missing. Configure these environment variables first.',
        },
      }
    }

    const { text, truncated } = truncateForTelegram(message)
    const url = `https://api.telegram.org/bot${botToken}/sendMessage`
    const secrets = [botToken, chatId]

    try {
      const markdownResponse = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          parse_mode: 'Markdown',
        }),
      })
      const markdownResult = await parseTelegramResponse(markdownResponse)

      if (markdownResult.ok) {
        return {
          data: {
            success: true,
            message: 'Successfully pushed notification to user Telegram.',
            delivery: 'telegram',
            usedMarkdown: true,
            truncated,
          },
        }
      }

      if (
        markdownResult.status === 400 &&
        isMarkdownParseError(markdownResult.description)
      ) {
        const plainTextResponse = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            text,
          }),
        })
        const plainTextResult = await parseTelegramResponse(plainTextResponse)

        if (plainTextResult.ok) {
          return {
            data: {
              success: true,
              message:
                'Successfully pushed notification to user Telegram (plain-text fallback).',
              delivery: 'telegram',
              usedMarkdown: false,
              truncated,
            },
          }
        }

        return {
          data: {
            success: false,
            message: 'Failed to push message via Telegram API.',
            error: scrubSecrets(plainTextResult.description, secrets),
            delivery: 'telegram',
            usedMarkdown: false,
            truncated,
          },
        }
      }

      return {
        data: {
          success: false,
          message: 'Failed to push message via Telegram API.',
          error: scrubSecrets(markdownResult.description, secrets),
          delivery: 'telegram',
          usedMarkdown: true,
          truncated,
        },
      }
    } catch (error) {
      return {
        data: {
          success: false,
          message: 'Network error while sending Telegram message.',
          error: scrubSecrets(
            error instanceof Error ? error.message : String(error),
            secrets,
          ),
          delivery: 'telegram',
          truncated,
        },
      }
    }
  },
} satisfies ToolDef<InputSchema, Output>)
