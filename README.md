# Meta.Dow 前端

基于 [Vue Vben Admin](https://github.com/vbenjs/vue-vben-admin) 5.x（Ant Design Vue）的管理端，对接 Meta.Dow ABP 微服务后端。

日常开发应用：`apps/web-antd`（开发端口 `http://localhost:5666`）。

## 已实现能力

### 登录与鉴权

- OpenIddict **密码模式**（`/connect/token`）与 **授权码 + PKCE**（AuthServer Visit / SSO）
- AuthServer Visit → `/auth/sso` → 回调 `/auth/oidc-callback`
- `/api/abp/application-configuration` 拉取当前用户、权限与多语言
- 菜单 / 路由按 ABP 权限码动态过滤

### 系统管理

| 模块 | 功能 |
| --- | --- |
| 身份 | 用户、角色、组织单元 |
| 租户 | SaaS 多租户管理 |
| 菜单 | 动态菜单 CRUD，与后端权限码绑定 |
| 数据范围 | Data Scope 配置 |
| 设置 | 邮件等系统设置 |
| 工作台 | Dashboard / 个人中心 |

### 逻辑编排

可视化编排流程并发布为系统 API：

| 页面 | 功能 |
| --- | --- |
| 流程定义 | 列表、创建、发布、版本 |
| 流程设计器 | AntV X6 画布；Start/End、条件、Http、Code、Sql、Assign、Log、Mask 等 |
| 执行实例 | 调用记录、节点时间线、试运行结果 |
| 数据连接 | 管理 MySQL / Oracle / SQL Server / Redis / Mongo 数据源 |

设计器要点：

- 节点入参 / 出参可视化映射；路径提示与字面量 JSON
- End 最终出参：可见性、脱敏、聚合、分组、**递归嵌套 map**
- 支持勾选 **「data 直接为此值」**（`promote`），使 API `data` 直接为数组或对象
- Code 节点脚本帮助与 DataSource 白名单调用说明

## 启动

1. 先启动后端 AppHost（Gateway `7500`、AuthServer `7600`）。
2. 本仓库：

```bash
pnpm install
pnpm dev:antd
```

浏览器：`http://localhost:5666`  
默认账号：`admin` / `1q2w3E*`

从 AuthServer Visit：复用 7600 登录态后回到前端首页。

### 开发代理

| 前缀 | 目标 |
| --- | --- |
| `/connect` | AuthServer `https://localhost:7600` |
| `/api` | Gateway `https://localhost:7500` |

授权页跳转使用 `VITE_AUTH_SERVER_URL=https://localhost:7600`（浏览器直连，携带 Cookie）。客户端名：`MetaDow_Vue`。

## 技术栈

- Vue 3 + Vite + TypeScript
- Vben Admin 5.x monorepo
- Ant Design Vue（`apps/web-antd`）
- AntV X6（流程设计器）

后端能力与 API 约定见配套微服务仓库文档（逻辑编排、IAM 菜单等）。
