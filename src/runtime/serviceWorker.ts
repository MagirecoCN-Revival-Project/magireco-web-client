import type { RuntimeConfig } from "../types";

export async function registerRuntimeWorker(config: RuntimeConfig): Promise<ServiceWorkerRegistration | null> {
  if (!("serviceWorker" in navigator)) return null;
  const registration = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  await navigator.serviceWorker.ready;
  const send = () => {
    (registration.active ?? navigator.serviceWorker.controller)?.postMessage({
      type: "MAGIRECO_RUNTIME_CONFIG",
      config,
    });
  };
  send();
  navigator.serviceWorker.addEventListener("controllerchange", send, { once: true });
  return registration;
}

export function runtimeUrl(entry: string): string {
  const path = entry.replace(/^\/+/, "").replace(/^magica\//, "");
  return `/magica/${path}`;
}
