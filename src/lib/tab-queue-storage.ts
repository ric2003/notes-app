const PREFIX = "notesQueue:";
const SESSION_KEY = "notesQueueId";
const KEYS = [
  "notesAppPendingCreates",
  "notesAppPendingUpdates",
  "notesAppPendingDeletes",
];
export type QueueStorage = Pick<Storage, "getItem" | "setItem">;
export type QueueLease = {
  id: string;
  storage: QueueStorage;
  release: () => void;
};

type Options = {
  local: Storage;
  session: Storage;
  locks: Pick<LockManager, "request">;
  uuid: () => string;
};

function hasWork(local: Storage, id: string) {
  return KEYS.some((key) => {
    const value = local.getItem(`${PREFIX}${id}:${key}`);
    return value !== null && value !== "[]";
  });
}

// A lock is held for the tab's lifetime. Reloads and closed tabs release it,
// allowing persisted work to be recovered without taking a live tab's queue.
export async function acquireQueue(
  options: Options,
  recoverOnly = false,
): Promise<QueueLease | null> {
  const { local, session, locks, uuid } = options;
  const preferred = session.getItem(SESSION_KEY);
  const ids = new Set<string>();
  if (!recoverOnly && preferred && hasWork(local, preferred))
    ids.add(preferred);
  for (let i = 0; i < local.length; i++) {
    const key = local.key(i);
    if (key?.startsWith(PREFIX)) {
      const id = key.slice(PREFIX.length).split(":")[0];
      if (hasWork(local, id)) ids.add(id);
    }
  }
  if (!recoverOnly) ids.add(uuid());
  for (const id of ids) {
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const granted = await new Promise<boolean>((resolve, reject) => {
      void locks
        .request(`${PREFIX}${id}`, { ifAvailable: true }, async (lock) => {
          resolve(Boolean(lock));
          if (lock) await held;
        })
        .catch(reject);
    });
    if (!granted) continue;
    try {
      session.setItem(SESSION_KEY, id);
      const storage = {
        getItem: (key: string) => local.getItem(`${PREFIX}${id}:${key}`),
        setItem: (key: string, value: string) =>
          value === "[]"
            ? local.removeItem(`${PREFIX}${id}:${key}`)
            : local.setItem(`${PREFIX}${id}:${key}`, value),
      };
      // The fixed legacy queue is adopted once while holding a separate lock.
      await locks.request("notesQueueLegacyMigration", async () => {
        for (const key of KEYS) {
          const old = local.getItem(key);
          if (old && !storage.getItem(key)) {
            storage.setItem(key, old);
            local.removeItem(key);
          }
        }
      });
      return { id, storage, release };
    } catch (error) {
      release();
      throw error;
    }
  }
  return null;
}
