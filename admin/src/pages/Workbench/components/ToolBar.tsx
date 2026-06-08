import { useState } from 'react';
import { Space, Button, Modal, Select, Popover, Tooltip, Badge } from 'antd';
import {
  PlusOutlined,
  FileTextOutlined,
  PictureOutlined,
  FileExcelOutlined,
  SettingOutlined,
  ClearOutlined,
} from '@ant-design/icons';
import ObjectSelector from './ObjectSelector';
import DocumentUploader from './DocumentUploader';
import MediaUploader from './MediaUploader';
import ConstraintSettings from './ConstraintSettings';
import type { SelectionContext, ShopifyObjectType } from '../types';

interface ToolBarProps {
  value: SelectionContext;
  onChange: (context: SelectionContext) => void;
}

/**
 * ToolBar - 对话框下方的工具栏
 * 类似 Claude 对话框下方的工具入口
 *
 * 用户可以在发送对话前，通过这个工具栏补充上下文信息：
 * - 选择操作对象（商品、文章等）
 * - 上传参考文档
 * - 上传多媒体文件
 * - 设置约束条件
 */
export default function ToolBar({ value, onChange }: ToolBarProps) {
  const [selectorModalOpen, setSelectorModalOpen] = useState(false);
  const [selectedObjectType, setSelectedObjectType] = useState<ShopifyObjectType>('products');
  const [constraintModalOpen, setConstraintModalOpen] = useState(false);

  const handleObjectSelect = (objects: any) => {
    onChange({
      ...value,
      selectedObjects: objects,
    });
    setSelectorModalOpen(false);
  };

  const handleClearAll = () => {
    onChange({
      selectedObjects: null,
      referenceDocuments: [],
      dataSource: null,
      mediaFiles: [],
      rules: [],
      styleExamples: [],
      constraints: {},
    });
  };

  // 计算已补充的上下文信息
  const contextCount = [
    value.selectedObjects ? 1 : 0,
    value.referenceDocuments.length,
    value.dataSource ? 1 : 0,
    value.mediaFiles.length,
  ].reduce((a, b) => a + b, 0);

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '12px',
        background: '#f5f5f5',
        borderRadius: '8px',
        border: '1px solid #e8e8e8',
        minHeight: '44px',
      }}
    >
      {/* 提示文本 */}
      <span style={{ fontSize: '12px', color: '#8c8c8c', marginRight: '4px' }}>
        添加上下文:
      </span>

      {/* 选择对象 */}
      <Tooltip title="选择要操作的商品、文章等对象">
        <Button
          size="small"
          type={value.selectedObjects ? 'primary' : 'default'}
          icon={<PlusOutlined />}
          onClick={() => setSelectorModalOpen(true)}
        >
          {value.selectedObjects ? `对象 ${value.selectedObjects.count}` : '选对象'}
        </Button>
      </Tooltip>

      {/* 参考文档 */}
      <Popover
        title="参考文档"
        trigger="click"
        content={
          <DocumentUploader
            documents={value.referenceDocuments}
            onAdd={(doc) =>
              onChange({
                ...value,
                referenceDocuments: [...value.referenceDocuments, doc],
              })
            }
            onRemove={(id) =>
              onChange({
                ...value,
                referenceDocuments: value.referenceDocuments.filter((d) => d.id !== id),
              })
            }
          />
        }
        placement="topLeft"
      >
        <Button
          size="small"
          type={value.referenceDocuments.length > 0 ? 'primary' : 'default'}
          icon={<FileTextOutlined />}
        >
          {value.referenceDocuments.length > 0 ? `文档 ${value.referenceDocuments.length}` : '参考文档'}
        </Button>
      </Popover>

      {/* 多媒体 */}
      <Popover
        title="多媒体"
        trigger="click"
        content={
          <MediaUploader
            mediaFiles={value.mediaFiles}
            onAdd={(file) =>
              onChange({
                ...value,
                mediaFiles: [...value.mediaFiles, file],
              })
            }
            onRemove={(id) =>
              onChange({
                ...value,
                mediaFiles: value.mediaFiles.filter((f) => f.id !== id),
              })
            }
          />
        }
        placement="topLeft"
      >
        <Button
          size="small"
          type={value.mediaFiles.length > 0 ? 'primary' : 'default'}
          icon={<PictureOutlined />}
        >
          {value.mediaFiles.length > 0 ? `媒体 ${value.mediaFiles.length}` : '多媒体'}
        </Button>
      </Popover>

      {/* 约束条件 */}
      <Tooltip title="设置长度、保留字段等约束">
        <Button
          size="small"
          icon={<SettingOutlined />}
          onClick={() => setConstraintModalOpen(true)}
        >
          约束
        </Button>
      </Tooltip>

      {/* 分隔符 */}
      <div style={{ width: '1px', height: '24px', background: '#d9d9d9' }} />

      {/* 已补充信息提示 */}
      {contextCount > 0 && (
        <span style={{ fontSize: '12px', color: '#52c41a', fontWeight: 'bold' }}>
          已补充 {contextCount} 项
        </span>
      )}

      {/* 清空按钮 */}
      {contextCount > 0 && (
        <Button
          size="small"
          danger
          type="text"
          icon={<ClearOutlined />}
          onClick={handleClearAll}
        >
          清空
        </Button>
      )}

      {/* 对象选择器模态 */}
      <Modal
        title="选择操作对象"
        open={selectorModalOpen}
        onCancel={() => setSelectorModalOpen(false)}
        width={700}
        footer={null}
      >
        <div style={{ marginBottom: '16px' }}>
          <label style={{ fontSize: '13px', fontWeight: 'bold', display: 'block', marginBottom: '8px' }}>
            对象类型:
          </label>
          <Select
            style={{ width: '100%' }}
            value={selectedObjectType}
            onChange={setSelectedObjectType}
            options={[
              { label: '商品', value: 'products' },
              { label: '文章', value: 'articles' },
              { label: '客户', value: 'customers' },
              { label: '订单', value: 'orders' },
              { label: '分类', value: 'collections' },
            ]}
          />
        </div>

        <ObjectSelector
          objectType={selectedObjectType}
          onSelect={handleObjectSelect}
        />
      </Modal>

      {/* 约束条件模态 */}
      <Modal
        title="约束条件"
        open={constraintModalOpen}
        onCancel={() => setConstraintModalOpen(false)}
        onOk={() => setConstraintModalOpen(false)}
      >
        <ConstraintSettings
          value={value.constraints}
          onChange={(constraints) =>
            onChange({
              ...value,
              constraints,
            })
          }
        />
      </Modal>
    </div>
  );
}
