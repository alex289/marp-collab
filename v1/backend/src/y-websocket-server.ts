import { createRequire } from 'node:module'
import type { IncomingMessage } from 'node:http'
import path from 'node:path'

import type { WebSocket } from 'ws'

const require = createRequire(import.meta.url)
const yWebsocketPackageJsonPath = require.resolve('y-websocket/package.json')
const yWebsocketUtilsPath = path.join(path.dirname(yWebsocketPackageJsonPath), 'bin', 'utils.cjs')

type SetupWSConnectionOptions = {
  docName?: string
  gc?: boolean
}

type SetupWSConnection = (
  connection: WebSocket,
  request: IncomingMessage,
  options?: SetupWSConnectionOptions,
) => void

const { setupWSConnection } = require(yWebsocketUtilsPath) as {
  setupWSConnection: SetupWSConnection
}

export { setupWSConnection }
