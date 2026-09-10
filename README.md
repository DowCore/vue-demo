# Meta.Dow 前端（Vben Admin + ABP）

基于 [vue-vben-admin](https://github.com/vbenjs/vue-vben-admin)（本机参考目录 `D:\Vue\vue-vben-admin`）复制，并按 ABP 微服务后端（`D:\C#\demo-microservice`）接入：

- OpenIddict **Resource Owner Password** 登录（`/connect/token`）
- `/api/abp/application-configuration` 拉取当前用户与权限
- 菜单按 ABP 权限码过滤：`AbpIdentity.Users` / `AbpIdentity.Roles` / `AbpTenantManagement.Tenants`
- 用户、角色、租户 CRUD 走 Identity / SaaS HTTP API（经 YARP 网关）

## 启动

1. 先启动后端：`dotnet run --project D:\C#\demo-microservice\src\apps\Meta.Dow.AppHost`  
   若首次增加 `MetaDow_Vue` 客户端，请再跑一次 DbMigrator（或重启 AppHost 让迁移种子执行）。
2. 本仓库：

```bash
pnpm install
pnpm dev:antd
```

浏览器：`http://localhost:5666`  
默认账号与 ABP 一致：`admin` / `1q2w3E*`

开发代理：

| 前缀 | 目标 |
| --- | --- |
| `/connect` | AuthServer `https://localhost:7600` |
| `/api` | Gateway `https://localhost:7500` |

## 技术栈

Vben Admin 5.x monorepo + Ant Design Vue（`apps/web-antd`）。日常只改该应用即可。
