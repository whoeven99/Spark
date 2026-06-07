# Spark 项目前端改造方案 - Shopify AI 工作台

## 项目现状分析

### 现有架构
- **前端框架**: React 18 + Ant Design 5 + TypeScript
- **路由方式**: React Router v6（多页面应用）
- **后端**: Express + Prisma + LibSQL
- **现有功能**: 管理后台（店铺、翻译任务、数据统计、收入分析等）

### 现有数据模型
- **Skills** (原子技能): 有步骤、工具、参数定义
- **Tools** (工具调用): 支持参数化调用
- **Playbooks** (自动化流程): 多步骤编排
- **AgentRuns** (执行记录): 追踪执行状态、耗时、错误等

---

## 改造目标

建立一个 **对话驱动的 AI 工作台**，专为 Shopify 电商场景优化：
1. **对话界面** → 自然语言生成和执行任务
2. **任务管理** → 查看、编辑、自动化沉淀
3. **Daily Dashboard** → 每日数据和结果汇总
4. **Shopify 集成** → 选择对象、CSV 处理、数据写回

---

## 前端架构改造方案

### Phase 1: 核心对话页面 + 任务系统

#### 1.1 新增页面结构

```
admin/src/pages/
├── Workbench/
│   ├── ChatWorkbench.tsx         # 主对话工作台页面
│   ├── components/
│   │   ├── ChatPanel.tsx         # 对话组件
│   │   ├── TaskPanel.tsx         # 右侧任务列表
│   │   ├── ToolSelector.tsx      # 工具选择器
│   │   ├── ObjectSelector.tsx    # Shopify 对象选择（商品/文章等）
│   │   ├── FileUploader.tsx      # CSV 文件上传
│   │   └── ExecutionMonitor.tsx  # 任务执行监控
│   └── hooks/
│       ├── useChat.ts            # 对话逻辑 Hook
│       └── useTaskManagement.ts  # 任务管理 Hook
├── Dashboard/
│   ├── DailyDashboard.tsx        # 每日数据看板
│   ├── components/
│   │   ├── DataSummary.tsx       # 数据汇总卡片
│   │   ├── TaskResults.tsx       # 任务结果统计
│   │   └── TrendCharts.tsx       # 趋势图表
│   └── hooks/
│       └── useDashboardData.ts   # Dashboard 数据获取
└── ...
```

#### 1.2 数据模型 (前端 State)

```typescript
// 对话消息
type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  attachment?: {  // 文件/选择器结果
    type: 'file' | 'object-select' | 'tool-config';
    data: unknown;
  };
};

// 生成的任务
type GeneratedTask = {
  id: string;
  title: string;
  description: string;
  status: 'draft' | 'scheduled' | 'executing' | 'completed' | 'failed';
  relatedSkill?: string;     // 绑定的 Skill
  tools: { name: string; params: Record<string, unknown> }[];
  shopifyObjects?: Array<{ type: 'product' | 'article' | ...; id: string }>;
  csvData?: { filename: string; content: string[][];  };
  executionResult?: {
    success: boolean;
    output: unknown;
    error?: string;
    durationMs: number;
  };
  canAutomate: boolean;      // 是否已沉淀成自动化
  automatedAs?: string;      // 沉淀的 Playbook ID
  createdAt: string;
  updatedAt: string;
};

// 对话工作台状态
type ChatWorkbenchState = {
  messages: ChatMessage[];
  tasks: GeneratedTask[];
  selectedTask?: GeneratedTask;
  isLoading: boolean;
};
```

#### 1.3 关键交互流程

```
1. 用户输入 → 对话消息
   ↓
2. 后端 LLM 理解意图
   ├─→ 提取需要的工具和参数
   ├─→ 识别是否需要 Shopify 对象选择
   └─→ 返回结构化任务建议
   ↓
3. 前端展示任务预览
   ├─→ 显示拟执行的 Skills/Tools
   ├─→ 如需 Shopify 对象，弹出选择器
   ├─→ 如需 CSV，上传并预览
   └─→ 用户确认或修改参数
   ↓
4. 执行任务
   ├─→ 调用现有 Worker 执行
   ├─→ 实时显示执行进度
   └─→ 展示结果
   ↓
5. 结果沉淀
   ├─→ 保存为 Playbook（自动化）
   └─→ 支持手动调整规则
```

