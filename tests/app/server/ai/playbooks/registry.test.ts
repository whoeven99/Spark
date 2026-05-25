import { describe, it, expect, vi, beforeEach } from "vitest";
import { PlaybookRegistry } from "../../../../../app/server/ai/core/playbookRegistry.server";
import type {
  PlaybookDefinition,
  PlaybookRunParams,
} from "../../../../../app/server/ai/core/playbookRegistry.server";

// mock LLM 避免真实 API 调用（必须在顶层，vitest 会提升）
vi.mock("../../../../../app/server/ai/core/shopChatGraph.server", () => ({
  getShopChatModel: () => ({
    invoke: vi.fn().mockResolvedValue({ content: "健康报告：店铺运营正常。" }),
  }),
}));

// ──────────────────────────────────────────────
// helpers
// ──────────────────────────────────────────────

function mockContext() {
  return {
    admin: { graphql: vi.fn() },
    shop: "test-shop.myshopify.com",
  } as unknown as PlaybookRunParams["context"];
}

function makePlaybook(overrides: Partial<PlaybookDefinition> = {}): PlaybookDefinition {
  return {
    name: "testPlaybook",
    displayName: "测试 Playbook",
    description: "用于单元测试的 Playbook",
    category: "operations",
    triggerDescription: "当用户要测试时触发",
    steps: ["步骤1", "步骤2"],
    run: vi.fn().mockResolvedValue({
      ok: true,
      summary: "测试完成",
      steps: [
        { step: "步骤1", status: "completed", output: "ok" },
        { step: "步骤2", status: "completed", output: "ok" },
      ],
    }),
    ...overrides,
  };
}

// ──────────────────────────────────────────────
// PlaybookRegistry
// ──────────────────────────────────────────────

describe("PlaybookRegistry", () => {
  let registry: PlaybookRegistry;

  beforeEach(() => {
    // 每个测试用独立的 registry 实例，不污染 globalPlaybookRegistry
    registry = new PlaybookRegistry();
  });

  it("registers a playbook and retrieves it", () => {
    registry.register(makePlaybook());
    expect(registry.getRegistered()).toHaveLength(1);
    expect(registry.getRegistered()[0].name).toBe("testPlaybook");
  });

  it("getActiveDefinitions returns all when no condition", async () => {
    registry.register(makePlaybook({ name: "a" }));
    registry.register(makePlaybook({ name: "b" }));
    const ctx = mockContext();
    const active = await registry.getActiveDefinitions(ctx);
    expect(active).toHaveLength(2);
  });

  it("getActiveDefinitions filters by condition", async () => {
    registry.register(makePlaybook({ name: "enabled", condition: () => true }));
    registry.register(makePlaybook({ name: "disabled", condition: () => false }));
    const ctx = mockContext();
    const active = await registry.getActiveDefinitions(ctx);
    expect(active).toHaveLength(1);
    expect(active[0].name).toBe("enabled");
  });

  it("getPlaybookTools creates DynamicStructuredTool with correct name", async () => {
    registry.register(makePlaybook({ name: "myPlaybook" }));
    const ctx = mockContext();
    const tools = await registry.getPlaybookTools(ctx);
    expect(tools).toHaveLength(1);
    expect(tools[0].name).toBe("run_playbook_myPlaybook");
  });

  it("playbook tool func calls def.run and returns JSON", async () => {
    const def = makePlaybook({ name: "runTest" });
    registry.register(def);
    const ctx = mockContext();
    const [tool] = await registry.getPlaybookTools(ctx);
    const result = await tool.invoke({ goal: "测试目标", constraints: "无" });
    expect(def.run).toHaveBeenCalledWith(
      expect.objectContaining({ goal: "测试目标", constraints: "无" })
    );
    const parsed = JSON.parse(result as string);
    expect(parsed.ok).toBe(true);
    expect(parsed.summary).toBe("测试完成");
  });

  it("playbook tool returns error JSON when run throws", async () => {
    const def = makePlaybook({
      name: "errorTest",
      run: vi.fn().mockRejectedValue(new Error("模拟失败")),
    });
    registry.register(def);
    const ctx = mockContext();
    const [tool] = await registry.getPlaybookTools(ctx);
    const result = await tool.invoke({ goal: "test" });
    const parsed = JSON.parse(result as string);
    expect(parsed.ok).toBe(false);
    expect(parsed.summary).toContain("模拟失败");
  });
});

