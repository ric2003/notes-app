"use client";

import { useEffect, useState } from "react";
import { UserIcon, LogIn, LogOut } from "lucide-react";
import { auth } from "@/lib/firebase";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  type User,
} from "firebase/auth";

interface UserProfilesProps {
  className?: string;
  isConnected?: boolean;
}

export default function UserProfiles({
  className = "",
  isConnected = false,
}: UserProfilesProps) {
  const [user, setUser] = useState<User | null>(null);
  const [showAuthForm, setShowAuthForm] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        setShowAuthForm(false);
      }
    });
    return () => unsub();
  }, []);

  const handleSignUp = async () => {
    try {
      setIsSubmitting(true);
      setErrorMessage(null);
      await createUserWithEmailAndPassword(auth, email, password);
      setEmail("");
      setPassword("");
      alert("User registered!");
    } catch (error: any) {
      setErrorMessage(error?.message ?? "Failed to sign up");
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
    } catch (error: any) {
      setErrorMessage(error?.message ?? "Failed to log in");
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

  return (
    <div className={`relative flex items-center ${className}`}>
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
