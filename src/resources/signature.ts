import type { ResourceManifest } from "../types";

function base64Bytes(value: string, urlSafe = false): Uint8Array<ArrayBuffer> {
  let normalized = urlSafe ? value.replaceAll("-", "+").replaceAll("_", "/") : value;
  normalized += "=".repeat((4 - normalized.length % 4) % 4);
  const binary = atob(normalized);
  const output = new Uint8Array(new ArrayBuffer(binary.length));
  for (let index = 0; index < binary.length; index += 1) output[index] = binary.charCodeAt(index);
  return output;
}

function pemBytes(pem: string): Uint8Array<ArrayBuffer> {
  const content = pem
    .replace(/-----BEGIN PUBLIC KEY-----|-----END PUBLIC KEY-----|\s/g, "");
  return base64Bytes(content);
}

export async function verifyManifestSignature(
  manifest: ResourceManifest,
  publicKey: string,
): Promise<boolean> {
  if (!manifest.payload || !manifest.signature || !publicKey.trim()) return false;
  const keyData = publicKey.includes("BEGIN PUBLIC KEY")
    ? pemBytes(publicKey)
    : base64Bytes(publicKey, true);
  const format = publicKey.includes("BEGIN PUBLIC KEY") ? "spki" : "raw";
  const key = await crypto.subtle.importKey(format, keyData, { name: "Ed25519" }, false, ["verify"]);
  return crypto.subtle.verify(
    "Ed25519",
    key,
    base64Bytes(manifest.signature),
    new TextEncoder().encode(manifest.payload),
  );
}

export async function assertManifestTrusted(
  manifest: ResourceManifest,
  publicKey: string | undefined,
  allowUnsigned = false,
): Promise<void> {
  if (allowUnsigned && (!manifest.payload || !manifest.signature)) return;
  if (!publicKey) throw new Error("生产资源清单缺少受信 Ed25519 根公钥");
  if (!(await verifyManifestSignature(manifest, publicKey))) {
    throw new Error("资源清单签名无效");
  }
}
