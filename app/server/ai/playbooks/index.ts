import { globalPlaybookRegistry } from "../core/playbookRegistry.server";
import { shopHealthCheckPlaybook } from "./shopHealthCheck/index";
import { productLaunchPipelinePlaybook } from "./productLaunchPipeline/index";

// ──────────────────────────────────────────────
// 注册所有 Playbook Skills
// ──────────────────────────────────────────────

globalPlaybookRegistry.register(shopHealthCheckPlaybook);
globalPlaybookRegistry.register(productLaunchPipelinePlaybook);
