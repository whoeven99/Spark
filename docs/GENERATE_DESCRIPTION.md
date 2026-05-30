1. 目标与范围
本方案用于在 Spark（TypeScript）项目内落地 Product Description Generator（商品描述生成）能力，核心目标是：
- 基于 Shopify 商品真实数据生成高质量标题与描述。
- 保持现有 Spark 分层方式（路由层 + 服务层 + AI 调用层），不引入复杂编排。
- 返回稳定、可直接被前端消费的 JSON 结构。
明确不做：
- Multi-Agent（多智能体）架构。
- Workflow Engine（工作流引擎）。
- 复杂状态机或跨服务编排。

---
2. 整体流程（简化版）
1. 前端提交 shop + productId + 生成参数 到 Spark 后端接口。
2. 后端使用 Shopify Admin GraphQL 查询商品上下文。
3. 后端构造 System Prompt 与 User Prompt（注入商品 Context）。
4. 后端调用 angchain自带的模型生成结果。
5. 后端做最小结果校验与清洗后，返回统一 JSON。

---
3. Shopify 数据抓取逻辑
3.1 数据来源与调用方式
- 数据源：Shopify Admin GraphQL API。
- 调用主体：Spark 服务端（基于当前会话店铺鉴权）。
- 查询方式：按 productId 精准查询单个商品，避免不必要列表扫描。
3.2 必需字段（MVP）
建议至少抓取以下字段用于文案生成：
- 商品基础信息
  - id
  - title
  - description（原始描述，可作为重写参考）
3.3 查询构建策略
- 查询入口：product(id: $productId)。
- 字段选择原则：
  - 只取生成文案必需字段，避免过量字段导致响应膨胀。

---
4. AI Prompt 策略
4.1 System Prompt（详细定义）
System Prompt 建议固定为“电商商品文案专家”角色，明确以下约束：
- 角色定位：
  - 你是 Shopify 电商商品文案专家，负责产出可直接上架的商品标题与描述。
- 输出目标：
  - 输出清晰、可信、可读、可转化的商品文案。
  - 优先突出核心卖点与使用场景。
- 风格约束：
  - 不夸大、不虚假承诺、不编造不存在的参数。
  - 语言自然，不堆砌关键词。
  - 内容与输入商品信息强绑定，不输出泛化模板文案。
- 结构约束：
  - 标题简洁，突出品类 + 核心差异点。
  - 描述包含价值点、场景、材质/规格（若有）、购买动机。
- 输出约束：
  - 严格输出 JSON。
  - 仅包含 generatedTitle 与 generatedDescription 两个字段。
4.2 User Prompt 注入策略（Context 注入）
User Prompt 不直接拼接 Shopify 原始 JSON，而是注入结构化上下文块：
- 商品基础：title、text。
- 写作参数：目标语言。

---
5. 调用模型
5.1 模型选择
用langchain自带的模型
5.2 Temperature
- 推荐默认：0.4
  - 保持稳定性与一定文案灵活度。
- 可调区间：0.2 ~ 0.6
  - 偏低更稳定，偏高更有创意。
- 不建议超过 0.7，避免风格漂移和事实偏离。
5.3 Response Format
- 目标格式：JSON Object（结构化输出）。
- 强约束字段：
  - generatedTitle：字符串
  - generatedDescription：字符串
5.4 失败与降级策略（简单可维护）
- 首次失败：重试一次同模型。
- 二次失败：降级到备用模型（如deepSeek， gemini，kimi）。
- 连续失败：返回可读错误码给前端，不返回半结构化文本。

---
6. 接口契约（Schema）
后端对前端返回统一 JSON（成功态）：
- Title：原商品标题。
- generatedDescription：AI 生成商品描述。
建议约束：
- 两字段均为必填字符串。
- 返回前执行最小校验：非空、去除首尾空白、长度上限保护。
- 若 AI 返回异常结构，服务端统一转为业务错误，避免前端解析崩溃。

---
7. Spark 项目落地建议（最小改动）
- 路由层：新增/复用一个生成接口入口，负责鉴权与参数校验。
- 服务层：新增 ProductContextFetcher 与 DescriptionGenerationService。
- Prompt 层：新增 PromptBuilder，统一管理 System/User Prompt 模板。
- AI 客户端层：封装模型、Temperature、Response Format 与重试策略。
保持职责单一：
- 抓数只抓数。
- Prompt 只负责拼装。
- AI 调用只负责请求与解析。
- 接口层只处理 I/O 与错误映射。

---
8. 质量与风控要点
- 数据真实性：仅使用 Shopify 已有字段，不推断不存在的功能或材质。
- 文案合规：避免绝对化措辞（如“100% 治愈”“绝对最佳”）。
- 可观测性：记录请求 ID、模型名、耗时、token 使用量（不记录敏感文本）。
- 幂等（Idempotent，幂等）：同一输入重复调用应得到风格一致、结构稳定输出。

---
9. 示例输出（Expected Output Format）
{
  "generatedTitle": "",
  "generatedDescription": ""
}