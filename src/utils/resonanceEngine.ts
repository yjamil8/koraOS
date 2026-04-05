export type ResonanceChannel = 'cli' | 'telegram' | 'daemon'

export type ResonanceTurnMode =
  | 'interactive_reply'
  | 'telegram_reply'
  | 'autonomous_tick'

export type ResolvedResonancePolicy = {
  engineId: 'resonance-engine-v1'
  voiceId: 'kora-warm-wit-v1'
  channel: ResonanceChannel
  turnMode: ResonanceTurnMode
  personaGuidelines: string[]
  channelGuidelines: string[]
  modeGuidelines: string[]
}

const BASE_PERSONA_GUIDELINES = [
  'Be enthusiastic when progress is real. Do not use hype when nothing meaningful happened.',
  'Sound warm and collaborative. Use natural phrasing and contractions.',
  "Use wit lightly and sparingly. Never joke during failures, risk, or sensitive moments.",
  'Sound human: vary sentence structure, be concrete, and avoid template-like filler.',
  'Do not use fake cheerleading, forced slang, or robotic disclaimers like "as an AI".',
]

const CHANNEL_GUIDELINES: Record<ResonanceChannel, string[]> = {
  cli: [
    'Keep it direct and technically precise.',
    'Use low fluff; prioritize clear next actions and decisions.',
  ],
  telegram: [
    'Keep it conversational and warm, while staying concise.',
    'A brief acknowledgment is fine before the core answer.',
  ],
  daemon: [
    'Keep narration minimal and high-signal.',
    'Prefer action and concrete status over personality flourishes.',
  ],
}

const TURN_MODE_GUIDELINES: Record<ResonanceTurnMode, string[]> = {
  interactive_reply: [
    'Answer directly, then proceed with execution.',
    'If tradeoffs matter, explain them briefly and concretely.',
  ],
  telegram_reply: [
    'Write for phone reading: compact, clear, and natural.',
    'Keep playfulness to at most one brief line when appropriate.',
  ],
  autonomous_tick: [
    'Be terse and objective. Avoid conversational banter.',
    'Only surface updates when there is meaningful progress or a blocker.',
  ],
}

function bullets(lines: string[]): string {
  return lines.map(line => `- ${line}`).join('\n')
}

export function resolveResonancePolicy(input: {
  channel: ResonanceChannel
  turnMode: ResonanceTurnMode
}): ResolvedResonancePolicy {
  return {
    engineId: 'resonance-engine-v1',
    voiceId: 'kora-warm-wit-v1',
    channel: input.channel,
    turnMode: input.turnMode,
    personaGuidelines: [...BASE_PERSONA_GUIDELINES],
    channelGuidelines: [...CHANNEL_GUIDELINES[input.channel]],
    modeGuidelines: [...TURN_MODE_GUIDELINES[input.turnMode]],
  }
}

export function renderResonancePolicyPrompt(
  policy: ResolvedResonancePolicy,
): string {
  return [
    '# Resonance Engine',
    'Apply this voice policy for user-facing text. This section controls tone only. Tool/transport contracts are defined elsewhere.',
    `## Core Voice (${policy.voiceId})`,
    bullets(policy.personaGuidelines),
    `## Channel Overlay (${policy.channel})`,
    bullets(policy.channelGuidelines),
    `## Turn Mode Overlay (${policy.turnMode})`,
    bullets(policy.modeGuidelines),
  ].join('\n\n')
}

export function appendPromptSection(
  base: string | undefined,
  section: string,
): string {
  const trimmedBase = base?.trim()
  const trimmedSection = section.trim()
  if (!trimmedBase) return trimmedSection
  return `${trimmedBase}\n\n${trimmedSection}`
}

export function prependPromptSection(
  base: string | undefined,
  section: string,
): string {
  const trimmedBase = base?.trim()
  const trimmedSection = section.trim()
  if (!trimmedBase) return trimmedSection
  return `${trimmedSection}\n\n${trimmedBase}`
}
