"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { UserIcon, LogOut, X } from "lucide-react";
import { auth, db } from "@/lib/firebase";
import { UsernameTakenError, useProfile } from "@/contexts/ProfileContext";
import {
  getUsernameError,
  normalizeUsername,
  suggestUsername,
} from "@/lib/profiles";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendEmailVerification,
  signOut,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
} from "firebase/auth";
import {
  ref as dbRef,
  onValue as onDbValue,
  onDisconnect,
  set,
  remove,
  serverTimestamp,
  update,
} from "firebase/database";

const PRESENCE_ROOT = "presence";

type PresenceEntry = {
  id: string;
  username?: string | null;
  // Read old records until every active session has reconnected.
  name?: string;
  isAnonymous?: boolean;
  online?: boolean;
  photoURL?: string | null;
};

function presencePath(id: string) {
  return `${PRESENCE_ROOT}/${id}`;
}

async function removePresence(id: string) {
  await remove(dbRef(db, presencePath(id)));
}

async function updatePresenceStatus(
  id: string,
  updates: Record<string, unknown>,
) {
  await update(dbRef(db, presencePath(id)), updates);
}

async function establishPresence(
  id: string,
  entry: Omit<PresenceEntry, "id"> & { last_changed: unknown },
) {
  const activeRef = dbRef(db, presencePath(id));
  await set(activeRef, { id, ...entry });

  await onDisconnect(activeRef).update({
    online: false,
    last_changed: serverTimestamp(),
  });
}

function readPresenceEntries(value: unknown): PresenceEntry[] {
  if (!value || typeof value !== "object") return [];
  return Object.entries(value as Record<string, unknown>)
    .map(([id, raw]) => {
      const entry =
        typeof raw === "object" && raw !== null
          ? (raw as Omit<PresenceEntry, "id">)
          : {};
      return {
        id,
        ...entry,
        username: entry.username || entry.name || "Anonymous",
      };
    })
    .filter((entry) => entry.online);
}

interface UserProfilesProps {
  className?: string;
  isConnected?: boolean;
}

// Firebase returns raw strings like "Firebase: Error (auth/invalid-credential)".
// Translate the common cases into something a human can act on.
function firebaseAuthErrorMessage(error: unknown): string {
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? String((error as { code: unknown }).code)
      : "";

  switch (code) {
    case "auth/invalid-credential":
    case "auth/wrong-password":
    case "auth/user-not-found":
      return "Wrong email or password.";
    case "auth/email-already-in-use":
      return "That email already has an account — try signing in instead.";
    case "auth/invalid-email":
      return "That doesn't look like a valid email address.";
    case "auth/missing-email":
      return "Please enter your email address first.";
    case "auth/missing-password":
      return "Please enter your password.";
    case "auth/weak-password":
      return "Password should be at least 6 characters.";
    case "auth/too-many-requests":
      return "Too many attempts — please wait a moment and try again.";
    case "auth/network-request-failed":
      return "Network problem. Check your connection and try again.";
    case "auth/popup-closed-by-user":
      return "Google sign-in was cancelled.";
    case "auth/popup-blocked":
      return "Your browser blocked the sign-in window — allow popups and retry.";
    default:
      return "Something went wrong. Please try again.";
  }
}

function GoogleIcon() {
  return (
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
  );
}

