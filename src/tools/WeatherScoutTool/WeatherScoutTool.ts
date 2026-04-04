import { z } from 'zod/v4'
import { buildTool, type ToolDef } from '../../Tool.js'
import { lazySchema } from '../../utils/lazySchema.js'
import { jsonStringify } from '../../utils/slowOperations.js'

const WEATHER_SCOUT_TOOL_NAME = 'WeatherScout'
const OPEN_METEO_BASE_URL = 'https://api.open-meteo.com/v1/forecast'

const WEATHER_CODE_DESCRIPTIONS: Record<number, string> = {
  0: 'Clear sky',
  1: 'Mainly clear',
  2: 'Partly cloudy',
  3: 'Overcast',
  45: 'Fog',
  48: 'Depositing rime fog',
  51: 'Light drizzle',
  53: 'Moderate drizzle',
  55: 'Dense drizzle',
  56: 'Light freezing drizzle',
  57: 'Dense freezing drizzle',
  61: 'Slight rain',
  63: 'Moderate rain',
  65: 'Heavy rain',
  66: 'Light freezing rain',
  67: 'Heavy freezing rain',
  71: 'Slight snowfall',
  73: 'Moderate snowfall',
  75: 'Heavy snowfall',
  77: 'Snow grains',
  80: 'Slight rain showers',
  81: 'Moderate rain showers',
  82: 'Violent rain showers',
  85: 'Slight snow showers',
  86: 'Heavy snow showers',
  95: 'Thunderstorm',
  96: 'Thunderstorm with slight hail',
  99: 'Thunderstorm with heavy hail',
}

type OpenMeteoDailyResponse = {
  daily?: {
    time?: string[]
    weather_code?: number[]
    temperature_2m_max?: number[]
    temperature_2m_min?: number[]
    precipitation_probability_max?: number[]
  }
}

const inputSchema = lazySchema(() =>
  z.strictObject({
    lat: z.number().min(-90).max(90).describe('Latitude of the target location'),
    lon: z
      .number()
      .min(-180)
      .max(180)
      .describe('Longitude of the target location'),
    timezone: z
      .string()
      .default('America/Los_Angeles')
      .describe('IANA timezone for daily forecast values'),
  }),
)
type InputSchema = ReturnType<typeof inputSchema>

const outputSchema = lazySchema(() =>
  z.object({
    success: z.boolean(),
    timezone: z.string(),
    date: z.string().optional(),
    weatherCode: z.number().optional(),
    weatherDescription: z.string().optional(),
    temperatureMaxC: z.number().optional(),
    temperatureMinC: z.number().optional(),
    precipitationProbabilityMax: z.number().optional(),
    error: z.string().optional(),
  }),
)
type OutputSchema = ReturnType<typeof outputSchema>
type Output = z.infer<OutputSchema>

function firstNumber(values: number[] | undefined): number | undefined {
  if (!Array.isArray(values) || values.length === 0) return undefined
  const value = values[0]
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function firstString(values: string[] | undefined): string | undefined {
  if (!Array.isArray(values) || values.length === 0) return undefined
  const value = values[0]
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

export const WeatherScoutTool = buildTool({
  name: WEATHER_SCOUT_TOOL_NAME,
  aliases: ['WeatherScoutTool'],
  searchHint: 'fetch weather forecast for a location by latitude and longitude',
  maxResultSizeChars: 100_000,
  isConcurrencySafe() {
    return true
  },
  isReadOnly() {
    return true
  },
  toAutoClassifierInput(input) {
    return `${input.lat},${input.lon} ${input.timezone}`
  },
  async description() {
    return 'Fetch today weather forecast from Open-Meteo (no API key required)'
  },
  async prompt() {
    return 'Use this tool to fetch daily weather (conditions, high/low temperature, precipitation chance) for a specific location.'
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
  async call({ lat, lon, timezone }): Promise<{ data: Output }> {
    try {
      const url = new URL(OPEN_METEO_BASE_URL)
      url.searchParams.set('latitude', String(lat))
      url.searchParams.set('longitude', String(lon))
      url.searchParams.set(
        'daily',
        'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max',
      )
      url.searchParams.set('timezone', timezone)
      url.searchParams.set('forecast_days', '1')

      const response = await fetch(url.toString())
      if (!response.ok) {
        return {
          data: {
            success: false,
            timezone,
            error: `Weather request failed with HTTP ${response.status}`,
          },
        }
      }

      const parsed = (await response.json()) as OpenMeteoDailyResponse
      const date = firstString(parsed.daily?.time)
      const weatherCode = firstNumber(parsed.daily?.weather_code)
      const temperatureMaxC = firstNumber(parsed.daily?.temperature_2m_max)
      const temperatureMinC = firstNumber(parsed.daily?.temperature_2m_min)
      const precipitationProbabilityMax = firstNumber(
        parsed.daily?.precipitation_probability_max,
      )

      if (
        !date ||
        weatherCode === undefined ||
        temperatureMaxC === undefined ||
        temperatureMinC === undefined
      ) {
        return {
          data: {
            success: false,
            timezone,
            error: 'Weather API response was missing required daily fields',
          },
        }
      }

      return {
        data: {
          success: true,
          timezone,
          date,
          weatherCode,
          weatherDescription:
            WEATHER_CODE_DESCRIPTIONS[weatherCode] ?? 'Unknown weather code',
          temperatureMaxC,
          temperatureMinC,
          precipitationProbabilityMax,
        },
      }
    } catch (error) {
      return {
        data: {
          success: false,
          timezone,
          error:
            error instanceof Error
              ? error.message
              : 'Unknown network error fetching weather',
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
