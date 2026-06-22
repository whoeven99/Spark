import { useEffect, useState, useCallback } from "react";
import {
  Typography,
  Button,
  Modal,
  Form,
  Input,
  InputNumber,
  Select,
  Tag,
  Card,
  Spin,
  Alert,
  Popconfirm,
  Empty,
  Tooltip,
  Badge,
} from "antd";
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  CheckCircleOutlined,
  HourglassOutlined,
  PlayCircleOutlined,
} from "@ant-design/icons";
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

const MEMBERS: TodoAssignee[] = ["yewen", "allen", "zhuangze"];

const ASSIGNEE_COLORS: Record<TodoAssignee, string> = {
  yewen: "blue",
  allen: "green",
  zhuangze: "purple",
};

const ASSIGNEE_HEX: Record<TodoAssignee, string> = {
  yewen: "#1677ff",
  allen: "#52c41a",
  zhuangze: "#722ed1",
};

const PRIORITY_CONFIG: Record<TodoPriority, { color: string; bg: string; border: string; label: string }> = {
  high:   { color: "#dc2626",  bg: "#fef2f2", border: "#fecaca", label: "高" },
  medium: { color: "#d97706",  bg: "#fffbeb", border: "#fde68a", label: "中" },
  low:    { color: "#6b7280",  bg: "#f9fafb", border: "#e5e7eb", label: "低" },
};

function renderPriorityTag(priority: TodoPriority): React.ReactNode {
  const cfg = PRIORITY_CONFIG[priority];
  return (
    <Tag
      style={{
        margin: 0,
        color: cfg.color,
        background: cfg.bg,
        borderColor: cfg.border,
      }}
    >
      {cfg.label}
    </Tag>
  );
}

const STATUS_ROWS: {
  key: TodoStatus;
  label: string;
  icon: React.ReactNode;
  color: string;
  bgColor: string;
  borderColor: string;
}[] = [
  { key: "doing", label: "进行中", icon: <PlayCircleOutlined />, color: "#ea580c", bgColor: "#fff7ed", borderColor: "#fdba74" },
  { key: "todo",  label: "待办",   icon: <HourglassOutlined />,  color: "#334155", bgColor: "#f1f5f9", borderColor: "#94a3b8" },
  { key: "done",  label: "已完成", icon: <CheckCircleOutlined />, color: "#059669", bgColor: "#ecfdf5", borderColor: "#6ee7b7" },
];

const ME_KEY = "spark_admin_me";
function getMe() { return localStorage.getItem(ME_KEY) ?? MEMBERS[0]; }
function setMe(v: string) { localStorage.setItem(ME_KEY, v); }

type FormValues = {
  title: string;
  description?: string;
  assignee?: TodoAssignee;
  priority: TodoPriority;
  status: TodoStatus;
  createdBy: string;
};

