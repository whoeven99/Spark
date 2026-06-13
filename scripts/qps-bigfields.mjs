import { BlobServiceClient } from "@azure/storage-blob";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
const __dir = dirname(fileURLToPath(import.meta.url));
const env = {};
try { for (const l of readFileSync(resolve(__dir,"../.env"),"utf8").split(/\r?\n/)){const e=l.indexOf("=");if(e<1)continue;const k=l.slice(0,e).trim();if(!/^[A-Z_][A-Z0-9_]*$/.test(k))continue;env[k]=l.slice(e+1).trim();} } catch {}
const CONN = process.env.AZURE_BLOB_CONNECTION_STRING ?? env.AZURE_BLOB_CONNECTION_STRING;
const CONTAINER = process.env.AZURE_BLOB_TRANSLATION_CONTAINER ?? env.AZURE_BLOB_TRANSLATION_CONTAINER ?? "translation-content";
const container = BlobServiceClient.fromConnectionString(CONN).getContainerClient(CONTAINER);
process.on("unhandledRejection",()=>{});
const jobId = process.argv[2];
let shop=null;
for await (const b of container.listBlobsFlat({prefix:"tasks/v4/"})){const p=b.name.split("/");if(p[3]===jobId){shop=p[2];break;}}
const base=`tasks/v4/${shop}/${jobId}/init/`;
const names=[];
for await (const b of container.listBlobsFlat({prefix:base})){if(b.name.endsWith(".json"))names.push(b.name);}
const big=[]; const buckets={"<1k":0,"1-3k":0,"3-6k":0,"6-12k":0,">12k":0};
let total=0;
for (const name of names){
  let data=null; for(let a=0;a<3&&!data;a++){try{data=JSON.parse((await container.getBlobClient(name).downloadToBuffer()).toString("utf8"));}catch{}}
  if(!data)continue;
  const mod=name.split("/").slice(-2)[0];
  for(const r of data){for(const f of (r.fields??[])){
    const len=(f.value??"").length; total++;
    if(len<1000)buckets["<1k"]++;else if(len<3000)buckets["1-3k"]++;else if(len<6000)buckets["3-6k"]++;else if(len<12000)buckets["6-12k"]++;else buckets[">12k"]++;
    if(len>=6000)big.push({mod,key:f.key,len,rid:r.resourceId});
  }}
}
big.sort((a,b)=>b.len-a.len);
console.log("total fields:",total);
console.log("size buckets:",JSON.stringify(buckets));
console.log(`fields >=6000 chars: ${big.length}`);
console.log("top 20 largest:");
for(const x of big.slice(0,20))console.log(`  ${String(x.len).padStart(7)}  ${x.mod.padEnd(28)} key=${x.key}  ${x.rid}`);
