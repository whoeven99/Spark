/**
 * cursor-push-pr.mjs
 *
 * 一键：提交当前改动 → push → 创建/更新 PR，最后输出 PR 链接（供 Cursor Agent 解析）。
 * 标题、commit、PR 正文由调用方按 diff 用中文写好再传入（与 rebase:pr 同一口径）。
 *
 *   npm run push:pr -- --title "中文标题" --message-file commit.txt --body-file pr.md
 *
 * 依赖（二选一）：
 *   - GitHub CLI (gh) 已登录：gh auth login
 *   - 或环境变量 GH_TOKEN / GITHUB_TOKEN（需 repo 权限）
 *
 * 成功时最后一行输出：
 *   PR_URL: https://github.com/owner/repo/pull/123
 */

import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..");

const SECRET_PATTERNS = [
  /^\.env(\.|$)/,
  /credentials\.json$/i,
  /\.pem$/i,
  /\.p12$/i,
  /id_rsa$/i,
  /\.key$/i,
];

function parseArgs(argv) {
  const args = {
    message: "",
    messageFile: "",
    title: "",
    body: "",
    bodyFile: "",
    base: "",
    dryRun: false,
    skipCommit: false,
    help: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry-run") args.dryRun = true;
    else if (a === "--skip-commit") args.skipCommit = true;
    else if (a === "--message" || a === "-m") args.message = argv[++i] ?? "";
    else if (a === "--message-file") args.messageFile = argv[++i] ?? "";
    else if (a === "--title") args.title = argv[++i] ?? "";
    else if (a === "--body") args.body = argv[++i] ?? "";
    else if (a === "--body-file") args.bodyFile = argv[++i] ?? "";
    else if (a === "--base") args.base = argv[++i] ?? "";
    else if (a === "--help" || a === "-h") args.help = true;
  }
  return args;
}

function printUsage() {
  console.log(`Usage: node scripts/cursor-push-pr.mjs --title "中文标题" --message-file commit.txt --body-file pr.md

Options:
  -m, --message <text>     提交说明（默认根据改动文件自动生成）
      --message-file <path> 从文件读 commit（推荐，避免换行被吃掉）
      --title <text>       中文 PR 标题
      --body <text>        PR 正文
      --body-file <path>   从文件读 PR 正文
      --base <branch>      PR 目标分支（默认 origin/HEAD 或 master）
      --dry-run            只预览，不实际提交/推送/建 PR
      --skip-commit        跳过提交，仅 push + 建/改 PR
  -h, --help               显示帮助
`);
}

function readText(path) {
  return readFileSync(path, "utf8").replace(/^\uFEFF/, "").trim();
}

function firstLine(text) {
  return text.split(/\r?\n/).map((s) => s.trim()).find(Boolean) ?? "";
}

function stripCommitPrefix(title) {
  return title.replace(/^(feat|fix|chore|docs|refactor|test|style)(\([^)]+\))?:\s*/i, "").trim();
}

function defaultPrBody(commitMessage) {
  const lines = commitMessage.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  const headline = stripCommitPrefix(lines[0] ?? "");
  const rest = lines.slice(1);
  const bullets =
    rest.length > 0
      ? rest.flatMap((line) =>
          line.split(/[；;]/).map((part) => part.trim()).filter(Boolean),
        )
      : [headline];
  return [
    "## 摘要",
    "",
    ...bullets.map((item) => `- ${item}`),
    "",
    "## 测试",
    "",
    "- [ ] 对照本 PR 改动路径自测主流程与失败路径",
  ].join("\n");
}

function withTempFile(prefix, content, fn) {
  const file = join(tmpdir(), `${prefix}-${Date.now()}.txt`);
  writeFileSync(file, `${content.replace(/\s+$/, "")}\n`, "utf8");
  try {
    return fn(file);
  } finally {
    try {
      unlinkSync(file);
    } catch {
      /* ignore */
    }
  }
}

