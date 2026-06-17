import { useCallback, useEffect, useRef, useState } from "react";
import {
  Typography,
  Input,
  Button,
  Badge,
  Tag,
  Empty,
  Spin,
  Segmented,
  message as antdMessage,
  Tooltip,
} from "antd";
import {
  ReloadOutlined,
  MailOutlined,
  SendOutlined,
  CheckOutlined,
} from "@ant-design/icons";
import {
  fetchSupportConversations,
  fetchSupportConversation,
  replySupport,
  setSupportStatus,
  type SupportConversationRow,
  type SupportMessageRow,
} from "../api";

const LIST_POLL_MS = 10000;
const THREAD_POLL_MS = 5000;
const OPS_NAME_KEY = "spark_support_ops_name";

function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

export default function Support() {
  const [conversations, setConversations] = useState<SupportConversationRow[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [activeShop, setActiveShop] = useState<string | null>(null);
  const [messages, setMessages] = useState<SupportMessageRow[]>([]);
  const [activeConv, setActiveConv] = useState<SupportConversationRow | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [loadingList, setLoadingList] = useState(true);
  const [opsName, setOpsName] = useState(
    () => localStorage.getItem(OPS_NAME_KEY) ?? "",
  );

  const threadEndRef = useRef<HTMLDivElement | null>(null);

  const loadList = useCallback(async () => {
    try {
      const { conversations: rows } = await fetchSupportConversations({
        status: statusFilter,
        search: search.trim() || undefined,
      });
      setConversations(rows);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingList(false);
    }
  }, [statusFilter, search]);

  const loadThread = useCallback(async (shop: string) => {
    try {
      const { conversation, messages: msgs } = await fetchSupportConversation(shop);
      setActiveConv(conversation);
      setMessages(msgs);
    } catch (e) {
      console.error(e);
    }
  }, []);

  // 列表轮询
  useEffect(() => {
    void loadList();
    const interval = window.setInterval(loadList, LIST_POLL_MS);
    return () => window.clearInterval(interval);
  }, [loadList]);

  // 当前会话轮询
  useEffect(() => {
    if (!activeShop) return;
    void loadThread(activeShop);
    const interval = window.setInterval(() => loadThread(activeShop), THREAD_POLL_MS);
    return () => window.clearInterval(interval);
  }, [activeShop, loadThread]);

  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  const handleSelect = useCallback(
    (shop: string) => {
      setActiveShop(shop);
      setMessages([]);
      setActiveConv(null);
      // 选中即标记已读，本地立即清未读徽标
      setConversations((prev) =>
        prev.map((c) => (c.shop === shop ? { ...c, unreadForOps: 0 } : c)),
      );
    },
    [],
  );

  const handleReply = useCallback(async () => {
    const content = draft.trim();
    if (!content || !activeShop || sending) return;
    setSending(true);
    try {
      await replySupport(activeShop, content, opsName.trim() || undefined);
      if (opsName.trim()) localStorage.setItem(OPS_NAME_KEY, opsName.trim());
      setDraft("");
      await loadThread(activeShop);
      void loadList();
    } catch (e) {
      antdMessage.error(`回复失败：${String(e)}`);
    } finally {
      setSending(false);
    }
  }, [draft, activeShop, sending, opsName, loadThread, loadList]);

  const handleToggleStatus = useCallback(async () => {
    if (!activeShop || !activeConv) return;
    const next = activeConv.status === "closed" ? "open" : "closed";
    try {
      await setSupportStatus(activeShop, next);
      await loadThread(activeShop);
      void loadList();
    } catch (e) {
      antdMessage.error(`操作失败：${String(e)}`);
    }
  }, [activeShop, activeConv, loadThread, loadList]);

  return (
    <div>
      <Typography.Title level={4} style={{ marginTop: 0 }}>
        客服会话
      </Typography.Title>
      <div style={{ display: "flex", gap: 16, height: "calc(100vh - 200px)" }}>
        {/* 左侧：收件箱 */}
        <div style={listStyles.column}>
          <div style={listStyles.toolbar}>
            <Segmented
              size="small"
              value={statusFilter}
              onChange={(v) => setStatusFilter(String(v))}
              options={[
                { label: "全部", value: "all" },
                { label: "进行中", value: "open" },
                { label: "已关闭", value: "closed" },
              ]}
            />
            <Tooltip title="刷新">
              <Button
                size="small"
                icon={<ReloadOutlined />}
                onClick={() => loadList()}
              />
            </Tooltip>
          </div>
          <Input.Search
            size="small"
            allowClear
            placeholder="搜索店铺 / 邮箱"
            onSearch={(v) => setSearch(v)}
            onChange={(e) => !e.target.value && setSearch("")}
            style={{ padding: "0 8px 8px" }}
          />
          <div style={listStyles.scroll}>
            {loadingList ? (
              <div style={{ textAlign: "center", padding: 24 }}>
                <Spin />
              </div>
            ) : conversations.length === 0 ? (
              <Empty description="暂无会话" style={{ marginTop: 40 }} />
            ) : (
              conversations.map((c) => (
                <div
                  key={c.id}
                  onClick={() => handleSelect(c.shop)}
                  style={{
                    ...listStyles.item,
                    background: c.shop === activeShop ? "#e6f4ff" : "#fff",
                  }}
                >
                  <div style={listStyles.itemHeader}>
                    <span style={listStyles.shopName}>{c.shop}</span>
                    {c.unreadForOps > 0 && <Badge count={c.unreadForOps} />}
                  </div>
                  <div style={listStyles.preview}>{c.lastMessage || "—"}</div>
                  <div style={listStyles.itemMeta}>
                    <span>{formatTime(c.lastMessageAt)}</span>
                    {c.status === "closed" && <Tag color="default">已关闭</Tag>}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* 右侧：对话 */}
        <div style={threadStyles.column}>
          {!activeShop || !activeConv ? (
            <div style={threadStyles.placeholder}>
              <Empty description="选择左侧会话开始回复" />
            </div>
          ) : (
            <>
              <div style={threadStyles.header}>
                <div>
                  <div style={threadStyles.headerShop}>{activeConv.shop}</div>
                  <div style={threadStyles.contacts}>
                    <MailOutlined style={{ marginRight: 4 }} />
                    {activeConv.contactEmail ? (
                      <span style={{ color: "#1677ff" }}>
                        {activeConv.contactEmail}（留言邮箱）
                      </span>
                    ) : (
                      <span style={{ color: "#8c8c8c" }}>未留言邮箱</span>
                    )}
                    {activeConv.shopEmail && (
                      <span style={{ marginLeft: 10, color: "#8c8c8c" }}>
                        账户：{activeConv.shopEmail}
                      </span>
                    )}
                  </div>
                </div>
                <Button size="small" onClick={handleToggleStatus}>
                  {activeConv.status === "closed" ? "重新打开" : "标记关闭"}
                </Button>
              </div>

              <div style={threadStyles.body}>
                {messages.length === 0 ? (
                  <Empty description="暂无消息" style={{ marginTop: 40 }} />
                ) : (
                  messages.map((m) => {
                    const isOps = m.sender === "ops";
                    return (
                      <div
                        key={m.id}
                        style={{
                          ...threadStyles.msgRow,
                          justifyContent: isOps ? "flex-end" : "flex-start",
                        }}
                      >
                        <div
                          style={isOps ? threadStyles.bubbleOps : threadStyles.bubbleShop}
                        >
                          <div style={threadStyles.sender}>
                            {isOps
                              ? m.senderName || "运营"
                              : "商家"}
                            <span style={threadStyles.msgTime}>
                              {formatTime(m.createdAt)}
                            </span>
                          </div>
                          <div style={threadStyles.msgContent}>{m.content}</div>
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={threadEndRef} />
              </div>

              <div style={threadStyles.inputArea}>
                <Input
                  size="small"
                  prefix={<CheckOutlined style={{ color: "#bbb" }} />}
                  placeholder="你的客服名（会显示给商家，可选）"
                  value={opsName}
                  onChange={(e) => setOpsName(e.target.value)}
                  style={{ marginBottom: 8 }}
                />
                <div style={{ display: "flex", gap: 8 }}>
                  <Input.TextArea
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    placeholder="输入回复，Enter 发送，Shift+Enter 换行"
                    autoSize={{ minRows: 2, maxRows: 5 }}
                    onPressEnter={(e) => {
                      if (!e.shiftKey) {
                        e.preventDefault();
                        void handleReply();
                      }
                    }}
                  />
                  <Button
                    type="primary"
                    icon={<SendOutlined />}
                    loading={sending}
                    disabled={!draft.trim()}
                    onClick={handleReply}
                  >
                    发送
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

const listStyles: Record<string, React.CSSProperties> = {
  column: {
    width: 320,
    flexShrink: 0,
    background: "#fafafa",
    border: "1px solid #f0f0f0",
    borderRadius: 8,
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
  },
  toolbar: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 8,
  },
  scroll: { flex: 1, overflowY: "auto" },
  item: {
    padding: "10px 12px",
    borderBottom: "1px solid #f0f0f0",
    cursor: "pointer",
  },
  itemHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  shopName: {
    fontWeight: 600,
    fontSize: 13,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  preview: {
    fontSize: 12,
    color: "#8c8c8c",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    marginTop: 2,
  },
  itemMeta: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    fontSize: 11,
    color: "#bfbfbf",
    marginTop: 4,
  },
};

const threadStyles: Record<string, React.CSSProperties> = {
  column: {
    flex: 1,
    border: "1px solid #f0f0f0",
    borderRadius: 8,
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    background: "#fff",
  },
  placeholder: {
    flex: 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  header: {
    padding: "12px 16px",
    borderBottom: "1px solid #f0f0f0",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  headerShop: { fontWeight: 600, fontSize: 15 },
  contacts: { fontSize: 12, marginTop: 4 },
  body: {
    flex: 1,
    overflowY: "auto",
    padding: 16,
    background: "#f6f6f7",
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },
  msgRow: { display: "flex" },
  bubbleShop: {
    background: "#fff",
    padding: "8px 12px",
    borderRadius: "10px 10px 10px 2px",
    maxWidth: "72%",
    boxShadow: "0 1px 2px rgba(0,0,0,0.08)",
  },
  bubbleOps: {
    background: "#d6f5e3",
    padding: "8px 12px",
    borderRadius: "10px 10px 2px 10px",
    maxWidth: "72%",
  },
  sender: { fontSize: 11, color: "#8c8c8c", marginBottom: 2 },
  msgTime: { marginLeft: 8 },
  msgContent: { fontSize: 14, whiteSpace: "pre-wrap", wordBreak: "break-word" },
  inputArea: {
    padding: 12,
    borderTop: "1px solid #f0f0f0",
    background: "#fff",
  },
};
