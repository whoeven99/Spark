import { describe, expect, it } from "vitest";
import { shouldKeepExistingTaskProposal } from "../../../app/lib/chatTaskProposalGuard";
import { buildBulkPriceEditProposal } from "../../../app/lib/taskProposalPayload";
import { buildBatchProductImproveProposal } from "../../../app/lib/taskProposalPayload";
import { buildProductExportProposal } from "../../../app/lib/productManageTaskProposals";

const products = [{ id: "gid://shopify/Product/1", title: "浮垫" }];

describe("shouldKeepExistingTaskProposal", () => {
  it("keeps a bulk price card when a copy card arrives later", () => {
    const price = buildBulkPriceEditProposal({ products, priceMode: "percent_up", priceValue: "10" });
    const copy = buildBatchProductImproveProposal({ products });
    expect(shouldKeepExistingTaskProposal(price, copy)).toBe(true);
  });

  it("allows replacing an empty slot", () => {
    const copy = buildBatchProductImproveProposal({ products });
    expect(shouldKeepExistingTaskProposal(null, copy)).toBe(false);
  });

  it("allows updating the same skill", () => {
    const first = buildBulkPriceEditProposal({ products, priceMode: "percent_up", priceValue: "10" });
    const second = buildBulkPriceEditProposal({ products, priceMode: "percent_up", priceValue: "15" });
    expect(shouldKeepExistingTaskProposal(first, second)).toBe(false);
  });

  it("allows a price card to replace a copy card", () => {
    const copy = buildBatchProductImproveProposal({ products });
    const price = buildBulkPriceEditProposal({ products, priceMode: "percent_up", priceValue: "10" });
    expect(shouldKeepExistingTaskProposal(copy, price)).toBe(false);
  });

  it("keeps an export card when a copy card arrives later", () => {
    const exported = buildProductExportProposal({ products });
    const copy = buildBatchProductImproveProposal({ products });
    expect(shouldKeepExistingTaskProposal(exported, copy)).toBe(true);
  });
});
