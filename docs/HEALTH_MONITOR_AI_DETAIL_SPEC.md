# 健康度监测三级页面 AI 生成协议

本文定义 `健康度监测` 三级详情页的 AI 生成协议，目标是让页面结构稳定、结论可控、证据可追溯，并与现有 `generationTrace` 口径对齐。

核心原则：
- AI 不负责重新计算业务结论，只负责基于已整理好的输入组织结果。
- 系统先提供结构化事实、规则、基准比较，再让 AI 输出固定结构。
- 页面只消费固定 schema，不直接渲染自由文本。

## 1. 页面目标

健康度监测的三级详情页固定展示四段内容：

1. `问题是什么`
2. `数据论据`
3. `解决办法`
4. `和 AI 聊聊`

因此，AI 返回结果也必须严格围绕这四段展开。

## 2. 总体链路

```text
监测原始数据
-> 系统规则整理
-> 基准比较 / generationTrace
-> MonitorDetailInput
-> LLM Prompt
-> MonitorDetailResult
-> 三级详情页渲染
```

边界约束：
- 原始数据、规则命中、基准比较由系统负责。
- AI 不新增事实，不重算指标，不虚构原因。
- AI 只做压缩表达、证据组织、动作整理和继续对话的引导 prompt。

## 3. 输入 Schema

`MonitorDetailInput` 是传给 AI 的标准化输入。

```ts
type MonitorDetailInput = {
  version: "v1";

  monitor: {
    id: string;
    name: string;
    group: "site_health" | "business_health";
    label: string; // 例如：转化率健康度
    status: "good" | "watch" | "risk";
  };

  timeWindow: {
    label: string; // 例如：今日 / 近7天 / 近30天
    startAt?: string; // ISO string
    endAt?: string; // ISO string
  };

  scoring: {
    dataQuality: "high" | "medium" | "low";
    confidence: "high" | "medium" | "low";
  };

  coreMetric: {
    label: string; // 例如：CVR / LCP / ROAS
    value: string; // 例如：1.4%
    unit?: string; // 例如：%、s、x
    direction?: "up" | "down" | "flat";
  };

  benchmark: {
    label: string; // 例如：近30天均值 / 目标线 / 行业基准
    value: string; // 例如：1.9%
    delta?: string; // 例如：-0.5 pct
    direction: "better" | "worse" | "flat";
  };

  facts: Array<{
    label: string;
    value: string;
    source:
      | "shopify"
      | "ga4"
      | "ads"
      | "gsc"
      | "pagespeed"
      | "internal";
  }>;

  affectedObjects?: Array<{
    type: "page" | "sku" | "channel" | "campaign" | "landing_page" | "other";
    name: string;
    summary?: string;
  }>;

  possibleCauses?: string[];

  candidateActions?: Array<{
    title: string;
    detail: string;
    priority: "P0" | "P1" | "P2";
  }>;

  generationTrace: {
    dataFacts: string[];
    rulesApplied: string[];
    benchmarkComparisons: string[];
  };
};
```

## 4. 输入字段设计原则

### 4.1 必须字段

以下字段必须提供：
- `monitor`
- `timeWindow`
- `scoring`
- `coreMetric`
- `benchmark`
- `facts`
- `generationTrace`

### 4.2 推荐字段

以下字段强烈建议提供：
- `affectedObjects`
- `possibleCauses`
- `candidateActions`

原因：
- 没有 `affectedObjects`，AI 很难把问题落到具体对象。
- 没有 `candidateActions`，AI 容易输出过泛动作。
- 没有 `possibleCauses`，AI 容易胡乱猜测因果。

### 4.3 输入不要直接传原始流水

不建议直接传：
- 原始订单列表
- 原始事件明细
- 原始广告报表全量行
- PageSpeed 审计全量对象

应先由系统压缩成：
- 核心指标
- 基准差异
- 关键事实
- 受影响对象
- 已知候选动作

## 5. 输出 Schema

`MonitorDetailResult` 是 AI 必须返回的标准结构。

```ts
type MonitorDetailResult = {
  problem: string;

  evidenceSummary: Array<{
    label: string;
    summary: string;
  }>;

  actions: Array<{
    title: string;
    detail: string;
    priority: "P0" | "P1" | "P2";
  }>;

  aiChatPrompt: string;
};
```

