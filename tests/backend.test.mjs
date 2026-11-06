import { test, before, after } from "node:test";
import { request as httpRequest } from "node:http";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash, randomBytes } from "node:crypto";
import { createLocalJWKSet, jwtVerify } from "jose";
import { createServer } from "../server/index.mjs";

// Avoid sharing pooled sockets across the deliberate restart in the persistence test.
const fetch = (url, options = {}) =>
  globalThis.fetch(url, {
    ...options,
    headers: { Connection: "close", ...options.headers },
  });
let service, server, origin, discovery, folder;
before(async () => {
  const port = 22000 + Math.floor(Math.random() * 15000);
  origin = `http://127.0.0.1:${port}`;
  folder = mkdtempSync(join(tmpdir(), "nexus-test-"));
  service = await createServer({
    port,
    issuer: `${origin}/oidc`,
    dataDir: folder,
  });
  server = await new Promise((resolve) => {
    const listener = service.app.listen(port, "127.0.0.1", () =>
      resolve(listener),
    );
  });
  discovery = await (
    await fetch(`${origin}/oidc/.well-known/openid-configuration`)
  ).json();
});
after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  service?.close();
  if (folder) rmSync(folder, { recursive: true, force: true });
});

function browser() {
  const cookies = new Map();
  return async (url, options = {}) => {
    const response = await fetch(new URL(url, origin), {
      ...options,
      redirect: "manual",
      headers: {
        ...(cookies.size
          ? {
              Cookie: [...cookies]
                .map(([name, value]) => `${name}=${value}`)
                .join("; "),
            }
          : {}),
        ...options.headers,
      },
    });
    for (const cookie of response.headers.getSetCookie()) {
      const [pair] = cookie.split(";"),
        index = pair.indexOf("=");
      cookies.set(pair.slice(0, index), pair.slice(index + 1));
    }
    return response;
  };
}
function authorizationUrl({
  verifier = randomBytes(32).toString("base64url"),
  clientId = "nexus-demo",
  redirectUri = `${origin}/callback`,
  ...extra
} = {}) {
  const nonce = randomBytes(20).toString("base64url"),
    state = randomBytes(20).toString("base64url");
  const url = new URL(discovery.authorization_endpoint);
  url.search = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    redirect_uri: redirectUri,
    scope: "openid profile email",
    state,
    nonce,
    code_challenge: createHash("sha256").update(verifier).digest("base64url"),
    code_challenge_method: "S256",
    ...extra,
  }).toString();
  return { url, verifier, nonce, state };
}
async function follow(request, response) {
  for (
    let i = 0;
    i < 10 && response.status >= 300 && response.status < 400;
    i++
  ) {
    const location = new URL(response.headers.get("location"), origin);
    if (location.pathname === "/callback")
      return { callback: location, response };
    response = await request(location);
  }
  return { response };
}
async function authorize({
  email = "admin@acme.com",
  password = "Demo@2026!",
  ...params
} = {}) {
  const request = browser(),
    authorization = authorizationUrl(params);
  let { response } = await follow(request, await request(authorization.url));
  assert.equal(response.status, 200);
  let html = await response.text();
  let action = html.match(/action="([^"]+\/login)"/)?.[1];
  assert.ok(action, "login form shown");
  let csrf = html.match(/name="csrf" value="([^"]+)"/)?.[1];
  let result = await follow(
    request,
    await request(action, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        Origin: origin,
      },
      body: new URLSearchParams({ csrf, email, password }),
    }),
  );
  if (result.callback) return { ...authorization, ...result, request };
  response = result.response;
  if (response.status !== 200) return { ...authorization, response, request };
  html = await response.text();
  action = html.match(/action="([^"]+\/confirm)"/)?.[1];
  assert.ok(action, "consent form shown");
  csrf = html.match(/name="csrf" value="([^"]+)"/)?.[1];
  result = await follow(
    request,
    await request(action, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        Origin: origin,
      },
      body: new URLSearchParams({ csrf }),
    }),
  );
  return { ...authorization, ...result, request };
}
async function exchange(auth, verifier = auth.verifier) {
  return fetch(discovery.token_endpoint, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: "nexus-demo",
      grant_type: "authorization_code",
      code: auth.callback.searchParams.get("code"),
      redirect_uri: `${origin}/callback`,
      code_verifier: verifier,
    }),
  });
}
async function api(path, method = "GET", body, headers = {}) {
  return fetch(`${origin}/api${path}`, {
    method,
    headers: { "content-type": "application/json", Origin: origin, ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
}

test("discovery advertises persisted RS256 keys and PKCE S256 only", async () => {
  assert.equal(discovery.issuer, `${origin}/oidc`);
  assert.deepEqual(discovery.code_challenge_methods_supported, ["S256"]);
  assert.deepEqual(discovery.response_types_supported, ["code"]);
  assert.deepEqual(discovery.grant_types_supported, ["authorization_code"]);
  const jwks = await (await fetch(discovery.jwks_uri)).json();
  assert.equal(jwks.keys.length, 1);
  assert.ok(jwks.keys[0].kid);
  assert.equal(jwks.keys[0].d, undefined);
  const snapshot = await (await api("/bootstrap")).json();
  assert.equal(snapshot.apps.length, 6);
  assert.equal(snapshot.users.length, 8);
  assert.equal(snapshot.events.length, 36);
  assert.equal(snapshot.users[0].passwordHash, undefined);
});
test("authorization-code + PKCE issues verifiable ID token and UserInfo; code is single-use", async () => {
  const auth = await authorize();
  assert.equal(auth.callback.searchParams.get("state"), auth.state);
  assert.ok(auth.callback.searchParams.get("code"));
  const result = await exchange(auth);
  assert.equal(result.status, 200);
  const tokens = await result.json();
  const jwks = await (await fetch(discovery.jwks_uri)).json();
  const { payload } = await jwtVerify(
    tokens.id_token,
    createLocalJWKSet(jwks),
    { issuer: discovery.issuer, audience: "nexus-demo", algorithms: ["RS256"] },
  );
  assert.equal(payload.sub, "user-admin");
  assert.equal(payload.nonce, auth.nonce);
  const response = await fetch(discovery.userinfo_endpoint, {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });
  assert.equal(response.status, 200);
  const info = await response.json();
  assert.equal(info.email, "admin@acme.com");
  const replay = await exchange(auth);
  assert.equal(replay.status, 400);
  assert.equal((await replay.json()).error, "invalid_grant");
});
test("PKCE rejects incorrect verifier", async () => {
  const auth = await authorize();
  const response = await exchange(auth, randomBytes(32).toString("base64url"));
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error, "invalid_grant");
});
test("unregistered redirect URI and absent PKCE cannot authorize", async () => {
  const bad = authorizationUrl({
    redirectUri: "https://evil.example/callback",
  });
  let response = await fetch(bad.url, { redirect: "manual" });
  assert.equal(response.status, 400);
  assert.equal(response.headers.get("location"), null);
  const missing = authorizationUrl();
  missing.url.searchParams.delete("code_challenge");
  missing.url.searchParams.delete("code_challenge_method");
  response = await fetch(missing.url, { redirect: "manual" });
  assert.ok([303, 302, 400].includes(response.status));
  if (response.headers.get("location"))
    assert.equal(
      new URL(response.headers.get("location")).searchParams.get("error"),
      "invalid_request",
    );
});
test("incorrect password and disabled users are rejected", async () => {
  const bad = await authorize({ password: "wrongpassword" });
  assert.equal(bad.response.status, 401);
  const disabled = await authorize({ email: "jianing.xu@acme.com" });
  assert.equal(disabled.response.status, 401);
});
test("local management blocks CSRF and invalid input; created OIDC apps have active metadata", async () => {
  let response = await api(
    "/apps",
    "POST",
    { name: "CSRF", redirectUri: `${origin}/callback` },
    { Origin: "https://evil.example" },
  );
  assert.equal(response.status, 403);
  response = await fetch(`${origin}/api/apps`, {
    method: "POST",
    headers: { "content-type": "text/plain" },
    body: "{}",
  });
  assert.equal(response.status, 415);
  response = await api("/apps", "POST", {
    name: "Invalid",
    redirectUri: "javascript:alert(1)",
  });
  assert.equal(response.status, 400);
  response = await api("/apps", "POST", {
    name: "集成测试应用",
    redirectUri: `${origin}/callback`,
  });
  assert.equal(response.status, 201);
  const application = await response.json();
  assert.ok(await service.provider.Client.find(application.clientId));
  response = await api(`/apps/${application.id}`, "PATCH", {
    status: "inactive",
  });
  assert.equal(response.status, 200);
  assert.equal(
    await service.provider.Client.find(application.clientId),
    undefined,
  );
});
test("new users obey password policy and can sign in; disabling revokes access tokens", async () => {
  const body = {
    name: "测试用户",
    email: "tester@acme.com",
    department: "测试部",
    role: "成员",
    password: "StrongTest@2026",
  };
  let response = await api("/users", "POST", { ...body, password: "short" });
  assert.equal(response.status, 400);
  response = await api("/users", "POST", body);
  assert.equal(response.status, 201);
  const user = await response.json();
  assert.equal(user.passwordHash, undefined);
  const auth = await authorize({ email: body.email, password: body.password });
  response = await exchange(auth);
  assert.equal(response.status, 200);
  const tokens = await response.json();
  response = await api(`/users/${user.id}`, "PATCH", { status: "inactive" });
  assert.equal(response.status, 200);
  response = await fetch(discovery.userinfo_endpoint, {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });
  assert.equal(response.status, 401);
});
test("interaction form rejects invalid CSRF token", async () => {
  const request = browser();
  const { url } = authorizationUrl();
  const { response } = await follow(request, await request(url));
  const html = await response.text();
  const action = html.match(/action="([^"]+\/login)"/)[1];
  const result = await request(action, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      csrf: "forged",
      email: "admin@acme.com",
      password: "Demo@2026!",
    }),
  });
  assert.equal(result.status, 403);
  const unicode = await request(action, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      csrf: "汉".repeat(43),
      email: "admin@acme.com",
      password: "Demo@2026!",
    }),
  });
  assert.equal(unicode.status, 403);
});
test("trusted host protection rejects DNS rebinding and session changes constrain new sessions", async () => {
  const status = await new Promise((resolve, reject) => {
    const request = httpRequest(
      `${origin}/api/bootstrap`,
      { headers: { Host: "evil.example" } },
      (response) => {
        response.resume();
        resolve(response.statusCode);
      },
    );
    request.on("error", reject);
    request.end();
  });
  assert.equal(status, 403);
  let changed = await api("/settings", "PATCH", {
    sessionTimeout: 30,
    passwordMinLength: 14,
  });
  assert.equal(changed.status, 200);
  const values = await changed.json();
  assert.equal(values.sessionTimeout, 30);
  assert.equal(values.passwordMinLength, 14);
  changed = await api("/settings", "PATCH", { sessionTimeout: -1 });
  assert.equal(changed.status, 400);
  changed = await api("/settings", "PATCH", { allowRegistration: true });
  assert.equal(changed.status, 400);
  await api("/settings", "PATCH", {
    sessionTimeout: 120,
    passwordMinLength: 12,
  });
});
test("OIDC signing keys, granted sessions, and access tokens survive a server restart", async () => {
  const auth = await authorize();
  const tokenResponse = await exchange(auth);
  assert.equal(tokenResponse.status, 200);
  const tokens = await tokenResponse.json();
  const oldKeys = await (await fetch(discovery.jwks_uri)).json();
  await new Promise((resolve) => server.close(resolve));
  service.close();
  await new Promise((resolve) => setImmediate(resolve));
  service = await createServer({
    port: Number(new URL(origin).port),
    issuer: `${origin}/oidc`,
    dataDir: folder,
  });
  server = await new Promise((resolve) => {
    const listener = service.app.listen(service.port, "127.0.0.1", () =>
      resolve(listener),
    );
  });
  const newKeys = await (await fetch(discovery.jwks_uri)).json();
  assert.deepEqual(newKeys, oldKeys);
  const userinfo = await fetch(discovery.userinfo_endpoint, {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });
  assert.equal(userinfo.status, 200);
  const next = authorizationUrl({ prompt: "none" });
  const result = await follow(auth.request, await auth.request(next.url));
  assert.ok(result.callback);
  assert.ok(result.callback.searchParams.get("code"));
  assert.equal(result.callback.searchParams.get("error"), null);
});

