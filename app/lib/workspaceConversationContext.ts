/**
 * 工作台会话上下文快照：落库到 Conversation.contextJson，刷新/换端可恢复选中项。
 */
import type { ObjectQuerySelection } from "./objectQuerySpec";
import type { SelectedShopifyObject } from "./shopifyObjectTypes";

export type WorkspaceContextFileRole = "reference" | "data" | "style";

export type WorkspaceConversationContextV1 = {
  v: 1;
  selectedObjectsByType: {
    product: SelectedShopifyObject[];
    article: SelectedShopifyObject[];
    order: SelectedShopifyObject[];
  };
  objectQuerySelectionByType: {
    product: ObjectQuerySelection | null;
    article: ObjectQuerySelection | null;
  };
  /** 已上传文件的服务端 ID（不含本地上传中临时 id） */
  selectedFileIds: string[];
  fileRolesById: Record<string, WorkspaceContextFileRole>;
};

export type WorkspaceConversationContext = WorkspaceConversationContextV1;

const EMPTY_OBJECTS = {
  product: [] as SelectedShopifyObject[],
  article: [] as SelectedShopifyObject[],
  order: [] as SelectedShopifyObject[],
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseSelectedObject(value: unknown): SelectedShopifyObject | null {
  if (!isRecord(value) || typeof value.id !== "string" || !value.id.trim()) return null;
  const title = typeof value.title === "string" ? value.title : value.id;
  const imageUrl =
    value.imageUrl === null
      ? null
      : typeof value.imageUrl === "string"
        ? value.imageUrl
        : undefined;
  return { id: value.id, title, ...(imageUrl !== undefined ? { imageUrl } : {}) };
}

function parseObjectList(value: unknown): SelectedShopifyObject[] {
  if (!Array.isArray(value)) return [];
  const items: SelectedShopifyObject[] = [];
  for (const entry of value) {
    const item = parseSelectedObject(entry);
    if (item) items.push(item);
  }
  return items;
}

function parseQuerySelection(value: unknown): ObjectQuerySelection | null {
  if (value == null) return null;
  if (!isRecord(value) || (value.kind !== "product" && value.kind !== "article")) return null;
  const matchCount =
    typeof value.matchCount === "number"
      ? value.matchCount
      : value.matchCount === null
        ? null
        : null;
  return {
    kind: value.kind,
    ...(typeof value.keyword === "string" ? { keyword: value.keyword } : {}),
    ...(typeof value.status === "string"
      ? { status: value.status as ObjectQuerySelection["status"] }
      : {}),
    ...(typeof value.tag === "string" ? { tag: value.tag } : {}),
    ...(typeof value.maxInventory === "number" ? { maxInventory: value.maxInventory } : {}),
    matchCount,
  };
}

function parseFileRole(value: unknown): WorkspaceContextFileRole | null {
  return value === "reference" || value === "data" || value === "style" ? value : null;
}

export function emptyWorkspaceConversationContext(): WorkspaceConversationContextV1 {
  return {
    v: 1,
    selectedObjectsByType: { ...EMPTY_OBJECTS, product: [], article: [], order: [] },
    objectQuerySelectionByType: { product: null, article: null },
    selectedFileIds: [],
    fileRolesById: {},
  };
}

export function parseWorkspaceConversationContext(
  raw: string | null | undefined,
): WorkspaceConversationContext | null {
  if (!raw?.trim()) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!isRecord(parsed) || parsed.v !== 1) return null;
    const objects = isRecord(parsed.selectedObjectsByType)
      ? parsed.selectedObjectsByType
      : {};
    const queries = isRecord(parsed.objectQuerySelectionByType)
      ? parsed.objectQuerySelectionByType
      : {};
    const fileIds = Array.isArray(parsed.selectedFileIds)
      ? parsed.selectedFileIds.filter((id): id is string => typeof id === "string" && Boolean(id.trim()))
      : [];
    const rolesRaw = isRecord(parsed.fileRolesById) ? parsed.fileRolesById : {};
    const fileRolesById: Record<string, WorkspaceContextFileRole> = {};
    for (const [id, role] of Object.entries(rolesRaw)) {
      const parsedRole = parseFileRole(role);
      if (parsedRole) fileRolesById[id] = parsedRole;
    }
    return {
      v: 1,
      selectedObjectsByType: {
        product: parseObjectList(objects.product),
        article: parseObjectList(objects.article),
        order: parseObjectList(objects.order),
      },
      objectQuerySelectionByType: {
        product: parseQuerySelection(queries.product),
        article: parseQuerySelection(queries.article),
      },
      selectedFileIds: fileIds,
      fileRolesById,
    };
  } catch {
    return null;
  }
}

export function serializeWorkspaceConversationContext(
  context: WorkspaceConversationContext,
): string {
  return JSON.stringify(context);
}

export function isWorkspaceConversationContextEmpty(
  context: WorkspaceConversationContext | null | undefined,
): boolean {
  if (!context) return true;
  const { selectedObjectsByType, objectQuerySelectionByType, selectedFileIds } = context;
  return (
    selectedObjectsByType.product.length === 0 &&
    selectedObjectsByType.article.length === 0 &&
    selectedObjectsByType.order.length === 0 &&
    !objectQuerySelectionByType.product &&
    !objectQuerySelectionByType.article &&
    selectedFileIds.length === 0
  );
}
