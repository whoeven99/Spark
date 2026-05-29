import { existsBlockingV4Job } from "./cosmosV4Store.server";
import { ACTIVE_V4_STATUSES, type TranslationV4Status } from "./types";

/** 初始化 / 翻译 / 写入 / 校验进行中时禁止同语言对重复创建 */
export const BLOCKING_V4_STATUSES: TranslationV4Status[] = ACTIVE_V4_STATUSES;

export async function existsBlockingV4Task(
  shopName: string,
  source: string,
  target: string,
): Promise<boolean> {
  return existsBlockingV4Job(shopName, source, target, BLOCKING_V4_STATUSES);
}
