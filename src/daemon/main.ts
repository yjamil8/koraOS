import { spawn } from 'child_process'
import {
  clearDaemonState,
  getDaemonStatePath,
  isPidAlive,
  readDaemonState,
  type StoredDaemonState,
  writeDaemonState,
} from './state.js'

const TERM_WAIT_MS = 5_000
const KILL_WAIT_MS = 2_000
const POLL_INTERVAL_MS = 100

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function waitForExit(pid: number, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (!isPidAlive(pid)) {
      return true
    }
    await sleep(POLL_INTERVAL_MS)
  }
  return !isPidAlive(pid)
}

function printUsage(): void {
  console.log('Usage: kora daemon <start|stop|status>')
}

function getScriptPathForWorker(): string {
  const scriptPath = process.argv[1]
  if (!scriptPath) {
    throw new Error('Unable to resolve current CLI script path')
  }
  return scriptPath
}

function startDetachedWorker(): number {
  const child = spawn(
    process.execPath,
    [getScriptPathForWorker(), '--daemon-worker', 'supervisor'],
    {
      detached: true,
      stdio: 'ignore',
      env: {
        ...process.env,
        KORA_DAEMON_PROCESS: '1',
      },
    },
  )
  child.unref()
  if (!child.pid) {
    throw new Error('Daemon process did not return a PID')
  }
  return child.pid
}

function formatStateSummary(state: StoredDaemonState): string {
  const startedAt = new Date(state.startedAt)
  const startedAtSummary = Number.isNaN(startedAt.getTime()) ? 'unknown' : startedAt.toISOString()
  return `PID=${state.pid} startedAt=${startedAtSummary}`
}

async function handleStart(): Promise<void> {
  const existing = await readDaemonState()
  if (existing && isPidAlive(existing.pid)) {
    console.log(`Daemon already running (${formatStateSummary(existing)}).`)
    return
  }
  if (existing && !isPidAlive(existing.pid)) {
    await clearDaemonState()
  }

  const pid = startDetachedWorker()
  const state: StoredDaemonState = {
    pid,
    startedAt: new Date().toISOString(),
    command: `${process.execPath} ${getScriptPathForWorker()} --daemon-worker supervisor`,
  }
  await writeDaemonState(state)

  // Give the child a brief moment to fail early (syntax/import errors).
  await sleep(150)
  if (!isPidAlive(pid)) {
    await clearDaemonState()
    throw new Error('Daemon process exited immediately after launch')
  }

  console.log(`Daemon started. PID ${pid}`)
}

async function handleStatus(): Promise<void> {
  const state = await readDaemonState()
  if (!state) {
    console.log('Stopped')
    return
  }
  if (isPidAlive(state.pid)) {
    console.log(`Healthy/Running (${formatStateSummary(state)})`)
    return
  }
  console.log(`Stopped (stale lockfile at ${getDaemonStatePath()})`)
}

async function handleStop(): Promise<void> {
  const state = await readDaemonState()
  if (!state) {
    console.log('Stopped')
    return
  }

  const pid = state.pid
  if (!isPidAlive(pid)) {
    await clearDaemonState()
    console.log('Stopped (cleaned stale lockfile)')
    return
  }

  try {
    process.kill(pid, 'SIGTERM')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ESRCH') {
      throw error
    }
  }

  if (!(await waitForExit(pid, TERM_WAIT_MS))) {
    try {
      process.kill(pid, 'SIGKILL')
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ESRCH') {
        throw error
      }
    }
  }

  if (!(await waitForExit(pid, KILL_WAIT_MS))) {
    throw new Error(`Failed to stop daemon process ${pid}`)
  }

  await clearDaemonState()
  console.log(`Stopped daemon process ${pid}`)
}

export async function daemonMain(args: string[]): Promise<void> {
  const subcommand = args[0] ?? 'status'
  switch (subcommand) {
    case 'start':
      await handleStart()
      break
    case 'stop':
      await handleStop()
      break
    case 'status':
      await handleStatus()
      break
    case 'help':
    case '--help':
    case '-h':
      printUsage()
      break
    default:
      printUsage()
      throw new Error(`Unknown daemon subcommand: ${subcommand}`)
  }
}
