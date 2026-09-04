import fs from "node:fs";

const files = [
  "C:/Users/whoev/.cursor/projects/c-repo-Spark/agent-tools/1ca31b7a-73e0-4feb-ba26-1b70d948441d.txt",
  "C:/Users/whoev/.cursor/projects/c-repo-Spark/agent-tools/c300803b-95b3-464f-947e-c06e5e25fc93.txt",
  "C:/Users/whoev/.cursor/projects/c-repo-Spark/agent-tools/8e8a871c-ff00-48e3-a103-db6d4b8ffc37.txt",
];

const skip =
  /\[Sync\]|Authenticating admin|Creating new session|No valid session|Requesting offline|order upserted|refund upserted/;
const keep =
  /billing|subscription|account|chat-stream|product-improve|generate-image|task-proposal|feature-track|Feishu|SUBSCRIPTION|Premium|Basic|applied|studio|assistant|webhook|AppSubscription|planKey|\/app\/account|update-product|ai-task|picture-translate|conversations/;

const seen = new Set();
for (const p of files) {
  if (!fs.existsSync(p)) continue;
  const j = JSON.parse(fs.readFileSync(p, "utf8"));
  for (const l of j.logs || []) {
    const msg = String(l.message || "");
    const key = `${l.timestamp}|${msg.slice(0, 120)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (skip.test(msg)) continue;
    const isHttp = msg.startsWith("GET ") || msg.startsWith("POST ") || msg.startsWith("PUT ");
    if (!keep.test(msg) && !isHttp) continue;
    // drop pure install backfill noise already covered
    if (msg.includes("InstallBackfill")) continue;
    console.log(
      String(l.timestamp).slice(0, 19),
      "|",
      msg.replace(/\s+/g, " ").slice(0, 280),
    );
  }
}
