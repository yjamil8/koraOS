import { startDaemonHttpServer } from './httpServer.js'
import { init } from '../entrypoints/init.js'
import { initSessionMemory } from '../services/SessionMemory/sessionMemory.js'
import { KairosLoopController } from './kairosLoop.js'
import { syncActiveSessions } from './sessions.js'
import { JustBidWatcherController } from './justbidWatcher.js'

type WorkerKind = 'supervisor'

async function runSupervisorWorker(): Promise<void> {
  process.title = 'kora-daemon'

  await init()
  initSessionMemory()
  const loopController = new KairosLoopController()
  const justBidWatcher = new JustBidWatcherController()
  await loopController.initialize()
  await justBidWatcher.initialize()
  loopController.start()
  justBidWatcher.start()
  const httpServer = startDaemonHttpServer({ loopController, justBidWatcher })
  let shuttingDown = false
  let resolveShutdown: (() => void) | null = null
  const syncInterval = setInterval(() => {
    void syncActiveSessions()
  }, 2_000)

  const shutdownPromise = new Promise<void>(resolve => {
    resolveShutdown = resolve
  })

  const shutdown = (): void => {
    if (shuttingDown) {
      return
    }
    shuttingDown = true
    clearInterval(syncInterval)
    loopController.stop()
    justBidWatcher.stop()
    httpServer.stop()
    resolveShutdown?.()
  }

  process.on('SIGTERM', shutdown)
  process.on('SIGINT', shutdown)
  process.on('SIGHUP', shutdown)

  await shutdownPromise
}

export async function runDaemonWorker(kind: string | undefined): Promise<void> {
  const workerKind = kind as WorkerKind | undefined
  switch (workerKind) {
    case 'supervisor':
      await runSupervisorWorker()
      return
    default:
      throw new Error(
        `Unknown daemon worker kind: ${kind ?? '(missing)'} (expected: supervisor)`,
      )
  }
}
