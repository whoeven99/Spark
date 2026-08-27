# 发布新 Shopify App 流程

> 本文是 Spark / Ciwi Apps 侧「从零发布一个新 Shopify 应用」的操作手册。  
> Agent 被问到「怎么发新 Shopify app / 怎么配 Render / toml从哪来」时，**优先按本文回答**。  
> 分发方式（Public Unlisted / Custom）与上架门禁见 `docs/ROADMAP.md` 第六–八节；本文不替代 Partner 政策判断。

## 适用场景

- 本地功能已开发完，要挂一个**新的** Shopify Partner 应用 + Render Web Service。
- 配置文件通常命名为 `shopify.app.<name>.toml`（例如 `shopify.app.test.toml`）。下文以 `shopify.app.test.toml` 为例，换成别的名字命令同样适用。

## 流程总览

```text
本地开发完成
  → Shopify CLI 建应用 / 写 toml / 首次 deploy
  → 从 Dev Dashboard 抄 API Key / Secret
  → Render 建 Web Service + Secret File(.env)
  → 把 Render URL 写回 toml 的 application_url / redirect_urls
  → 再 deploy 一次更新 URL
  → 确认 Render 上 SHOPIFY_* 三件套齐全
```

---

## 1. 本地开发完成

确认应用在本地能跑通（例如 `npm run dev` / 对应 toml 的 `npm run dev:*`），再进入发布。

---

## 2. 用 Shopify CLI 创建 / 关联应用配置

1. 在仓库根目录新建空白配置文件（若还不存在）：

```powershell
# 例：新建 test 配置（文件先可为空）
New-Item -ItemType File -Path shopify.app.test.toml -Force
```

2. 链接到 Partner 里的应用（或按提示新建）：

```powershell
shopify app config link --config shopify.app.test.toml
```

3. 按提示填写**新建的 App Name**。CLI 会自动把 `client_id`、基础字段等写进 toml。

4. 发布一个应用版本到 Shopify：

```powershell
shopify app deploy --config shopify.app.test.toml
```

5. 部署完成后，点击输出里的 **Dev Dashboard** 链接 → **设置**。
6. 找到：
   - **客户端 ID（Client ID）** → 记为 `SHOPIFY_API_KEY`
   - **加密密钥（Client Secret / API secret key）** → 记为 `SHOPIFY_API_SECRET`  
   复制保存，下一步写进 Render（**不要提交进 git**）。

---

## 3. 在 Render 创建 Web Service

1. 打开 Render，进入 **Ciwi-Apps** 下的 **test**（或目标）环境。
2. **Create new service** → **Web Service**。
3. 连接对应的 **code 仓库**；**Root Directory** 填本应用在 monorepo 中的文件夹（Spark 根应用一般填仓库根或文档约定的路径）。
4. **Environment Variables** 这一步可以先不填。
5. 点下方 **Advanced** → **Add Secret File**：
   - **Filename**：`.env`
   - **Contents**：参考本地 `.env` 的结构填写（含数据库、LLM、Turso 等；至少后面要有 Shopify 三件套）。
6. 点击发布，等待服务起来。
7. 打开该 Web Service 的 **Settings**，复制服务 URL，记为 `SHOPIFY_APP_URL`（例如 `https://xxxx.onrender.com`）。

### 把 URL 写回 Shopify toml

编辑 `shopify.app.test.toml`：

- `application_url` = `SHOPIFY_APP_URL`
- `redirect_urls` 里各项的**域名/前缀**改为同一 `SHOPIFY_APP_URL`（路径保持 `/api/auth` 等原样）

然后本地再 deploy 一次，让 Shopify 侧 URL 生效：

```powershell
shopify app deploy --config shopify.app.test.toml
```

> 只改 toml 不 deploy，Partner 控制台里的应用 URL / webhook 订阅不会更新。

---

## 4. 最终确认 Render Secret File（`.env`）里的 Shopify 三件套

在 Render 该服务的 Secret File `.env`（或 Environment）中确保至少有：

```bash
SHOPIFY_API_KEY=<Dev Dashboard 客户端 ID>
SHOPIFY_API_SECRET=<Dev Dashboard 加密密钥>
SHOPIFY_APP_URL=<Render Web Service 的 https URL>
```

三者必须与**当前这份 toml 对应的那个 Shopify 应用**一致，且 `SHOPIFY_APP_URL` 与 toml 里的 `application_url` 一致。

---

## 检查清单

- [ ] `shopify app config link` 已生成 / 关联正确的 toml
- [ ] 已执行至少一次 `shopify app deploy --config <该 toml>`
- [ ] Dev Dashboard 已抄下 API Key / Secret
- [ ] Render Web Service 已创建且 Root Directory 正确
- [ ] Secret File `.env` 已配置（含 Shopify 三件套及其它运行所需变量）
- [ ] toml 的 `application_url` / `redirect_urls` 已改成 Render URL
- [ ] URL 改完后又执行了一次 `shopify app deploy`
- [ ] 若需要订单/退款等增量：toml 里已声明 webhook 订阅，且已 deploy（见 `AGENTS.md` / `docs/ROADMAP.md`）

## 安全注意

- **禁止**把 `SHOPIFY_API_SECRET`、完整 `.env` 内容写进文档、PR 描述或聊天日志。
- toml 里的 `client_id` 可进仓库；Secret 只放 Render / 本地 env。

## 相关命令速查

```powershell
shopify app config link --config shopify.app.test.toml
shopify app deploy --config shopify.app.test.toml
```

仓库内已有配置示例：`shopify.app.test.toml`、`shopify.app.yw.toml`、`shopify.app.spark-zz.toml` 等；新建应用时用新文件名，不要覆盖他人正在用的 toml。
