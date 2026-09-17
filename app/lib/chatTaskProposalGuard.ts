import {
  PRODUCT_EXPORT_SKILL_ID,
  PRODUCT_IMPORT_SKILL_ID,
} from "./productManageTaskProposals";
import {
  BATCH_PICTURE_TRANSLATE_SKILL_ID,
  BATCH_PRODUCT_IMPROVE_SKILL_ID,
  BULK_PRICE_EDIT_SKILL_ID,
  BULK_STATUS_EDIT_SKILL_ID,
  BULK_TAG_EDIT_SKILL_ID,
  IMAGE_GENERATION_SKILL_ID,
  type TaskProposalPayload,
} from "./taskProposalPayload";

const CATALOG_RULE_SKILL_IDS = new Set([
  BULK_PRICE_EDIT_SKILL_ID,
  BULK_TAG_EDIT_SKILL_ID,
  BULK_STATUS_EDIT_SKILL_ID,
  PRODUCT_EXPORT_SKILL_ID,
  PRODUCT_IMPORT_SKILL_ID,
]);

const COPY_OR_MEDIA_SKILL_IDS = new Set([
  BATCH_PRODUCT_IMPROVE_SKILL_ID,
  BATCH_PICTURE_TRANSLATE_SKILL_ID,
  IMAGE_GENERATION_SKILL_ID,
]);

/**
 * 已有调价 / 打标 / 上下架 / 导入导出确认卡时，禁止被文案、图片翻译或出图卡覆盖。
 * 同一 skill 允许更新参数。
 */
export function shouldKeepExistingTaskProposal(
  current: TaskProposalPayload | null | undefined,
  incoming: TaskProposalPayload,
): boolean {
  if (!current) return false;
  if (current.skillId === incoming.skillId) return false;
  return (
    CATALOG_RULE_SKILL_IDS.has(current.skillId) &&
    COPY_OR_MEDIA_SKILL_IDS.has(incoming.skillId)
  );
}
