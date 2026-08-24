import { useEffect, useState, useCallback, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Typography,
  Button,
  Modal,
  Drawer,
  Form,
  Input,
  InputNumber,
  Select,
  Spin,
  Alert,
  Popconfirm,
  Tooltip,
  Dropdown,
  message,
} from "antd";
import type { MenuProps } from "antd";
import { PlusOutlined, EditOutlined, DeleteOutlined, LinkOutlined } from "@ant-design/icons";
import {
  fetchTodos,
  createTodo,
  updateTodo,
  deleteTodo,
  fetchTodoComments,
  createTodoComment,
  getAdminUserId,
  getAdminUserLabel,
  type TodoRow,
  type TodoComment,
  type TodoStatus,
  type TodoPriority,
  type TodoAssignee,
} from "../api";

/* ------------------------------------------------------------------ *
 * Design tokens (ported from the prototype)
 * ------------------------------------------------------------------ */

const MEMBERS: { key: TodoAssignee; label: string; hue: string; soft: string }[] = [
  { key: "yewen",    label: "Yewen",    hue: "#3b7fc4", soft: "#eaf2fb" },
  { key: "allen",    label: "Allen",    hue: "#2f9e6b", soft: "#e8f6ef" },
  { key: "zhuangze", label: "Zhuangze", hue: "#8b5cd6", soft: "#f2ebfb" },
];
const UNASSIGNED = { key: null as null, label: "未分配", hue: "#9ca3af", soft: "#f1f0ee" };
const COLS = [...MEMBERS, UNASSIGNED];

const STATUS: Record<TodoStatus, { label: string; hue: string; soft: string; icon: string }> = {
  doing: { label: "进行中", hue: "#d97706", soft: "#fdf3e3", icon: "▶" },
  todo:  { label: "待办",   hue: "#52606e", soft: "#eef1f4", icon: "◷" },
  done:  { label: "已完成", hue: "#0f9d6e", soft: "#e7f6ef", icon: "✓" },
};
const STATUS_ORDER: TodoStatus[] = ["doing", "todo", "done"];

const PRI: Record<TodoPriority, { label: string; color: string; soft: string }> = {
  high:   { label: "高", color: "#dc2626", soft: "#fdeceb" },
  medium: { label: "中", color: "#d97706", soft: "#fdf3e3" },
  low:    { label: "低", color: "#6b7280", soft: "#f1f0ee" },
};

const FONT = "Manrope, system-ui, sans-serif";        // add a <link> in index.html, or drop this line
const MONO = "'Geist Mono', ui-monospace, monospace";

type FormValues = {
  title: string;
  description?: string;
  assignee?: TodoAssignee;
  priority: TodoPriority;
  status: TodoStatus;
  followers?: TodoAssignee[];
};

function normalizeTodo(row: TodoRow): TodoRow {
  return { ...row, followers: Array.isArray(row.followers) ? row.followers : [] };
}

function todoPayload(todo: Pick<TodoRow, "title" | "description" | "assignee" | "status" | "priority" | "etaDays" | "followers">) {
  return {
    title: todo.title,
    description: todo.description,
    assignee: todo.assignee ?? null,
    status: todo.status,
    priority: todo.priority,
    etaDays: todo.etaDays ?? null,
    followers: todo.followers ?? [],
  };
}

/* ------------------------------------------------------------------ */

