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
} from "antd";
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  UserOutlined,
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

const PRIORITY_CONFIG: Record<TodoPriority, { color: string; label: string }> = {
  high: { color: "red", label: "高" },
  medium: { color: "orange", label: "中" },
  low: { color: "default", label: "低" },
};

const STATUS_ROWS: {
  key: TodoStatus;
  label: string;
  icon: React.ReactNode;
  color: string;
  bgColor: string;
}[] = [
  { key: "doing", label: "进行中", icon: <PlayCircleOutlined />, color: "#faad14", bgColor: "#fffbe6" },
  { key: "todo", label: "待办", icon: <HourglassOutlined />, color: "#d9d9d9", bgColor: "#fafafa" },
  { key: "done", label: "已完成", icon: <CheckCircleOutlined />, color: "#52c41a", bgColor: "#f6ffed" },
];

const ME_KEY = "spark_admin_me";

function getMe(): string {
  return localStorage.getItem(ME_KEY) ?? MEMBERS[0];
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

  const getTodosFor = (assignee: TodoAssignee | null, status: TodoStatus) =>
    todos.filter((t) => (assignee ? t.assignee === assignee : t.assignee === null) && t.status === status);

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <Typography.Title level={4} style={{ margin: 0 }}>
          Team Todo
        </Typography.Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
          新建
        </Button>
      </div>

      <Spin spinning={loading}>
        <div style={{ display: "grid", gridTemplateColumns: `100px repeat(${MEMBERS.length + 1}, 1fr)`, gap: 16, alignItems: "start" }}>
          {/* Header row: member names */}
          <div />
          {MEMBERS.map((member) => (
            <div key={member} style={{ textAlign: "center" }}>
              <Tag color={ASSIGNEE_COLORS[member]} style={{ fontSize: 12, padding: "4px 12px" }}>
                {member.toUpperCase()}
              </Tag>
            </div>
          ))}
          <div style={{ textAlign: "center" }}>
            <Tag style={{ fontSize: 12, padding: "4px 12px", color: "#666", borderColor: "#d9d9d9" }}>
              未分配
            </Tag>
          </div>

          {/* Rows: status rows with cards */}
          {STATUS_ROWS.map((statusRow) => (
            <div
              key={statusRow.key}
              style={{
                gridColumn: "1 / -1",
                display: "grid",
                gridTemplateColumns: `100px repeat(${MEMBERS.length + 1}, 1fr)`,
                gap: 16,
                alignItems: "start",
                padding: "12px 0",
                backgroundColor: statusRow.bgColor,
                borderRadius: 4,
                paddingLeft: 12,
              }}
            >
              {/* Status label */}
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 20, color: statusRow.color }}>{statusRow.icon}</span>
                <Typography.Text strong style={{ fontSize: 12, color: statusRow.color }}>
                  {statusRow.label}
                </Typography.Text>
              </div>

              {/* Columns for each member + unassigned */}
              {MEMBERS.map((member) => (
                <div key={member} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {getTodosFor(member, statusRow.key).length === 0 ? (
                    <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={false} style={{ margin: "12px 0" }} />
                  ) : (
                    getTodosFor(member, statusRow.key).map((todo) => (
                      <TodoCard
                        key={todo.id}
                        todo={todo}
                        onEdit={() => openEdit(todo)}
                        onDelete={() => handleDelete(todo.id)}
                        onMove={moveStatus}
                      />
                    ))
                  )}
                </div>
              ))}

              {/* Unassigned column */}
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {getTodosFor(null, statusRow.key).length === 0 ? (
                  <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={false} style={{ margin: "12px 0" }} />
                ) : (
                  getTodosFor(null, statusRow.key).map((todo) => (
                    <TodoCard
                      key={todo.id}
                      todo={todo}
                      onEdit={() => openEdit(todo)}
                      onDelete={() => handleDelete(todo.id)}
                      onMove={moveStatus}
                    />
                  ))
                )}
              </div>
            </div>
          ))}
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
                    <Tag color={ASSIGNEE_COLORS[m]} style={{ margin: 0 }}>
                      {m.toUpperCase()}
                    </Tag>
                  </Select.Option>
                ))}
              </Select>
            </Form.Item>
            <Form.Item name="priority" label="优先级" rules={[{ required: true }]}>
              <Select>
                {(["high", "medium", "low"] as TodoPriority[]).map((p) => (
                  <Select.Option key={p} value={p}>
                    <Tag color={PRIORITY_CONFIG[p].color} style={{ margin: 0 }}>
                      {PRIORITY_CONFIG[p].label}
                    </Tag>
                  </Select.Option>
                ))}
              </Select>
            </Form.Item>
          </div>
          {editing && (
            <Form.Item name="status" label="状态" rules={[{ required: true }]}>
              <Select>
                {STATUS_ROWS.map((s) => (
                  <Select.Option key={s.key} value={s.key}>
                    {s.label}
                  </Select.Option>
                ))}
              </Select>
            </Form.Item>
          )}
          {!editing && (
            <Form.Item name="createdBy" label="创建人" rules={[{ required: true, message: "请选择创建人" }]}>
              <Select placeholder="选择你是谁">
                {MEMBERS.map((m) => (
                  <Select.Option key={m} value={m}>
                    <Tag color={ASSIGNEE_COLORS[m]} style={{ margin: 0 }}>
                      {m.toUpperCase()}
                    </Tag>
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
  onEdit,
  onDelete,
  onMove,
}: {
  todo: TodoRow;
  onEdit: () => void;
  onDelete: () => void;
  onMove: (todo: TodoRow, status: TodoStatus) => void;
}) {
  const statusIndex = STATUS_ROWS.findIndex((s) => s.key === todo.status);
  const canMovePrev = statusIndex > 0;
  const canMoveNext = statusIndex < STATUS_ROWS.length - 1;
  const pri = PRIORITY_CONFIG[todo.priority];

  return (
    <Card
      size="small"
      style={{ borderLeft: `3px solid ${STATUS_ROWS.find((s) => s.key === todo.status)?.color}` }}
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
        <Tag color={pri.color} style={{ margin: 0, fontSize: 11 }}>
          {pri.label}
        </Tag>
        <Typography.Text type="secondary" style={{ fontSize: 11, marginLeft: "auto" }}>
          {new Date(todo.createdAt).toLocaleDateString("zh-CN")}
        </Typography.Text>
      </div>

      {(canMovePrev || canMoveNext) && (
        <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
          {canMovePrev && (
            <Button
              size="small"
              style={{ fontSize: 11, height: 22, padding: "0 8px" }}
              onClick={() => onMove(todo, STATUS_ROWS[statusIndex - 1].key)}
            >
              ← {STATUS_ROWS[statusIndex - 1].label}
            </Button>
          )}
          {canMoveNext && (
            <Button
              size="small"
              type="primary"
              style={{ fontSize: 11, height: 22, padding: "0 8px" }}
              onClick={() => onMove(todo, STATUS_ROWS[statusIndex + 1].key)}
            >
              {STATUS_ROWS[statusIndex + 1].label} →
            </Button>
          )}
        </div>
      )}
    </Card>
  );
}
