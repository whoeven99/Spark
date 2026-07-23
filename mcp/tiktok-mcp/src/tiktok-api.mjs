const API_BASE = "https://business-api.tiktok.com/open_api/v1.3";

function readEnv(name) {
  return (process.env[name] ?? "").trim();
}

export function getAccessToken() {
  return (
    readEnv("TIKTOK_ACCESS_TOKEN") ||
    readEnv("TIKTOK_SANDBOX_ACCESS_TOKEN")
  );
}

export function requireAccessToken() {
  const token = getAccessToken();
  if (!token) {
    throw new Error(
      "缺少 TikTok access token：请设置 TIKTOK_ACCESS_TOKEN 或 TIKTOK_SANDBOX_ACCESS_TOKEN",
    );
  }
  return token;
}

export function getDefaultIds() {
  return {
    bcId: readEnv("TIKTOK_BC_ID"),
    advertiserId:
      readEnv("TIKTOK_ADVERTISER_ID") || readEnv("TIKTOK_SANDBOX_ADVERTISER_ID"),
    catalogId: readEnv("TIKTOK_CATALOG_ID"),
  };
}

async function parseJsonResponse(resp) {
  const text = await resp.text();
  let body;
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`TikTok API 返回非 JSON（HTTP ${resp.status}）：${text.slice(0, 500)}`);
  }
  if (!resp.ok) {
    throw new Error(`TikTok API HTTP ${resp.status}: ${JSON.stringify(body)}`);
  }
  if (body.code !== undefined && body.code !== 0) {
    throw new Error(
      `TikTok API 错误 code=${body.code} message=${body.message ?? "unknown"}`,
    );
  }
  return body;
}

export async function tiktokGet(path, query = {}) {
  const accessToken = requireAccessToken();
  const url = new URL(`${API_BASE}${path}`);
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === "") continue;
    if (Array.isArray(value)) {
      url.searchParams.set(key, JSON.stringify(value));
    } else {
      url.searchParams.set(key, String(value));
    }
  }
  const resp = await fetch(url, {
    method: "GET",
    headers: {
      "Access-Token": accessToken,
      "Content-Type": "application/json",
    },
  });
  return parseJsonResponse(resp);
}

export async function tiktokPost(path, body = {}) {
  const accessToken = requireAccessToken();
  const resp = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: {
      "Access-Token": accessToken,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  return parseJsonResponse(resp);
}
