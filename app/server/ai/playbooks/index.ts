import { globalPlaybookRegistry } from "../core/playbookRegistry.server";
import type { PlaybookDefinition } from "../core/playbookRegistry.server";
import { inventoryRiskMitigationPlaybook } from "./inventoryRiskMitigation/index";
import { refundIssueReviewPlaybook } from "./refundIssueReview/index";
import { shopHealthCheckPlaybook } from "./shopHealthCheck/index";
import { productLaunchPipelinePlaybook } from "./productLaunchPipeline/index";

/**
 * 临时总开关：Playbook 诊断先全部屏蔽，确认后再按需逐个打开。
 * 改为 true 后仍可对单个 Playbook 去掉 visibility/condition 覆盖。
 */
const PLAYBOOKS_ENABLED = false;

function registerPlaybook(def: PlaybookDefinition) {
  globalPlaybookRegistry.register({
    ...def,
    // 不对商户介绍；启用后默认仍先按 internal，确认后再改 public
    visibility: "internal",
    condition: async (ctx) => {
      if (!PLAYBOOKS_ENABLED) return false;
      if (def.condition) return def.condition(ctx);
      return true;
    },
  });
}

// ──────────────────────────────────────────────
// 注册所有 Playbook Skills（当前全部未激活）
// ──────────────────────────────────────────────

registerPlaybook(shopHealthCheckPlaybook);
registerPlaybook(productLaunchPipelinePlaybook);
registerPlaybook(inventoryRiskMitigationPlaybook);
registerPlaybook(refundIssueReviewPlaybook);
