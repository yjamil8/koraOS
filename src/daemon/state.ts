import { mkdir, readFile, rename, rm, writeFile } from 'fs/promises'
import { homedir } from 'os'
import { join } from 'path'

const KORA_HOME = process.env.KORA_HOME || join(homedir(), '.kora')
const DAEMON_STATE_PATH = join(KORA_HOME, 'daemon.json')

export type StoredDaemonState = {
  pid: number
  startedAt: string
  command: string
  host?: string
  port?: number
}

export function getDaemonStatePath(): string {
  return DAEMON_STATE_PATH
}

async function ensureDaemonDir(): Promise<void> {
  await mkdir(KORA_HOME, { recursive: true })
}

export async function readDaemonState(): Promise<StoredDaemonState | null> {
  try {
    const content = await readFile(DAEMON_STATE_PATH, 'utf8')
    const parsed = JSON.parse(content) as Partial<StoredDaemonState>
    if (
      typeof parsed.pid !== 'number' ||
      !Number.isInteger(parsed.pid) ||
      parsed.pid <= 0
    ) {
      return null
    }
    return {
      pid: parsed.pid,
      startedAt:
        typeof parsed.startedAt === 'string' ? parsed.startedAt : new Date(0).toISOString(),
      command: typeof parsed.command === 'string' ? parsed.command : '',
      host: typeof parsed.host === 'string' ? parsed.host : undefined,
      port:
        typeof parsed.port === 'number' && Number.isInteger(parsed.port)
          ? parsed.port
          : undefined,
    }
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code === 'ENOENT') {
      return null
    }
    return null
  }
}

export async function writeDaemonState(state: StoredDaemonState): Promise<void> {
  await ensureDaemonDir()
  const tmpPath = `${DAEMON_STATE_PATH}.tmp-${process.pid}-${Date.now()}`
  const content = JSON.stringify(state, null, 2)
  await writeFile(tmpPath, content, 'utf8')
  await rename(tmpPath, DAEMON_STATE_PATH)
}

export async function clearDaemonState(): Promise<void> {
  try {
    await rm(DAEMON_STATE_PATH, { force: true })
  } catch {
    // Intentionally ignore.
  }
}

export function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code === 'EPERM') {
      return true
    }
    return false
  }
}
