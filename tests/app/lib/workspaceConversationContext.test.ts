import { describe, expect, it } from "vitest";
import {
  emptyWorkspaceConversationContext,
  isWorkspaceConversationContextEmpty,
  parseWorkspaceConversationContext,
  serializeWorkspaceConversationContext,
} from "../../../app/lib/workspaceConversationContext";

describe("workspaceConversationContext", () => {
  it("round-trips selected products", () => {
    const snapshot = emptyWorkspaceConversationContext();
    snapshot.selectedObjectsByType.product = [
      { id: "gid://shopify/Product/1", title: "Shirt", imageUrl: "https://example.com/a.jpg" },
    ];
    const raw = serializeWorkspaceConversationContext(snapshot);
    const parsed = parseWorkspaceConversationContext(raw);
    expect(parsed?.selectedObjectsByType.product).toEqual(snapshot.selectedObjectsByType.product);
    expect(isWorkspaceConversationContextEmpty(parsed)).toBe(false);
  });

  it("returns null for invalid json", () => {
    expect(parseWorkspaceConversationContext("{")).toBeNull();
    expect(parseWorkspaceConversationContext('{"v":2}')).toBeNull();
    expect(isWorkspaceConversationContextEmpty(null)).toBe(true);
  });
});
