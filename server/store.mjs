import { DatabaseSync } from "node:sqlite";
import { mkdirSync, chmodSync } from "node:fs";
import { join } from "node:path";
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

export function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
}
export function verifyPassword(password, stored) {
  const [salt, hash] = stored.split(":");
  const actual = scryptSync(password, salt, 64);
  return timingSafeEqual(actual, Buffer.from(hash, "hex"));
}

export function openStore(directory) {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const filename = join(directory, "nexus.sqlite");
  const db = new DatabaseSync(filename);
  chmodSync(filename, 0o600);
  db.exec(`PRAGMA journal_mode=WAL;
    CREATE TABLE IF NOT EXISTS documents (kind TEXT NOT NULL, id TEXT NOT NULL, value TEXT NOT NULL, PRIMARY KEY(kind,id));
    CREATE TABLE IF NOT EXISTS oidc (kind TEXT NOT NULL, id TEXT NOT NULL, payload TEXT NOT NULL, expires INTEGER, PRIMARY KEY(kind,id));
    CREATE INDEX IF NOT EXISTS oidc_expiry ON oidc(expires);`);
  const get = db.prepare("SELECT value FROM documents WHERE kind=? AND id=?");
  const all = db.prepare(
    "SELECT value FROM documents WHERE kind=? ORDER BY rowid",
  );
  const put = db.prepare(
    "INSERT INTO documents(kind,id,value) VALUES(?,?,?) ON CONFLICT(kind,id) DO UPDATE SET value=excluded.value",
  );
  const store = {
    db,
    get(kind, id) {
      const row = get.get(kind, id);
      return row ? JSON.parse(row.value) : undefined;
    },
    all(kind) {
      return all.all(kind).map((row) => JSON.parse(row.value));
    },
    put(kind, value) {
      put.run(kind, value.id, JSON.stringify(value));
      return value;
    },
    remove(kind, id) {
      db.prepare("DELETE FROM documents WHERE kind=? AND id=?").run(kind, id);
    },
    close() {
      db.close();
    },
  };
  return store;
}

export function adapterFor(store) {
  return class SQLiteAdapter {
    constructor(name) {
      this.name = name;
    }
    async upsert(id, payload, expiresIn) {
      store.db
        .prepare(
          "INSERT INTO oidc(kind,id,payload,expires) VALUES(?,?,?,?) ON CONFLICT(kind,id) DO UPDATE SET payload=excluded.payload,expires=excluded.expires",
        )
        .run(
          this.name,
          id,
          JSON.stringify(payload),
          expiresIn ? Math.floor(Date.now() / 1000) + expiresIn : null,
        );
    }
    async find(id) {
      if (this.name === "Client") {
        const app = store
          .all("apps")
          .find((app) => app.clientId === id && app.status === "active");
        if (!app) return undefined;
        return {
          client_id: app.clientId,
          client_name: app.name,
          redirect_uris: [app.redirectUri],
          post_logout_redirect_uris: [new URL(app.redirectUri).origin + "/"],
          grant_types: ["authorization_code"],
          response_types: ["code"],
          token_endpoint_auth_method: "none",
          application_type: "web",
        };
      }
      const row = store.db
        .prepare("SELECT payload,expires FROM oidc WHERE kind=? AND id=?")
        .get(this.name, id);
      if (!row || (row.expires && row.expires <= Date.now() / 1000))
        return undefined;
      const payload = JSON.parse(row.payload);
      if (payload.accountId) {
        const account = store.get("users", payload.accountId);
        if (!account || account.status !== "active") return undefined;
      }
      if (payload.clientId) {
        const app = store
          .all("apps")
          .find((app) => app.clientId === payload.clientId);
        if (!app || app.status !== "active") return undefined;
      }
      return payload;
    }
    async findBy(field, value) {
      const row = store.db
        .prepare(
          "SELECT id FROM oidc WHERE kind=? AND json_extract(payload,?)=? AND (expires IS NULL OR expires>?)",
        )
        .get(this.name, `$.${field}`, value, Math.floor(Date.now() / 1000));
      return row ? this.find(row.id) : undefined;
    }
    async findByUid(uid) {
      return this.findBy("uid", uid);
    }
    async findByUserCode(userCode) {
      return this.findBy("userCode", userCode);
    }
    async destroy(id) {
      store.db
        .prepare("DELETE FROM oidc WHERE kind=? AND id=?")
        .run(this.name, id);
    }
    async consume(id) {
      store.db
        .prepare(
          "UPDATE oidc SET payload=json_set(payload,'$.consumed',?) WHERE kind=? AND id=?",
        )
        .run(Math.floor(Date.now() / 1000), this.name, id);
    }
    async revokeByGrantId(grantId) {
      store.db
        .prepare("DELETE FROM oidc WHERE json_extract(payload,'$.grantId')=?")
        .run(grantId);
    }
  };
}

