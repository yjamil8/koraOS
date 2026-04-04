import { KORA_DAEMON_HOST, KORA_DAEMON_PORT } from './config.js'
import type { KairosLoopController } from './kairosLoop.js'
import {
  attachSession,
  closeSession,
  createSession,
  getSession,
  listSessions,
} from './sessions.js'

type StartDaemonHttpServerOptions = {
  host?: string
  port?: number
  loopController?: KairosLoopController
}

type DaemonHttpServerHandle = {
  host: string
  port: number
  stop: () => void
}

function json(body: unknown, status: number = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function badRequest(message: string): Response {
  return json({ error: message }, 400)
}

function notFound(): Response {
  return json({ error: 'Not found' }, 404)
}

async function readJson(req: Request): Promise<Record<string, unknown>> {
  try {
    const body = await req.json()
    if (!body || typeof body !== 'object') {
      return {}
    }
    return body as Record<string, unknown>
  } catch {
    return {}
  }
}

export function startDaemonHttpServer(
  options: StartDaemonHttpServerOptions = {},
): DaemonHttpServerHandle {
  const host = options.host ?? KORA_DAEMON_HOST
  const port = options.port ?? KORA_DAEMON_PORT
  const startedAt = new Date().toISOString()
  const loopController = options.loopController

  const server = Bun.serve({
    hostname: host,
    port,
    fetch: async req => {
      const url = new URL(req.url)
      const pathSegments = url.pathname.split('/').filter(Boolean)

      if (req.method === 'GET' && url.pathname === '/health') {
        return json({
          status: 'ok',
          pid: process.pid,
          startedAt,
          host,
          port,
        })
      }

      if (url.pathname === '/daemon/loop-status') {
        if (!loopController) {
          return json({ error: 'Loop controller unavailable' }, 503)
        }
        if (req.method !== 'GET') {
          return json({ error: 'Method not allowed' }, 405)
        }
        return json({ loop: loopController.getStatus() })
      }

      if (url.pathname === '/daemon/loop-tick') {
        if (!loopController) {
          return json({ error: 'Loop controller unavailable' }, 503)
        }
        if (req.method !== 'POST') {
          return json({ error: 'Method not allowed' }, 405)
        }
        const body = await readJson(req)
        const result = await loopController.tick({
          manual: true,
          sessionId:
            typeof body.sessionId === 'string' ? body.sessionId : undefined,
          simulateMalformed: body.simulateMalformed === true,
        })
        return json({ result, loop: loopController.getStatus() })
      }

      if (url.pathname === '/daemon/loop-pause') {
        if (!loopController) {
          return json({ error: 'Loop controller unavailable' }, 503)
        }
        if (req.method !== 'POST') {
          return json({ error: 'Method not allowed' }, 405)
        }
        const loop = await loopController.pause()
        return json({ loop })
      }

      if (url.pathname === '/daemon/loop-resume') {
        if (!loopController) {
          return json({ error: 'Loop controller unavailable' }, 503)
        }
        if (req.method !== 'POST') {
          return json({ error: 'Method not allowed' }, 405)
        }
        const loop = await loopController.resume()
        return json({ loop })
      }

      if (pathSegments.length === 1 && pathSegments[0] === 'sessions') {
        if (req.method === 'GET') {
          const projectPath = url.searchParams.get('projectPath') ?? undefined
          const sessions = await listSessions(projectPath)
          return json({ sessions })
        }
        if (req.method === 'POST') {
          const body = await readJson(req)
          const session = await createSession({
            projectPath:
              typeof body.projectPath === 'string' ? body.projectPath : process.cwd(),
            sessionId:
              typeof body.sessionId === 'string' ? body.sessionId : undefined,
            transcriptPath:
              typeof body.transcriptPath === 'string'
                ? body.transcriptPath
                : undefined,
          })
          return json({ session }, 201)
        }
      }

      if (pathSegments.length === 2 && pathSegments[0] === 'sessions') {
        const sessionId = decodeURIComponent(pathSegments[1])
        if (req.method === 'GET') {
          const session = await getSession(sessionId)
          if (!session) {
            return notFound()
          }
          return json({ session })
        }
      }

      if (
        pathSegments.length === 3 &&
        pathSegments[0] === 'sessions' &&
        pathSegments[2] === 'attach'
      ) {
        if (req.method !== 'POST') {
          return json({ error: 'Method not allowed' }, 405)
        }
        const sessionId = decodeURIComponent(pathSegments[1])
        const body = await readJson(req)
        if (typeof body.ownerPid !== 'number' || !Number.isInteger(body.ownerPid)) {
          return badRequest('ownerPid is required')
        }
        if (typeof body.ownerClientId !== 'string' || !body.ownerClientId) {
          return badRequest('ownerClientId is required')
        }
        const attached = await attachSession({
          sessionId,
          ownerPid: body.ownerPid,
          ownerClientId: body.ownerClientId,
          projectPath:
            typeof body.projectPath === 'string' ? body.projectPath : undefined,
          transcriptPath:
            typeof body.transcriptPath === 'string'
              ? body.transcriptPath
              : undefined,
        })
        return json(attached)
      }

      if (
        pathSegments.length === 3 &&
        pathSegments[0] === 'sessions' &&
        pathSegments[2] === 'close'
      ) {
        if (req.method !== 'POST') {
          return json({ error: 'Method not allowed' }, 405)
        }
        const sessionId = decodeURIComponent(pathSegments[1])
        const body = await readJson(req)
        const session = await closeSession({
          sessionId,
          ownerClientId:
            typeof body.ownerClientId === 'string'
              ? body.ownerClientId
              : undefined,
        })
        if (!session) {
          return notFound()
        }
        return json({ session })
      }

      return notFound()
    },
  })

  return {
    host,
    port: server.port ?? port,
    stop: () => server.stop(true),
  }
}
