"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import {
  onValue,
  ref,
  runTransaction,
  serverTimestamp,
  set,
  update,
} from "firebase/database";
import { auth, db } from "@/lib/firebase";
import {
  clearCachedProfile,
  getIdentityState,
  getUsernameError,
  normalizePublicProfiles,
  normalizeUsername,
  readCachedProfile,
  selectCurrentProfile,
  writeCachedProfile,
  type IdentityState,
  type PublicProfile,
} from "@/lib/profiles";
import { normalizeUserPhotoUrl } from "@/lib/notes";

export class UsernameTakenError extends Error {
  constructor() {
    super("That username is already taken.");
    this.name = "UsernameTakenError";
  }
}

type ProfileContextValue = {
  user: User | null;
  profile: PublicProfile | null;
  profiles: Record<string, PublicProfile>;
  isAuthReady: boolean;
  isProfilesReady: boolean;
  identityState: IdentityState;
  needsUsername: boolean;
  claimUsername: (value: string) => Promise<void>;
};

const ProfileContext = createContext<ProfileContextValue | null>(null);

function getBrowserStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function ProfileProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profiles, setProfiles] = useState<Record<string, PublicProfile>>({});
  const [cachedProfile, setCachedProfile] = useState<PublicProfile | null>(
    null,
  );
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [isProfilesReady, setIsProfilesReady] = useState(false);
  const previousUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    return onAuthStateChanged(auth, (currentUser) => {
      const previousUserId = previousUserIdRef.current;
      const storage = getBrowserStorage();
      if (!currentUser && previousUserId && storage) {
        clearCachedProfile(storage, previousUserId);
      }
      setCachedProfile(
        currentUser && storage
          ? readCachedProfile(storage, currentUser.uid)
          : null,
      );
      previousUserIdRef.current = currentUser?.uid ?? null;
      setUser(currentUser);
      setIsAuthReady(true);
    });
  }, []);

  useEffect(() => {
    return onValue(
      ref(db, "profiles"),
      (snapshot) => {
        setProfiles(normalizePublicProfiles(snapshot.val()));
        setIsProfilesReady(true);
      },
      (error) => {
        console.error("Failed to load public profiles:", error);
        setProfiles({});
        setIsProfilesReady(true);
      },
    );
  }, []);

  const liveProfile = user ? (profiles[user.uid] ?? null) : null;
  const profile = selectCurrentProfile({
    userId: user?.uid ?? null,
    profiles,
    isProfilesReady,
    cachedProfile,
  });
  const identityState = getIdentityState({
    isAuthReady,
    isProfilesReady,
    userId: user?.uid ?? null,
    profile,
  });

  useEffect(() => {
    if (!liveProfile) return;
    setCachedProfile(liveProfile);
    const storage = getBrowserStorage();
    if (storage) writeCachedProfile(storage, liveProfile);
  }, [liveProfile]);

  useEffect(() => {
    if (!user || !liveProfile) return;
    const photoUrl = normalizeUserPhotoUrl(user.photoURL);
    if (liveProfile.photo_url === photoUrl) return;

    void update(ref(db, `profiles/${user.uid}`), {
      photo_url: photoUrl ?? null,
      updated_at: serverTimestamp(),
    }).catch((error) => {
      console.error("Failed to refresh profile photo:", error);
    });
  }, [liveProfile, user]);

  const claimUsername = useCallback(
    async (value: string) => {
      if (!user) throw new Error("Sign in before choosing a username.");

      const username = normalizeUsername(value);
      const validationError = getUsernameError(username);
      if (validationError) throw new Error(validationError);

      const reservation = await runTransaction(
        ref(db, `usernames/${username}`),
        (currentOwner) => {
          if (currentOwner === null || currentOwner === user.uid) {
            return user.uid;
          }
          return;
        },
        { applyLocally: false },
      );

      if (!reservation.committed) throw new UsernameTakenError();

      await set(ref(db, `profiles/${user.uid}`), {
        username,
        photo_url: normalizeUserPhotoUrl(user.photoURL) ?? null,
        created_at: serverTimestamp(),
        updated_at: serverTimestamp(),
      });

      const claimedProfile = {
        id: user.uid,
        username,
        photo_url: normalizeUserPhotoUrl(user.photoURL),
      };
      setCachedProfile(claimedProfile);
      const storage = getBrowserStorage();
      if (storage) writeCachedProfile(storage, claimedProfile);
    },
    [user],
  );

  const value = useMemo<ProfileContextValue>(
    () => ({
      user,
      profile,
      profiles,
      isAuthReady,
      isProfilesReady,
      identityState,
      needsUsername: identityState === "needs_username",
      claimUsername,
    }),
    [
      claimUsername,
      identityState,
      isAuthReady,
      isProfilesReady,
      profile,
      profiles,
      user,
    ],
  );

  return (
    <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>
  );
}

export function useProfile() {
  const context = useContext(ProfileContext);
  if (!context) {
    throw new Error("useProfile must be used inside ProfileProvider.");
  }
  return context;
}