## 6. 输出约束

### 6.1 `problem`

要求：
- 只允许一句话
- 必须是判断句
- 必须引用当前监测问题，不允许泛泛而谈

好例子：
- `转化率低于基准线，正在拖累短期 ROI，需要优先处理。`

坏例子：
- `最近整体经营看起来有一些问题，建议继续观察并综合处理。`

### 6.2 `evidenceSummary`

要求：
- 输出 2-4 条
- 每条必须来自输入事实
- 每条必须能够映射到 `facts` 或 `benchmark`

### 6.3 `actions`

要求：
- 输出 2-4 条
- 优先复用 `candidateActions`
- 没有候选动作时，才允许基于 `possibleCauses` 做轻度整理
- 不允许输出空泛动作，如“继续观察”“加强分析”“优化体验”

### 6.4 `aiChatPrompt`

要求：
- 必须可直接带去 Chat
- 应该把“当前结论 + 下一步追问目标”说清楚
- 不要只是重复 `problem`

## 7. 系统 Prompt

下面是建议使用的系统提示词。

```txt
你是 Spark 的电商经营分析助手。

你会收到一份健康度监测详情输入 JSON。你的任务不是重新计算数据，也不是虚构新的事实，而是基于输入中已经提供的事实、规则和基准比较，生成一份固定结构的详情结果。

你必须遵守以下规则：

1. 只能使用输入中明确提供的信息，不要编造新数据、新原因或新对象。
2. problem 只能输出一句简洁判断。
3. evidenceSummary 输出 2-4 条，每条都必须能映射到输入中的 facts、benchmark 或 generationTrace。
4. actions 输出 2-4 条，优先使用 candidateActions；如果 candidateActions 不足，可以基于 possibleCauses 做轻度整理，但不能脱离输入乱写。
5. aiChatPrompt 必须适合作为后续 AI 对话的起始 prompt。
6. 输出必须是合法 JSON。
7. 不要输出 markdown，不要输出解释，不要输出额外字段。
```

## 8. 用户 Prompt 模板

下面是建议使用的用户提示词模板。

```txt
请基于以下 MonitorDetailInput，生成 MonitorDetailResult。

输出结构必须为：
{
  "problem": string,
  "evidenceSummary": [
    { "label": string, "summary": string }
  ],
  "actions": [
    { "title": string, "detail": string, "priority": "P0" | "P1" | "P2" }
  ],
  "aiChatPrompt": string
}

MonitorDetailInput:
{{monitor_detail_input_json}}
```

## 9. 建议的 JSON 校验规则

建议在服务端做二次校验：

```ts
type MonitorDetailResult = {
  problem: string;
  evidenceSummary: Array<{
    label: string;
    summary: string;
  }>;
  actions: Array<{
    title: string;
    detail: string;
    priority: "P0" | "P1" | "P2";
  }>;
  aiChatPrompt: string;
};
```

校验规则建议：
- `problem.length <= 80`
- `evidenceSummary.length` 在 `2..4`
- `actions.length` 在 `2..4`
- `aiChatPrompt.length <= 300`
- 所有字符串去除前后空格
- 若 JSON 解析失败或字段不完整，则走 fallback 模板

## 10. Fallback 方案

当 LLM 输出失败、超时、JSON 非法时，系统应回退到模板化渲染。

fallback 规则：
- `problem` 取系统生成的一句话判断
- `evidenceSummary` 直接取前 3 条 `facts`
- `actions` 直接取前 3 条 `candidateActions`
- `aiChatPrompt` 用固定模板拼接

固定 fallback prompt 模板：

```txt
请基于以下监测结果继续分析：

问题：{{problem}}
关键数据：{{core_metric_label}} {{core_metric_value}}
基准：{{benchmark_label}} {{benchmark_value}}
证据：
{{evidence_lines}}

请继续判断最可能原因，并给出优先级排序的处理建议。
```

## 11. 示例

### 11.1 示例输入

