# Token 计费系数（TokenBillingRule）

商品文案、画面扩写、文生图、整图翻译使用不同大模型/提供商，**实际 API token（或定额基准）× 系数** 后写入 Turso `Account.usedTokens`。

## 数据表

| 字段 | 说明 |
|------|------|
| `ruleKey` | 主键，建议 `gd:{feature}:{modelKey}` |
| `appName` | `generate-description` 或 `*`（全局兜底） |
| `feature` | `product_copy` · `image_prompt` · `image_generate` · `picture_translate` · `translation_v3` |
| `modelKey` | 模型/提供商标识，见下表；未命中时用 `_default` |
| `displayName` | 运维备注 |
| `multiplier` | 乘数（≥0），记入账户前对 token 向上取整：`ceil(n × multiplier)` |
| `baseTokenCost` | 定额场景基准 token（文生图/整图翻译）；LLM 场景可 NULL |
| `enabled` | 是否生效 |

## modelKey 约定（与 `.env` 一致）

| feature | 当前环境 modelKey | 来源 |
|---------|-------------------|------|
| `product_copy` | `deepseek-chat` | `DEEPSEEK_MODEL` → `descriptionAiClient` |
| `image_prompt` | `deepseek-chat` | 同上（画面扩写） |
| `image_generate` | `gpt-image-2` | `OPENAI_IMAGE_MODEL`，`IMAGE_GEN_PROVIDER=openai` |
| `picture_translate` | `volc-translate` / `aidge-translate` | 整图翻译路由到的提供商 |
| `translation_v3` | `deepseek-chat` / `_default` | AgentTask JSON Runtime / V3 翻译（Spring 经 Internal API 入账） |

若启用 `IMAGE_GEN_PROVIDER=volc`，入账 modelKey 为 `IMAGE_GEN_VOLC_REQ_KEY`（默认 `high_aes_general_v20`），需在表中另加一行规则。

匹配顺序：`appName + feature + modelKey` → 同 app `_default` → `*` + modelKey → `*` + `_default` → 乘数 **1.0**。

## 运维如何改系数

1. 在 Turso 执行 `UPDATE`（改完约 5 分钟内进程缓存自动过期，或重启服务）：

```sql
UPDATE "TokenBillingRule"
SET "multiplier" = 1.5, "updatedAt" = CURRENT_TIMESTAMP
WHERE "ruleKey" = 'gd:product_copy:deepseek-chat';
```

2. 新增模型：向 `prisma/token-billing-rule-seed.sql` 追加 `INSERT OR IGNORE` 行，再 `npm run turso:migrate:test`（种子为 INSERT OR IGNORE，可重复执行）。

3. 调整定额基准：改 `baseTokenCost` 或环境变量 `IMAGE_GENERATION_TOKEN_COST` / `PICTURE_TRANSLATE_TOKEN_COST`（规则未配置 `baseTokenCost` 时回退 env）。

## 代码入口

- 查表：`app/server/tokenUsage/tokenBillingCatalog.server.ts`
- 乘数：`app/server/tokenUsage/applyTokenBilling.server.ts`
- 入账：`recordBilledTokenUsage` / `recordVisualToolTokenUsage`

## 迁移

```bash
npm run turso:migrate:test
```

会创建 `TokenBillingRule` 表并写入 `prisma/token-billing-rule-seed.sql` 默认系数（初始多为 1.0，可按成本再调）。
