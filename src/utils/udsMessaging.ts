import { getSessionId } from '../bootstrap/state.js';

export function getDefaultUdsSocketPath(): string {
  return `/tmp/kora-${getSessionId()}.sock`;
}

export async function startUdsMessaging(
  socketPath: string,
  _options?: { isExplicit?: boolean },
): Promise<void> {
  process.env.CLAUDE_CODE_MESSAGING_SOCKET = socketPath;
}
