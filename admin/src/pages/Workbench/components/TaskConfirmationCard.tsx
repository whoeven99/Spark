import { useState } from 'react';
import { Card, Button, Space, Divider, Table, Tag, Statistic, Row, Col, Collapse, InputNumber, Select, Checkbox } from 'antd';
import { EditOutlined, EyeOutlined, CheckCircleOutlined, CloseOutlined } from '@ant-design/icons';

interface TaskConfirmationCardProps {
  card: any;
  onExecute: (task: any) => void;
  onCancel: () => void;
  onEditParameters: (edited: any) => void;
}

export default function TaskConfirmationCard({
  card,
  onExecute,
  onCancel,
  onEditParameters,
}: TaskConfirmationCardProps) {
  const [editingParams, setEditingParams] = useState(false);
  const [tempParams, setTempParams] = useState(card.parameters || {});

  const handleSaveParams = () => {
    onEditParameters({ parameters: tempParams });
    setEditingParams(false);
  };

  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${(ms / 60000).toFixed(1)}m`;
  };

  const previewColumns = [
    {
      title: '对象',
      dataIndex: 'objectId',
      width: 100,
      render: (text: string) => <span style={{ fontSize: '12px' }}>{text}</span>,
    },
    {
      title: '原内容',
      dataIndex: 'before',
      flex: 1,
      render: (text: string) => (
        <div
          style={{
            fontSize: '12px',
            maxHeight: '60px',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {text}
        </div>
      ),
    },
    {
      title: '新内容（预览）',
      dataIndex: 'after',
      flex: 1,
      render: (text: string) => (
        <div
          style={{
            fontSize: '12px',
            maxHeight: '60px',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            color: '#52c41a',
          }}
        >
          {text}
        </div>
      ),
    },
  ];

  const previewData = card.preview?.samples || [];

  return (
    <Card
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <CheckCircleOutlined style={{ color: '#52c41a' }} />
          <span>✅ 任务确认</span>
        </div>
      }
      style={{ marginBottom: '16px' }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {/* 任务基本信息 */}
        <div>
          <div style={{ fontSize: '14px', fontWeight: 'bold', marginBottom: '8px' }}>
            {card.taskName}
          </div>
          <div style={{ fontSize: '12px', color: '#666', marginBottom: '8px' }}>
            {card.description}
          </div>
          <div style={{ fontSize: '12px' }}>
            <Tag>操作对象: {card.targetObjects.count} 个</Tag>
            <Tag style={{ marginLeft: '8px' }}>工具: {card.operation.toolsUsed.join(', ')}</Tag>
          </div>
        </div>

        <Divider style={{ margin: '8px 0' }} />

        {/* 执行估计 */}
        <Row gutter={16}>
          <Col span={8}>
            <Statistic
              title="预计耗时"
              value={formatDuration(card.estimation.estimatedDurationMs)}
            />
          </Col>
          <Col span={8}>
            <Statistic
              title="预计 Tokens"
              value={card.estimation.estimatedTokens}
            />
          </Col>
          <Col span={8}>
            <Statistic
              title="成功率"
              value={`${card.estimation.estimatedSuccessRate}%`}
              valueStyle={{ color: '#52c41a' }}
            />
          </Col>
        </Row>

        <Divider style={{ margin: '8px 0' }} />

        {/* 参数配置 */}
        <div>
          <div
            style={{
              fontSize: '13px',
              fontWeight: 'bold',
              marginBottom: '12px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <span>⚙️ 参数配置</span>
            {!editingParams && (
              <Button
                size="small"
                type="text"
                icon={<EditOutlined />}
                onClick={() => setEditingParams(true)}
              >
                编辑
              </Button>
            )}
          </div>

          {editingParams ? (
            <Collapse
              size="small"
              items={[
                {
                  key: 'params',
                  label: '编辑参数',
                  children: (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {Object.entries(tempParams).map(([key, value]) => (
                        <div key={key}>
                          <label style={{ fontSize: '12px', display: 'block', marginBottom: '4px' }}>
                            {key}
                          </label>
                          {typeof value === 'number' ? (
                            <InputNumber
                              style={{ width: '100%' }}
                              value={value as number}
                              onChange={(val) =>
                                setTempParams({ ...tempParams, [key]: val })
                              }
                            />
                          ) : typeof value === 'boolean' ? (
                            <Checkbox
                              checked={value as boolean}
                              onChange={(e) =>
                                setTempParams({ ...tempParams, [key]: e.target.checked })
                              }
                            />
                          ) : (
                            <input
                              type="text"
                              value={value as string}
                              onChange={(e) =>
                                setTempParams({ ...tempParams, [key]: e.target.value })
                              }
                              style={{
                                width: '100%',
                                padding: '4px 8px',
                                border: '1px solid #d9d9d9',
                                borderRadius: '4px',
                              }}
                            />
                          )}
                        </div>
                      ))}

                      <Space style={{ marginTop: '8px' }}>
                        <Button size="small" type="primary" onClick={handleSaveParams}>
                          保存
                        </Button>
                        <Button size="small" onClick={() => setEditingParams(false)}>
                          取消
                        </Button>
                      </Space>
                    </div>
                  ),
                },
              ]}
            />
          ) : (
            <div
              style={{
                background: '#fafafa',
                padding: '8px',
                borderRadius: '4px',
                fontSize: '12px',
              }}
            >
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                {Object.entries(card.parameters).map(([key, value]) => (
                  <div key={key}>
                    <span style={{ color: '#666' }}>{key}:</span>
                    <span style={{ marginLeft: '4px', fontWeight: 'bold' }}>
                      {String(value)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* 效果预览 */}
        {previewData.length > 0 && (
          <>
            <Divider style={{ margin: '8px 0' }} />
            <div>
              <div
                style={{
                  fontSize: '13px',
                  fontWeight: 'bold',
                  marginBottom: '12px',
                }}
              >
                👁️ 效果预览 (样本)
              </div>
              <Table
                columns={previewColumns}
                dataSource={previewData.map((item: any, idx: number) => ({
                  key: idx,
                  ...item,
                }))}
                size="small"
                pagination={false}
                style={{ fontSize: '12px' }}
              />
            </div>
          </>
        )}

        {/* 操作按钮 */}
        <Divider style={{ margin: '8px 0' }} />
        <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
          <Button icon={<CloseOutlined />} onClick={onCancel}>
            取消
          </Button>
          <Button
            type="primary"
            size="large"
            onClick={() => onExecute(card)}
          >
            执行任务
          </Button>
        </Space>
      </div>
    </Card>
  );
}
