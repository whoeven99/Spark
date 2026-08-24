/** 部署诊断：用于区分 Spark 主应用与遗留 DescriptionFD / Spring 前端。 */

export type SparkBuildInfo = {
  app: "spark";
  gitCommit: string | null;
  gitBranch: string | null;
  renderService: string | null;
  appUrl: string | null;
  nodeEnv: string;
};

export function getSparkBuildInfo(): SparkBuildInfo {
  return {
    app: "spark",
    gitCommit:
      process.env.RENDER_GIT_COMMIT?.trim() ||
      process.env.GIT_COMMIT?.trim() ||
      null,
    gitBranch: process.env.RENDER_GIT_BRANCH?.trim() || null,
    renderService: process.env.RENDER_SERVICE_NAME?.trim() || null,
    appUrl: process.env.SHOPIFY_APP_URL?.trim() || null,
    nodeEnv: process.env.NODE_ENV ?? "development",
  };
}
