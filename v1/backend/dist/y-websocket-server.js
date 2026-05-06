import { createRequire } from 'node:module';
import path from 'node:path';
const require = createRequire(import.meta.url);
const yWebsocketPackageJsonPath = require.resolve('y-websocket/package.json');
const yWebsocketUtilsPath = path.join(path.dirname(yWebsocketPackageJsonPath), 'bin', 'utils.cjs');
const { setupWSConnection } = require(yWebsocketUtilsPath);
export { setupWSConnection };