// ──────────────────────────────────────────────
// shopHealthCheck run（mock Shopify API）
// ──────────────────────────────────────────────

describe("shopHealthCheck playbook run", () => {
  it("returns ok:true with mocked Shopify data", async () => {
    const { shopHealthCheckPlaybook } = await import(
      "../../../../../app/server/ai/playbooks/shopHealthCheck/index"
    );

    const mockGraphql = vi.fn();
    // 第一次调用：SHOP_INFO_QUERY
    mockGraphql.mockResolvedValueOnce({
      json: () => ({
        data: {
          shop: { name: "Test Shop", currencyCode: "USD", primaryDomain: { url: "https://test.myshopify.com" } },
          orders: {
            nodes: [
              {
                totalPriceSet: { shopMoney: { amount: "100.00", currencyCode: "USD" } },
                refunds: [],
                cancelledAt: null,
                createdAt: new Date().toISOString(),
              },
            ],
          },
          productsCount: { count: 42 },
          collections: { nodes: [] },
        },
      }),
    });
    // 第二次调用：INVENTORY_QUERY
    mockGraphql.mockResolvedValueOnce({
      json: () => ({
        data: {
          productVariants: {
            nodes: [
              { inventoryQuantity: 10, product: { title: "商品A", status: "ACTIVE" } },
              { inventoryQuantity: 0, product: { title: "商品B", status: "ACTIVE" } },
            ],
          },
        },
      }),
    });

    const ctx = {
      admin: { graphql: mockGraphql },
      shop: "test-shop.myshopify.com",
    } as unknown as PlaybookRunParams["context"];

    const result = await shopHealthCheckPlaybook.run({ goal: "经营体检", context: ctx });

    expect(result.ok).toBe(true);
    expect(result.steps).toHaveLength(3);
    expect(result.steps[0].status).toBe("completed");
    expect(result.steps[1].status).toBe("completed");
    expect(result.summary).toBeTruthy();
  });
});

// ──────────────────────────────────────────────
// productLaunchPipeline run（无 ID 时返回通用清单）
// ──────────────────────────────────────────────

describe("productLaunchPipeline playbook run", () => {
  it("returns generic checklist when no product ID in goal", async () => {
    const { productLaunchPipelinePlaybook } = await import(
      "../../../../../app/server/ai/playbooks/productLaunchPipeline/index"
    );

    const ctx = mockContext();
    const result = await productLaunchPipelinePlaybook.run({
      goal: "我想上架新商品，请帮我准备",
      context: ctx,
    });

    expect(result.ok).toBe(true);
    expect(result.summary).toContain("上新流水线通用清单");
    expect(result.steps[0].status).toBe("skipped");
  });

  it("fetches product and checks completeness when ID provided", async () => {
    const { productLaunchPipelinePlaybook } = await import(
      "../../../../../app/server/ai/playbooks/productLaunchPipeline/index"
    );

    const mockGraphql = vi.fn().mockResolvedValue({
      json: () => ({
        data: {
          product: {
            id: "gid://shopify/Product/123456789",
            title: "测试商品",
            status: "DRAFT",
            description: "这是一个测试商品描述，足够长的内容用于测试。",
            descriptionHtml: "<p>描述</p>",
            images: { nodes: [{ url: "https://cdn.shopify.com/img.jpg", altText: "" }] },
            variants: {
              nodes: [{ title: "默认", price: "99.00", inventoryQuantity: 5, sku: "SKU001" }],
            },
            metafields: { nodes: [] },
            tags: ["新品", "测试"],
            productType: "服装",
            vendor: "TestVendor",
          },
        },
      }),
    });

    const ctx = {
      admin: { graphql: mockGraphql },
      shop: "test-shop.myshopify.com",
    } as unknown as PlaybookRunParams["context"];

    const result = await productLaunchPipelinePlaybook.run({
      goal: "上架商品 gid://shopify/Product/123456789",
      context: ctx,
    });

    expect(result.ok).toBe(true);
    expect(result.steps).toHaveLength(4);
    expect(result.data?.productTitle).toBe("测试商品");
    expect((result.data?.completenessCheck as { score: number }).score).toBeGreaterThan(0);
  });
});
