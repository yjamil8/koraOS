export function initialize1PEventLogging(): void {
  // No-op in local/offline mode.
}

export function reinitialize1PEventLoggingIfConfigChanged(): void {
  // No-op in local/offline mode.
}

export function logEventTo1P(
  _eventName: string,
  _payload?: Record<string, unknown>,
): void {
  // No-op in local/offline mode.
}

export async function shutdown1PEventLogging(): Promise<void> {
  // No-op in local/offline mode.
}
