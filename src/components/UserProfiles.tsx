"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { UserIcon, LogIn, LogOut } from "lucide-react";
import { auth, db } from "@/lib/firebase";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  type User,
} from "firebase/auth";
import {
  ref,
  onValue as onDbValue,
  onDisconnect,
  set,
  remove,
  serverTimestamp,
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
    }[]
  >([]);
  const [showAuthForm, setShowAuthForm] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showPresenceList, setShowPresenceList] = useState(false);
  const presenceRef = useRef<HTMLDivElement | null>(null);

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
        // Remove previous anonymous presence record if it exists
        if (sessionId) {
          remove(ref(db, `notes/presence/${sessionId}`)).catch(() => {});
        }
      }
    });
    return () => unsub();
  }, [sessionId]);

  // Keep presence up to date in Realtime Database
  useEffect(() => {
    if (!sessionId) return;

    const connectedRef = ref(db, ".info/connected");
    const unsubscribe = onDbValue(connectedRef, (snap) => {
      const isConn = snap.val() === true;
      if (!isConn) return;

      const id = user?.uid ?? sessionId;
      const name = user?.displayName || user?.email || "Anonymous";
      const emailVal = user?.email ?? null;
      const presenceRef = ref(db, `notes/presence/${id}`);

      // Set online state
      set(presenceRef, {
        id,
        name,
        email: emailVal,
        isAnonymous: !user,
        online: true,
        last_changed: serverTimestamp(),
      }).catch(() => {});

      // Ensure we flip to offline when the tab disconnects
      onDisconnect(presenceRef)
        .update({ online: false, last_changed: serverTimestamp() })
        .catch(() => {});
    });

    return () => {
      unsubscribe();
      // Do not force set offline here; onDisconnect will handle abrupt closes
    };
  }, [user, sessionId]);

  // Subscribe to presence list
  useEffect(() => {
    const presenceListRef = ref(db, "notes/presence");
    const unsubscribe = onDbValue(presenceListRef, (snapshot) => {
      const val = snapshot.val() || {};
      type PresenceEntry = {
        id: string;
        name?: string;
        email?: string | null;
        isAnonymous?: boolean;
        online?: boolean;
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
      await createUserWithEmailAndPassword(auth, email, password);
      setEmail("");
      setPassword("");
      alert("User registered!");
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
      alert("Logged in!");
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
      await signOut(auth);
      alert("Logged out!");
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
    if (totalOnline <= 1) return "Just you";
    return `${totalOnline} online`;
  }, [totalOnline]);

  return (
    <div className={`relative flex items-center ${className}`}>
      {/* Users Stack - Online presence */}
      <div
        ref={presenceRef}
        role="button"
        aria-expanded={showPresenceList}
        aria-label="Online users"
        onClick={() => setShowPresenceList((s) => !s)}
        className="relative flex items-center bg-white/90 backdrop-blur-sm rounded-full shadow-lg border border-gray-200 px-3 py-2 cursor-pointer select-none"
        title="Show online users"
      >
        <div className="flex items-center">
          {onlineUsers.slice(0, 4).map((u, index) => (
            <div
              key={u.id}
              className="relative group"
              style={{
                marginLeft: index > 0 ? "-8px" : "0",
                zIndex: 10 - index,
              }}
            >
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-semibold border-2 border-green-400 shadow-sm transition-all duration-200 group-hover:scale-110 group-hover:z-50"
                style={{ backgroundColor: getColorForId(u.id) }}
                title={`${u.name || "Anonymous"} - Online`}
              >
                {(u.name || "?").charAt(0).toUpperCase()}
              </div>
            </div>
          ))}

          {onlineUsers.length > 4 && (
            <div className="relative" style={{ marginLeft: "-8px", zIndex: 1 }}>
              <div className="w-8 h-8 rounded-full bg-gray-100 border-2 border-white shadow-sm flex items-center justify-center hover:bg-gray-200 transition-colors duration-200">
                <span className="text-xs text-gray-600 font-medium">
                  +{onlineUsers.length - 4}
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
          <div className="absolute top-12 left-0 w-64 bg-white/95 backdrop-blur-sm border border-gray-200 rounded-xl shadow-xl p-3 z-50">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-gray-700">
                Online now
              </span>
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-100 text-green-700">
                {totalOnline}
              </span>
            </div>
            <div className="max-h-64 overflow-auto pr-1">
              {onlineUsers.map((u) => (
                <div key={u.id} className="flex items-center gap-2 py-1.5">
                  <div
                    className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-semibold"
                    style={{ backgroundColor: getColorForId(u.id) }}
                    title={`${u.name || "Anonymous"}`}
                  >
                    {(u.name || "?").charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm text-gray-800 truncate">
                      {u.name || "Anonymous"}
                    </div>
                    <div className="text-[11px] text-gray-500 truncate">
                      {u.email || (u.isAnonymous ? "Guest" : "")}
                    </div>
                  </div>
                  {u.id === myId && (
                    <span className="ml-auto text-[10px] text-gray-500">
                      you
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Separator */}
      <div className="mx-1"></div>

      {/* User Profile */}
      <div className="flex items-center">
        {/* Combined profile and name container */}
        <div className="flex items-center bg-white/90 backdrop-blur-sm rounded-full shadow-lg border border-gray-200 pl-1 pr-3 py-1">
          <div className="relative mr-3">
            {/* Main avatar with status ring */}
            <div
              className={`relative p-0.5 rounded-full ${isConnected ? "bg-green-500" : "bg-red-500"} transition-all duration-300`}
            >
              <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center">
                {user ? (
                  <span className="text-gray-700 font-bold text-sm">
                    {displayName.charAt(0).toUpperCase()}
                  </span>
                ) : (
                  <UserIcon className="w-4 h-4 text-gray-400" />
                )}
              </div>
            </div>

            {/* Connection Status indicator */}
            <div
              className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white shadow-sm transition-all duration-300 ${
                isConnected ? "bg-green-500" : "bg-red-500"
              }`}
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
                className="flex items-center gap-1 text-xs font-medium text-gray-600 hover:text-gray-900 transition-colors duration-200"
                title="Sign out"
              >
                <LogOut className="w-4 h-4" />
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
                  <LogIn className="w-4 h-4" />
                  <span>Sign In</span>
                </div>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Auth popover */}
      {!user && showAuthForm && (
        <div className="absolute top-12 right-0 w-72 bg-white/95 backdrop-blur-sm border border-gray-200 rounded-xl shadow-xl p-4 z-50">
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
            <div className="flex items-center justify-between gap-2 pt-1">
              <button
                onClick={handleLogin}
                disabled={isSubmitting}
                className="flex-1 px-3 py-2 bg-gray-900 text-white rounded-lg text-sm hover:bg-black transition-colors disabled:opacity-50"
              >
                Log In
              </button>
              <button
                onClick={handleSignUp}
                disabled={isSubmitting}
                className="flex-1 px-3 py-2 bg-white text-gray-900 border border-gray-300 rounded-lg text-sm hover:bg-gray-50 transition-colors disabled:opacity-50"
              >
                Sign Up
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
