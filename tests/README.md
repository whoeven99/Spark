# 测试目录

单元测试与 `app/` 源码目录结构一一对应，放在 `tests/app/` 下。

- 运行：`npm run test`
- 监听：`npm run test:watch`
- 源码导入：相对路径 `../../../app/...` 或 Vitest 别名 `~/...`（指向 `app/`）

`scripts/` 下的 `*.test.cjs` 仍留在原处，由 `node --test` 单独执行。
