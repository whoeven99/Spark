import { globalPlaybookRegistry } from "../core/playbookRegistry.server";
import { inventoryRiskMitigationPlaybook } from "./inventoryRiskMitigation/index";
import { refundIssueReviewPlaybook } from "./refundIssueReview/index";
import { shopHealthCheckPlaybook } from "./shopHealthCheck/index";
import { productLaunchPipelinePlaybook } from "./productLaunchPipeline/index";

// ──────────────────────────────────────────────
// 注册所有 Playbook Skills
// ──────────────────────────────────────────────

globalPlaybookRegistry.register(shopHealthCheckPlaybook);
globalPlaybookRegistry.register(productLaunchPipelinePlaybook);
globalPlaybookRegistry.register(inventoryRiskMitigationPlaybook);
globalPlaybookRegistry.register(refundIssueReviewPlaybook);
