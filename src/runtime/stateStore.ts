interface StateEntry {
  req?: string;
  resp?: string;
  updatedAt: number;
}

const PREFIX = "magireco.cnv.state.";

function validEndpoint(endpoint: string): boolean {
  return endpoint.length > 0 &&
    endpoint.length <= 512 &&
    endpoint.startsWith("/magica/api/") &&
    !endpoint.includes("..");
}

function key(accountId: string) {
  return `${PREFIX}${accountId}`;
}

export function loadState(accountId: string): Record<string, StateEntry> {
  try {
    return JSON.parse(localStorage.getItem(key(accountId)) ?? "{}") as Record<string, StateEntry>;
  } catch {
    return {};
  }
}

export function createCnvBridge(accountId: string) {
  return {
    saveState(endpoint: string, reqJson: string, respJson: string) {
      if (!validEndpoint(endpoint)) return;
      const state = loadState(accountId);
      state[endpoint] = { req: reqJson, resp: respJson, updatedAt: Date.now() };
      localStorage.setItem(key(accountId), JSON.stringify(state));
    },
    loadAllState() {
      return JSON.stringify(loadState(accountId));
    },
    deleteState(endpoint: string) {
      if (!validEndpoint(endpoint)) return;
      const state = loadState(accountId);
      delete state[endpoint];
      localStorage.setItem(key(accountId), JSON.stringify(state));
    },
    getAccountId() {
      return accountId;
    },
  };
}
