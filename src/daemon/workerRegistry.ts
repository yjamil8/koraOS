type WorkerKind = 'supervisor'

async function runSupervisorWorker(): Promise<void> {
  process.title = 'kora-daemon'

  let shuttingDown = false
  let resolveShutdown: (() => void) | null = null
  const keepAliveInterval = setInterval(() => {
    // Keep the daemon process alive. Additional workers will be wired here in
    // later slices.
  }, 60_000)

  const shutdownPromise = new Promise<void>(resolve => {
    resolveShutdown = resolve
  })

  const shutdown = (): void => {
    if (shuttingDown) {
      return
    }
    shuttingDown = true
    clearInterval(keepAliveInterval)
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
