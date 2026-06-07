# 工作台工具栏 - 上下文信息补充

## 核心问题

用户在对话中说"帮我改写文章"时，系统需要知道：
- ❓ 改写**哪些文章**？（需要对象选择）
- ❓ 改写成**什么风格**？（可能需要参考文档）
- ❓ 改写涉及**什么多媒体**？（可能需要上传图片）
- ❓ 改写要遵循**什么规则**？（可能需要上传指南文档）

**问题本质**：有些信息**无法用自然语言精确表达**，需要通过**结构化的文件/对象选择**来补充。

---

## 正确的工具栏思路

工具栏的职责是：**为对话注入各种类型的上下文信息**

不是为了"优化选择对象"，而是为了"补充对话中缺失的信息维度"。

---

## 应该包含的工具

### 1️⃣ **Shopify 对象选择** (Object Selector)
```
为什么：用户的任务可能涉及不同类型的对象

场景：
- "帮我改写这些文章" → 需要选择【文章】
- "帮我优化这些商品" → 需要选择【商品】
- "帮我给这些客户写邮件" → 需要选择【客户】
- "帮我分析这些订单" → 需要选择【订单】

UI：
[选择对象 ▼]
├─ 📦 商品
├─ 📄 文章  
├─ 👥 客户
├─ 📋 订单
└─ 其他...

选完后显示：
✓ 已选 42 篇文章
[查看] [修改] [清空]
```

### 2️⃣ **参考文档上传** (Reference Documents)
```
为什么：很多任务需要"参考示例"或"规则指南"来指导

场景：
- "按照这个模板改写商品描述"
  → 上传一个"好的描述示例" PDF/Word
  
- "按照我们的品牌指南来写文章"
  → 上传"品牌风格指南.docx"
  
- "按这个表格的格式进行处理"
  → 上传"处理规范.xlsx"
  
- "根据这份竞争分析来优化"
  → 上传"竞品分析.pdf"

UI：
[📎 上传参考文档]
├─ 已上传: brand_guide.pdf (2.3MB)
├─ 内容预览: [品牌色: 蓝色，字体: 微软雅黑...]
└─ [替换] [删除] [查看详情]
```

### 3️⃣ **数据源文档** (Data Source)
```
为什么：很多批处理任务需要"原始数据"或"输入列表"

场景：
- "帮我根据这个 CSV 的商品列表生成描述"
  → 上传包含 SKU、分类、属性的 CSV
  
- "根据这份销售数据做分析报告"
  → 上传销售数据 Excel
  
- "把这个商品列表翻译成多个语言"
  → 上传商品列表 CSV
  
- "批量导入这些用户信息并生成欢迎邮件"
  → 上传用户信息 Excel

UI：
[📊 上传数据源]
├─ 已上传: products.csv (168 行)
├─ 列映射:
│  ✓ SKU (product_id)
│  ✓ 商品名 (name)
│  ✓ 分类 (category)
│  ✓ 属性 (attributes)
├─ 预览: [前5行]
└─ [重新映射] [替换] [删除]
```

### 4️⃣ **多媒体参考** (Media Reference)
```
为什么：某些任务需要"图片或视频"作为参考或补充

场景：
- "根据这张图片的风格来写商品描述"
  → 上传参考图片
  
- "这个视频展示了产品用法，请补充使用说明"
  → 上传产品演示视频
  
- "参考这些模特照片，写出风格描述"
  → 上传多张参考照片
  
- "根据这个视频脚本生成文章"
  → 上传视频文件

UI：
[🖼️ 上传多媒体]
├─ 已上传图片: 3 张
│  ├─ model-1.jpg (2.1MB)
│  ├─ model-2.jpg (1.8MB)
│  └─ product-demo.jpg (3.2MB)
├─ 已上传视频: 1 个
│  └─ product-demo.mp4 (45MB, 已解析文本摘要)
└─ [查看] [删除]
```

