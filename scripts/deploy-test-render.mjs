/**
 * deploy-test-render.mjs
 *
 * 一键：git commit → push → 触发 Render 测试环境部署（仅 test 服务，不碰 prod）。
 *
 * 用法：
 *   node scripts/deploy-test-render.mjs spark -m "fix: xxx"
 *   node scripts/deploy-test-render.mjs admin worker -m "feat: yyy"
 *   node scripts/deploy-test-render.mjs --all -m "chore: deploy"
 *   node scripts/deploy-test-render.mjs spark --deploy-only   # 跳过 commit/push，仅部署
 *   node scripts/deploy-test-render.mjs spark --no-wait         # 触发后不等待结果
 *   node scripts/deploy-test-render.mjs spark --dry-run
 *
 * 环境变量（可放在仓库根目录 .env）：
 *   RENDER_API_KEY — Render API Key
 *
 * 允许的服务别名（均为测试环境）：
 *   spark  → Agent-Spark-Test        (srv-d7j6ogaqqhas739in900)
 *   admin  → Admin Test                (srv-d8p9g9rsq97s73fr1b1g)
 *   worker → Spark Translation Worker Test (srv-d88p1fmq1p3s73f5trv0)
 */

import { execFileSync, spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const RENDER_API = "https://api.render.com/v1";

/** 仅允许触发的 Render 测试服务（白名单） */
const TEST_SERVICES = {
  spark: {
    id: "srv-d7j6ogaqqhas739in900",
    label: "Spark Test (Agent-Spark-Test)",
    url: "https://aiassistant-wi7b.onrender.com",
  },
  admin: {
    id: "srv-d8p9g9rsq97s73fr1b1g",
    label: "Admin Test",
    url: "https://spark-admin-test-dashboard.onrender.com",
  },
  worker: {
    id: "srv-d88p1fmq1p3s73f5trv0",
    label: "Spark Translation Worker Test",
    url: null,
  },
};

/** 明确禁止的 prod 服务 ID（二次校验，防止误配） */
const BLOCKED_SERVICE_IDS = new Set([
  "srv-d8a49ortqb8s7392ed4g", // Admin (prod)
  "srv-d8sqas4vikkc73f5nbog", // Spark Translation Worker (prod)
  "srv-d88llfml51nc73fksm2g", // Product Improve Prod
  "srv-d41d5tur433s73dspvmg", // TranslateImageProd
  "srv-d10oncje5dus73ahrtqg", // DescriptionFDProd
  "srv-d5tgbkcr85hc73f7s48g", // BundleProd
  "srv-csp2931u0jms738sfmc0", // TsFrontend Prod
]);

function printUsageAndExit(message, code = 1) {
  if (message) console.error(message);
  console.error(
    [
      "",
      "Usage:",
      "  node scripts/deploy-test-render.mjs <service...> [options]",
      "",
      "Services (test only):",
      "  spark   Spark 主应用测试环境",
      "  admin   Admin 测试环境",
      "  worker  翻译 Worker 测试环境",
      "  --all   部署以上三个测试服务",
      "",
      "Options:",
      "  -m, --message <text>   commit message（未设则自动生成）",
      "  --deploy-only          跳过 git commit / push，仅用当前 HEAD 部署",
      "  --no-commit            同 --deploy-only",
      "  --no-push              commit 但不 push（随后无法按 commitId 部署远端）",
      "  --no-wait              触发 Render 部署后不等待完成",
      "  --dry-run              只打印将执行的操作",
      "  -h, --help             显示帮助",
      "",
      "Examples:",
      '  node scripts/deploy-test-render.mjs spark -m "fix: worker tsf db"',
      "  node scripts/deploy-test-render.mjs admin worker --all",
      "  npm run deploy:test -- spark -m \"chore: test deploy\"",
    ].join("\n"),
  );
  process.exit(code);
}

async function tryLoadDotEnv() {
  const envPath = resolve(process.cwd(), ".env");
  try {
    const content = await readFile(envPath, "utf8");
    for (const line of content.split(/\r?\n/)) {
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
    // ignore: no .env
  }
}

function parseArgs(argv) {
  const services = [];
  let message = "";
  let deployOnly = false;
  let noPush = false;
  let noWait = false;
  let dryRun = false;
  let all = false;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    switch (arg) {
      case "-h":
      case "--help":
        printUsageAndExit("", 0);
        break;
      case "--all":
        all = true;
        break;
      case "--deploy-only":
      case "--no-commit":
        deployOnly = true;
        break;
      case "--no-push":
        noPush = true;
        break;
      case "--no-wait":
        noWait = true;
        break;
      case "--dry-run":
        dryRun = true;
        break;
      case "-m":
      case "--message": {
        const next = argv[i + 1];
        if (!next) printUsageAndExit("缺少 --message 参数值");
        message = next;
        i += 1;
        break;
      }
      default:
        if (arg.startsWith("-")) {
          printUsageAndExit(`未知参数: ${arg}`);
        }
        services.push(arg.toLowerCase());
    }
  }

  if (all) {
    for (const key of Object.keys(TEST_SERVICES)) {
      if (!services.includes(key)) services.push(key);
    }
  }

  const unique = [...new Set(services)];
  if (unique.length === 0) {
    printUsageAndExit("请指定至少一个服务: spark | admin | worker | --all");
  }

  for (const name of unique) {
    if (!TEST_SERVICES[name]) {
      printUsageAndExit(`未知服务 "${name}"。仅支持: ${Object.keys(TEST_SERVICES).join(", ")}`);
    }
  }

  return { services: unique, message, deployOnly, noPush, noWait, dryRun };
}

function runGit(args, { dryRun = false, allowEmpty = false } = {}) {
  const cmd = ["git", ...args].join(" ");
  if (dryRun) {
    console.log(`[dry-run] ${cmd}`);
    return "";
  }
  try {
    return execFileSync("git", args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  } catch (err) {
    const stderr = err.stderr?.toString?.() ?? "";
    if (allowEmpty && /nothing to commit/i.test(stderr)) {
      return "";
    }
    throw new Error(`git ${args.join(" ")} 失败:\n${stderr || err.message}`);
  }
}

function gitStatusPorcelain() {
  return runGit(["status", "--porcelain"]);
}

function gitCurrentBranch() {
  return runGit(["branch", "--show-current"]);
}

function gitHeadCommit() {
  return runGit(["rev-parse", "HEAD"]);
}

function gitLogOneLine() {
  return runGit(["log", "-1", "--oneline"]);
}

function requireApiKey() {
  const key = process.env.RENDER_API_KEY?.trim();
  if (!key) {
    throw new Error(
      "缺少 RENDER_API_KEY。请在 Render Dashboard → Account Settings → API Keys 创建，并写入 .env 或环境变量。",
    );
  }
  return key;
}

function assertServiceAllowed(serviceId) {
  if (BLOCKED_SERVICE_IDS.has(serviceId)) {
    throw new Error(`拒绝部署 prod 服务: ${serviceId}`);
  }
  const allowed = Object.values(TEST_SERVICES).some((s) => s.id === serviceId);
  if (!allowed) {
    throw new Error(`服务 ID 不在测试白名单: ${serviceId}`);
  }
}

async function renderFetch(apiKey, path, init = {}) {
  const res = await fetch(`${RENDER_API}${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
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

async function triggerDeploy(apiKey, serviceId, commitId, { dryRun = false } = {}) {
  assertServiceAllowed(serviceId);
  if (dryRun) {
    console.log(
      `[dry-run] POST /services/${serviceId}/deploys commitId=${commitId.slice(0, 8)}`,
    );
    return { id: "dry-run", status: "dry_run" };
  }
  return renderFetch(apiKey, `/services/${serviceId}/deploys`, {
    method: "POST",
    body: JSON.stringify({ commitId }),
  });
}

async function getDeploy(apiKey, serviceId, deployId) {
  return renderFetch(apiKey, `/services/${serviceId}/deploys/${deployId}`, {
    method: "GET",
  });
}

async function listRecentDeploys(apiKey, serviceId, limit = 10) {
  return renderFetch(apiKey, `/services/${serviceId}/deploys?limit=${limit}`, {
    method: "GET",
  });
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function isCommitLiveOnService(apiKey, serviceId, targetCommit) {
  const data = await listRecentDeploys(apiKey, serviceId, 10);
  const items = Array.isArray(data) ? data : [];
  for (const item of items) {
    const d = item.deploy || item;
    const commit = d.commit?.id ?? "";
    if (commit === targetCommit && d.status === "live") return true;
  }
  return false;
}

async function waitForDeploy(apiKey, serviceId, deployId, targetCommit) {
  const maxWaitMs = 10 * 60 * 1000;
  const sleepMs = 20 * 1000;
  let elapsed = 0;

  while (elapsed < maxWaitMs) {
    const deploy = await getDeploy(apiKey, serviceId, deployId);
    const status = deploy.status ?? "unknown";
    console.log(`  部署状态: ${status} (已等待 ${Math.round(elapsed / 1000)}s)`);

    switch (status) {
      case "live":
        return "live";
      case "build_failed":
      case "update_failed":
      case "failed":
        throw new Error(`Render 部署失败: ${status}`);
      case "canceled": {
        if (await isCommitLiveOnService(apiKey, serviceId, targetCommit)) {
          console.log("  本次 deploy 被取消，但目标 commit 已在服务上 live（可能被更新的 deploy 取代）");
          return "live_via_superseded";
        }
        throw new Error("Render 部署已取消（可能被更新的 deploy 取代）");
      }
      default:
        break;
    }

    await sleep(sleepMs);
    elapsed += sleepMs;
  }

  if (await isCommitLiveOnService(apiKey, serviceId, targetCommit)) {
    console.log("  等待超时，但目标 commit 已在服务上 live");
    return "live_via_superseded";
  }

  throw new Error("等待 Render 部署超时（10 分钟）");
}

function gitCommitAndPush({ message, deployOnly, noPush, dryRun }) {
  const branch = gitCurrentBranch();
  console.log(`当前分支: ${branch || "(detached HEAD)"}`);

  if (!deployOnly) {
    const changes = gitStatusPorcelain();
    if (!changes) {
      console.log("工作区无改动，跳过 commit");
    } else {
      console.log("待提交改动:\n" + changes.split("\n").map((l) => `  ${l}`).join("\n"));
      runGit(["add", "-A"], { dryRun });
      const commitMsg =
        message ||
        `chore: deploy test (${new Date().toISOString().slice(0, 19).replace("T", " ")})`;
      if (dryRun) {
        console.log(`[dry-run] git commit -m "${commitMsg}"`);
      } else {
        const status = spawnSync("git", ["commit", "-m", commitMsg], {
          encoding: "utf8",
          stdio: ["ignore", "pipe", "pipe"],
        });
        if (status.status !== 0) {
          const err = status.stderr || "";
          if (!/nothing to commit/i.test(err)) {
            throw new Error(`git commit 失败:\n${err}`);
          }
          console.log("无新改动可提交");
        } else {
          console.log(`已提交: ${gitLogOneLine()}`);
        }
      }
    }
  } else {
    console.log("--deploy-only：跳过 commit");
  }

  if (!deployOnly && !noPush) {
    if (!branch) {
      throw new Error("无法 push：当前不在任何分支上");
    }
    runGit(["push", "origin", branch], { dryRun });
    if (!dryRun) console.log(`已 push 到 origin/${branch}`);
  } else if (noPush) {
    console.log("--no-push：跳过 push");
  } else if (deployOnly) {
    console.log("跳过 push");
  }

  if (dryRun) return "dry-run-commit";
  return gitHeadCommit();
}

async function deployServices({
  services,
  commitId,
  apiKey,
  noWait,
  dryRun,
}) {
  for (const name of services) {
    const svc = TEST_SERVICES[name];
    assertServiceAllowed(svc.id);
    console.log(`\n>>> 部署 ${svc.label} (${name})`);
    console.log(`    服务 ID: ${svc.id}`);
    if (svc.url) console.log(`    URL: ${svc.url}`);

    const deploy = await triggerDeploy(apiKey, svc.id, commitId, { dryRun });
    const deployId = deploy.id;
    const deployUrl = `https://dashboard.render.com/web/${svc.id}/deploys/${deployId}`;
    console.log(`    已触发部署: ${deployId} (初始状态: ${deploy.status ?? "unknown"})`);
    console.log(`    Dashboard: ${deployUrl}`);

    if (!noWait && !dryRun) {
      const finalStatus = await waitForDeploy(apiKey, svc.id, deployId, commitId);
      console.log(`    完成: ${finalStatus}`);
    }
  }
}

async function main() {
  await tryLoadDotEnv();
  const opts = parseArgs(process.argv.slice(2));

  console.log("=== Spark 测试环境部署 ===");
  console.log(`目标服务: ${opts.services.join(", ")}`);
  if (opts.dryRun) console.log("模式: dry-run（不实际执行）");

  const commitId = gitCommitAndPush({
    message: opts.message,
    deployOnly: opts.deployOnly,
    noPush: opts.noPush,
    dryRun: opts.dryRun,
  });

  if (opts.noPush && !opts.deployOnly) {
    console.warn(
      "\n警告: 未 push 到远端，Render 可能无法拉取本地 commit。若需部署，请先 push 或使用 --deploy-only。",
    );
  }

  const apiKey = opts.dryRun ? process.env.RENDER_API_KEY?.trim() || "dry-run-key" : requireApiKey();

  console.log(`\n部署 commit: ${commitId} (${opts.dryRun ? "dry-run" : gitLogOneLine()})`);

  await deployServices({
    services: opts.services,
    commitId,
    apiKey,
    noWait: opts.noWait,
    dryRun: opts.dryRun,
  });

  console.log("\n全部完成。");
}

main().catch((err) => {
  console.error("\n错误:", err.message || err);
  process.exit(1);
});
