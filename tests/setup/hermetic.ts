/**
 * 单测统一隔离：禁止真实出站请求。
 *
 * 背景：不少 server 模块在 import 或执行时会打真实 HTTP（广告平台、Cosmos、Blob、SLS）。
 * 以前这些请求在并行跑时会撞 5s 默认超时，表现为「随机某个文件红」。这里把 global fetch
 * 换成会立刻抛错的实现，让漏 mock 变成确定性的、带文件名提示的失败。
 *
 * 需要 fetch 的测试有两种正规写法：
 *   1. 通过被测函数的 deps/fetchImpl 注入（首选）；
 *   2. vi.stubGlobal("fetch", impl)，并在结束时 vi.unstubAllGlobals()。
 */
const blockedFetch: typeof fetch = (input) => {
  const target =
    typeof input === "string" || input instanceof URL ? String(input) : input.url;
  return Promise.reject(
    new Error(
      `[tests] 拦截到真实网络请求：${target}。` +
        `请注入 fetchImpl，或用 vi.stubGlobal("fetch", impl) 显式 mock。`,
    ),
  );
};

globalThis.fetch = blockedFetch;
