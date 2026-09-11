import { Button } from "antd";
import { useTranslation } from "react-i18next";
import { useEmbeddedNavigate } from "../../../hooks/useEmbeddedNavigate";
import {
  createDomainDescriptionKey,
  createDomainLabelKey,
  createOperationDescriptionKey,
  createOperationLabelKey,
  listCreateDomainSections,
  type CreateOperation,
  type CreateWorkspaceKey,
} from "../../../lib/createCapabilities";
import { buildWorkspaceChatPrefillPath } from "../../../lib/workspaceChatPrefill";
import { PageSurface, pageColorTokens } from "../../page/pageUiStyles";
import { CreateKindBadge } from "./CreateOperationShell";

function OperationCard({
  operation,
  onOpenWorkspace,
}: {
  operation: CreateOperation;
  onOpenWorkspace: (workspace: CreateWorkspaceKey) => void;
}) {
  const { t } = useTranslation();
  const navigate = useEmbeddedNavigate();

  return (
    <article
      className="flex flex-col gap-3 rounded-xl border p-4"
      style={{ borderColor: pageColorTokens.border, background: pageColorTokens.surface }}
    >
      <div className="flex items-start justify-between gap-3">
        <h3
          className="m-0 text-sm font-bold"
          style={{ color: pageColorTokens.textPrimary }}
        >
          {t(createOperationLabelKey(operation.key))}
        </h3>
        <CreateKindBadge kind={operation.kind} />
      </div>
      <p
        className="m-0 flex-1 text-xs leading-relaxed"
        style={{ color: pageColorTokens.textSecondary }}
      >
        {t(createOperationDescriptionKey(operation.key))}
      </p>
      {operation.status === "ready" ? (
        <Button type="primary" onClick={() => onOpenWorkspace(operation.workspace)}>
          {t("createPage.catalog.open")}
        </Button>
      ) : operation.status === "chat" ? (
        <Button
          onClick={() => {
            void navigate(
              buildWorkspaceChatPrefillPath({
                prompt: t(operation.chatPromptKey),
              }),
            );
          }}
        >
          {t("createPage.catalog.openInChat")}
        </Button>
      ) : null}
    </article>
  );
}

/** 能力目录：按域分组展示已上线能力，planned 条目不在这里露出。 */
export function CreateCatalog({
  onOpenWorkspace,
}: {
  onOpenWorkspace: (workspace: CreateWorkspaceKey) => void;
}) {
  const { t } = useTranslation();
  const sections = listCreateDomainSections();

  return (
    <div className="flex flex-col gap-5">
      {sections.map((section) => (
        <PageSurface
          key={section.domain}
          title={t(createDomainLabelKey(section.domain))}
          subtitle={t(createDomainDescriptionKey(section.domain))}
        >
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {section.operations.map((operation) => (
              <OperationCard
                key={operation.key}
                operation={operation}
                onOpenWorkspace={onOpenWorkspace}
              />
            ))}
          </div>
        </PageSurface>
      ))}
    </div>
  );
}
