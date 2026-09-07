import { describe, expect, it } from "vitest";
import {
  REFERRAL_INSTALL_COOKIE,
  parseReferralCodeFromCookieHeader,
  readReferralCodeFromRequest,
} from "../../../../../app/server/billing/promo/referralCookie.server";

describe("referralCookie", () => {
  it("从 cookie 读出规范化推荐码", () => {
    expect(
      parseReferralCodeFromCookieHeader(
        `other=1; ${REFERRAL_INSTALL_COOKIE}=spark-hj3htt; session=abc`,
      ),
    ).toBe("SPARK-HJ3HTT");
  });

  it("query 优先于 cookie", () => {
    const request = new Request(
      "https://example.com/app/account?referralCode=kol-sep",
      {
        headers: { cookie: `${REFERRAL_INSTALL_COOKIE}=OTHER-CODE` },
      },
    );
    expect(readReferralCodeFromRequest(request)).toBe("KOL-SEP");
  });

  it("没有 cookie 或 query 时为空", () => {
    expect(parseReferralCodeFromCookieHeader(null)).toBe("");
    expect(readReferralCodeFromRequest(new Request("https://example.com/app"))).toBe(
      "",
    );
  });
});
