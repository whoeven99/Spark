import { describe, expect, it } from "vitest";
import { SHOP_OPERATIONS_SYSTEM_PROMPT_EXTENSION } from "../../../../../../app/server/ai/skills/dailyOperations/shopOperations.prompt";

describe("SHOP_OPERATIONS_SYSTEM_PROMPT_EXTENSION", () => {
  it("includes structured skeleton and three recommend examples", () => {
    expect(SHOP_OPERATIONS_SYSTEM_PROMPT_EXTENSION).toContain("response_skeleton");
    expect(SHOP_OPERATIONS_SYSTEM_PROMPT_EXTENSION).toContain('name="today_overview"');
    expect(SHOP_OPERATIONS_SYSTEM_PROMPT_EXTENSION).toContain('name="inventory_health"');
    expect(SHOP_OPERATIONS_SYSTEM_PROMPT_EXTENSION).toContain('name="abandon_refund"');
    expect(SHOP_OPERATIONS_SYSTEM_PROMPT_EXTENSION).toContain("下一步");
  });
});
