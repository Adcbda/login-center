import { useEffect, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronRight,
  Code2,
  Copy,
  Fingerprint,
  Globe2,
  KeyRound,
  Loader2,
  LockKeyhole,
  Play,
  RefreshCw,
  ShieldCheck,
  Terminal,
  XCircle,
} from "lucide-react";
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";
import "./oidc.css";

type Discovery = {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  userinfo_endpoint: string;
  jwks_uri: string;
  end_session_endpoint?: string;
};
type Transaction = {
  verifier: string;
  state: string;
  nonce: string;
  createdAt: number;
  redirectUri: string;
};
type LoginResult = {
  claims: JWTPayload;
  profile: Record<string, unknown>;
  expiresIn: number;
  algorithm: string;
  scope: string;
};
const transactionKey = "nexus.oidc.transaction";
const clientId = "nexus-demo";
const issuer = () => `${window.location.origin}/oidc`;

async function readDiscovery(): Promise<Discovery> {
  const response = await fetch(`${issuer()}/.well-known/openid-configuration`);
  if (!response.ok)
    throw new Error("无法连接身份认证服务，请检查后端是否启动。");
  const discovery = (await response.json()) as Discovery;
  if (discovery.issuer !== issuer())
    throw new Error("服务返回的 Issuer 与当前站点不匹配。");
  for (const endpoint of [
    discovery.authorization_endpoint,
    discovery.token_endpoint,
    discovery.userinfo_endpoint,
    discovery.jwks_uri,
  ]) {
    if (!endpoint || new URL(endpoint).origin !== window.location.origin)
      throw new Error("认证服务端点不属于当前站点。");
  }
  return discovery;
}

function randomValue(bytes = 32) {
  const values = crypto.getRandomValues(new Uint8Array(bytes));
  return btoa(String.fromCharCode(...values))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

async function beginLogin() {
  const discovery = await readDiscovery();
  const verifier = randomValue();
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(verifier),
  );
  const challenge = btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
  const transaction: Transaction = {
    verifier,
    state: randomValue(),
    nonce: randomValue(),
    createdAt: Date.now(),
    redirectUri: `${window.location.origin}/callback`,
  };
  sessionStorage.setItem(transactionKey, JSON.stringify(transaction));
  const url = new URL(discovery.authorization_endpoint);
  url.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: transaction.redirectUri,
    response_type: "code",
    scope: "openid profile email",
    state: transaction.state,
    nonce: transaction.nonce,
    code_challenge: challenge,
    code_challenge_method: "S256",
    prompt: "login",
  }).toString();
  window.location.assign(url);
}

async function finishLogin(): Promise<LoginResult> {
  const params = new URLSearchParams(window.location.search);
  const stored = sessionStorage.getItem(transactionKey);
  if (!stored)
    throw new Error(
      "未找到登录事务，可能已完成或已过期。请返回实验室重新开始。",
    );
  const transaction: Transaction = JSON.parse(stored);
  sessionStorage.removeItem(transactionKey);
  if (!params.get("state") || params.get("state") !== transaction.state)
    throw new Error("登录状态校验失败（state 不匹配），已终止本次登录。");
  if (Date.now() - transaction.createdAt > 10 * 60 * 1000)
    throw new Error("登录请求已超过 10 分钟，请重新开始。");
  if (params.has("error"))
    throw new Error(
      params.get("error") === "access_denied"
        ? "你已取消本次授权，可随时重新开始。"
        : `身份服务拒绝了请求：${params.get("error")}`,
    );
  const code = params.get("code");
  if (!code) throw new Error("回调中没有授权码。");
  const discovery = await readDiscovery();
  const tokenResponse = await fetch(discovery.token_endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      client_id: clientId,
      redirect_uri: transaction.redirectUri,
      code_verifier: transaction.verifier,
    }),
  });
  const tokens = await tokenResponse.json();
  if (!tokenResponse.ok || !tokens.id_token || !tokens.access_token)
    throw new Error(`授权码兑换失败：${tokens.error || "未返回完整 Token"}`);
  if (String(tokens.token_type).toLowerCase() !== "bearer")
    throw new Error("返回了不支持的访问令牌类型。");
  const { payload, protectedHeader } = await jwtVerify(
    tokens.id_token,
    createRemoteJWKSet(new URL(discovery.jwks_uri)),
    {
      issuer: discovery.issuer,
      audience: clientId,
      algorithms: ["RS256", "PS256", "ES256"],
      requiredClaims: ["exp", "iat", "sub", "nonce"],
      maxTokenAge: "10m",
    },
  );
  if (payload.nonce !== transaction.nonce)
    throw new Error("ID Token 的 nonce 校验失败。");
  if (payload.azp !== undefined && payload.azp !== clientId)
    throw new Error("ID Token 的授权方校验失败。");
  if (
    Array.isArray(payload.aud) &&
    payload.aud.length > 1 &&
    payload.azp !== clientId
  )
    throw new Error("ID Token 的授权方校验失败。");
  const profileResponse = await fetch(discovery.userinfo_endpoint, {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });
  if (!profileResponse.ok) throw new Error("用户信息端点返回失败。");
  const profile = await profileResponse.json();
  if (profile.sub !== payload.sub)
    throw new Error("用户信息与 ID Token 的 subject 不一致。");
  window.history.replaceState({}, "", window.location.pathname);
  return {
    claims: payload,
    profile,
    expiresIn: Number(tokens.expires_in) || 0,
    algorithm: protectedHeader.alg,
    scope: tokens.scope || "openid profile email",
  };
}

