# NEXUS 企业登录中心

一个可在本地运行的身份与访问管理演示项目，包含中文管理控制台、应用与用户管理、审计日志，以及真实的 OpenID Connect（OIDC）认证服务。前端使用 React、TypeScript 和 Vite，后端使用 Express、`oidc-provider` 和 SQLite。

当前交付是企业登录中心的可运行原型：OIDC 认证与数据管理可实际操作，生产级管理端鉴权、RBAC、多租户隔离和 MFA 尚未实现。

## 本地运行

需要 **Node.js 24 或更高版本**及 npm；SQLite 使用 Node.js 内置模块，无需另装数据库。

```bash
npm install
npm run dev
```

访问 **[http://localhost:5173](http://localhost:5173)**。请始终使用这个地址，不要替换为 `127.0.0.1`：OIDC Issuer、回调地址及来源校验均以 `localhost` 为准。

开发模式下，Vite 运行在 5173 端口，后端运行在 4000 端口；`/api`、`/oidc`、`/interaction` 由 Vite 代理至后端。

构建后也可以使用单个 Node.js 进程运行：

```bash
npm run build
npm start
```

运行 `npm start` 前先停止开发服务，避免占用相同端口。访问地址仍为 `http://localhost:5173`，后端此时直接提供 `dist/` 中的页面。开发模式和构建模式使用相同的 Issuer 与本地数据。

## 体验登录演示

控制台有意保留为无需登录的本地演示入口；进入管理界面不代表已经完成管理员认证。OIDC 登录页则会真实校验账号状态和密码。

| 演示账号         | 密码         |
| ---------------- | ------------ |
| `admin@acme.com` | `Demo@2026!` |

1. 在侧栏进入 **OIDC 实验室**，点击 **开始登录测试**。
2. 使用上述账号登录，在授权页确认应用请求的权限。
3. 回调页会兑换授权码、验证 ID Token，并展示真实的 UserInfo 与 ID Token Claims。
4. 返回控制台，在审计日志中查看新产生的登录与授权事件。

初始种子账号统一使用 10 位演示密码 `Demo@2026!`；这是预置演示凭据，不代表当前新增账号的密码规则。新增用户默认要求至少 **12 位密码**，可以在认证策略中调整。新建且启用的用户可以直接用于 OIDC 登录；停用用户会阻止认证并使其持久化会话与访问令牌失效。

## 内置数据与可操作功能

首次启动自动创建一个「Acme 科技」演示工作空间，包含：

- **6 个应用**：企业工作台、GitLab、知识空间、人事管理系统、数据分析平台、财务中心；初始有 5 个启用、1 个停用。
- **8 个真实种子用户**：分布于多个部门，初始有 7 个启用、1 个停用。
- **36 条历史演示审计记录**：之后的真实登录、授权和管理操作会继续写入数据库。

控制台支持应用创建与配置、应用启停、用户创建与启停、列表搜索与筛选、认证策略保存、审计详情查看及当前筛选结果导出。创建应用会实际注册可用的 OIDC Client，而不只是新增一张展示卡片。

应用卡片中的用户人数、登录总量、成功率、历史趋势和认证方式分布均为演示数据，不是从当前 8 个种子用户汇总出的实时指标。应用和用户列表来自数据库；审计列表同时包含标记为演示的历史记录及本地实际操作记录。管理 API 返回最近 200 条审计记录，数据库保留历史记录。

## OIDC 接入

本项目基于 [`oidc-provider`](https://github.com/panva/node-oidc-provider) 实现标准授权码流程，强制使用 PKCE / S256。协议说明参见 [OpenID Connect Core](https://openid.net/specs/openid-connect-core-1_0.html)。

| 配置           | 默认值                                                        |
| -------------- | ------------------------------------------------------------- |
| Issuer         | `http://localhost:5173/oidc`                                  |
| Discovery      | `http://localhost:5173/oidc/.well-known/openid-configuration` |
| 演示 Client ID | `nexus-demo`                                                  |
| 演示回调地址   | `http://localhost:5173/callback`                              |
| 客户端认证方式 | `none`，公开客户端，不使用 Client Secret                      |
| Response Type  | `code`                                                        |
| Scope          | `openid profile email`                                        |
| PKCE           | `S256`，强制启用                                              |

客户端应读取 Discovery 获取授权、Token、UserInfo、JWKS 和退出端点。内置实验室为 `nexus-demo` 配置；接入自己的应用时，在应用管理中创建独立 Client ID，并登记自己应用的完整回调地址。回调地址需精确匹配，HTTPS 地址可注册，本机地址允许 HTTP。

已实现的认证行为：

- 随机 `state`、`nonce` 和 PKCE verifier；授权码有效期 60 秒且只能使用一次。
- RS256 签名的 ID Token、JWKS 公钥发布、UserInfo、令牌撤销及用户确认后的会话退出。
- 浏览器回调校验签名、Issuer、Audience、过期时间、nonce 与授权方，检查 UserInfo 的 `sub` 与 ID Token 一致。
- Access Token 和 ID Token 默认有效期为 10 分钟；新会话默认有效期 120 分钟，可在认证策略中修改。
- 实验室 Token 仅用于当前页面内存，不写入浏览器持久化存储；短期登录事务写入 `sessionStorage`，回调时移除。

当前未实现 Refresh Token、SAML、社会化身份源、MFA 或生产级统一退出到所有业务应用的编排。

## 管理 API 与存储

| 方法与路径             | 功能                                                                 |
| ---------------------- | -------------------------------------------------------------------- |
| `GET /api/health`      | 服务状态、模式与 Issuer                                              |
| `GET /api/bootstrap`   | 应用、用户、最近审计事件和策略配置                                   |
| `POST /api/apps`       | 创建应用，参数包括 `name`、`description`、`redirectUri`              |
| `PATCH /api/apps/:id`  | 更新应用名称、描述、回调地址或状态                                   |
| `POST /api/users`      | 创建用户，参数包括 `name`、`email`、`department`、`role`、`password` |
| `PATCH /api/users/:id` | 设置用户 `status` 为 `active` 或 `inactive`                          |
| `PATCH /api/settings`  | 设置 `sessionTimeout`（分钟）与 `passwordMinLength`                  |

管理写请求必须发送 `Content-Type: application/json`；浏览器来源需要与站点地址一致。示例：

```bash
curl http://localhost:5173/api/health
```

数据默认持久化在 `.data/nexus.sqlite`，包括应用、加盐 scrypt 密码哈希、用户、审计、认证策略、签名密钥和 OIDC 会话数据。`.data/` 已加入 Git 忽略列表，重启不会重新覆盖已有数据。备份或重置数据前先停止服务；将整个 `.data/` 目录移到备份位置后，再次启动会生成一套新种子数据和签名密钥，旧会话与令牌将不再有效。

`DATA_DIR` 可指定独立数据目录；`PORT` 和 `ISSUER` 用于后端配置。更换 Issuer、端口或域名时，也要同步前端代理和已注册回调地址；修改环境变量不会自动迁移已有应用配置。

## 检查与测试

```bash
npm run build
npm test
```

构建包含 TypeScript 检查。后端测试使用独立临时数据库，覆盖授权码与 PKCE 完整流程、签名与 UserInfo、错误 verifier、授权码重放、非法回调、停用账户及应用、管理输入校验和 CSRF 防护等行为，不修改演示数据库。

## 使用边界与扩展方向

后端只监听回环地址，并限制 Host、管理请求来源及 JSON 写入格式；登录表单包含 CSRF 校验和基础失败限流。这些措施服务于本地演示，不构成生产级管理端访问控制。

**不要把当前管理控制台或管理 API 直接暴露到公网。**「管理员 / 成员」目前是用户元数据，并未实现 RBAC 权限判定；工作空间为单实例展示，不具有多租户数据隔离；自助注册未开放，用户由管理页面直接创建，没有发送邀请邮件。

用于真实企业环境前，需要补充管理端身份认证与授权、租户边界、MFA、账号恢复与凭据轮换、HTTPS 与安全部署配置、密钥轮换、分布式存储及限流、审计保留策略与监控，并完成相应安全测试。