export function seed(store, origin) {
  if (store.get("meta", "seeded")) return;
  store.put("settings", {
    id: "settings",
    sessionTimeout: 120,
    passwordMinLength: 12,
    allowRegistration: false,
  });
  const people = [
    ["user-admin", "林知远", "admin@acme.com", "研发中心", "管理员", "林"],
    ["user-chen", "陈思远", "siyuan.chen@acme.com", "产品设计部", "成员", "陈"],
    ["user-wang", "王晓晨", "xiaochen.wang@acme.com", "研发中心", "成员", "王"],
    ["user-li", "李沐晴", "muqing.li@acme.com", "人力资源部", "成员", "李"],
    ["user-zhou", "周予安", "yuan.zhou@acme.com", "财务中心", "成员", "周"],
    ["user-zhao", "赵一鸣", "yiming.zhao@acme.com", "研发中心", "成员", "赵"],
    ["user-sun", "孙悦", "yue.sun@acme.com", "市场营销部", "成员", "孙"],
    ["user-xu", "许嘉宁", "jianing.xu@acme.com", "运营管理部", "成员", "许"],
  ];
  people.forEach(([id, name, email, department, role, avatar], i) =>
    store.put("users", {
      id,
      name,
      email,
      department,
      role,
      avatar,
      status: i === 7 ? "inactive" : "active",
      lastLogin: new Date(Date.now() - i * 840000).toISOString(),
      passwordHash: hashPassword("Demo@2026!"),
    }),
  );
  [
    [
      "app-workspace",
      "企业工作台",
      "团队协作与日常办公，一站式工作入口",
      "nexus-demo",
      "layers",
      "#5584ee",
      1248,
    ],
    [
      "app-gitlab",
      "GitLab",
      "代码托管、持续集成与研发效能管理",
      "nexus-gitlab",
      "code",
      "#ed8b50",
      386,
    ],
    [
      "app-notion",
      "知识空间",
      "让知识流动，让团队高效协作",
      "nexus-notion",
      "message",
      "#555e70",
      892,
    ],
    [
      "app-hr",
      "人事管理系统",
      "员工全生命周期与组织人事管理",
      "nexus-hr",
      "briefcase",
      "#9b76df",
      1248,
    ],
    [
      "app-bi",
      "数据分析平台",
      "数据洞察与业务增长的决策中心",
      "nexus-bi",
      "chart",
      "#35a78c",
      264,
    ],
    [
      "app-finance",
      "财务中心",
      "费用报销、预算管理与财务协作",
      "nexus-finance",
      "cloud",
      "#d9a345",
      168,
    ],
  ].forEach(([id, name, description, clientId, icon, color, users], i) =>
    store.put("apps", {
      id,
      name,
      description,
      clientId,
      icon,
      color,
      users,
      protocol: "OIDC",
      status: i === 5 ? "inactive" : "active",
      redirectUri: `${origin}/callback`,
      createdAt: new Date(Date.now() - (45 - i * 4) * 86400000).toISOString(),
    }),
  );
  const apps = store.all("apps");
  for (let i = 0; i < 36; i++) {
    const person = people[i % people.length];
    const failed = i === 3 || i === 12 || i === 21;
    store.put("events", {
      id: `event-seed-${i}`,
      user: person[1],
      email: person[2],
      app: apps[i % 5].name,
      action: failed ? "登录失败" : "登录成功",
      ip: `192.168.${(i % 3) + 1}.${104 + i}`,
      location: ["上海 · 中国", "北京 · 中国", "杭州 · 中国"][i % 3],
      status: failed ? "failed" : "success",
      time: new Date(Date.now() - i * 217000).toISOString(),
      demo: true,
    });
  }
  store.put("meta", { id: "seeded", version: 1 });
}
