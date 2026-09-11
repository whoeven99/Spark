import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { useFeatureView } from "../../lib/featureTrack";
import {
  createOperationDescriptionKey,
  createOperationLabelKey,
  findCreateOperationByWorkspace,
  type CreateWorkspaceKey,
} from "../../lib/createCapabilities";
import { CreateCatalog } from "../component/create/CreateCatalog";
import { CreateCopyWorkspace } from "../component/create/CreateCopyWorkspace";
import { CreateImageWorkspace } from "../component/create/CreateImageWorkspace";
import { PageHeaderNav } from "./pageUiStyles";

function CreateWorkspaceView({
  workspace,
  onBack,
}: {
  workspace: CreateWorkspaceKey;
  onBack: () => void;
}) {
  switch (workspace) {
    case "copy":
      return <CreateCopyWorkspace onBack={onBack} />;
    case "image-generate":
      return <CreateImageWorkspace mode="generate" onBack={onBack} />;
    case "image-translate":
      return <CreateImageWorkspace mode="translate" onBack={onBack} />;
    default: {
      const exhaustive: never = workspace;
      return exhaustive;
    }
  }
}

/**
 * 创作页：一级是能力目录，选中某个能力后在本页打开它的工作区。
 * 能力清单登记在 `app/lib/createCapabilities.ts`，这里不硬编码工具列表。
 */
export function CreatePage() {
  const { t } = useTranslation();
  const [workspace, setWorkspace] = useState<CreateWorkspaceKey | null>(null);
  useFeatureView("create");

  const backToCatalog = useCallback(() => {
    setWorkspace(null);
  }, []);

  const activeOperation = workspace ? findCreateOperationByWorkspace(workspace) : undefined;

  return (
    <>
      <PageHeaderNav
        title={
          activeOperation
            ? t(createOperationLabelKey(activeOperation.key))
            : t("createPage.title")
        }
        subtitle={
          activeOperation
            ? t(createOperationDescriptionKey(activeOperation.key))
            : t("createPage.subtitle")
        }
        titleBarTitle={t("nav.create")}
        backLabel={t("common.backToPrevious")}
        fallbackPath="/app"
      />
      {workspace ? (
        <CreateWorkspaceView workspace={workspace} onBack={backToCatalog} />
      ) : (
        <CreateCatalog onOpenWorkspace={setWorkspace} />
      )}
    </>
  );
}
