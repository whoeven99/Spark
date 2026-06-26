/**
 * 校验 v4 自动翻译模块（worker + TSF）与 v4-auto-translate-modules.json 一致。
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const FORBIDDEN = ["EMAIL_TEMPLATE", "ONLINE_STORE_THEME_LOCALE_CONTENT"];

const canonical = JSON.parse(
  readFileSync(resolve(__dirname, "v4-auto-translate-modules.json"), "utf8"),
);

const workerSrc = readFileSync(
  resolve(__dirname, "../src/services/moduleCatalog.ts"),
  "utf8",
);
const workerMatch = workerSrc.match(
  /export const AUTO_TRANSLATE_V4_MODULES = \[([\s\S]*?)\] as const;/,
);
if (!workerMatch) {
  console.error("无法在 worker moduleCatalog.ts 中找到 AUTO_TRANSLATE_V4_MODULES");
  process.exit(1);
}
const workerModules = [...workerMatch[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);

const tsfPath = resolve(
  __dirname,
  "../../../TypeScriptFrontend/app/server/translateV4/moduleCatalog.ts",
);
let tsfModules = [];
try {
  const tsfSrc = readFileSync(tsfPath, "utf8");
  const tsfMatch = tsfSrc.match(
    /export const AUTO_TRANSLATE_V4_MODULES: TranslationV4Module\[\] = \[([\s\S]*?)\];/,
  );
  if (!tsfMatch) {
    console.error("无法在 TSF moduleCatalog.ts 中找到 AUTO_TRANSLATE_V4_MODULES");
    process.exit(1);
  }
  tsfModules = [...tsfMatch[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
} catch (e) {
  console.warn("跳过 TSF 校验:", e.message);
}

function diff(label, actual) {
  const missing = canonical.filter((m) => !actual.includes(m));
  const extra = actual.filter((m) => !canonical.includes(m));
  const orderWrong =
    actual.length === canonical.length &&
    missing.length === 0 &&
    extra.length === 0 &&
    actual.some((m, i) => m !== canonical[i]);

  if (missing.length || extra.length || orderWrong) {
    console.error(`❌ ${label} 与 v4-auto-translate-modules.json 不一致`);
    if (missing.length) console.error("  缺少:", missing.join(", "));
    if (extra.length) console.error("  多余:", extra.join(", "));
    if (orderWrong) console.error("  顺序与 canonical 不一致");
    return false;
  }
  console.log(`✅ ${label} (${actual.length} 个，不含 ${FORBIDDEN.join(" / ")})`);
  return true;
}

let ok = true;
ok = diff("worker moduleCatalog", workerModules) && ok;
if (tsfModules.length) ok = diff("TSF moduleCatalog", tsfModules) && ok;

for (const mod of FORBIDDEN) {
  if (canonical.includes(mod)) {
    console.error(`❌ v4-auto-translate-modules.json 不应包含 ${mod}`);
    ok = false;
  }
}

process.exit(ok ? 0 : 1);
