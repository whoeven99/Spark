/**
 * 工作台对话上下文（商品/文章/订单/文件选择）的统一状态管理。
 * 从 WorkspaceAppShellPage 抽出。
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { SelectedShopifyObject } from "../../../lib/shopifyObjectTypes";
import type { ObjectQuerySelection } from "../../../lib/objectQuerySpec";
import { selectedShopifyObjectsToBatchProducts } from "../../../lib/workspaceContextProducts";
import { buildWorkspaceContextBlock } from "./messageTransforms";
import {
  isObjectType,
  isQueryableObjectType,
  WORKSPACE_HISTORY_UPLOAD_NOTE,
  type ContextTool,
  type FileRole,
  type LocalFileItem,
  type ObjectType,
  type QueryableObjectType,
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
    note: WORKSPACE_HISTORY_UPLOAD_NOTE,
    charCount: file.charCount,
  };
}

export function useWorkspaceContext() {
  const { t } = useTranslation();  const [activeContextTool, setActiveContextTool] = useState<ContextTool | null>(null);
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
  const [selectedFileIds, setSelectedFileIds] = useState<string[]>([]);
  const [fileRolesById, setFileRolesById] = useState<Record<string, FileRole>>({});

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
    setFileRolesById({});
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
    setSelectedFileIds([]);
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

  /** 覆盖某类型的手动选择（如任务卡单选商品写入上下文）。 */
  const replaceObjectSelection = useCallback(
    (type: ObjectType, objects: SelectedShopifyObject[]) => {
      setSelectedObjectsByType((current) => ({ ...current, [type]: objects }));
      if (isQueryableObjectType(type)) {
        setObjectQuerySelectionByType((current) =>
          current[type] ? { ...current, [type]: null } : current,
        );
      }
    },
    [],
  );

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

  const loadWorkspaceFiles = useCallback(async () => {
    setWorkspaceFilesLoading(true);
    setWorkspaceFilesError(null);
    try {
      const authQuery = typeof window !== "undefined" ? window.location.search : "";
      const res = await fetch(`/api/files${authQuery}`);
      if (!res.ok) {
        throw new Error(t("workspace.shell.contextPicker.loadFailedStatus", { status: res.status }));
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
  }, [t]);

  useEffect(() => {
    if (activeContextTool === "file") {
      void loadWorkspaceFiles();
    }
  }, [activeContextTool, loadWorkspaceFiles]);

  const toggleFileSelection = useCallback((fileId: string) => {
    setSelectedFileIds((current) => (current.includes(fileId) ? current.filter((id) => id !== fileId) : [...current, fileId]));
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
        throw new Error(t("workspace.shell.contextPicker.uploadFailedStatus", { status: res.status }));
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
  }, [t]);

  const deleteLocalFile = useCallback(async (localId: string, serverId: string | null) => {
    setLocalFiles((current) => current.filter((f) => f.id !== localId));
    setSelectedFileIds((current) => current.filter((id) => id !== localId));
    if (!serverId) return;
    const authQuery = typeof window !== "undefined" ? window.location.search : "";
    await fetch(`/api/files/${serverId}/delete${authQuery}`, { method: "DELETE" }).catch(() => {});
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
    (selectedFileIds.length > 0 ? 1 : 0);

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
        localFiles,
        fileRolesById,
      }),
    [
      selectedObjectsByType,
      objectQuerySelectionByType,
      selectedFileIds,
      localFiles,
      fileRolesById,
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
    replaceObjectSelection,
    objectQuerySelectionByType,
    setObjectQuerySelection,
    fileRolesById,
    setFileRole,
    totalQuerySelections,
    localFiles,
    workspaceFilesLoading,
    workspaceFilesError,
    loadWorkspaceFiles,
    selectedFileIds,
    toggleFileSelection,
    addLocalFile,
    deleteLocalFile,
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
