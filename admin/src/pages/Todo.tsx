import { useEffect, useState, useCallback, useMemo } from "react";
import {
  Typography,
  Button,
  Modal,
  Form,
  Input,
  InputNumber,
  Select,
  Tag,
  Spin,
  Alert,
  Popconfirm,
  Tooltip,
} from "antd";
import { PlusOutlined, EditOutlined, DeleteOutlined } from "@ant-design/icons";
import {
  fetchTodos,
  createTodo,
  updateTodo,
  deleteTodo,
  type TodoRow,
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

const ME_KEY = "spark_admin_me";
const getMe = () => localStorage.getItem(ME_KEY) ?? MEMBERS[0].key;
const setMe = (v: string) => localStorage.setItem(ME_KEY, v);

const FONT = "Manrope, system-ui, sans-serif";        // add a <link> in index.html, or drop this line
const MONO = "'Geist Mono', ui-monospace, monospace";

type FormValues = {
  title: string;
  description?: string;
  assignee?: TodoAssignee;
  priority: TodoPriority;
  status: TodoStatus;
  createdBy: string;
};

/* ------------------------------------------------------------------ */

export default function Todo() {
  const [todos, setTodos] = useState<TodoRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<TodoRow | null>(null);
  const [saving, setSaving] = useState(false);
  const [me, setMeState] = useState<string>(getMe());

  // drag-and-drop UI state
  const [dragId, setDragId] = useState<string | null>(null);
  const [overCell, setOverCell] = useState<string | null>(null);

  const [form] = Form.useForm<FormValues>();

  const load = useCallback(() => {
    setLoading(true);
    fetchTodos()
      .then((r) => setTodos(r.todos))
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load]);

  /* ---- create / edit modal (kept from the original) ---- */

  function openCreate() {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({ priority: "medium", status: "todo", createdBy: me });
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
      createdBy: todo.createdBy,
    });
    setModalOpen(true);
  }
  async function handleSubmit(values: FormValues) {
    setSaving(true);
    try {
      if (editing) {
        await updateTodo(editing.id, {
          title: values.title,
          description: values.description ?? null,
          assignee: values.assignee ?? null,
          status: values.status,
          priority: values.priority,
          etaDays: editing.etaDays ?? null,
        });
      } else {
        if (!values.createdBy) {
          form.setFields([{ name: "createdBy", errors: ["请选择创建人"] }]);
          return;
        }
        setMe(values.createdBy);
        setMeState(values.createdBy);
        await createTodo({
          title: values.title,
          description: values.description,
          assignee: values.assignee,
          priority: values.priority,
          etaDays: null,
          createdBy: values.createdBy,
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
    try { await deleteTodo(id); }
    catch (e) { setError(String(e)); load(); }
  }

  /* ---- THE KEY BIT: one drop sets status + assignee in a single call ---- */

  async function moveTo(todo: TodoRow, status: TodoStatus, assignee: TodoAssignee | null) {
    if (todo.status === status && (todo.assignee ?? null) === assignee) return;
    // optimistic update — no full reload, no flicker
    setTodos((ts) => ts.map((t) => (t.id === todo.id ? { ...t, status, assignee } : t)));
    try {
      await updateTodo(todo.id, {
        title: todo.title,
        description: todo.description,
        assignee,
        status,
        priority: todo.priority,
        etaDays: todo.etaDays ?? null,
      });
    } catch (e) {
      setError(String(e));
      load(); // roll back to server truth on failure
    }
  }

  if (error) return <Alert type="error" message={error} style={{ margin: 24 }} />;

  const cellId = (status: TodoStatus, col: TodoAssignee | null) => status + "::" + String(col);
  const itemsFor = (status: TodoStatus, col: TodoAssignee | null) =>
    todos.filter((t) => t.status === status && (t.assignee ?? null) === col);

  const colTmpl = `150px repeat(${COLS.length}, 1fr)`;

  return (
    <div style={{ fontFamily: FONT, color: "#1c1b1a" }}>
      <style>{`
        .td-card .td-actions { opacity: 0; transition: opacity .14s ease; }
        .td-card:hover .td-actions { opacity: 1; }
        .td-iconbtn:hover { background: #f0eeec !important; }
      `}</style>

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
            拖动卡片即可流转 — 横向换人，纵向改状态。
          </p>
        </div>
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate} style={{ borderRadius: 10, fontWeight: 700 }}>
          新建任务
        </Button>
      </div>

      {/* board */}
      <Spin spinning={loading}>
        <div style={{ background: "#fbfaf9", border: "1px solid #ece8e3", borderRadius: 18, padding: "14px 14px 18px", overflowX: "auto" }}>
          <div style={{ minWidth: 920 }}>

            {/* member column headers */}
            <div style={{ display: "grid", gridTemplateColumns: colTmpl, marginBottom: 8 }}>
              <div />
              {COLS.map((c) => (
                <div key={String(c.key)} style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "8px 12px", margin: "0 6px", background: "#fff", border: "1px solid #ece8e3", borderRadius: 11 }}>
                  <Avatar memKey={c.key} size={24} />
                  <span style={{ fontSize: 13, fontWeight: 700, color: c.key ? "#3c3935" : "#9ca3af" }}>{c.label}</span>
                  <span style={{ fontFamily: MONO, fontSize: 11, color: "#b3ada4" }}>
                    ·{todos.filter((t) => (t.assignee ?? null) === c.key).length}
                  </span>
                </div>
              ))}
            </div>

            {/* status rows */}
            {STATUS_ORDER.map((stKey) => {
              const st = STATUS[stKey];
              const rowTotal = todos.filter((t) => t.status === stKey).length;
              return (
                <div key={stKey} style={{ display: "grid", gridTemplateColumns: colTmpl, alignItems: "stretch", marginBottom: 14 }}>
                  {/* status rail */}
                  <div style={{ paddingTop: 12, paddingRight: 6 }}>
                    <div style={{ background: st.soft, borderRadius: 13, padding: 14, border: `1px solid ${st.hue}22` }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ color: st.hue, fontSize: 13 }}>{st.icon}</span>
                        <span style={{ fontSize: 14, fontWeight: 800, color: st.hue, letterSpacing: "-.01em" }}>{st.label}</span>
                      </div>
                      <div style={{ fontFamily: MONO, fontSize: 22, fontWeight: 700, color: st.hue, marginTop: 8, lineHeight: 1 }}>{rowTotal}</div>
                      <div style={{ fontSize: 11, color: st.hue, opacity: 0.7, marginTop: 3, fontWeight: 600 }}>项任务</div>
                    </div>
                  </div>

                  {/* member cells (drop targets) */}
                  {COLS.map((col) => {
                    const id = cellId(stKey, col.key);
                    const over = overCell === id;
                    const items = itemsFor(stKey, col.key);
                    return (
                      <div
                        key={String(col.key)}
                        style={{ borderRight: col.key === null ? "none" : "1px dashed #ebe6e0" }}
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
                                onEdit={() => openEdit(todo)}
                                onDelete={() => handleDelete(todo.id)}
                              />
                            ))
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
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
          {editing && (
            <Form.Item name="status" label="状态" rules={[{ required: true }]}>
              <Select>
                {STATUS_ORDER.map((s) => (
                  <Select.Option key={s} value={s}>{STATUS[s].label}</Select.Option>
                ))}
              </Select>
            </Form.Item>
          )}
          {!editing && (
            <Form.Item name="createdBy" label="创建人" rules={[{ required: true, message: "请选择创建人" }]}>
              <Select placeholder="选择你是谁">
                {MEMBERS.map((m) => (
                  <Select.Option key={m.key} value={m.key}>{m.label}</Select.Option>
                ))}
              </Select>
            </Form.Item>
          )}
        </Form>
      </Modal>
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
  todo, dragging, onDragStart, onDragEnd, onEdit, onDelete,
}: {
  todo: TodoRow;
  dragging: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const pri = PRI[todo.priority];
  const rest = "0 1px 2px rgba(28,27,26,.05)";
  return (
    <div
      className="td-card"
      draggable
      onDragStart={(e) => { e.dataTransfer.effectAllowed = "move"; onDragStart(); }}
      onDragEnd={onDragEnd}
      onMouseEnter={(e) => { if (!dragging) e.currentTarget.style.boxShadow = "0 6px 18px rgba(28,27,26,.1)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.boxShadow = rest; }}
      style={{
        position: "relative", background: "#fff", borderRadius: 13, padding: "13px 14px 12px",
        border: "1px solid #ece8e3", cursor: "grab",
        boxShadow: dragging ? "0 14px 32px rgba(28,27,26,.16)" : rest,
        opacity: dragging ? 0.4 : 1, transform: dragging ? "scale(.98)" : "none",
        transition: "box-shadow .15s ease, transform .12s ease, opacity .12s ease",
      }}
    >
      <div style={{ position: "absolute", left: 0, top: 12, bottom: 12, width: 3, borderRadius: 3, background: pri.color }} />
      <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
        <div style={{ flex: 1, fontSize: 13.5, fontWeight: 700, lineHeight: 1.42, color: "#26231f", letterSpacing: "-.01em" }}>
          {todo.title}
        </div>
        <div className="td-actions" style={{ display: "flex", gap: 2, flexShrink: 0, marginTop: -2 }}>
          <Tooltip title="编辑">
            <Button className="td-iconbtn" type="text" size="small" icon={<EditOutlined />} onClick={onEdit} style={{ color: "#a8a29a" }} />
          </Tooltip>
          <Popconfirm title="确认删除？" onConfirm={onDelete} okText="删除" cancelText="取消">
            <Tooltip title="删除">
              <Button className="td-iconbtn" type="text" size="small" danger icon={<DeleteOutlined />} />
            </Tooltip>
          </Popconfirm>
        </div>
      </div>

      {todo.description && (
        <div style={{ fontSize: 12, color: "#8a847c", lineHeight: 1.5, marginTop: 6, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" } as React.CSSProperties}>
          {todo.description}
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 7, marginTop: 11, paddingTop: 10, borderTop: "1px solid #f3f0ec" }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: pri.color, background: pri.soft, borderRadius: 6, padding: "2px 7px" }}>{pri.label}</span>
        {todo.status !== "done" && (
          <span style={{ fontFamily: MONO, fontSize: 11, color: "#8a847c", background: "#f5f3f0", borderRadius: 6, padding: "2px 7px" }}>
            ⏱ {todo.etaDays ?? "—"}d
          </span>
        )}
        <Avatar memKey={todo.assignee} size={22} />
        <span style={{ marginLeft: "auto", fontFamily: MONO, fontSize: 10.5, color: "#b3ada4" }}>
          {new Date(todo.createdAt).toLocaleDateString("zh-CN")}
        </span>
      </div>
    </div>
  );
}
