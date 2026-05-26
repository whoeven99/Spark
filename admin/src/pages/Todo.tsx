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
  Badge,
} from "antd";
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  UserOutlined,
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

const MEMBERS: TodoAssignee[] = ["yewen", "allen", "zz"];

const ASSIGNEE_COLORS: Record<TodoAssignee, string> = {
  yewen: "blue",
  allen: "green",
  zz: "purple",
};

const PRIORITY_CONFIG: Record<TodoPriority, { color: string; label: string }> = {
  high: { color: "red", label: "高" },
  medium: { color: "orange", label: "中" },
  low: { color: "default", label: "低" },
};

const COLUMNS: { key: TodoStatus; label: string; color: string }[] = [
  { key: "todo", label: "待办", color: "#1677ff" },
  { key: "doing", label: "进行中", color: "#fa8c16" },
  { key: "done", label: "已完成", color: "#52c41a" },
];

const ME_KEY = "spark_admin_me";

function getMe(): string {
  return localStorage.getItem(ME_KEY) ?? "";
}
function setMe(v: string) {
  localStorage.setItem(ME_KEY, v);
}

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

  useEffect(() => {
    load();
  }, [load]);

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
    try {
      await deleteTodo(id);
      load();
    } catch (e) {
      setError(String(e));
    }
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
    } catch (e) {
      setError(String(e));
    }
  }

  if (error) return <Alert type="error" message={error} style={{ margin: 24 }} />;

  const byStatus = (status: TodoStatus) => todos.filter((t) => t.status === status);

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <Typography.Title level={4} style={{ margin: 0 }}>
          Team Todo
        </Typography.Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
          新建
        </Button>
      </div>

      <Spin spinning={loading}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, alignItems: "start" }}>
          {COLUMNS.map((col) => {
            const items = byStatus(col.key);
            return (
              <div key={col.key}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                  <span style={{ width: 10, height: 10, borderRadius: "50%", background: col.color, display: "inline-block" }} />
                  <Typography.Text strong style={{ fontSize: 15 }}>{col.label}</Typography.Text>
                  <Badge count={items.length} style={{ background: col.color }} showZero />
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {items.length === 0 ? (
                    <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={false} style={{ margin: "12px 0" }} />
                  ) : (
                    items.map((todo) => (
                      <TodoCard
                        key={todo.id}
                        todo={todo}
                        col={col}
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
                    <Tag color={ASSIGNEE_COLORS[m]} style={{ margin: 0 }}>{m}</Tag>
                  </Select.Option>
                ))}
              </Select>
            </Form.Item>
            <Form.Item name="priority" label="优先级" rules={[{ required: true }]}>
              <Select>
                {(["high", "medium", "low"] as TodoPriority[]).map((p) => (
                  <Select.Option key={p} value={p}>
                    <Tag color={PRIORITY_CONFIG[p].color} style={{ margin: 0 }}>{PRIORITY_CONFIG[p].label}</Tag>
                  </Select.Option>
                ))}
              </Select>
            </Form.Item>
          </div>
          {editing && (
            <Form.Item name="status" label="状态" rules={[{ required: true }]}>
              <Select>
                {COLUMNS.map((c) => (
                  <Select.Option key={c.key} value={c.key}>{c.label}</Select.Option>
                ))}
              </Select>
            </Form.Item>
          )}
          {!editing && (
            <Form.Item name="createdBy" label="创建人" rules={[{ required: true, message: "请选择创建人" }]}>
              <Select placeholder="选择你是谁">
                {MEMBERS.map((m) => (
                  <Select.Option key={m} value={m}>
                    <Tag color={ASSIGNEE_COLORS[m]} style={{ margin: 0 }}>{m}</Tag>
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
  col,
  onEdit,
  onDelete,
  onMove,
}: {
  todo: TodoRow;
  col: { key: TodoStatus; label: string };
  onEdit: () => void;
  onDelete: () => void;
  onMove: (todo: TodoRow, status: TodoStatus) => void;
}) {
  const prevCol = COLUMNS[COLUMNS.findIndex((c) => c.key === col.key) - 1];
  const nextCol = COLUMNS[COLUMNS.findIndex((c) => c.key === col.key) + 1];
  const pri = PRIORITY_CONFIG[todo.priority];

  return (
    <Card
      size="small"
      style={{ borderLeft: `3px solid ${COLUMNS.find((c) => c.key === col.key)!.color}` }}
      styles={{ body: { padding: "10px 12px" } }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
        <Typography.Text strong style={{ fontSize: 13, flex: 1, lineHeight: 1.4 }}>
          {todo.title}
        </Typography.Text>
        <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
          <Button type="text" size="small" icon={<EditOutlined />} onClick={onEdit} style={{ padding: "0 4px" }} />
          <Popconfirm title="确认删除？" onConfirm={onDelete} okText="删除" cancelText="取消">
            <Button type="text" size="small" danger icon={<DeleteOutlined />} style={{ padding: "0 4px" }} />
          </Popconfirm>
        </div>
      </div>

      {todo.description && (
        <Typography.Text type="secondary" style={{ fontSize: 12, display: "block", marginTop: 4 }}>
          {todo.description}
        </Typography.Text>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
        {todo.assignee ? (
          <Tag color={ASSIGNEE_COLORS[todo.assignee]} style={{ margin: 0, fontSize: 11 }}>
            {todo.assignee}
          </Tag>
        ) : (
          <Tag icon={<UserOutlined />} style={{ margin: 0, fontSize: 11, color: "#999", borderColor: "#d9d9d9" }}>
            未分配
          </Tag>
        )}
        <Tag color={pri.color} style={{ margin: 0, fontSize: 11 }}>{pri.label}</Tag>
        <Typography.Text type="secondary" style={{ fontSize: 11, marginLeft: "auto" }}>
          {new Date(todo.createdAt).toLocaleDateString("zh-CN")}
        </Typography.Text>
      </div>

      {(prevCol || nextCol) && (
        <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
          {prevCol && (
            <Button size="small" style={{ fontSize: 11, height: 22, padding: "0 8px" }} onClick={() => onMove(todo, prevCol.key)}>
              ← {prevCol.label}
            </Button>
          )}
          {nextCol && (
            <Button size="small" type="primary" style={{ fontSize: 11, height: 22, padding: "0 8px" }} onClick={() => onMove(todo, nextCol.key)}>
              {nextCol.label} →
            </Button>
          )}
        </div>
      )}
    </Card>
  );
}
