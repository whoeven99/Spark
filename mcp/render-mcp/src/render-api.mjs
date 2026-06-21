const RENDER_API = "https://api.render.com/v1";

export function requireApiKey() {
  const key = process.env.RENDER_API_KEY?.trim();
  if (!key) {
    throw new Error(
      "缺少 RENDER_API_KEY。请在 Render Dashboard → Account Settings → API Keys 创建，并写入环境变量。",
    );
  }
  return key;
}

export async function renderFetch(apiKey, path, query = {}, init = {}) {
  const url = new URL(`${RENDER_API}${path}`);
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined || v === null) continue;
    if (Array.isArray(v)) {
      for (const item of v) url.searchParams.append(k, item);
    } else {
      url.searchParams.set(k, String(v));
    }
  }

  const res = await fetch(url, {
    ...init,
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${apiKey}`,
      ...(init.headers ?? {}),
    },
  });

  const text = await res.text();
  let body;
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { raw: text };
  }

  if (!res.ok) {
    throw new Error(
      `Render API ${path} HTTP ${res.status}: ${JSON.stringify(body).slice(0, 800)}`,
    );
  }
  return body;
}

export function unwrapList(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.items)) return data.items;
  if (Array.isArray(data?.logs)) return data.logs;
  return data;
}

export async function listOwners(apiKey) {
  const data = await renderFetch(apiKey, "/owners", { limit: 100 });
  return unwrapList(data);
}

export async function listServices(apiKey, includePreviews = false) {
  const data = await renderFetch(apiKey, "/services", {
    limit: 100,
    includePreviews: includePreviews ? "true" : "false",
  });
  return unwrapList(data);
}

export async function getService(apiKey, serviceId) {
  return renderFetch(apiKey, `/services/${serviceId}`);
}

export async function listDeploys(apiKey, serviceId, { cursor = "", limit = 10 } = {}) {
  const query = { limit };
  if (cursor) query.cursor = cursor;
  const data = await renderFetch(apiKey, `/services/${serviceId}/deploys`, query);
  return data;
}

export async function getDeploy(apiKey, serviceId, deployId) {
  return renderFetch(apiKey, `/services/${serviceId}/deploys/${deployId}`);
}

/**
 * Render logs API — requires ownerId + resource[].
 * @see https://api-docs.render.com/reference/list-logs
 */
export async function listLogs(apiKey, ownerId, params) {
  const query = {
    ownerId,
    direction: params.direction ?? "backward",
    limit: params.limit ?? 50,
  };
  if (params.startTime) query.startTime = params.startTime;
  if (params.endTime) query.endTime = params.endTime;
  for (const key of ["resource", "type", "text", "level", "instance", "host", "path", "method", "statusCode"]) {
    const val = params[key];
    if (val === undefined || val === null) continue;
    query[key] = val;
  }
  const data = await renderFetch(apiKey, "/logs", query);
  return data;
}

export async function getMetrics(apiKey, resourceId, params) {
  const query = {
    resourceId,
    metricTypes: params.metricTypes,
  };
  if (params.startTime) query.startTime = params.startTime;
  if (params.endTime) query.endTime = params.endTime;
  if (params.resolution) query.resolution = params.resolution;
  if (params.cpuUsageAggregationMethod) {
    query.cpuUsageAggregationMethod = params.cpuUsageAggregationMethod;
  }
  if (params.aggregateHttpRequestCountsBy) {
    query.aggregateHttpRequestCountsBy = params.aggregateHttpRequestCountsBy;
  }
  if (params.httpLatencyQuantile !== undefined) {
    query.httpLatencyQuantile = params.httpLatencyQuantile;
  }
  if (params.httpHost) query.httpHost = params.httpHost;
  if (params.httpPath) query.httpPath = params.httpPath;
  return renderFetch(apiKey, "/metrics", query);
}
