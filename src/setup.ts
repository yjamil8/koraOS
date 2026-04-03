import {
  setOriginalCwd,
  setProjectRoot,
  switchSession,
} from './bootstrap/state.js';
import { asSessionId } from './types/ids.js';
import { logForDebugging } from './utils/debug.js';
import type { PermissionMode } from './utils/permissions/PermissionMode.js';
import { setCwd } from './utils/Shell.js';

export async function setup(
  cwd: string,
  _permissionMode: PermissionMode,
  _allowDangerouslySkipPermissions: boolean,
  _worktreeEnabled: boolean,
  _worktreeName: string | undefined,
  _tmuxEnabled: boolean,
  customSessionId?: string | null,
  _worktreePRNumber?: number,
  messagingSocketPath?: string,
): Promise<void> {
  if (customSessionId) {
    switchSession(asSessionId(customSessionId));
  }

  if (messagingSocketPath) {
    process.env.CLAUDE_CODE_MESSAGING_SOCKET = messagingSocketPath;
  }

  setCwd(cwd);
  setOriginalCwd(cwd);
  setProjectRoot(cwd);
  logForDebugging('[setup] minimal setup complete');
}
