import { describe, expect, it } from "vitest";
import { parseAppEmbedEnabled } from "../../../../app/server/adsCatalog/appEmbedStatus.server";

const HANDLE = "google-remarketing-embed";

function settings(blocks: Record<string, unknown>): string {
  return JSON.stringify({ current: { blocks } });
}

describe("parseAppEmbedEnabled", () => {
  it("检测到启用（disabled 缺省）的目标 App Embed", () => {
    const json = settings({
      "uuid-1": {
        type: `shopify://apps/spark/blocks/${HANDLE}/1234`,
      },
    });
    expect(parseAppEmbedEnabled(json, HANDLE)).toBe(true);
  });

  it("disabled=true 视为未启用", () => {
    const json = settings({
      "uuid-1": {
        type: `shopify://apps/spark/blocks/${HANDLE}/1234`,
        disabled: true,
      },
    });
    expect(parseAppEmbedEnabled(json, HANDLE)).toBe(false);
  });

  it("不存在目标区块时未启用", () => {
    const json = settings({
      "uuid-1": { type: "shopify://apps/spark/blocks/other-embed/1234" },
    });
    expect(parseAppEmbedEnabled(json, HANDLE)).toBe(false);
  });

  it("兼容 current 为具名 preset 时的深层扫描", () => {
    const json = JSON.stringify({
      current: "Default",
      presets: {
        Default: {
          blocks: {
            "uuid-1": { type: `shopify://apps/spark/blocks/${HANDLE}/1` },
          },
        },
      },
    });
    expect(parseAppEmbedEnabled(json, HANDLE)).toBe(true);
  });

  it("非法 JSON 安全返回 false", () => {
    expect(parseAppEmbedEnabled("{not json", HANDLE)).toBe(false);
  });
});
