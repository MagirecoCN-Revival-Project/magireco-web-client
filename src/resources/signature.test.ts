import { describe, expect, it } from "vitest";
import { verifyManifestSignature } from "./signature";
import type { ResourceManifest } from "../types";

function bytesToBase64(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes));
}

describe("resource manifest signature", () => {
  it("verifies the received payload string bytes", async () => {
    const keys = await crypto.subtle.generateKey("Ed25519", true, ["sign", "verify"]);
    const payload = btoa('{"revision":"one"}').replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
    const signature = await crypto.subtle.sign(
      "Ed25519",
      keys.privateKey,
      new TextEncoder().encode(payload),
    );
    const raw = await crypto.subtle.exportKey("raw", keys.publicKey);
    const manifest = {
      schemaVersion: 1,
      revision: "one",
      generatedAt: new Date(0).toISOString(),
      minimumClientVersion: "0.2.0",
      bundles: [],
      payload,
      signature: bytesToBase64(new Uint8Array(signature)),
    } satisfies ResourceManifest;
    expect(await verifyManifestSignature(manifest, bytesToBase64(new Uint8Array(raw)))).toBe(true);
    expect(await verifyManifestSignature({ ...manifest, payload: `${payload}x` }, bytesToBase64(new Uint8Array(raw)))).toBe(false);
  });
});
