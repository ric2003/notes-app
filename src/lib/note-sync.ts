import type { NoteData } from "./notes";
import { parsePendingUpdates } from "./pending-note-updates";

export type NoteUpdate = Partial<NoteData> & { expected_content?: string };
export class NoteSaveError extends Error {
  constructor(
    message: string,
    public status: number,
    public note?: NoteData,
  ) {
    super(message);
  }
}

type Deletion = { note: NoteData; dueAt: number; failed?: boolean };
export type SyncProblem = {
  id: string;
  updates: NoteUpdate;
  remote?: NoteData;
  message: string;
};
type Snapshot = {
  pending: number;
  saving: number;
  problems: SyncProblem[];
  failedDeletes: Deletion[];
  pendingDeletes: Deletion[];
  storageError: boolean;
};
type Options = {
  save: (id: string, updates: NoteUpdate) => Promise<void>;
  remove: (id: string) => Promise<void>;
  now?: () => number;
};
const UPDATE_KEY = "notesAppPendingUpdates";
const DELETE_KEY = "notesAppPendingDeletes";

// All writes for a note pass through this queue, including retries and deletes.
export class NoteSync {
  private updates = new Map<string, NoteUpdate>();
  private deletions = new Map<string, Deletion>();
  private removed = new Set<string>();
  private problems = new Map<string, SyncProblem>();
  private running = new Map<string, Promise<void>>();
  private listeners = new Set<() => void>();
  private timer?: ReturnType<typeof setTimeout>;
  private storage?: Storage;
  private active = false;
  private storageError = false;
  private snapshot: Snapshot = {
    pending: 0,
    saving: 0,
    problems: [],
    failedDeletes: [],
    pendingDeletes: [],
    storageError: false,
  };
  private now: () => number;

  constructor(private options: Options) {
    this.now = options.now ?? Date.now;
  }
  getSnapshot = () => this.snapshot;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  start(storage?: Storage) {
    this.storage = storage;
    this.active = true;
    this.storageError = !storage;
    try {
      const stored = storage?.getItem(UPDATE_KEY);
      if (stored) this.updates = parsePendingUpdates(stored);
      const deleted: unknown = JSON.parse(storage?.getItem(DELETE_KEY) ?? "[]");
      if (Array.isArray(deleted)) {
        for (const entry of deleted) {
          if (
            entry &&
            typeof entry.note?.id === "string" &&
            typeof entry.note.content === "string" &&
            Number.isFinite(entry.dueAt)
          ) {
            this.deletions.set(entry.note.id, entry);
          }
        }
      }
    } catch {
      this.storageError = true;
    }
    this.emit();
    this.schedule(0);
  }

  stop() {
    this.active = false;
    clearTimeout(this.timer);
  }

  private emit() {
    this.snapshot = {
      pending:
        this.updates.size +
        [...this.deletions.values()].filter((d) => !d.failed).length,
      saving: this.running.size,
      problems: [...this.problems.values()],
      failedDeletes: [...this.deletions.values()].filter((d) => d.failed),
      pendingDeletes: [...this.deletions.values()].filter((d) => !d.failed),
      storageError: this.storageError,
    };
    this.listeners.forEach((listener) => listener());
  }

  private persist() {
    try {
      if (!this.storage) throw new Error("Storage unavailable");
      this.storage.setItem(UPDATE_KEY, JSON.stringify([...this.updates]));
      this.storage.setItem(
        DELETE_KEY,
        JSON.stringify([...this.deletions.values()]),
      );
      this.storageError = false;
    } catch {
      this.storageError = true;
    }
    this.emit();
  }

  update(id: string, update: NoteUpdate) {
    if (
      this.removed.has(id) ||
      (this.deletions.has(id) && !this.deletions.get(id)?.failed)
    )
      return;
    if (this.deletions.get(id)?.failed) this.deletions.delete(id);
    const previous = this.updates.get(id);
    const merged = { ...previous, ...update };
    if (previous?.expected_content !== undefined)
      merged.expected_content = previous.expected_content;
    this.updates.set(id, merged);
    const problem = this.problems.get(id);
    if (problem) this.problems.set(id, { ...problem, updates: merged });
    this.persist();
    this.schedule(750);
  }

