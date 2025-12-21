"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { UserIcon, LogIn, LogOut, X } from "lucide-react";
import { auth, db } from "@/lib/firebase";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  GoogleAuthProvider,
  signInWithPopup,
  type User,
} from "firebase/auth";
import {
  ref as dbRef,
  onValue as onDbValue,
  onDisconnect,
  set,
  remove,
  serverTimestamp,
  get,
  update,
} from "firebase/database";

interface UserProfilesProps {
  className?: string;
  isConnected?: boolean;
}

export default function UserProfiles({
  className = "",
  isConnected = false,
}: UserProfilesProps) {
  const [user, setUser] = useState<User | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [onlineUsers, setOnlineUsers] = useState<
    {
      id: string;
      name?: string;
      email?: string | null;
      isAnonymous?: boolean;
      photoURL?: string | null;
      username?: string | null;
    }[]
  >([]);
  const [showAuthForm, setShowAuthForm] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showPresenceList, setShowPresenceList] = useState(false);
  const presenceRef = useRef<HTMLDivElement | null>(null);
  const prevPresenceIdRef = useRef<string | null>(null);

  // Auth modes and inputs
  const [authMode, setAuthMode] = useState<"login" | "signup">("login");

  // No profile editor state (use auth only)

  // Ensure we have a stable anonymous session identifier for presence
  useEffect(() => {
    if (typeof window === "undefined") return;
    const existing = window.localStorage.getItem("notesAppSessionId");
    if (existing) {
      setSessionId(existing);
      return;
    }
    const generated =
      typeof crypto !== "undefined" &&
        (crypto as { randomUUID: () => string }).randomUUID
        ? (crypto as { randomUUID: () => string }).randomUUID()
        : `anon_${Math.random().toString(36).slice(2)}`;
    window.localStorage.setItem("notesAppSessionId", generated);
    setSessionId(generated);
  }, []);

  // Close presence popover on outside click or Escape
  useEffect(() => {
    const handleDocumentClick = (event: MouseEvent) => {
      if (!presenceRef.current) return;
      if (!presenceRef.current.contains(event.target as Node)) {
        setShowPresenceList(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setShowPresenceList(false);
    };
    document.addEventListener("mousedown", handleDocumentClick);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleDocumentClick);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        setShowAuthForm(false);
        if (sessionId) {
          remove(dbRef(db, `notes/presence/${sessionId}`)).catch(() => { });
        }
      }
    });
    return () => unsub();
  }, [sessionId]);

  // No RTDB profile load; rely on auth only

  // Keep presence up to date in Realtime Database
  useEffect(() => {
    if (!sessionId) return;

    // Mark previous presence identity offline when switching identities
    const newId = user?.uid ?? sessionId;
    const prevId = prevPresenceIdRef.current;
    if (prevId && prevId !== newId) {
      update(dbRef(db, `notes/presence/${prevId}`), {
        online: false,
        last_changed: serverTimestamp(),
      }).catch(() => { });
    }

    const connectedRef = dbRef(db, ".info/connected");
    const unsubscribe = onDbValue(connectedRef, (snap) => {
      const isConn = snap.val() === true;
      if (!isConn) return;

      const id = user?.uid ?? sessionId;
      const name = user?.displayName || user?.email || "Anonymous";
      const emailVal = user?.email ?? null;
      const presenceRef = dbRef(db, `notes/presence/${id}`);

      // Set online state
      set(presenceRef, {
        id,
        name,
        email: emailVal,
        isAnonymous: !user,
        photoURL: user?.photoURL ?? null,
        online: true,
        last_changed: serverTimestamp(),
      }).catch(() => { });

      // Track current presence identity
      prevPresenceIdRef.current = id;

      // Ensure we flip to offline when the tab disconnects
      onDisconnect(presenceRef)
        .update({ online: false, last_changed: serverTimestamp() })
        .catch(() => { });
    });

    return () => {
      unsubscribe();
      // Do not force set offline here; onDisconnect will handle abrupt closes
    };
  }, [user, sessionId]);

  // Subscribe to presence list
  useEffect(() => {
    const presenceListRef = dbRef(db, "notes/presence");
    const unsubscribe = onDbValue(presenceListRef, (snapshot) => {
      const val = snapshot.val() || {};
      type PresenceEntry = {
        id: string;
        name?: string;
        email?: string | null;
        isAnonymous?: boolean;
        online?: boolean;
        photoURL?: string | null;
        username?: string | null;
      };
      const list: PresenceEntry[] = Object.keys(val)
        .map((id) => {
          const raw = val[id] as unknown;
          const entry =
            typeof raw === "object" && raw !== null
              ? (raw as {
                name?: string;
                email?: string | null;
                isAnonymous?: boolean;
                online?: boolean;
                photoURL?: string | null;
                username?: string | null;
              })
              : {};
          return { id, ...entry } as PresenceEntry;
        })
        .filter((u) => !!u && u.online);
      setOnlineUsers(list);
    });
    return () => unsubscribe();
  }, []);

  const handleSignUp = async () => {
    try {
      setIsSubmitting(true);
      setErrorMessage(null);
      if (!email || !password) {
        setErrorMessage("Please provide email and password.");
        return;
      }

      await createUserWithEmailAndPassword(auth, email, password);

      // No nickname required at signup; users can set it later in profile editor
      setEmail("");
      setPassword("");
    } catch (error: unknown) {
      if (error instanceof Error) {
        setErrorMessage(error.message);
      } else {
        setErrorMessage("Failed to sign up");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleLogin = async () => {
    try {
      setIsSubmitting(true);
      setErrorMessage(null);
      await signInWithEmailAndPassword(auth, email, password);
      setEmail("");
      setPassword("");
    } catch (error: unknown) {
      if (error instanceof Error) {
        setErrorMessage(error.message);
      } else {
        setErrorMessage("Failed to log in");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleLogout = async () => {
    try {
      // Immediately mark current user presence offline to avoid duplicates
      if (user?.uid) {
        await update(dbRef(db, `notes/presence/${user.uid}`), {
          online: false,
          last_changed: serverTimestamp(),
        }).catch(() => { });
      }
      await signOut(auth);
    } catch (error) {
      // no-op
    }
  };

  const displayName = user?.displayName || user?.email || "";

  // Deterministic pastel color per user id
  const getColorForId = (id: string) => {
    const palette = [
      "#60a5fa", // blue-400
      "#34d399", // green-400
      "#f472b6", // pink-400
      "#a78bfa", // purple-400
      "#fb923c", // orange-400
      "#f59e0b", // amber-500
    ];
    let hash = 0;
    for (let i = 0; i < id.length; i++)
      hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
    return palette[hash % palette.length];
  };

  const myId = user?.uid ?? sessionId ?? undefined;
  const totalOnline = onlineUsers.length;
  const otherUsers = useMemo(
    () => onlineUsers.filter((u) => u.id !== (myId ?? "")),
    [onlineUsers, myId]
  );
  const onlineLabel = useMemo(() => {
    if (totalOnline <= 1) return "Only you";
    return `${totalOnline} online`;
  }, [totalOnline]);

  return (
    <div className={`relative flex items-center ${className}`}>
      {/* Users Stack - Online presence */}
      {otherUsers.length > 0 && (
        <div
          ref={presenceRef}
          role="button"
          aria-expanded={showPresenceList}
          aria-label="Online users"
          onClick={() =>
            otherUsers.length > 0 && setShowPresenceList((s) => !s)
          }
          className={`relative items-center hidden lg:flex bg-white/90 backdrop-blur-xl rounded-2xl shadow-lg border border-white/60 px-3 py-2 ${otherUsers.length > 0 ? "cursor-pointer hover:shadow-xl transition-shadow duration-300" : "cursor-default"
            } select-none`}
          title={otherUsers.length > 0 ? "Show online users" : undefined}
        >
          <div className="flex items-center">
            {otherUsers.slice(0, 4).map((u, index) => (
              <div
                key={u.id}
                className="relative group"
                style={{
                  marginLeft: index > 0 ? "-8px" : "0",
                  zIndex: 10 - index,
                }}
              >
                {u.photoURL ? (
                  <img
                    src={u.photoURL}
                    alt={u.name || "User"}
                    className="w-8 h-8 rounded-xl object-cover border-2 border-emerald-400 shadow-sm transition-all duration-200 group-hover:scale-110 group-hover:z-50"
                    title={`${u.name || "Anonymous"} - Online`}
                  />
                ) : (
                  <div
                    className="w-8 h-8 rounded-xl flex items-center justify-center text-white text-xs font-semibold border-2 border-emerald-400 shadow-sm transition-all duration-200 group-hover:scale-110 group-hover:z-50"
                    style={{ backgroundColor: getColorForId(u.id) }}
                    title={`${u.name || "Anonymous"} - Online`}
                  >
                    {(u.name || "?").charAt(0).toUpperCase()}
                  </div>
                )}
              </div>
            ))}

            {otherUsers.length > 4 && (
              <div
                className="relative"
                style={{ marginLeft: "-8px", zIndex: 1 }}
              >
                <div className="w-8 h-8 rounded-xl bg-gray-100 border-2 border-white shadow-sm flex items-center justify-center hover:bg-gray-200 transition-colors duration-200">
                  <span className="text-xs text-gray-600 font-medium tabular-nums">
                    +{otherUsers.length - 4}
                  </span>
                </div>
              </div>
            )}
          </div>

          <div className="mx-1 h-6 w-px bg-gray-200" />
          <div className="pl-1 pr-0.5 text-xs text-gray-700 font-medium">
            {onlineLabel}
          </div>

          {showPresenceList && (
            <div className="absolute top-12 left-0 w-64 bg-white/95 backdrop-blur-xl border border-white/60 rounded-2xl shadow-xl p-4 z-50 animate-scale-in">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-semibold text-gray-700">
                  Online now
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded-lg bg-emerald-100 text-emerald-700 font-medium tabular-nums">
                  {totalOnline}
                </span>
              </div>
              <div className="max-h-64 overflow-auto pr-1 space-y-1">
                {onlineUsers.map((u) => (
                  <div key={u.id} className="flex items-center gap-2.5 py-2 px-2 rounded-xl hover:bg-gray-50 transition-colors duration-200">
                    {u.photoURL ? (
                      <img
                        src={u.photoURL}
                        alt={u.name || "User"}
                        className="w-7 h-7 rounded-lg object-cover"
                      />
                    ) : (
                      <div
                        className="w-7 h-7 rounded-lg flex items-center justify-center text-white text-[10px] font-semibold"
                        style={{ backgroundColor: getColorForId(u.id) }}
                        title={`${u.name || "Anonymous"}`}
                      >
                        {(u.name || "?").charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="text-sm text-gray-800 truncate font-medium">
                        {u.name || "Anonymous"}
                      </div>
                      <div className="text-[11px] text-gray-400 truncate">
                        {u.email || (u.isAnonymous ? "Guest" : "")}
                      </div>
                    </div>
                    {u.id === myId && (
                      <span className="text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">
                        you
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Separator */}
      <div className="mx-1"></div>

      {/* User Profile */}
      <div className="flex items-center">
        {/* Combined profile and name container */}
        <div className="flex items-center bg-white/90 backdrop-blur-xl rounded-2xl shadow-lg border border-white/60 pl-1.5 pr-3.5 py-1.5">
          <div className="relative mr-3">
            {/* Main avatar with status ring */}
            <div
              className={`relative p-0.5 rounded-xl ${isConnected ? "bg-gradient-to-br from-emerald-400 to-teal-500" : "bg-gradient-to-br from-rose-400 to-red-500"} transition-all duration-300`}
            >
              <div className="w-8 h-8 rounded-[10px] bg-white flex items-center justify-center overflow-hidden">
                {user ? (
                  user.photoURL ? (
                    <img
                      src={user.photoURL}
                      alt={displayName}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span className="text-gray-700 font-semibold text-sm">
                      {displayName.charAt(0).toUpperCase()}
                    </span>
                  )
                ) : (
                  <UserIcon className="w-4 h-4 text-gray-400" />
                )}
              </div>
            </div>

            {/* Connection Status indicator with glow */}
            <div
              className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-md border-2 border-white shadow-sm transition-all duration-300 ${isConnected ? "bg-emerald-500" : "bg-rose-500"
                }`}
              style={{
                boxShadow: isConnected
                  ? '0 0 8px rgba(16, 185, 129, 0.5)'
                  : '0 0 8px rgba(244, 63, 94, 0.5)'
              }}
            ></div>
          </div>

          {/* User name or sign in */}
          {user ? (
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium text-gray-700">
                {displayName}
              </span>
              <button
                onClick={handleLogout}
                className="flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-gray-700 transition-colors duration-200 px-2 py-1 hover:bg-gray-100 rounded-lg"
                title="Sign out"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Sign out</span>
              </button>
            </div>
          ) : (
            <>
              {!user && (
                <div>
                  <p>Anonymous | &nbsp;</p>
                </div>
              )}
              <button
                onClick={() => setShowAuthForm((s) => !s)}
                className="text-sm font-medium text-gray-700 hover:text-gray-900 transition-colors duration-200"
                title="Sign in"
              >
                <div className="flex items-center gap-2">
                  {showAuthForm ? (
                    <>
                      <X className="w-4 h-4 -mr-1" />
                      <span className="pr-3">Close</span>
                    </>
                  ) : (
                    <>
                      <LogIn className="w-4 h-4" />
                      <span>Sign In</span>
                    </>
                  )}
                </div>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Auth popover */}
      {!user && showAuthForm && (
        <div className="absolute top-14 right-0 w-80 bg-white/95 backdrop-blur-xl border border-white/60 rounded-2xl shadow-xl p-5 z-50 animate-scale-in">
          <div className="flex items-center gap-1 mb-4 bg-gray-100 rounded-xl p-1">
            <button
              onClick={() => setAuthMode("login")}
              className={`flex-1 py-2.5 text-sm font-medium rounded-lg transition-all duration-200 ${authMode === "login" ? "bg-white shadow-sm text-gray-900" : "text-gray-500 hover:text-gray-700"}`}
            >
              Login
            </button>
            <button
              onClick={() => setAuthMode("signup")}
              className={`flex-1 py-2.5 text-sm font-medium rounded-lg transition-all duration-200 ${authMode === "signup" ? "bg-white shadow-sm text-gray-900" : "text-gray-500 hover:text-gray-700"}`}
            >
              Sign Up
            </button>
          </div>
          {authMode === "login" ? (
            <div className="flex flex-col gap-2">
              <input
                type="email"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-gray-300"
              />
              <input
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-gray-300"
              />
              {errorMessage && (
                <div className="text-xs text-red-600 mt-1">{errorMessage}</div>
              )}
              <button
                onClick={handleLogin}
                disabled={isSubmitting}
                className="mt-1 w-full px-3 py-2 bg-gray-900 text-white rounded-lg text-sm hover:bg-black transition-colors disabled:opacity-50"
              >
                Log In
              </button>
              <div className="relative my-2">
                <div className="w-full h-px bg-gray-200" />
                <div className="absolute -top-2 left-1/2 -translate-x-1/2 bg-white px-2 text-[11px] text-gray-500">
                  or
                </div>
              </div>
              <button
                onClick={async () => {
                  try {
                    setIsSubmitting(true);
                    setErrorMessage(null);
                    const provider = new GoogleAuthProvider();
                    await signInWithPopup(auth, provider);
                  } catch (err: unknown) {
                    setErrorMessage(
                      err instanceof Error
                        ? err.message
                        : "Google sign-in failed"
                    );
                  } finally {
                    setIsSubmitting(false);
                  }
                }}
                disabled={isSubmitting}
                className="w-full px-3 py-2 border border-gray-300 text-gray-800 bg-white rounded-lg text-sm hover:bg-gray-50 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 48 48"
                  className="w-4 h-4"
                >
                  <path
                    fill="#FFC107"
                    d="M43.611,20.083H42V20H24v8h11.303c-1.649,4.657-6.08,8-11.303,8c-6.627,0-12-5.373-12-12 s5.373-12,12-12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C12.955,4,4,12.955,4,24 s8.955,20,20,20s20-8.955,20-20C44,22.659,43.862,21.35,43.611,20.083z"
                  />
                  <path
                    fill="#FF3D00"
                    d="M6.306,14.691l6.571,4.819C14.655,16.177,19.001,13,24,13c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657 C34.046,6.053,29.268,4,24,4C16.318,4,9.74,8.337,6.306,14.691z"
                  />
                  <path
                    fill="#4CAF50"
                    d="M24,44c5.166,0,9.86-1.977,13.409-5.192l-6.19-5.238C29.211,35.091,26.715,36,24,36 c-5.202,0-9.619-3.329-11.281-7.964l-6.497,5.007C9.594,40.556,16.227,44,24,44z"
                  />
                  <path
                    fill="#1976D2"
                    d="M43.611,20.083H42V20H24v8h11.303c-0.794,2.24-2.231,4.161-4.103,5.571 c0.001-0.001,0.001-0.001,0.002-0.002l6.19,5.238C35.241,40.205,44,36,44,24C44,22.659,43.862,21.35,43.611,20.083z"
                  />
                </svg>
                <span>Continue with Google</span>
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <input
                type="email"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-gray-300"
              />
              <input
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-gray-300"
              />
              {errorMessage && (
                <div className="text-xs text-red-600 mt-1">{errorMessage}</div>
              )}
              <button
                onClick={handleSignUp}
                disabled={isSubmitting}
                className="mt-1 w-full px-3 py-2 bg-gray-900 text-white border border-gray-300 rounded-lg text-sm hover:bg-gray-50 transition-colors disabled:opacity-50"
              >
                Create Account
              </button>
              <div className="relative my-2">
                <div className="w-full h-px bg-gray-200" />
                <div className="absolute -top-2 left-1/2 -translate-x-1/2 bg-white px-2 text-[11px] text-gray-500">
                  or
                </div>
              </div>
              <button
                onClick={async () => {
                  try {
                    setIsSubmitting(true);
                    setErrorMessage(null);
                    const provider = new GoogleAuthProvider();
                    await signInWithPopup(auth, provider);
                  } catch (err: unknown) {
                    setErrorMessage(
                      err instanceof Error
                        ? err.message
                        : "Google sign-in failed"
                    );
                  } finally {
                    setIsSubmitting(false);
                  }
                }}
                disabled={isSubmitting}
                className="w-full px-3 py-2 border border-gray-300 text-gray-800 bg-white rounded-lg text-sm hover:bg-gray-50 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 48 48"
                  className="w-4 h-4"
                >
                  <path
                    fill="#FFC107"
                    d="M43.611,20.083H42V20H24v8h11.303c-1.649,4.657-6.08,8-11.303,8c-6.627,0-12-5.373-12-12 s5.373-12,12-12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C34.046,6.053,29.268,4,24,4C12.955,4,4,12.955,4,24 s8.955,20,20,20s20-8.955,20-20C44,22.659,43.862,21.35,43.611,20.083z"
                  />
                  <path
                    fill="#FF3D00"
                    d="M6.306,14.691l6.571,4.819C14.655,16.177,19.001,13,24,13c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657 C34.046,6.053,29.268,4,24,4C16.318,4,9.74,8.337,6.306,14.691z"
                  />
                  <path
                    fill="#4CAF50"
                    d="M24,44c5.166,0,9.86-1.977,13.409-5.192l-6.19-5.238C29.211,35.091,26.715,36,24,36 c-5.202,0-9.619-3.329-11.281-7.964l-6.497,5.007C9.594,40.556,16.227,44,24,44z"
                  />
                  <path
                    fill="#1976D2"
                    d="M43.611,20.083H42V20H24v8h11.303c-0.794,2.24-2.231,4.161-4.103,5.571 c0.001-0.001,0.001-0.001,0.002-0.002l6.19,5.238C35.241,40.205,44,36,44,24C44,22.659,43.862,21.35,43.611,20.083z"
                  />
                </svg>
                <span>Continue with Google</span>
              </button>
            </div>
          )}
        </div>
      )}

      {/* Profile editor removed; rely on Google account for name/photo */}
    </div>
  );
}
