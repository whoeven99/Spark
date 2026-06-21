import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { requireApiKey } from "./render-api.mjs";

const HOSTED_URL = process.env.RENDER_MCP_URL?.trim() || "https://mcp.render.com/mcp";

export async function startBridgeServer() {
  const apiKey = requireApiKey();

  const client = new Client(
    { name: "render-mcp-bridge-client", version: "1.0.0" },
    { capabilities: {} },
  );

  const transport = new StreamableHTTPClientTransport(new URL(HOSTED_URL), {
    requestInit: {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    },
  });

  await client.connect(transport);
  console.error(`[render-mcp] bridge connected → ${HOSTED_URL}`);

  const server = new Server(
    { name: "render-mcp", version: "1.0.0" },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    const result = await client.listTools();
    return { tools: result.tools };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    try {
      return await client.callTool({
        name: request.params.name,
        arguments: request.params.arguments ?? {},
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        content: [{ type: "text", text: `Error: ${message}` }],
        isError: true,
      };
    }
  });

  const stdio = new StdioServerTransport();
  await server.connect(stdio);
  console.error("[render-mcp] bridge ready (stdio → hosted MCP, full tool set)");
}
