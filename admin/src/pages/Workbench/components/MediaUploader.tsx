import { Upload, List, Button, Space, Tag, Badge } from 'antd';
import { UploadOutlined, DeleteOutlined, EyeOutlined, PlayCircleOutlined, PictureOutlined } from '@ant-design/icons';
import type { MediaFile } from '../types';

interface MediaUploaderProps {
  mediaFiles: MediaFile[];
  onAdd: (file: MediaFile) => void;
  onRemove: (id: string) => void;
}

export default function MediaUploader({ mediaFiles, onAdd, onRemove }: MediaUploaderProps) {
  const handleUpload = (file: File) => {
    const type = file.type.startsWith('image')
      ? 'image'
      : file.type.startsWith('video')
        ? 'video'
        : 'audio';

    const mediaFile: MediaFile = {
      id: `media-${Date.now()}`,
      filename: file.name,
      type: type as any,
      mimeType: file.type,
      size: file.size,
      uploadedAt: new Date().toISOString(),
    };

    onAdd(mediaFile);
    return false;
  };

  const getFileIcon = (type: string) => {
    if (type === 'video') return <PlayCircleOutlined />;
    if (type === 'image') return <PictureOutlined />;
    return <PictureOutlined />;
  };

  const getFileTag = (type: string) => {
    const tagMap = {
      image: { color: 'blue', label: '图片' },
      video: { color: 'orange', label: '视频' },
      audio: { color: 'green', label: '音频' },
    };
    return tagMap[type as keyof typeof tagMap] || { color: 'default', label: '媒体' };
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <Upload
        maxCount={5}
        beforeUpload={handleUpload}
        accept="image/*,video/*,audio/*"
        multiple
      >
        <Button
          size="small"
          icon={<UploadOutlined />}
          block
          style={{ marginBottom: '8px' }}
        >
          上传多媒体
        </Button>
      </Upload>

      {mediaFiles.length > 0 && (
        <List
          size="small"
          dataSource={mediaFiles}
          renderItem={(file) => {
            const tag = getFileTag(file.type);
            return (
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
                      onClick={() => onRemove(file.id)}
                    />
                  </Space>
                }
              >
                <List.Item.Meta
                  avatar={getFileIcon(file.type)}
                  title={
                    <div style={{ fontSize: '12px' }}>
                      {file.filename}
                      <Tag style={{ marginLeft: '8px' }} color={tag.color}>
                        {tag.label}
                      </Tag>
                      {file.transcription && (
                        <Badge
                          count="已转录"
                          style={{ backgroundColor: '#52c41a', marginLeft: '8px' }}
                        />
                      )}
                    </div>
                  }
                  description={
                    <div style={{ fontSize: '11px', color: '#999' }}>
                      {(file.size / 1024 / 1024).toFixed(2)} MB
                      {file.description && (
                        <div style={{ marginTop: '4px', color: '#666' }}>
                          {file.description.substring(0, 50)}...
                        </div>
                      )}
                    </div>
                  }
                />
              </List.Item>
            );
          }}
        />
      )}
    </div>
  );
}
