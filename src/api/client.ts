import type {
  Account,
  AuthResult,
  AuthTokens,
  DeviceSession,
  ResourceManifest,
  ServerStatus,
} from "../types";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly requestId = "local",
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export interface TransportRequest {
  method: "GET" | "POST" | "PATCH" | "DELETE";
  path: string;
  headers: Record<string, string>;
  body?: unknown;
  signal?: AbortSignal;
}

export interface TransportResponse<T> {
  status: number;
  headers: Record<string, string>;
  data: T;
}

export interface ApiTransport {
  send<T>(request: TransportRequest): Promise<TransportResponse<T>>;
}

export interface TokenStore {
  read(): AuthTokens | null;
  write(tokens: AuthTokens): void;
  clear(): void;
}

export class BrowserTokenStore implements TokenStore {
  private readonly key = "magireco.auth.tokens";

  read(): AuthTokens | null {
    try {
      const value = sessionStorage.getItem(this.key);
      return value ? (JSON.parse(value) as AuthTokens) : null;
    } catch {
      return null;
    }
  }

  write(tokens: AuthTokens): void {
    sessionStorage.setItem(this.key, JSON.stringify(tokens));
  }

  clear(): void {
    sessionStorage.removeItem(this.key);
  }
}

export class MemoryTokenStore implements TokenStore {
  private tokens: AuthTokens | null = null;
  read = () => this.tokens;
  write = (tokens: AuthTokens) => {
    this.tokens = tokens;
  };
  clear = () => {
    this.tokens = null;
  };
}

export class FetchTransport implements ApiTransport {
  constructor(private readonly baseUrl: string) {}

  async send<T>(request: TransportRequest): Promise<TransportResponse<T>> {
    const response = await fetch(`${this.baseUrl}${request.path}`, {
      method: request.method,
      headers: {
        "content-type": "application/json",
        ...request.headers,
      },
      body: request.body === undefined ? undefined : JSON.stringify(request.body),
      signal: request.signal,
      credentials: "omit",
    });

    const requestId = response.headers.get("x-request-id") ?? crypto.randomUUID();
    const data = (await response.json().catch(() => ({}))) as T & {
      error?: { code?: string; message?: string; details?: Record<string, unknown> };
    };
    if (!response.ok) {
      throw new ApiError(
        response.status,
        data.error?.code ?? "HTTP_ERROR",
        data.error?.message ?? `请求失败（${response.status}）`,
        requestId,
        data.error?.details,
      );
    }

    return {
      status: response.status,
      headers: { "x-request-id": requestId },
      data,
    };
  }
}

interface RequestOptions {
  body?: unknown;
  signal?: AbortSignal;
  auth?: boolean;
  retryAuth?: boolean;
}

export class ApiClient {
  private refreshPromise: Promise<AuthTokens> | null = null;

  constructor(
    private readonly transport: ApiTransport,
    private readonly tokenStore: TokenStore,
  ) {}

  private async request<T>(
    method: TransportRequest["method"],
    path: string,
    options: RequestOptions = {},
  ): Promise<T> {
    const headers: Record<string, string> = {
      "x-client-version": "0.2.0",
      "x-client-platform": "web",
      "x-request-id": crypto.randomUUID(),
    };
    const tokens = this.tokenStore.read();
    if (options.auth !== false && tokens) {
      headers.authorization = `Bearer ${tokens.accessToken}`;
    }

    try {
      const response = await this.transport.send<T>({
        method,
        path,
        headers,
        body: options.body,
        signal: options.signal,
      });
      return response.data;
    } catch (error) {
      const shouldRefresh =
        error instanceof ApiError &&
        error.status === 401 &&
        options.auth !== false &&
        options.retryAuth !== false &&
        Boolean(this.tokenStore.read()?.refreshToken);
      if (!shouldRefresh) throw error;
      await this.refresh();
      return this.request<T>(method, path, { ...options, retryAuth: false });
    }
  }

  async login(username: string, password: string, deviceName: string): Promise<AuthResult> {
    const result = await this.request<AuthResult>("POST", "/auth/login", {
      auth: false,
      body: {
        username,
        password,
        device: {
          id: getDeviceId(),
          name: deviceName,
          platform: navigator.userAgent,
        },
      },
    });
    this.tokenStore.write(result.tokens);
    return result;
  }

  async refresh(): Promise<AuthTokens> {
    if (this.refreshPromise) return this.refreshPromise;
    const refreshToken = this.tokenStore.read()?.refreshToken;
    if (!refreshToken) throw new ApiError(401, "AUTH_REQUIRED", "登录状态已失效");
    this.refreshPromise = this.request<AuthTokens>("POST", "/auth/refresh", {
      auth: false,
      retryAuth: false,
      body: { refreshToken, deviceId: getDeviceId() },
    })
      .then((tokens) => {
        this.tokenStore.write(tokens);
        return tokens;
      })
      .finally(() => {
        this.refreshPromise = null;
      });
    return this.refreshPromise;
  }

  async logout(): Promise<void> {
    try {
      await this.request<void>("POST", "/auth/logout", {
        body: { refreshToken: this.tokenStore.read()?.refreshToken },
        retryAuth: false,
      });
    } finally {
      this.tokenStore.clear();
    }
  }

  me = () => this.request<Account>("GET", "/account/me");
  sessions = () => this.request<DeviceSession[]>("GET", "/account/sessions");
  revokeSession = (sessionId: string) =>
    this.request<void>("DELETE", `/account/sessions/${encodeURIComponent(sessionId)}`);
  manifest = () => this.request<ResourceManifest>("GET", "/resources/manifest?platform=web");
  status = () => this.request<ServerStatus>("GET", "/status", { auth: false });
}

export function getDeviceId(): string {
  const key = "magireco.device.id";
  let value = localStorage.getItem(key);
  if (!value) {
    value = crypto.randomUUID();
    localStorage.setItem(key, value);
  }
  return value;
}
