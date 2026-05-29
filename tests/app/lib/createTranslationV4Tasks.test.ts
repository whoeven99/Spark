import { describe, expect, it, vi } from "vitest";
import { createTranslationV4Tasks } from "../../../app/lib/createTranslationV4Tasks";

const options = [
  { value: "fr", label: "French" },
  { value: "ja", label: "Japanese" },
];

function mockFetch(
  handler: (url: string, init?: RequestInit) => Response | Promise<Response>,
) {
  return vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    return Promise.resolve(handler(url, init));
  }) as typeof fetch;
}

describe("createTranslationV4Tasks", () => {
  it("returns validation error without calling fetch when no targets", async () => {
    const fetchFn = mockFetch(() => new Response("{}"));
    const result = await createTranslationV4Tasks({
      search: "",
      source: "en",
      targets: [],
      modules: ["PRODUCT"],
      limitPerType: 20,
      fetchFn,
      targetOptions: options,
    });
    expect(result.validationError).toBe("validationTargetRequired");
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("creates one job per target on full success", async () => {
    let call = 0;
    const fetchFn = mockFetch((_url, init) => {
      const body = JSON.parse(String(init?.body)) as { target: string };
      call += 1;
      return new Response(
        JSON.stringify({ ok: true, jobId: `job-${body.target}` }),
        { status: 200 },
      );
    });
    const result = await createTranslationV4Tasks({
      search: "?shop=test",
      source: "en",
      targets: ["fr", "ja"],
      modules: ["PRODUCT"],
      limitPerType: 20,
      fetchFn,
      targetOptions: options,
    });
    expect(call).toBe(2);
    expect(result.created).toEqual([
      { target: "fr", jobId: "job-fr" },
      { target: "ja", jobId: "job-ja" },
    ]);
    expect(result.failed).toEqual([]);
  });

  it("reports partial failures", async () => {
    const fetchFn = mockFetch((_url, init) => {
      const body = JSON.parse(String(init?.body)) as { target: string };
      if (body.target === "ja") {
        return new Response(JSON.stringify({ ok: false, error: "quota" }), {
          status: 400,
        });
      }
      return new Response(JSON.stringify({ ok: true, jobId: "job-fr" }), {
        status: 200,
      });
    });
    const result = await createTranslationV4Tasks({
      search: "",
      source: "en",
      targets: ["fr", "ja"],
      modules: ["PRODUCT"],
      limitPerType: 20,
      fetchFn,
      targetOptions: options,
    });
    expect(result.created).toEqual([{ target: "fr", jobId: "job-fr" }]);
    expect(result.failed).toEqual([{ target: "ja", error: "quota" }]);
  });
});
