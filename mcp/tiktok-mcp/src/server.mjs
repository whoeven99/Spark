import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { getDefaultIds, tiktokGet, tiktokPost } from "./tiktok-api.mjs";

const TOOLS = [
  {
    name: "tiktok_list_advertisers",
    description: "列出 OAuth token 可访问的 TikTok 广告主账号。",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "tiktok_list_business_centers",
    description: "列出可访问的 Business Center（bc/get）。",
    inputSchema: {
      type: "object",
      properties: {
        page: { type: "number", default: 1 },
        pageSize: { type: "number", default: 20 },
      },
    },
  },
  {
    name: "tiktok_list_catalogs",
    description: "列出 BC 下的 Catalog（catalog/get）。",
    inputSchema: {
      type: "object",
      properties: {
        bcId: { type: "string", description: "Business Center ID，默认取 TIKTOK_BC_ID" },
        page: { type: "number", default: 1 },
        pageSize: { type: "number", default: 20 },
      },
    },
  },
  {
    name: "tiktok_get_catalog",
    description: "读取单个 Catalog 配置（channel、region、currency 等）。",
    inputSchema: {
      type: "object",
      properties: {
        bcId: { type: "string" },
        catalogId: { type: "string", description: "默认取 TIKTOK_CATALOG_ID" },
      },
    },
  },
  {
    name: "tiktok_list_catalog_products",
    description: "分页读取 Catalog 商品（catalog/product/get）。",
    inputSchema: {
      type: "object",
      properties: {
        bcId: { type: "string" },
        catalogId: { type: "string" },
        page: { type: "number", default: 1 },
        pageSize: { type: "number", default: 20 },
        skuIds: {
          type: "array",
          items: { type: "string" },
          description: "可选，按 sku_id 过滤",
        },
      },
    },
  },
  {
    name: "tiktok_get_catalog_product_log",
    description: "读取 Catalog 商品上传/处理日志（catalog/product/log）。",
    inputSchema: {
      type: "object",
      properties: {
        bcId: { type: "string" },
        catalogId: { type: "string" },
        page: { type: "number", default: 1 },
        pageSize: { type: "number", default: 20 },
      },
    },
  },
  {
    name: "tiktok_get_catalog_eventsource_bind",
    description: "读取 Catalog 与 Pixel/事件源绑定关系（catalog/eventsource_bind/get）。",
    inputSchema: {
      type: "object",
      properties: {
        bcId: { type: "string" },
        catalogId: { type: "string" },
      },
    },
  },
  {
    name: "tiktok_list_pixels",
    description: "列出广告主 Pixel（pixel/list）。",
    inputSchema: {
      type: "object",
      properties: {
        advertiserId: { type: "string", description: "默认取 TIKTOK_ADVERTISER_ID / SANDBOX" },
        page: { type: "number", default: 1 },
        pageSize: { type: "number", default: 20 },
      },
    },
  },
  {
    name: "tiktok_get_campaigns",
    description: "读取 Campaign 列表（campaign/get）。",
    inputSchema: {
      type: "object",
      properties: {
        advertiserId: { type: "string" },
        page: { type: "number", default: 1 },
        pageSize: { type: "number", default: 20 },
        campaignIds: { type: "array", items: { type: "string" } },
      },
    },
  },
  {
    name: "tiktok_get_adgroups",
    description: "读取 Ad Group 列表（adgroup/get）。",
    inputSchema: {
      type: "object",
      properties: {
        advertiserId: { type: "string" },
        page: { type: "number", default: 1 },
        pageSize: { type: "number", default: 20 },
        campaignIds: { type: "array", items: { type: "string" } },
        adgroupIds: { type: "array", items: { type: "string" } },
      },
    },
  },
  {
    name: "tiktok_get_ads",
    description: "读取 Ad 列表（ad/get）。",
    inputSchema: {
      type: "object",
      properties: {
        advertiserId: { type: "string" },
        page: { type: "number", default: 1 },
        pageSize: { type: "number", default: 20 },
        campaignIds: { type: "array", items: { type: "string" } },
        adgroupIds: { type: "array", items: { type: "string" } },
        adIds: { type: "array", items: { type: "string" } },
      },
    },
  },
  {
    name: "tiktok_get_integrated_report",
    description: "拉取整合报表（report/integrated/get），默认最近 7 天 campaign 级 spend。",
    inputSchema: {
      type: "object",
      properties: {
        advertiserId: { type: "string" },
        dataLevel: {
          type: "string",
          enum: ["AUCTION_CAMPAIGN", "AUCTION_ADGROUP", "AUCTION_AD"],
          default: "AUCTION_CAMPAIGN",
        },
        startDate: { type: "string", description: "YYYY-MM-DD" },
        endDate: { type: "string", description: "YYYY-MM-DD" },
        metrics: {
          type: "array",
          items: { type: "string" },
          default: ["spend", "impressions", "clicks", "conversion"],
        },
      },
    },
  },
];

function jsonText(value) {
  return {
    content: [{ type: "text", text: JSON.stringify(value, null, 2) }],
  };
}

function resolveBcId(args) {
  const { bcId } = getDefaultIds();
  const value = (args.bcId ?? bcId ?? "").trim();
  if (!value) {
    throw new Error("缺少 bcId：请在参数传入或设置环境变量 TIKTOK_BC_ID");
  }
  return value;
}

