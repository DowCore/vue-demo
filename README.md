# Meta.Dow 前端（Vben Admin + ABP）

基于 [vue-vben-admin](https://github.com/vbenjs/vue-vben-admin)（本机参考目录 `D:\Vue\vue-vben-admin`）复制，并按 ABP 微服务后端（`D:\Project\demo-microservice`）接入：

- OpenIddict **密码模式**（`/connect/token`）与 **授权码 + PKCE**（AuthServer Visit / SSO）
- AuthServer `7600` Visit → `http://localhost:5666/auth/sso` → 回调 `/auth/oidc-callback`
- `/api/abp/application-configuration` 拉取当前用户与权限
- 菜单按 ABP 权限码过滤：`AbpIdentity.Users` / `AbpIdentity.Roles` / `AbpTenantManagement.Tenants`

## 启动

1. 先启动后端：`dotnet run --project D:\Project\demo-microservice\src\apps\Meta.Dow.AppHost`  
   更新 `MetaDow_Vue` 的 RedirectUri 后需再跑一次 DbMigrator（或重启 AppHost 让种子执行）。
2. 本仓库：

```bash
pnpm install
pnpm dev:antd
```

浏览器：`http://localhost:5666`  
默认账号与 ABP 一致：`admin` / `1q2w3E*`

从 AuthServer Visit：点 Visit 会进入 `/auth/sso`，复用 7600 登录态（未登录会先到 AuthServer 登录页）再回到前端首页。

开发代理：

| 前缀 | 目标 |
| --- | --- |
| `/connect` | AuthServer `https://localhost:7600`（token 交换） |
| `/api` | Gateway `https://localhost:7500` |

授权页跳转使用 `VITE_AUTH_SERVER_URL=https://localhost:7600`（浏览器直连，携带 Cookie）。

## 技术栈

Vben Admin 5.x monorepo + Ant Design Vue（`apps/web-antd`）。日常只改该应用即可。
