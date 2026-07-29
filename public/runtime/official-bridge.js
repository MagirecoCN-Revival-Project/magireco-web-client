(function () {
  "use strict";
  if (window.__MAGIRECO_WEB_BRIDGE__) return;
  window.__MAGIRECO_WEB_BRIDGE__ = true;

  var accountId = sessionStorage.getItem("magireco.runtime.account") || "web";
  var prefix = "magireco.cnv.state." + accountId;
  var stateCacheName = "magireco-player-state-v1";
  function valid(endpoint) {
    return typeof endpoint === "string" && endpoint.length <= 512 &&
      endpoint.indexOf("/magica/api/") === 0 && endpoint.indexOf("..") < 0;
  }
  function read() {
    try { return JSON.parse(localStorage.getItem(prefix) || "{}"); } catch (_) { return {}; }
  }
  function write(value) {
    localStorage.setItem(prefix, JSON.stringify(value));
  }
  function shouldCapture(path) {
    return path.indexOf("/magica/api/user/") === 0 &&
      !/(?:login|get|list|check|search|top|ranking|notice|announce|gift|gacha|draw)/i.test(path);
  }
  function cacheKey(endpoint) {
    return "/__cnv_state/" + encodeURIComponent(accountId) + endpoint;
  }
  function cacheResponse(endpoint, responseText) {
    if (!("caches" in window) || !valid(endpoint) || !responseText) return;
    caches.open(stateCacheName).then(function (cache) {
      return cache.put(cacheKey(endpoint), new Response(responseText, {
        status: 200,
        headers: { "content-type": "application/json; charset=utf-8", "x-cnv-cache": "hit" }
      }));
    }).catch(function () {});
  }

  window.CnvBridge = {
    saveState: function (endpoint, req, resp) {
      if (!valid(endpoint)) return;
      var value = read();
      value[endpoint] = { req: req || "", resp: resp || "", updatedAt: Date.now() };
      write(value);
      cacheResponse(endpoint, resp);
    },
    loadAllState: function () { return JSON.stringify(read()); },
    deleteState: function (endpoint) {
      if (!valid(endpoint)) return;
      var value = read();
      delete value[endpoint];
      write(value);
      if ("caches" in window) {
        caches.open(stateCacheName).then(function (cache) { return cache.delete(cacheKey(endpoint)); }).catch(function () {});
      }
    },
    getAccountId: function () { return accountId; }
  };

  function emit(command, payload) {
    var message = {
      type: "MAGIRECO_NATIVE_COMMAND",
      id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
      command: command,
      payload: payload
    };
    window.parent.postMessage(message, location.origin);
    return JSON.stringify({ accepted: true, id: message.id });
  }

  window.androidCommand = window.androidCommand || {
    jsCallback: function (raw) {
      try {
        var parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
        return emit(parsed.command || parsed.type || "callback", parsed);
      } catch (_) {
        return emit("callback", raw);
      }
    }
  };
  window.NativeBridge = window.NativeBridge || {
    getAppVersion: function () { return "3.0.1"; },
    getBundleId: function () { return "web.magireco.cnv"; },
    getDeviceName: function () { return navigator.userAgent; },
    getOSVersion: function () { return navigator.platform || "Web"; },
    getUUID: function () {
      var key = "magireco.device.id";
      var value = localStorage.getItem(key);
      if (!value) {
        value = crypto.randomUUID ? crypto.randomUUID() : String(Date.now());
        localStorage.setItem(key, value);
      }
      return value;
    },
    getRemainStorage: function () { return 0; },
    isUnauthorizedUser: function () { return false; },
    openUrl: function (url) { window.open(String(url), "_blank", "noopener"); },
    setClipboard: function (value) {
      if (navigator.clipboard) navigator.clipboard.writeText(String(value));
    },
    preventScreenLock: function () {},
    onCloseApplication: function () { emit("close", null); }
  };
  window.addEventListener("message", function (event) {
    if (event.origin !== location.origin || event.data?.type !== "MAGIRECO_NATIVE_RESULT") return;
    window.dispatchEvent(new CustomEvent("magireco-native-result", { detail: event.data }));
    if (typeof window.onNativeCommandResult === "function") window.onNativeCommandResult(event.data);
  });

  // Capture replayable user-state POSTs, matching CNV's endpoint boundary.
  var originalFetch = window.fetch.bind(window);
  window.fetch = async function (input, init) {
    var url;
    var method;
    try {
      url = new URL(typeof input === "string" ? input : input.url, location.href);
      method = String((init && init.method) || (input && input.method) || "GET").toUpperCase();
      if (method === "GET" && url.pathname.indexOf("/magica/api/user/") === 0) {
        var cached = read()[url.pathname];
        if (cached && typeof cached.resp === "string" && cached.resp) {
          return new Response(cached.resp, {
            status: 200,
            headers: { "content-type": "application/json; charset=utf-8", "x-cnv-cache": "hit" }
          });
        }
      }
    } catch (_) {}
    var response = await originalFetch(input, init);
    try {
      if (method === "POST" && valid(url.pathname) && shouldCapture(url.pathname) && response.ok) {
        var text = await response.clone().text();
        window.CnvBridge.saveState(url.pathname, String((init && init.body) || ""), text);
      }
    } catch (_) {}
    return response;
  };

  // The original pages commonly use XMLHttpRequest rather than fetch.
  var originalXhrOpen = XMLHttpRequest.prototype.open;
  var originalXhrSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (method, url) {
    this.__cnvMethod = String(method || "GET").toUpperCase();
    try { this.__cnvUrl = new URL(String(url), location.href); } catch (_) { this.__cnvUrl = null; }
    return originalXhrOpen.apply(this, arguments);
  };
  XMLHttpRequest.prototype.send = function (body) {
    var xhr = this;
    var requestBody = body;
    xhr.addEventListener("load", function () {
      try {
        if (xhr.__cnvMethod === "POST" && xhr.__cnvUrl &&
            shouldCapture(xhr.__cnvUrl.pathname) && xhr.status >= 200 && xhr.status < 300) {
          window.CnvBridge.saveState(xhr.__cnvUrl.pathname, String(requestBody || ""), xhr.responseText || "");
        }
      } catch (_) {}
    });
    return originalXhrSend.apply(this, arguments);
  };

  // Stateless game backends need replayable account state rebuilt once per tab.
  // Replays are sequential to preserve the original write order.
  var replayKey = "magireco.cnv.replayed." + accountId;
  if (!sessionStorage.getItem(replayKey)) {
    sessionStorage.setItem(replayKey, "1");
    var replayState = read();
    Object.keys(replayState).forEach(function (endpoint) {
      if (replayState[endpoint] && replayState[endpoint].resp) {
        cacheResponse(endpoint, replayState[endpoint].resp);
      }
    });
    Object.keys(replayState)
      .sort(function (a, b) { return (replayState[a].updatedAt || 0) - (replayState[b].updatedAt || 0); })
      .reduce(function (chain, endpoint) {
        return chain.then(async function () {
          var entry = replayState[endpoint];
          if (!valid(endpoint) || !shouldCapture(endpoint) || !entry.req) return;
          var result = await originalFetch(endpoint, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: entry.req
          });
          if (!result.ok) {
            var next = read();
            delete next[endpoint];
            write(next);
          }
        });
      }, Promise.resolve())
      .catch(function () {});
  }
})();
