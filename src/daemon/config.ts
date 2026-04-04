export const KORA_DAEMON_HOST = '127.0.0.1'
export const KORA_DAEMON_PORT = 49152

export function getDaemonBaseUrl(port: number = KORA_DAEMON_PORT): string {
  return `http://${KORA_DAEMON_HOST}:${port}`
}