function git(args, opts = {}) {
  try {
    return execFileSync("git", args, {
      cwd: opts.cwd ?? REPO_ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  } catch (err) {
    const msg = [err.stdout, err.stderr].filter(Boolean).join("\n").trim() || err.message;
    throw new Error(msg);
  }
}

function gitAllowFail(args) {
  try {
    return { ok: true, out: git(args) };
  } catch (err) {
    return { ok: false, out: err.message };
  }
}

function resolveGhBin() {
  const candidates = [
    "gh",
    "C:\\Program Files\\GitHub CLI\\gh.exe",
    join(process.env.LOCALAPPDATA ?? "", "Programs", "GitHub CLI", "gh.exe"),
  ];
  for (const bin of candidates) {
    const r = spawnSync(bin, ["--version"], { encoding: "utf8" });
    if (r.status === 0) return bin;
  }
  return null;
}

function gh(args) {
  const bin = resolveGhBin();
  if (!bin) throw new Error("未找到 gh CLI");
  try {
    return execFileSync(bin, args, {
      cwd: REPO_ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  } catch (err) {
    const msg = [err.stdout, err.stderr].filter(Boolean).join("\n").trim() || err.message;
    throw new Error(msg);
  }
}

function ghAllowFail(args) {
  try {
    return { ok: true, out: gh(args) };
  } catch (err) {
    return { ok: false, out: err.message };
  }
}

function getRemoteInfo() {
  const url = git(["remote", "get-url", "origin"]);
  const m = url.match(/github\.com[:/]([^/]+)\/([^/.]+)/);
  if (!m) throw new Error(`无法解析 GitHub 仓库地址: ${url}`);
  return { owner: m[1], repo: m[2].replace(/\.git$/, ""), url };
}

function getDefaultBase() {
  const head = gitAllowFail(["symbolic-ref", "refs/remotes/origin/HEAD"]);
  if (head.ok) {
    const parts = head.out.trim().split("/");
    return parts[parts.length - 1];
  }
  return "master";
}

function listChangedFiles() {
  const set = new Set();
  for (const args of [
    ["diff", "--name-only"],
    ["diff", "--cached", "--name-only"],
    ["ls-files", "--others", "--exclude-standard"],
  ]) {
    const r = gitAllowFail(args);
    if (r.ok && r.out) {
      for (const line of r.out.split("\n")) {
        const f = line.trim();
        if (f) set.add(f);
      }
    }
  }
  return [...set];
}

function isSecretFile(file) {
  const base = file.split(/[/\\]/).pop() ?? file;
  return SECRET_PATTERNS.some((re) => re.test(base) || re.test(file));
}

function generateCommitMessage(files) {
  if (files.length === 0) return "chore: update";
  const topDirs = new Map();
  for (const f of files) {
    const top = f.includes("/") || f.includes("\\") ? f.split(/[/\\]/)[0] : f;
    topDirs.set(top, (topDirs.get(top) ?? 0) + 1);
  }
  const sorted = [...topDirs.entries()].sort((a, b) => b[1] - a[1]);
  const [mainDir] = sorted[0];
  const names = files
    .slice(0, 4)
    .map((f) => f.split(/[/\\]/).pop())
    .join(", ");
  if (sorted.length === 1) {
    return `update(${mainDir}): ${names}${files.length > 4 ? "..." : ""}`;
  }
  return `update: ${names}${files.length > 4 ? ` (+${files.length - 4})` : ""}`;
}

/** 只认仍打开的 PR。`gh pr view` 会返回已合并的同名分支 PR，不能用。 */
function findOpenPrUrl(branch) {
  const listed = ghAllowFail([
    "pr",
    "list",
    "--head",
    branch,
    "--state",
    "open",
    "--json",
    "url",
    "-q",
    ".[0].url",
  ]);
  if (listed.ok && listed.out.startsWith("http")) return listed.out.trim();
  return "";
}

async function findOpenPrViaApi({ owner, repo, head, token }) {
  const q = `https://api.github.com/repos/${owner}/${repo}/pulls?state=open&head=${owner}:${encodeURIComponent(head)}`;
  const res = await fetch(q, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "cursor-push-pr-script",
    },
  });
  if (!res.ok) return null;
  const pulls = await res.json();
  const first = pulls[0];
  if (!first?.html_url) return null;
  return { url: first.html_url, number: first.number };
}

async function createPrViaApi({ owner, repo, head, base, title, body, token }) {
  const existing = await findOpenPrViaApi({ owner, repo, head, token });
  if (existing) {
    const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/pulls/${existing.number}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
        "User-Agent": "cursor-push-pr-script",
      },
      body: JSON.stringify({ title, body }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`GitHub API 更新 PR 失败 (${res.status}): ${text}`);
    }
    return existing.url;
  }

  const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/pulls`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
      "User-Agent": "cursor-push-pr-script",
    },
    body: JSON.stringify({ title, head, base, body }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GitHub API 创建 PR 失败 (${res.status}): ${text}`);
  }
  const data = await res.json();
  return data.html_url;
}

