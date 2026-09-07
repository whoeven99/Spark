import { resolveOpsEnvLabel } from "../server/feishu/feishuMessageFormat.server";
import { SPARK_AVATAR_SRC_PROD, SPARK_AVATAR_SRC_TEST } from "./sparkAvatar";

export function isTestSparkBrand(env?: NodeJS.ProcessEnv): boolean {
  return resolveOpsEnvLabel(env) !== "生产";
}

/** 产环境用紫粉标；测 / 本地用青绿标，避免和产应用搞混。 */
export function getSparkAvatarSrc(env?: NodeJS.ProcessEnv): string {
  return isTestSparkBrand(env) ? SPARK_AVATAR_SRC_TEST : SPARK_AVATAR_SRC_PROD;
}
