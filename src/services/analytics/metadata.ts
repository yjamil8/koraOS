import { extname } from 'path'

export type AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS =
  | string
  | number
  | boolean
  | null

function clampText(value: string, max = 200): string {
  return value.length > max ? value.slice(0, max) : value
}

export function sanitizeToolNameForAnalytics(toolName: string): string {
  return clampText(toolName || 'unknown')
}

export function getFileExtensionForAnalytics(
  filePath: string,
): string | undefined {
  if (!filePath) return undefined
  const ext = extname(filePath).replace(/^\./, '').toLowerCase()
  return ext || undefined
}

export function getFileExtensionsFromBashCommand(
  command: string,
  fallbackPath?: string,
): string[] | string | undefined {
  const extensions = new Set<string>()
  const addFrom = (value: string | undefined): void => {
    const ext = value ? getFileExtensionForAnalytics(value) : undefined
    if (ext) extensions.add(ext)
  }

  addFrom(fallbackPath)
  const tokenMatches =
    command.match(/(?:^|\s)([^\s'"]+\.[a-zA-Z0-9_-]{1,12})(?=\s|$)/g) ?? []
  for (const match of tokenMatches) {
    addFrom(match.trim())
  }

  if (extensions.size === 0) return undefined
  if (extensions.size === 1) return [...extensions][0]
  return [...extensions].sort()
}

export function extractMcpToolDetails(
  toolName: string,
):
  | {
      serverName: string
      mcpToolName: string
    }
  | null {
  if (!toolName.startsWith('mcp__')) return null
  const parts = toolName.split('__')
  if (parts.length < 3) return null
  const serverName = parts[1] || 'unknown'
  const mcpToolName = parts.slice(2).join('__') || 'unknown'
  return { serverName, mcpToolName }
}

export function extractSkillName(
  toolName: string,
  toolInput: unknown,
): string | undefined {
  if (toolName === 'Skill' && toolInput && typeof toolInput === 'object') {
    const maybeName = (toolInput as Record<string, unknown>).command
    if (typeof maybeName === 'string' && maybeName.length > 0) {
      return clampText(maybeName, 120)
    }
  }
  return undefined
}

export function extractToolInputForTelemetry(input: unknown): string | undefined {
  if (input === null || input === undefined) return undefined
  if (typeof input === 'string') return clampText(input, 1000)
  try {
    return clampText(JSON.stringify(input), 1000)
  } catch {
    return undefined
  }
}

export function mcpToolDetailsForAnalytics(
  toolName: string,
  mcpServerType?: string | null,
  mcpServerBaseUrl?: string | null,
): Record<string, AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS> {
  const details = extractMcpToolDetails(toolName)
  if (!details) return {}

  const payload: Record<
    string,
    AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS
  > = {
    mcpServerName: clampText(details.serverName),
    mcpToolName: clampText(details.mcpToolName),
  }

  if (mcpServerType) payload.mcpServerType = clampText(mcpServerType)
  if (mcpServerBaseUrl) payload.mcpServerBaseUrl = clampText(mcpServerBaseUrl)
  return payload
}

export function isToolDetailsLoggingEnabled(): boolean {
  return false
}
