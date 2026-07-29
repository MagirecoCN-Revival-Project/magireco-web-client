import type { ResourceFile, RuntimeStats } from "../types";

const CACHE_NAME = "magireco-runtime-assets-v1";
const META_KEY = "magireco.runtime.meta";

export interface StoredAssetMeta {
  path: string;
  bytes: number;
  sha256: string;
  contentType: string;
  installedAt: string;
}

export interface ImportProgress {
  current: number;
  total: number;
  path: string;
  bytes: number;
}

function normalizePath(input: string): string {
  const value = input.replaceAll("\\", "/").replace(/^\/+/, "");
  const marker = value.indexOf("magica/");
  const path = marker >= 0 ? value.slice(marker + "magica/".length) : value.split("/").slice(1).join("/");
  const normalized = path || value;
  if (!normalized || normalized.split("/").some((part) => part === "..")) {
    throw new Error(`不安全的资源路径：${input}`);
  }
  return normalized;
}

function virtualUrl(path: string): string {
  return new URL(`/magica/${normalizePath(path)}`, location.origin).toString();
}

async function sha256(blob: Blob): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
}

function contentType(file: File | Blob, path: string): string {
  if (file.type) return file.type;
  const ext = path.split(".").pop()?.toLowerCase();
  const types: Record<string, string> = {
    html: "text/html; charset=utf-8",
    htm: "text/html; charset=utf-8",
    js: "text/javascript; charset=utf-8",
    css: "text/css; charset=utf-8",
    json: "application/json; charset=utf-8",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    webp: "image/webp",
    svg: "image/svg+xml",
    plist: "application/xml",
    mp3: "audio/mpeg",
    ogg: "audio/ogg",
    wasm: "application/wasm",
  };
  return types[ext ?? ""] ?? "application/octet-stream";
}

function readMeta(): StoredAssetMeta[] {
  try {
    return JSON.parse(localStorage.getItem(META_KEY) ?? "[]") as StoredAssetMeta[];
  } catch {
    return [];
  }
}

function writeMeta(meta: StoredAssetMeta[]) {
  localStorage.setItem(META_KEY, JSON.stringify(meta));
}

export class RuntimeAssetStore {
  async stats(entry = "index.html"): Promise<RuntimeStats> {
    const meta = readMeta();
    const cache = await caches.open(CACHE_NAME);
    return {
      files: meta.length,
      bytes: meta.reduce((sum, item) => sum + item.bytes, 0),
      entryReady: Boolean(await cache.match(virtualUrl(entry))),
    };
  }

  async importFiles(
    files: File[],
    onProgress?: (progress: ImportProgress) => void,
  ): Promise<RuntimeStats> {
    const cache = await caches.open(CACHE_NAME);
    const old = new Map(readMeta().map((item) => [item.path, item]));
    let bytes = 0;
    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];
      const sourcePath = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
      const path = normalizePath(sourcePath);
      const hash = await sha256(file);
      const type = contentType(file, path);
      await cache.put(
        virtualUrl(path),
        new Response(file, {
          status: 200,
          headers: {
            "content-type": type,
            "content-length": String(file.size),
            "x-magireco-sha256": hash,
          },
        }),
      );
      old.set(path, {
        path,
        bytes: file.size,
        sha256: hash,
        contentType: type,
        installedAt: new Date().toISOString(),
      });
      bytes += file.size;
      onProgress?.({ current: index + 1, total: files.length, path, bytes });
    }
    writeMeta([...old.values()]);
    return this.stats();
  }

  async installManifestFiles(
    files: ResourceFile[],
    accessToken: string | undefined,
    onProgress?: (progress: ImportProgress) => void,
  ): Promise<RuntimeStats> {
    const cache = await caches.open(CACHE_NAME);
    const meta = new Map(readMeta().map((item) => [item.path, item]));
    let bytes = 0;
    for (let index = 0; index < files.length; index += 1) {
      const descriptor = files[index];
      if (!descriptor.url) throw new Error(`资源 ${descriptor.path} 缺少授权下载地址`);
      const response = await fetch(descriptor.url, {
        headers: accessToken ? { authorization: `Bearer ${accessToken}` } : {},
        credentials: "omit",
      });
      if (!response.ok) throw new Error(`下载 ${descriptor.path} 失败：HTTP ${response.status}`);
      const blob = await response.blob();
      const hash = await sha256(blob);
      if (descriptor.sha256 && hash.toLowerCase() !== descriptor.sha256.toLowerCase()) {
        throw new Error(`资源校验失败：${descriptor.path}`);
      }
      const path = normalizePath(descriptor.path);
      await cache.put(
        virtualUrl(path),
        new Response(blob, {
          headers: {
            "content-type": descriptor.contentType || contentType(blob, path),
            "content-length": String(blob.size),
            "x-magireco-sha256": hash,
          },
        }),
      );
      meta.set(path, {
        path,
        bytes: blob.size,
        sha256: hash,
        contentType: descriptor.contentType,
        installedAt: new Date().toISOString(),
      });
      bytes += blob.size;
      onProgress?.({ current: index + 1, total: files.length, path, bytes });
    }
    writeMeta([...meta.values()]);
    return this.stats();
  }

  async clear(): Promise<void> {
    await caches.delete(CACHE_NAME);
    localStorage.removeItem(META_KEY);
  }
}

export const runtimeAssetStore = new RuntimeAssetStore();
