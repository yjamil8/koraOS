import { describe, expect, test } from 'bun:test'
import {
  renderResonancePolicyPrompt,
  resolveResonancePolicy,
} from './resonanceEngine.js'

describe('resolveResonancePolicy', () => {
  test('builds a telegram reply policy with channel + mode overlays', () => {
    const policy = resolveResonancePolicy({
      channel: 'telegram',
      turnMode: 'telegram_reply',
    })

    expect(policy.engineId).toBe('resonance-engine-v1')
    expect(policy.voiceId).toBe('kora-warm-wit-v1')
    expect(policy.channel).toBe('telegram')
    expect(policy.turnMode).toBe('telegram_reply')
    expect(policy.channelGuidelines.length).toBeGreaterThan(0)
    expect(policy.modeGuidelines.length).toBeGreaterThan(0)
  })
})

describe('renderResonancePolicyPrompt', () => {
  test('keeps tone policy separate from transport mechanics', () => {
    const prompt = renderResonancePolicyPrompt(
      resolveResonancePolicy({
        channel: 'telegram',
        turnMode: 'telegram_reply',
      }),
    )

    expect(prompt).toContain('# Resonance Engine')
    expect(prompt).toContain('controls tone only')
    expect(prompt).not.toContain('PushNotification')
    expect(prompt).not.toContain('<idle>')
  })
})
