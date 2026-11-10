# AGENTS.md

## 项目速览

pnpm monorepo 全栈模板：

- `apps/api`：Hono + better-auth + Drizzle（本地 PGLite / 生产 PostgreSQL）
- `apps/web`：Vite + React 19 + TanStack Router/Query + Tailwind v4（SPA）
- `packages/db`：Drizzle schema 与迁移
- `packages/shared`：前后端共享的 env schema 与业务 DTO

改动后必须通过 `pnpm typecheck` 与 `pnpm check`（Biome，不引入 ESLint/Prettier）。

## 常用命令

| 命令 | 作用 |
| --- | --- |
| `pnpm dev:api` / `pnpm dev:web` | 启动后端 / 前端 dev |
| `pnpm typecheck` | 全仓 TypeScript 检查 |
| `pnpm check` / `pnpm format` / `pnpm lint` | Biome 检查 / 格式化 / 修复 |
| `pnpm --filter @stack/db generate` \| `migrate` | 生成 / 执行 Drizzle 迁移 |
| `pnpm --filter @stack/web generate-routes` | 重新生成 `routeTree.gen.ts` |

## 前端状态管理选择

按数据来源选择状态方案，避免把服务端数据或应持久化的 UI 状态塞进 `useState` / `useReducer`。

| 数据类型 | 方案 | 示例 |
| --- | --- | --- |
| 服务端数据 | TanStack Query（`useQuery` / `useInfiniteQuery` / `useMutation`） | 列表、详情、创建/删除 |
| 筛选、分页、排序等页面状态 | URL search params（TanStack Router `validateSearch`） | `?keyword=foo&sortBy=updatedAt` |
| 临时本地 UI 状态 | `useState` / `useReducer` | 弹窗开关、表单草稿、拖拽中间态 |

- 设计、实现或评审相关代码时，使用 `frontend-state-data-flow` skill 中的决策流程、实现模式与加载态规范。
- 实现或修改无限滚动列表时，同时使用 `infinite-scroll` skill。

## Feature 模块结构

业务放在 `apps/web/src/features/<module>/`。按数据边界分文件，按文件数量决定要不要变成目录——有则拆、无则扁平，不要为每个模块预先建空目录。

长大后的上限结构：

```text
features/<module>/
  query-keys.ts     # TanStack Query key 工厂（有服务端读写才需要）
  api.ts            # HTTP 纯函数，无 React；作为 queryFn / mutationFn
  hooks.ts          # 或 hooks/：Query 封装 + 业务 hook（超过约 2 个文件再拆目录）
  components/       # 从页面拆出的子组件（有第 2 个才建目录）
  utils.ts          # 或 utils/：模块工具（有第 2 个文件再拆目录）
  types.ts          # 仅前端私有类型；DTO 用 @stack/shared，不要再抄一份
  <page>.tsx        # 页面入口（路由只挂这一个组件）
  index.ts          # 对外导出：页面、query-keys、必要时 hooks
```

| 层 | 职责 | 谁可以引用 |
| --- | --- | --- |
| `query-keys.ts` | key 工厂，如 `canvasKeys.list(filters)` | 模块 hooks |
| `api.ts` | `HttpClient` + `throwIfNotOk` | 仅作为 `queryFn` / `mutationFn` |
| `hooks.ts` | `useQuery` / `useInfiniteQuery` / `useMutation` | 页面与模块内组件 |
| `components/` | 模块 UI 子块 | 本模块页面 |
| `index.ts` | 模块对外承诺 | `routes/`、少数跨模块调用（如布局里的 `useSignOut`） |

约束：

- 不要把 HTTP 写进 hooks：`api.ts` 不依赖 React，便于测试和将来在非组件里复用。
- 组件里不要手写 Query 配置：`queryKey`、`queryFn`、`invalidateQueries` 放在模块 hooks 里。
- `index.ts` 不要全量 re-export 内部组件，避免循环依赖、模糊边界。
- 没有服务端数据的模块不要硬建 `api.ts` / `query-keys.ts`。
- 筛选/分页/排序仍由路由 `validateSearch` 写入 URL，不要放进 feature 的 types 当「页面状态源」。
- 登出时用 `queryClient.clear()` 清掉当前用户的服务端缓存，避免 auth 依赖各个业务模块的 query-keys。

## React 状态规范：状态就近/下沉

- **默认下沉**：默认将 state 放在真正使用它的最小组件中；仅当多个兄弟/跨层级需要共享、需要单一数据源或受控编排时，才提升到最近公共父级、Context 或 store。
- **仅在必要时提升**：新增 state 前先问：谁读？谁写？父组件是否真的需要？父组件不读不控，就下沉。
- **React Compiler 不能替代状态下沉**：自动 memo 不能替代状态下沉的架构收益，不能阻止状态所在组件自身重渲染，也不能替代职责拆分与局部优化。
- **拆分尺度**：下沉优先为了结构清晰、可维护、可测试、缩小重渲染与副作用影响范围；不要为性能过度拆分。

## React Compiler：已启用

`apps/web` 已接入 React Compiler（1.x 稳定版），dev 与 build 下都会对
`apps/web/src/**/*.{ts,tsx,js,jsx}` 中的组件与 hooks 自动做 memo 化。

配置位置（`apps/web/vite.config.ts`）：

```ts
viteReact(),
babel({ presets: [reactCompilerPreset()] }),
```

依赖（`apps/web` devDependencies，版本统一走 pnpm catalog）：
`babel-plugin-react-compiler`、`@rolldown/plugin-babel`、`@babel/core`。
React 19 自带 compiler runtime，**不需要** `react-compiler-runtime`。

### 写代码时的约定

- 不要为了“性能”手写 `useMemo` / `useCallback` / `React.memo`：编译器会自动处理。
  仅在确实需要跨渲染保持引用身份（第三方订阅、effect 依赖必须稳定的对象）时手写，
  并注明原因。
- 编译器依赖 Rules of React，必须遵守：
  - 不在渲染期间修改 props、state 或外部变量（副作用放 effect / 事件处理）；
  - 渲染计算不要直接读写 `ref.current`（仅用于事件 / effect）；
  - 组件与 hook 保持纯函数，渲染路径不调用非幂等逻辑（`Date.now()`、`Math.random()`
    等放进事件或 effect）。
- 新代码按常规 React 写法组织，不要为编译器添加特殊标记。
- 极少数无法满足规则的代码（如与可变状态的遗留库集成），可在函数体第一行加
  `"use no memo";` 让编译器跳过该函数；这只是退出优化，不改变行为，不要滥用。
- 编译器跳过某个组件只是少一次优化，不是错误；排查性能先看 React DevTools Profiler。

### 验证是否生效

```bash
pnpm --filter @stack/web build
# 产物中出现 useMemoCache / .memoCache 即说明已编译
grep -o "useMemoCache" apps/web/dist/assets/*.js | head
```

## 约定

- 受保护路由文件名以 `_app.` 开头，守卫在 `apps/web/src/routes/_app.tsx`。
- 环境变量：后端 `apps/api/.env.example`，前端 `apps/web/src/env.ts`；不要提交真实密钥。
