import { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity, Box, Check, ChevronRight, Database, Download, FileKey2, FolderOpen,
  Gamepad2, HardDrive, KeyRound, LogOut, Play, RefreshCw, Server, ShieldCheck,
  Smartphone, Trash2, UserRound, Wifi, XCircle,
} from "lucide-react";
import { ApiClient, ApiError, BrowserTokenStore, FetchTransport } from "./api/client";
import { MockTransport } from "./api/mock";
import { runtimeAssetStore, type ImportProgress } from "./runtime/assetStore";
import { OfficialRuntime } from "./runtime/OfficialRuntime";
import { assertManifestTrusted } from "./resources/signature";
import { createDefaultNativeRouter } from "./runtime/nativeRouter";
import type {
  Account, AuthTokens, DeviceSession, ResourceManifest, RuntimeConfig, RuntimeStats, ServerStatus,
} from "./types";
import "./styles.css";

type Page = "launch" | "resources" | "account" | "system";

const tokenStore = new BrowserTokenStore();
const apiBase = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "/v1";
const useMock = String(import.meta.env.VITE_USE_MOCK_API ?? "true") !== "false";
const api = new ApiClient(useMock ? new MockTransport() : new FetchTransport(apiBase), tokenStore);

function formatBytes(bytes: number) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const unit = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** unit).toFixed(unit > 1 ? 2 : 0)} ${units[unit]}`;
}

function useBoot() {
  const [status, setStatus] = useState<ServerStatus | null>(null);
  const [account, setAccount] = useState<Account | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    Promise.allSettled([api.status(), tokenStore.read() ? api.me() : Promise.resolve(null)]).then(([s, a]) => {
      if (s.status === "fulfilled") setStatus(s.value);
      if (a.status === "fulfilled") setAccount(a.value);
      setLoading(false);
    });
  }, []);
  return { status, account, setAccount, loading };
}

function Login({ onLogin, status }: { onLogin: (account: Account) => void; status: ServerStatus | null }) {
  const [username, setUsername] = useState("demo");
  const [password, setPassword] = useState("magia");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await api.login(username, password, "Web Client");
      onLogin(result.account);
    } catch (reason) {
      const detail = reason instanceof ApiError ? `${reason.message} · ${reason.code}` : String(reason);
      setError(detail);
    } finally {
      setBusy(false);
    }
  };
  return (
    <main className="auth-layout">
      <section className="brand-stage">
        <div className="brand-orbit orbit-a" /><div className="brand-orbit orbit-b" />
        <div className="brand-mark"><i /><i /><i /><i /><i /><span>CNV</span></div>
        <p className="eyebrow">MAGIRECO CN REVIVAL PROJECT</p>
        <h1>让记录，再次相连。</h1>
        <p className="lead">浏览器原生的 WebView 兼容层。游戏资源由玩家本地导入或经服务端鉴权后按需获取，仓库不包含官方美术与音频。</p>
        <div className="trust-row">
          <span><ShieldCheck /> 资源哈希校验</span>
          <span><FileKey2 /> 会话隔离</span>
          <span><HardDrive /> 本地虚拟文件系统</span>
        </div>
      </section>
      <section className="auth-panel">
        <div className="server-pill">
          <span className={status?.state === "online" ? "dot online" : "dot"} />
          {status ? `${status.region} · ${status.message}` : "正在探测服务"}
        </div>
        <div className="auth-copy"><span>01 / ACCOUNT</span><h2>连接神滨记录</h2><p>使用复刻计划账号继续。访问令牌仅保存在当前标签会话。</p></div>
        <form onSubmit={submit}>
          <label><span>账号</span><div className="field"><UserRound /><input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" /></div></label>
          <label><span>密码</span><div className="field"><KeyRound /><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" /></div></label>
          {error && <div className="form-error"><XCircle />{error}</div>}
          <button className="primary-button" disabled={busy}>{busy ? <RefreshCw className="spin" /> : <ChevronRight />}{busy ? "验证中" : "进入客户端"}</button>
        </form>
        {useMock && <p className="demo-hint">演示环境：demo / magia　·　封禁态账号：banned</p>}
      </section>
    </main>
  );
}

function ResourceManager({
  manifest, stats, onStats,
}: { manifest: ResourceManifest | null; stats: RuntimeStats; onStats: (s: RuntimeStats) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<ImportProgress | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const importFolder = async (list: FileList | null) => {
    if (!list?.length) return;
    setBusy(true); setError("");
    try {
      onStats(await runtimeAssetStore.importFiles([...list], setProgress));
    } catch (reason) {
      setError(String(reason));
    } finally {
      setBusy(false); setProgress(null);
      if (input.current) input.current.value = "";
    }
  };
  const install = async () => {
    if (!manifest) return;
    const files = manifest.bundles.flatMap((bundle) => bundle.files);
    if (!files.length) {
      setError("当前清单是接口演示数据，不含下载 URL；请导入玩家本地已有的 magica 目录。");
      return;
    }
    setBusy(true); setError("");
    try {
      await assertManifestTrusted(
        manifest,
        import.meta.env.VITE_RESOURCE_MANIFEST_PUBLIC_KEY as string | undefined,
        useMock,
      );
      onStats(await runtimeAssetStore.installManifestFiles(files, tokenStore.read()?.accessToken, setProgress));
    } catch (reason) { setError(String(reason)); }
    finally { setBusy(false); setProgress(null); }
  };
  return (
    <section className="content-page">
      <header className="page-title"><div><span>02 / ASSET ROUTER</span><h2>运行资源</h2><p>资源只写入浏览器 Cache Storage，不会进入 Git 工作树。</p></div><Database /></header>
      <div className="resource-hero">
        <div className="meter" style={{ "--value": stats.entryReady ? "100%" : stats.files ? "64%" : "5%" } as React.CSSProperties}>
          <div><strong>{stats.entryReady ? "READY" : "WAIT"}</strong><span>{stats.files} FILES</span></div>
        </div>
        <div className="resource-copy">
          <h3>{stats.entryReady ? "入口文件已就绪" : "导入官方 Web 资源目录"}</h3>
          <p>选择来自玩家既有安装的 <code>magica/</code> 目录。客户端会规范化路径、计算 SHA-256，并映射到同源虚拟路径。</p>
          <div className="stat-grid"><span><b>{formatBytes(stats.bytes)}</b>本地占用</span><span><b>{manifest?.revision ?? "—"}</b>服务端清单</span><span><b>SHA-256</b>完整性</span></div>
        </div>
      </div>
      <div className="action-row">
        <input
          ref={input}
          type="file"
          multiple
          className="sr-only"
          onChange={(e) => void importFolder(e.currentTarget.files)}
          {...({ webkitdirectory: "", directory: "" } as React.InputHTMLAttributes<HTMLInputElement>)}
        />
        <button className="primary-button compact" onClick={() => input.current?.click()} disabled={busy}><FolderOpen />导入本地目录</button>
        <button className="line-button" onClick={() => void install()} disabled={busy}><Download />按清单获取</button>
        <button className="danger-button" onClick={() => void runtimeAssetStore.clear().then(() => runtimeAssetStore.stats()).then(onStats)} disabled={busy}><Trash2 />清除运行资源</button>
      </div>
      {progress && <div className="progress-card"><div><span>{progress.path}</span><b>{progress.current} / {progress.total}</b></div><progress max={progress.total} value={progress.current} /></div>}
      {error && <div className="notice warning"><XCircle />{error}</div>}
      <div className="bundle-grid">
        {(manifest?.bundles ?? []).map((bundle) => <article className="bundle" key={bundle.id}><div><Box /><span className={`bundle-kind ${bundle.state}`}>{bundle.state}</span></div><h4>{bundle.title}</h4><p>{bundle.description}</p><footer><span>{formatBytes(bundle.sizeBytes)}</span><span>{bundle.version}</span></footer></article>)}
      </div>
    </section>
  );
}

function AccountPage({ account }: { account: Account }) {
  const [sessions, setSessions] = useState<DeviceSession[]>([]);
  useEffect(() => { void api.sessions().then(setSessions); }, []);
  const revoke = async (id: string) => { await api.revokeSession(id); setSessions(await api.sessions()); };
  return (
    <section className="content-page">
      <header className="page-title"><div><span>03 / IDENTITY</span><h2>账号与设备</h2><p>会话、状态与封禁信息由服务端统一裁定。</p></div><UserRound /></header>
      <div className="account-card"><div className="avatar">{account.displayName.slice(0, 1)}</div><div><span>{account.playerCode}</span><h3>{account.displayName}</h3><p>RANK {account.rank} · {account.status.toUpperCase()}</p></div><div className="account-status"><ShieldCheck />正常</div></div>
      <h3 className="section-heading">活跃会话</h3>
      <div className="session-list">
        {sessions.map((session) => <div className="session" key={session.id}><Smartphone /><div><b>{session.deviceName}{session.current && <em>当前</em>}</b><span>{session.platform} · {session.ipRegion}</span></div><time>{new Date(session.lastSeenAt).toLocaleString()}</time>{!session.current && <button onClick={() => void revoke(session.id)}>撤销</button>}</div>)}
      </div>
    </section>
  );
}

function SystemPage({ status }: { status: ServerStatus | null }) {
  return (
    <section className="content-page">
      <header className="page-title"><div><span>04 / DIAGNOSTICS</span><h2>兼容层状态</h2><p>浏览器运行时与服务端能力检查。</p></div><Activity /></header>
      <div className="diagnostics">
        {[
          ["Service Worker", "serviceWorker" in navigator, "虚拟 /magica 文件路由"],
          ["Cache Storage", "caches" in window, "按需资源持久化"],
          ["Web Crypto", Boolean(crypto.subtle), "SHA-256 / Ed25519"],
          ["WebGL 2", Boolean(document.createElement("canvas").getContext("webgl2")), "Cocos / Cubism 渲染"],
          ["Web Audio", "AudioContext" in window || "webkitAudioContext" in window, "剧情与战斗音频"],
          ["Game API", status?.state === "online", status?.message ?? "未连接"],
        ].map(([name, ok, note]) => <div className="diagnostic" key={String(name)}><span className={ok ? "check" : "off"}>{ok ? <Check /> : <XCircle />}</span><div><b>{name}</b><small>{note}</small></div><em>{ok ? "PASS" : "WAIT"}</em></div>)}
      </div>
      <div className="architecture-strip"><span>OFFICIAL WEB PACKAGE</span><ChevronRight /><span>SW VIRTUAL FS</span><ChevronRight /><span>BRIDGE SHIM</span><ChevronRight /><span>CNV API</span></div>
    </section>
  );
}

function Client({ account, status, onLogout }: { account: Account; status: ServerStatus | null; onLogout: () => void }) {
  const [page, setPage] = useState<Page>("launch");
  const [runtime, setRuntime] = useState(false);
  const [entry, setEntry] = useState(localStorage.getItem("magireco.runtime.entry") ?? "index.html");
  const [stats, setStats] = useState<RuntimeStats>({ files: 0, bytes: 0, entryReady: false });
  const [manifest, setManifest] = useState<ResourceManifest | null>(null);
  const [accessToken, setAccessToken] = useState(tokenStore.read()?.accessToken);
  useEffect(() => {
    void runtimeAssetStore.stats(entry).then(setStats);
    void api.manifest().then(setManifest).catch(() => undefined);
  }, [entry]);
  useEffect(() => {
    const tokens = tokenStore.read();
    if (!tokens) return;
    const refreshAt = Math.max(5_000, new Date(tokens.accessExpiresAt).getTime() - Date.now() - 60_000);
    const timer = window.setTimeout(() => {
      void api.refresh().then((next) => setAccessToken(next.accessToken)).catch(onLogout);
    }, refreshAt);
    return () => clearTimeout(timer);
  }, [accessToken, onLogout]);
  useEffect(() => {
    const refresh = () => {
      void api.refresh().then((next) => setAccessToken(next.accessToken)).catch(onLogout);
    };
    window.addEventListener("magireco:auth-required", refresh);
    return () => window.removeEventListener("magireco:auth-required", refresh);
  }, [onLogout]);
  useEffect(() => {
    const router = createDefaultNativeRouter().start();
    return () => router.stop();
  }, []);
  const config = useMemo<RuntimeConfig>(() => ({
    apiBaseUrl: (import.meta.env.VITE_GAME_API_BASE_URL as string | undefined) ?? apiBase.replace(/\/v1\/?$/, ""),
    assetEntry: entry,
    accountId: account.id,
    accessToken,
  }), [entry, account.id, accessToken]);
  if (runtime) return <OfficialRuntime config={config} onClose={() => setRuntime(false)} />;
  return (
    <div className="client-shell">
      <aside className="sidebar">
        <div className="mini-brand"><span>MR</span><div><b>CN REVIVAL</b><small>WEB RUNTIME</small></div></div>
        <nav>
          {([
            ["launch", Play, "启动游戏", "LAUNCH"],
            ["resources", Database, "运行资源", "ASSETS"],
            ["account", UserRound, "账号设备", "ACCOUNT"],
            ["system", Activity, "兼容状态", "SYSTEM"],
          ] as const).map(([id, Icon, label, english]) => <button className={page === id ? "active" : ""} onClick={() => setPage(id)} key={id}><Icon /><span>{label}<small>{english}</small></span></button>)}
        </nav>
        <footer><div className="connection"><Wifi /><span>{status?.state ?? "offline"}<small>{status?.region ?? "no endpoint"}</small></span></div><button onClick={onLogout}><LogOut /></button></footer>
      </aside>
      <main className="workspace">
        {page === "launch" && <section className="launch-page">
          <div className="launch-grid">
            <div className="launch-copy"><span className="eyebrow">OFFICIAL WEBVIEW COMPATIBILITY LAYER</span><h1>浏览器中的<br /><em>神滨记录</em></h1><p>不重画元游戏 UI：在运行时加载原版 Web 包，用 Service Worker 复刻 Android WebView 的静态拦截、API 分流与 CNV 状态桥。</p>
              <div className="entry-field"><label>Web 包入口</label><div><input value={entry} onChange={(e) => { setEntry(e.target.value); localStorage.setItem("magireco.runtime.entry", e.target.value); }} /><span>/magica/</span></div></div>
              <button className="launch-button" onClick={() => stats.entryReady ? setRuntime(true) : setPage("resources")}><Gamepad2 /><span><b>{stats.entryReady ? "启动游戏" : "安装运行资源"}</b><small>{stats.entryReady ? `/magica/${entry}` : "需要玩家本地资源或授权清单"}</small></span><ChevronRight /></button>
            </div>
            <div className="launch-visual"><div className="portal"><i /><i /><i /><div>RECORD<br /><b>READY</b></div></div><div className="telemetry top"><Server /><span>API ROUTE<b>{status?.state ?? "WAIT"}</b></span></div><div className="telemetry bottom"><HardDrive /><span>VIRTUAL FS<b>{stats.files} FILES</b></span></div></div>
          </div>
          <div className="runtime-features"><article><b>01</b><div><h3>像原版一样渲染</h3><p>官方 Web 包直接运行；CSS、布局、动效与资源路径保持原样。</p></div></article><article><b>02</b><div><h3>Native 命令接管</h3><p>剧情、战斗、Live2D 与音频命令进入独立浏览器适配器。</p></div></article><article><b>03</b><div><h3>资产零入库</h3><p>美术与音频只存在于用户浏览器缓存或鉴权资源节点。</p></div></article></div>
        </section>}
        {page === "resources" && <ResourceManager manifest={manifest} stats={stats} onStats={setStats} />}
        {page === "account" && <AccountPage account={account} />}
        {page === "system" && <SystemPage status={status} />}
      </main>
    </div>
  );
}

export default function App() {
  const { status, account, setAccount, loading } = useBoot();
  if (loading) return <div className="splash"><div className="brand-mark small"><i /><i /><i /><i /><i /><span>CNV</span></div><span>正在初始化兼容运行时…</span></div>;
  if (!account) return <Login status={status} onLogin={setAccount} />;
  return <Client account={account} status={status} onLogout={() => void api.logout().then(() => setAccount(null))} />;
}