// Keep the single authorization-code exchange stable through React StrictMode remounts.
let callbackPromise: Promise<LoginResult> | undefined;

function CopyButton({
  value,
  label = "复制",
  notify,
}: {
  value: string;
  label?: string;
  notify?: (message: string) => void;
}) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      notify?.("已复制到剪贴板");
      setTimeout(() => setCopied(false), 1800);
    } catch {
      notify?.("复制失败，请手动选择文本复制");
    }
  };
  return (
    <button
      className="oidc-copy"
      type="button"
      onClick={copy}
      aria-label={label}
      title={label}
    >
      {copied ? <Check size={15} /> : <Copy size={15} />}
    </button>
  );
}

export default function OidcLab({
  onNotify,
}: {
  onNotify?: (message: string) => void;
}) {
  const [discovery, setDiscovery] = useState<Discovery | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const load = () => {
    setError("");
    setLoading(true);
    readDiscovery()
      .then(setDiscovery)
      .catch((error) => setError(error.message))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);
  const start = async () => {
    setError("");
    setBusy(true);
    try {
      await beginLogin();
    } catch (error) {
      setError(error instanceof Error ? error.message : "无法开始登录");
      setBusy(false);
    }
  };
  const steps = [
    {
      icon: Globe2,
      title: "发起授权",
      description: "生成 state 与 PKCE challenge",
    },
    {
      icon: Fingerprint,
      title: "身份认证",
      description: "使用演示账号安全登录",
    },
    {
      icon: KeyRound,
      title: "兑换令牌",
      description: "授权码换取 ID / Access Token",
    },
    {
      icon: ShieldCheck,
      title: "验证身份",
      description: "校验签名并获取用户信息",
    },
  ];
  const endpoints = discovery
    ? [
        ["Issuer", discovery.issuer],
        ["Authorization", discovery.authorization_endpoint],
        ["Token", discovery.token_endpoint],
        ["UserInfo", discovery.userinfo_endpoint],
        ["JWKS", discovery.jwks_uri],
      ]
    : [];
  return (
    <div className="oidc-lab">
      <section className="oidc-intro">
        <div className="oidc-intro-icon">
          <Code2 size={25} />
        </div>
        <div>
          <div className="oidc-eyebrow">OPENID CONNECT PLAYGROUND</div>
          <h2>一次登录，验证完整认证链路</h2>
          <p>在隔离的演示环境中，体验标准 OIDC 授权码流程。</p>
        </div>
        <span className="oidc-chip">
          <ShieldCheck size={14} /> PKCE · S256
        </span>
      </section>
      <section className="oidc-flow" aria-label="OIDC 授权流程">
        {steps.map((step, index) => (
          <div className="oidc-flow-step" key={step.title}>
            <div className="oidc-step-top">
              <span className="oidc-step-icon">
                <step.icon size={19} />
              </span>
              <span className="oidc-step-number">0{index + 1}</span>
              {index < 3 && (
                <ChevronRight className="oidc-step-arrow" size={18} />
              )}
            </div>
            <h3>{step.title}</h3>
            <p>{step.description}</p>
          </div>
        ))}
      </section>
      {error && (
        <div className="oidc-error" role="alert">
          <XCircle size={18} />
          <span>{error}</span>
          <button type="button" onClick={load}>
            重新连接
          </button>
        </div>
      )}
      <div className="oidc-lab-grid">
        <section className="oidc-card">
          <div className="oidc-card-title">
            <div>
              <h3>登录测试</h3>
              <p>已为你配置好一个公开客户端</p>
            </div>
            <Play size={19} />
          </div>
          <div className="oidc-fields">
            <label>
              应用名称<span>Nexus 演示应用</span>
            </label>
            <label>
              Client ID
              <div className="oidc-code-field">
                <code>{clientId}</code>
                <CopyButton value={clientId} notify={onNotify} />
              </div>
            </label>
            <label>
              回调地址
              <div className="oidc-code-field">
                <code>{window.location.origin}/callback</code>
                <CopyButton
                  value={`${window.location.origin}/callback`}
                  notify={onNotify}
                />
              </div>
            </label>
            <label>
              请求范围
              <div className="oidc-scopes">
                {["openid", "profile", "email"].map((scope) => (
                  <code key={scope}>{scope}</code>
                ))}
              </div>
            </label>
          </div>
          <div className="oidc-account">
            <span className="oidc-account-icon">
              <LockKeyhole size={18} />
            </span>
            <div>
              <strong>内置演示账号</strong>
              <div>
                <code>admin@acme.com</code>
                <CopyButton
                  value="admin@acme.com"
                  label="复制演示邮箱"
                  notify={onNotify}
                />
              </div>
              <div className="oidc-password">
                密码 <code>Demo@2026!</code>
                <CopyButton
                  value="Demo@2026!"
                  label="复制演示密码"
                  notify={onNotify}
                />
              </div>
            </div>
          </div>
          <button
            type="button"
            className="oidc-primary oidc-start"
            disabled={busy || loading || !discovery}
            onClick={start}
          >
            {busy ? (
              <Loader2 size={17} className="oidc-spin" />
            ) : (
              <Play size={16} />
            )}
            {busy ? "正在发起认证…" : "开始登录测试"}
            <ArrowRight size={17} />
          </button>
          <p className="oidc-footnote">
            <LockKeyhole size={12} /> Token 仅保存在页面内存，不写入浏览器存储
          </p>
        </section>
        <section className="oidc-card oidc-endpoints">
          <div className="oidc-card-title">
            <div>
              <h3>服务发现</h3>
              <p>从认证服务实时获取的标准端点</p>
            </div>
            <span className={`oidc-connection ${error ? "oidc-offline" : ""}`}>
              <i />
              {loading ? "连接中" : discovery ? "已连接" : "未连接"}
            </span>
          </div>
          {loading ? (
            <div className="oidc-loading">
              <Loader2 className="oidc-spin" size={22} />
              <span>正在读取 Discovery 文档</span>
            </div>
          ) : endpoints.length ? (
            <div className="oidc-endpoint-list">
              {endpoints.map(([name, value]) => (
                <div className="oidc-endpoint" key={name}>
                  <label>{name}</label>
                  <div>
                    <code>{value}</code>
                    <CopyButton
                      value={value}
                      label={`复制 ${name} 地址`}
                      notify={onNotify}
                    />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="oidc-loading">
              <Globe2 size={25} />
              <span>等待认证服务连接</span>
              <button className="oidc-secondary" onClick={load}>
                <RefreshCw size={14} />
                重新连接
              </button>
            </div>
          )}
          <a
            className="oidc-discovery-link"
            href={`${issuer()}/.well-known/openid-configuration`}
            target="_blank"
            rel="noreferrer"
          >
            <Terminal size={15} /> 查看完整 Discovery 文档{" "}
            <ArrowRight size={15} />
          </a>
          <div className="oidc-note">
            <ShieldCheck size={18} />
            <p>
              每次测试都会生成独立的随机 state、nonce 和 PKCE
              verifier，回调时校验令牌签名、签发方、受众和有效期。
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}

export function OidcCallback() {
  const [result, setResult] = useState<LoginResult | null>(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<"profile" | "claims">("profile");
  useEffect(() => {
    callbackPromise ??= finishLogin();
    callbackPromise
      .then(setResult)
      .catch((error) =>
        setError(error instanceof Error ? error.message : "认证失败"),
      );
  }, []);
  return (
    <div className="oidc-callback-page">
      <a className="oidc-callback-brand" href="/">
        <span>
          <ShieldCheck size={22} />
        </span>
        NEXUS<span className="oidc-brand-caption">身份与访问管理</span>
      </a>
      <main className="oidc-callback-shell">
        <a href="/#oidc" className="oidc-back">
          <ArrowLeft size={16} />
          返回 OIDC 实验室
        </a>
        <section className="oidc-result-card">
          <div
            className={`oidc-result-symbol ${error ? "oidc-result-error" : ""}`}
          >
            {error ? (
              <XCircle size={33} />
            ) : result ? (
              <ShieldCheck size={33} />
            ) : (
              <Loader2 size={33} className="oidc-spin" />
            )}
          </div>
          <span className="oidc-eyebrow">OIDC AUTHORIZATION CODE FLOW</span>
          <h1>
            {error
              ? "认证未完成"
              : result
                ? "身份验证成功"
                : "正在安全地验证身份"}
          </h1>
          <p className="oidc-result-description">
            {error ||
              (result
                ? "从授权请求到用户信息，完整认证链路已验证通过。"
                : "交换授权码、验证 ID Token 签名并获取用户信息…")}
          </p>
          {!result && !error && (
            <div className="oidc-progress">
              <div />
            </div>
          )}
          {error && (
            <a className="oidc-primary" href="/#oidc">
              <RefreshCw size={16} />
              重新开始登录测试
            </a>
          )}
          {result && (
            <>
              <div className="oidc-profile">
                <div className="oidc-profile-avatar">
                  {String(result.profile.name || result.profile.email || "U")
                    .slice(0, 1)
                    .toUpperCase()}
                </div>
                <div>
                  <strong>{String(result.profile.name || "已认证用户")}</strong>
                  <span>
                    {String(result.profile.email || result.profile.sub)}
                  </span>
                </div>
                <CheckCircle2 size={22} />
              </div>
              <div className="oidc-verifications">
                {[
                  "State 与 nonce",
                  `${result.algorithm} 签名`,
                  "Issuer 与受众",
                  "用户身份一致",
                ].map((item) => (
                  <span key={item}>
                    <Check size={13} />
                    {item}
                  </span>
                ))}
              </div>
              <div className="oidc-result-meta">
                <div>
                  <label>授权方式</label>
                  <span>Code + PKCE</span>
                </div>
                <div>
                  <label>访问令牌有效期</label>
                  <span>{result.expiresIn} 秒</span>
                </div>
                <div>
                  <label>请求范围</label>
                  <span>{result.scope}</span>
                </div>
              </div>
              <div className="oidc-json-view">
                <div className="oidc-json-toolbar">
                  <div role="tablist" aria-label="返回信息">
                    <button
                      role="tab"
                      aria-selected={tab === "profile"}
                      className={tab === "profile" ? "active" : ""}
                      onClick={() => setTab("profile")}
                    >
                      UserInfo
                    </button>
                    <button
                      role="tab"
                      aria-selected={tab === "claims"}
                      className={tab === "claims" ? "active" : ""}
                      onClick={() => setTab("claims")}
                    >
                      ID Token Claims
                    </button>
                  </div>
                  <CopyButton
                    value={JSON.stringify(
                      tab === "profile" ? result.profile : result.claims,
                      null,
                      2,
                    )}
                    label="复制返回信息"
                  />
                </div>
                <pre role="tabpanel">
                  {JSON.stringify(
                    tab === "profile" ? result.profile : result.claims,
                    null,
                    2,
                  )}
                </pre>
              </div>
              <p className="oidc-footnote">
                <LockKeyhole size={12} />
                令牌仅用于本次验证；离开页面后不保留。
              </p>
              <a className="oidc-primary" href="/#oidc">
                完成测试，返回控制台
                <ArrowRight size={16} />
              </a>
            </>
          )}
        </section>
        <p className="oidc-callback-footer">
          NEXUS IDENTITY · 安全连接每一个身份
        </p>
      </main>
    </div>
  );
}