  delete(note: NoteData) {
    if (this.removed.has(note.id)) return;
    this.deletions.set(note.id, {
      note: { ...note, ...this.updates.get(note.id) },
      dueAt: this.now() + 6000,
    });
    this.persist();
    this.schedule(0);
  }

  undoDelete(id: string) {
    const deletion = this.deletions.get(id);
    if (!deletion || (!deletion.failed && deletion.dueAt <= this.now())) return;
    this.deletions.delete(id);
    this.persist();
    this.schedule(0);
  }

  retryDelete(id: string) {
    const deletion = this.deletions.get(id);
    if (!deletion?.failed) return;
    this.deletions.set(id, { ...deletion, failed: false, dueAt: this.now() });
    this.persist();
    this.schedule(0);
  }

  resolve(id: string, useLocal: boolean) {
    const problem = this.problems.get(id);
    if (!problem) return;
    const next = { ...this.updates.get(id) };
    if (useLocal && problem.remote) {
      next.expected_content = problem.remote.content;
    } else {
      delete next.content;
      delete next.expected_content;
      delete next.edited_at;
    }
    if (!problem.remote || Object.keys(next).length === 0)
      this.updates.delete(id);
    else this.updates.set(id, next);
    this.problems.delete(id);
    this.persist();
    this.schedule(0);
  }

  merge = (notes: NoteData[]) => {
    const visible = notes.filter(
      (n) =>
        !this.removed.has(n.id) &&
        (!this.deletions.has(n.id) || this.deletions.get(n.id)?.failed),
    );
    for (const { note, failed } of this.deletions.values()) {
      if (failed && !visible.some((n) => n.id === note.id)) visible.push(note);
    }
    return visible.map((note) => ({ ...note, ...this.updates.get(note.id) }));
  };

  private schedule(delay: number) {
    if (!this.active) return;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      void this.flush();
    }, delay);
  }

  flush = async () => {
    const ids = new Set([...this.updates.keys(), ...this.deletions.keys()]);
    await Promise.all([...ids].map((id) => this.run(id)));
    if (!this.active) return;
    const deadlines = [...this.deletions.values()]
      .filter((d) => !d.failed)
      .map((d) => Math.max(0, d.dueAt - this.now()));
    const retryable = [...this.updates.keys()].some(
      (id) => !this.problems.has(id) && !this.deletions.has(id),
    );
    if (retryable || deadlines.length)
      this.schedule(Math.min(5000, ...deadlines));
  };

  private run(id: string): Promise<void> {
    const existing = this.running.get(id);
    if (existing) return existing;
    const deletion = this.deletions.get(id);
    if (
      deletion?.failed ||
      (deletion && deletion.dueAt > this.now()) ||
      (!deletion && (!this.updates.has(id) || this.problems.has(id)))
    )
      return Promise.resolve();
    // Defer work until the lock is installed, including synchronous adapter failures.
    const task = Promise.resolve()
      .then(async () => {
        while (true) {
          const deletion = this.deletions.get(id);
          if (deletion) {
            if (deletion.failed || deletion.dueAt > this.now()) break;
            try {
              await this.options.remove(id);
              this.removed.add(id);
              this.updates.delete(id);
              this.problems.delete(id);
              this.deletions.delete(id);
            } catch {
              this.deletions.set(id, { ...deletion, failed: true });
            }
            this.persist();
            break;
          }
          const sent = this.updates.get(id);
          if (!sent || this.problems.has(id)) break;
          try {
            await this.options.save(id, sent);
            const current = this.updates.get(id);
            if (current === sent) this.updates.delete(id);
            else if (current && sent.content !== undefined) {
              this.updates.set(id, {
                ...current,
                expected_content: sent.content,
              });
            }
            this.persist();
          } catch (error) {
            if (
              error instanceof NoteSaveError &&
              [400, 404, 409, 401, 403].includes(error.status)
            ) {
              this.problems.set(id, {
                id,
                updates: this.updates.get(id) ?? sent,
                remote: error.note,
                message: error.message,
              });
            }
            this.emit();
            break;
          }
        }
      })
      .finally(() => {
        this.running.delete(id);
        this.emit();
      });
    this.running.set(id, task);
    this.emit();
    return task;
  }
}
