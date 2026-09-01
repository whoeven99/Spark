import { useState } from "react";
import { Button, Input, Radio, Select, Space, Typography } from "antd";
import { MinusOutlined, PlusOutlined } from "@ant-design/icons";
import type { OpsEmailTemplate } from "../../api";

const { TextArea } = Input;

export type OpsEmailTemplateMode = "catalog" | "custom";

const PLACEHOLDER_RE = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;

export function extractPlaceholderKeys(source: string): string[] {
  return [...source.matchAll(PLACEHOLDER_RE)].map((match) => match[1]);
}

type Props = {
  mode: OpsEmailTemplateMode;
  onModeChange: (mode: OpsEmailTemplateMode) => void;
  templates: OpsEmailTemplate[];
  templateKey: string;
  onTemplateChange: (key: string) => void;
  subject: string;
  onSubjectChange: (value: string) => void;
  paramKeys: string[];
  params: Record<string, string>;
  onParamChange: (key: string, value: string) => void;
  onAddParam: (key: string) => void;
  onRemoveParam: (key: string) => void;
  customHtml: string;
  onCustomHtmlChange: (value: string) => void;
  onExtractFromHtml: () => void;
};

export default function OpsEmailTemplateCard({
  mode,
  onModeChange,
  templates,
  templateKey,
  onTemplateChange,
  subject,
  onSubjectChange,
  paramKeys,
  params,
  onParamChange,
  onAddParam,
  onRemoveParam,
  customHtml,
  onCustomHtmlChange,
  onExtractFromHtml,
}: Props) {
  const [newParamKey, setNewParamKey] = useState("");

  function submitNewParam() {
    onAddParam(newParamKey);
    setNewParamKey("");
  }

  return (
    <Space direction="vertical" style={{ width: "100%" }} size="middle">
      <Radio.Group
        value={mode}
        onChange={(event) => onModeChange(event.target.value)}
        optionType="button"
        options={[
          { value: "catalog", label: "内置模板" },
          { value: "custom", label: "自定义模板" },
        ]}
      />
      {mode === "catalog" ? (
        <Select
          value={templateKey}
          onChange={onTemplateChange}
          options={templates.map((item) => ({
            value: item.key,
            label: `${item.label}（${item.templateId}）`,
          }))}
          style={{ width: "100%" }}
        />
      ) : null}
      <Input
        addonBefore="主题"
        value={subject}
        onChange={(event) => onSubjectChange(event.target.value)}
      />
      {mode === "custom" ? (
        <>
          <TextArea
            value={customHtml}
            onChange={(event) => onCustomHtmlChange(event.target.value)}
            placeholder="粘贴邮件 HTML，使用 {{variable}} 作为占位符"
            autoSize={{ minRows: 10, maxRows: 22 }}
          />
          <Button onClick={onExtractFromHtml}>从 HTML / 主题提取变量</Button>
        </>
      ) : null}
      {paramKeys.map((key) => (
        <Space.Compact key={key} style={{ width: "100%" }}>
          <Input
            addonBefore={key}
            value={params[key] ?? ""}
            onChange={(event) => onParamChange(key, event.target.value)}
            placeholder={key === "installUrl" ? "Spark 安装链接，留空则用模板内链接" : "留空则发送时按店自动填"}
          />
          {mode === "custom" ? (
            <Button icon={<MinusOutlined />} onClick={() => onRemoveParam(key)} />
          ) : null}
        </Space.Compact>
      ))}
      {mode === "custom" ? (
        <Space.Compact style={{ width: "100%" }}>
          <Input
            placeholder="新变量名，如 taskName"
            value={newParamKey}
            onChange={(event) => setNewParamKey(event.target.value)}
            onPressEnter={submitNewParam}
          />
          <Button icon={<PlusOutlined />} onClick={submitNewParam}>
            添加变量
          </Button>
        </Space.Compact>
      ) : null}
      <Typography.Text type="secondary">
        {mode === "catalog"
          ? "变量来自当前模板 HTML。店级字段（shopName、recipientName 等）留空则发送时自动填；填写 installUrl 会替换 App 按钮链接。"
          : "自定义模板刷新后丢弃。预览和发送都使用上面的 HTML 与变量，不走腾讯云模板 ID。"}
      </Typography.Text>
    </Space>
  );
}