function resolveAdvertiserId(args) {
  const { advertiserId } = getDefaultIds();
  const value = (args.advertiserId ?? advertiserId ?? "").trim();
  if (!value) {
    throw new Error(
      "缺少 advertiserId：请在参数传入或设置 TIKTOK_ADVERTISER_ID / TIKTOK_SANDBOX_ADVERTISER_ID",
    );
  }
  return value;
}

function resolveCatalogId(args) {
  const { catalogId } = getDefaultIds();
  const value = (args.catalogId ?? catalogId ?? "").trim();
  if (!value) {
    throw new Error("缺少 catalogId：请在参数传入或设置环境变量 TIKTOK_CATALOG_ID");
  }
  return value;
}

function formatDate(date) {
  return date.toISOString().slice(0, 10);
}

function defaultDateRange() {
  const end = new Date();
  const start = new Date(end);
  start.setDate(start.getDate() - 7);
  return { startDate: formatDate(start), endDate: formatDate(end) };
}

async function handleTool(name, args) {
  switch (name) {
    case "tiktok_list_advertisers":
      return jsonText(await tiktokGet("/oauth2/advertiser/get/"));
    case "tiktok_list_business_centers":
      return jsonText(
        await tiktokGet("/bc/get/", {
          page: args.page ?? 1,
          page_size: args.pageSize ?? 20,
        }),
      );
    case "tiktok_list_catalogs":
      return jsonText(
        await tiktokGet("/catalog/get/", {
          bc_id: resolveBcId(args),
          page: args.page ?? 1,
          page_size: args.pageSize ?? 20,
        }),
      );
    case "tiktok_get_catalog": {
      const catalogId = resolveCatalogId(args);
      return jsonText(
        await tiktokGet("/catalog/get/", {
          bc_id: resolveBcId(args),
          catalog_id: catalogId,
        }),
      );
    }
    case "tiktok_list_catalog_products":
      return jsonText(
        await tiktokPost("/catalog/product/get/", {
          bc_id: resolveBcId(args),
          catalog_id: resolveCatalogId(args),
          page: args.page ?? 1,
          page_size: args.pageSize ?? 20,
          ...(args.skuIds?.length ? { sku_ids: args.skuIds } : {}),
        }),
      );
    case "tiktok_get_catalog_product_log":
      return jsonText(
        await tiktokGet("/catalog/product/log/", {
          bc_id: resolveBcId(args),
          catalog_id: resolveCatalogId(args),
          page: args.page ?? 1,
          page_size: args.pageSize ?? 20,
        }),
      );
    case "tiktok_get_catalog_eventsource_bind":
      return jsonText(
        await tiktokGet("/catalog/eventsource_bind/get/", {
          bc_id: resolveBcId(args),
          catalog_id: resolveCatalogId(args),
        }),
      );
    case "tiktok_list_pixels":
      return jsonText(
        await tiktokGet("/pixel/list/", {
          advertiser_id: resolveAdvertiserId(args),
          page: args.page ?? 1,
          page_size: args.pageSize ?? 20,
        }),
      );
    case "tiktok_get_campaigns":
      return jsonText(
        await tiktokGet("/campaign/get/", {
          advertiser_id: resolveAdvertiserId(args),
          page: args.page ?? 1,
          page_size: args.pageSize ?? 20,
          ...(args.campaignIds?.length ? { campaign_ids: args.campaignIds } : {}),
        }),
      );
    case "tiktok_get_adgroups":
      return jsonText(
        await tiktokGet("/adgroup/get/", {
          advertiser_id: resolveAdvertiserId(args),
          page: args.page ?? 1,
          page_size: args.pageSize ?? 20,
          ...(args.campaignIds?.length ? { campaign_ids: args.campaignIds } : {}),
          ...(args.adgroupIds?.length ? { adgroup_ids: args.adgroupIds } : {}),
        }),
      );
    case "tiktok_get_ads":
      return jsonText(
        await tiktokGet("/ad/get/", {
          advertiser_id: resolveAdvertiserId(args),
          page: args.page ?? 1,
          page_size: args.pageSize ?? 20,
          ...(args.campaignIds?.length ? { campaign_ids: args.campaignIds } : {}),
          ...(args.adgroupIds?.length ? { adgroup_ids: args.adgroupIds } : {}),
          ...(args.adIds?.length ? { ad_ids: args.adIds } : {}),
        }),
      );
    case "tiktok_get_integrated_report": {
      const range = defaultDateRange();
      const startDate = args.startDate ?? range.startDate;
      const endDate = args.endDate ?? range.endDate;
      const metrics = args.metrics ?? ["spend", "impressions", "clicks", "conversion"];
      return jsonText(
        await tiktokGet("/report/integrated/get/", {
          advertiser_id: resolveAdvertiserId(args),
          report_type: "BASIC",
          data_level: args.dataLevel ?? "AUCTION_CAMPAIGN",
          dimensions: JSON.stringify(["campaign_id"]),
          metrics: JSON.stringify(metrics),
          start_date: startDate,
          end_date: endDate,
          page: 1,
          page_size: 50,
        }),
      );
    }
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

export async function startServer() {
  const server = new Server(
    { name: "spark-tiktok-mcp", version: "1.0.0" },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    try {
      return await handleTool(request.params.name, request.params.arguments ?? {});
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
  console.error("[tiktok-mcp] ready (stdio)");
}