### 5️⃣ **业务规则/指南** (Rules & Guidelines)
```
为什么：某些任务涉及特定的业务规则或约束

场景：
- "按照SEO规范改写标题"
  → 上传或选择"SEO最佳实践指南"
  
- "按照合规要求修改描述"
  → 上传"产品描述合规检查清单"
  
- "按照定价策略调整价格"
  → 上传"定价规则表"
  
- "根据库存政策更新库存"
  → 上传"库存管理规则"

UI：
[⚙️ 添加规则]
├─ 预定义规则:
│  ☑ SEO 优化指南
│  ☐ 产品描述规范
│  ☐ 定价政策
│  ☐ 合规要求
├─ 自定义规则:
│  [💾 上传规则文档]
│  已上传: compliance_rules.pdf
└─ [查看] [编辑]
```

### 6️⃣ **风格/示例参考** (Style Examples)
```
为什么："我要这个风格"很难用语言描述，但看示例就明白了

场景：
- "帮我写得像这个竞争对手的文章一样"
  → 选择或上传"参考文章"
  
- "商品描述要像这个模板一样专业"
  → 上传"高质量描述示例.txt"
  
- "邮件文案要像这个营销邮件一样有趣"
  → 上传参考邮件文本
  
- "配色和字体要参考这个设计稿"
  → 上传设计稿图片

UI：
[✨ 添加风格参考]
├─ 示例1: competitor_article.md
├─ 示例2: high_quality_description.txt
├─ 示例3: marketing_email.eml
└─ [+ 添加更多] [查看] [删除]
```

### 7️⃣ **约束条件** (Constraints & Limits)
```
为什么：某些任务有特定的约束条件

场景：
- "生成描述但不超过 200 字"
- "翻译时要保留 HTML 标签"
- "修改时不要改变价格"
- "补充信息但要保留原有的评价"

UI：
[🔒 约束条件]
├─ 长度限制: [____] 字以内
├─ 保留内容:
│  ☑ HTML 标签
│  ☑ 价格信息
│  ☑ 评价评分
│  ☐ 其他
├─ 禁用词: [____]
└─ [保存预设] [清空]
```

---

## 完整工具栏设计

### 紧凑型（推荐）
```
┌────────────────────────────────────────────────────────┐
│ 对话上下文补充                                          │
├────────────────────────────────────────────────────────┤
│ [选择对象▼] [📎参考文档] [📊数据源] [🖼️多媒体]       │
│ [⚙️规则] [✨风格] [🔒约束] [+ 更多]                    │
│                                                        │
│ 已补充内容:                                             │
│ ✓ 对象: 42 篇文章    ✓ 参考文档: 1 个    ✓ 多媒体: 3张
└────────────────────────────────────────────────────────┘

💬 请描述你的任务...
[发送]
```

### 详细型
```
┌────────────────────────────────────────────────────────┐
│ 1️⃣ Shopify 对象                                        │
│ [选择对象▼] 已选: 42 篇文章 [修改] [清空]             │
│                                                        │
│ 2️⃣ 参考与规则                                         │
│ [📎参考文档] [⚙️规则] [✨风格参考]                    │
│ 已上传: brand_guide.pdf | seo_rules.pdf               │
│                                                        │
│ 3️⃣ 数据与多媒体                                       │
│ [📊数据源] [🖼️多媒体] [🔒约束]                        │
│ 已上传: products.csv | 3张图片                        │
│                                                        │
│ [展开详情] [保存为模板]                               │
└────────────────────────────────────────────────────────┘

💬 请描述你的任务...
[发送]
```

---

## 使用场景完整示例

### 场景 1：改写文章
```
Step 1: 选择对象
[选择对象▼] → 选择【文章】→ 已选 5 篇

Step 2: 补充上下文
[📎参考文档] → 上传 "brand_voice_guide.pdf"
[✨风格参考] → 上传 "example_article_1.md" + "example_article_2.md"
[🔒约束] → 长度不超过 500 字

Step 3: 对话
用户: "帮我改写这 5 篇文章，要符合我们的品牌声音，
      参考这些示例的风格，但要简洁一些"

系统收到的完整上下文:
{
  objects: { type: 'articles', count: 5, ids: [...] },
  referenceDocuments: ['brand_voice_guide.pdf'],
  styleExamples: ['example_article_1.md', 'example_article_2.md'],
  constraints: { maxLength: 500 },
  userMessage: "帮我改写这 5 篇文章..."
}

→ 系统可以精确理解并执行
```

