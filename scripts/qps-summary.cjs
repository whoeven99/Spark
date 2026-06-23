require("dotenv").config();
const { CosmosClient } = require("@azure/cosmos");

function windowToRow(w) {
  return {
    t: w.t,
    stage: w.st,
    dur: w.dur,
    sQps: w.shopify.callsPerSec,
    sCalls: w.shopify.calls,
    s429: w.shopify.retries429,
    bucket: w.shopify.bucketAvailable,
    lQps: w.llm ? w.llm.callsPerSec : 0,
    lCalls: w.llm ? w.llm.calls : 0,
    lTok: w.llm ? w.llm.tokens : 0,
    lLat: w.llm ? w.llm.avgLatencyMs : 0,
    lConc: w.llm ? w.llm.concurrency : 0,
    lThr: w.llm ? w.llm.throttleCount : 0,
    lErr: w.llm ? w.llm.errors : 0,
  };
}

(async () => {
  const jobId = process.argv[2];
  if (!jobId) { console.error("usage: node qps-summary.cjs <jobId>"); process.exit(1); }

  const client = new CosmosClient({ endpoint: process.env.COSMOS_ENDPOINT, key: process.env.COSMOS_KEY });
  const dbId = process.env.COSMOS_TRANSLATION_DATABASE_ID || "translation";
  const containerId = process.env.COSMOS_QPS_LOGS_CONTAINER || "translation_v4_qps_logs";
  const container = client.database(dbId).container(containerId);

  const { resource: doc } = await container.item(jobId, jobId).read();
  if (!doc?.windows?.length) {
    console.error(`no QPS log found for job ${jobId}`);
    process.exit(1);
  }

  const rows = doc.windows.map(windowToRow);

  const byStage = {};
  for (const r of rows) {
    const s = byStage[r.stage] || (byStage[r.stage] = { n:0, dur:0, sCalls:0, s429:0, lCalls:0, lTok:0, lThr:0, lErr:0, sQpsMax:0, lQpsMax:0, latSum:0, latN:0, buckets:[] });
    s.n++; s.dur+=r.dur; s.sCalls+=r.sCalls; s.s429+=r.s429; s.lCalls+=r.lCalls; s.lTok+=r.lTok; s.lThr+=r.lThr; s.lErr+=r.lErr;
    s.sQpsMax=Math.max(s.sQpsMax,r.sQps); s.lQpsMax=Math.max(s.lQpsMax,r.lQps);
    if(r.lCalls>0){s.latSum+=r.lLat*r.lCalls;s.latN+=r.lCalls;}
    if(r.bucket!=null)s.buckets.push(r.bucket);
  }

  console.log(`job=${jobId} shop=${doc.shopName} started=${doc.startedAt} windows=${doc.windows.length}`);
  console.log("=== PER STAGE ===");
  for (const [st, s] of Object.entries(byStage)) {
    console.log(`${st}: windows=${s.n} totalDur=${s.dur.toFixed(0)}s shopifyCalls=${s.sCalls} (peak ${s.sQpsMax}/s, 429=${s.s429}) llmCalls=${s.lCalls} (peak ${s.lQpsMax}/s) tokens=${s.lTok} avgLat=${s.latN?Math.round(s.latSum/s.latN):0}ms throttle=${s.lThr} err=${s.lErr} bucketMin=${s.buckets.length?Math.min(...s.buckets):'-'}`);
  }
  console.log("\n=== TIMESERIES (t=sec from start) ===");
  console.log("t,stage,sQps,sCalls,s429,bucket,lQps,lCalls,lTok,lLatMs,lConc,lThr,lErr");
  for (const r of rows) console.log(`${r.t},${r.stage},${r.sQps},${r.sCalls},${r.s429},${r.bucket},${r.lQps},${r.lCalls},${r.lTok},${r.lLat},${r.lConc},${r.lThr},${r.lErr}`);

  const chart = rows.map(r => ({
    t: r.t, st: r.stage, sq: r.sQps, lq: r.lQps,
    tok: r.lTok, lat: r.lLat, conc: r.lConc, bkt: r.bucket, err: r.lErr,
  }));
  const outPath = require("path").resolve(__dirname, "qps-data.json");
  require("fs").writeFileSync(outPath, JSON.stringify(chart));
  console.log(`\n[wrote] ${outPath} (${chart.length} points — feed to the chart widget)`);
})().catch(e=>{console.error(e.message);process.exit(1);});
