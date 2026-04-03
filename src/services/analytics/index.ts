export type AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS =
  | string
  | number
  | boolean
  | null

export type AnalyticsMetadata_I_VERIFIED_THIS_IS_PII_TAGGED =
  AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS

export function logEvent(
  _eventName: string,
  _payload?: Record<string, unknown>,
): void {
  // No-op in local/offline mode.
}

export async function logEventAsync(
  _eventName: string,
  _payload?: Record<string, unknown>,
): Promise<void> {
  // No-op in local/offline mode.
}
