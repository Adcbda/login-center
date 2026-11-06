export function escape(value = "") {
  return String(value).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
}
export function layout(body, title = "登录您的工作空间") {
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(title)} · Nexus ID</title><style>
*{box-sizing:border-box}body{margin:0;font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC",sans-serif;background:#f6f8f7;color:#202b29;min-height:100vh;display:grid;place-items:center;padding:28px}main{width:100%;max-width:460px}.brand{display:flex;align-items:center;justify-content:center;gap:10px;margin-bottom:38px;font-size:24px;font-weight:750;letter-spacing:-1px}.mark{height:36px;width:36px;border-radius:11px;background:#167d63;color:#fff;display:grid;place-items:center;font-size:25px}.card{background:white;padding:38px;border:1px solid #e3e9e6;border-radius:18px;box-shadow:0 18px 60px #172b2110}h1{font-size:24px;letter-spacing:-.7px;margin:0 0 10px}p{font-size:14px;line-height:1.8;color:#75817a;margin:0 0 25px}label{font-size:13px;display:block;margin-bottom:8px;color:#4f5a54;font-weight:550}input{width:100%;padding:12px 14px;border:1px solid #dce4df;border-radius:8px;font-size:14px;margin-bottom:20px;outline:none}input:focus{border-color:#258f70;box-shadow:0 0 0 3px #258f7015}button{width:100%;padding:13px;background:#167d63;color:white;border:0;border-radius:8px;font-size:14px;font-weight:650;cursor:pointer}.secondary{margin-top:10px;background:#f4f7f5;color:#54625a}footer{text-align:center;color:#9aa49e;font-size:12px;margin-top:25px}.demo{background:#f2f7f4;border:1px solid #e2ece5;border-radius:9px;padding:13px 16px;margin-top:24px;font-size:12px;line-height:1.9;color:#6b7f72}.demo strong{color:#387258}.error{background:#fff0ee;color:#b94335;padding:12px;border-radius:8px;font-size:13px;margin-bottom:18px}.permission{display:flex;gap:12px;padding:14px 0;border-bottom:1px solid #eff2f0;font-size:14px;color:#57665d}.permission:last-of-type{margin-bottom:22px}.check{color:#198b68}a{color:#167d63;text-decoration:none}code{font-family:ui-monospace,monospace}.account{display:flex;align-items:center;gap:12px;background:#f6f8f7;padding:15px;border-radius:10px;margin-bottom:20px}.avatar{border-radius:50%;height:36px;width:36px;display:grid;place-items:center;color:#198366;background:#e3eee6}.account small{display:block;color:#8a958e;margin-top:4px}
</style></head><body><main><div class="brand"><span class="mark">n</span>nexus<span style="font-weight:400;color:#82928a">/</span><span style="font-size:17px;letter-spacing:0">统一身份中心</span></div><div class="card">${body}</div><footer>由 Nexus ID 安全连接 · 本地演示环境</footer></main></body></html>`;
}
export function loginPage({ uid, app, csrf, error = "" }) {
  return layout(
    `<h1>欢迎回到工作空间</h1><p>登录以继续访问 <strong>${escape(app)}</strong></p>${error ? `<div role="alert" class="error">${escape(error)}</div>` : ""}<form method="post" action="/interaction/${escape(uid)}/login"><input type="hidden" name="csrf" value="${escape(csrf)}"><label for="email">企业邮箱</label><input id="email" name="email" type="email" autocomplete="username" required placeholder="you@company.com" value="admin@acme.com"><label for="password">密码</label><input id="password" name="password" type="password" autocomplete="current-password" required placeholder="输入您的登录密码"><button type="submit">安全登录 →</button></form><div class="demo"><strong>演示账号</strong><br>邮箱：admin@acme.com<br>密码：Demo@2026!</div><p style="font-size:12px;margin:20px 0 0;text-align:center"><a href="/">返回管理控制台</a></p>`,
  );
}
export function consentPage({ uid, app, csrf, user, scopes = [] }) {
  const descriptions = {
    openid: "验证您的身份标识",
    profile: "读取您的姓名和基本资料",
    email: "读取您的企业邮箱地址",
  };
  return layout(
    `<h1>授权应用访问</h1><p><strong>${escape(app)}</strong> 希望使用您的企业账号登录</p><div class="account"><span class="avatar">${escape(user.avatar)}</span><div>${escape(user.name)}<small>${escape(user.email)}</small></div></div>${scopes.map((scope) => `<div class="permission"><span class="check">✓</span>${escape(descriptions[scope] || scope)}</div>`).join("")}<form method="post" action="/interaction/${escape(uid)}/confirm"><input type="hidden" name="csrf" value="${escape(csrf)}"><button type="submit">同意并继续 →</button></form><form method="post" action="/interaction/${escape(uid)}/abort"><input type="hidden" name="csrf" value="${escape(csrf)}"><button type="submit" class="secondary">取消授权</button></form>`,
    "授权应用访问",
  );
}