export default function Todo() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [todos, setTodos] = useState<TodoRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<TodoRow | null>(null);
  const [saving, setSaving] = useState(false);
  const me = getAdminUserId() ?? MEMBERS[0].key;
  const meLabel = getAdminUserLabel();

  // detail drawer (progress comments + followers)
  const [detailTodo, setDetailTodo] = useState<TodoRow | null>(null);
  const [comments, setComments] = useState<TodoComment[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentBody, setCommentBody] = useState("");
  const [commentSaving, setCommentSaving] = useState(false);
  const [deepLinkMissing, setDeepLinkMissing] = useState(false);

  // drag-and-drop UI state
  const [dragId, setDragId] = useState<string | null>(null);
  const [overCell, setOverCell] = useState<string | null>(null);

  const [form] = Form.useForm<FormValues>();

  const load = useCallback(() => {
    setLoading(true);
    fetchTodos()
      .then((r) => setTodos(r.todos.map(normalizeTodo)))
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load]);

  const loadComments = useCallback(async (todoId: string) => {
    setCommentsLoading(true);
    try {
      const r = await fetchTodoComments(todoId);
      setComments(r.comments);
    } catch (e) {
      setError(String(e));
    } finally {
      setCommentsLoading(false);
    }
  }, []);

  function setTodoIdInUrl(todoId: string | null) {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (todoId) next.set("id", todoId);
        else next.delete("id");
        return next;
      },
      { replace: true },
    );
  }

  /** Click opens via URL; the effect below owns drawer state. */
  function openDetail(todo: TodoRow) {
    setDeepLinkMissing(false);
    setTodoIdInUrl(todo.id);
  }

  function closeDetail() {
    setTodoIdInUrl(null);
  }

  // Deep link: /todo?id=<uuid> opens the detail drawer after list loads.
  useEffect(() => {
    if (loading) return;
    const id = searchParams.get("id")?.trim() ?? "";
    if (!id) {
      setDeepLinkMissing(false);
      setDetailTodo(null);
      setComments([]);
      setCommentBody("");
      return;
    }
    if (detailTodo?.id === id) return;
    const hit = todos.find((t) => t.id === id);
    if (hit) {
      setDeepLinkMissing(false);
      setDetailTodo(hit);
      setCommentBody("");
      void loadComments(hit.id);
      return;
    }
    setDeepLinkMissing(true);
    setDetailTodo(null);
    setComments([]);
    setCommentBody("");
  }, [loading, todos, searchParams, detailTodo?.id, loadComments]);

  /* ---- create / edit modal (kept from the original) ---- */

  function openCreate() {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({
      priority: "medium",
      status: "todo",
      followers: [],
    });
    setModalOpen(true);
  }
  function openEdit(todo: TodoRow) {
    setEditing(todo);
    form.setFieldsValue({
      title: todo.title,
      description: todo.description ?? undefined,
      assignee: todo.assignee ?? undefined,
      priority: todo.priority,
      status: todo.status,
      followers: todo.followers ?? [],
    });
    setModalOpen(true);
  }
  async function handleSubmit(values: FormValues) {
    setSaving(true);
    try {
      if (editing) {
        await updateTodo(editing.id, {
          ...todoPayload({
            ...editing,
            title: values.title,
            description: values.description ?? null,
            assignee: values.assignee ?? null,
            status: values.status,
            priority: values.priority,
            followers: values.followers ?? editing.followers ?? [],
          }),
        });
        if (detailTodo?.id === editing.id) {
          setDetailTodo((prev) =>
            prev
              ? {
                  ...prev,
                  title: values.title,
                  description: values.description ?? null,
                  assignee: values.assignee ?? null,
                  status: values.status,
                  priority: values.priority,
                  followers: values.followers ?? prev.followers ?? [],
                }
              : prev,
          );
        }
      } else {
        await createTodo({
          title: values.title,
          description: values.description,
          assignee: values.assignee,
          priority: values.priority,
          etaDays: null,
          followers: values.followers ?? [],
          createdBy: me,
        });
      }
      setModalOpen(false);
      load();
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    setTodos((ts) => ts.filter((t) => t.id !== id)); // optimistic
    if (searchParams.get("id") === id) closeDetail();
    try { await deleteTodo(id); }
    catch (e) { setError(String(e)); load(); }
  }

  /* ---- THE KEY BIT: one drop sets status + assignee in a single call ---- */

  async function moveTo(todo: TodoRow, status: TodoStatus, assignee: TodoAssignee | null) {
    if (todo.status === status && (todo.assignee ?? null) === assignee) return;
    // optimistic update — no full reload, no flicker
    setTodos((ts) => ts.map((t) => (t.id === todo.id ? { ...t, status, assignee } : t)));
    if (detailTodo?.id === todo.id) {
      setDetailTodo((prev) => (prev ? { ...prev, status, assignee } : prev));
    }
    try {
      await updateTodo(todo.id, todoPayload({ ...todo, status, assignee }));
    } catch (e) {
      setError(String(e));
      load(); // roll back to server truth on failure
    }
  }

  async function patchTodo(
    todo: TodoRow,
    patch: Partial<Pick<TodoRow, "priority" | "assignee" | "etaDays" | "followers">>,
  ) {
    const next = { ...todo, ...patch };
    setTodos((ts) => ts.map((t) => (t.id === todo.id ? next : t)));
    if (detailTodo?.id === todo.id) setDetailTodo(next);
    try {
      await updateTodo(todo.id, todoPayload(next));
    } catch (e) {
      setError(String(e));
      load();
    }
  }

  async function submitComment() {
    if (!detailTodo) return;
    const body = commentBody.trim();
    if (!body) return;
    const author = me;
    setCommentSaving(true);
    try {
      const r = await createTodoComment(detailTodo.id, { author, body });
      setComments((cs) => [...cs, r.comment]);
      setCommentBody("");
      setTodos((ts) =>
        ts.map((t) =>
          t.id === detailTodo.id
            ? { ...t, updatedAt: r.comment.createdAt }
            : t,
        ),
      );
    } catch (e) {
      setError(String(e));
    } finally {
      setCommentSaving(false);
    }
  }

  if (error) return <Alert type="error" message={error} style={{ margin: 24 }} />;

  const cellId = (status: TodoStatus, col: TodoAssignee | null) => status + "::" + String(col);
  const itemsFor = (status: TodoStatus, col: TodoAssignee | null) =>
    todos.filter((t) => t.status === status && (t.assignee ?? null) === col);

  const colTmpl = `150px repeat(${COLS.length}, minmax(0, 1fr))`;
  const deepLinkId = searchParams.get("id")?.trim() ?? "";

  return (
    <div style={{ fontFamily: FONT, color: "#1c1b1a" }}>
      <style>{`
        .td-board { display: grid; grid-template-columns: ${colTmpl}; column-gap: 0; align-items: stretch; }
        .td-board-cell { min-width: 0; padding: 0 6px; }
        .td-card { min-width: 0; max-width: 100%; box-sizing: border-box; overflow: hidden; }
        .td-card .td-title { word-break: break-word; overflow-wrap: anywhere; min-width: 0; }
        .td-card .td-desc { word-break: break-word; overflow-wrap: anywhere; }
        .td-card .td-actions { opacity: 0; transition: opacity .14s ease; }
        .td-card:hover .td-actions { opacity: 1; }
        .td-iconbtn:hover { background: #f0eeec !important; }
      `}</style>

      {deepLinkMissing && deepLinkId && (
        <Alert
          type="warning"
          showIcon
          closable
          onClose={() => setTodoIdInUrl(null)}
          message="找不到该需求"
          description={`链接中的任务 id 不存在或已删除：${deepLinkId}`}
          style={{ marginBottom: 16 }}
        />
      )}

      {/* header */}
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 24, marginBottom: 18 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 28, height: 28, borderRadius: 8, background: "#5b53d6", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <div style={{ width: 11, height: 11, border: "2.5px solid #fff", borderRadius: 3 }} />
            </div>
            <Typography.Title level={4} style={{ margin: 0, fontWeight: 800, letterSpacing: "-.02em" }}>Team Todo</Typography.Title>
          </div>
          <p style={{ margin: "6px 0 0 38px", fontSize: 13, color: "#78716c" }}>
            拖动卡片流转；点击卡片打开详情、更新进度与跟进人。
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate} style={{ borderRadius: 10, fontWeight: 700 }}>
            新建任务
          </Button>
        </div>
      </div>

      {/* board */}
      <Spin spinning={loading}>
        <div style={{ background: "#fbfaf9", border: "1px solid #ece8e3", borderRadius: 18, padding: "14px 14px 18px", overflowX: "auto" }}>
          <div className="td-board" style={{ minWidth: 920 }}>

            {/* member column headers — same grid as status rows */}
            <div />
            {COLS.map((c) => (
              <div key={`hdr-${String(c.key)}`} className="td-board-cell" style={{ marginBottom: 8 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "8px 12px", background: "#fff", border: "1px solid #ece8e3", borderRadius: 11 }}>
                  <Avatar memKey={c.key} size={24} />
                  <span style={{ fontSize: 13, fontWeight: 700, color: c.key ? "#3c3935" : "#9ca3af" }}>{c.label}</span>
                  <span style={{ fontFamily: MONO, fontSize: 11, color: "#b3ada4" }}>
                    ·{todos.filter((t) => (t.assignee ?? null) === c.key).length}
                  </span>
                </div>
              </div>
            ))}

            {/* status rows — share column tracks with headers */}
            {STATUS_ORDER.flatMap((stKey) => {
              const st = STATUS[stKey];
              const rowTotal = todos.filter((t) => t.status === stKey).length;
              return [
                <div key={`${stKey}-rail`} style={{ paddingTop: 12, paddingRight: 6, marginBottom: 14 }}>
                  <div style={{ background: st.soft, borderRadius: 13, padding: 14, border: `1px solid ${st.hue}22` }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ color: st.hue, fontSize: 13 }}>{st.icon}</span>
                      <span style={{ fontSize: 14, fontWeight: 800, color: st.hue, letterSpacing: "-.01em" }}>{st.label}</span>
                    </div>
                    <div style={{ fontFamily: MONO, fontSize: 22, fontWeight: 700, color: st.hue, marginTop: 8, lineHeight: 1 }}>{rowTotal}</div>
                    <div style={{ fontSize: 11, color: st.hue, opacity: 0.7, marginTop: 3, fontWeight: 600 }}>项任务</div>
                  </div>
                </div>,
                ...COLS.map((col) => {
                  const id = cellId(stKey, col.key);
                  const over = overCell === id;
                  const items = itemsFor(stKey, col.key);
                  return (
                    <div
                      key={`${stKey}-${String(col.key)}`}
                      className="td-board-cell"
                      style={{ marginBottom: 14, borderRight: col.key === null ? "none" : "1px dashed #ebe6e0" }}
                      onDragOver={(e) => { e.preventDefault(); if (overCell !== id) setOverCell(id); }}
                      onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOverCell((c) => (c === id ? null : c)); }}
                      onDrop={(e) => {
                        e.preventDefault();
                        const t = todos.find((x) => x.id === dragId);
                        if (t) moveTo(t, stKey, col.key);
                        setDragId(null); setOverCell(null);
                      }}
                    >
                      <div style={{
                        padding: 10, display: "flex", flexDirection: "column", gap: 9, minHeight: 96,
                        background: over ? col.soft : "transparent",
                        boxShadow: over ? `inset 0 0 0 2px ${col.hue}` : "none",
                        borderRadius: over ? 12 : 0, transition: "background .12s ease, box-shadow .12s ease",
                      }}>
                        {items.length === 0 ? (
                          <div style={{ flex: 1, minHeight: 72, borderRadius: 11, border: `1.5px dashed ${over ? col.hue : "#e7e2db"}`, display: "flex", alignItems: "center", justifyContent: "center", color: over ? col.hue : "#cfc9c1", fontSize: 11.5, fontWeight: 600 }}>
                            {over ? "放到这里" : "—"}
                          </div>
                        ) : (
                          items.map((todo) => (
                            <TaskCard
                              key={todo.id}
                              todo={todo}
                              dragging={dragId === todo.id}
                              onDragStart={() => setDragId(todo.id)}
                              onDragEnd={() => { setDragId(null); setOverCell(null); }}
                              onOpen={() => openDetail(todo)}
                              onEdit={() => openEdit(todo)}
                              onDelete={() => handleDelete(todo.id)}
                              onPriorityChange={(p) => patchTodo(todo, { priority: p })}
                              onAssigneeChange={(a) => patchTodo(todo, { assignee: a })}
                              onEtaDaysChange={(d) => patchTodo(todo, { etaDays: d })}
                            />
                          ))
                        )}
                      </div>
                    </div>
                  );
                }),
              ];
            })}
          </div>
        </div>
      </Spin>

      {/* create / edit modal — unchanged from your original */}
      <Modal
        title={editing ? "编辑 Todo" : "新建 Todo"}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={() => form.submit()}
        okText={editing ? "保存" : "创建"}
        confirmLoading={saving}
        destroyOnClose
        width={560}
        styles={{ body: { maxHeight: "70vh", overflowY: "auto" } }}
      >
        <Form form={form} layout="vertical" onFinish={handleSubmit} style={{ marginTop: 8 }}>
          <Form.Item name="title" label="标题" rules={[{ required: true, message: "请填写标题" }]}>
            <Input placeholder="Todo 标题" />
          </Form.Item>
          <Form.Item name="description" label="描述">
            <Input.TextArea autoSize={{ minRows: 4, maxRows: 25 }} placeholder="可选描述" />
          </Form.Item>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Form.Item name="assignee" label="负责人">
              <Select allowClear placeholder="未分配">
                {MEMBERS.map((m) => (
                  <Select.Option key={m.key} value={m.key}>{m.label}</Select.Option>
                ))}
              </Select>
            </Form.Item>
            <Form.Item name="priority" label="优先级" rules={[{ required: true }]}>
              <Select>
                {(["high", "medium", "low"] as TodoPriority[]).map((p) => (
                  <Select.Option key={p} value={p}>{PRI[p].label}</Select.Option>
                ))}
              </Select>
            </Form.Item>
          </div>
          <Form.Item name="followers" label="跟进人">
            <Select mode="multiple" allowClear placeholder="可选，多人关注此任务">
              {MEMBERS.map((m) => (
                <Select.Option key={m.key} value={m.key}>{m.label}</Select.Option>
              ))}
            </Select>
          </Form.Item>
          {editing && (
            <Form.Item name="status" label="状态" rules={[{ required: true }]}>
              <Select>
                {STATUS_ORDER.map((s) => (
                  <Select.Option key={s} value={s}>{STATUS[s].label}</Select.Option>
                ))}
              </Select>
            </Form.Item>
          )}
        </Form>
      </Modal>

      <Drawer
        title={null}
        open={!!detailTodo}
        onClose={closeDetail}
        width={440}
        destroyOnClose
        styles={{ body: { padding: "20px 22px 24px" } }}
      >
        {detailTodo && (
          <TodoDetail
            todo={detailTodo}
            meLabel={meLabel}
            comments={comments}
            commentsLoading={commentsLoading}
            commentBody={commentBody}
            commentSaving={commentSaving}
            onCommentBodyChange={setCommentBody}
            onSubmitComment={() => void submitComment()}
            onEdit={() => openEdit(detailTodo)}
            onFollowersChange={(followers) => patchTodo(detailTodo, { followers })}
            onCopyLink={() => {
              const url = `${window.location.origin}${window.location.pathname}?id=${encodeURIComponent(detailTodo.id)}`;
              void navigator.clipboard.writeText(url).then(
                () => message.success("链接已复制"),
                () => message.error("复制失败，请手动复制地址栏"),
              );
            }}
          />
        )}
      </Drawer>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function Avatar({ memKey, size = 22 }: { memKey: TodoAssignee | null; size?: number }) {
  const m = COLS.find((c) => c.key === memKey) || UNASSIGNED;
  return (
    <div
      title={m.label}
      style={{
        width: size, height: size, borderRadius: "50%", flexShrink: 0,
        background: memKey ? m.hue : "transparent",
        border: memKey ? "none" : "1.5px dashed #c7c2bb",
        color: "#fff", fontSize: size * 0.42, fontWeight: 700,
        display: "flex", alignItems: "center", justifyContent: "center",
      }}
    >
      {memKey ? m.label[0] : <span style={{ color: "#a8a29a", fontSize: size * 0.5 }}>?</span>}
    </div>
  );
}

