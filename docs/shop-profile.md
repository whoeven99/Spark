# 店铺画像（Shop Profile）

安装应用或 OAuth 完成后，从 Shopify Admin API 读取**店铺基础信息**，写入 Cosmos + Blob，供 AI Assistant 在 system prompt 中引用。

## 存储

| 层 | 位置 | 说明 |
|----|------|------|
| Cosmos | 库 `spark_ops`，**默认与 `agent_runs` 同容器**（避免新建容器超出账户 RU 配额） | partition `/shop`，`id: profile`，`docType: shop_profile`，`ttl: -1` |
| Blob | 容器 `spark-shop-profiles`（`SHOP_PROFILE_BLOB_CONTAINER`） | 路径 `shops/{shop}/profile.md` |

Blob 未配置时，将 `profile.md` 全文存入 Cosmos 字段 `profileMarkdownInline`。

## 环境变量

与 `agent_runs` 共用：`COSMOS_ENDPOINT`、`COSMOS_KEY`。

| 变量 | 默认 | 说明 |
|------|------|------|
| `SHOP_PROFILE_ENABLED` | 启用 | `false` / `0` 关闭 |
| `COSMOS_SHOP_PROFILES_CONTAINER` | 同 `agent_runs` | 勿设 `shop_profiles` 除非已在 Azure 手动建容器且用共享吞吐量 |
| `SHOP_PROFILE_BLOB_CONTAINER` | `spark-shop-profiles` | Blob 容器 |
| `SHOP_PROFILE_BLOB_CONNECTION_STRING` | 同翻译 Blob | 可复用 `AZURE_BLOB_CONNECTION_STRING` |
| `SHOP_PROFILE_MARKDOWN_MAX_CHARS` | `6000` | 注入 prompt 的 MD 上限 |

## 触发时机

1. **新安装 / 重装**（Turso 写入新的 `APP_INSTALLED`）：`auth.$.tsx`、`app.tsx` 调用 `refreshShopProfileOnInstall`（**会覆盖**已有 Blob/Cosmos，`version` +1）
2. **普通刷新 / 已进入过 App**（安装事件已存在）：`ensureShopProfile`；若 Blob 或 Cosmos 已有画像则**跳过**（仅打 info 日志，不再 `bootstrap ok`）

### 日志对照（Render 等服务端日志）

| 日志 | 含义 |
|------|------|
| `[ShopProfile] schedule ensure shop=…` | 刷新页面，进入 `/app` 壳 loader |
| `[ShopProfile] ensure skipped (profile already exists via blob)` | 画像已在 Blob，**正常**，不会重复写入 |
| `[ShopProfile] ensure starting bootstrap` | 尚无画像，开始拉 Shopify |
| `[ShopProfile] bootstrap ok …` | 写入完成 |
| `[ShopProfile] refresh on install shop=…` | 判定为新安装，强制刷新 |
| `[CommonEvent] APP_INSTALLED skipped …` | 未算新安装，故不会 refresh |

仅刷新浏览器**不会**重复 `bootstrap ok`，除非删除 Blob 中 `shops/{shop}/profile.md` 或 Cosmos 中 `profile` 文档。

### Blob 路径（Portal 对照）

进程**首次**访问店铺画像 Blob 时打一条日志：

```text
[ShopProfile][Blob] init container accountName=… container=spark-shop-profiles connectionSource=…
```

Portal 路径：`{accountName}` → 容器 `{container}`（默认 `spark-shop-profiles`）→ `shops/{shop}/profile.md`。

## 代码

- `app/server/shopProfile/` — 拉取、构建、读写、加载
- `app/server/chat-stream.ts` — `loadShopProfileForPrompt` 注入 `AgentContext.profile`
- `app/server/ai/core/shopAssistantPrompt.ts` — 拼接【商店画像】

## Cosmos RU 配额说明

免费/低配 Cosmos 账户常有**账户级 RU 上限**（例如 1000 RU/s）。

- 店铺画像**绝不**调用 `containers.createIfNotExists`，只连接已有 **`agent_runs`** 容器。
- `COSMOS_SHOP_PROFILES_CONTAINER` 若指向其他容器名会被**忽略**（并打 warn 日志）。
- Cosmos upsert 失败（RU 超限、容器不存在）时：若已配置 Blob，仍视为 **bootstrap ok**，聊天从 Blob 读 `profile.md`。
- 建议配置 **`AZURE_BLOB_CONNECTION_STRING`**（或 `SHOP_PROFILE_BLOB_CONNECTION_STRING`），作为 Cosmos 不可用时的可靠存储。
- 可选：设 `COSMOS_SPARK_OPS_AUTO_CREATE=false`，Agent Run 也不再自动建容器（须事先在 Portal 建好 `agent_runs`）。

## 首次在 Azure 创建 `agent_runs`（Portal）

截图中已有库 **`spark_ops`**，但下面**没有容器**时，会出现：

`Cosmos container not found … ensure "agent_runs" exists in Azure`

此时 **Blob 画像仍可用**（`bootstrap ok … cosmos=false blob=true`），AI 聊天会从 Blob 读 `profile.md`。若还要写 Cosmos（Agent Run 摘要 + 画像索引），请手动建容器：

1. Azure Portal → Cosmos 账户 → **Data Explorer**
2. 展开 **`spark_ops`** → **New Container**
3. 填写：
   - **Container id**：`agent_runs`（与 `COSMOS_AGENT_RUNS_CONTAINER` 一致，默认即此名）
   - **Partition key**：`/shop`
   - **Throughput**：选 **Database (shared)** / **使用数据库吞吐量**，**不要**给容器单独再分配 400 RU（否则会再次触发账户 1000 RU 上限）
4. （可选）容器 **TTL** 设为 `7776000`（90 天，供 Agent Run）；店铺画像文档会自带 `ttl: -1` 不会被删
5. 保存后，让商户再进一次 `/app` 或重装触发画像；日志应出现 `cosmos=true`

若 `spark_ops` 库本身没有吞吐量，需先在库级别配置 **Manual** 或 **Autoscale**（例如 400–1000 RU/s），再在其下建容器并选 **共享库吞吐量**。

## 当前状态说明

| 日志 | 含义 |
|------|------|
| `bootstrap ok … cosmos=false blob=true` | 画像已写入 Blob，**聊天可用** |
| `Cosmos container not found` | 仅 Cosmos 索引未写入，**不是致命错误** |
| `bootstrap ok … cosmos=true blob=true` | Cosmos + Blob 双写成功 |

## 后续扩展

见 `docs/shop-insight-agent-roadmap.md`（经营指标、广告 API、LLM 蒸馏等）。
