export const MCP_READ_SCOPE = "presentations:read";
export const MCP_WRITE_SCOPE = "presentations:write";
export const MCP_SCOPES = [MCP_READ_SCOPE, MCP_WRITE_SCOPE, "offline_access"];
export const mcpResource = new URL("/mcp", process.env.URL ?? "http://localhost:5173").href;

// The issuer is public, but this co-located server can fetch its keys directly.
// Docker's HOSTNAME may bind the listener to its container interface, not loopback.
const bindHost = process.env.HOSTNAME ?? "127.0.0.1";
const localHost = bindHost.includes(":") && !bindHost.startsWith("[") ? `[${bindHost}]` : bindHost;
export const mcpJwksUrl = `http://${localHost}:${process.env.PORT ?? "8787"}/api/v1/auth/jwks`;
