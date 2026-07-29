const SHELL_CACHE = "magireco-shell-v2";
const RESOURCE_CACHE = "magireco-runtime-assets-v1";
const STATE_CACHE = "magireco-player-state-v1";
const SHELL = ["/", "/index.html", "/manifest.webmanifest", "/runtime/official-bridge.js"];
let runtimeConfig = { apiBaseUrl: "", accessToken: "", accountId: "web" };

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => ![SHELL_CACHE, RESOURCE_CACHE, STATE_CACHE].includes(key))
          .map((key) => caches.delete(key)),
      ),
    ),
  );
  self.clients.claim();
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "MAGIRECO_RUNTIME_CONFIG") {
    const config = event.data.config || {};
    runtimeConfig = {
      apiBaseUrl: String(config.apiBaseUrl || "").replace(/\/+$/, ""),
      accessToken: String(config.accessToken || ""),
      accountId: String(config.accountId || "web"),
    };
  }
});

function securePath(pathname) {
  try {
    const decoded = decodeURIComponent(pathname);
    return !decoded.split("/").includes("..") && !decoded.includes("\\");
  } catch {
    return false;
  }
}

async function injectBridge(response) {
  const type = response.headers.get("content-type") || "";
  if (!type.includes("text/html")) return response;
  const html = await response.text();
  const script = '<script src="/runtime/official-bridge.js"></script>';
  const body = /<head[\s>]/i.test(html)
    ? html.replace(/<head([^>]*)>/i, "<head$1>" + script)
    : script + html;
  const headers = new Headers(response.headers);
  headers.delete("content-length");
  headers.delete("content-security-policy");
  return new Response(body, { status: response.status, statusText: response.statusText, headers });
}

async function gameApi(request, url) {
  if (!runtimeConfig.apiBaseUrl) {
    return new Response(JSON.stringify({
      error: { code: "GAME_API_NOT_CONFIGURED", message: "尚未配置游戏服务端地址" },
    }), { status: 503, headers: { "content-type": "application/json; charset=utf-8" } });
  }
  const target = new URL(url.pathname + url.search, runtimeConfig.apiBaseUrl);
  const headers = new Headers(request.headers);
  headers.delete("host");
  headers.delete("cookie");
  if (runtimeConfig.accessToken) headers.set("authorization", `Bearer ${runtimeConfig.accessToken}`);
  const response = await fetch(target, {
    method: request.method,
    headers,
    body: request.method === "GET" || request.method === "HEAD" ? undefined : await request.clone().arrayBuffer(),
    redirect: "follow",
    credentials: "omit",
  });
  if (response.status === 401) {
    const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of clients) client.postMessage({ type: "MAGIRECO_AUTH_REQUIRED" });
  }
  return response;
}

function stateCacheKey(pathname) {
  return new Request(
    new URL(`/__cnv_state/${encodeURIComponent(runtimeConfig.accountId)}${pathname}`, self.location.origin),
  );
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith("/magica/api/")) {
    event.respondWith((async () => {
      if (request.method === "GET" && url.pathname.startsWith("/magica/api/user/")) {
        const state = await caches.open(STATE_CACHE);
        const cached = await state.match(stateCacheKey(url.pathname));
        if (cached) return cached;
      }
      return gameApi(request, url);
    })());
    return;
  }

  if (request.method === "GET" && url.pathname.startsWith("/magica/")) {
    event.respondWith((async () => {
      if (!securePath(url.pathname)) return new Response("invalid path", { status: 400 });
      const cache = await caches.open(RESOURCE_CACHE);
      const cacheKey = new Request(url.origin + url.pathname, { method: "GET" });
      const cached = await cache.match(cacheKey);
      if (cached) return injectBridge(cached);
      // Android WebView falls through to the network when its local interceptor
      // has no static match. Keep the same order for server-rendered game pages.
      const network = await gameApi(request, url);
      return injectBridge(network);
    })());
    return;
  }

  if (request.method !== "GET") return;
  event.respondWith(
    fetch(request).catch(async () => {
      const cached = await caches.match(request);
      return cached || caches.match("/index.html");
    }),
  );
});
