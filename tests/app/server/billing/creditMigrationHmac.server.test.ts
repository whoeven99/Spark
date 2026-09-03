import { describe, expect, it } from "vitest";
import {
  signCreditMigrationBody,
  verifyCreditMigrationHmac,
} from "../../../../app/server/billing/creditMigrationHmac.server";

describe("creditMigrationHmac", () => {
  const secret = "test-secret";
  const body = '{"action":"grant","shop":"demo.myshopify.com","amount":1000,"transferId":"mig_1"}';

  it("accepts a matching signature within skew", () => {
    const timestamp = String(Date.now());
    const signature = signCreditMigrationBody(secret, timestamp, body);
    expect(
      verifyCreditMigrationHmac({
        secret,
        timestamp,
        signature,
        rawBody: body,
      }),
    ).toBe(true);
  });

  it("rejects a tampered body", () => {
    const timestamp = String(Date.now());
    const signature = signCreditMigrationBody(secret, timestamp, body);
    expect(
      verifyCreditMigrationHmac({
        secret,
        timestamp,
        signature,
        rawBody: body.replace("1000", "2000"),
      }),
    ).toBe(false);
  });

  it("rejects an expired timestamp", () => {
    const timestamp = String(Date.now() - 10 * 60 * 1000);
    const signature = signCreditMigrationBody(secret, timestamp, body);
    expect(
      verifyCreditMigrationHmac({
        secret,
        timestamp,
        signature,
        rawBody: body,
      }),
    ).toBe(false);
  });
});
