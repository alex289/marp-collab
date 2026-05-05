import { serve } from '@hono/node-server'
import { setupWSConnection } from '@y/websocket-server/utils'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { WebSocketServer } from 'ws'

import { auth } from './auth.js'
import { initializeDatabase } from './db/init.js'
import { env } from './env.js'

type AppVariables = {
  user: typeof auth.$Infer.Session.user | null
  session: typeof auth.$Infer.Session.session | null
}

initializeDatabase()

const app = new Hono<{ Variables: AppVariables }>()

app.use(
  '*',
  cors({
    origin: env.frontendOrigin,
    allowMethods: ['GET', 'POST', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  }),
)

app.use('*', async (c, next) => {
  const sessionPayload = await auth.api.getSession({
    headers: c.req.raw.headers,
  })

  if (!sessionPayload) {
    c.set('user', null)
    c.set('session', null)
    await next()
    return
  }

  c.set('user', sessionPayload.user)
  c.set('session', sessionPayload.session)
  await next()
})

app.on(['POST', 'GET'], '/api/auth/*', (c) => auth.handler(c.req.raw))

app.get('/api/session', (c) => {
  const user = c.get('user')
  const session = c.get('session')

  if (!user || !session) {
    return c.json({ user: null, session: null }, 401)
  }

  return c.json({ user, session })
})

app.get('/api/health', (c) =>
  c.json({
    status: 'ok',
    now: new Date().toISOString(),
  }),
)

app.get('/', (c) => c.text('Realtime collaboration backend is running.'))

const server = serve({ fetch: app.fetch, port: env.port }, (info) => {
  console.log(`Backend listening on http://localhost:${info.port}`)
  console.log(`Yjs websocket endpoint: ws://localhost:${info.port}/yjs/<room-name>`)
})

const yjsWss = new WebSocketServer({ noServer: true })

server.on('upgrade', (request, socket, head) => {
  let requestUrl: URL

  try {
    requestUrl = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`)
  } catch {
    socket.destroy()
    return
  }

  if (!requestUrl.pathname.startsWith('/yjs')) {
    socket.destroy()
    return
  }

  yjsWss.handleUpgrade(request, socket, head, (ws) => {
    const roomFromPath = requestUrl.pathname.replace(/^\/yjs\/?/, '')
    const room = roomFromPath || requestUrl.searchParams.get('room') || 'global'
    setupWSConnection(ws as never, request, {
      docName: room,
      gc: true,
    })
  })
})
