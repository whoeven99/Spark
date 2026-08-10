import { describe, expect, it } from "vitest";
import { hashMetaEmail } from "../../../../app/server/adsCatalog/clients/metaConversionsApiClient.server";

describe("hashMetaEmail", () => {
  it("normalizes and hashes email", () => {
    const a = hashMetaEmail("Buyer@Example.COM");
    const b = hashMetaEmail("  buyer@example.com  ");
    expect(a).toBe(b);
    expect(a).toMatch(/^[a-f0-9]{64}$/);
  });
});
