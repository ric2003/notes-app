"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
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
  getUsernameError,
  normalizePublicProfiles,
  normalizeUsername,
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
  needsUsername: boolean;
  claimUsername: (value: string) => Promise<void>;
};

const ProfileContext = createContext<ProfileContextValue | null>(null);

export function ProfileProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profiles, setProfiles] = useState<Record<string, PublicProfile>>({});
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [isProfilesReady, setIsProfilesReady] = useState(false);

  useEffect(() => {
    return onAuthStateChanged(auth, (currentUser) => {
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

  const profile = user ? (profiles[user.uid] ?? null) : null;

  useEffect(() => {
    if (!user || !profile) return;
    const photoUrl = normalizeUserPhotoUrl(user.photoURL);
    if (profile.photo_url === photoUrl) return;

    void update(ref(db, `profiles/${user.uid}`), {
      photo_url: photoUrl ?? null,
      updated_at: serverTimestamp(),
    }).catch((error) => {
      console.error("Failed to refresh profile photo:", error);
    });
  }, [profile, user]);

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
      needsUsername:
        isAuthReady && isProfilesReady && user !== null && profile === null,
      claimUsername,
    }),
    [claimUsername, isAuthReady, isProfilesReady, profile, profiles, user],
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
