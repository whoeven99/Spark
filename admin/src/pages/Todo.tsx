import { useEffect, useState, useCallback } from "react";
import {
  Typography,
  Button,
  Modal,
  Form,
  Input,
  Select,
  Tag,
  Card,
  Spin,
  Alert,
  Popconfirm,
  Empty,
  Divider,
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
  ArrowUpOutlined,
  ArrowDownOutlined,
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
  high:   { color: "#fff",     bg: "#f5222d", border: "#f5222d", label: "高" },
  medium: { color: "#fff",     bg: "#fa8c16", border: "#fa8c16", label: "中" },
  low:    { color: "#8c8c8c",  bg: "#f5f5f5", border: "#d9d9d9", label: "低" },
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
  { key: "doing", label: "进行中", icon: <PlayCircleOutlined />, color: "#1d4ed8", bgColor: "#eff6ff", borderColor: "#bfdbfe" },
  { key: "todo",  label: "待办",   icon: <HourglassOutlined />,  color: "#475569", bgColor: "#f8fafc", borderColor: "#cbd5e1" },
  { key: "done",  label: "已完成", icon: <CheckCircleOutlined />, color: "#047857", bgColor: "#ecfdf5", borderColor: "#a7f3d0" },
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
      });
      load();
    } catch (e) { setError(String(e)); }
  }

  if (error) return <Alert type="error" message={error} style={{ margin: 24 }} />;

  const getTodosFor = (assignee: TodoAssignee | null, status: TodoStatus) =>
    todos.filter((t) => (assignee ? t.assignee === assignee : t.assignee === null) && t.status === status);

  const COLS: { key: TodoAssignee | null; label: string; color: string; hex: string }[] = [
    ...MEMBERS.map((m) => ({ key: m as TodoAssignee | null, label: m.charAt(0).toUpperCase() + m.slice(1), color: ASSIGNEE_COLORS[m], hex: ASSIGNEE_HEX[m] })),
    { key: null, label: "未分配", color: "default", hex: "#bfbfbf" },
  ];

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <Typography.Title level={4} style={{ margin: 0 }}>Team Todo</Typography.Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>新建</Button>
      </div>

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
                borderRadius: "0 0 6px 6px",
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
                        background: "#fff",
                        minHeight: 80,
                      }}
                    >
                      {/* Column header — only on first status row */}
                      {statusRow.key === "doing" && (
                        <div style={{ textAlign: "center", marginBottom: 10 }}>
                          <Tag
                            color={col.color}
                            style={{ fontSize: 12, padding: "3px 14px", fontWeight: 600, letterSpacing: 0.5 }}
                          >
                            {col.label}
                          </Tag>
                        </div>
                      )}
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
            <Input.TextArea rows={3} placeholder="可选描述" />
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

function TodoCard({
  todo,
  statusRow,
  onEdit,
  onDelete,
  onMove,
}: {
  todo: TodoRow;
  statusRow: typeof STATUS_ROWS[number];
  onEdit: () => void;
  onDelete: () => void;
  onMove: (todo: TodoRow, status: TodoStatus) => void;
}) {
  const statusIndex = STATUS_ROWS.findIndex((s) => s.key === todo.status);
  const prevStatus = statusIndex > 0 ? STATUS_ROWS[statusIndex - 1] : null;
  const nextStatus = statusIndex < STATUS_ROWS.length - 1 ? STATUS_ROWS[statusIndex + 1] : null;
  const pri = PRIORITY_CONFIG[todo.priority];

  return (
    <Card
      size="small"
      style={{ borderTop: `2px solid ${statusRow.color}`, borderRadius: 6, boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}
      styles={{ body: { padding: "10px 12px" } }}
    >
      {/* Title + actions */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
        <Typography.Text strong style={{ fontSize: 13, flex: 1, lineHeight: 1.5 }}>
          {todo.title}
        </Typography.Text>
        <div style={{ display: "flex", gap: 2, flexShrink: 0 }}>
          <Tooltip title="编辑">
            <Button type="text" size="small" icon={<EditOutlined />} onClick={onEdit} style={{ padding: "0 4px", color: "#8c8c8c" }} />
          </Tooltip>
          <Popconfirm title="确认删除？" onConfirm={onDelete} okText="删除" cancelText="取消">
            <Tooltip title="删除">
              <Button type="text" size="small" danger icon={<DeleteOutlined />} style={{ padding: "0 4px" }} />
            </Tooltip>
          </Popconfirm>
        </div>
      </div>

      {todo.description && (
        <Typography.Text type="secondary" style={{ fontSize: 12, display: "block", marginTop: 4, lineHeight: 1.4 }}>
          {todo.description}
        </Typography.Text>
      )}

      {/* Priority + date */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8 }}>
        <Tag style={{ margin: 0, fontSize: 11, color: pri.color, background: pri.bg, borderColor: pri.border }}>{pri.label}</Tag>
        <Typography.Text type="secondary" style={{ fontSize: 11, marginLeft: "auto" }}>
          {new Date(todo.createdAt).toLocaleDateString("zh-CN")}
        </Typography.Text>
      </div>

      {/* Move buttons: ↓ next on left, ↑ prev on right, small, not full-width */}
      {(prevStatus || nextStatus) && (
        <>
          <Divider style={{ margin: "8px 0" }} />
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              {nextStatus && (
                <Tooltip title={`移到「${nextStatus.label}」`}>
                  <Button
                    size="small"
                    icon={<ArrowDownOutlined />}
                    onClick={() => onMove(todo, nextStatus.key)}
                    style={{
                      fontSize: 11,
                      height: 22,
                      padding: "0 8px",
                      color: nextStatus.color,
                      borderColor: nextStatus.color,
                      background: nextStatus.bgColor,
                    }}
                  >
                    {nextStatus.label}
                  </Button>
                </Tooltip>
              )}
            </div>
            <div>
              {prevStatus && (
                <Tooltip title={`移到「${prevStatus.label}」`}>
                  <Button
                    size="small"
                    icon={<ArrowUpOutlined />}
                    onClick={() => onMove(todo, prevStatus.key)}
                    style={{
                      fontSize: 11,
                      height: 22,
                      padding: "0 8px",
                      color: "#8c8c8c",
                      borderColor: "#d9d9d9",
                      background: "#fff",
                    }}
                  >
                    {prevStatus.label}
                  </Button>
                </Tooltip>
              )}
            </div>
          </div>
        </>
      )}
    </Card>
  );
}
