import { randomUUID } from 'crypto'
import {
  attachDaemonSession,
  closeDaemonSession,
  isDaemonReachable,
  listDaemonSessions,
} from './client.js'

type SessionCliResult = {
  launchArgs?: string[]
}

function printUsage(): void {
  process.stdout.write(
    'Usage: kora session <list|attach <session-id>|close <session-id>>\n',
  )
}

function formatOwner(ownerPid: number | null): string {
  if (!ownerPid) {
    return '-'
  }
  return String(ownerPid)
}

export async function maybeAutoAttachSession(
  projectPath: string,
): Promise<string[] | null> {
  if (!(await isDaemonReachable())) {
    return null
  }

  const sessions = await listDaemonSessions(projectPath)
  const target = sessions.find(session => session.state === 'active')
  if (!target) {
    return null
  }

  const ownerClientId = `cli-${randomUUID()}`
  await attachDaemonSession({
    sessionId: target.id,
    ownerPid: process.pid,
    ownerClientId,
    projectPath,
  })
  if (target.historyCount > 0) {
    return ['--resume', target.id]
  }
  return ['--session-id', target.id]
}

export async function daemonSessionMain(args: string[]): Promise<SessionCliResult> {
  const subcommand = args[0] ?? 'list'

  if (!(await isDaemonReachable())) {
    throw new Error('Daemon is not running. Start it with: kora daemon start')
  }

  switch (subcommand) {
    case 'list': {
      const projectPath = process.cwd()
      const sessions = await listDaemonSessions(projectPath)
      if (sessions.length === 0) {
        process.stdout.write(`No sessions found for ${projectPath}\n`)
        return {}
      }
      for (const session of sessions) {
        process.stdout.write(
          `${session.id}  state=${session.state}  history=${session.historyCount}  owner=${formatOwner(session.ownerPid)}  updated=${session.updatedAt}\n`,
        )
      }
      return {}
    }
    case 'attach': {
      const sessionId = args[1]
      if (!sessionId) {
        printUsage()
        throw new Error('Missing session ID for attach')
      }
      const ownerClientId = `cli-${randomUUID()}`
      const attached = await attachDaemonSession({
        sessionId,
        ownerPid: process.pid,
        ownerClientId,
        projectPath: process.cwd(),
      })
      if (attached.stolenFromPid) {
        process.stdout.write(`Session lock stolen from PID ${attached.stolenFromPid}\n`)
      }
      process.stdout.write(`Attached to session ${sessionId}\n`)
      if (attached.session.history.length > 0) {
        return { launchArgs: ['--resume', sessionId] }
      }
      return { launchArgs: ['--session-id', sessionId] }
    }
    case 'close': {
      const sessionId = args[1]
      if (!sessionId) {
        printUsage()
        throw new Error('Missing session ID for close')
      }
      const session = await closeDaemonSession({ sessionId })
      if (!session) {
        throw new Error(`Session not found: ${sessionId}`)
      }
      process.stdout.write(`Closed session ${sessionId}\n`)
      return {}
    }
    case 'help':
    case '--help':
    case '-h': {
      printUsage()
      return {}
    }
    default:
      printUsage()
      throw new Error(`Unknown session subcommand: ${subcommand}`)
  }
}
