import express from "express";
import Provider from "oidc-provider";
import { generateKeyPair, exportJWK } from "jose";
import {
  randomBytes,
  randomUUID,
  createHmac,
  timingSafeEqual,
} from "node:crypto";
import { fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";
import { existsSync } from "node:fs";
import {
  openStore,
  adapterFor,
  seed,
  hashPassword,
  verifyPassword,
} from "./store.mjs";
import { loginPage, consentPage, layout, escape } from "./views.mjs";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export async function createServer(options = {}) {
  const port = Number(options.port ?? process.env.PORT ?? 4000);
  const issuer =
    options.issuer ?? process.env.ISSUER ?? "http://localhost:5173/oidc";
  const origin = new URL(issuer).origin;
  if (!["localhost", "127.0.0.1", "[::1]"].includes(new URL(issuer).hostname))
    throw new Error(
      "This demo server must use a loopback issuer. Configure production identity and management authorization before external deployment.",
    );
  const store = openStore(
    options.dataDir ?? process.env.DATA_DIR ?? resolve(projectRoot, ".data"),
  );
  seed(store, origin);
  let keys = store.get("meta", "keys");
  if (!keys) {
    const { privateKey } = await generateKeyPair("RS256", {
      modulusLength: 2048,
      extractable: true,
    });
    keys = store.put("meta", {
      id: "keys",
      jwks: {
        keys: [
          {
            ...(await exportJWK(privateKey)),
            kid: randomUUID(),
            use: "sig",
            alg: "RS256",
          },
        ],
      },
      cookieKey: randomBytes(32).toString("base64url"),
    });
  }
  const settings = () => store.get("settings", "settings");
  const provider = new Provider(issuer, {
    adapter: adapterFor(store),
    jwks: keys.jwks,
    cookies: {
      keys: [keys.cookieKey],
      short: { sameSite: "lax" },
      long: { sameSite: "lax" },
    },
    clients: [],
    claims: {
      openid: ["sub"],
      profile: ["name", "preferred_username"],
      email: ["email", "email_verified"],
    },
    scopes: ["openid", "profile", "email"],
    responseTypes: ["code"],
    pkce: { methods: ["S256"], required: () => true },
    ttl: {
      Session: () => settings().sessionTimeout * 60,
      AccessToken: 600,
      AuthorizationCode: 60,
      Interaction: 600,
      Grant: 86400,
      IdToken: 600,
    },
    features: {
      devInteractions: { enabled: false },
      revocation: { enabled: true },
      rpInitiatedLogout: {
        enabled: true,
        logoutSource: async (ctx, form) => {
          ctx.type = "html";
          ctx.body = layout(
            `<h1>退出当前会话</h1><p>退出后，再次访问应用时需要重新登录。</p>${form}<button type="submit" form="op.logoutForm" name="logout" value="yes">确认退出</button>`,
            "退出登录",
          );
        },
        postLogoutSuccessSource: async (ctx) => {
          ctx.type = "html";
          ctx.body = layout(
            '<h1>您已安全退出</h1><p>当前统一登录会话已结束。</p><a href="/">返回管理控制台 →</a>',
            "已退出登录",
          );
        },
      },
    },
    interactions: {
      url: (_ctx, interaction) => `/interaction/${interaction.uid}`,
    },
    clientBasedCORS: (_ctx, requestedOrigin, client) =>
      client.redirectUris.some(
        (uri) => new URL(uri).origin === requestedOrigin,
      ),
    findAccount: async (_ctx, id) => {
      const user = store.get("users", id);
      if (!user || user.status !== "active") return undefined;
      return {
        accountId: id,
        claims: async () => ({
          sub: id,
          name: user.name,
          preferred_username: user.email.split("@")[0],
          email: user.email,
          email_verified: true,
        }),
      };
    },
    renderError: async (ctx, out) => {
      ctx.type = "html";
      ctx.body = layout(
        `<h1>无法完成认证</h1><p>${escape(out.error_description || out.error)}</p><a href="/">返回管理控制台 →</a>`,
        "认证请求失败",
      );
    },
  });
  // Endpoint URLs must use the configured issuer behind the local Vite proxy.
  // Forwarding headers are overwritten below, never trusted from the caller.
  provider.proxy = true;
  const app = express();
  app.disable("x-powered-by");
  const allowedHosts = new Set([
    new URL(origin).host,
    `localhost:${port}`,
    `127.0.0.1:${port}`,
  ]);
  app.use((req, res, next) => {
    res.set({
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "same-origin",
      "X-Frame-Options": "DENY",
    });
    if (!allowedHosts.has(req.headers.host))
      return res.status(403).json({ error: "仅允许本地演示域名访问" });
    req.headers["x-forwarded-host"] = new URL(issuer).host;
    req.headers["x-forwarded-proto"] = new URL(issuer).protocol.slice(0, -1);
    if (req.path.startsWith("/api") || req.path.startsWith("/interaction")) {
      res.set("Cache-Control", "no-store");
      const requestOrigin = req.headers.origin;
      if (requestOrigin && requestOrigin !== origin)
        return res.status(403).json({ error: "请求来源不受信任" });
    }
    next();
  });
  app.use("/api", express.json({ limit: "32kb" }));
  app.use("/api", (req, res, next) => {
    if (
      !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
      !req.is("application/json")
    )
      return res.status(415).json({ error: "管理接口要求 application/json" });
    next();
  });
  function audit({
    user = "林知远",
    email = "admin@acme.com",
    app: application = "管理控制台",
    action,
    status = "success",
    ip = "127.0.0.1",
  }) {
    store.put("events", {
      id: randomUUID(),
      user,
      email,
      app: application,
      action,
      status,
      ip,
      location: "本地 · 演示环境",
      time: new Date().toISOString(),
      demo: false,
    });
  }
  const safeUser = ({ passwordHash, ...user }) => user;
  const safeSettings = () => {
    const { id, ...value } = settings();
    return value;
  };
  app.get("/api/health", (_req, res) =>
    res.json({ status: "ok", mode: "local-demo", issuer }),
  );
  app.get("/api/bootstrap", (_req, res) =>
    res.json({
      apps: store.all("apps"),
      users: store.all("users").map(safeUser),
      events: store
        .all("events")
        .sort((a, b) => b.time.localeCompare(a.time))
        .slice(0, 200),
      settings: safeSettings(),
    }),
  );
  function text(value, label, max = 120) {
    if (typeof value !== "string" || !value.trim() || value.length > max)
      throw Object.assign(
        new Error(`${label}不能为空，且长度不能超过 ${max}`),
        { status: 400 },
      );
    return value.trim();
  }
  function redirect(value) {
    let url;
    try {
      url = new URL(text(value, "回调地址", 2048));
    } catch {
      throw Object.assign(new Error("请输入有效的完整回调地址"), {
        status: 400,
      });
    }
    if (
      url.hash ||
      url.username ||
      url.password ||
      !["https:", "http:"].includes(url.protocol) ||
      (url.protocol === "http:" &&
        !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))
    )
      throw Object.assign(
        new Error(
          "回调地址必须使用 HTTPS；本机地址允许 HTTP，且不能包含片段或凭据",
        ),
        { status: 400 },
      );
    return url.href;
  }
  app.post("/api/apps", async (req, res) => {
    if (req.body.protocol && req.body.protocol !== "OIDC")
      return res.status(400).json({ error: "本地演示当前支持 OIDC 协议" });
    const name = text(req.body.name, "应用名称", 80);
    const clientId = `nexus-${randomBytes(6).toString("hex")}`;
    const application = {
      id: randomUUID(),
      name,
      description: String(req.body.description || "").slice(0, 240),
      clientId,
      protocol: "OIDC",
      status: "active",
      users: 0,
      icon: "layers",
      color: "#578974",
      redirectUri: redirect(req.body.redirectUri),
      createdAt: new Date().toISOString(),
    };
    await provider.Client.validate({
      client_id: clientId,
      redirect_uris: [application.redirectUri],
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code"],
      response_types: ["code"],
    });
    store.put("apps", application);
    audit({ action: `创建应用：${name}` });
    res.status(201).json(application);
  });
  app.patch("/api/apps/:id", async (req, res) => {
    const application = store.get("apps", req.params.id);
    if (!application) return res.status(404).json({ error: "应用不存在" });
    const change = {};
    if ("name" in req.body) change.name = text(req.body.name, "应用名称", 80);
    if ("description" in req.body)
      change.description = String(req.body.description).slice(0, 240);
    if ("redirectUri" in req.body)
      change.redirectUri = redirect(req.body.redirectUri);
    if ("status" in req.body) {
      if (!["active", "inactive"].includes(req.body.status))
        return res.status(400).json({ error: "无效的应用状态" });
      change.status = req.body.status;
    }
    const updated = { ...application, ...change };
    await provider.Client.validate({
      client_id: updated.clientId,
      redirect_uris: [updated.redirectUri],
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code"],
      response_types: ["code"],
    });
    store.put("apps", updated);
    if (updated.status === "inactive")
      store.db
        .prepare("DELETE FROM oidc WHERE json_extract(payload,'$.clientId')=?")
        .run(updated.clientId);
    audit({ action: `更新应用：${updated.name}` });
    res.json(updated);
  });
  app.post("/api/users", (req, res) => {
    const name = text(req.body.name, "姓名", 80),
      email = text(req.body.email, "邮箱", 180).toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      return res.status(400).json({ error: "请输入有效的邮箱地址" });
    if (store.all("users").some((user) => user.email === email))
      return res.status(409).json({ error: "该邮箱已存在" });
    if (
      typeof req.body.password !== "string" ||
      req.body.password.length < settings().passwordMinLength ||
      req.body.password.length > 128
    )
      return res
        .status(400)
        .json({
          error: `初始密码长度须为 ${settings().passwordMinLength}–128 位`,
        });
    if (!["管理员", "成员"].includes(req.body.role || "成员"))
      return res.status(400).json({ error: "无效的用户角色" });
    const user = {
      id: randomUUID(),
      name,
      email,
      department: String(req.body.department || "未分配").slice(0, 80),
      role: req.body.role || "成员",
      status: "active",
      avatar: name.slice(0, 1),
      lastLogin: null,
      passwordHash: hashPassword(req.body.password),
    };
    store.put("users", user);
    audit({ action: `创建用户：${name}` });
    res.status(201).json(safeUser(user));
  });
  app.patch("/api/users/:id", (req, res) => {
    const user = store.get("users", req.params.id);
    if (!user) return res.status(404).json({ error: "用户不存在" });
    if (!["active", "inactive"].includes(req.body.status))
      return res.status(400).json({ error: "无效的用户状态" });
    if (user.id === "user-admin" && req.body.status === "inactive")
      return res.status(400).json({ error: "不能停用内置演示管理员" });
    user.status = req.body.status;
    store.put("users", user);
    if (user.status === "inactive")
      store.db
        .prepare("DELETE FROM oidc WHERE json_extract(payload,'$.accountId')=?")
        .run(user.id);
    audit({
      action: `${user.status === "active" ? "启用" : "停用"}用户：${user.name}`,
    });
    res.json(safeUser(user));
  });
  app.patch("/api/settings", (req, res) => {
    const next = { ...settings() };
    if ("sessionTimeout" in req.body) {
      const value = req.body.sessionTimeout;
      if (!Number.isInteger(value) || value < 5 || value > 1440)
        return res.status(400).json({ error: "会话时长必须为 5–1440 分钟" });
      next.sessionTimeout = value;
    }
    if ("passwordMinLength" in req.body) {
      const value = req.body.passwordMinLength;
      if (!Number.isInteger(value) || value < 8 || value > 64)
        return res.status(400).json({ error: "密码最小长度必须为 8–64 位" });
      next.passwordMinLength = value;
    }
    if (req.body.allowRegistration === true)
      return res
        .status(400)
        .json({ error: "本地演示不开放自助注册，请通过用户管理创建账号" });
    store.put("settings", next);
    audit({ action: "更新安全策略" });
    res.json(safeSettings());
  });
  const csrf = (uid) =>
    createHmac("sha256", keys.cookieKey).update(uid).digest("base64url");
  const form = express.urlencoded({ extended: false, limit: "8kb" });
  const rateLimit = new Map();
  async function details(req, res) {
    return provider.interactionDetails(req, res);
  }
  async function validInteraction(req, res) {
    const detail = await details(req, res);
    const expected = Buffer.from(csrf(detail.uid)),
      actual = Buffer.from(String(req.body.csrf || ""));
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected))
      throw Object.assign(new Error("表单已失效，请重新登录"), { status: 403 });
    return detail;
  }
  app.get("/interaction/:uid", async (req, res) => {
    const detail = await details(req, res),
      application = store
        .all("apps")
        .find(
          (a) =>
            a.clientId === detail.params.client_id && a.status === "active",
        );
    if (!application)
      return res
        .status(400)
        .send(layout('<h1>应用已停用</h1><a href="/">返回控制台</a>'));
    res.set(
      "Content-Security-Policy",
      "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
    );
    if (detail.prompt.name === "login")
      return res.send(
        loginPage({
          uid: detail.uid,
          app: application.name,
          csrf: csrf(detail.uid),
        }),
      );
    if (detail.prompt.name === "consent") {
      const user = store.get("users", detail.session.accountId);
      if (!user || user.status !== "active")
        return res.status(403).send(layout("<h1>账号不可用</h1>"));
      return res.send(
        consentPage({
          uid: detail.uid,
          app: application.name,
          csrf: csrf(detail.uid),
          user,
          scopes: String(detail.params.scope || "").split(" "),
        }),
      );
    }
    res.status(400).send(layout("<h1>不支持的认证请求</h1>"));
  });
  app.post("/interaction/:uid/login", form, async (req, res) => {
    const detail = await validInteraction(req, res);
    if (detail.prompt.name !== "login")
      return res.status(400).send(layout("<h1>登录流程已过期</h1>"));
    const application = store
      .all("apps")
      .find(
        (a) => a.clientId === detail.params.client_id && a.status === "active",
      );
    if (!application)
      return res.status(403).send(layout("<h1>应用不可用</h1>"));
    const email =
      typeof req.body.email === "string"
        ? req.body.email.trim().toLowerCase()
        : "";
    const bucketKey = req.socket.remoteAddress + ":" + email;
    let bucket = rateLimit.get(bucketKey);
    if (!bucket || bucket.reset < Date.now())
      bucket = { attempts: 0, reset: Date.now() + 600000 };
    if (bucket.attempts >= 10)
      return res
        .status(429)
        .send(
          loginPage({
            uid: detail.uid,
            app: application.name,
            csrf: csrf(detail.uid),
            error: "尝试次数过多，请 10 分钟后重试",
          }),
        );
    bucket.attempts++;
    rateLimit.set(bucketKey, bucket);
    const user = store.all("users").find((u) => u.email === email);
    const password =
      typeof req.body.password === "string" ? req.body.password : "";
    const passwordMatches =
      password.length <= 128 &&
      verifyPassword(
        password,
        user?.passwordHash || store.get("users", "user-admin").passwordHash,
      );
    if (!user || !passwordMatches || user.status !== "active") {
      audit({
        user: user?.name || "未知用户",
        email: email.slice(0, 180),
        app: application.name,
        action: "登录失败",
        status: "failed",
      });
      return res
        .status(401)
        .send(
          loginPage({
            uid: detail.uid,
            app: application.name,
            csrf: csrf(detail.uid),
            error: "邮箱或密码错误，或账号已停用",
          }),
        );
    }
    rateLimit.delete(bucketKey);
    user.lastLogin = new Date().toISOString();
    store.put("users", user);
    audit({
      user: user.name,
      email: user.email,
      app: application.name,
      action: "登录成功",
    });
    await provider.interactionFinished(
      req,
      res,
      { login: { accountId: user.id, amr: ["pwd"] } },
      { mergeWithLastSubmission: false },
    );
  });
  app.post("/interaction/:uid/confirm", form, async (req, res) => {
    const detail = await validInteraction(req, res);
    if (detail.prompt.name !== "consent")
      return res.status(400).send(layout("<h1>授权流程已过期</h1>"));
    const user = store.get("users", detail.session.accountId),
      application = store
        .all("apps")
        .find((a) => a.clientId === detail.params.client_id);
    if (
      !user ||
      user.status !== "active" ||
      !application ||
      application.status !== "active"
    )
      return res.status(403).send(layout("<h1>账号或应用不可用</h1>"));
    let grant = detail.grantId
      ? await provider.Grant.find(detail.grantId)
      : undefined;
    if (!grant)
      grant = new provider.Grant({
        accountId: detail.session.accountId,
        clientId: detail.params.client_id,
      });
    const missing = detail.prompt.details;
    if (missing.missingOIDCScope)
      grant.addOIDCScope(missing.missingOIDCScope.join(" "));
    if (missing.missingOIDCClaims)
      grant.addOIDCClaims(missing.missingOIDCClaims);
    const grantId = await grant.save();
    audit({
      user: user.name,
      email: user.email,
      app: application.name,
      action: "应用授权",
    });
    await provider.interactionFinished(
      req,
      res,
      { consent: { grantId } },
      { mergeWithLastSubmission: true },
    );
  });
  app.post("/interaction/:uid/abort", form, async (req, res) => {
    await validInteraction(req, res);
    await provider.interactionFinished(
      req,
      res,
      { error: "access_denied", error_description: "用户取消了授权" },
      { mergeWithLastSubmission: false },
    );
  });
  app.use("/oidc", provider.callback());
  const dist = resolve(projectRoot, "dist");
  if (existsSync(dist)) {
    app.use(express.static(dist));
    app.get("/{*path}", (req, res, next) =>
      req.path.startsWith("/api")
        ? next()
        : res.sendFile(resolve(dist, "index.html")),
    );
  }
  app.use("/api", (_req, res) => res.status(404).json({ error: "接口不存在" }));
  app.use((err, req, res, _next) => {
    const status = err.status || err.statusCode || 500;
    if (status >= 500) console.error(err);
    const message = status >= 500 ? "服务暂时不可用，请稍后重试" : err.message;
    if (req.path.startsWith("/api"))
      return res.status(status).json({ error: message });
    res
      .status(status)
      .send(
        layout(
          `<h1>请求未完成</h1><p>${escape(message)}</p><a href="/">返回管理控制台</a>`,
        ),
      );
  });
  const cleanup = setInterval(() => {
    store.db
      .prepare("DELETE FROM oidc WHERE expires IS NOT NULL AND expires<?")
      .run(Math.floor(Date.now() / 1000));
    for (const [key, value] of rateLimit)
      if (value.reset < Date.now()) rateLimit.delete(key);
  }, 60000);
  cleanup.unref();
  return {
    app,
    provider,
    store,
    port,
    issuer,
    close() {
      clearInterval(cleanup);
      store.close();
    },
  };
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const service = await createServer();
  const server = service.app.listen(service.port, "127.0.0.1", () =>
    console.log(
      `Nexus API: http://127.0.0.1:${service.port} | OIDC issuer: ${service.issuer} | local demo only`,
    ),
  );
  for (const signal of ["SIGINT", "SIGTERM"])
    process.on(signal, () =>
      server.close(() => {
        service.close();
        process.exit(0);
      }),
    );
}
