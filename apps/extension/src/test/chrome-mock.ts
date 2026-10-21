import { vi } from "vitest";

type Listener<A extends unknown[]> = (...args: A) => unknown;

function event<A extends unknown[]>() {
  const listeners = new Set<Listener<A>>();
  return {
    addListener: (l: Listener<A>) => void listeners.add(l),
    removeListener: (l: Listener<A>) => void listeners.delete(l),
    hasListener: (l: Listener<A>) => listeners.has(l),
    emit: (...args: A) => [...listeners].map((l) => l(...args)),
    listeners,
  };
}

function storageArea(name: "local" | "session", onChanged: ReturnType<typeof event<[Record<string, unknown>, string]>>) {
  const data = new Map<string, unknown>();
  const notify = (changes: Record<string, unknown>) => {
    if (Object.keys(changes).length) onChanged.emit(changes, name);
  };
  return {
    data,
    get: vi.fn(async (keys?: string | string[]) => {
      const list = keys === undefined ? [...data.keys()] : Array.isArray(keys) ? keys : [keys];
      return Object.fromEntries(list.filter((k) => data.has(k)).map((k) => [k, structuredClone(data.get(k))]));
    }),
    set: vi.fn(async (items: Record<string, unknown>) => {
      const changes: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(items)) {
        changes[k] = { oldValue: data.get(k), newValue: v };
        data.set(k, structuredClone(v));
      }
      notify(changes);
    }),
    remove: vi.fn(async (keys: string | string[]) => {
      const changes: Record<string, unknown> = {};
      for (const k of Array.isArray(keys) ? keys : [keys]) {
        if (data.delete(k)) changes[k] = { oldValue: true };
      }
      notify(changes);
    }),
  };
}

export type ChromeMock = ReturnType<typeof installChromeMock>;

/** In-memory stand-in for the parts of the chrome.* API the extension uses. */
export function installChromeMock(extensionId = "testextensionid") {
  const onChanged = event<[Record<string, unknown>, string]>();
  const mock = {
    runtime: {
      id: extensionId,
      getURL: vi.fn((path: string) => `chrome-extension://${extensionId}/${path}`),
      onInstalled: event<[unknown]>(),
      onMessageExternal: event<[unknown, chrome.runtime.MessageSender, (r: unknown) => void]>(),
    },
    storage: {
      local: storageArea("local", onChanged),
      session: storageArea("session", onChanged),
      onChanged,
    },
    tabs: {
      create: vi.fn<(props: chrome.tabs.CreateProperties) => Promise<{ id: number }>>(async () => ({ id: 1 })),
      query: vi.fn<(q: chrome.tabs.QueryInfo) => Promise<Array<Partial<chrome.tabs.Tab>>>>(async () => []),
      getCurrent: vi.fn(async () => ({ id: 99 })),
      remove: vi.fn<(id: number) => Promise<void>>(async () => undefined),
    },
    scripting: {
      executeScript: vi.fn<(injection: unknown) => Promise<Array<{ result?: unknown }>>>(async () => {
        throw new Error("executeScript not stubbed");
      }),
    },
    commands: { onCommand: event<[string]>() },
    contextMenus: {
      create: vi.fn<(props: chrome.contextMenus.CreateProperties) => string>(() => "id"),
      removeAll: vi.fn(async () => undefined),
      onClicked: event<[chrome.contextMenus.OnClickData, chrome.tabs.Tab | undefined]>(),
    },
  };
  vi.stubGlobal("chrome", mock);
  return mock;
}