```json
{
  "version": "v1",
  "monitor": {
    "id": "conversion-health",
    "name": "conversion_health",
    "group": "business_health",
    "label": "转化率健康度",
    "status": "risk"
  },
  "timeWindow": {
    "label": "近7天"
  },
  "scoring": {
    "dataQuality": "high",
    "confidence": "medium"
  },
  "coreMetric": {
    "label": "CVR",
    "value": "1.4%",
    "unit": "%"
  },
  "benchmark": {
    "label": "近30天均值",
    "value": "1.9%",
    "delta": "-0.5 pct",
    "direction": "worse"
  },
  "facts": [
    {
      "label": "核心指标",
      "value": "当前 CVR 为 1.4%，低于近30天均值 1.9%。",
      "source": "ga4"
    },
    {
      "label": "影响对象",
      "value": "广告落地页与商品详情页跌幅最明显。",
      "source": "ga4"
    },
    {
      "label": "经营传导",
      "value": "转化率走弱正在直接拖累短期 ROI 和收入效率。",
      "source": "internal"
    }
  ],
  "affectedObjects": [
    {
      "type": "landing_page",
      "name": "广告落地页",
      "summary": "高流量页面承接偏弱"
    },
    {
      "type": "page",
      "name": "商品详情页",
      "summary": "商品说服信息不足"
    }
  ],
  "possibleCauses": [
    "页面承接信息不完整",
    "价格与促销表达不够清晰",
    "CTA 弱化"
  ],
  "candidateActions": [
    {
      "title": "优先排查高流量低转化页面",
      "detail": "先定位承接最差且流量最大的页面。",
      "priority": "P0"
    },
    {
      "title": "复核关键说服信息",
      "detail": "重点检查价格、发货承诺、评价与 CTA 表达。",
      "priority": "P1"
    },
    {
      "title": "把页面问题转入 Tasks",
      "detail": "将需要修改的对象直接生成执行任务。",
      "priority": "P1"
    }
  ],
  "generationTrace": {
    "dataFacts": [
      "CVR 1.4%",
      "近30天均值 1.9%"
    ],
    "rulesApplied": [
      "CVR 明显低于基准 -> 标记 risk"
    ],
    "benchmarkComparisons": [
      "当前值低于近30天均值 0.5 pct"
    ]
  }
}
```

### 11.2 示例输出

```json
{
  "problem": "转化率低于基准线，正在拖累短期 ROI，需要优先处理。",
  "evidenceSummary": [
    {
      "label": "核心指标",
      "summary": "当前 CVR 为 1.4%，低于近30天均值 1.9%。"
    },
    {
      "label": "影响对象",
      "summary": "广告落地页与商品详情页的转化下滑最明显。"
    },
    {
      "label": "经营传导",
      "summary": "转化率走弱已经同步影响短期 ROI 和收入效率。"
    }
  ],
  "actions": [
    {
      "title": "优先排查高流量低转化页面",
      "detail": "先定位承接最差且流量最大的页面。",
      "priority": "P0"
    },
    {
      "title": "复核关键说服信息",
      "detail": "重点检查价格、发货承诺、评价与 CTA 表达。",
      "priority": "P1"
    },
    {
      "title": "把页面问题转入 Tasks",
      "detail": "将需要修改的对象直接生成执行任务。",
      "priority": "P1"
    }
  ],
  "aiChatPrompt": "请基于以上监测结果，继续判断问题更偏页面承接、商品表达还是价格策略，并输出优先级排序的排查建议。"
}
```

## 12. 与现有 generationTrace 的关系

这份协议应与现有 `generationTrace` 保持一致：
- `facts` 对应数据事实
- `generationTrace.rulesApplied` 对应规则命中
- `generationTrace.benchmarkComparisons` 对应基准比较

也就是继续遵循当前文档中的三段口径：

```text
数据 -> 规则 -> 基准比较
```

AI 只能消费这三段整理后的输入，不能绕过它们直接自由发挥。

## 13. 后续落地建议

推荐按以下顺序实施：

1. 先在服务端定义 `MonitorDetailInput` builder
2. 再补 `MonitorDetailResult` 的 schema 校验
3. 接入 LLM 调用与 fallback
4. 最后让三级详情页直接消费 `MonitorDetailResult`

如果要逐步上线，建议第一批只给以下几类监测启用 AI 组织：
- 页面性能
- ROI 情况
- 转化率健康度
- 库存健康度

这些监测最容易形成“问题 -> 证据 -> 动作”的稳定闭环。
