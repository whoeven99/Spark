import { Upload, List, Button, Space, Tag } from 'antd';
import { UploadOutlined, DeleteOutlined, EyeOutlined } from '@ant-design/icons';
import type { Document } from '../types';

interface DocumentUploaderProps {
  documents: Document[];
  maxCount?: number;
  onAdd: (doc: Document) => void;
  onRemove: (id: string) => void;
}

export default function DocumentUploader({
  documents,
  maxCount,
  onAdd,
  onRemove,
}: DocumentUploaderProps) {
  const handleUpload = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const doc: Document = {
        id: `doc-${Date.now()}`,
        filename: file.name,
        type: file.name.split('.').pop() as any,
        size: file.size,
        content: e.target?.result as string,
        uploadedAt: new Date().toISOString(),
      };
      onAdd(doc);
    };
    reader.readAsText(file);
    return false; // 阻止默认上传行为
  };

  const isMaxReached = maxCount && documents.length >= maxCount;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {!isMaxReached && (
        <Upload
          maxCount={1}
          beforeUpload={handleUpload}
          accept=".pdf,.docx,.txt,.md,.csv,.xlsx"
        >
          <Button
            size="small"
            icon={<UploadOutlined />}
            block
            style={{ marginBottom: '8px' }}
          >
            上传文档
          </Button>
        </Upload>
      )}

      {documents.length > 0 && (
        <List
          size="small"
          dataSource={documents}
          renderItem={(doc) => (
            <List.Item
              style={{ padding: '4px 0' }}
              extra={
                <Space size="small">
                  <Button
                    size="small"
                    type="text"
                    icon={<EyeOutlined />}
                    style={{ height: '24px', padding: '0 4px' }}
                  />
                  <Button
                    size="small"
                    type="text"
                    danger
                    icon={<DeleteOutlined />}
                    style={{ height: '24px', padding: '0 4px' }}
                    onClick={() => onRemove(doc.id)}
                  />
                </Space>
              }
            >
              <List.Item.Meta
                title={
                  <div style={{ fontSize: '12px' }}>
                    {doc.filename}
                    <Tag style={{ marginLeft: '8px' }} color="blue">
                      {doc.type}
                    </Tag>
                  </div>
                }
                description={
                  <div style={{ fontSize: '11px', color: '#999' }}>
                    {(doc.size / 1024).toFixed(2)} KB
                  </div>
                }
              />
            </List.Item>
          )}
        />
      )}
    </div>
  );
}
