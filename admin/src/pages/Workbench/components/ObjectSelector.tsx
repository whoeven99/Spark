import { useState, useEffect } from 'react';
import { Input, Table, Checkbox, Button, Space, Tabs, Tree, Badge, Spin, Alert } from 'antd';
import { SearchOutlined } from '@ant-design/icons';
import type { ShopifyObjectType } from '../types';

interface ObjectSelectorProps {
  objectType: ShopifyObjectType;
  mode?: 'single' | 'multiple';
  onSelect: (objects: { type: ShopifyObjectType; ids: string[]; count: number }) => void;
}

export default function ObjectSelector({
  objectType,
  mode = 'multiple',
  onSelect,
}: ObjectSelectorProps) {
  const [searchText, setSearchText] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [filterCriteria, setFilterCriteria] = useState<Record<string, unknown>>({});
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [tags, setTags] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState('direct');

  // 模拟数据加载
  useEffect(() => {
    setLoading(true);
    // 这里应该调用 API 获取对象列表
    // 暂时使用模拟数据
    setTimeout(() => {
      if (objectType === 'products') {
        setData([
          { id: 'p1', name: '红色T恤', sku: 'SKU-001', price: 99, stock: 45 },
          { id: 'p2', name: '蓝色连衣裙', sku: 'SKU-002', price: 189, stock: 12 },
          { id: 'p3', name: '黑色牛仔裤', sku: 'SKU-003', price: 299, stock: 3 },
          { id: 'p4', name: '白色运动鞋', sku: 'SKU-004', price: 399, stock: 0 },
        ]);
        setTags([
          { key: 'low-stock', title: '库存预警 (2)', value: 'low-stock' },
          { key: 'new', title: '新上架 (1)', value: 'new' },
          { key: 'hot', title: '热销 (3)', value: 'hot' },
        ]);
      } else if (objectType === 'articles') {
        setData([
          { id: 'a1', title: '2025年春季时尚趋势', createdAt: '2025-01-15' },
          { id: 'a2', title: '如何选择适合的衣服', createdAt: '2025-01-14' },
          { id: 'a3', title: '护肤小贴士', createdAt: '2025-01-13' },
        ]);
      }
      setLoading(false);
    }, 500);
  }, [objectType]);

  const filteredData = data.filter((item) => {
    const searchMatch =
      !searchText ||
      (item.name?.toLowerCase().includes(searchText.toLowerCase()) ||
        item.title?.toLowerCase().includes(searchText.toLowerCase()) ||
        item.sku?.toLowerCase().includes(searchText.toLowerCase()));

    return searchMatch;
  });

  const columns =
    objectType === 'products'
      ? [
          {
            title: '',
            width: 50,
            render: (_: any, record: any) => (
              <Checkbox
                checked={selectedIds.includes(record.id)}
                onChange={(e) => {
                  if (e.target.checked) {
                    setSelectedIds([...selectedIds, record.id]);
                  } else {
                    setSelectedIds(selectedIds.filter((id) => id !== record.id));
                  }
                }}
              />
            ),
          },
          { title: 'SKU', dataIndex: 'sku', width: 100 },
          { title: '商品名', dataIndex: 'name', flex: 1 },
          { title: '价格', dataIndex: 'price', width: 80, render: (v: number) => `¥${v}` },
          { title: '库存', dataIndex: 'stock', width: 80, render: (v: number) => (
            <Badge
              count={v}
              color={v === 0 ? 'red' : v < 10 ? 'orange' : 'green'}
              style={{ marginRight: '4px' }}
            />
          ) },
        ]
      : [
          {
            title: '',
            width: 50,
            render: (_: any, record: any) => (
              <Checkbox
                checked={selectedIds.includes(record.id)}
                onChange={(e) => {
                  if (e.target.checked) {
                    setSelectedIds([...selectedIds, record.id]);
                  } else {
                    setSelectedIds(selectedIds.filter((id) => id !== record.id));
                  }
                }}
              />
            ),
          },
          { title: '标题', dataIndex: 'title', flex: 1 },
          { title: '创建时间', dataIndex: 'createdAt', width: 120 },
        ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        items={[
          {
            key: 'direct',
            label: '直接选择',
            children: (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <Input
                  placeholder="搜索..."
                  prefix={<SearchOutlined />}
                  value={searchText}
                  onChange={(e) => setSearchText(e.target.value)}
                />

                <Spin spinning={loading}>
                  <Table
                    columns={columns}
                    dataSource={filteredData}
                    rowKey="id"
                    pagination={{ pageSize: 5 }}
                    size="small"
                    scroll={{ x: true }}
                  />
                </Spin>
              </div>
            ),
          },
          {
            key: 'tags',
            label: '按标签',
            children: (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div>
                  {tags.map((tag) => (
                    <div key={tag.key} style={{ marginBottom: '8px' }}>
                      <Checkbox
                        checked={selectedTags.includes(tag.value)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedTags([...selectedTags, tag.value]);
                          } else {
                            setSelectedTags(selectedTags.filter((t) => t !== tag.value));
                          }
                        }}
                      >
                        {tag.title}
                      </Checkbox>
                    </div>
                  ))}
                </div>

                {selectedTags.length > 0 && (
                  <Alert
                    type="info"
                    message={`当前匹配: ${data.length} 项对象`}
                    style={{ marginTop: '12px' }}
                  />
                )}
              </div>
            ),
          },
          {
            key: 'filter',
            label: '按条件',
            children: (
              <Alert
                type="info"
                message="高级筛选功能 - 后续完善"
                style={{ marginTop: '12px' }}
              />
            ),
          },
        ]}
      />

      {/* 已选择统计 */}
      <div style={{ padding: '12px', background: '#f5f5f5', borderRadius: '4px' }}>
        <div style={{ fontSize: '13px', marginBottom: '8px' }}>
          已选: <strong>{selectedIds.length}</strong> 项
        </div>
        <Space>
          <Button size="small" onClick={() => setSelectedIds(data.map((d) => d.id))}>
            全选
          </Button>
          <Button size="small" onClick={() => setSelectedIds([])}>
            清空
          </Button>
          <Button
            size="small"
            type="primary"
            disabled={selectedIds.length === 0}
            onClick={() => {
              onSelect({
                type: objectType,
                ids: selectedIds,
                count: selectedIds.length,
              });
            }}
          >
            应用
          </Button>
        </Space>
      </div>
    </div>
  );
}
