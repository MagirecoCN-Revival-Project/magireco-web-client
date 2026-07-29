import { useEffect, useRef, useState } from "react";
import { Maximize, RefreshCw, X } from "lucide-react";
import type { RuntimeConfig } from "../types";
import { registerRuntimeWorker, runtimeUrl } from "./serviceWorker";

interface Props {
  config: RuntimeConfig;
  onClose: () => void;
}

export function OfficialRuntime({ config, onClose }: Props) {
  const iframe = useRef<HTMLIFrameElement>(null);
  const [ready, setReady] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    sessionStorage.setItem("magireco.runtime.account", config.accountId);
    void registerRuntimeWorker(config).then(() => setReady(true));
  }, [config]);

  useEffect(() => {
    const listener = (event: MessageEvent) => {
      if (event.data?.type === "MAGIRECO_NATIVE_COMMAND") {
        window.dispatchEvent(new CustomEvent("magireco:native-command", { detail: event.data }));
      }
    };
    window.addEventListener("message", listener);
    const workerListener = (event: MessageEvent) => {
      if (event.data?.type === "MAGIRECO_AUTH_REQUIRED") {
        window.dispatchEvent(new CustomEvent("magireco:auth-required"));
      }
    };
    navigator.serviceWorker?.addEventListener("message", workerListener);
    const resultListener = (event: Event) => {
      iframe.current?.contentWindow?.postMessage(
        { type: "MAGIRECO_NATIVE_RESULT", ...(event as CustomEvent).detail },
        location.origin,
      );
    };
    window.addEventListener("magireco:native-result", resultListener);
    return () => {
      window.removeEventListener("message", listener);
      navigator.serviceWorker?.removeEventListener("message", workerListener);
      window.removeEventListener("magireco:native-result", resultListener);
    };
  }, []);

  const toggleFullscreen = async () => {
    const shell = iframe.current?.parentElement;
    if (!document.fullscreenElement) {
      await shell?.requestFullscreen();
      setFullscreen(true);
    } else {
      await document.exitFullscreen();
      setFullscreen(false);
    }
  };

  return (
    <section className="runtime-screen" aria-label="游戏运行时">
      <div className="runtime-toolbar">
        <div><span className="live-dot" /> 官方 Web 包兼容运行时</div>
        <div className="runtime-actions">
          <button onClick={() => iframe.current?.contentWindow?.location.reload()} title="重新载入"><RefreshCw /></button>
          <button onClick={() => void toggleFullscreen()} title="全屏"><Maximize /></button>
          <button onClick={onClose} title="关闭"><X /></button>
        </div>
      </div>
      {!ready && <div className="runtime-loading"><span className="spinner" />正在注册资源路由…</div>}
      {ready && (
        <iframe
          ref={iframe}
          title="Magireco official web runtime"
          src={runtimeUrl(config.assetEntry)}
          allow="autoplay; fullscreen; gamepad"
        />
      )}
      {fullscreen && <span className="sr-only">全屏模式</span>}
    </section>
  );
}
