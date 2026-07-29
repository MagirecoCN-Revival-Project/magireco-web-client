import { beforeEach, describe, expect, it } from "vitest";
import { createCnvBridge, loadState } from "./stateStore";

describe("CNV browser state bridge", () => {
  beforeEach(() => localStorage.clear());

  it("stores account-isolated API state", () => {
    const bridge = createCnvBridge("a");
    bridge.saveState("/magica/api/user/deck/1", '{"deck":1}', '{"result":"ok"}');
    expect(loadState("a")["/magica/api/user/deck/1"].resp).toContain("ok");
    expect(loadState("b")).toEqual({});
  });

  it("rejects traversal and non-game endpoints", () => {
    const bridge = createCnvBridge("a");
    bridge.saveState("/magica/api/../../token", "x", "y");
    bridge.saveState("/admin/users", "x", "y");
    expect(loadState("a")).toEqual({});
  });

  it("deletes a saved endpoint", () => {
    const bridge = createCnvBridge("a");
    bridge.saveState("/magica/api/user/profile", "{}", "{}");
    bridge.deleteState("/magica/api/user/profile");
    expect(loadState("a")).toEqual({});
  });
});