---

### Phase 2: Shopify 特定功能模块

#### 2.1 对象选择器 (ObjectSelector)

```typescript
// admin/src/pages/Workbench/components/ObjectSelector.tsx

type ShopifyObjectType = 'product' | 'article' | 'customer' | 'order' | 'collection';

interface ObjectSelectorProps {
  objectType: ShopifyObjectType;
  mode: 'single' | 'multiple';  // 单选或多选
  onSelect: (objects: ShopifyObject[]) => void;
}

// 支持功能:
// - 搜索/过滤（按名称、标签等）
// - 分页加载
// - 预览对象信息
// - 批量选择
```

#### 2.2 CSV 文件处理 (FileUploader)

```typescript
// admin/src/pages/Workbench/components/FileUploader.tsx

interface FileUploadProps {
  onParsed: (data: CSVData) => void;
  expectedColumns?: string[];  // 期望的列名
}

type CSVData = {
  filename: string;
  headers: string[];
  rows: Record<string, string | number>[];
  preview: Record<string, unknown>[];  // 前 5 行预览
};

// 支持功能:
// - CSV 自动检测编码（UTF-8, GB2312 等）
// - 列名检查和映射
// - 数据预览
// - 字段类型提示
```

#### 2.3 Shopify 数据写回接口

前端负责 UI，实际写回由后端 Worker 处理：

```typescript
// 对话中推荐的写回操作
type WritebackOperation = {
  objectType: ShopifyObjectType;
  action: 'update' | 'create' | 'delete';
  targetObjects: ShopifyObject[];
  updates: Record<string, unknown>[];
  confirmationRequired: boolean;
};

// 后端 API 示例（由 Worker 实现）
// POST /api/workbench/execute-writeback
// - 处理实际的 Shopify API 调用
// - 支持批量操作 + 分批提交
// - 返回操作结果和失败处理
```

---

### Phase 3: Daily Dashboard (经营看板)

#### 3.1 页面结构 - 面向商店经营者

```
admin/src/pages/Dashboard/DailyDashboard.tsx

┌──────────────────────────────────────────────┐
│  日期选择 (今天/昨天/本周/本月)               │
├──────────────────────────────────────────────┤
│                                              │
│  📊 今日经营概览                              │
│  ┌────────────┐  ┌────────────┐ ┌──────────┐│
│  │ 销售额     │  │ 订单数     │ │ 客户数   ││
│  │ ¥12,500    │  │ 45 单      │ │ 28 人    ││
│  │ ↑ 8%       │  │ ↑ 5%       │ │ ↑ 3%    ││
│  └────────────┘  └────────────┘ └──────────┘│
│                                              │
│  ┌────────────┐  ┌────────────┐ ┌──────────┐│
│  │ 转化率     │  │ 平均客单价 │ │ 退货率   ││
│  │ 2.8%       │  │ ¥278       │ │ 1.2%     ││
│  │ ↓ 2%       │  │ ↑ 12%      │ │ ↓ 0.5%  ││
│  └────────────┘  └────────────┘ └──────────┘│
│                                              │
├──────────────────────────────────────────────┤
│ ✨ AI 自动化任务执行摘要                      │
│ ┌──────────────────────────────────────────┐│
│ │ 📝 商品描述生成                           ││
│ │    已生成 12 个商品描述 ✓                 ││
│ │    预计带来 3-5% 转化率提升               ││
│ │                                          ││
│ │ 🌍 多语言翻译                            ││
│ │    已翻译 25 个商品到日语 ✓              ││
│ │    覆盖日本市场 3 个城市                  ││
│ │                                          ││
│ │ 🏷️ 标题优化                              ││
│ │    已优化 8 个产品标题 ✓                 ││
│ │    搜索排名提升 3%，流量 +8 uv          ││
│ │                                          ││
│ │ 🚨 库存预警                              ││
│ │    已推送 150 个预警通知                 ││
│ │    帮助卖家及时补货                      ││
│ └──────────────────────────────────────────┘│
│                                              │
├──────────────────────────────────────────────┤
│ 📈 关键指标对比 (今天 vs 昨天 vs 7天平均)    │
│ ┌──────────────────────────────────────────┐│
│ │ [图表：折线图展示销售额、订单数趋势]      ││
│ └──────────────────────────────────────────┘│
│                                              │
├──────────────────────────────────────────────┤
│ 💡 智能建议                                  │
│ ┌──────────────────────────────────────────┐│
│ │ • SKU-001 库存预警：已降至 3 件，建议补货 ││
│ │ • 新商品转化率偏低：建议优化描述或补图   ││
│ │ • 周末销售峰值：建议增加库存 +20%        ││
│ │ • 客户评价：75% 好评，建议跟进差评       ││
│ └──────────────────────────────────────────┘│
└──────────────────────────────────────────────┘
```