function TaskCard({
  todo, dragging, onDragStart, onDragEnd, onOpen, onEdit, onDelete,
  onPriorityChange, onAssigneeChange, onEtaDaysChange,
}: {
  todo: TodoRow;
  dragging: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  onOpen: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onPriorityChange: (p: TodoPriority) => void;
  onAssigneeChange: (a: TodoAssignee | null) => void;
  onEtaDaysChange: (d: number | null) => void;
}) {
  const pri = PRI[todo.priority];
  const rest = "0 1px 2px rgba(28,27,26,.05)";
  const wasDragged = useRef(false);
  const [etaOpen, setEtaOpen] = useState(false);
  const [etaDraft, setEtaDraft] = useState<number | null>(todo.etaDays);
  const followers = todo.followers ?? [];

  const priorityMenu: MenuProps = {
    items: (["high", "medium", "low"] as TodoPriority[]).map((p) => ({
      key: p,
      label: (
        <span style={{ color: PRI[p].color, fontWeight: 700 }}>{PRI[p].label}</span>
      ),
    })),
    selectedKeys: [todo.priority],
    onClick: ({ key, domEvent }) => {
      domEvent.stopPropagation();
      onPriorityChange(key as TodoPriority);
    },
  };

  const assigneeMenu: MenuProps = {
    items: [
      ...MEMBERS.map((m) => ({ key: m.key, label: m.label })),
      { key: "__none__", label: "未分配" },
    ],
    selectedKeys: [todo.assignee ?? "__none__"],
    onClick: ({ key, domEvent }) => {
      domEvent.stopPropagation();
      onAssigneeChange(key === "__none__" ? null : (key as TodoAssignee));
    },
  };

  function commitEta() {
    onEtaDaysChange(etaDraft);
    setEtaOpen(false);
  }

  return (
    <div
      className="td-card"
      draggable
      onDragStart={(e) => {
        wasDragged.current = false;
        e.dataTransfer.effectAllowed = "move";
        onDragStart();
      }}
      onDrag={() => { wasDragged.current = true; }}
      onDragEnd={() => { onDragEnd(); }}
      onClick={() => { if (!wasDragged.current) onOpen(); }}
      onMouseEnter={(e) => { if (!dragging) e.currentTarget.style.boxShadow = "0 6px 18px rgba(28,27,26,.1)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.boxShadow = rest; }}
      style={{
        position: "relative", background: "#fff", borderRadius: 13, padding: "13px 14px 12px",
        border: "1px solid #ece8e3", cursor: "pointer",
        boxShadow: dragging ? "0 14px 32px rgba(28,27,26,.16)" : rest,
        opacity: dragging ? 0.4 : 1, transform: dragging ? "scale(.98)" : "none",
        transition: "box-shadow .15s ease, transform .12s ease, opacity .12s ease",
      }}
    >
      <div style={{ position: "absolute", left: 0, top: 12, bottom: 12, width: 3, borderRadius: 3, background: pri.color }} />
      <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: 700, lineHeight: 1.42, color: "#26231f", letterSpacing: "-.01em" }} className="td-title">
          {todo.title}
        </div>
        <div className="td-actions" style={{ display: "flex", gap: 2, flexShrink: 0, marginTop: -2 }}>
          <Tooltip title="编辑">
            <Button
              className="td-iconbtn"
              type="text"
              size="small"
              icon={<EditOutlined />}
              onClick={(e) => { e.stopPropagation(); onEdit(); }}
              style={{ color: "#a8a29a" }}
            />
          </Tooltip>
          <Popconfirm title="确认删除？" onConfirm={onDelete} okText="删除" cancelText="取消">
            <Tooltip title="删除">
              <Button
                className="td-iconbtn"
                type="text"
                size="small"
                danger
                icon={<DeleteOutlined />}
                onClick={(e) => e.stopPropagation()}
              />
            </Tooltip>
          </Popconfirm>
        </div>
      </div>

      {todo.description && (
        <div className="td-desc" style={{ fontSize: 12, color: "#8a847c", lineHeight: 1.5, marginTop: 6, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" } as React.CSSProperties}>
          {todo.description}
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 7, marginTop: 11, paddingTop: 10, borderTop: "1px solid #f3f0ec" }}>
        <Dropdown menu={priorityMenu} trigger={["click"]}>
          <span
            style={{ fontSize: 11, fontWeight: 700, color: pri.color, background: pri.soft, borderRadius: 6, padding: "2px 7px", cursor: "pointer" }}
            onClick={(e) => e.stopPropagation()}
          >
            {pri.label}
          </span>
        </Dropdown>

        {todo.status !== "done" && (
          <Dropdown
            open={etaOpen}
            onOpenChange={(open) => {
              setEtaOpen(open);
              if (open) setEtaDraft(todo.etaDays);
            }}
            trigger={["click"]}
            dropdownRender={() => (
              <div
                style={{ padding: 10, background: "#fff", borderRadius: 10, boxShadow: "0 6px 20px rgba(28,27,26,.12)", border: "1px solid #ece8e3" }}
                onClick={(e) => e.stopPropagation()}
              >
                <div style={{ fontSize: 11, color: "#78716c", marginBottom: 6, fontWeight: 600 }}>预估天数</div>
                <InputNumber
                  min={0}
                  max={365}
                  value={etaDraft}
                  placeholder="—"
                  style={{ width: 120 }}
                  onChange={(v) => setEtaDraft(v == null ? null : v)}
                  onPressEnter={commitEta}
                />
                <div style={{ marginTop: 8, display: "flex", gap: 6, justifyContent: "flex-end" }}>
                  <Button size="small" onClick={() => setEtaOpen(false)}>取消</Button>
                  <Button size="small" type="primary" onClick={commitEta}>确定</Button>
                </div>
              </div>
            )}
          >
            <span
              style={{ fontFamily: MONO, fontSize: 11, color: "#8a847c", background: "#f5f3f0", borderRadius: 6, padding: "2px 7px", cursor: "pointer" }}
              onClick={(e) => e.stopPropagation()}
            >
              ⏱{" "}
              <span style={{ textDecoration: "underline dotted", textUnderlineOffset: 2 }}>
                {todo.etaDays ?? "—"}
              </span>
              d
            </span>
          </Dropdown>
        )}

        <Dropdown menu={assigneeMenu} trigger={["click"]}>
          <span style={{ cursor: "pointer", display: "inline-flex" }} onClick={(e) => e.stopPropagation()}>
            <Avatar memKey={todo.assignee} size={22} />
          </span>
        </Dropdown>

        {followers.length > 0 && (
          <div style={{ display: "inline-flex", marginLeft: 2 }}>
            {followers.slice(0, 3).map((f, i) => (
              <div key={f} style={{ marginLeft: i === 0 ? 0 : -6, border: "1.5px solid #fff", borderRadius: "50%" }}>
                <Avatar memKey={f} size={18} />
              </div>
            ))}
          </div>
        )}

        <span style={{ marginLeft: "auto", fontFamily: MONO, fontSize: 10.5, color: "#b3ada4" }}>
          {new Date(todo.createdAt).toLocaleDateString("zh-CN")}
        </span>
      </div>
    </div>
  );
}

function TodoDetail({
  todo,
  meLabel,
  comments,
  commentsLoading,
  commentBody,
  commentSaving,
  onCommentBodyChange,
  onSubmitComment,
  onEdit,
  onFollowersChange,
  onCopyLink,
}: {
  todo: TodoRow;
  meLabel: string;
  comments: TodoComment[];
  commentsLoading: boolean;
  commentBody: string;
  commentSaving: boolean;
  onCommentBodyChange: (v: string) => void;
  onSubmitComment: () => void;
  onEdit: () => void;
  onFollowersChange: (followers: TodoAssignee[]) => void;
  onCopyLink: () => void;
}) {
  const st = STATUS[todo.status];
  const pri = PRI[todo.priority];

  return (
    <div style={{ fontFamily: FONT, color: "#1c1b1a" }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 14 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 18, fontWeight: 800, lineHeight: 1.35, letterSpacing: "-.02em" }}>
            {todo.title}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: st.hue, background: st.soft, borderRadius: 6, padding: "2px 8px" }}>
              {st.icon} {st.label}
            </span>
            <span style={{ fontSize: 11, fontWeight: 700, color: pri.color, background: pri.soft, borderRadius: 6, padding: "2px 8px" }}>
              {pri.label}
            </span>
            <span style={{ fontSize: 11, fontWeight: 600, color: "#78716c", background: "#f5f3f0", borderRadius: 6, padding: "2px 8px", display: "inline-flex", alignItems: "center", gap: 5 }}>
              <Avatar memKey={todo.assignee} size={14} />
              {todo.assignee ? (MEMBERS.find((m) => m.key === todo.assignee)?.label ?? todo.assignee) : "未分配"}
            </span>
          </div>
        </div>
        <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
          <Tooltip title="复制链接">
            <Button icon={<LinkOutlined />} onClick={onCopyLink} style={{ borderRadius: 8 }} />
          </Tooltip>
          <Button icon={<EditOutlined />} onClick={onEdit} style={{ borderRadius: 8 }}>
            编辑
          </Button>
        </div>
      </div>

      {todo.description ? (
        <div style={{ fontSize: 13, color: "#57534e", lineHeight: 1.6, whiteSpace: "pre-wrap", marginBottom: 16, padding: "12px 14px", background: "#fbfaf9", border: "1px solid #ece8e3", borderRadius: 12 }}>
          {todo.description}
        </div>
      ) : (
        <div style={{ fontSize: 12, color: "#a8a29a", marginBottom: 16 }}>暂无描述</div>
      )}

      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "#78716c", marginBottom: 8 }}>跟进人</div>
        <Select
          mode="multiple"
          allowClear
          style={{ width: "100%" }}
          placeholder="选择关注此任务的人"
          value={todo.followers ?? []}
          onChange={(v) => onFollowersChange(v as TodoAssignee[])}
          options={MEMBERS.map((m) => ({ value: m.key, label: m.label }))}
        />
      </div>

      <div style={{ borderTop: "1px solid #ece8e3", paddingTop: 16 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 800 }}>进度更新</div>
          <span style={{ fontFamily: MONO, fontSize: 11, color: "#b3ada4" }}>{comments.length}</span>
        </div>

        <Spin spinning={commentsLoading}>
          {comments.length === 0 ? (
            <div style={{ fontSize: 12, color: "#a8a29a", padding: "16px 0 8px" }}>
              还没有进度，写一条进展吧。
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 14 }}>
              {comments.map((c) => {
                const authorLabel = MEMBERS.find((m) => m.key === c.author)?.label ?? c.author;
                return (
                  <div key={c.id} style={{ display: "flex", gap: 10 }}>
                    <Avatar memKey={c.author} size={28} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 4 }}>
                        <span style={{ fontSize: 12.5, fontWeight: 700 }}>{authorLabel}</span>
                        <span style={{ fontFamily: MONO, fontSize: 10.5, color: "#b3ada4" }}>
                          {new Date(c.createdAt).toLocaleString("zh-CN", {
                            month: "numeric",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      </div>
                      <div style={{ fontSize: 13, color: "#3c3935", lineHeight: 1.55, whiteSpace: "pre-wrap" }}>
                        {c.body}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Spin>

        <div style={{ marginTop: 8, paddingTop: 12, borderTop: "1px solid #f3f0ec" }}>
          <div style={{ fontSize: 12, color: "#78716c", marginBottom: 8 }}>
            以 <span style={{ fontWeight: 700, color: "#3c3935" }}>{meLabel}</span> 身份更新
          </div>
          <Input.TextArea
            value={commentBody}
            onChange={(e) => onCommentBodyChange(e.target.value)}
            autoSize={{ minRows: 3, maxRows: 8 }}
            placeholder="写一条进度更新…"
            onPressEnter={(e) => {
              if (e.ctrlKey || e.metaKey) {
                e.preventDefault();
                onSubmitComment();
              }
            }}
          />
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 8 }}>
            <Button
              type="primary"
              loading={commentSaving}
              disabled={!commentBody.trim()}
              onClick={onSubmitComment}
              style={{ borderRadius: 8, fontWeight: 700 }}
            >
              发布更新
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
