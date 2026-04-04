import { getSettings_DEPRECATED } from '../../utils/settings/settings.js'

export type ProviderSearchHit = {
  title: string
  url: string
  snippet?: string
  age?: string
}

type TavilyApiResponse = {
  results?: Array<{
    title?: string
    url?: string
    content?: string
    published_date?: string
  }>
}

export function getRuntimeValue(
  name: 'TAVILY_API_KEY',
): string | undefined {
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
    // Settings may not be initialized in early startup paths.
  }

  return undefined
}

function sanitizeUrl(raw: string | undefined): string | null {
  if (!raw || typeof raw !== 'string') return null
  try {
    const parsed = new URL(raw.trim())
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return parsed.toString()
    }
  } catch {
    // Ignore invalid URLs.
  }
  return null
}

export async function runTavilySearch(
  query: string,
  maxResults: number = 5,
): Promise<ProviderSearchHit[]> {
  const apiKey = getRuntimeValue('TAVILY_API_KEY')
  if (!apiKey) {
    throw new Error('TAVILY_API_KEY is missing')
  }

  const response = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      api_key: apiKey,
      query,
      search_depth: 'advanced',
      include_raw_content: false,
      max_results: Math.max(1, Math.min(20, maxResults)),
    }),
  })
  if (!response.ok) {
    throw new Error(`Tavily request failed with HTTP ${response.status}`)
  }

  const parsed = (await response.json()) as TavilyApiResponse
  const rows = Array.isArray(parsed.results) ? parsed.results : []
  const hits: ProviderSearchHit[] = []

  for (const row of rows) {
    const safeUrl = sanitizeUrl(row.url)
    const title = (row.title ?? '').trim()
    if (!safeUrl || title.length === 0) continue
    hits.push({
      title,
      url: safeUrl,
      snippet: (row.content ?? '').trim() || undefined,
      age: (row.published_date ?? '').trim() || undefined,
    })
    if (hits.length >= maxResults) break
  }

  return hits
}