export default function Todo() {
  const [todos, setTodos] = useState<TodoRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<TodoRow | null>(null);
  const [saving, setSaving] = useState(false);
  const [me, setMeState] = useState<string>(getMe());
  const [form] = Form.useForm<FormValues>();

  const load = useCallback(() => {
    setLoading(true);
    fetchTodos()
      .then((r) => setTodos(r.todos))
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

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
    try { await deleteTodo(id); load(); }
    catch (e) { setError(String(e)); }
  }

  async function moveStatus(todo: TodoRow, status: TodoStatus) {
    try {
      await updateTodo(todo.id, {
        title: todo.title,
        description: todo.description,
        assignee: todo.assignee,
        status,
        priority: todo.priority,
        etaDays: todo.etaDays ?? null,
      });
      load();
    } catch (e) { setError(String(e)); }
  }

  async function updateEtaDays(todo: TodoRow, etaDays: number | null) {
    try {
      await updateTodo(todo.id, {
        title: todo.title,
        description: todo.description,
        assignee: todo.assignee,
        status: todo.status,
        priority: todo.priority,
        etaDays,
      });
      load();
    } catch (e) {
      setError(String(e));
    }
  }

  async function updateAssignee(todo: TodoRow, assignee: TodoAssignee | null) {
    try {
      await updateTodo(todo.id, {
        title: todo.title,
        description: todo.description,
        assignee,
        status: todo.status,
        priority: todo.priority,
        etaDays: todo.etaDays ?? null,
      });
      load();
    } catch (e) {
      setError(String(e));
    }
  }

  if (error) return <Alert type="error" message={error} style={{ margin: 24 }} />;

  const stats = useCallback(() => {
    const doing = todos.filter((t) => t.status === "doing").length;
    const todo = todos.filter((t) => t.status === "todo").length;
    const done = todos.filter((t) => t.status === "done").length;
    return { doing, todo, done, total: todos.length };
  }, [todos])();

  const getTodosFor = (assignee: TodoAssignee | null, status: TodoStatus) =>
    todos.filter((t) => (assignee ? t.assignee === assignee : t.assignee === null) && t.status === status);

  const COLS: { key: TodoAssignee | null; label: string; color: string; hex: string }[] = [
    ...MEMBERS.map((m) => ({ key: m as TodoAssignee | null, label: m.charAt(0).toUpperCase() + m.slice(1), color: ASSIGNEE_COLORS[m], hex: ASSIGNEE_HEX[m] })),
    { key: null, label: "未分配", color: "default", hex: "#bfbfbf" },
  ];

  return (
    <div>
      <style>{`
        .todo-card:hover .todo-card-actions { opacity: 1 !important; }
        .todo-card:hover .todo-card-actions button:hover { color: #1f2124 !important; background: #f3f4f6; }
      `}</style>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <Typography.Title level={4} style={{ margin: 0 }}>Team Todo</Typography.Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>新建</Button>
      </div>

      {todos.length > 0 && (
        <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
          {([
            { key: "doing", label: "进行中", color: "#ea580c", bg: "#fff7ed", border: "#fed7aa" },
            { key: "todo",  label: "待办",   color: "#475569", bg: "#f1f5f9", border: "#cbd5e1" },
            { key: "done",  label: "已完成", color: "#059669", bg: "#ecfdf5", border: "#a7f3d0" },
          ] as const).map((s) => (
            <div
              key={s.key}
              style={{
                flex: 1, background: s.bg, border: `1px solid ${s.border}`,
                borderRadius: 10, padding: "10px 14px", textAlign: "center",
              }}
            >
              <div style={{ fontSize: 11, color: s.color, fontWeight: 600 }}>{s.label}</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: s.color, marginTop: 2 }}>
                {stats[s.key as "doing" | "todo" | "done"]}
              </div>
            </div>
          ))}
          <div style={{ flex: 1, background: "#f8f9fa", border: "1px solid #e5e7eb", borderRadius: 10, padding: "10px 14px", textAlign: "center" }}>
            <div style={{ fontSize: 11, color: "#6b7280", fontWeight: 600 }}>总计</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: "#1f2124", marginTop: 2 }}>{stats.total}</div>
          </div>
        </div>
      )}

      <Spin spinning={loading}>
        {STATUS_ROWS.map((statusRow) => {
          const totalInRow = COLS.reduce((sum, col) => sum + getTodosFor(col.key, statusRow.key).length, 0);
          return (
            <div key={statusRow.key} style={{ marginBottom: 20 }}>
              {/* Status section header */}
              <div style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "10px 16px",
                background: statusRow.bgColor,
                border: `1px solid ${statusRow.borderColor}`,
                borderLeft: `5px solid ${statusRow.color}`,
                boxShadow: "inset 0 -1px 0 rgba(0,0,0,0.03)",
                borderRadius: "6px 6px 0 0",
              }}>
                <span style={{ fontSize: 18, color: statusRow.color, display: "flex", alignItems: "center" }}>
                  {statusRow.icon}
                </span>
                <Typography.Text strong style={{ fontSize: 15, color: statusRow.color, letterSpacing: 0.5 }}>
                  {statusRow.label}
                </Typography.Text>
                <Badge
                  count={totalInRow}
                  style={{ background: statusRow.color }}
                  showZero
                />
              </div>

              {/* Columns grid */}
              <div style={{
                display: "grid",
                gridTemplateColumns: `repeat(${COLS.length}, 1fr)`,
                border: `1px solid ${statusRow.borderColor}`,
                borderTop: "none",
                borderRadius: "0 0 8px 8px",
                overflow: "hidden",
              }}>
                {COLS.map((col, colIdx) => {
                  const items = getTodosFor(col.key, statusRow.key);
                  return (
                    <div
                      key={String(col.key)}
                      style={{
                        padding: "12px 10px",
                        borderRight: colIdx < COLS.length - 1 ? `1px solid ${statusRow.borderColor}` : "none",
                        background: items.length === 0 ? "#fafbfb" : "#fff",
                        minHeight: 80,
                      }}
                    >
                      {/* Column header */}
                      <div style={{ textAlign: "center", marginBottom: 10 }}>
                        <Tag
                          color={col.color}
                          style={{ fontSize: 11, padding: "2px 12px", fontWeight: 600, letterSpacing: 0.3 }}
                        >
                          {col.label}
                        </Tag>
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        {items.length === 0 ? (
                          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={false} style={{ margin: "8px 0" }} />
                        ) : (
                          items.map((todo) => (
                            <TodoCard
                              key={todo.id}
                              todo={todo}
                              statusRow={statusRow}
                              onEdit={() => openEdit(todo)}
                              onDelete={() => handleDelete(todo.id)}
                              onMove={moveStatus}
                              onEtaDaysChange={updateEtaDays}
                              onAssigneeChange={updateAssignee}
                            />
                          ))
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </Spin>

      <Modal
        title={editing ? "编辑 Todo" : "新建 Todo"}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={() => form.submit()}
        okText={editing ? "保存" : "创建"}
        confirmLoading={saving}
        destroyOnClose
      >
        <Form form={form} layout="vertical" onFinish={handleSubmit} style={{ marginTop: 8 }}>
          <Form.Item name="title" label="标题" rules={[{ required: true, message: "请填写标题" }]}>
            <Input placeholder="Todo 标题" />
          </Form.Item>
          <Form.Item name="description" label="描述">
            <Input.TextArea autoSize={{ minRows: 3, maxRows: 12 }} placeholder="可选描述" />
          </Form.Item>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Form.Item name="assignee" label="负责人">
              <Select allowClear placeholder="未分配">
                {MEMBERS.map((m) => (
                  <Select.Option key={m} value={m}>
                    <Tag color={ASSIGNEE_COLORS[m]} style={{ margin: 0 }}>{m.charAt(0).toUpperCase() + m.slice(1)}</Tag>
                  </Select.Option>
                ))}
              </Select>
            </Form.Item>
            <Form.Item name="priority" label="优先级" rules={[{ required: true }]}>
              <Select>
                {(["high", "medium", "low"] as TodoPriority[]).map((p) => (
                  <Select.Option key={p} value={p}>
                    {renderPriorityTag(p)}
                  </Select.Option>
                ))}
              </Select>
            </Form.Item>
          </div>
          {editing && (
            <Form.Item name="status" label="状态" rules={[{ required: true }]}>
              <Select>
                {STATUS_ROWS.map((s) => (
                  <Select.Option key={s.key} value={s.key}>{s.label}</Select.Option>
                ))}
              </Select>
            </Form.Item>
          )}
          {!editing && (
            <Form.Item name="createdBy" label="创建人" rules={[{ required: true, message: "请选择创建人" }]}>
              <Select placeholder="选择你是谁">
                {MEMBERS.map((m) => (
                  <Select.Option key={m} value={m}>
                    <Tag color={ASSIGNEE_COLORS[m]} style={{ margin: 0 }}>{m.charAt(0).toUpperCase() + m.slice(1)}</Tag>
                  </Select.Option>
                ))}
              </Select>
            </Form.Item>
          )}
        </Form>
      </Modal>
    </div>
  );
}

const COMPACT_SELECT_ARROW_NONE = { suffixIcon: null } as const;

function formatAssigneeLabel(assignee: TodoAssignee | null): string {
  if (!assignee) return "未分配";
  return assignee.charAt(0).toUpperCase() + assignee.slice(1);
}

function TodoCard({
  todo,
  statusRow,
  onEdit,
  onDelete,
  onMove,
  onEtaDaysChange,
  onAssigneeChange,
}: {
  todo: TodoRow;
  statusRow: typeof STATUS_ROWS[number];
  onEdit: () => void;
  onDelete: () => void;
  onMove: (todo: TodoRow, status: TodoStatus) => void;
  onEtaDaysChange: (todo: TodoRow, etaDays: number | null) => Promise<void> | void;
  onAssigneeChange: (todo: TodoRow, assignee: TodoAssignee | null) => Promise<void> | void;
}) {
  const pri = PRIORITY_CONFIG[todo.priority];
  const [etaDraft, setEtaDraft] = useState<number | null>(todo.etaDays ?? null);
  const [savingEta, setSavingEta] = useState(false);
  const [savingAssignee, setSavingAssignee] = useState(false);
  const currentStatusRow = STATUS_ROWS.find((s) => s.key === todo.status) ?? statusRow;
  const statusOptions = STATUS_ROWS.map((s) => ({
    value: s.key,
    label: s.label,
  }));

  const assigneeOptions: { value: TodoAssignee | "__none__"; label: React.ReactNode }[] = [
    { value: "__none__", label: <span style={{ color: "#8c9196", fontSize: 12 }}>未分配</span> },
    ...MEMBERS.map((m) => ({
      value: m as TodoAssignee,
      label: (
        <Tag color={ASSIGNEE_COLORS[m]} style={{ margin: 0, fontSize: 11, lineHeight: "18px" }}>
          {formatAssigneeLabel(m)}
        </Tag>
      ),
    })),
  ];

  const normalizeEta = (value: number | null): number | null =>
    value == null || Number.isNaN(value) ? null : Math.max(0, Math.floor(value));

  async function persistEtaDays(rawValue: number | null) {
    const next = normalizeEta(rawValue);
    const current = normalizeEta(todo.etaDays ?? null);
    if (next === current) return;
    setSavingEta(true);
    try {
      await onEtaDaysChange(todo, next);
    } finally {
      setSavingEta(false);
    }
  }

  return (
    <Card
      size="small"
      className="todo-card"
      style={{
        border: `1px solid ${pri.border}`,
        borderLeft: `3px solid ${pri.color}`,
        borderRadius: 8,
        boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
        background: "#fff",
        transition: "box-shadow 0.15s, border-color 0.15s",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLElement).style.boxShadow = "0 3px 12px rgba(0,0,0,0.08)";
        (e.currentTarget as HTMLElement).style.borderColor = "#d0d3d7";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.boxShadow = "0 1px 2px rgba(0,0,0,0.04)";
        (e.currentTarget as HTMLElement).style.borderColor = pri.border;
      }}
      styles={{ body: { padding: "10px 12px 8px" } }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
        <Typography.Text strong style={{ fontSize: 13, flex: 1, lineHeight: 1.45, color: "#202223" }}>
          {todo.title}
        </Typography.Text>
        <div className="todo-card-actions" style={{ display: "flex", gap: 0, flexShrink: 0, opacity: 0, transition: "opacity 0.12s" }}>
          <Tooltip title="编辑">
            <Button type="text" size="small" icon={<EditOutlined />} onClick={onEdit} style={{ padding: "0 4px", color: "#9ca3af" }} />
          </Tooltip>
          <Popconfirm title="确认删除？" onConfirm={onDelete} okText="删除" cancelText="取消">
            <Tooltip title="删除">
              <Button type="text" size="small" danger icon={<DeleteOutlined />} style={{ padding: "0 4px" }} />
            </Tooltip>
          </Popconfirm>
        </div>
      </div>

      {todo.description && (
        <Typography.Text
          type="secondary"
          style={{
            fontSize: 11,
            marginTop: 4,
            lineHeight: 1.5,
            color: "#6b7280",
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          } as React.CSSProperties}
        >
          {todo.description}
        </Typography.Text>
      )}

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          marginTop: 10,
          paddingTop: 8,
          borderTop: "1px solid #f1f2f3",
          flexWrap: "wrap",
        }}
      >
        <Tag
          style={{
            margin: 0,
            fontSize: 11,
            lineHeight: "18px",
            padding: "0 6px",
            color: pri.color,
            background: pri.bg,
            borderColor: pri.border,
            borderRadius: 4,
          }}
        >
          {pri.label}
        </Tag>

        <Select<TodoStatus>
          {...COMPACT_SELECT_ARROW_NONE}
          size="small"
          variant="borderless"
          value={todo.status}
          onChange={(value) => {
            if (value !== todo.status) {
              onMove(todo, value);
            }
          }}
          popupMatchSelectWidth={false}
          options={statusOptions}
          style={{ minWidth: 56, maxWidth: 72 }}
          styles={{
            selector: {
              padding: "0 6px",
              height: 22,
              minHeight: 22,
              background: currentStatusRow.bgColor,
              border: `1px solid ${currentStatusRow.borderColor}`,
              borderRadius: 4,
              color: currentStatusRow.color,
              fontSize: 11,
              fontWeight: 600,
            },
          }}
        />

        <div
          style={{
            height: 22,
            padding: "0 6px",
            border: "1px solid #e3e5e7",
            borderRadius: 4,
            background: "#fafbfb",
            display: "inline-flex",
            alignItems: "center",
            gap: 2,
          }}
        >
          <InputNumber
            size="small"
            value={etaDraft}
            onChange={(value) =>
              setEtaDraft(typeof value === "number" ? Math.max(0, Math.floor(value)) : null)
            }
            onBlur={() => {
              void persistEtaDays(etaDraft);
            }}
            onPressEnter={() => {
              void persistEtaDays(etaDraft);
            }}
            placeholder="—"
            min={0}
            precision={0}
            controls={false}
            style={{ width: 24 }}
            variant="borderless"
            disabled={savingEta}
          />
          <Typography.Text style={{ fontSize: 10, color: "#8c9196" }}>天</Typography.Text>
        </div>

        <Select<TodoAssignee | "__none__">
          {...COMPACT_SELECT_ARROW_NONE}
          size="small"
          variant="borderless"
          value={todo.assignee ?? "__none__"}
          disabled={savingAssignee}
          onChange={async (value) => {
            const next = value === "__none__" ? null : value;
            if (next === (todo.assignee ?? null)) return;
            setSavingAssignee(true);
            try {
              await onAssigneeChange(todo, next);
            } finally {
              setSavingAssignee(false);
            }
          }}
          popupMatchSelectWidth={false}
          options={assigneeOptions}
          labelRender={(item) => {
            const value = item.value as TodoAssignee | "__none__";
            if (value === "__none__") {
              return <span style={{ color: "#8c9196", fontSize: 11 }}>未分配</span>;
            }
            return (
              <span style={{ fontSize: 11, fontWeight: 600, color: ASSIGNEE_HEX[value] }}>
                {formatAssigneeLabel(value)}
              </span>
            );
          }}
          style={{ minWidth: 64, maxWidth: 80 }}
          styles={{
            selector: {
              padding: "0 6px",
              height: 22,
              minHeight: 22,
              background: "#fff",
              border: "1px solid #e3e5e7",
              borderRadius: 4,
            },
          }}
        />

        <Typography.Text type="secondary" style={{ fontSize: 11, marginLeft: "auto", color: "#8c9196" }}>
          {new Date(todo.createdAt).toLocaleDateString("zh-CN")}
        </Typography.Text>
      </div>
    </Card>
  );
}
