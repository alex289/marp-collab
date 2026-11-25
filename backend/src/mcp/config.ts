export const MCP_READ_SCOPE = "presentations:read";
export const MCP_WRITE_SCOPE = "presentations:write";
export const MCP_SCOPES = [MCP_READ_SCOPE, MCP_WRITE_SCOPE, "offline_access"];
export const mcpResource = new URL("/mcp", process.env.URL ?? "http://localhost:5173").href;