export default function UserProfiles({
  className = "",
  isConnected = false,
}: UserProfilesProps) {
  const { user, profile, needsUsername, claimUsername } = useProfile();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [onlineUsers, setOnlineUsers] = useState<PresenceEntry[]>([]);
  const [showAuthForm, setShowAuthForm] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showPresenceList, setShowPresenceList] = useState(false);
  const [usernameInput, setUsernameInput] = useState("");
  const [usernameError, setUsernameError] = useState<string | null>(null);
  const [isSavingUsername, setIsSavingUsername] = useState(false);
  const presenceRef = useRef<HTMLDivElement | null>(null);
  const prevPresenceIdRef = useRef<string | null>(null);

  // Auth modes and inputs
  const [authMode, setAuthMode] = useState<"login" | "signup">("login");

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
      if (event.key === "Escape") {
        setShowPresenceList(false);
        setShowAuthForm(false);
      }
    };
    document.addEventListener("mousedown", handleDocumentClick);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleDocumentClick);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  useEffect(() => {
    if (!user) return;
    setShowAuthForm(false);
    if (sessionId) void removePresence(sessionId).catch(() => {});
  }, [sessionId, user]);

  useEffect(() => {
    if (!needsUsername || !user) return;
    setUsernameInput(suggestUsername(user.displayName, user.email));
    setUsernameError(null);
  }, [needsUsername, user]);

  // Keep presence up to date in Realtime Database
  useEffect(() => {
    if (!sessionId) return;

    // Mark previous presence identity offline when switching identities
    const newId = user?.uid ?? sessionId;
    const prevId = prevPresenceIdRef.current;
    if (prevId && prevId !== newId) {
      void updatePresenceStatus(prevId, {
        online: false,
        last_changed: serverTimestamp(),
      }).catch(() => {});
    }

    const connectedRef = dbRef(db, ".info/connected");
    const unsubscribe = onDbValue(connectedRef, (snap) => {
      const isConn = snap.val() === true;
      if (!isConn) return;
      if (user && !profile) return;

      const id = user?.uid ?? sessionId;
      const username = profile?.username || "Anonymous";
      void establishPresence(id, {
        username,
        // Transitional copy for sessions running the previous rules.
        name: username,
        isAnonymous: !user,
        photoURL: profile?.photo_url ?? user?.photoURL ?? null,
        online: true,
        last_changed: serverTimestamp(),
      }).catch(() => {});

      // Track current presence identity
      prevPresenceIdRef.current = id;
    });

    return () => {
      unsubscribe();
      // Do not force set offline here; onDisconnect will handle abrupt closes
    };
  }, [profile, user, sessionId]);

  // Subscribe to presence list
  useEffect(() => {
    return onDbValue(
      dbRef(db, PRESENCE_ROOT),
      (snapshot) => setOnlineUsers(readPresenceEntries(snapshot.val())),
      () => setOnlineUsers([]),
    );
  }, []);

  const submitAuth = async () => {
    try {
      setIsSubmitting(true);
      setErrorMessage(null);
      if (!email || !password) {
        setErrorMessage("Please provide email and password.");
        return;
      }
      if (authMode === "signup") {
        const cred = await createUserWithEmailAndPassword(
          auth,
          email,
          password,
        );
        // Fire-and-forget: signup shouldn't fail if the mail server hiccups
        sendEmailVerification(cred.user, {
          url:
            typeof window !== "undefined"
              ? window.location.origin
              : "https://live-update-notes.netlify.app",
        }).catch(() => {});
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
      setShowAuthForm(false);
      setEmail("");
      setPassword("");
    } catch (error: unknown) {
      setErrorMessage(firebaseAuthErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  const signInWithGoogle = async () => {
    try {
      setIsSubmitting(true);
      setErrorMessage(null);
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
      setShowAuthForm(false);
    } catch (err: unknown) {
      const code =
        typeof err === "object" && err !== null && "code" in err
          ? String((err as { code: unknown }).code)
          : "";
      // Popups get blocked or fail in embedded browsers; fall back to a
      // full-page redirect, which survives those environments.
      if (
        code === "auth/popup-blocked" ||
        code === "auth/popup-closed-by-user" ||
        code === "auth/cancelled-popup-request" ||
        code === "auth/operation-not-supported-in-this-environment"
      ) {
        try {
          await signInWithRedirect(auth, new GoogleAuthProvider());
          return;
        } catch {
          // fall through to the friendly error
        }
      }
      setErrorMessage(firebaseAuthErrorMessage(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleLogout = async () => {
    try {
      // Immediately mark current user presence offline to avoid duplicates
      if (user?.uid) {
        await updatePresenceStatus(user.uid, {
          online: false,
          last_changed: serverTimestamp(),
        }).catch(() => {});
      }
      await signOut(auth);
    } catch {
      // no-op
    }
  };

  const submitUsername = async () => {
    const username = normalizeUsername(usernameInput);
    const validationError = getUsernameError(username);
    if (validationError) {
      setUsernameError(validationError);
      return;
    }

    try {
      setIsSavingUsername(true);
      setUsernameError(null);
      await claimUsername(username);
    } catch (error) {
      setUsernameError(
        error instanceof UsernameTakenError
          ? error.message
          : error instanceof Error
            ? error.message
            : "Couldn't save your username. Please try again.",
      );
    } finally {
      setIsSavingUsername(false);
    }
  };

  const currentUsername = profile?.username || "";
  const profilePhoto = profile?.photo_url || user?.photoURL || undefined;
  const isEmailVerified = user?.emailVerified ?? null;

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
    [onlineUsers, myId],
  );
  const onlineLabel = useMemo(() => {
    if (totalOnline <= 1) return "Only you";
    return `${totalOnline} online`;
  }, [totalOnline]);

  return (
    <div className={`relative flex items-center gap-2 ${className}`}>
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
          className={`relative items-center hidden lg:flex h-14 bg-white/90 backdrop-blur-xl rounded-2xl shadow-lg border border-white/60 px-3 py-2 ${
            otherUsers.length > 0
              ? "cursor-pointer hover:shadow-xl transition-shadow duration-300"
              : "cursor-default"
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
                    alt={u.username || "User"}
                    className="w-8 h-8 rounded-xl object-cover border-2 border-emerald-400 shadow-sm transition-all duration-200 group-hover:scale-110 group-hover:z-50"
                    title={`${u.username || "Anonymous"} - Online`}
                  />
                ) : (
                  <div
                    className="w-8 h-8 rounded-xl flex items-center justify-center text-white text-xs font-semibold border-2 border-emerald-400 shadow-sm transition-all duration-200 group-hover:scale-110 group-hover:z-50"
                    style={{ backgroundColor: getColorForId(u.id) }}
                    title={`${u.username || "Anonymous"} - Online`}
                  >
                    {(u.username || "?").charAt(0).toUpperCase()}
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
            <div className="absolute top-[calc(100%+8px)] left-0 w-64 bg-white/95 backdrop-blur-xl border border-white/60 rounded-2xl shadow-xl p-4 z-50 animate-scale-in">
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
                  <div
                    key={u.id}
                    className="flex items-center gap-2.5 py-2 px-2 rounded-xl hover:bg-gray-50 transition-colors duration-200"
                  >
                    {u.photoURL ? (
                      <img
                        src={u.photoURL}
                        alt={u.username || "User"}
                        className="w-7 h-7 rounded-lg object-cover"
                      />
                    ) : (
                      <div
                        className="w-7 h-7 rounded-lg flex items-center justify-center text-white text-[10px] font-semibold"
                        style={{ backgroundColor: getColorForId(u.id) }}
                        title={`${u.username || "Anonymous"}`}
                      >
                        {(u.username || "?").charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="text-sm text-gray-800 truncate font-medium">
                        {u.isAnonymous
                          ? "Anonymous"
                          : `@${u.username || "user"}`}
                      </div>
                      <div className="text-[11px] text-gray-400 truncate">
                        {u.isAnonymous ? "Guest" : "Signed in"}
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

      {/* User Profile */}
      <div className="flex items-center">
        {/* Combined profile and name container */}
        <div className="h-14 flex items-center bg-white/95 backdrop-blur-xl rounded-2xl shadow-lg border border-white/70 pl-1.5 pr-1.5 sm:pr-3.5 py-1.5">
          <div className="relative mr-1.5 sm:mr-3">
            {/* Main avatar with status ring */}
            <div
              className={`relative p-0.5 rounded-xl ${isConnected ? "bg-gradient-to-br from-emerald-400 to-teal-500" : "bg-gradient-to-br from-rose-400 to-red-500"} transition-all duration-300`}
            >
              <div className="w-8 h-8 rounded-[10px] bg-white flex items-center justify-center overflow-hidden">
                {user ? (
                  profilePhoto ? (
                    <img
                      src={profilePhoto}
                      alt={currentUsername || "Account"}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span className="text-gray-700 font-semibold text-sm">
                      {(currentUsername || suggestUsername(null, user.email))
                        .charAt(0)
                        .toUpperCase()}
                    </span>
                  )
                ) : (
                  <UserIcon className="w-4 h-4 text-gray-400" />
                )}
              </div>
            </div>

            {/* Connection Status indicator with glow */}
            <div
              className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-md border-2 border-white shadow-sm transition-all duration-300 ${
                isConnected ? "bg-emerald-500" : "bg-rose-500"
              }`}
              style={{
                boxShadow: isConnected
                  ? "0 0 8px rgba(16, 185, 129, 0.5)"
                  : "0 0 8px rgba(244, 63, 94, 0.5)",
              }}
            ></div>
            {/* Unverified email marker — only visible to yourself */}
            {user && isEmailVerified === false && (
              <div
                className="absolute -top-0.5 -left-0.5 w-2.5 h-2.5 rounded-full bg-amber-400 border border-white"
                title="Email not verified — check your inbox for the verification link"
              />
            )}
          </div>

          {/* User name or sign in */}
          {user ? (
            <div className="flex min-w-0 items-center gap-1 sm:gap-3">
              <span className="hidden md:block max-w-40 truncate text-sm font-medium text-gray-700">
                {currentUsername ? `@${currentUsername}` : "Choose username"}
              </span>
              <button
                onClick={handleLogout}
                className="min-w-11 min-h-11 flex items-center justify-center gap-1.5 text-xs font-medium text-gray-500 hover:text-gray-700 transition-colors duration-200 px-2 py-1 hover:bg-gray-100 rounded-xl focus-visible:outline-2 focus-visible:outline-indigo-500"
                title="Sign out"
                aria-label="Sign out"
              >
                <LogOut className="w-4 h-4" />
                <span className="hidden lg:inline">Sign out</span>
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowAuthForm((s) => !s)}
              className={`min-w-11 min-h-11 flex items-center justify-center gap-2 px-2 sm:px-3 py-1.5 rounded-xl text-sm font-semibold transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-indigo-500 ${
                showAuthForm
                  ? "bg-gray-100 text-gray-500"
                  : "text-gray-800 hover:bg-gray-100"
              }`}
              aria-label={showAuthForm ? "Close sign in" : "Sign in"}
              aria-expanded={showAuthForm}
            >
              {showAuthForm && <X className="w-4 h-4" />}
              <span className={showAuthForm ? "hidden sm:inline" : ""}>
                {showAuthForm ? "Close" : "Sign in"}
              </span>
            </button>
          )}
        </div>
      </div>

      {/* Auth popover */}
      {!user && showAuthForm && (
        <div
          className="fixed inset-0 z-[100] overflow-y-auto touch-pan-y bg-slate-50/98 px-5 sm:absolute sm:inset-auto sm:top-[calc(100%+8px)] sm:right-0 sm:z-50 sm:w-80 sm:max-h-[calc(100dvh-5rem)] sm:rounded-2xl sm:border sm:border-white/60 sm:bg-white/95 sm:p-5 sm:shadow-xl sm:backdrop-blur-xl"
          role="dialog"
          aria-modal="true"
          aria-label="Account access"
        >
          <div className="mx-auto flex min-h-full w-full max-w-sm flex-col justify-center pt-[max(1.5rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:block sm:min-h-0 sm:max-w-none sm:p-0">
            <div className="mb-5 text-center sm:hidden">
              <Image
                src="/icon.png"
                alt=""
                width={64}
                height={64}
                className="mx-auto mb-3 h-16 w-16 drop-shadow-lg"
                aria-hidden="true"
              />
              <h1 className="text-2xl font-semibold tracking-tight text-gray-900">
                Live Notes
              </h1>
              <p className="mt-1 text-sm text-gray-500">
                Start notes and leave your mark.
              </p>
            </div>

            <div className="rounded-3xl border border-gray-200/80 bg-white p-5 shadow-xl sm:contents">
              <div className="mb-4 flex items-start justify-between sm:mb-3 sm:items-center">
                <div>
                  <h2 className="text-xl font-semibold text-gray-900 sm:text-sm">
                    {authMode === "login" ? "Welcome back" : "Join the board"}
                  </h2>
                  <p className="mt-1 text-sm text-gray-500 sm:hidden">
                    {authMode === "login"
                      ? "Use your account to continue."
                      : "Create an account in a few seconds."}
                  </p>
                </div>
                <button
                  onClick={() => setShowAuthForm(false)}
                  className="-mr-1 flex min-h-11 min-w-11 items-center justify-center rounded-xl text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 sm:min-h-8 sm:min-w-8 sm:rounded-lg"
                  aria-label="Close account access"
                >
                  <X className="h-5 w-5 sm:h-4 sm:w-4" />
                </button>
              </div>
              <div className="mb-4 flex items-center gap-1 rounded-xl bg-gray-100 p-1">
                <button
                  onClick={() => setAuthMode("login")}
                  className={`min-h-11 flex-1 rounded-lg py-2.5 text-sm font-medium transition-all duration-200 ${authMode === "login" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
                >
                  Login
                </button>
                <button
                  onClick={() => setAuthMode("signup")}
                  className={`min-h-11 flex-1 rounded-lg py-2.5 text-sm font-medium transition-all duration-200 ${authMode === "signup" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
                >
                  Sign Up
                </button>
              </div>
              <div className="flex flex-col gap-3 sm:gap-2">
                <input
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  aria-label="Email address"
                  placeholder="Email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="min-h-12 pointer-fine:min-h-11 w-full px-3 py-2 border border-gray-200 rounded-lg text-base pointer-fine:text-sm outline-none focus:ring-2 focus:ring-gray-300"
                />
                <input
                  type="password"
                  autoComplete={
                    authMode === "login" ? "current-password" : "new-password"
                  }
                  aria-label="Password"
                  placeholder="Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") submitAuth();
                  }}
                  className="min-h-12 pointer-fine:min-h-11 w-full px-3 py-2 border border-gray-200 rounded-lg text-base pointer-fine:text-sm outline-none focus:ring-2 focus:ring-gray-300"
                />
                {errorMessage && (
                  <div className="text-xs text-red-600 mt-1" role="alert">
                    {errorMessage}
                  </div>
                )}
                <button
                  onClick={submitAuth}
                  disabled={isSubmitting}
                  className="mt-1 min-h-12 w-full rounded-xl bg-gray-900 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-black disabled:opacity-50 pointer-fine:min-h-11"
                >
                  {authMode === "login" ? "Log In" : "Create Account"}
                </button>
                <div className="relative my-2">
                  <div className="w-full h-px bg-gray-200" />
                  <div className="absolute -top-2 left-1/2 -translate-x-1/2 bg-white px-2 text-[11px] text-gray-500">
                    or
                  </div>
                </div>
                <button
                  onClick={signInWithGoogle}
                  disabled={isSubmitting}
                  className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-800 transition-colors hover:bg-gray-50 disabled:opacity-50 pointer-fine:min-h-11"
                >
                  <GoogleIcon />
                  <span>Continue with Google</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {user && needsUsername && (
        <div
          className="fixed inset-0 z-[110] overflow-y-auto touch-pan-y bg-slate-50/98 px-5"
          role="dialog"
          aria-modal="true"
          aria-label="Choose your username"
        >
          <div className="mx-auto flex min-h-full w-full max-w-sm flex-col justify-center py-[max(1.5rem,env(safe-area-inset-top))]">
            <div className="mb-5 text-center">
              <Image
                src="/icon.png"
                alt=""
                width={64}
                height={64}
                className="mx-auto mb-3 h-16 w-16 drop-shadow-lg"
                aria-hidden="true"
              />
              <h1 className="text-2xl font-semibold tracking-tight text-gray-900">
                Choose your username
              </h1>
              <p className="mt-2 text-sm leading-6 text-gray-500">
                This is the name people will see on your notes and while you are
                online.
              </p>
            </div>

            <div className="rounded-3xl border border-gray-200/80 bg-white p-5 shadow-xl">
              <div className="mb-4 flex items-center gap-3">
                <div className="h-12 w-12 overflow-hidden rounded-2xl bg-indigo-100">
                  {profilePhoto ? (
                    <Image
                      src={profilePhoto}
                      alt=""
                      width={48}
                      height={48}
                      unoptimized
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-lg font-semibold text-indigo-600">
                      {(usernameInput || "u").charAt(0).toUpperCase()}
                    </div>
                  )}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900">
                    Your public identity
                  </p>
                  <p className="truncate text-xs text-gray-500">{user.email}</p>
                </div>
              </div>

              <label
                htmlFor="username"
                className="mb-1.5 block text-sm font-medium text-gray-700"
              >
                Username
              </label>
              <div className="flex min-h-12 items-center rounded-xl border border-gray-300 bg-white px-3 focus-within:border-indigo-400 focus-within:ring-2 focus-within:ring-indigo-100">
                <span className="text-gray-400">@</span>
                <input
                  id="username"
                  type="text"
                  inputMode="text"
                  autoComplete="username"
                  autoCapitalize="none"
                  spellCheck={false}
                  autoFocus
                  value={usernameInput}
                  onChange={(event) => {
                    setUsernameInput(normalizeUsername(event.target.value));
                    setUsernameError(null);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") void submitUsername();
                  }}
                  aria-describedby="username-help"
                  className="min-w-0 flex-1 bg-transparent px-1 py-3 text-base text-gray-900 outline-none"
                />
              </div>
              <p id="username-help" className="mt-2 text-xs text-gray-500">
                3 to 24 lowercase letters, numbers, or underscores. Usernames
                are unique and cannot be changed yet.
              </p>
              {usernameError && (
                <p className="mt-2 text-sm text-rose-600" role="alert">
                  {usernameError}
                </p>
              )}

              <button
                onClick={() => void submitUsername()}
                disabled={isSavingUsername}
                className="mt-5 min-h-12 w-full rounded-xl bg-gray-900 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-black disabled:opacity-50"
              >
                {isSavingUsername ? "Saving..." : "Continue to the board"}
              </button>
              <button
                onClick={handleLogout}
                disabled={isSavingUsername}
                className="mt-2 min-h-11 w-full rounded-xl px-4 py-2 text-sm font-medium text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 disabled:opacity-50"
              >
                Sign out
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
