/** localStorage can throw (private windows, blocked storage); every read/write is guarded. */
function make(getStore: () => Storage) {
  return {
    get(key: string): string | null {
      try {
        return getStore().getItem(key);
      } catch {
        return null;
      }
    },
    set(key: string, value: string): void {
      try {
        getStore().setItem(key, value);
      } catch {
        /* storage unavailable: the app still works, the setting just isn't remembered */
      }
    },
    remove(key: string): void {
      try {
        getStore().removeItem(key);
      } catch {
        /* ignore */
      }
    },
  };
}

export const safeStorage = make(() => window.localStorage);
export const sessionStore = make(() => window.sessionStorage);
