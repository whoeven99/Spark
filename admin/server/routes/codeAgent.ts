import { Router, type Request, type Response } from "express";
import Anthropic from "@anthropic-ai/sdk";
import { Octokit } from "@octokit/rest";
import { getEnv } from "../lib/env.js";

export const codeAgentRouter = Router();

const MODEL = "claude-sonnet-4-6";
const MAX_ITERATIONS = 30;

function send(res: Response, type: string, data: Record<string, unknown>) {
  res.write(`data: ${JSON.stringify({ type, ...data })}\n\n`);
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .trim()
    .split(/\s+/)
    .slice(0, 6)
    .join("-")
    .slice(0, 50);
}

codeAgentRouter.post("/run", async (req: Request, res: Response) => {
  const { prompt, baseBranch: reqBase } = req.body as {
    prompt?: string;
    baseBranch?: string;
  };

  if (!prompt?.trim()) {
    res.status(400).json({ error: "prompt is required" });
    return;
  }

  const GITHUB_TOKEN = getEnv("GITHUB_TOKEN");
  const REPO_OWNER = getEnv("GITHUB_REPO_OWNER");
  const REPO_NAME = getEnv("GITHUB_REPO_NAME");
  const DEFAULT_BRANCH = getEnv("GITHUB_DEFAULT_BRANCH") || "master";
  const ANTHROPIC_API_KEY = getEnv("ANTHROPIC_API_KEY");

  if (!GITHUB_TOKEN || !REPO_OWNER || !REPO_NAME || !ANTHROPIC_API_KEY) {
    res.status(500).json({ error: "Missing required env vars: GITHUB_TOKEN, GITHUB_REPO_OWNER, GITHUB_REPO_NAME, ANTHROPIC_API_KEY" });
    return;
  }

  const baseBranch = reqBase?.trim() || DEFAULT_BRANCH;

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const octokit = new Octokit({ auth: GITHUB_TOKEN });
  const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

  try {
    // Create new branch from base
    send(res, "log", { text: `Getting latest SHA of ${baseBranch}...` });
    const { data: baseRef } = await octokit.rest.git.getRef({
      owner: REPO_OWNER,
      repo: REPO_NAME,
      ref: `heads/${baseBranch}`,
    });
    const baseSha = baseRef.object.sha;

    const newBranch = `ai/${slugify(prompt)}-${Date.now()}`;
    send(res, "log", { text: `Creating branch ${newBranch}...` });
    await octokit.rest.git.createRef({
      owner: REPO_OWNER,
      repo: REPO_NAME,
      ref: `refs/heads/${newBranch}`,
      sha: baseSha,
    });
    send(res, "log", { text: `Branch created: ${newBranch}` });

    // Track file changes
    const fileChanges = new Map<string, string>();

    // Tool implementations
    async function listDirectory(path: string): Promise<string> {
      const { data } = await octokit.rest.repos.getContent({
        owner: REPO_OWNER,
        repo: REPO_NAME,
        path,
        ref: baseBranch,
      });
      if (!Array.isArray(data)) return `${path} is a file, not a directory`;
      return data.map((item) => `${item.type === "dir" ? "[dir]" : "[file]"} ${item.path}`).join("\n");
    }

    async function readFile(path: string): Promise<string> {
      const { data } = await octokit.rest.repos.getContent({
        owner: REPO_OWNER,
        repo: REPO_NAME,
        path,
        ref: baseBranch,
      });
      if (Array.isArray(data) || data.type !== "file") return "Not a file";
      const content = data.content ?? "";
      return Buffer.from(content.replace(/\n/g, ""), "base64").toString("utf8");
    }

    function writeFile(path: string, content: string): string {
      fileChanges.set(path, content);
      send(res, "file_queued", { path });
      return `Queued write to ${path}`;
    }

    async function searchCode(query: string): Promise<string> {
      try {
        const { data } = await octokit.rest.search.code({
          q: `${query} repo:${REPO_OWNER}/${REPO_NAME}`,
          per_page: 10,
        });
        if (data.items.length === 0) return "No results found";
        return data.items.map((item) => `${item.path}: ${item.html_url}`).join("\n");
      } catch {
        return "Search failed or rate limited";
      }
    }

    const tools: Anthropic.Tool[] = [
      {
        name: "list_directory",
        description: "List files and subdirectories in a directory of the GitHub repo",
        input_schema: {
          type: "object",
          properties: {
            path: { type: "string", description: "Directory path, e.g. 'admin/src/pages' or '' for root" },
          },
          required: ["path"],
        },
      },
      {
        name: "read_file",
        description: "Read the contents of a file from the GitHub repo",
        input_schema: {
          type: "object",
          properties: {
            path: { type: "string", description: "File path relative to repo root" },
          },
          required: ["path"],
        },
      },
      {
        name: "write_file",
        description: "Queue a file to be written (creates or updates). Call this for every file you want to change.",
        input_schema: {
          type: "object",
          properties: {
            path: { type: "string", description: "File path relative to repo root" },
            content: { type: "string", description: "Complete file content (not a diff)" },
          },
          required: ["path", "content"],
        },
      },
      {
        name: "search_code",
        description: "Search for code patterns across the repo using GitHub code search",
        input_schema: {
          type: "object",
          properties: {
            query: { type: "string", description: "Search query, e.g. 'fetchShops' or 'authMiddleware'" },
          },
          required: ["query"],
        },
      },
    ];

    const systemPrompt = `You are an expert full-stack engineer working on the Spark project — a Shopify app platform with an admin dashboard.
Repo: ${REPO_OWNER}/${REPO_NAME} (branch: ${baseBranch})
Tech stack: Node.js/TypeScript Express backend, React + Ant Design frontend, Turso (LibSQL) database.
Key directories: admin/ (internal admin dashboard), server/ (Shopify app backend), prisma/ (DB schema).

Your workflow:
1. Use list_directory and read_file to understand the codebase before making changes.
2. Use write_file for every file you want to create or modify (provide the COMPLETE file content, not a diff).
3. Use search_code to find where things are defined.
4. When you are done with all changes, stop and don't call any more tools.

Be thorough: read existing files before modifying them to preserve their structure and patterns.`;

    const messages: Anthropic.MessageParam[] = [
      { role: "user", content: prompt },
    ];

    send(res, "log", { text: "Starting AI code generation..." });

    let iterations = 0;
    while (iterations < MAX_ITERATIONS) {
      iterations++;

      const response = await anthropic.messages.create({
        model: MODEL,
        max_tokens: 8192,
        system: systemPrompt,
        tools,
        messages,
      });

      // Stream text responses
      for (const block of response.content) {
        if (block.type === "text" && block.text.trim()) {
          send(res, "log", { text: block.text });
        } else if (block.type === "tool_use") {
          send(res, "tool_call", { name: block.name, input: block.input });
        }
      }

      if (response.stop_reason === "end_turn") break;
      if (response.stop_reason !== "tool_use") break;

      // Execute tools
      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const block of response.content) {
        if (block.type !== "tool_use") continue;
        const input = block.input as Record<string, string>;
        let result: string;
        try {
          if (block.name === "list_directory") {
            result = await listDirectory(input.path ?? "");
          } else if (block.name === "read_file") {
            result = await readFile(input.path);
          } else if (block.name === "write_file") {
            result = writeFile(input.path, input.content);
          } else if (block.name === "search_code") {
            result = await searchCode(input.query);
          } else {
            result = `Unknown tool: ${block.name}`;
          }
        } catch (err) {
          result = `Tool error: ${err instanceof Error ? err.message : String(err)}`;
        }
        toolResults.push({ type: "tool_result", tool_use_id: block.id, content: result });
      }

      messages.push({ role: "assistant", content: response.content });
      messages.push({ role: "user", content: toolResults });
    }

    if (fileChanges.size === 0) {
      send(res, "error", { message: "No file changes were generated. Try a more specific prompt." });
      res.end();
      return;
    }

    // Commit all file changes
    send(res, "committing", { fileCount: fileChanges.size });
    for (const [filePath, content] of fileChanges) {
      let existingSha: string | undefined;
      try {
        const { data } = await octokit.rest.repos.getContent({
          owner: REPO_OWNER,
          repo: REPO_NAME,
          path: filePath,
          ref: newBranch,
        });
        if (!Array.isArray(data) && data.type === "file") {
          existingSha = data.sha;
        }
      } catch {
        // File doesn't exist yet
      }

      await octokit.rest.repos.createOrUpdateFileContents({
        owner: REPO_OWNER,
        repo: REPO_NAME,
        path: filePath,
        message: `AI: update ${filePath}`,
        content: Buffer.from(content).toString("base64"),
        branch: newBranch,
        sha: existingSha,
      });
      send(res, "log", { text: `Committed ${filePath}` });
    }

    // Create PR
    send(res, "log", { text: "Creating pull request..." });
    const prTitle = `AI: ${prompt.slice(0, 72)}`;
    const prBody = `### AI Code Agent\n\n**Task:** ${prompt}\n\n**Files changed (${fileChanges.size}):**\n${[...fileChanges.keys()].map((p) => `- \`${p}\``).join("\n")}`;
    const { data: pr } = await octokit.rest.pulls.create({
      owner: REPO_OWNER,
      repo: REPO_NAME,
      title: prTitle,
      body: prBody,
      head: newBranch,
      base: baseBranch,
    });

    send(res, "done", { prUrl: pr.html_url, branch: newBranch, prNumber: pr.number });
  } catch (err) {
    send(res, "error", { message: err instanceof Error ? err.message : String(err) });
  }

  res.end();
});
