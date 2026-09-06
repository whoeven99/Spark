/**
 * 把当前分支相对 base 的提交压成一条中文 commit，改 PR 标题/摘要，--force-with-lease 推送。
 *
 * 标题、commit、PR 正文由调用方按「相对 origin/master 的 diff」用中文写好再传入。
 * commit / PR 正文走文件，避免 Windows 命令行把换行吃掉。
 *
 *   npm run rebase:pr -- --title "中文标题" --message-file commit.txt --body-file pr.md
 */
import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

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
    help: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry-run") args.dryRun = true;
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

function git(args) {
  try {
    return execFileSync("git", args, {
      cwd: REPO_ROOT,
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
  return execFileSync(bin, args, {
    cwd: REPO_ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function ghAllowFail(args) {
  try {
    return { ok: true, out: gh(args) };
  } catch (err) {
    return { ok: false, out: err.message };
  }
}

function isSecretFile(file) {
  const base = file.split(/[/\\]/).pop() ?? file;
  return SECRET_PATTERNS.some((re) => re.test(base) || re.test(file));
}

function listDirtyFiles() {
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

function getDefaultBase() {
  const head = gitAllowFail(["symbolic-ref", "refs/remotes/origin/HEAD"]);
  if (head.ok) {
    const parts = head.out.trim().split("/");
    return parts[parts.length - 1];
  }
  return "master";
}

function findPrUrl(branch) {
  const current = ghAllowFail(["pr", "view", "--json", "url", "-q", ".url"]);
  if (current.ok && current.out.startsWith("http")) return current.out.trim();

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

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(`Usage: node scripts/cursor-rebase-pr.mjs --title "中文标题" --message-file commit.txt --body-file pr.md`);
    process.exit(0);
  }

  const branch = git(["branch", "--show-current"]);
  const base = args.base || getDefaultBase();
  if (!branch || branch === base) {
    throw new Error(`不能在 ${base || "(空)"} 上 rebase`);
  }

  const commitMessage = args.messageFile
    ? readText(args.messageFile)
    : args.message.trim();
  if (!commitMessage) {
    throw new Error("必须传入 --message-file 或 --message（中文 commit）");
  }

  const title =
    args.title.trim() || stripCommitPrefix(firstLine(commitMessage));
  const prBody = args.bodyFile
    ? readText(args.bodyFile)
    : args.body.trim() || defaultPrBody(commitMessage);

  const mergeBase = git(["merge-base", "HEAD", `origin/${base}`]);
  const commits = gitAllowFail(["log", "--oneline", `${mergeBase}..HEAD`]);
  const dirtyAll = listDirtyFiles();
  const dirty = dirtyAll.filter((f) => !isSecretFile(f));
  const skippedSecrets = dirtyAll.filter(isSecretFile);
  if (skippedSecrets.length > 0) {
    console.log(`SKIP_SECRET: ${skippedSecrets.join(", ")}`);
  }

  if ((!commits.ok || !commits.out) && dirty.length === 0) {
    throw new Error(`相对 origin/${base} 没有可压的提交或改动`);
  }

  console.log(`BRANCH: ${branch}`);
  console.log(`BASE: origin/${base}`);
  console.log(`PR_TITLE: ${title}`);
  console.log(`COMMIT_MESSAGE:\n${commitMessage}`);
  if (commits.ok && commits.out) {
    console.log(`SQUASH_FROM:\n${commits.out}`);
  }

  if (args.dryRun) {
    console.log("DRY_RUN: true");
    console.log(`PR_BODY:\n${prBody}`);
    process.exit(0);
  }

  if (!resolveGhBin()) {
    throw new Error("需要安装 gh 并登录");
  }

  if (dirty.length > 0) {
    git(["add", "--", ...dirty]);
  }

  git(["reset", "--soft", mergeBase]);
  const staged = gitAllowFail(["diff", "--cached", "--name-only"]);
  if (!staged.ok || !staged.out) {
    throw new Error("soft reset 后没有可提交内容");
  }
  withTempFile("cursor-rebase-commit", commitMessage, (file) => {
    git(["commit", "-F", file]);
  });
  console.log("SQUASHED: true");

  git(["push", "--force-with-lease", "-u", "origin", "HEAD"]);
  console.log("PUSHED: true");

  let prUrl = findPrUrl(branch);
  withTempFile("cursor-rebase-pr", prBody, (file) => {
    if (prUrl) {
      gh(["pr", "edit", prUrl, "--title", title, "--body-file", file]);
      console.log("PR_UPDATED: true");
      return;
    }
    prUrl = gh([
      "pr",
      "create",
      "--title",
      title,
      "--base",
      base,
      "--head",
      branch,
      "--body-file",
      file,
    ]).trim();
    console.log("PR_CREATED: true");
  });

  if (!prUrl.startsWith("http")) {
    throw new Error(`PR 结果异常: ${prUrl}`);
  }
  console.log(`PR_URL: ${prUrl}`);
}

try {
  main();
} catch (err) {
  console.error(`ERROR: ${err instanceof Error ? err.message : err}`);
  process.exit(1);
}
