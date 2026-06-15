require("dotenv").config();
const { CosmosClient } = require("@azure/cosmos");
(async () => {
  const jobId = process.argv[2];
  const client = new CosmosClient({ endpoint: process.env.COSMOS_ENDPOINT, key: process.env.COSMOS_KEY });
  const dbId = process.env.COSMOS_TRANSLATION_DATABASE_ID || "translation";
  const containerId = process.env.COSMOS_QPS_LOGS_CONTAINER || "translation_v4_qps_logs";
  const container = client.database(dbId).container(containerId);
  const { resources } = await container.items.query({
    query: "SELECT * FROM c WHERE c.jobId=@j ORDER BY c.timestamp ASC",
    parameters: [{ name: "@j", value: jobId }],
  }, { partitionKey: jobId }).fetchAll();

  const t0 = new Date(resources[0].timestamp).getTime();
  const rows = resources.map(r => ({
    t: Math.round((new Date(r.timestamp).getTime() - t0) / 1000),
    stage: r.stage,
    dur: r.durationSec,
    sQps: r.shopify.callsPerSec,
    sCalls: r.shopify.calls,
    s429: r.shopify.retries429,
    bucket: r.shopify.bucketAvailable,
    lQps: r.llm ? r.llm.callsPerSec : 0,
    lCalls: r.llm ? r.llm.calls : 0,
    lTok: r.llm ? r.llm.tokens : 0,
    lLat: r.llm ? r.llm.avgLatencyMs : 0,
    lConc: r.llm ? r.llm.concurrency : 0,
    lThr: r.llm ? r.llm.throttleCount : 0,
    lErr: r.llm ? r.llm.errors : 0,
  }));

  // per-stage aggregates
  const byStage = {};
  for (const r of rows) {
    const s = byStage[r.stage] || (byStage[r.stage] = { n:0, dur:0, sCalls:0, s429:0, lCalls:0, lTok:0, lThr:0, lErr:0, sQpsMax:0, lQpsMax:0, latSum:0, latN:0, buckets:[] });
    s.n++; s.dur+=r.dur; s.sCalls+=r.sCalls; s.s429+=r.s429; s.lCalls+=r.lCalls; s.lTok+=r.lTok; s.lThr+=r.lThr; s.lErr+=r.lErr;
    s.sQpsMax=Math.max(s.sQpsMax,r.sQps); s.lQpsMax=Math.max(s.lQpsMax,r.lQps);
    if(r.lCalls>0){s.latSum+=r.lLat*r.lCalls;s.latN+=r.lCalls;}
    if(r.bucket!=null)s.buckets.push(r.bucket);
  }
  console.log("=== PER STAGE ===");
  for (const [st, s] of Object.entries(byStage)) {
    console.log(`${st}: windows=${s.n} totalDur=${s.dur.toFixed(0)}s shopifyCalls=${s.sCalls} (peak ${s.sQpsMax}/s, 429=${s.s429}) llmCalls=${s.lCalls} (peak ${s.lQpsMax}/s) tokens=${s.lTok} avgLat=${s.latN?Math.round(s.latSum/s.latN):0}ms throttle=${s.lThr} err=${s.lErr} bucketMin=${s.buckets.length?Math.min(...s.buckets):'-'}`);
  }
  console.log("\n=== TIMESERIES (t=sec from start) ===");
  console.log("t,stage,sQps,sCalls,s429,bucket,lQps,lCalls,lTok,lLatMs,lConc,lThr,lErr");
  for (const r of rows) console.log(`${r.t},${r.stage},${r.sQps},${r.sCalls},${r.s429},${r.bucket},${r.lQps},${r.lCalls},${r.lTok},${r.lLat},${r.lConc},${r.lThr},${r.lErr}`);

  // Chart-ready compact array (consumed by the visualize widget — see
  // docs/translation-quality-check.md "QPS 速率分析 / 出图").
  const chart = rows.map(r => ({
    t: r.t, st: r.stage, sq: r.sQps, lq: r.lQps,
    tok: r.lTok, lat: r.lLat, conc: r.lConc, bkt: r.bucket, err: r.lErr,
  }));
  const outPath = require("path").resolve(__dirname, "qps-data.json");
  require("fs").writeFileSync(outPath, JSON.stringify(chart));
  console.log(`\n[wrote] ${outPath} (${chart.length} points — feed to the chart widget)`);
})().catch(e=>{console.error(e.message);process.exit(1);});
