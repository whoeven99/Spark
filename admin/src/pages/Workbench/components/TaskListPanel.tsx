import { Card, Tabs, List, Badge, Button, Space, Progress, Tag, Empty } from 'antd';
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  ClockCircleOutlined,
  DownloadOutlined,
  DeleteOutlined,
} from '@ant-design/icons';
import type { Task } from '../types';

interface TaskListPanelProps {
  tasks: Task[];
  onTaskClick?: () => void;
}

export default function TaskListPanel({ tasks, onTaskClick }: TaskListPanelProps) {
  const executingTasks = tasks.filter((t) => t.status === 'executing');
  const completedTasks = tasks.filter((t) => t.status === 'completed');
  const failedTasks = tasks.filter((t) => t.status === 'failed');

  const renderTaskCard = (task: Task) => (
    <div
      key={task.id}
      style={{
        padding: '12px',
        background: '#fafafa',
        borderRadius: '4px',
        marginBottom: '8px',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          marginBottom: '8px',
        }}
      >
        <div>
          <div style={{ fontWeight: 'bold', fontSize: '13px', marginBottom: '4px' }}>
            {task.name}
          </div>
          <div style={{ fontSize: '12px', color: '#666' }}>ID: {task.id}</div>
        </div>
        {task.status === 'executing' && (
          <Badge status="processing" text="执行中" />
        )}
        {task.status === 'completed' && (
          <Badge status="success" text="已完成" />
        )}
        {task.status === 'failed' && (
          <Badge status="error" text="失败" />
        )}
      </div>

      {/* 执行中的任务显示进度 */}
      {task.status === 'executing' && (
        <>
          <Progress
            percent={task.progress || 0}
            size="small"
            style={{ marginBottom: '8px' }}
          />
          <div style={{ fontSize: '12px', color: '#999', marginBottom: '8px' }}>
            {task.currentItem}/{task.totalItems} 已处理
          </div>
        </>
      )}

      {/* 已完成的任务显示结果统计 */}
      {task.status === 'completed' && task.result && (
        <div style={{ fontSize: '12px', marginBottom: '8px' }}>
          <Tag color="success">
            {task.result.successCount}/{task.result.totalProcessed} 成功
          </Tag>
          {task.result.failureCount > 0 && (
            <Tag color="error" style={{ marginLeft: '4px' }}>
              {task.result.failureCount} 失败
            </Tag>
          )}
        </div>
      )}

      {/* 失败的任务显示错误 */}
      {task.status === 'failed' && (
        <div style={{ fontSize: '12px', color: '#d4380d', marginBottom: '8px' }}>
          ⚠️ {task.error || '任务执行失败'}
        </div>
      )}

      {/* 操作按钮 */}
      <Space size="small">
        <Button
          size="small"
          type="text"
          onClick={onTaskClick}
          style={{ padding: '0 4px', height: '24px' }}
        >
          详情
        </Button>
        {task.status === 'completed' && (
          <>
            <Button
              size="small"
              type="text"
              icon={<DownloadOutlined />}
              style={{ padding: '0 4px', height: '24px' }}
            >
              下载
            </Button>
            <Button
              size="small"
              type="text"
              style={{ padding: '0 4px', height: '24px' }}
            >
              保存为自动化
            </Button>
          </>
        )}
        {task.status === 'failed' && (
          <Button
            size="small"
            type="text"
            style={{ padding: '0 4px', height: '24px' }}
          >
            重试
          </Button>
        )}
      </Space>
    </div>
  );

  return (
    <Card
      size="small"
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span>📋 任务列表</span>
          <Badge
            count={executingTasks.length + completedTasks.length + failedTasks.length}
            style={{ backgroundColor: '#1677ff' }}
          />
        </div>
      }
      style={{ height: '100%', display: 'flex', flexDirection: 'column' }}
      bodyStyle={{ flex: 1, overflow: 'auto' }}
    >
      <Tabs
        defaultActiveKey="executing"
        items={[
          {
            key: 'executing',
            label: (
              <div>
                <ClockCircleOutlined style={{ marginRight: '4px' }} />
                执行中 ({executingTasks.length})
              </div>
            ),
            children: (
              <div>
                {executingTasks.length === 0 ? (
                  <Empty description="暂无执行中的任务" style={{ marginTop: '20px' }} />
                ) : (
                  executingTasks.map(renderTaskCard)
                )}
              </div>
            ),
          },
          {
            key: 'completed',
            label: (
              <div>
                <CheckCircleOutlined style={{ marginRight: '4px', color: '#52c41a' }} />
                已完成 ({completedTasks.length})
              </div>
            ),
            children: (
              <div>
                {completedTasks.length === 0 ? (
                  <Empty description="暂无已完成的任务" style={{ marginTop: '20px' }} />
                ) : (
                  completedTasks.map(renderTaskCard)
                )}
              </div>
            ),
          },
          {
            key: 'failed',
            label: (
              <div>
                <CloseCircleOutlined style={{ marginRight: '4px', color: '#ff4d4f' }} />
                失败 ({failedTasks.length})
              </div>
            ),
            children: (
              <div>
                {failedTasks.length === 0 ? (
                  <Empty description="暂无失败的任务" style={{ marginTop: '20px' }} />
                ) : (
                  failedTasks.map(renderTaskCard)
                )}
              </div>
            ),
          },
        ]}
        style={{ marginTop: '-16px' }}
      />
    </Card>
  );
}
