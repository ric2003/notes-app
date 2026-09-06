"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  getAuth,
  initializeAuth,
  inMemoryPersistence,
  signInAnonymously,
} from "firebase/auth";
import { getApp, getApps, initializeApp } from "firebase/app";
import {
  getDatabase,
  onDisconnect,
  onValue,
  push,
  ref,
  remove,
  serverTimestamp,
  set,
  update,
} from "firebase/database";
import { db } from "@/lib/firebase";
import { useProfile } from "@/contexts/ProfileContext";
import { readPresenceEntries } from "@/lib/presence";

// Guest credentials are confined to this tab and never become the account login.
async function createGuestConnection() {
  const name = "guest-presence";
  let app = getApps().find((app) => app.name === name);
  if (!app) {
    app = initializeApp(getApp().options, name);
    initializeAuth(app, { persistence: inMemoryPersistence });
  }
  const auth = getAuth(app);
  await auth.authStateReady();
  const user = auth.currentUser ?? (await signInAnonymously(auth)).user;
  return { uid: user.uid, database: getDatabase(app) };
}

let guestPromise: ReturnType<typeof createGuestConnection> | undefined;
function guestConnection() {
  guestPromise ??= createGuestConnection().catch((error) => {
    guestPromise = undefined;
    throw error;
  });
  return guestPromise;
}

export function usePresence() {
  const { user, profile, profiles, isAuthReady } = useProfile();
  const uid = user?.uid;
  const profileReady = Boolean(profile);
  const [clock, setClock] = useState({ now: Date.now(), offset: 0 });
  useEffect(() => {
    const unsubscribe = onValue(ref(db, ".info/serverTimeOffset"), (snapshot) =>
      setClock((current) => ({
        ...current,
        offset: Number(snapshot.val()) || 0,
      })),
    );
    const timer = setInterval(
      () => setClock((current) => ({ ...current, now: Date.now() })),
      15000,
    );
    return () => {
      unsubscribe();
      clearInterval(timer);
    };
  }, []);
  const [entries, setEntries] = useState<unknown>({});
  const [guestId, setGuestId] = useState<string>();
  const cleanupRef = useRef<() => Promise<void>>(async () => {});

  useEffect(
    () =>
      onValue(
        ref(db, "presenceV2"),
        (snapshot) => setEntries(snapshot.val()),
        () => setEntries({}),
      ),
    [],
  );

  useEffect(() => {
    if (!isAuthReady || (uid && !profileReady)) return;
    let disposed = false;
    let generation = 0;
    let unsubscribe = () => {};
    const cleanups = new Set<() => Promise<void>>();
    const heartbeatTimers = new Set<ReturnType<typeof setInterval>>();
    const cleanup = async () => {
      await Promise.all([...cleanups].map((stop) => stop()));
    };
    cleanupRef.current = cleanup;
    void (async () => {
      const connection = uid ? { uid, database: db } : await guestConnection();
      if (disposed) return;
      if (!uid) setGuestId(connection.uid);
      unsubscribe = onValue(
        ref(connection.database, ".info/connected"),
        (snapshot) => {
          if (disposed) return;
          const currentGeneration = ++generation;
          if (!snapshot.val()) {
            heartbeatTimers.forEach(clearInterval);
            heartbeatTimers.clear();
            cleanups.clear();
            return;
          }
          const active = push(
            ref(connection.database, `presenceV2/${connection.uid}`),
          );
          const disconnect = onDisconnect(active);
          let heartbeat: ReturnType<typeof setInterval> | undefined;
          const stop = async () => {
            clearInterval(heartbeat);
            if (heartbeat) heartbeatTimers.delete(heartbeat);
            try {
              await remove(active);
              await disconnect.cancel();
            } catch {
              /* Keep disconnect cleanup if removal failed. */
            }
            cleanups.delete(stop);
          };
          cleanups.add(stop);
          void (async () => {
            // Register cleanup before publishing the connection.
            await disconnect.remove();
            if (disposed || generation !== currentGeneration) {
              await stop();
              return;
            }
            await set(active, {
              since: serverTimestamp(),
              last_seen: serverTimestamp(),
              guest: !uid,
            });
            if (!disposed && generation === currentGeneration)
              heartbeat = setInterval(() => {
                void update(active, { last_seen: serverTimestamp() }).catch(
                  () => {},
                );
              }, 30000);
            if (heartbeat) heartbeatTimers.add(heartbeat);
            if (disposed || generation !== currentGeneration) await stop();
          })().catch((error) =>
            console.error("Could not publish presence", error),
          );
        },
      );
    })().catch((error) => console.error("Could not start presence", error));
    return () => {
      disposed = true;
      unsubscribe();
      void cleanup();
    };
  }, [isAuthReady, uid, profileReady]);

  return {
    onlineUsers: useMemo(
      () => readPresenceEntries(entries, profiles, Date.now() + clock.offset),
      [entries, profiles, clock],
    ),
    myId: user?.uid ?? guestId,
    leavePresence: () =>
      Promise.race([
        cleanupRef.current(),
        new Promise<void>((resolve) => setTimeout(resolve, 1500)),
      ]),
  };
}
