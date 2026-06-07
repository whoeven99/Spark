import { Tabs, Card, List, Tag, Empty, Badge, Collapse, Typography, Button, Space } from 'antd';
import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  CloseCircleOutlined,
  RobotOutlined,
  ToolOutlined,
  HistoryOutlined,
} from '@ant-design/icons';
import type { Task, ChatMessage } from '../types';
import TaskListPanel from './TaskListPanel';

interface RightPanelProps {
  tasks: Task[];
  messages: ChatMessage[];
  onTaskClick?: (task: Task) => void;
  availableSkills?: Array<{ name: string; category: string; description: string }>;
  availableTools?: Array<{ name: string; description: string }>;
}

/**
 * 右侧综合面板
 * 包含：任务列表、可用技能、对话记录
 */
export default function RightPanel({
  tasks,
  messages,
  onTaskClick,
  availableSkills = [],
  availableTools = [],
}: RightPanelProps) {
  const executingCount = tasks.filter((t) => t.status === 'executing').length;
  const completedCount = tasks.filter((t) => t.status === 'completed').length;
  const failedCount = tasks.filter((t) => t.status === 'failed').length;

  return (
    <div style={{ width: '340px', display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Tabs
        defaultActiveKey="tasks"
        items={[
          {
            key: 'tasks',
            label: (
              <div>
                <CheckCircleOutlined style={{ marginRight: '4px' }} />
                任务列表
                <Badge
                  count={executingCount + completedCount + failedCount}
                  style={{ marginLeft: '8px', backgroundColor: '#1677ff' }}
                />
              </div>
            ),
            children: (
              <TaskListPanel
                tasks={tasks}
                onTaskClick={onTaskClick}
              />
            ),
          },
          {
            key: 'skills',
            label: (
              <div>
                <RobotOutlined style={{ marginRight: '4px' }} />
                可用技能
                <Badge
                  count={availableSkills.length}
                  style={{ marginLeft: '8px', backgroundColor: '#52c41a' }}
                />
              </div>
            ),
            children: (
              <div style={{ maxHeight: 'calc(100vh - 300px)', overflowY: 'auto' }}>
                {availableSkills.length === 0 ? (
                  <Empty description="暂无可用技能" />
                ) : (
                  <Collapse
                    size="small"
                    items={availableSkills.map((skill) => ({
                      key: skill.name,
                      label: (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontWeight: 'bold', fontSize: '13px' }}>
                            {skill.name}
                          </span>
                          <Tag color="blue" style={{ fontSize: '11px' }}>
                            {skill.category}
                          </Tag>
                        </div>
                      ),
                      children: (
                        <div>
                          <Typography.Text type="secondary" style={{ fontSize: '12px' }}>
                            {skill.description}
                          </Typography.Text>
                          <Button
                            size="small"
                            type="primary"
                            style={{ marginTop: '8px' }}
                            onClick={() => {
                              // 可以在这里处理选择技能的逻辑
                              console.log('Selected skill:', skill.name);
                            }}
                          >
                            使用此技能
                          </Button>
                        </div>
                      ),
                    }))}
                  />
                )}
              </div>
            ),
          },
          {
            key: 'tools',
            label: (
              <div>
                <ToolOutlined style={{ marginRight: '4px' }} />
                工具列表
                <Badge
                  count={availableTools.length}
                  style={{ marginLeft: '8px', backgroundColor: '#faad14' }}
                />
              </div>
            ),
            children: (
              <div style={{ maxHeight: 'calc(100vh - 300px)', overflowY: 'auto' }}>
                {availableTools.length === 0 ? (
                  <Empty description="暂无可用工具" />
                ) : (
                  <List
                    size="small"
                    dataSource={availableTools}
                    renderItem={(tool) => (
                      <List.Item
                        style={{ padding: '8px 0' }}
                        extra={
                          <Button
                            size="small"
                            type="text"
                            onClick={() => {
                              console.log('Selected tool:', tool.name);
                            }}
                          >
                            使用
                          </Button>
                        }
                      >
                        <List.Item.Meta
                          title={
                            <div style={{ fontSize: '13px', fontWeight: 'bold' }}>
                              {tool.name}
                            </div>
                          }
                          description={
                            <Typography.Text type="secondary" style={{ fontSize: '11px' }}>
                              {tool.description}
                            </Typography.Text>
                          }
                        />
                      </List.Item>
                    )}
                  />
                )}
              </div>
            ),
          },
          {
            key: 'history',
            label: (
              <div>
                <HistoryOutlined style={{ marginRight: '4px' }} />
                对话记录
                <Badge
                  count={messages.length}
                  style={{ marginLeft: '8px', backgroundColor: '#722ed1' }}
                />
              </div>
            ),
            children: (
              <div style={{ maxHeight: 'calc(100vh - 300px)', overflowY: 'auto' }}>
                {messages.length === 0 ? (
                  <Empty description="暂无对话记录" />
                ) : (
                  <List
                    size="small"
                    dataSource={[...messages].reverse()}
                    renderItem={(msg) => (
                      <List.Item
                        style={{ padding: '8px', borderBottom: '1px solid #f0f0f0' }}
                      >
                        <List.Item.Meta
                          avatar={
                            msg.role === 'user' ? (
                              <span style={{ fontSize: '12px', color: '#1677ff' }}>👤</span>
                            ) : (
                              <span style={{ fontSize: '12px', color: '#52c41a' }}>🤖</span>
                            )
                          }
                          title={
                            <div style={{ fontSize: '12px', fontWeight: 'bold' }}>
                              {msg.role === 'user' ? '你' : '助手'}
                            </div>
                          }
                          description={
                            <div style={{ fontSize: '11px', color: '#666', maxWidth: '260px' }}>
                              <div
                                style={{
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap',
                                  marginBottom: '4px',
                                }}
                              >
                                {msg.content}
                              </div>
                              <div style={{ fontSize: '10px', color: '#999' }}>
                                {new Date(msg.timestamp).toLocaleTimeString()}
                              </div>
                            </div>
                          }
                        />
                      </List.Item>
                    )}
                  />
                )}
              </div>
            ),
          },
        ]}
        style={{ height: '100%' }}
        tabBarStyle={{ margin: '0' }}
      />
    </div>
  );
}