#### 3.2 数据结构 - 后端需提供

```typescript
// admin/src/pages/Dashboard/hooks/useDashboardData.ts

interface ShopBusinessMetrics {
  // 销售数据（从 Shopify API 获取）
  sales: {
    gmv: number;                    // 总销售额
    orderCount: number;             // 订单数
    conversionRate: number;         // 转化率 %
    avgOrderValue: number;          // 平均客单价
    returnRate: number;             // 退货率 %
    uniqueCustomers: number;        // 独立客户数
  };
  
  // 与昨天的对比
  dayOverDay: {
    salesChange: number;            // %
    orderChange: number;            // %
    conversionChange: number;       // %
    customerChange: number;         // %
  };
  
  // 自动化任务执行摘要（后端追踪）
  automationSummary: Array<{
    taskId: string;
    taskName: string;              // "商品描述生成"
    playbookName?: string;         // 自动化名称
    icon: string;                  // 📝 | 🌍 | 🏷️ 等
    executedCount: number;         // 执行数量
    successCount: number;          // 成功数
    expectedImpact: string;        // "预计 +3% 转化率"
    actualImpact?: {               // 实际影响（可选）
      metric: string;
      value: number;
      unit: string;
    };
    status: 'success' | 'partial' | 'error';
    executedAt: string;
  }>;
  
  // 智能建议
  recommendations: Array<{
    priority: 'high' | 'medium' | 'low';
    title: string;
    description: string;
    action?: string;              // 建议操作
  }>;
  
  // 7天趋势数据
  trendData: Array<{
    date: string;                 // YYYY-MM-DD
    gmv: number;
    orderCount: number;
    conversionRate: number;
  }>;
}

// 从 /api/workbench/dashboard?date=YYYY-MM-DD 获取
```

#### 3.3 后端实现要求

```typescript
// 后端需要追踪自动化任务的执行结果：

// 1. 每次自动化任务执行时，记录摘要：
type AutomationExecutionRecord = {
  playbookId: string;
  playbookName: string;
  executedAt: string;
  
  // 执行结果统计
  executedCount: number;          // 处理了多少个对象
  successCount: number;           // 成功了多少个
  failureCount: number;
  
  // 业务影响（可选，后续增强）
  impactMetric?: {
    type: 'conversion_rate' | 'sales' | 'search_rank' | ...;
    baselineValue: number;
    afterValue: number;
  };
};

// 2. Dashboard 查询接口：
GET /api/workbench/dashboard?date=2025-01-15
响应: {
  businessMetrics: ShopBusinessMetrics,
  automationRecords: AutomationExecutionRecord[]
}
```

---

## API 层改造 (后端协议)

### 新增端点

