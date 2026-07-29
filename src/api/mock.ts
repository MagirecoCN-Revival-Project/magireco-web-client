import { ApiError, type ApiTransport, type TransportRequest, type TransportResponse } from "./client";
import type {
  Account,
  AuthResult,
  AuthTokens,
  DeviceSession,
  ResourceBundle,
  ResourceManifest,
  ServerStatus,
} from "../types";

const now = () => new Date().toISOString();
const after = (minutes: number) => new Date(Date.now() + minutes * 60_000).toISOString();

const activeAccount: Account = {
  id: "acct_demo_001",
  displayName: "神滨调查员",
  playerCode: "MR-CN-0715-2201",
  rank: 84,
  status: "active",
  createdAt: "2026-05-11T10:30:00.000Z",
  lastLoginAt: now(),
  currencies: { magiaStone: 1280, supportPoint: 8640, coin: 1_927_500 },
  ban: { active: false },
};

const sessions: DeviceSession[] = [
  {
    id: "sess_current",
    deviceName: "当前浏览器",
    platform: "Web / Chromium",
    ipRegion: "CN · East",
    current: true,
    createdAt: "2026-07-27T10:02:00.000Z",
    lastSeenAt: now(),
  },
  {
    id: "sess_tablet",
    deviceName: "平板设备",
    platform: "Web / Android",
    ipRegion: "CN · East",
    current: false,
    createdAt: "2026-07-21T08:30:00.000Z",
    lastSeenAt: "2026-07-28T15:19:00.000Z",
  },
];

const bundles: ResourceBundle[] = [
  {
    id: "core-ui",
    title: "基础界面",
    description: "客户端外壳、界面字体、公共音效与最低运行数据。",
    version: "2026.07.29.1",
    sizeBytes: 42_188_800,
    state: "required",
    tags: ["core", "ui"],
    files: [],
  },
  {
    id: "story-main-01",
    title: "主线剧情 · 第一部",
    description: "主线章节索引、场景脚本与背景资源，进入章节时按需获取。",
    version: "2026.07.29.3",
    sizeBytes: 286_261_248,
    state: "streaming",
    tags: ["story", "main"],
    files: [],
  },
  {
    id: "voice-main-01",
    title: "主线语音包",
    description: "第一部主线语音，可选安装；未安装时使用文本模式。",
    version: "2026.07.29.2",
    sizeBytes: 1_258_291_200,
    state: "optional",
    tags: ["voice", "main"],
    files: [],
  },
  {
    id: "archive-cards",
    title: "角色档案扩展",
    description: "角色立绘、卡面与档案音频。默认仅加载缩略数据。",
    version: "2026.07.28.6",
    sizeBytes: 734_003_200,
    state: "optional",
    tags: ["archive", "card"],
    files: [],
  },
];

const manifest: ResourceManifest = {
  schemaVersion: 1,
  revision: "web-demo-20260729-01",
  generatedAt: now(),
  minimumClientVersion: "0.1.0",
  bundles,
};

function tokens(prefix = "demo"): AuthTokens {
  return {
    accessToken: `${prefix}.access.${crypto.randomUUID()}`,
    refreshToken: `${prefix}.refresh.${crypto.randomUUID()}`,
    accessExpiresAt: after(15),
    refreshExpiresAt: after(60 * 24 * 30),
  };
}

export class MockTransport implements ApiTransport {
  private loggedIn = false;
  private mutableSessions = [...sessions];

  async send<T>(request: TransportRequest): Promise<TransportResponse<T>> {
    await new Promise((resolve) => setTimeout(resolve, 160 + Math.random() * 180));
    const requestId = request.headers["x-request-id"] ?? crypto.randomUUID();
    const ok = (data: unknown, status = 200) =>
      ({ status, headers: { "x-request-id": requestId }, data }) as TransportResponse<T>;

    if (request.path === "/status") {
      const status: ServerStatus = {
        state: "online",
        region: "mock-cn-east",
        apiVersion: "v1",
        manifestRevision: manifest.revision,
        message: "演示服务运行正常",
      };
      return ok(status);
    }

    if (request.path === "/auth/login" && request.method === "POST") {
      const body = request.body as { username?: string; password?: string };
      if (body.username === "banned") {
        throw new ApiError(
          403,
          "ACCOUNT_BANNED",
          "此账号已被永久停用",
          requestId,
          { reason: "演示封禁状态", appealUrl: "/support/appeal" },
        );
      }
      if (!body.username || body.password !== "magia") {
        throw new ApiError(401, "INVALID_CREDENTIALS", "账号或密码错误", requestId);
      }
      this.loggedIn = true;
      const result: AuthResult = {
        account: { ...activeAccount, displayName: body.username === "demo" ? "神滨调查员" : body.username },
        tokens: tokens(),
        session: this.mutableSessions[0],
      };
      return ok(result);
    }

    if (request.path === "/auth/refresh" && request.method === "POST") {
      const body = request.body as { refreshToken?: string };
      if (!body.refreshToken?.includes(".refresh.")) {
        throw new ApiError(401, "REFRESH_TOKEN_REJECTED", "刷新令牌无效", requestId);
      }
      this.loggedIn = true;
      return ok(tokens("refreshed"));
    }

    const authorization = request.headers.authorization;
    if (!this.loggedIn && !authorization) {
      throw new ApiError(401, "AUTH_REQUIRED", "需要登录", requestId);
    }

    if (request.path === "/auth/logout") {
      this.loggedIn = false;
      return ok(undefined, 204);
    }
    if (request.path === "/account/me") return ok(activeAccount);
    if (request.path === "/account/sessions" && request.method === "GET") {
      return ok(this.mutableSessions);
    }
    if (request.path.startsWith("/account/sessions/") && request.method === "DELETE") {
      const id = decodeURIComponent(request.path.split("/").pop() ?? "");
      this.mutableSessions = this.mutableSessions.filter((session) => session.id !== id || session.current);
      return ok(undefined, 204);
    }
    if (request.path.startsWith("/resources/manifest")) return ok(manifest);

    throw new ApiError(404, "NOT_FOUND", `未实现的模拟接口：${request.path}`, requestId);
  }
}
