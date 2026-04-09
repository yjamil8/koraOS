import { readFileSync } from 'fs'

const LOCAL_PORT = 1234
const LOCALHOST_BASE_URL = `http://127.0.0.1:${LOCAL_PORT}`

function parseDefaultGatewayFromProcNetRoute(): string | null {
  try {
    const raw = readFileSync('/proc/net/route', 'utf8')
    const lines = raw.split('\n')
    for (const line of lines.slice(1)) {
      const parts = line.trim().split(/\s+/)
      if (parts.length < 3) {
        continue
      }
      const destination = parts[1]
      const gatewayHex = parts[2]
      if (destination !== '00000000' || gatewayHex.length !== 8) {
        continue
      }

      const octets = gatewayHex.match(/../g)
      if (!octets || octets.length !== 4) {
        continue
      }
      const ip = octets
        .reverse()
        .map(byte => Number.parseInt(byte, 16))
        .join('.')
      if (/^\d+\.\d+\.\d+\.\d+$/.test(ip)) {
        return ip
      }
    }
  } catch {
    // Non-Linux environments won't have /proc/net/route.
  }
  return null
}

export function resolveDefaultAnthropicBaseUrl(): string {
  const explicitOverride = process.env.KORA_LM_STUDIO_BASE_URL?.trim()
  if (explicitOverride) {
    return explicitOverride
  }

  const gatewayIp = parseDefaultGatewayFromProcNetRoute()
  if (gatewayIp) {
    return `http://${gatewayIp}:${LOCAL_PORT}`
  }

  return LOCALHOST_BASE_URL
}