test("reverse-proxied requests keep every public endpoint on the configured issuer origin", async () => {
  const port = 38000 + Math.floor(Math.random() * 5000);
  const proxyOrigin = "http://localhost:5173";
  const dataDir = mkdtempSync(join(tmpdir(), "nexus-proxy-test-"));
  const proxied = await createServer({
    port,
    issuer: `${proxyOrigin}/oidc`,
    dataDir,
  });
  const listener = await new Promise((resolve) => {
    const listening = proxied.app.listen(port, "127.0.0.1", () =>
      resolve(listening),
    );
  });
  async function discover(host) {
    return new Promise((resolve, reject) => {
      const request = httpRequest(
        `http://127.0.0.1:${port}/oidc/.well-known/openid-configuration`,
        {
          headers: {
            Host: host,
            "X-Forwarded-Host": "evil.example",
            "X-Forwarded-Proto": "https",
          },
        },
        (response) => {
          const chunks = [];
          response.on("data", (chunk) => chunks.push(chunk));
          response.on("end", () => {
            try {
              resolve({
                status: response.statusCode,
                document: JSON.parse(Buffer.concat(chunks).toString()),
              });
            } catch (error) {
              reject(error);
            }
          });
        },
      );
      request.on("error", reject);
      request.end();
    });
  }
  try {
    // Both a correctly preserved Host and Vite's string-proxy rewritten Host must be safe.
    for (const host of ["localhost:5173", `127.0.0.1:${port}`]) {
      const { status, document } = await discover(host);
      assert.equal(status, 200);
      assert.equal(document.issuer, `${proxyOrigin}/oidc`);
      for (const [key, value] of Object.entries(document)) {
        if (key.endsWith("_endpoint") || key === "jwks_uri")
          assert.equal(
            new URL(value).origin,
            proxyOrigin,
            `${key} uses external origin`,
          );
      }
    }
  } finally {
    await new Promise((resolve) => listener.close(resolve));
    proxied.close();
    rmSync(dataDir, { recursive: true, force: true });
  }
});
