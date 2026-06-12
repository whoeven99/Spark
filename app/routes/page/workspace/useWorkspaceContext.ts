/**
 * 工作台对话上下文（商品/文章/订单/文件/富媒体选择）的统一状态管理。
 * 从 WorkspaceAppShellPage 抽出，后续 TaskProposal / 约束条件等上下文能力在此扩展。
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import type { SelectedShopifyObject } from "../../../lib/shopifyObjectTypes";
import type { ObjectQuerySelection } from "../../../lib/objectQuerySpec";
import { selectedShopifyObjectsToBatchProducts } from "../../../lib/workspaceContextProducts";
import { buildWorkspaceContextBlock } from "./messageTransforms";
import {
  isObjectType,
  isQueryableObjectType,
  type ContextTool,
  type FileRole,
  type LocalFileItem,
  type ObjectType,
  type QueryableObjectType,
  type RichMediaItem,
} from "./types";

type WorkspaceFileListRecord = {
  id: string;
  name: string;
  originalSize: number;
  charCount: number;
  createdAt: string;
};

function formatFileSizeLabel(bytes: number): string {
  if (bytes >= 1024 * 1024) {
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  }
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function workspaceFileToLocalItem(file: WorkspaceFileListRecord): LocalFileItem {
  return {
    id: file.id,
    serverId: file.id,
    name: file.name,
    size: formatFileSizeLabel(file.originalSize),
    note: "历史上传",
    charCount: file.charCount,
  };
}

const initialRichMediaItems: RichMediaItem[] = [
  { id: "media-1", title: "Summer campaign landing", kind: "url", value: "https://spark-demo.shop/summer", note: "活动落地页 URL" },
  { id: "media-2", title: "hero-reference.jpg", kind: "image", value: "https://cdn.spark.demo/hero-reference.jpg", note: "主视觉参考图" },
  { id: "media-3", title: "product-demo.mp4", kind: "video", value: "https://cdn.spark.demo/product-demo.mp4", note: "商品讲解视频" },
];

export function useWorkspaceContext() {
  const [activeContextTool, setActiveContextTool] = useState<ContextTool | null>(null);
  const [objectQueryByType, setObjectQueryByType] = useState<Record<ObjectType, string>>({
    product: "",
    article: "",
    order: "",
  });
  const [selectedObjectsByType, setSelectedObjectsByType] = useState<
    Record<ObjectType, SelectedShopifyObject[]>
  >({
    product: [],
    article: [],
    order: [],
  });
  const [objectQuerySelectionByType, setObjectQuerySelectionByType] = useState<
    Record<QueryableObjectType, ObjectQuerySelection | null>
  >({
    product: null,
    article: null,
  });
  const [localFiles, setLocalFiles] = useState<LocalFileItem[]>([]);
  const [workspaceFilesLoading, setWorkspaceFilesLoading] = useState(false);
  const [workspaceFilesError, setWorkspaceFilesError] = useState<string | null>(null);
  const [richMediaItems, setRichMediaItems] = useState<RichMediaItem[]>(initialRichMediaItems);
  const [selectedFileIds, setSelectedFileIds] = useState<string[]>([]);
  const [selectedMediaIds, setSelectedMediaIds] = useState<string[]>([]);
  const [fileRolesById, setFileRolesById] = useState<Record<string, FileRole>>({});
  const [constraints, setConstraints] = useState<string[]>([]);

  const toggleContextTool = useCallback((tool: ContextTool) => {
    setActiveContextTool((current) => (current === tool ? null : tool));
  }, []);

  const closeContextTool = useCallback(() => {
    setActiveContextTool(null);
  }, []);

  const clearContext = useCallback(() => {
    setSelectedObjectsByType({ product: [], article: [], order: [] });
    setObjectQuerySelectionByType({ product: null, article: null });
    setSelectedFileIds([]);
    setSelectedMediaIds([]);
    setFileRolesById({});
    setConstraints([]);
    setActiveContextTool(null);
  }, []);

  const clearToolSelection = useCallback((tool: ContextTool) => {
    if (isObjectType(tool)) {
      setSelectedObjectsByType((current) => ({ ...current, [tool]: [] }));
      if (isQueryableObjectType(tool)) {
        setObjectQuerySelectionByType((current) => ({ ...current, [tool]: null }));
      }
      return;
    }
    if (tool === "file") {
      setSelectedFileIds([]);
      return;
    }
    if (tool === "constraint") {
      setConstraints([]);
      return;
    }
    setSelectedMediaIds([]);
  }, []);

  const setObjectQuery = useCallback((type: ObjectType, value: string) => {
    setObjectQueryByType((current) => ({ ...current, [type]: value }));
  }, []);

  const toggleObjectSelection = useCallback((type: ObjectType, object: SelectedShopifyObject) => {
    setSelectedObjectsByType((current) => {
      const currentItems = current[type];
      return {
        ...current,
        [type]: currentItems.some((item) => item.id === object.id)
          ? currentItems.filter((item) => item.id !== object.id)
          : [...currentItems, object],
      };
    });
    // 手动勾选与按条件圈定互斥：动了手动选择就放弃该类型的 query
    if (isQueryableObjectType(type)) {
      setObjectQuerySelectionByType((current) =>
        current[type] ? { ...current, [type]: null } : current,
      );
    }
  }, []);

  /** 按条件圈定（与手动勾选互斥：保存 query 时清空该类型的手动选择）。传 null 取消圈定。 */
  const setObjectQuerySelection = useCallback(
    (type: QueryableObjectType, selection: ObjectQuerySelection | null) => {
      setObjectQuerySelectionByType((current) => ({ ...current, [type]: selection }));
      if (selection) {
        setSelectedObjectsByType((current) =>
          current[type].length > 0 ? { ...current, [type]: [] } : current,
        );
      }
    },
    [],
  );

  const setFileRole = useCallback((fileId: string, role: FileRole) => {
    setFileRolesById((current) => ({ ...current, [fileId]: role }));
  }, []);

  const addConstraint = useCallback((text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setConstraints((current) => (current.includes(trimmed) ? current : [...current, trimmed]));
  }, []);

  const removeConstraint = useCallback((text: string) => {
    setConstraints((current) => current.filter((item) => item !== text));
  }, []);

  const loadWorkspaceFiles = useCallback(async () => {
    setWorkspaceFilesLoading(true);
    setWorkspaceFilesError(null);
    try {
      const authQuery = typeof window !== "undefined" ? window.location.search : "";
      const res = await fetch(`/api/files${authQuery}`);
      if (!res.ok) {
        const errData = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(errData.error ?? `加载失败 (${res.status})`);
      }
      const data = (await res.json()) as { files: WorkspaceFileListRecord[] };
      setLocalFiles((current) => {
        const inFlight = current.filter((file) => file.uploading);
        const serverItems = data.files.map(workspaceFileToLocalItem);
        const seen = new Set(serverItems.map((file) => file.id));
        const recentUploaded = current.filter(
          (file) => file.serverId && !seen.has(file.serverId) && !file.uploading,
        );
        return [...inFlight, ...recentUploaded, ...serverItems];
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setWorkspaceFilesError(msg);
    } finally {
      setWorkspaceFilesLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeContextTool === "file") {
      void loadWorkspaceFiles();
    }
  }, [activeContextTool, loadWorkspaceFiles]);

  const toggleFileSelection = useCallback((fileId: string) => {
    setSelectedFileIds((current) => (current.includes(fileId) ? current.filter((id) => id !== fileId) : [...current, fileId]));
  }, []);

  const toggleMediaSelection = useCallback((mediaId: string) => {
    setSelectedMediaIds((current) => (current.includes(mediaId) ? current.filter((id) => id !== mediaId) : [...current, mediaId]));
  }, []);

  const addLocalFile = useCallback(async (payload: { file: File; note?: string }) => {
    const localId = `file-${Date.now()}`;
    const sizeLabel = payload.file.size > 1024 * 1024
      ? `${(payload.file.size / 1024 / 1024).toFixed(1)} MB`
      : `${Math.round(payload.file.size / 1024)} KB`;

    setLocalFiles((current) => [
      { id: localId, name: payload.file.name, note: payload.note?.trim() || "", size: sizeLabel, serverId: null, uploading: true },
      ...current,
    ]);
    setSelectedFileIds((current) => [localId, ...current]);

    try {
      const authQuery = typeof window !== "undefined" ? window.location.search : "";
      const formData = new FormData();
      formData.append("file", payload.file);
      formData.append("note", payload.note?.trim() ?? "");
      const res = await fetch(`/api/upload-file${authQuery}`, { method: "POST", body: formData });
      if (!res.ok) {
        const errData = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(errData.error ?? `上传失败 (${res.status})`);
      }
      const data = (await res.json()) as { id: string; charCount?: number };
      setLocalFiles((current) =>
        current.map((f) =>
          f.id === localId
            ? {
                ...f,
                id: data.id,
                serverId: data.id,
                charCount: data.charCount,
                uploading: false,
                uploadError: undefined,
                note: payload.note?.trim() || "",
              }
            : f,
        ),
      );
      setSelectedFileIds((current) =>
        current.map((id) => (id === localId ? data.id : id)),
      );
      setFileRolesById((current) => {
        if (!(localId in current)) return current;
        const { [localId]: role, ...rest } = current;
        return { ...rest, [data.id]: role };
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setLocalFiles((current) =>
        current.map((f) =>
          f.id === localId ? { ...f, uploading: false, uploadError: msg } : f,
        ),
      );
    }
  }, []);

  const deleteLocalFile = useCallback(async (localId: string, serverId: string | null) => {
    setLocalFiles((current) => current.filter((f) => f.id !== localId));
    setSelectedFileIds((current) => current.filter((id) => id !== localId));
    if (!serverId) return;
    const authQuery = typeof window !== "undefined" ? window.location.search : "";
    await fetch(`/api/files/${serverId}/delete${authQuery}`, { method: "DELETE" }).catch(() => {});
  }, []);

  const addRichMediaItem = useCallback((payload: { title: string; kind: RichMediaItem["kind"]; value: string; note: string }) => {
    const id = `media-${Date.now()}`;
    setRichMediaItems((current) => [{ id, ...payload }, ...current]);
    setSelectedMediaIds((current) => [id, ...current]);
  }, []);

  const totalSelectedObjects = useMemo(
    () => Object.values(selectedObjectsByType).reduce((count, items) => count + items.length, 0),
    [selectedObjectsByType],
  );

  const totalQuerySelections = useMemo(
    () => Object.values(objectQuerySelectionByType).filter(Boolean).length,
    [objectQuerySelectionByType],
  );

  const filledContextCount =
    (totalSelectedObjects > 0 || totalQuerySelections > 0 ? 1 : 0) +
    (selectedFileIds.length > 0 ? 1 : 0) +
    (selectedMediaIds.length > 0 ? 1 : 0) +
    (constraints.length > 0 ? 1 : 0);

  /** 已上传成功的服务端文件 ID（用于 chat-stream 注入文件内容） */
  const uploadedFileIds = useMemo(
    () =>
      selectedFileIds
        .map((id) => localFiles.find((f) => f.id === id)?.serverId)
        .filter((sid): sid is string => typeof sid === "string"),
    [selectedFileIds, localFiles],
  );

  const workspaceBatchProducts = useMemo(
    () => selectedShopifyObjectsToBatchProducts(selectedObjectsByType.product),
    [selectedObjectsByType.product],
  );

  const buildContextBlock = useCallback(
    () =>
      buildWorkspaceContextBlock({
        selectedObjectsByType,
        objectQuerySelectionByType,
        selectedFileIds,
        selectedMediaIds,
        localFiles,
        richMediaItems,
        fileRolesById,
        constraints,
      }),
    [
      selectedObjectsByType,
      objectQuerySelectionByType,
      selectedFileIds,
      selectedMediaIds,
      localFiles,
      richMediaItems,
      fileRolesById,
      constraints,
    ],
  );

  return {
    activeContextTool,
    toggleContextTool,
    closeContextTool,
    objectQueryByType,
    setObjectQuery,
    selectedObjectsByType,
    toggleObjectSelection,
    objectQuerySelectionByType,
    setObjectQuerySelection,
    fileRolesById,
    setFileRole,
    constraints,
    addConstraint,
    removeConstraint,
    totalQuerySelections,
    localFiles,
    workspaceFilesLoading,
    workspaceFilesError,
    loadWorkspaceFiles,
    richMediaItems,
    addRichMediaItem,
    selectedFileIds,
    toggleFileSelection,
    addLocalFile,
    deleteLocalFile,
    selectedMediaIds,
    toggleMediaSelection,
    clearContext,
    clearToolSelection,
    totalSelectedObjects,
    filledContextCount,
    uploadedFileIds,
    workspaceBatchProducts,
    buildContextBlock,
  };
}

export type WorkspaceContextController = ReturnType<typeof useWorkspaceContext>;
