/**
 * 任务规模特征分桶（纯函数，可单测、无 IO）。
 *
 * 预估按 (taskType, bucket) 自校准，bucket 把「规模/形态相近」的任务归到一起，
 * 让大任务和小任务收敛出各自的 EWMA，而不是共用一个全局值。
 *
 * 约定：无法识别特征时一律回退 "default"，与历史无 bucket 数据兼容。
 */
import type { AITaskType } from "../../lib/aiTaskTypes";

export type EstimationTaskKey = AITaskType | "translation";

/** 按文本长度做 log2 分桶：len-0(<128) / len-1(<256) / ... 上限封顶，避免桶爆炸。 */
function lengthBucket(len: number): string {
  if (!Number.isFinite(len) || len <= 0) return "len-0";
  const bin = Math.min(8, Math.max(0, Math.floor(Math.log2(len / 64))));
  return `len-${bin}`;
}

function asString(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

function asNumber(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/**
 * 从任务 config 派生 bucket。
 * config 形态因 taskType 而异，缺字段时安全回退 "default"。
 */
export function deriveBucket(
  taskKey: EstimationTaskKey,
  config: Record<string, unknown> | null | undefined,
): string {
  const c = config ?? {};

  switch (taskKey) {
    case "product_improve": {
      // 文案生成：输入文本越长越慢、token 越多。
      const text = asString(c.originalText) ?? "";
      const title = asString(c.originalTitle) ?? "";
      return lengthBucket(text.length + title.length);
    }
    case "picture_translate": {
      // 图片翻译：两套引擎(modelType 1/2)成本不同。
      const mt = asNumber(c.modelType);
      return mt === 1 ? "m1" : mt === 2 ? "m2" : "default";
    }
    case "image_generation": {
      // 文生图：不同 provider 出图速度/计费不同。
      const provider = asString(c.imageProvider);
      return provider ? `prov-${provider}` : "default";
    }
    case "translation": {
      // 整店翻译：目标语言不同，单条耗时/token 差异明显。
      const target = asString(c.target) ?? asString(c.targetCode);
      return target ? `lang-${target}` : "default";
    }
    default:
      return "default";
  }
}
