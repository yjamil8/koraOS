const DEFAULT_KORA_DAEMON_HOST = '127.0.0.1'
const DEFAULT_KORA_DAEMON_PORT = 49152

function resolveDaemonHost(): string {
  const fromEnv = process.env.KORA_DAEMON_HOST?.trim()
  return fromEnv && fromEnv.length > 0 ? fromEnv : DEFAULT_KORA_DAEMON_HOST
}

function resolveDaemonPort(): number {
  const fromEnv = process.env.KORA_DAEMON_PORT?.trim()
  if (!fromEnv) {
    return DEFAULT_KORA_DAEMON_PORT
  }
  const parsed = Number.parseInt(fromEnv, 10)
  if (!Number.isFinite(parsed) || parsed < 1 || parsed > 65535) {
    return DEFAULT_KORA_DAEMON_PORT
  }
  return parsed
}

export const KORA_DAEMON_HOST = resolveDaemonHost()
export const KORA_DAEMON_PORT = resolveDaemonPort()

export function getDaemonBaseUrl(port: number = KORA_DAEMON_PORT): string {
  const connectHost = KORA_DAEMON_HOST === '0.0.0.0' ? '127.0.0.1' : KORA_DAEMON_HOST
  return `http://${connectHost}:${port}`
}
