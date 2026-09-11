import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { CreateOperationKind } from "../../../lib/createCapabilities";
import {
  pageColorTokens,
  twoColumnLayoutStyle,
  twoColumnMainStyle,
  twoColumnSideStyle,
} from "../../page/pageUiStyles";

type KindTone = {
  background: string;
  color: string;
};

function resolveKindTone(kind: CreateOperationKind): KindTone {
  switch (kind) {
    case "read":
      return { background: pageColorTokens.mutedBg, color: pageColorTokens.textSecondary };
    case "generate":
      return { background: pageColorTokens.brandBlueLight, color: pageColorTokens.brandBlueDark };
    case "write":
      return { background: pageColorTokens.warningBg, color: pageColorTokens.warning };
    case "import":
      return { background: pageColorTokens.progressBg, color: pageColorTokens.progress };
    default: {
      const exhaustive: never = kind;
      return exhaustive;
    }
  }
}

/** 能力类型徽标：目录卡片与工作区共用，让「会不会改数据」始终可见。 */
export function CreateKindBadge({ kind }: { kind: CreateOperationKind }) {
  const { t } = useTranslation();
  const tone = resolveKindTone(kind);

  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold"
      style={{ background: tone.background, color: tone.color }}
    >
      {t(`createPage.kind.${kind}`)}
    </span>
  );
}

/**
 * 单个能力的工作区外框：左侧下指令、右侧看结果。
 * 页面标题由 CreatePage 的 PageHeaderNav 承担，这里只提供返回目录与类型标识。
 */
export function CreateOperationShell({
  kind,
  onBack,
  config,
  result,
}: {
  kind: CreateOperationKind;
  onBack: () => void;
  config: ReactNode;
  result: ReactNode;
}) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          className="cursor-pointer border-0 bg-transparent p-0 text-sm font-semibold"
          style={{ color: pageColorTokens.brandBlue }}
        >
          {t("createPage.backToCatalog")}
        </button>
        <CreateKindBadge kind={kind} />
      </div>
      <div style={twoColumnLayoutStyle}>
        <div style={twoColumnMainStyle}>{config}</div>
        <div style={twoColumnSideStyle}>{result}</div>
      </div>
    </div>
  );
}
