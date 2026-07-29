import { beforeEach, describe, expect, it } from "vitest";
import { ApiClient, MemoryTokenStore } from "./client";
import { MockTransport } from "./mock";

describe("API client", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("authenticates and stores session tokens", async () => {
    const store = new MemoryTokenStore();
    const client = new ApiClient(new MockTransport(), store);
    const result = await client.login("demo", "magia", "test");
    expect(result.account.status).toBe("active");
    expect(store.read()?.accessToken).toContain(".access.");
  });

  it("returns structured ban errors", async () => {
    const client = new ApiClient(new MockTransport(), new MemoryTokenStore());
    await expect(client.login("banned", "magia", "test")).rejects.toMatchObject({
      status: 403,
      code: "ACCOUNT_BANNED",
    });
  });
});
