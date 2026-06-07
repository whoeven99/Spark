import { useRef, useEffect, useState } from 'react';
import { Input, Button, Space, Card, Empty, Spin, Avatar, Tag } from 'antd';
import { SendOutlined, RobotOutlined, UserOutlined } from '@ant-design/icons';
import type { ChatMessage, SelectionContext } from '../types';

interface ChatPanelProps {
  messages: ChatMessage[];
  selectedContext: SelectionContext;
  onSendMessage: (message: string) => void;
}

export default function ChatPanel({
  messages,
  selectedContext,
  onSendMessage,
}: ChatPanelProps) {
  const [inputValue, setInputValue] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // 滚动到最底部
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    if (!inputValue.trim()) return;

    setLoading(true);
    await onSendMessage(inputValue);
    setInputValue('');
    setLoading(false);
  };

  const contextInfo = [
    selectedContext.selectedObjects &&
      `对象: ${selectedContext.selectedObjects.count}个`,
    selectedContext.referenceDocuments.length > 0 &&
      `参考: ${selectedContext.referenceDocuments.length}个`,
    selectedContext.dataSource && '数据源: ✓',
    selectedContext.mediaFiles.length > 0 && `多媒体: ${selectedContext.mediaFiles.length}个`,
  ].filter(Boolean);

  return (
    <Card
      size="small"
      style={{
        display: 'flex',
        flexDirection: 'column',
        flex: 1,
        minHeight: '600px',
      }}
    >
      {/* 对话历史 */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          marginBottom: '16px',
          paddingRight: '8px',
        }}
      >
        {messages.length === 0 ? (
          <Empty
            description="暂无对话"
            style={{ marginTop: '60px' }}
          />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {messages.map((msg) => (
              <div
                key={msg.id}
                style={{
                  display: 'flex',
                  justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
                  gap: '8px',
                }}
              >
                {msg.role === 'assistant' && <RobotOutlined style={{ marginTop: '4px' }} />}

                <div
                  style={{
                    maxWidth: '70%',
                    padding: '12px',
                    borderRadius: '8px',
                    background:
                      msg.role === 'user' ? '#1677ff' : '#f0f0f0',
                    color: msg.role === 'user' ? '#fff' : '#000',
                    wordWrap: 'break-word',
                  }}
                >
                  <div style={{ fontSize: '13px', lineHeight: '1.5' }}>
                    {msg.content}
                  </div>
                  <div
                    style={{
                      fontSize: '11px',
                      marginTop: '4px',
                      opacity: 0.7,
                    }}
                  >
                    {new Date(msg.timestamp).toLocaleTimeString()}
                  </div>
                </div>

                {msg.role === 'user' && <UserOutlined style={{ marginTop: '4px' }} />}
              </div>
            ))}

            {loading && (
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <RobotOutlined />
                <Spin size="small" />
                <span style={{ fontSize: '12px', color: '#999' }}>处理中...</span>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* 上下文提示 */}
      {contextInfo.length > 0 && (
        <div
          style={{
            padding: '8px',
            background: '#fafafa',
            borderRadius: '4px',
            marginBottom: '12px',
            fontSize: '12px',
          }}
        >
          <div style={{ marginBottom: '4px', fontWeight: 'bold' }}>📎 当前上下文:</div>
          <Space size="small" wrap>
            {contextInfo.map((info, idx) => (
              <Tag key={idx}>{info}</Tag>
            ))}
          </Space>
        </div>
      )}

      {/* 输入框 */}
      <Space.Compact style={{ width: '100%' }}>
        <Input
          placeholder="请描述你的任务..."
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onPressEnter={handleSend}
          disabled={loading}
          style={{ borderRadius: '4px 0 0 4px' }}
        />
        <Button
          type="primary"
          icon={<SendOutlined />}
          onClick={handleSend}
          loading={loading}
          disabled={!inputValue.trim() || loading}
          style={{ borderRadius: '0 4px 4px 0' }}
        >
          发送
        </Button>
      </Space.Compact>
    </Card>
  );
}