### 场景 2：批量生成商品描述
```
Step 1: 选择对象
[选择对象▼] → 选择【商品】→ 已选 168 个

Step 2: 补充上下文
[📊数据源] → 上传 "products.xlsx"
           (包含: SKU, 商品名, 分类, 属性)
           
[📎参考文档] → 上传 "description_template.md"
             → 上传 "product_guidelines.pdf"
             
[✨风格参考] → 上传 "example_good_descriptions.csv"

[⚙️规则] → 勾选"SEO优化指南"
          → 上传"品牌合规检查清单.docx"

Step 3: 对话
用户: "根据这个表格生成商品描述，
      参考这些例子的质量和风格，
      要符合 SEO 标准和我们的品牌指南"

系统获得:
{
  objects: { type: 'products', count: 168 },
  dataSource: 'products.xlsx',  // 包含属性信息
  referenceDocuments: ['description_template.md', 'guidelines.pdf'],
  styleExamples: 'example_good_descriptions.csv',
  rules: ['seo_guide', 'compliance_checklist.docx'],
  userMessage: "根据这个表格生成..."
}

→ 精准执行，高质量输出
```

### 场景 3：根据视频生成说明文档
```
Step 1: 选择对象
[选择对象▼] → 选择【文章】→ 新建空白

Step 2: 补充上下文
[🖼️多媒体] → 上传 "product_demo.mp4" (2分钟演示视频)
           系统自动: 提取音频 → 转录文本 → 识别关键帧

[📎参考文档] → 上传 "document_format_template.docx"

[✨风格参考] → 上传 "technical_doc_example.pdf"

Step 3: 对话
用户: "根据这个产品演示视频，
      生成一份详细的使用说明文档，
      格式参考我上传的模板，
      风格要像这个技术文档一样专业"

系统获得:
{
  media: {
    video: 'product_demo.mp4',
    transcription: "...",  // 自动生成
    keyframes: [...]        // 自动提取
  },
  referenceDocuments: ['document_format_template.docx'],
  styleExamples: ['technical_doc_example.pdf'],
  userMessage: "根据这个产品演示视频..."
}

→ 多模态理解，生成高质量文档
```

---

## 数据结构

```typescript
type ConversationContext = {
  // Shopify 对象
  shopifyObjects?: {
    type: 'products' | 'articles' | 'customers' | 'orders' | ...;
    ids: string[];
    count: number;
  };
  
  // 参考文档 (PDF, Word, Markdown 等)
  referenceDocuments?: Array<{
    filename: string;
    type: 'pdf' | 'docx' | 'txt' | 'md';
    content: string;  // 已解析的文本内容
    uploadedAt: string;
  }>;
  
  // 数据源 (CSV, Excel 等)
  dataSource?: {
    filename: string;
    type: 'csv' | 'xlsx' | 'json';
    headers: string[];
    rows: Record<string, unknown>[];
    uploadedAt: string;
  };
  
  // 多媒体 (图片、视频)
  mediaFiles?: Array<{
    filename: string;
    type: 'image' | 'video' | 'audio';
    mimeType: string;
    size: number;
    
    // 对于视频和音频，自动生成这些
    transcription?: string;      // 音频转录
    keyframes?: string[];         // 视频关键帧
    description?: string;         // AI 生成的内容描述
    
    uploadedAt: string;
  }>;
  
  // 业务规则和指南
  rules?: Array<{
    name: string;
    type: 'predefined' | 'custom';
    content: string;
  }>;
  
  // 风格/示例参考
  styleExamples?: Array<{
    filename: string;
    type: 'text' | 'file';
    content: string;
  }>;
  
  // 约束条件
  constraints?: {
    maxLength?: number;
    preserveFields?: string[];
    disallowedWords?: string[];
    otherConstraints?: Record<string, unknown>;
  };
};
```

---

## 关键设计原则

### 1. 信息类型清晰
不同类型的上下文用不同的工具来补充，不会混淆

### 2. 可视化反馈
用户知道"已经补充了什么"，防止遗漏

### 3. 自动处理
- 视频 → 自动提取音频、转录、关键帧
- 多媒体 → 自动生成内容描述
- 文档 → 自动转录为文本

### 4. 减少语言歧义
用户不需要"用语言描述格式"或"解释规则"，直接上传示例或文档

### 5. 上下文完整
对话发送时，系统拥有完整的上下文：对象 + 参考 + 规则 + 约束
→ 一次精准执行，不需多轮澄清

