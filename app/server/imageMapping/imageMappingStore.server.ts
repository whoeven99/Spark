import prisma from "../../db.server";
import { getPictureTranslateResultImageUrl } from "../pictureTranslate/pictureTranslateBlob.server";

const LOG_PREFIX = "[ImageMapping]";

/** 翻译完成后写入（或更新）一条图片映射记录。 */
export async function upsertImageMapping(params: {
  shop: string;
  sourceUrl: string;
  targetBlobPath: string;
  sourceCode: string;
  targetCode: string;
}): Promise<void> {
  await prisma.imageMapping.upsert({
    where: {
      shop_sourceUrl_targetCode: {
        shop: params.shop,
        sourceUrl: params.sourceUrl,
        targetCode: params.targetCode,
      },
    },
    update: {
      targetBlobPath: params.targetBlobPath,
      sourceCode: params.sourceCode,
    },
    create: params,
  });

  console.info(
    `${LOG_PREFIX} upsert shop=${params.shop} targetCode=${params.targetCode} sourceUrl=${params.sourceUrl.slice(0, 80)}`,
  );
}

export type ImageMappingEntry = {
  sourceUrl: string;
  targetUrl: string;
};

/** 店面 localization.language.iso_code → 整图翻译 targetCode 候选（如 zh-CN → zh）。 */
export function resolveStorefrontTargetCodes(isoCode: string): string[] {
  const raw = isoCode.trim();
  const lower = raw.toLowerCase();
  const candidates = new Set<string>([raw, lower]);

  if (lower === "zh-cn" || lower === "zh") {
    candidates.add("zh");
    candidates.add("zh-CN");
  } else if (lower === "zh-tw") {
    candidates.add("zh-Hant");
    candidates.add("zh-tw");
  } else {
    const base = lower.split("-")[0];
    if (base) candidates.add(base);
  }

  return [...candidates];
}

/**
 * 查询某店铺、某目标语言的所有图片映射，并动态生成译图可读 URL。
 * 供 App Proxy 端点调用，返回给店面前台 JS。
 */
export async function listImageMappingsByShopAndLanguage(params: {
  shop: string;
  targetCode: string;
}): Promise<ImageMappingEntry[]> {
  const targetCodes = resolveStorefrontTargetCodes(params.targetCode);
  console.info(
    `${LOG_PREFIX} query shop=${params.shop} iso=${params.targetCode} candidates=${targetCodes.join(",")}`,
  );
  const records = await prisma.imageMapping.findMany({
    where: { shop: params.shop, targetCode: { in: targetCodes } },
    select: { sourceUrl: true, targetBlobPath: true },
    orderBy: { createdAt: "desc" },
  });

  return records.flatMap((r) => {
    try {
      const targetUrl = getPictureTranslateResultImageUrl(r.targetBlobPath);
      return [{ sourceUrl: r.sourceUrl, targetUrl }];
    } catch {
      console.warn(`${LOG_PREFIX} 无法生成 targetUrl blobPath=${r.targetBlobPath}`);
      return [];
    }
  });
}
