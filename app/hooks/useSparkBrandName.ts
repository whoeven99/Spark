import { useRouteLoaderData } from "react-router";
import { useTranslation } from "react-i18next";

type AppShellLoaderData = {
  isTestBrand?: boolean;
};

export function useIsTestBrand(): boolean {
  const appData = useRouteLoaderData("routes/app") as AppShellLoaderData | undefined;
  return Boolean(appData?.isTestBrand);
}

/** 测 / 本地显示 Spark Test，产环境仍是 Spark AI。 */
export function useSparkBrandName(): string {
  const { t } = useTranslation();
  return t(
    useIsTestBrand()
      ? "workspace.shell.brand.nameTest"
      : "workspace.shell.brand.name",
  );
}