import { useEffect, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import {
  Activity,
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  Bell,
  Boxes,
  BriefcaseBusiness,
  Building2,
  CalendarDays,
  ChartNoAxesCombined,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronRight,
  ChevronsUpDown,
  CircleHelp,
  Cloud,
  Code2,
  Copy,
  Download,
  Ellipsis,
  ExternalLink,
  FileClock,
  Fingerprint,
  FlaskConical,
  KeyRound,
  Layers3,
  LayoutDashboard,
  Link2,
  ListFilter,
  LoaderCircle,
  LockKeyhole,
  LogIn,
  Menu,
  MessageSquare,
  Plus,
  Search,
  Settings2,
  Shield,
  ShieldCheck,
  Sparkles,
  Users,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import OidcLab, { OidcCallback } from "./OidcLab";

type Page =
  | "overview"
  | "apps"
  | "users"
  | "organization"
  | "security"
  | "oidc"
  | "audit"
  | "settings";
type Application = {
  id: string;
  name: string;
  description: string;
  clientId: string;
  protocol: string;
  status: string;
  users: number;
  icon: string;
  color: string;
  redirectUri: string;
  createdAt: string;
};
type User = {
  id: string;
  name: string;
  email: string;
  department: string;
  role: string;
  status: string;
  lastLogin: string;
  avatar: string;
};
type AuditEvent = {
  id: string;
  user: string;
  email: string;
  app: string;
  action: string;
  ip: string;
  location: string;
  status: string;
  time: string;
};
type Data = {
  apps: Application[];
  users: User[];
  events: AuditEvent[];
  settings: {
    sessionTimeout: number;
    passwordMinLength: number;
    allowRegistration: boolean;
  };
};
const nav: { id: Page; name: string; icon: LucideIcon; group?: string }[] = [
  {
    id: "overview",
    name: "工作空间概览",
    icon: LayoutDashboard,
    group: "工作空间",
  },
  { id: "apps", name: "应用管理", icon: Boxes },
  { id: "users", name: "用户管理", icon: Users },
  { id: "organization", name: "组织架构", icon: Building2 },
  {
    id: "security",
    name: "认证与安全",
    icon: ShieldCheck,
    group: "安全与集成",
  },
  { id: "oidc", name: "OIDC 实验室", icon: Code2 },
  { id: "audit", name: "审计日志", icon: FileClock },
];
const icons: Record<string, LucideIcon> = {
  layers: Layers3,
  code: Code2,
  chart: ChartNoAxesCombined,
  briefcase: BriefcaseBusiness,
  message: MessageSquare,
  cloud: Cloud,
};
const descriptions: Record<Page, string> = {
  overview: "统一身份，让每一次连接都安全、简单。",
  apps: "连接企业应用，集中管理每一个访问入口。",
  users: "管理团队成员与身份，让协作有序发生。",
  organization: "清晰的组织关系，是高效协作的开始。",
  security: "为每一次身份验证建立可靠的安全边界。",
  oidc: "从一次真实登录开始，验证你的 OpenID Connect 集成。",
  audit: "记录关键操作，让每一次访问都有迹可循。",
  settings: "管理工作空间的基础设置与运行信息。",
};
const num = (n: number) => n.toLocaleString("en-US");
function fmtTime(t: string) {
  const d = new Date(t);
  return Number.isNaN(d.getTime())
    ? t
    : d.toLocaleString("zh-CN", {
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      });
}
async function api<T>(url: string, method = "GET", body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json();
  if (!res.ok)
    throw new Error(
      json.error?.message || json.error || json.message || "操作失败，请重试",
    );
  return json;
}
function AppIcon({
  app,
  small = false,
}: {
  app: Application;
  small?: boolean;
}) {
  const Icon = icons[app.icon] || Boxes;
  return (
    <span
      className={`app-icon ${small ? "small" : ""}`}
      style={{
        color: app.color || "#5867ce",
        background: `${app.color || "#5867ce"}13`,
      }}
    >
      <Icon size={small ? 18 : 21} strokeWidth={1.8} />
    </span>
  );
}
function Status({ active, label }: { active: boolean; label?: string }) {
  return (
    <span className={`status ${active ? "green" : "muted"}`}>
      <i />
      {label || (active ? "已启用" : "已停用")}
    </span>
  );
}
function Modal({
  title,
  subtitle,
  onClose,
  children,
  wide = false,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const old = document.activeElement as HTMLElement;
    (
      ref.current?.querySelector<HTMLElement>("input") ||
      ref.current?.querySelector<HTMLElement>("button")
    )?.focus();
    function key(e: KeyboardEvent) {
      if (e.key === "Escape") closeRef.current();
      if (e.key === "Tab") {
        const els = Array.from(
          ref.current?.querySelectorAll<HTMLElement>(
            "button,input,select,textarea,a[href]",
          ) || [],
        ).filter((x) => !x.hasAttribute("disabled"));
        const first = els[0],
          last = els.at(-1);
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    }
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("keydown", key);
      old?.focus();
    };
  }, []);
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className={`modal ${wide ? "wide" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        ref={ref}
      >
        <div className="modal-header">
          <div>
            <h2>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button
            className="icon-button"
            aria-label="关闭弹窗"
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
function Empty({ text = "没有找到匹配的结果" }: { text?: string }) {
  return (
    <div className="empty">
      <Search size={28} />
      <strong>{text}</strong>
      <span>试试调整搜索词或筛选条件</span>
    </div>
  );
}
function TrendChart({
  range = "7",
  large = false,
}: {
  range?: string;
  large?: boolean;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const values =
    range === "1"
      ? [500, 620, 530, 670, 920, 800, 1000, 850, 810, 1100, 1040, 1200]
      : range === "30"
        ? [620, 920, 740, 980, 820, 1150, 1020, 1510, 1190, 1420, 1300, 1680]
        : [640, 770, 620, 1020, 850, 1130, 810, 1260, 1110, 1490, 1330, 1580];
  const prev = [400, 580, 490, 690, 570, 790, 630, 880, 740, 1010, 830, 1050];
  const points = (v: number[]) =>
    v.map((y, i) => `${55 + i * 60},${200 - y / 10}`).join(" ");
  const area = `M ${points(values).replaceAll(" ", " L ")} L 715,220 L 55,220 Z`;
  return (
    <div className={`trend-chart ${large ? "large" : ""}`}>
      <svg
        viewBox="0 0 760 257"
        role="img"
        aria-label={`最近${range === "1" ? "24小时" : range + "天"}登录趋势，历史演示数据`}
      >
        <defs>
          <linearGradient id="chart-fill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#2b9775" stopOpacity=".15" />
            <stop offset="100%" stopColor="#2b9775" stopOpacity=".01" />
          </linearGradient>
        </defs>
        {[0, 1, 2, 3].map((i) => (
          <g key={i}>
            <line
              x1="55"
              y1={25 + i * 60}
              x2="730"
              y2={25 + i * 60}
              stroke="#e9eded"
              strokeDasharray="3 4"
            />
            <text
              x="40"
              y={29 + i * 60}
              textAnchor="end"
              fill="#8b949a"
              fontSize="11"
            >
              {["2,000", "1,500", "1,000", "500"][i]}
            </text>
          </g>
        ))}
        <path d={area} fill="url(#chart-fill)" />
        <polyline
          points={points(prev)}
          fill="none"
          stroke="#9fb9b0"
          strokeWidth="2"
          strokeDasharray="5 5"
          strokeLinejoin="round"
        />
        <polyline
          points={points(values)}
          fill="none"
          stroke="#228564"
          strokeWidth="2.5"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {(range === "1"
          ? ["00:00", "04:00", "08:00", "12:00", "16:00", "20:00"]
          : range === "30"
            ? ["10/08", "10/13", "10/18", "10/23", "10/28", "11/06"]
            : ["10/31", "11/01", "11/02", "11/03", "11/04", "11/05", "11/06"]
        ).map((d, i, a) => (
          <text
            key={d}
            x={55 + (i * 660) / (a.length - 1)}
            y="248"
            fill="#8b949a"
            fontSize="11"
            textAnchor="middle"
          >
            {d}
          </text>
        ))}
        {values.map((y, i) => (
          <g
            key={i}
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
          >
            <rect
              x={25 + i * 60}
              y="10"
              width="60"
              height="215"
              fill="transparent"
            />
            {hover === i && (
              <>
                <line
                  x1={55 + i * 60}
                  x2={55 + i * 60}
                  y1="10"
                  y2="220"
                  stroke="#8cb6a6"
                  strokeDasharray="3 3"
                />
                <circle
                  cx={55 + i * 60}
                  cy={200 - y / 10}
                  r="4"
                  fill="#228564"
                  stroke="white"
                  strokeWidth="2"
                />
                <rect
                  x={Math.min(640, 35 + i * 60)}
                  y={Math.max(4, 165 - y / 10)}
                  width="80"
                  height="25"
                  fill="#193c32"
                  rx="5"
                />
                <text
                  x={Math.min(680, 75 + i * 60)}
                  y={Math.max(20, 181 - y / 10)}
                  textAnchor="middle"
                  fill="white"
                  fontSize="11"
                >
                  {num(y)} 次登录
                </text>
              </>
            )}
          </g>
        ))}
      </svg>
    </div>
  );
}
export default function App() {
  const [page, setPage] = useState<Page>(() => {
    const h = location.hash.slice(1);
    return [...nav.map((n) => n.id), "settings"].includes(h)
      ? (h as Page)
      : "overview";
  });
  const [data, setData] = useState<Data | null>(null),
    [loadError, setLoadError] = useState(""),
    [toast, setToast] = useState("");
  const [searchOpen, setSearchOpen] = useState(false),
    [globalQuery, setGlobalQuery] = useState(""),
    [mobile, setMobile] = useState(false),
    [notifications, setNotifications] = useState(false);
  const [modal, setModal] = useState<"app" | "user" | "docs" | null>(null),
    [selectedApp, setSelectedApp] = useState<Application | null>(null),
    [selectedEvent, setSelectedEvent] = useState<AuditEvent | null>(null);
  const [query, setQuery] = useState(""),
    [filter, setFilter] = useState("all"),
    [range, setRange] = useState("7"),
    [overviewTab, setOverviewTab] = useState("summary"),
    [showDemo, setShowDemo] = useState(true),
    [busy, setBusy] = useState(false),
    [formError, setFormError] = useState("");
  const [editingApp, setEditingApp] = useState(false);
  const [settings, setSettings] = useState<Data["settings"] | null>(null);
  const refresh = async () => {
    try {
      const result = await api<Data>("/api/bootstrap");
      setData(result);
      setSettings(result.settings);
      setLoadError("");
    } catch (e) {
      setLoadError((e as Error).message);
    }
  };
  useEffect(() => {
    void refresh();
  }, []);
  useEffect(() => {
    const onHash = () => {
      const h = location.hash.slice(1);
      if ([...nav.map((n) => n.id), "settings"].includes(h)) setPage(h as Page);
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setSearchOpen((x) => !x);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(""), 3500);
      return () => clearTimeout(t);
    }
  }, [toast]);
  function go(p: Page) {
    setPage(p);
    location.hash = p;
    setQuery("");
    setFilter("all");
    setMobile(false);
    setSearchOpen(false);
    setNotifications(false);
  }
  async function updateApp(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!selectedApp) return;
    setBusy(true);
    setFormError("");
    try {
      const values = Object.fromEntries(new FormData(e.currentTarget));
      const updated = await api<Application>(
        `/api/apps/${selectedApp.id}`,
        "PATCH",
        values,
      );
      await refresh();
      setSelectedApp(updated);
      setEditingApp(false);
      setToast("应用配置已保存");
    } catch (error) {
      setFormError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function openModal(m: "app" | "user" | "docs") {
    setFormError("");
    setModal(m);
  }
  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setToast("已复制到剪贴板");
    } catch {
      setToast("复制失败，请手动选中内容复制");
    }
  }
  async function createItem(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setFormError("");
    const values = Object.fromEntries(new FormData(e.currentTarget));
    try {
      await api(modal === "app" ? "/api/apps" : "/api/users", "POST", values);
      await refresh();
      setModal(null);
      setToast(
        modal === "app"
          ? "应用已创建，可以开始 OIDC 接入"
          : "用户已创建，可使用设置的密码登录",
      );
    } catch (err) {
      setFormError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function toggleApp(app: Application) {
    try {
      await api(`/api/apps/${app.id}`, "PATCH", {
        status: app.status === "active" ? "inactive" : "active",
      });
      await refresh();
      setSelectedApp(null);
      setToast(app.status === "active" ? "应用已停用" : "应用已启用");
    } catch (e) {
      setToast((e as Error).message);
    }
  }
  async function toggleUser(user: User) {
    try {
      await api(`/api/users/${user.id}`, "PATCH", {
        status: user.status === "active" ? "inactive" : "active",
      });
      await refresh();
      setToast("用户状态已更新");
    } catch (e) {
      setToast((e as Error).message);
    }
  }
  async function saveSettings(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api("/api/settings", "PATCH", settings);
      await refresh();
      setToast("认证策略已保存");
    } catch (err) {
      setToast((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function exportEvents() {
    if (!data) return;
    const rows = [
      ["时间", "用户", "邮箱", "应用", "操作", "IP", "位置", "结果"],
      ...filteredEvents.map((e) => [
        e.time,
        e.user,
        e.email,
        e.app,
        e.action,
        e.ip,
        e.location,
        e.status,
      ]),
    ];
    const content =
      "\uFEFF" +
      rows
        .map((row) =>
          row
            .map(
              (v) =>
                '"' +
                String(v)
                  .replace(/^[=+@-]/, "'$&")
                  .replaceAll('"', '""') +
                '"',
            )
            .join(","),
        )
        .join("\r\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(
      new Blob([content], { type: "text/csv;charset=utf-8;" }),
    );
    a.download = "nexus-audit.csv";
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    setToast(`已导出 ${filteredEvents.length} 条审计记录`);
  }
  if (location.pathname === "/callback") return <OidcCallback />;
  const filteredApps =
    data?.apps.filter(
      (a) =>
        (a.name + a.clientId + a.description)
          .toLowerCase()
          .includes(query.toLowerCase()) &&
        (filter === "all" || a.status === filter),
    ) || [];
  const filteredUsers =
    data?.users.filter(
      (u) =>
        (u.name + u.email + u.department)
          .toLowerCase()
          .includes(query.toLowerCase()) &&
        (filter === "all" || u.status === filter),
    ) || [];
  const filteredEvents =
    data?.events.filter(
      (e) =>
        (e.user + e.email + e.app + e.ip)
          .toLowerCase()
          .includes(query.toLowerCase()) &&
        (filter === "all" || e.status === filter),
    ) || [];
  const title = nav.find((n) => n.id === page)?.name || "工作空间设置";
  const allSearch = [
    ...nav.map((n) => ({
      kind: "页面",
      name: n.name,
      sub: descriptions[n.id],
      action: () => go(n.id),
    })),
    ...(data?.apps || []).map((a) => ({
      kind: "应用",
      name: a.name,
      sub: a.clientId,
      action: () => {
        go("apps");
        setSelectedApp(a);
      },
    })),
    ...(data?.users || []).map((u) => ({
      kind: "用户",
      name: u.name,
      sub: u.email,
      action: () => {
        go("users");
        setQuery(u.email);
      },
    })),
  ].filter((x) =>
    (x.name + x.sub).toLowerCase().includes(globalQuery.toLowerCase()),
  );
  return (
    <div className="app-shell">
      {mobile && (
        <div className="sidebar-scrim" onClick={() => setMobile(false)} />
      )}
      <aside className={`sidebar ${mobile ? "open" : ""}`}>
        <a href="#overview" className="brand" onClick={() => go("overview")}>
          <span className="brand-mark">
            <span />
            <span />
            <span />
          </span>
          <span>
            NEXUS<span className="brand-sub">企业身份与访问管理</span>
          </span>
        </a>
        <button className="workspace" onClick={() => go("settings")}>
          <span className="workspace-logo">
            <Building2 size={19} />
          </span>
          <span>
            <strong>Acme 科技</strong>
            <small>Enterprise 工作空间</small>
          </span>
          <ChevronsUpDown size={15} />
        </button>
        <nav aria-label="主导航">
          {nav.map((n) => (
            <div key={n.id}>
              {n.group && <div className="nav-label">{n.group}</div>}
              <button
                className={`nav-item ${page === n.id ? "active" : ""}`}
                onClick={() => go(n.id)}
              >
                <n.icon size={18} strokeWidth={1.7} />
                <span>{n.name}</span>
                {n.id === "apps" && (
                  <span className="nav-count">{data?.apps.length || 6}</span>
                )}
                {n.id === "oidc" && <span className="new-tag">NEW</span>}
              </button>
            </div>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="help-card">
            <div>
              <span className="help-icon">
                <Sparkles size={17} />
              </span>
              <strong>连接你的第一个应用</strong>
            </div>
            <p>通过标准 OIDC 协议，快速接入统一身份认证。</p>
            <button onClick={() => openModal("docs")}>
              查看接入指南 <ArrowUpRight size={14} />
            </button>
            <span className="help-decoration">✳</span>
          </div>
          <button
            className={`nav-item ${page === "settings" ? "active" : ""}`}
            onClick={() => go("settings")}
          >
            <Settings2 size={18} />
            <span>工作空间设置</span>
          </button>
          <button className="nav-item" onClick={() => openModal("docs")}>
            <CircleHelp size={18} />
            <span>帮助与文档</span>
            <ArrowUpRight size={14} />
          </button>
          <div className="sidebar-profile">
            <span className="avatar admin">林</span>
            <span>
              <strong>林知远</strong>
              <small>工作空间管理员</small>
            </span>
            <button
              className="icon-button"
              aria-label="管理员资料"
              onClick={() => {
                go("users");
                setQuery("admin@acme.com");
              }}
            >
              <Ellipsis size={20} />
            </button>
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="icon-button mobile-menu"
              aria-label="展开导航"
              onClick={() => setMobile(true)}
            >
              <Menu size={20} />
            </button>
            <Building2 size={16} />
            <span>Acme 科技</span>
            <ChevronRight size={14} />
            <strong>{title}</strong>
          </div>
          <div className="topbar-actions">
            <button
              className="global-search"
              aria-label="搜索工作空间"
              onClick={() => {
                setGlobalQuery("");
                setSearchOpen(true);
              }}
            >
              <Search size={16} />
              <span>搜索工作空间...</span>
              <kbd>⌘ K</kbd>
            </button>
            <span className="top-divider" />
            <span className="environment">
              <i />
              演示环境
            </span>
            <button
              className={`icon-button notification-button ${notifications ? "selected" : ""}`}
              aria-label="查看通知"
              onClick={() => setNotifications((x) => !x)}
            >
              <Bell size={19} />
              <i />
            </button>
            <button
              className="avatar top-avatar"
              aria-label="管理员资料"
              onClick={() => {
                go("users");
                setQuery("admin@acme.com");
              }}
            >
              林
            </button>
          </div>
          {notifications && (
            <div className="notification-panel">
              <div className="notification-heading">
                <strong>工作空间动态</strong>
                <CheckCheck size={17} />
              </div>
              <div>
                <span className="notification-icon">
                  <ShieldCheck size={20} />
                </span>
                <p>
                  <strong>OIDC 服务已就绪</strong>
                  <small>可前往实验室验证完整登录流程。</small>
                </p>
              </div>
              <div>
                <span className="notification-icon">
                  <FlaskConical size={20} />
                </span>
                <p>
                  <strong>演示数据已加载</strong>
                  <small>当前为本地演示工作空间。</small>
                </p>
              </div>
              <button onClick={() => go("audit")}>
                查看审计日志 <ArrowRight size={14} />
              </button>
            </div>
          )}
        </header>
        <main>
          <div className="page-heading">
            <div>
              <div className="eyebrow">WORKSPACE / {page.toUpperCase()}</div>
              <h1>
                {title}
                {page === "overview" && <span className="heading-dot" />}
              </h1>
              <p>{descriptions[page]}</p>
            </div>
            <div className="heading-actions">
              {page === "overview" ? (
                <>
                  <button className="button" onClick={() => go("oidc")}>
                    <ExternalLink size={15} />
                    体验登录
                  </button>
                  <button
                    className="button primary"
                    onClick={() => openModal("app")}
                  >
                    <Plus size={17} />
                    创建应用
                  </button>
                </>
              ) : page === "apps" ? (
                <button
                  className="button primary"
                  onClick={() => openModal("app")}
                >
                  <Plus size={17} />
                  创建应用
                </button>
              ) : page === "users" ? (
                <button
                  className="button primary"
                  onClick={() => openModal("user")}
                >
                  <Plus size={17} />
                  添加用户
                </button>
              ) : page === "audit" ? (
                <button className="button" onClick={exportEvents}>
                  <Download size={16} />
                  导出日志
                </button>
              ) : (
                <span className="heading-note">
                  <span className="live-dot" />
                  工作空间运行正常
                </span>
              )}
            </div>
          </div>
          {!data ? (
            <div className="loading-state">
              {loadError ? (
                <>
                  <Shield size={34} />
                  <h3>暂时无法连接服务</h3>
                  <p>{loadError}</p>
                  <button
                    className="button primary"
                    onClick={() => void refresh()}
                  >
                    重新连接
                  </button>
                </>
              ) : (
                <>
                  <LoaderCircle className="spin" size={26} />
                  <p>正在加载工作空间…</p>
                </>
              )}
            </div>
          ) : (
            <>
              {page === "overview" && (
                <>
                  <div className="overview-tabs">
                    <div>
                      <button
                        className={overviewTab === "summary" ? "selected" : ""}
                        onClick={() => setOverviewTab("summary")}
                      >
                        总览
                      </button>
                      <button
                        className={
                          overviewTab === "analytics" ? "selected" : ""
                        }
                        onClick={() => setOverviewTab("analytics")}
                      >
                        认证分析
                      </button>
                    </div>
                    <span>
                      <CalendarDays size={14} />
                      2026 年 11 月 6 日<ChevronDown size={13} />
                    </span>
                  </div>
                  {showDemo && (
                    <div className="demo-banner">
                      <span className="demo-icon">
                        <FlaskConical size={19} />
                      </span>
                      <div>
                        <strong>你的身份管理工作空间，已准备就绪</strong>
                        <span>
                          已内置应用、用户与认证演示数据。探索功能，或接入你的第一个应用。
                        </span>
                      </div>
                      <button onClick={() => go("oidc")}>
                        开始体验 <ArrowRight size={15} />
                      </button>
                      <button
                        className="icon-button"
                        aria-label="隐藏演示提示"
                        onClick={() => setShowDemo(false)}
                      >
                        <X size={15} />
                      </button>
                    </div>
                  )}
                  <div className="metrics-grid">
                    {[
                      {
                        label: "今日登录次数",
                        value: "8,642",
                        unit: "次",
                        change: "+12.8%",
                        sub: "较昨日",
                        icon: LogIn,
                        line: "52,34 61,31 69,34 78,24 85,27 94,18 102,22 110,10",
                        demo: true,
                      },
                      {
                        label: "已启用用户",
                        value: num(
                          data.users.filter((u) => u.status === "active")
                            .length,
                        ),
                        unit: "人",
                        change: `共 ${data.users.length} 人`,
                        sub: "工作空间成员",
                        icon: Users,
                        line: "52,36 61,31 69,32 78,27 85,30 94,22 102,24 110,13",
                      },
                      {
                        label: "已接入应用",
                        value: num(data.apps.length).padStart(2, "0"),
                        unit: "个",
                        change: `${data.apps.filter((a) => a.status === "active").length} 个运行中`,
                        sub: "统一身份接入",
                        icon: Boxes,
                        line: "52,36 65,36 65,29 80,29 80,20 95,20 95,12 110,12",
                      },
                      {
                        label: "认证成功率",
                        value: "99.98",
                        unit: "%",
                        change: "+0.06%",
                        sub: "较昨日",
                        icon: ShieldCheck,
                        line: "52,31 61,24 69,27 78,18 85,21 94,14 102,18 110,11",
                        demo: true,
                      },
                    ].map((m, i) => (
                      <div className="metric-card" key={m.label}>
                        <div className="metric-top">
                          <span>
                            {m.label}
                            {m.demo && <span className="tiny-demo">演示</span>}
                          </span>
                          <m.icon size={18} />
                        </div>
                        <div className="metric-value">
                          {m.value}
                          <span>{m.unit}</span>
                        </div>
                        <div className="metric-bottom">
                          <span className="metric-change">
                            {i === 0 || i === 3 ? (
                              <ArrowUpRight size={12} />
                            ) : (
                              <span className="mini-dot" />
                            )}
                            {m.change}
                          </span>
                          <span>{m.sub}</span>
                        </div>
                        <svg
                          className="sparkline"
                          viewBox="0 0 120 50"
                          aria-hidden="true"
                        >
                          <polyline
                            points={m.line}
                            fill="none"
                            stroke="#7bad97"
                            strokeWidth="1.8"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </div>
                    ))}
                  </div>
                  <div
                    className={`chart-grid ${overviewTab === "analytics" ? "analytics" : ""}`}
                  >
                    <section className="panel trend-panel">
                      <div className="panel-heading">
                        <div>
                          <h2>
                            认证趋势{" "}
                            <span
                              className="info-dot"
                              title="历史趋势为内置演示数据"
                            >
                              i
                            </span>
                          </h2>
                          <p>
                            工作空间的登录活动与认证表现{" "}
                            <span className="tiny-demo">演示数据</span>
                          </p>
                        </div>
                        <div className="segmented">
                          {[
                            ["1", "24 小时"],
                            ["7", "7 天"],
                            ["30", "30 天"],
                          ].map(([v, l]) => (
                            <button
                              key={v}
                              className={range === v ? "active" : ""}
                              onClick={() => setRange(v)}
                            >
                              {l}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="chart-summary">
                        <strong>
                          {range === "1"
                            ? "8,642"
                            : range === "30"
                              ? "248,960"
                              : "58,264"}
                        </strong>
                        <span>次认证</span>
                        <span className="trend-up">
                          <ArrowUpRight size={13} />
                          12.8%
                        </span>
                        <div className="chart-legend">
                          <span>
                            <i />
                            本周期
                          </span>
                          <span>
                            <i />
                            上周期
                          </span>
                        </div>
                      </div>
                      <TrendChart
                        range={range}
                        large={overviewTab === "analytics"}
                      />
                    </section>
                    <section className="panel methods-panel">
                      <div className="panel-heading">
                        <div>
                          <h2>认证方式</h2>
                          <p>
                            近 7 天的登录分布{" "}
                            <span className="tiny-demo">演示</span>
                          </p>
                        </div>
                        <Fingerprint size={18} />
                      </div>
                      <div className="donut">
                        <svg
                          viewBox="0 0 180 180"
                          aria-label="OIDC 76%，账号密码18%，其他6%"
                          role="img"
                        >
                          <circle
                            cx="90"
                            cy="90"
                            r="66"
                            fill="none"
                            stroke="#eef2f0"
                            strokeWidth="18"
                          />
                          <circle
                            cx="90"
                            cy="90"
                            r="66"
                            fill="none"
                            stroke="#287f60"
                            strokeWidth="18"
                            strokeDasharray="310 415"
                            transform="rotate(-90 90 90)"
                          />
                          <circle
                            cx="90"
                            cy="90"
                            r="66"
                            fill="none"
                            stroke="#99bca9"
                            strokeWidth="18"
                            strokeDasharray="69 415"
                            strokeDashoffset="-317"
                            transform="rotate(-90 90 90)"
                          />
                          <circle
                            cx="90"
                            cy="90"
                            r="66"
                            fill="none"
                            stroke="#d9e6de"
                            strokeWidth="18"
                            strokeDasharray="20 415"
                            strokeDashoffset="-393"
                            transform="rotate(-90 90 90)"
                          />
                        </svg>
                        <div>
                          <span>认证总次数</span>
                          <strong>58,264</strong>
                          <small>过去 7 天</small>
                        </div>
                      </div>
                      <div className="method-legend">
                        {[
                          ["#287f60", "OIDC 单点登录", "76%"],
                          ["#99bca9", "账号密码", "18%"],
                          ["#d9e6de", "其他方式", "6%"],
                        ].map(([c, l, v]) => (
                          <div key={l}>
                            <span>
                              <i style={{ background: c }} />
                              {l}
                            </span>
                            <strong>{v}</strong>
                          </div>
                        ))}
                      </div>
                    </section>
                  </div>
                  {overviewTab === "summary" ? (
                    <div className="lower-grid">
                      <section className="panel connected-apps">
                        <div className="panel-heading">
                          <div className="title-inline">
                            <h2>已接入应用</h2>
                            <span className="count-badge">
                              {data.apps.length}
                            </span>
                          </div>
                          <button
                            className="text-link"
                            onClick={() => go("apps")}
                          >
                            查看全部 <ArrowRight size={14} />
                          </button>
                        </div>
                        <div className="table-scroll">
                          <table className="app-table">
                            <thead>
                              <tr>
                                <th>应用名称</th>
                                <th>协议</th>
                                <th>状态</th>
                                <th>
                                  用户数 <span className="tiny-demo">演示</span>
                                </th>
                                <th />
                              </tr>
                            </thead>
                            <tbody>
                              {data.apps.slice(0, 4).map((a) => (
                                <tr
                                  key={a.id}
                                  onClick={() => setSelectedApp(a)}
                                  tabIndex={0}
                                  onKeyDown={(e) =>
                                    e.key === "Enter" && setSelectedApp(a)
                                  }
                                >
                                  <td>
                                    <div className="table-identity">
                                      <AppIcon app={a} small />
                                      <span>
                                        <strong>{a.name}</strong>
                                        <small>{a.description}</small>
                                      </span>
                                    </div>
                                  </td>
                                  <td>
                                    <span className="protocol-tag">
                                      {a.protocol}
                                    </span>
                                  </td>
                                  <td>
                                    <Status active={a.status === "active"} />
                                  </td>
                                  <td className="number-cell">
                                    {num(a.users)}
                                  </td>
                                  <td>
                                    <ChevronRight size={15} />
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        <div className="table-footer">
                          <span>
                            <Link2 size={13} />
                            标准协议，让应用连接更简单
                          </span>
                          <button onClick={() => openModal("app")}>
                            <Plus size={14} />
                            接入新应用
                          </button>
                        </div>
                      </section>
                      <section className="panel activity-panel">
                        <div className="panel-heading">
                          <div className="title-inline">
                            <h2>最近活动</h2>
                            <span className="live-dot" />
                          </div>
                          <button
                            className="text-link"
                            onClick={() => go("audit")}
                          >
                            全部日志 <ArrowRight size={14} />
                          </button>
                        </div>
                        <div className="activity-list">
                          {data.events.slice(0, 4).map((e, i) => (
                            <button
                              className="activity-item"
                              key={e.id}
                              onClick={() => setSelectedEvent(e)}
                            >
                              <span
                                className={`activity-avatar ${e.status === "failed" ? "warning" : i % 2 ? "blue" : ""}`}
                              >
                                {e.status === "failed" ? (
                                  <Shield size={16} />
                                ) : (
                                  e.user.slice(0, 1)
                                )}
                              </span>
                              <span>
                                <strong>
                                  {e.user} <span>{e.action}</span>
                                </strong>
                                <small>
                                  {e.app} <span>·</span> {e.location}
                                </small>
                              </span>
                              <span className="activity-time">
                                {fmtTime(e.time)}
                                {e.status === "failed" && (
                                  <small>认证失败</small>
                                )}
                              </span>
                            </button>
                          ))}
                        </div>
                        <div className="activity-foot">
                          <ShieldCheck size={14} />
                          <span>所有身份事件，均有迹可循</span>
                          <span className="subtle-dot" />
                        </div>
                      </section>
                    </div>
                  ) : (
                    <section className="panel analytics-detail">
                      <div>
                        <ShieldCheck size={25} />
                        <h3>认证表现一目了然</h3>
                        <p>
                          趋势图展示内置历史演示数据；真实 OIDC
                          登录事件实时写入审计日志。
                        </p>
                      </div>
                      <button className="button" onClick={() => go("audit")}>
                        查看实际认证事件 <ArrowRight size={15} />
                      </button>
                    </section>
                  )}
                </>
              )}
              {page === "apps" && (
                <>
                  <div className="section-tabs">
                    <button className="active">
                      全部应用 <span>{data.apps.length}</span>
                    </button>
                    <span>统一身份 · 连接每一个工具</span>
                  </div>
                  <div className="toolbar">
                    <div className="input-search">
                      <Search size={16} />
                      <input
                        aria-label="搜索应用"
                        placeholder="搜索应用名称或 Client ID..."
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                      />
                    </div>
                    <div className="select-wrap">
                      <ListFilter size={15} />
                      <select
                        aria-label="筛选应用状态"
                        value={filter}
                        onChange={(e) => setFilter(e.target.value)}
                      >
                        <option value="all">全部状态</option>
                        <option value="active">已启用</option>
                        <option value="inactive">已停用</option>
                      </select>
                    </div>
                    <span className="toolbar-meta">
                      共 {filteredApps.length} 个应用
                    </span>
                  </div>
                  <div className="application-grid">
                    {filteredApps.map((a) => (
                      <article className="application-card" key={a.id}>
                        <div className="application-card-top">
                          <AppIcon app={a} />
                          <Status active={a.status === "active"} />
                          <button
                            className="icon-button"
                            aria-label={`查看${a.name}详情`}
                            onClick={() => setSelectedApp(a)}
                          >
                            <Ellipsis size={19} />
                          </button>
                        </div>
                        <h3>{a.name}</h3>
                        <p>{a.description}</p>
                        <div className="client-id">
                          <Code2 size={13} />
                          {a.clientId}
                        </div>
                        <div className="application-card-footer">
                          <span className="protocol-tag">{a.protocol}</span>
                          <span>
                            <Users size={13} />
                            {num(a.users)} 位用户 · 演示
                          </span>
                          <button onClick={() => setSelectedApp(a)}>
                            配置 <ArrowUpRight size={14} />
                          </button>
                        </div>
                      </article>
                    ))}
                    <button
                      className="add-app-card"
                      onClick={() => openModal("app")}
                    >
                      <span>
                        <Plus size={24} />
                      </span>
                      <strong>连接一个新应用</strong>
                      <p>让团队使用统一身份，安全访问</p>
                    </button>
                  </div>
                  {filteredApps.length === 0 && <Empty />}
                  <div className="integration-note">
                    <ShieldCheck size={20} />
                    <div>
                      <strong>基于开放标准，构建可信连接</strong>
                      <p>
                        支持 OpenID Connect、授权码模式与 PKCE。每个应用拥有独立
                        Client ID 与回调地址。
                      </p>
                    </div>
                    <button className="text-link" onClick={() => go("oidc")}>
                      进入 OIDC 实验室 <ArrowRight size={15} />
                    </button>
                  </div>
                </>
              )}
              {page === "users" && (
                <>
                  <div className="mini-stats">
                    <div>
                      <Users size={20} />
                      <span>
                        工作空间成员<strong>{data.users.length}</strong>
                      </span>
                    </div>
                    <div>
                      <Check size={20} />
                      <span>
                        已启用用户
                        <strong>
                          {
                            data.users.filter((u) => u.status === "active")
                              .length
                          }
                        </strong>
                      </span>
                    </div>
                    <div>
                      <ShieldCheck size={20} />
                      <span>
                        管理员
                        <strong>
                          {data.users.filter((u) => u.role === "管理员").length}
                        </strong>
                      </span>
                    </div>
                  </div>
                  <section className="panel">
                    <div className="toolbar inset">
                      <div className="input-search">
                        <Search size={16} />
                        <input
                          placeholder="搜索姓名、邮箱或部门..."
                          aria-label="搜索用户"
                          value={query}
                          onChange={(e) => setQuery(e.target.value)}
                        />
                      </div>
                      <div className="select-wrap">
                        <ListFilter size={15} />
                        <select
                          aria-label="筛选用户状态"
                          value={filter}
                          onChange={(e) => setFilter(e.target.value)}
                        >
                          <option value="all">全部状态</option>
                          <option value="active">已启用</option>
                          <option value="inactive">已停用</option>
                        </select>
                      </div>
                      <span className="toolbar-meta">
                        共 {filteredUsers.length} 位成员
                      </span>
                    </div>
                    <div className="table-scroll">
                      <table className="users-table">
                        <thead>
                          <tr>
                            <th>用户</th>
                            <th>所属部门</th>
                            <th>角色</th>
                            <th>状态</th>
                            <th>最近登录</th>
                            <th>操作</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredUsers.map((u, i) => (
                            <tr key={u.id}>
                              <td>
                                <div className="table-identity">
                                  <span className={`avatar color-${i % 4}`}>
                                    {u.name.slice(0, 1)}
                                  </span>
                                  <span>
                                    <strong>{u.name}</strong>
                                    <small>{u.email}</small>
                                  </span>
                                </div>
                              </td>
                              <td>{u.department}</td>
                              <td>
                                <span
                                  className={`role-tag ${u.role === "管理员" ? "admin-role" : ""}`}
                                >
                                  {u.role === "管理员" && (
                                    <ShieldCheck size={12} />
                                  )}{" "}
                                  {u.role}
                                </span>
                              </td>
                              <td>
                                <Status active={u.status === "active"} />
                              </td>
                              <td className="subtle">
                                {u.lastLogin
                                  ? fmtTime(u.lastLogin)
                                  : "尚未登录"}
                              </td>
                              <td>
                                <button
                                  className={`table-action ${u.status === "active" ? "danger-text" : ""}`}
                                  disabled={u.id === "user-admin"}
                                  title={
                                    u.id === "user-admin"
                                      ? "内置演示管理员不可停用"
                                      : undefined
                                  }
                                  onClick={() => void toggleUser(u)}
                                >
                                  {u.status === "active" ? "停用" : "启用"}
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {!filteredUsers.length && <Empty />}
                    <div className="table-footer">
                      <span>显示全部 {filteredUsers.length} 位用户</span>
                      <span>账号修改会同步影响 OIDC 登录</span>
                    </div>
                  </section>
                </>
              )}
              {page === "organization" && (
                <>
                  <div className="org-root">
                    <span className="workspace-logo">
                      <Building2 size={26} />
                    </span>
                    <div>
                      <h2>Acme 科技</h2>
                      <p>
                        总工作空间 · {data.users.length} 位成员 ·{" "}
                        {new Set(data.users.map((u) => u.department)).size}{" "}
                        个部门
                      </p>
                    </div>
                    <span className="tag">Enterprise</span>
                  </div>
                  <div className="department-grid">
                    {Array.from(
                      new Set(data.users.map((u) => u.department)),
                    ).map((dep, i) => (
                      <section className="panel department-card" key={dep}>
                        <div>
                          <span className={`department-icon color-${i % 4}`}>
                            <Building2 size={22} />
                          </span>
                          <span className="count-badge">
                            {
                              data.users.filter((u) => u.department === dep)
                                .length
                            }{" "}
                            人
                          </span>
                        </div>
                        <h3>{dep}</h3>
                        <p>Acme 科技 / {dep}</p>
                        <div className="department-people">
                          {data.users
                            .filter((u) => u.department === dep)
                            .map((u) => (
                              <button
                                key={u.id}
                                onClick={() => {
                                  go("users");
                                  setQuery(u.email);
                                }}
                              >
                                <span className={`avatar color-${i % 4}`}>
                                  {u.name.slice(0, 1)}
                                </span>
                                <span>
                                  {u.name}
                                  <small>{u.role}</small>
                                </span>
                                <ChevronRight size={15} />
                              </button>
                            ))}
                        </div>
                      </section>
                    ))}
                  </div>
                  <p className="page-note">
                    添加用户时设置所属部门，组织目录会自动同步。
                  </p>
                </>
              )}
              {page === "security" && settings && (
                <div className="settings-layout">
                  <form
                    className="panel settings-panel"
                    onSubmit={saveSettings}
                  >
                    <div className="panel-heading">
                      <div>
                        <h2>
                          <ShieldCheck size={19} />
                          认证策略
                        </h2>
                        <p>这些策略会应用于此工作空间内的新会话和新密码。</p>
                      </div>
                      <span className="status green">
                        <i />
                        已生效
                      </span>
                    </div>
                    <div className="setting-row">
                      <div>
                        <h3>会话有效期</h3>
                        <p>用户登录后保持认证状态的最长时间。</p>
                      </div>
                      <select
                        aria-label="会话有效期"
                        value={settings.sessionTimeout}
                        onChange={(e) =>
                          setSettings({
                            ...settings,
                            sessionTimeout: Number(e.target.value),
                          })
                        }
                      >
                        <option value={30}>30 分钟</option>
                        <option value={60}>1 小时</option>
                        <option value={120}>2 小时</option>
                        <option value={480}>8 小时</option>
                        <option value={1440}>24 小时</option>
                      </select>
                    </div>
                    <div className="setting-row">
                      <div>
                        <h3>密码最小长度</h3>
                        <p>新建用户时必须满足的最低密码长度。</p>
                      </div>
                      <select
                        aria-label="密码最小长度"
                        value={settings.passwordMinLength}
                        onChange={(e) =>
                          setSettings({
                            ...settings,
                            passwordMinLength: Number(e.target.value),
                          })
                        }
                      >
                        {[8, 10, 12, 14, 16].map((n) => (
                          <option value={n} key={n}>
                            {n} 个字符
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="setting-row">
                      <div>
                        <h3>PKCE 安全校验</h3>
                        <p>授权码使用 S256 绑定客户端，防止授权码被截获。</p>
                      </div>
                      <span className="fixed-setting">
                        <LockKeyhole size={13} />
                        强制启用
                      </span>
                    </div>
                    <div className="setting-row">
                      <div>
                        <h3>开放用户注册</h3>
                        <p>当前仅允许管理员创建工作空间成员。</p>
                      </div>
                      <span className="fixed-setting">邀请制</span>
                    </div>
                    <div className="settings-actions">
                      <span>策略修改将记录在审计日志中</span>
                      <button className="button primary" disabled={busy}>
                        {busy ? (
                          <LoaderCircle className="spin" size={16} />
                        ) : (
                          <Check size={16} />
                        )}
                        保存策略
                      </button>
                    </div>
                  </form>
                  <aside className="security-aside">
                    <div className="shield-visual">
                      <ShieldCheck size={54} strokeWidth={1.1} />
                    </div>
                    <h3>安全，从身份开始</h3>
                    <p>
                      OIDC 标准协议、带签名的 ID Token
                      和严格回调地址校验，为应用提供一致的身份基础。
                    </p>
                    <div>
                      <Check size={15} />
                      强制 PKCE / S256
                    </div>
                    <div>
                      <Check size={15} />
                      授权码一次性使用
                    </div>
                    <div>
                      <Check size={15} />
                      密码加盐哈希存储
                    </div>
                    <div>
                      <Check size={15} />
                      签名验证与会话过期
                    </div>
                    <button className="text-link" onClick={() => go("oidc")}>
                      验证认证流程 <ArrowRight size={15} />
                    </button>
                  </aside>
                </div>
              )}
              {page === "oidc" && <OidcLab onNotify={setToast} />}
              {page === "audit" && (
                <section className="panel">
                  <div className="toolbar inset">
                    <div className="input-search">
                      <Search size={16} />
                      <input
                        placeholder="搜索用户、应用或 IP 地址..."
                        aria-label="搜索审计日志"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                      />
                    </div>
                    <div className="select-wrap">
                      <ListFilter size={15} />
                      <select
                        aria-label="筛选认证结果"
                        value={filter}
                        onChange={(e) => setFilter(e.target.value)}
                      >
                        <option value="all">全部结果</option>
                        <option value="success">成功</option>
                        <option value="failed">失败</option>
                      </select>
                    </div>
                    <button className="button" onClick={() => void refresh()}>
                      <Activity size={15} />
                      刷新
                    </button>
                    <span className="toolbar-meta">
                      {filteredEvents.length} 条记录
                    </span>
                  </div>
                  <div className="table-scroll">
                    <table className="audit-table">
                      <thead>
                        <tr>
                          <th>事件 / 用户</th>
                          <th>应用</th>
                          <th>IP 地址</th>
                          <th>位置</th>
                          <th>结果</th>
                          <th>时间</th>
                          <th />
                        </tr>
                      </thead>
                      <tbody>
                        {filteredEvents.map((e) => (
                          <tr
                            key={e.id}
                            onClick={() => setSelectedEvent(e)}
                            tabIndex={0}
                            onKeyDown={(ev) =>
                              ev.key === "Enter" && setSelectedEvent(e)
                            }
                          >
                            <td>
                              <div className="table-identity">
                                <span
                                  className={`event-icon ${e.status === "failed" ? "fail" : ""}`}
                                >
                                  {e.status === "failed" ? (
                                    <Shield size={17} />
                                  ) : (
                                    <ArrowDownLeft size={17} />
                                  )}
                                </span>
                                <span>
                                  <strong>{e.action}</strong>
                                  <small>
                                    {e.user} · {e.email}
                                  </small>
                                </span>
                              </div>
                            </td>
                            <td>{e.app}</td>
                            <td className="mono">{e.ip}</td>
                            <td className="subtle">{e.location}</td>
                            <td>
                              <Status
                                active={e.status === "success"}
                                label={e.status === "success" ? "成功" : "失败"}
                              />
                            </td>
                            <td className="subtle">{fmtTime(e.time)}</td>
                            <td>
                              <ChevronRight size={15} />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {!filteredEvents.length && <Empty />}
                  <div className="table-footer">
                    <span>
                      <ShieldCheck size={14} />
                      包含历史演示记录与本地实际认证事件
                    </span>
                    <button onClick={exportEvents}>
                      <Download size={14} />
                      导出当前结果
                    </button>
                  </div>
                </section>
              )}
              {page === "settings" && (
                <div className="settings-layout">
                  <section className="panel settings-panel">
                    <div className="panel-heading">
                      <div>
                        <h2>
                          <Building2 size={19} />
                          工作空间信息
                        </h2>
                        <p>当前本地演示环境的基本信息。</p>
                      </div>
                    </div>
                    {[
                      ["工作空间名称", "Acme 科技"],
                      ["工作空间标识", "acme-workspace"],
                      ["服务模式", "本地演示 · 单工作空间"],
                      ["协议版本", "OpenID Connect 1.0"],
                      ["数据存储", "SQLite · 本地持久化"],
                      ["OIDC Issuer", `${location.origin}/oidc`],
                    ].map(([k, v]) => (
                      <div className="setting-row" key={k}>
                        <h3>{k}</h3>
                        <span className={k === "OIDC Issuer" ? "mono" : ""}>
                          {v}
                        </span>
                      </div>
                    ))}
                    <div className="settings-actions">
                      <span>在当前设备上运行，演示数据独立保存</span>
                      <button className="button" onClick={() => go("security")}>
                        配置认证策略 <ArrowRight size={15} />
                      </button>
                    </div>
                  </section>
                  <aside className="workspace-information">
                    <span className="info-icon">
                      <FlaskConical size={24} />
                    </span>
                    <h3>为探索而准备</h3>
                    <p>
                      所有应用与成员均为演示数据。你可以创建应用、添加用户，并测试完整
                      OIDC 授权流程。
                    </p>
                    <p>
                      此版本的管理控制台为本地演示入口。生产使用需要补充管理端鉴权、访问权限隔离与部署配置。
                    </p>
                    <button
                      className="text-link"
                      onClick={() => openModal("docs")}
                    >
                      阅读接入文档 <ArrowUpRight size={15} />
                    </button>
                  </aside>
                </div>
              )}
              <footer className="main-footer">
                <span>
                  <span className="footer-mark">N</span>NEXUS Identity Platform{" "}
                  <span>·</span> 让信任连接一切
                </span>
                <span>
                  <i />
                  所有系统运行正常<span className="footer-separator">|</span>
                  v1.0.0
                </span>
              </footer>
            </>
          )}
        </main>
      </div>
      {toast && (
        <div className="toast" role="status">
          <span>
            <Check size={16} />
          </span>
          {toast}
          <button aria-label="关闭提示" onClick={() => setToast("")}>
            <X size={14} />
          </button>
        </div>
      )}
      {searchOpen && (
        <Modal title="搜索工作空间" onClose={() => setSearchOpen(false)}>
          <div className="command-search">
            <Search size={20} />
            <input
              aria-label="全局搜索"
              placeholder="搜索应用、用户和页面…"
              value={globalQuery}
              onChange={(e) => setGlobalQuery(e.target.value)}
              autoFocus
            />
          </div>
          <div className="search-results">
            {allSearch.slice(0, 9).map((r, i) => (
              <button key={i} onClick={r.action}>
                <span className="search-kind">{r.kind}</span>
                <span>
                  <strong>{r.name}</strong>
                  <small>{r.sub}</small>
                </span>
                <ArrowRight size={15} />
              </button>
            ))}
            {!allSearch.length && <Empty />}
          </div>
          <div className="search-hint">
            <kbd>Esc</kbd> 关闭搜索
          </div>
        </Modal>
      )}
      {(modal === "app" || modal === "user") && (
        <Modal
          title={modal === "app" ? "连接新应用" : "添加工作空间用户"}
          subtitle={
            modal === "app"
              ? "创建 OIDC 应用，为你的产品接入统一身份认证。"
              : "创建后，用户即可通过企业登录中心完成认证。"
          }
          onClose={() => setModal(null)}
        >
          <form className="create-form" onSubmit={createItem}>
            {modal === "app" ? (
              <>
                <label>
                  应用名称 <em>*</em>
                  <input
                    name="name"
                    placeholder="例如：企业知识库"
                    required
                    maxLength={80}
                  />
                </label>
                <label>
                  应用描述
                  <input
                    name="description"
                    placeholder="简单介绍这个应用的用途"
                    maxLength={180}
                  />
                </label>
                <label>
                  回调地址 <em>*</em>
                  <input
                    name="redirectUri"
                    type="url"
                    placeholder="http://localhost:3000/auth/callback"
                    required
                  />
                  <small>
                    只允许完整、精确匹配的回调地址；本地开发可使用 HTTP。
                  </small>
                </label>
                <label>
                  接入协议
                  <div className="protocol-choice">
                    <span className="radio-dot" />
                    <span>
                      <strong>OpenID Connect</strong>
                      <small>
                        Authorization Code + PKCE · 标准、安全、易集成
                      </small>
                    </span>
                    <span className="tag">推荐</span>
                  </div>
                </label>
              </>
            ) : (
              <>
                <div className="form-columns">
                  <label>
                    姓名 <em>*</em>
                    <input
                      name="name"
                      placeholder="例如：林晓"
                      required
                      maxLength={60}
                    />
                  </label>
                  <label>
                    所属部门 <em>*</em>
                    <input
                      name="department"
                      placeholder="例如：产品设计部"
                      required
                      maxLength={60}
                    />
                  </label>
                </div>
                <label>
                  工作邮箱 <em>*</em>
                  <input
                    name="email"
                    type="email"
                    placeholder="name@acme.com"
                    required
                  />
                </label>
                <label>
                  初始密码 <em>*</em>
                  <input
                    name="password"
                    type="password"
                    placeholder={`至少 ${data?.settings.passwordMinLength || 12} 位字符`}
                    minLength={data?.settings.passwordMinLength || 12}
                    required
                    autoComplete="new-password"
                  />
                  <small>请通过安全渠道将密码交给新成员。</small>
                </label>
                <label>
                  工作空间角色
                  <select name="role">
                    <option>成员</option>
                    <option>管理员</option>
                  </select>
                </label>
              </>
            )}
            {formError && (
              <div className="form-error" role="alert">
                {formError}
              </div>
            )}
            <div className="modal-actions">
              <button
                type="button"
                className="button"
                onClick={() => setModal(null)}
              >
                取消
              </button>
              <button className="button primary" disabled={busy}>
                {busy ? (
                  <LoaderCircle className="spin" size={16} />
                ) : (
                  <Plus size={16} />
                )}{" "}
                {modal === "app" ? "创建应用" : "添加用户"}
              </button>
            </div>
          </form>
        </Modal>
      )}
      {selectedApp && (
        <Modal
          title={selectedApp.name}
          subtitle="OIDC 应用详情与接入配置"
          onClose={() => {
            setSelectedApp(null);
            setEditingApp(false);
            setFormError("");
          }}
          wide
        >
          <div className="app-detail">
            {editingApp ? (
              <form className="create-form edit-app-form" onSubmit={updateApp}>
                <label>
                  应用名称
                  <input
                    name="name"
                    defaultValue={selectedApp.name}
                    required
                    maxLength={80}
                  />
                </label>
                <label>
                  应用描述
                  <input
                    name="description"
                    defaultValue={selectedApp.description}
                    maxLength={180}
                  />
                </label>
                <label>
                  回调地址
                  <input
                    name="redirectUri"
                    type="url"
                    defaultValue={selectedApp.redirectUri}
                    required
                  />
                  <small>回调地址必须与客户端配置完全一致。</small>
                </label>
                {formError && (
                  <div className="form-error" role="alert">
                    {formError}
                  </div>
                )}
                <div className="modal-actions">
                  <button
                    className="button"
                    type="button"
                    onClick={() => {
                      setEditingApp(false);
                      setFormError("");
                    }}
                  >
                    取消编辑
                  </button>
                  <button className="button primary" disabled={busy}>
                    {busy ? (
                      <LoaderCircle className="spin" size={15} />
                    ) : (
                      <Check size={15} />
                    )}
                    保存配置
                  </button>
                </div>
              </form>
            ) : (
              <>
                <div className="app-detail-summary">
                  <AppIcon app={selectedApp} />
                  <div>
                    <strong>{selectedApp.name}</strong>
                    <p>{selectedApp.description}</p>
                  </div>
                  <Status active={selectedApp.status === "active"} />
                </div>
                {[
                  ["Client ID", selectedApp.clientId],
                  ["Issuer", `${location.origin}/oidc`],
                  ["Redirect URI", selectedApp.redirectUri],
                  [
                    "Discovery URL",
                    `${location.origin}/oidc/.well-known/openid-configuration`,
                  ],
                ].map(([k, v]) => (
                  <div className="detail-field" key={k}>
                    <label>{k}</label>
                    <div>
                      <code>{v}</code>
                      <button
                        className="icon-button"
                        aria-label={`复制 ${k}`}
                        onClick={() => void copy(v)}
                      >
                        <Copy size={15} />
                      </button>
                    </div>
                  </div>
                ))}
                <div className="detail-two">
                  <span>
                    应用类型<strong>Public Client</strong>
                  </span>
                  <span>
                    授权方式<strong>Authorization Code + PKCE</strong>
                  </span>
                </div>
                <div className="detail-tip">
                  <ShieldCheck size={17} />
                  公共客户端无需 Client Secret，使用 PKCE S256 保护授权码。
                </div>
                <div className="modal-actions">
                  <button
                    className="button"
                    onClick={() => {
                      setEditingApp(true);
                      setFormError("");
                    }}
                  >
                    <Settings2 size={14} />
                    编辑配置
                  </button>
                  <button
                    className={`button ${selectedApp.status === "active" ? "danger-outline" : ""}`}
                    onClick={() => void toggleApp(selectedApp)}
                  >
                    {selectedApp.status === "active" ? "停用应用" : "启用应用"}
                  </button>
                  <button
                    className="button primary"
                    onClick={() => {
                      setSelectedApp(null);
                      go("oidc");
                    }}
                  >
                    进入 OIDC 实验室 <ArrowRight size={15} />
                  </button>
                </div>
              </>
            )}
          </div>
        </Modal>
      )}
      {selectedEvent && (
        <Modal
          title="审计事件详情"
          subtitle={`事件编号：${selectedEvent.id}`}
          onClose={() => setSelectedEvent(null)}
        >
          <div className="event-detail">
            {[
              ["操作", selectedEvent.action],
              ["用户", `${selectedEvent.user} · ${selectedEvent.email}`],
              ["应用", selectedEvent.app],
              ["IP 地址", selectedEvent.ip],
              ["位置", selectedEvent.location],
              ["时间", fmtTime(selectedEvent.time)],
              ["结果", selectedEvent.status === "success" ? "成功" : "失败"],
            ].map(([k, v]) => (
              <div key={k}>
                <span>{k}</span>
                <strong>{v}</strong>
              </div>
            ))}
          </div>
        </Modal>
      )}
      {modal === "docs" && (
        <Modal
          title="快速接入 NEXUS"
          subtitle="使用标准 OpenID Connect，连接你的应用与企业身份。"
          onClose={() => setModal(null)}
          wide
        >
          <div className="docs-content">
            <div className="docs-step">
              <span>01</span>
              <div>
                <h3>创建应用</h3>
                <p>
                  填写应用名称与回调地址，系统会生成独立的 Client
                  ID。回调地址必须与授权请求中的地址完全一致。
                </p>
              </div>
            </div>
            <div className="docs-step">
              <span>02</span>
              <div>
                <h3>配置 OIDC 客户端</h3>
                <p>使用兼容 OIDC 的客户端库，设置以下信息。</p>
                <pre>{`issuer: ${location.origin}/oidc\nclient_id: nexus-demo\nredirect_uri: ${location.origin}/callback\nresponse_type: code\nscope: openid profile email\ncode_challenge_method: S256`}</pre>
              </div>
            </div>
            <div className="docs-step">
              <span>03</span>
              <div>
                <h3>完成登录与校验</h3>
                <p>
                  生成 state、nonce 和 PKCE，发起授权；回调后交换 Token，验证 ID
                  Token 的签名、issuer、audience、有效期与 nonce。
                </p>
              </div>
            </div>
            <div className="docs-account">
              <KeyRound size={19} />
              <div>
                <strong>内置演示账号</strong>
                <code>admin@acme.com / Demo@2026!</code>
              </div>
              <button
                className="icon-button"
                aria-label="复制演示账号"
                onClick={() => void copy("admin@acme.com")}
              >
                <Copy size={16} />
              </button>
            </div>
            <div className="modal-actions">
              <a
                className="button"
                href="https://openid.net/specs/openid-connect-core-1_0.html"
                target="_blank"
                rel="noreferrer"
              >
                OIDC 标准文档 <ExternalLink size={14} />
              </a>
              <button
                className="button primary"
                onClick={() => {
                  setModal(null);
                  go("oidc");
                }}
              >
                现在测试登录 <ArrowRight size={15} />
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
