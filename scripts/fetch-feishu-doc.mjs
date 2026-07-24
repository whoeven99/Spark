/**
 * fetch-feishu-doc.mjs
 *
 * 从飞书 Wiki/DocX 链接读取正文内容（通过飞书开放平台 OpenAPI）。
 *
 * 使用方式：
 *   node scripts/fetch-feishu-doc.mjs "<飞书链接或token>"
 *   node scripts/fetch-feishu-doc.mjs "<飞书链接或token>" --out ./tmp/feishu.md
 *
 * 需要环境变量（可放在仓库根目录 .env）：
 *   FEISHU_APP_ID=cli_xxx
 *   FEISHU_APP_SECRET=xxx
 *
 * 说明：
 *   1) 该脚本默认按「内部应用」方式获取 tenant_access_token。
 *   2) 链接可为：
 *      - https://{tenant}.feishu.cn/wiki/{wiki_token}
 *      - https://{tenant}.feishu.cn/docx/{docx_token}
 *      - 直接传 token（默认按 wiki token 处理）。
 */

import { readFile } from "node:fs/promises";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const FEISHU_BASE_URL = "https://open.feishu.cn";

function printUsageAndExit(message, code = 1) {
  if (message) {
    console.error(message);
  }
  console.error(
    [
      "",
      "Usage:",
      '  node scripts/fetch-feishu-doc.mjs "<feishu_url_or_token>" [--out <output_path>]',
      "",
      "Examples:",
      '  node scripts/fetch-feishu-doc.mjs "https://iw73s3ld6wy.feishu.cn/wiki/XwYjwTArnigp3dkySCCc8LvZnfv"',
      '  node scripts/fetch-feishu-doc.mjs "XwYjwTArnigp3dkySCCc8LvZnfv" --out ./tmp/seo-playbook.md',
    ].join("\n"),
  );
  process.exit(code);
}

async function tryLoadDotEnv() {
  const envPath = resolve(process.cwd(), ".env");
  try {
    const content = await readFile(envPath, "utf8");
    const lines = content.split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const idx = trimmed.indexOf("=");
      if (idx <= 0) continue;
      const key = trimmed.slice(0, idx).trim();
      if (!/^[A-Z_][A-Z0-9_]*$/.test(key)) continue;
      if (process.env[key]) continue;
      let value = trimmed.slice(idx + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      process.env[key] = value;
    }
  } catch {
    // ignore: no .env file
  }
}

function parseArgs(argv) {
  if (argv.length === 0) {
    printUsageAndExit("缺少参数：请提供飞书链接或 token。");
  }

  const target = argv[0];
  let outPath = "";

  for (let i = 1; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--out") {
      outPath = argv[i + 1] ?? "";
      i += 1;
      continue;
    }
    printUsageAndExit(`未知参数：${arg}`);
  }

  return { target, outPath };
}

function parseFeishuTarget(rawTarget) {
  const target = rawTarget.trim();
  if (!target) {
    throw new Error("目标链接/token 不能为空。");
  }

  // URL 模式
  if (target.startsWith("http://") || target.startsWith("https://")) {
    let url;
    try {
      url = new URL(target);
    } catch {
      throw new Error(`无效 URL：${target}`);
    }
    const parts = url.pathname.split("/").filter(Boolean);
    if (parts.length >= 2 && parts[0] === "wiki") {
      return { kind: "wiki", token: parts[1] };
    }
    if (parts.length >= 2 && parts[0] === "docx") {
      return { kind: "docx", token: parts[1] };
    }
    throw new Error(
      `暂不支持该飞书 URL 路径：${url.pathname}。目前支持 /wiki/{token} 与 /docx/{token}`,
    );
  }

  // token 模式，默认按 wiki token 处理
  return { kind: "wiki", token: target };
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  let body = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`响应不是 JSON，status=${response.status}，body=${text.slice(0, 300)}`);
  }
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${JSON.stringify(body)}`);
  }
  return body;
}

async function getTenantAccessToken(appId, appSecret) {
  const url = `${FEISHU_BASE_URL}/open-apis/auth/v3/tenant_access_token/internal`;
  const body = await requestJson(url, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({
      app_id: appId,
      app_secret: appSecret,
    }),
  });

  if (body.code !== 0 || !body.tenant_access_token) {
    throw new Error(`获取 tenant_access_token 失败：${JSON.stringify(body)}`);
  }
  return body.tenant_access_token;
}

async function feishuGet(pathWithQuery, token) {
  const url = `${FEISHU_BASE_URL}${pathWithQuery}`;
  return requestJson(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}

async function resolveWikiToObject(wikiToken, accessToken) {
  const path = `/open-apis/wiki/v2/spaces/get_node?token=${encodeURIComponent(wikiToken)}`;
  const body = await feishuGet(path, accessToken);
  if (body.code !== 0) {
    throw new Error(`读取 wiki 节点失败：${JSON.stringify(body)}`);
  }
  const node = body.data?.node;
  if (!node?.obj_token || !node?.obj_type) {
    throw new Error(`wiki 节点返回缺少 obj_token/obj_type：${JSON.stringify(body)}`);
  }
  return {
    title: node.title ?? "",
    objType: node.obj_type,
    objToken: node.obj_token,
  };
}

async function readDocxRawContent(docxToken, accessToken) {
  const path = `/open-apis/docx/v1/documents/${encodeURIComponent(docxToken)}/raw_content`;
  const body = await feishuGet(path, accessToken);
  if (body.code !== 0) {
    throw new Error(`读取 docx 正文失败：${JSON.stringify(body)}`);
  }
  const content = body.data?.content ?? "";
  if (!content) {
    return "";
  }
  return content;
}

function buildResultMarkdown(meta, content) {
  const lines = [
    `# ${meta.title || "Untitled Feishu Document"}`,
    "",
    `- source: ${meta.source}`,
    `- type: ${meta.objType}`,
    `- token: ${meta.objToken}`,
    "",
    "---",
    "",
    content || "(文档正文为空)",
    "",
  ];
  return lines.join("\n");
}

async function main() {
  await tryLoadDotEnv();

  const { target, outPath } = parseArgs(process.argv.slice(2));
  const parsed = parseFeishuTarget(target);

  const appId = (process.env.FEISHU_APP_ID ?? "").trim();
  const appSecret = (process.env.FEISHU_APP_SECRET ?? "").trim();
  if (!appId || !appSecret) {
    throw new Error("缺少 FEISHU_APP_ID / FEISHU_APP_SECRET，请先在环境变量或 .env 中配置。");
  }

  const accessToken = await getTenantAccessToken(appId, appSecret);

  let objType = "";
  let objToken = "";
  let title = "";
  if (parsed.kind === "wiki") {
    const resolved = await resolveWikiToObject(parsed.token, accessToken);
    objType = resolved.objType;
    objToken = resolved.objToken;
    title = resolved.title;
  } else {
    objType = "docx";
    objToken = parsed.token;
  }

  if (objType !== "docx") {
    throw new Error(
      `当前对象类型为 ${objType}，脚本目前仅支持读取 docx 正文。可先把该页面转为文档后再读取。`,
    );
  }

  const content = await readDocxRawContent(objToken, accessToken);
  const markdown = buildResultMarkdown(
    {
      source: target,
      objType,
      objToken,
      title,
    },
    content,
  );

  if (outPath) {
    const absPath = resolve(process.cwd(), outPath);
    await writeFile(absPath, markdown, "utf8");
    console.log(`已写入：${absPath}`);
    return;
  }

  console.log(markdown);
}

main().catch((error) => {
  console.error(`[fetch-feishu-doc] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