```
POST /api/workbench/chat
  请求: { message: string; conversationId: string; }
  响应: { 
    reply: string; 
    suggestedTask?: {
      title: string;
      description: string;
      skills: string[];  // 建议的 Skill
      requiredInputs: {
        shopifyObjects?: ShopifyObjectType[];
        files?: { type: string; description: string }[];
        toolParams?: Record<string, unknown>;
      };
    };
  }

POST /api/workbench/execute-task
  请求: { taskId: string; skills: string[]; params: Record<string, unknown>; }
  响应: { executionId: string; }

GET /api/workbench/execution/:executionId
  响应: { status: string; progress?: number; result?: unknown; }

POST /api/workbench/save-as-playbook
  请求: { taskId: string; name: string; description: string; }
  响应: { playbookId: string; }

GET /api/workbench/dashboard?date=YYYY-MM-DD
  响应: {
    businessMetrics: {
      sales: { gmv, orderCount, conversionRate, avgOrderValue, returnRate, uniqueCustomers },
      dayOverDay: { salesChange, orderChange, conversionChange, customerChange },
      automationSummary: [{ taskName, executedCount, successCount, expectedImpact, status }],
      recommendations: [{ priority, title, description, action }],
      trendData: [{ date, gmv, orderCount, conversionRate }]
    }
  }
```

### 数据来源说明

| 数据项 | 来源 |
|--------|------|
| 销售额、订单数、客户数 | Shopify API (读权限) |
| 转化率、平均客单价、退货率 | 前端上报 + 后端统计 |
| 自动化任务摘要 | 后端追踪 (Playbook 执行记录) |
| 智能建议 | 后端规则引擎生成 |

---

## 实现步骤

### Step 1: 基础对话页面 (Week 1)
- [ ] 创建 `ChatWorkbench.tsx` 主页面
- [ ] 实现 `ChatPanel` 组件（消息展示 + 输入框）
- [ ] 实现 `TaskPanel` 组件（右侧任务列表）
- [ ] 连接后端 `/api/workbench/chat` 接口
- [ ] 集成到左侧导航菜单

### Step 2: 任务执行 + 监控 (Week 1-2)
- [ ] 实现 `ExecutionMonitor` 组件
- [ ] 实现任务参数编辑界面
- [ ] 调用 `/api/workbench/execute-task` 执行
- [ ] 实时监控执行进度

### Step 3: Shopify 特定功能 (Week 2)
- [ ] 实现 `ObjectSelector` 组件
- [ ] 实现 `FileUploader` 组件（CSV 处理）
- [ ] 集成到对话流程中
- [ ] 实现写回确认界面

### Step 4: Dashboard (Week 2-3)
- [ ] 创建 `DailyDashboard.tsx` 页面（经营看板，而非任务监控）
- [ ] 实现商店经营概览卡片（销售额、订单、客户等）
- [ ] 实现自动化任务摘要展示（卡片列表）
- [ ] 实现趋势图表（7天对比）
- [ ] 实现智能建议模块
- [ ] 集成 `/api/workbench/dashboard` 接口

### Step 5: 任务自动化沉淀 (Week 3)
- [ ] 实现"另存为 Playbook"功能
- [ ] 编辑 Playbook 触发条件和规则
- [ ] 支持定时执行或事件触发

### Step 6: 优化 + 测试 (Week 3-4)
- [ ] UI/UX 优化
- [ ] 错误处理和用户提示
- [ ] 全流程集成测试

---

## 技术选择说明

### 为什么不改数据库?
1. **最小化风险**: 前端独立改造，不涉及数据迁移
2. **快速验证**: 用 Mock/虚拟数据测试方案可行性
3. **灵活迭代**: 如果后续需要，再逐步演进数据模型
4. **平稳切换**: 现有的 Capabilities、Skills、Tools 定义保持不变

### 前端 State 管理建议
- 使用 React Context + Hooks（简单场景）
- 如后续复杂，考虑 Redux 或 Zustand
- 优先用本地 State 而非全局状态

### UI 组件库扩展
- 继续使用 Ant Design
- 新增组件: `Drawer`、`Spin`、`Progress`（已有）
- 考虑 `react-markdown` 渲染 Markdown 格式的 LLM 回复

### 文件处理
- CSV 解析: `papaparse` 库
- 多语言编码: `chardet.js` 或 `iconv-lite`

---

## 页面导航流程 (已调整)

### 改造后的菜单结构

```
概览 (现有 Dashboard - 管理后台概览)
  ↓
[新增] AI 工作台 ← ChatWorkbench (对话 + 任务生成 + 执行)
  ↓
[新增] 每日看板 ← DailyDashboard (经营数据 + 自动化任务成果)
  ↓
商店 / 翻译任务 / 用量统计... (现有 - 供 Owner/Admin 使用)
  ↓
Agent 能力 / AI 执行监控... (现有)
```

