import { z } from 'zod/v4'
import { buildTool, type ToolDef } from '../../Tool.js'
import { lazySchema } from '../../utils/lazySchema.js'
import { jsonStringify } from '../../utils/slowOperations.js'
import { getRuntimeValue, runTavilySearch } from '../shared/searchProviders.js'

const TAVILY_RESEARCH_TOOL_NAME = 'TavilyResearch'

const inputSchema = lazySchema(() =>
  z.strictObject({
    query: z.string().min(2).describe('Research query for Tavily'),
  }),
)
type InputSchema = ReturnType<typeof inputSchema>

const hitSchema = z.object({
  title: z.string(),
  url: z.string(),
  summary: z.string().optional(),
  published: z.string().optional(),
})

const outputSchema = lazySchema(() =>
  z.object({
    success: z.boolean(),
    query: z.string(),
    results: z.array(hitSchema),
    summary: z.string(),
    source: z.literal('tavily'),
    error: z.string().optional(),
  }),
)
type OutputSchema = ReturnType<typeof outputSchema>
type Output = z.infer<OutputSchema>

function clip(text: string, limit: number): string {
  const trimmed = text.trim()
  if (trimmed.length <= limit) return trimmed
  return `${trimmed.slice(0, limit)}...`
}

function makeSummary(rows: Output['results']): string {
  if (rows.length === 0) {
    return 'No Tavily research results found.'
  }
  return rows
    .map((row, idx) => {
      const datePart = row.published ? ` (${row.published})` : ''
      const summaryPart = row.summary ? ` - ${row.summary}` : ''
      return `${idx + 1}. ${row.title}${datePart}\n${row.url}${summaryPart}`
    })
    .join('\n\n')
}

export const TavilyResearchTool = buildTool({
  name: TAVILY_RESEARCH_TOOL_NAME,
  aliases: ['TavilyResearchTool'],
  searchHint:
    'deep web research and technical/documentation lookup via Tavily API',
  maxResultSizeChars: 100_000,
  isConcurrencySafe() {
    return true
  },
  isReadOnly() {
    return true
  },
  toAutoClassifierInput(input) {
    return input.query
  },
  async description() {
    return 'Fetch deep research-oriented web results using Tavily search API'
  },
  async prompt() {
    return 'Use this for deeper technical or multi-source research. Tavily returns pre-processed summaries.'
  },
  get inputSchema(): InputSchema {
    return inputSchema()
  },
  get outputSchema(): OutputSchema {
    return outputSchema()
  },
  renderToolUseMessage() {
    return null
  },
  async call({ query }): Promise<{ data: Output }> {
    if (!getRuntimeValue('TAVILY_API_KEY')) {
      return {
        data: {
          success: false,
          query,
          results: [],
          summary: 'Missing TAVILY_API_KEY.',
          source: 'tavily',
          error: 'TAVILY_API_KEY is missing. Configure it in env/settings first.',
        },
      }
    }

    try {
      const hits = await runTavilySearch(query, 5)
      const rows = hits.map(hit => ({
        title: hit.title,
        url: hit.url,
        summary: hit.snippet ? clip(hit.snippet, 220) : undefined,
        published: hit.age,
      }))
      return {
        data: {
          success: true,
          query,
          results: rows,
          summary: makeSummary(rows),
          source: 'tavily',
        },
      }
    } catch (error) {
      return {
        data: {
          success: false,
          query,
          results: [],
          summary: 'Tavily request failed.',
          source: 'tavily',
          error: error instanceof Error ? error.message : String(error),
        },
      }
    }
  },
  mapToolResultToToolResultBlockParam(output, toolUseID) {
    return {
      tool_use_id: toolUseID,
      type: 'tool_result',
      content: jsonStringify(output),
    }
  },
} satisfies ToolDef<InputSchema, Output>)
