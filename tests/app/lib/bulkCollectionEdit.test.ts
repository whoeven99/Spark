import { describe, expect, it } from "vitest";
import {
  BulkCollectionEditRuleError,
  buildBulkCollectionEditSummary,
  computeCollectionMembershipChange,
  parseBulkCollectionEditRule,
  pickWritableCollectionSource,
} from "../../../app/lib/bulkCollectionEdit";

describe("parseBulkCollectionEditRule", () => {
  it("解析加入合集", () => {
    expect(
      parseBulkCollectionEditRule({
        collectionAction: "add",
        collectionId: "gid://shopify/Collection/1",
      }),
    ).toEqual({ action: "add", collectionId: "gid://shopify/Collection/1" });
  });

  it("没选方向时报错", () => {
    expect(() =>
      parseBulkCollectionEditRule({ collectionId: "gid://shopify/Collection/1" }),
    ).toThrow(BulkCollectionEditRuleError);
  });

  it("没选合集时报错", () => {
    expect(() => parseBulkCollectionEditRule({ collectionAction: "add" })).toThrow(
      BulkCollectionEditRuleError,
    );
  });
});

describe("computeCollectionMembershipChange", () => {
  const product = {
    productId: "gid://shopify/Product/1",
    productTitle: "背包",
    status: "ACTIVE",
    inCollection: false,
  };

  it("加入未在合集内的商品", () => {
    const row = computeCollectionMembershipChange(product, "add");
    expect(row.skipped).toBe(false);
    expect(row.action).toBe("add");
  });

  it("已在合集内则跳过加入", () => {
    const row = computeCollectionMembershipChange({ ...product, inCollection: true }, "add");
    expect(row.skipReason).toBe("already_in");
  });

  it("不在合集内则跳过移出", () => {
    const row = computeCollectionMembershipChange(product, "remove");
    expect(row.skipReason).toBe("not_in");
  });

  it("汇总加入与移出", () => {
    const rows = [
      computeCollectionMembershipChange(product, "add"),
      computeCollectionMembershipChange({ ...product, productId: "2", inCollection: true }, "add"),
    ];
    expect(buildBulkCollectionEditSummary(rows)).toMatchObject({
      changed: 1,
      skipped: 1,
      added: 1,
      removed: 0,
    });
  });
});

describe("pickWritableCollectionSource", () => {
  it("优先选非共享的 PRODUCTS 条件来源", () => {
    expect(
      pickWritableCollectionSource([
        { id: "gid://shopify/CollectionSubCollectionsSource/1", typename: "CollectionSubCollectionsSource" },
        {
          id: "gid://shopify/CollectionConditionsSource/share",
          typename: "CollectionConditionsSource",
          targetType: "PRODUCTS",
          shareable: true,
        },
        {
          id: "gid://shopify/CollectionConditionsSource/variants",
          typename: "CollectionConditionsSource",
          targetType: "VARIANTS",
          shareable: false,
        },
        {
          id: "gid://shopify/CollectionConditionsSource/ok",
          typename: "CollectionConditionsSource",
          targetType: "PRODUCTS",
          shareable: false,
        },
      ]),
    ).toBe("gid://shopify/CollectionConditionsSource/ok");
  });

  it("只有子合集来源时不可写", () => {
    expect(
      pickWritableCollectionSource([
        { id: "gid://shopify/CollectionSubCollectionsSource/1", typename: "CollectionSubCollectionsSource" },
      ]),
    ).toBeNull();
  });
});
