import { InputNumber, Checkbox, Space } from 'antd';
import type { Constraints } from '../types';

interface ConstraintSettingsProps {
  value: Constraints;
  onChange: (constraints: Constraints) => void;
}

export default function ConstraintSettings({ value, onChange }: ConstraintSettingsProps) {
  return (
    <Space direction="vertical" style={{ width: '100%' }} size="large">
      <div>
        <label style={{ fontSize: '13px', fontWeight: 'bold', display: 'block', marginBottom: '8px' }}>
          最大长度 (字符)
        </label>
        <InputNumber
          style={{ width: '100%' }}
          value={value.maxLength}
          onChange={(val) =>
            onChange({
              ...value,
              maxLength: val || undefined,
            })
          }
          placeholder="不设置上限"
        />
      </div>

      <div>
        <label style={{ fontSize: '13px', fontWeight: 'bold', display: 'block', marginBottom: '8px' }}>
          最小长度 (字符)
        </label>
        <InputNumber
          style={{ width: '100%' }}
          value={value.minLength}
          onChange={(val) =>
            onChange({
              ...value,
              minLength: val || undefined,
            })
          }
          placeholder="不设置下限"
        />
      </div>

      <div>
        <label style={{ fontSize: '13px', fontWeight: 'bold', display: 'block', marginBottom: '8px' }}>
          保留内容
        </label>
        <Space direction="vertical">
          <Checkbox
            checked={(value.preserveFields as string[])?.includes('html') || false}
            onChange={(e) =>
              onChange({
                ...value,
                preserveFields: e.target.checked
                  ? [...((value.preserveFields as string[]) || []), 'html']
                  : (value.preserveFields as string[])?.filter((f) => f !== 'html'),
              })
            }
          >
            HTML 标签
          </Checkbox>
          <Checkbox
            checked={(value.preserveFields as string[])?.includes('links') || false}
            onChange={(e) =>
              onChange({
                ...value,
                preserveFields: e.target.checked
                  ? [...((value.preserveFields as string[]) || []), 'links']
                  : (value.preserveFields as string[])?.filter((f) => f !== 'links'),
              })
            }
          >
            超链接
          </Checkbox>
          <Checkbox
            checked={(value.preserveFields as string[])?.includes('metadata') || false}
            onChange={(e) =>
              onChange({
                ...value,
                preserveFields: e.target.checked
                  ? [...((value.preserveFields as string[]) || []), 'metadata']
                  : (value.preserveFields as string[])?.filter((f) => f !== 'metadata'),
              })
            }
          >
            元数据
          </Checkbox>
        </Space>
      </div>
    </Space>
  );
}
