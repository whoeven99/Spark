审核期临时关闭 Theme App Extension（5.1.1 / 5.1.5）：

- Pixel 三个 liquid + Image Switcher 均从 `blocks/` 移出。
- `../shopify.extension.toml` 已改名为 `shopify.extension.toml.off`，整包不部署。

过审后还原：
1. `shopify.extension.toml.off` → `shopify.extension.toml`
2. 本目录全部 `*.liquid` 移回 `../blocks/`
3. 对该配置 `shopify app deploy`