function createPrViaGh({ title, body, base, branch }) {
  const existing = findOpenPrUrl(branch);
  return withTempFile("cursor-push-pr", body, (file) => {
    if (existing) {
      gh(["pr", "edit", existing, "--title", title, "--body-file", file]);
      return existing;
    }
    return gh(["pr", "create", "--title", title, "--base", base, "--head", branch, "--body-file", file]);
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printUsage();
    process.exit(0);
  }

  const branch = git(["branch", "--show-current"]);
  const { owner, repo } = getRemoteInfo();
  const base = args.base || getDefaultBase();

  const allFiles = listChangedFiles();
  const files = allFiles.filter((f) => !isSecretFile(f));
  const skippedSecrets = allFiles.filter(isSecretFile);
  if (skippedSecrets.length > 0) {
    console.log(`SKIP_SECRET: ${skippedSecrets.join(", ")}`);
  }

  const hasLocalChanges = files.length > 0;
  const ahead = gitAllowFail(["rev-list", "--count", `origin/${branch}..HEAD`]);
  const isAhead = ahead.ok && Number(ahead.out) > 0;

  if (!hasLocalChanges && !isAhead && !args.skipCommit) {
    console.error("ERROR: 没有可提交的改动，且当前分支未领先远程");
    process.exit(1);
  }

  const commitMessage = args.messageFile
    ? readText(args.messageFile)
    : args.message.trim() || generateCommitMessage(files);
  const prTitle = args.title.trim() || stripCommitPrefix(firstLine(commitMessage));
  const prBody = args.bodyFile
    ? readText(args.bodyFile)
    : args.body.trim() || defaultPrBody(commitMessage);

  console.log(`REPO: ${owner}/${repo}`);
  console.log(`BRANCH: ${branch}`);
  console.log(`BASE: ${base}`);
  console.log(`PR_TITLE: ${prTitle}`);
  console.log(`COMMIT_MESSAGE:\n${commitMessage}`);
  console.log(`CHANGED_FILES: ${files.length}`);

  if (args.dryRun) {
    console.log("DRY_RUN: true");
    console.log(`PR_BODY:\n${prBody}`);
    process.exit(0);
  }

  const ghBin = resolveGhBin();
  const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;

  if (!ghBin && !token) {
    console.error("ERROR: 需要安装 gh 并登录，或设置 GH_TOKEN / GITHUB_TOKEN");
    console.error("  gh: https://cli.github.com/");
    process.exit(1);
  }

  if (hasLocalChanges && !args.skipCommit) {
    git(["add", "--", ...files]);
    withTempFile("cursor-push-commit", commitMessage, (file) => {
      git(["commit", "-F", file]);
    });
    console.log("COMMITTED: true");
  }

  const upstream = gitAllowFail(["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"]);
  if (!upstream.ok) {
    git(["push", "-u", "origin", branch]);
  } else {
    git(["push", "origin", branch]);
  }
  console.log("PUSHED: true");

  const compareUrl = `https://github.com/${owner}/${repo}/compare/${base}...${branch}?expand=1`;

  try {
    let prUrl;
    if (ghBin) {
      prUrl = createPrViaGh({ title: prTitle, body: prBody, base, branch });
    } else {
      prUrl = await createPrViaApi({
        owner,
        repo,
        head: branch,
        base,
        title: prTitle,
        body: prBody,
        token,
      });
    }

    if (!prUrl?.startsWith("http")) {
      throw new Error(`PR 创建结果异常: ${prUrl}`);
    }

    console.log(`PR_URL: ${prUrl}`);
  } catch (err) {
    console.error(`ERROR: ${err.message}`);
    console.log(`PR_CREATE_URL: ${compareUrl}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(`ERROR: ${err.message}`);
  process.exit(1);
});