**关键区分**：
- **概览** = 管理后台数据（店铺、用户、订阅等）
- **AI 工作台** = 对话驱动的任务生成和执行
- **每日看板** = 商店经营成果展示 (面向商家)

---

## 与现有功能的集成

| 现有功能 | 新工作台中的用途 |
|---------|-----------------|
| Capabilities (Skills/Tools) | 对话中推荐执行，被沉淀为 Playbook |
| AgentRuns | 用于追踪任务执行详情（不在 Dashboard 展示） |
| Translations | 可作为自动化任务摘要示例 |
| Playbooks | **关键**：Dashboard 中展示 Playbook 的执行结果摘要 |
| Shopify API | 获取商店经营数据（销售、订单、客户等） |

---

## 数据流架构补充说明

### 经营数据如何聚合？

```
1️⃣ 商店经营数据 (Shopify API)
   ├─ 销售额、订单数、客户数
   ├─ 产品库存、评价评分
   └─ 后端定时拉取 (每小时/每天)

2️⃣ 前端上报数据
   ├─ 用户在 ChatWorkbench 中使用 AI 的频次
   ├─ 生成的任务数和结果
   └─ 前端页面事件追踪（可选）

3️⃣ 自动化任务执行摘要 (后端追踪)
   ├─ 每个 Playbook 的每次执行
   ├─ 处理对象数、成功数、失败数
   ├─ 执行时间和输出结果
   └─ 存储在数据库，Dashboard 查询时聚合

4️⃣ Dashboard 查询时
   ├─ 获取当日 Shopify 经营数据
   ├─ 汇总当日所有 Playbook 执行记录
   ├─ 计算关键指标对比 (Today vs Yesterday vs 7day avg)
   ├─ 生成智能建议
   └─ 返回给前端展示
```

### 前端上报机制 (可选，后续增强)

```typescript
// 前端页面可在适当时机上报数据，帮助后端统计
// 示例：
fetch('/api/workbench/analytics', {
  method: 'POST',
  body: JSON.stringify({
    event: 'task_executed',
    taskId: '...',
    taskName: '商品描述生成',
    resultCount: 12,
    successCount: 12,
    durationMs: 5000,
    timestamp: new Date().toISOString()
  })
});
```

---

1. **后端支持**: 确保 Worker 已实现对应 API
2. **Shopify 权限**: 确保有 Shopify API 权限（产品读写、CSV 批量导入等）
3. **性能**: 
   - Dashboard 数据聚合可能较重，考虑缓存
   - CSV 文件限制大小（建议 ≤ 10MB）
4. **安全**:
   - 对话内容日志记录
   - 写回操作需要用户二次确认
   - API 认证保持现有 Bearer Token 方式

---

## 核心文件清单

### 新增文件
```
admin/src/pages/Workbench/
├── ChatWorkbench.tsx
├── components/
│   ├── ChatPanel.tsx
│   ├── TaskPanel.tsx
│   ├── ToolSelector.tsx
│   ├── ObjectSelector.tsx
│   ├── FileUploader.tsx
│   └── ExecutionMonitor.tsx
└── hooks/
    ├── useChat.ts
    └── useTaskManagement.ts

admin/src/pages/Dashboard/
├── DailyDashboard.tsx
├── components/
│   ├── DataSummary.tsx
│   ├── TaskResults.tsx
│   └── TrendCharts.tsx
└── hooks/
    └── useDashboardData.ts

admin/src/api.ts (扩展)
  - fetchChatMessage()
  - executeTask()
  - savAsPlaybook()
  - fetchDashboardData()
```

### 修改文件
```
admin/src/components/Layout.tsx
  - 添加导航菜单项

admin/src/App.tsx
  - 添加新路由

admin/src/api.ts
  - 添加新 API 函数
```

---

## 后续优化方向

1. **对话历史**: 支持多轮对话、搜索历史
2. **协作**: 多人共同编辑任务、评论
3. **模板库**: 预定义的常见电商任务模板
4. **集成市场**: 支持插件/集成第三方数据源
5. **移动端**: 响应式设计优化

