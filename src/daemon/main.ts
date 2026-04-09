import { spawn } from 'child_process'
import { readFileSync } from 'fs'
import {
  getDaemonLoopStatus,
  pauseDaemonLoop,
  resumeDaemonLoop,
  tickDaemonLoop,
} from './client.js'
import {
  clearDaemonState,
  getDaemonStatePath,
  isPidAlive,
  readDaemonState,
  type StoredDaemonState,
  writeDaemonState,
} from './state.js'
import { KORA_DAEMON_HOST, KORA_DAEMON_PORT } from './config.js'

const TERM_WAIT_MS = 5_000
const KILL_WAIT_MS = 2_000
const POLL_INTERVAL_MS = 100

function isLikelyWsl(): boolean {
  if (process.env.WSL_DISTRO_NAME) {
    return true
  }
  try {
    const procVersion = readFileSync('/proc/version', 'utf8').toLowerCase()
    return procVersion.includes('microsoft') || procVersion.includes('wsl')
  } catch {
    return false
  }
}

function isLoopbackHost(host: string): boolean {
  const normalized = host.trim().toLowerCase()
  return normalized === '127.0.0.1' || normalized === 'localhost' || normalized === '::1'
}

function printWslLanAccessHint(boundHost: string): void {
  if (!isLikelyWsl() || !isLoopbackHost(boundHost)) {
    return
  }
  const port = KORA_DAEMON_PORT
  console.log('')
  console.log(
    `[daemon] WSL detected and daemon host is ${boundHost}. This is localhost-only; phones cannot connect.`,
  )
  console.log('[daemon] For LAN access, run these in Windows PowerShell as Administrator:')
  console.log(`  $wslIp = ((wsl hostname -I).Trim() -split '\\s+')[0]`)
  console.log(
    `  netsh interface portproxy add v4tov4 listenaddress=0.0.0.0 listenport=${port} connectaddress=$wslIp connectport=${port}`,
  )
  console.log(
    `  netsh advfirewall firewall add rule name="Kora Daemon ${port}" dir=in action=allow protocol=TCP localport=${port}`,
  )
  console.log('')
}

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
  console.log(
    'Usage: kora daemon <start|stop|status|loop-status|tick|pause|resume>',
  )
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
  const host = state.host ?? KORA_DAEMON_HOST
  const connectHost = host === '0.0.0.0' ? '127.0.0.1' : host
  const endpoint = `http://${connectHost}:${state.port ?? KORA_DAEMON_PORT}`
  return `PID=${state.pid} startedAt=${startedAtSummary} endpoint=${endpoint}`
}

async function handleStart(): Promise<void> {
  const existing = await readDaemonState()
  if (existing && isPidAlive(existing.pid)) {
    console.log(`Daemon already running (${formatStateSummary(existing)}).`)
    printWslLanAccessHint(existing.host ?? KORA_DAEMON_HOST)
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
    host: KORA_DAEMON_HOST,
    port: KORA_DAEMON_PORT,
  }
  await writeDaemonState(state)

  // Give the child a brief moment to fail early (syntax/import errors).
  await sleep(150)
  if (!isPidAlive(pid)) {
    await clearDaemonState()
    throw new Error('Daemon process exited immediately after launch')
  }

  console.log(`Daemon started. PID ${pid}`)
  printWslLanAccessHint(KORA_DAEMON_HOST)
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

async function assertDaemonRunning(): Promise<void> {
  const state = await readDaemonState()
  if (!state || !isPidAlive(state.pid)) {
    throw new Error('Daemon is not running. Start it with: kora daemon start')
  }
}

async function handleLoopStatus(): Promise<void> {
  await assertDaemonRunning()
  const loop = await getDaemonLoopStatus()
  console.log(JSON.stringify(loop, null, 2))
}

async function handleTick(args: string[]): Promise<void> {
  await assertDaemonRunning()
  const sessionIdArg = args.find(arg => arg.startsWith('--session-id='))
  const simulateMalformed = args.includes('--simulate-malformed')
  const sessionId = sessionIdArg ? sessionIdArg.split('=')[1] : undefined
  const response = await tickDaemonLoop({
    sessionId,
    simulateMalformed,
  })
  console.log(JSON.stringify(response, null, 2))
}

async function handlePause(): Promise<void> {
  await assertDaemonRunning()
  const loop = await pauseDaemonLoop()
  console.log(JSON.stringify(loop, null, 2))
}

async function handleResume(): Promise<void> {
  await assertDaemonRunning()
  const loop = await resumeDaemonLoop()
  console.log(JSON.stringify(loop, null, 2))
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
    case 'loop-status':
      await handleLoopStatus()
      break
    case 'tick':
      await handleTick(args.slice(1))
      break
    case 'pause':
      await handlePause()
      break
    case 'resume':
      await handleResume()
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
