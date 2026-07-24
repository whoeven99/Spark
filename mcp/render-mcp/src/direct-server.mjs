import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  getDeploy,
  getMetrics,
  getService,
  listDeploys,
  listLogs,
  listOwners,
  listServices,
  requireApiKey,
} from "./render-api.mjs";
import {
  getSelectedWorkspace,
  requireSelectedWorkspace,
  resolveOwnerId,
  setSelectedWorkspace,
} from "./workspace-state.mjs";

const TOOLS = [
  {
    name: "list_workspaces",
    description: "List Render workspaces (owners) you have access to.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "select_workspace",
    description: "Select a workspace for subsequent log queries.",
    inputSchema: {
      type: "object",
      properties: {
        ownerID: { type: "string", description: "Workspace owner id (tea-... or usr-...)" },
      },
      required: ["ownerID"],
    },
  },
  {
    name: "get_selected_workspace",
    description: "Get the currently selected workspace.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "list_services",
    description: "List all services in your Render account.",
    inputSchema: {
      type: "object",
      properties: {
        includePreviews: { type: "boolean", default: false },
      },
    },
  },
  {
    name: "get_service",
    description: "Get details about a specific service.",
    inputSchema: {
      type: "object",
      properties: {
        serviceId: { type: "string", description: "Service id, e.g. srv-..." },
      },
      required: ["serviceId"],
    },
  },
  {
    name: "list_deploys",
    description: "List deploy history for a service.",
    inputSchema: {
      type: "object",
      properties: {
        serviceId: { type: "string" },
        cursor: { type: "string", default: "" },
        limit: { type: "number", minimum: 1, maximum: 100, default: 10 },
      },
      required: ["serviceId"],
    },
  },
  {
    name: "get_deploy",
    description: "Get details about a specific deployment.",
    inputSchema: {
      type: "object",
      properties: {
        serviceId: { type: "string" },
        deployId: { type: "string" },
      },
      required: ["serviceId", "deployId"],
    },
  },
  {
    name: "list_logs",
    description:
      "List logs for Render resources. Requires resource ids (srv-..., cron-..., etc.). " +
      "Uses selected workspace as ownerId unless ownerId is provided.",
    inputSchema: {
      type: "object",
      properties: {
        resource: {
          type: "array",
          items: { type: "string" },
          description: "Resource ids to query",
        },
        ownerId: { type: "string", description: "Optional workspace owner id override" },
        type: { type: "array", items: { type: "string" }, description: "app | request | build" },
        text: { type: "array", items: { type: "string" } },
        level: { type: "array", items: { type: "string" } },
        startTime: { type: "string", description: "RFC3339" },
        endTime: { type: "string", description: "RFC3339" },
        direction: { type: "string", enum: ["backward", "forward"], default: "backward" },
        limit: { type: "number", minimum: 1, maximum: 100, default: 50 },
      },
      required: ["resource"],
    },
  },
  {
    name: "get_metrics",
    description: "Get performance metrics for a Render resource.",
    inputSchema: {
      type: "object",
      properties: {
        resourceId: { type: "string" },
        metricTypes: {
          type: "array",
          items: { type: "string" },
          description:
            "cpu_usage, memory_usage, http_request_count, http_latency, bandwidth_usage, ...",
        },
        startTime: { type: "string" },
        endTime: { type: "string" },
        resolution: { type: "number", minimum: 30 },
        cpuUsageAggregationMethod: { type: "string", enum: ["AVG", "MAX", "MIN"] },
        httpLatencyQuantile: { type: "number", minimum: 0, maximum: 1 },
      },
      required: ["resourceId", "metricTypes"],
    },
  },
];

function jsonText(value) {
  return {
    content: [{ type: "text", text: JSON.stringify(value, null, 2) }],
  };
}

async function handleTool(apiKey, name, args) {
  switch (name) {
    case "list_workspaces": {
      const owners = await listOwners(apiKey);
      return jsonText(
        owners.map((row) => {
          const o = row.owner ?? row;
          return { id: o.id, name: o.name, type: o.type, email: o.email };
        }),
      );
    }
    case "select_workspace": {
      return jsonText(setSelectedWorkspace({ id: args.ownerID }));
    }
    case "get_selected_workspace": {
      return jsonText(getSelectedWorkspace() ?? { selected: false });
    }
    case "list_services": {
      const rows = await listServices(apiKey, Boolean(args.includePreviews));
      return jsonText(
        rows.map((row) => {
          const s = row.service ?? row;
          return {
            id: s.id,
            name: s.name,
            type: s.type,
            slug: s.slug,
            suspended: s.suspended,
            updatedAt: s.updatedAt,
          };
        }),
      );
    }
    case "get_service": {
      const data = await getService(apiKey, args.serviceId);
      return jsonText(data.service ?? data);
    }
    case "list_deploys": {
      return jsonText(await listDeploys(apiKey, args.serviceId, args));
    }
    case "get_deploy": {
      return jsonText(await getDeploy(apiKey, args.serviceId, args.deployId));
    }
    case "list_logs": {
      const ownerId = await resolveOwnerId(apiKey, args.ownerId);
      return jsonText(await listLogs(apiKey, ownerId, args));
    }
    case "get_metrics": {
      return jsonText(await getMetrics(apiKey, args.resourceId, args));
    }
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

export async function startDirectServer() {
  const apiKey = requireApiKey();
  const server = new Server(
    { name: "render-mcp-direct", version: "1.0.0" },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    try {
      return await handleTool(apiKey, request.params.name, request.params.arguments ?? {});
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        content: [{ type: "text", text: `Error: ${message}` }],
        isError: true,
      };
    }
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[render-mcp] direct mode ready (stdio)");
}
