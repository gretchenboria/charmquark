"use client";

import { useState } from "react";
import Image from "next/image";
import {
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  sendEmailVerification,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  type User as FirebaseUser,
} from "firebase/auth";
import { requireAuth } from "@/lib/firebase";
import { ApiError, api } from "@/lib/api";
import { PRESET_USERS, ROLE_LABEL, setUser } from "@/lib/session";

/** Local development only: skip Firebase and act as a preset user (the API must run with ENVIRONMENT=development). */
const DEV_BYPASS = process.env.NEXT_PUBLIC_BYPASS_FIREBASE === "true";
const FIREBASE_CONFIGURED = Boolean(process.env.NEXT_PUBLIC_FIREBASE_API_KEY);

export function Login() {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  /** True when sign-in was handled without Firebase (dev bypass) or cannot happen at all. */
  const handledWithoutFirebase = (): boolean => {
    if (DEV_BYPASS) {
      setUser(PRESET_USERS[0]);
      return true;
    }
    if (!FIREBASE_CONFIGURED) {
      setError("Sign-in is not configured for this deployment: the NEXT_PUBLIC_FIREBASE_* variables were not set at build time.");
      return true;
    }
    return false;
  };

  /**
   * Firebase proves who someone is; the API decides what they may do. The role
   * shown in the app comes from GET /api/me — the same users row the server
   * authorizes against — never from the client.
   */
  const finishSignIn = async (fbUser: FirebaseUser) => {
    const auth = requireAuth();
    if (!fbUser.emailVerified) {
      await sendEmailVerification(fbUser).catch(() => undefined);
      await signOut(auth);
      setNotice(`We sent a verification link to ${fbUser.email}. Open it, then sign in.`);
      return;
    }
    try {
      const me = await api.me();
      setUser({ name: me.name, role: me.role, title: ROLE_LABEL[me.role] });
    } catch (err) {
      await signOut(auth).catch(() => undefined);
      throw err;
    }
  };

  const fail = (err: unknown, fallback: string) =>
    setError(err instanceof ApiError ? err.friendly : err instanceof Error ? err.message : fallback);

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);
    if (handledWithoutFirebase()) return;
    try {
      const auth = requireAuth();
      const cred = isSignUp
        ? await createUserWithEmailAndPassword(auth, email, password)
        : await signInWithEmailAndPassword(auth, email, password);
      await finishSignIn(cred.user);
    } catch (err) {
      fail(err, `Failed to ${isSignUp ? "sign up" : "sign in"}`);
    }
  };

  const handleGoogleLogin = async () => {
    setError(null);
    setNotice(null);
    if (handledWithoutFirebase()) return;
    try {
      const cred = await signInWithPopup(requireAuth(), new GoogleAuthProvider());
      await finishSignIn(cred.user);
    } catch (err) {
      fail(err, "Google sign in failed");
    }
  };

  return (
    <div className="flex h-screen items-center justify-center bg-neutral-50">
      <div className="w-[420px] rounded-2xl border border-neutral-200 bg-white p-8 shadow-sm">
        <div className="mb-6 flex flex-col items-center gap-2 text-center">
          <div className="flex flex-col items-center gap-4">
            <Image src="/cq-logo.png" alt="" width={160} height={160} priority />
          </div>
          <p className="mt-2 text-[15px] font-medium text-[color:var(--cq-ink-soft)]">
            Enterprise Fleet Orchestration
          </p>
        </div>

        {error && <div className="mb-4 text-sm text-red-600 bg-red-50 p-3 rounded">{error}</div>}
        {notice && <div className="mb-4 text-sm text-neutral-700 bg-neutral-100 p-3 rounded">{notice}</div>}

        <form onSubmit={handleEmailAuth} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="email" className="text-xs font-semibold uppercase tracking-wider text-[color:var(--cq-ink-faint)]">
              Work Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="operator@example.com"
              className="cq-input w-full"
              required
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="password" className="text-xs font-semibold uppercase tracking-wider text-[color:var(--cq-ink-faint)]">
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="cq-input w-full"
            />
          </div>
          <button
            type="submit"
            className="cq-btn-primary flex w-full items-center justify-center gap-2 mt-2"
          >
            {isSignUp ? "Create account" : "Sign in"}
          </button>
        </form>

        <div className="mt-4 text-center text-sm text-neutral-500">
          {isSignUp ? "Already have an account? " : "Don't have an account? "}
          <button
            type="button"
            onClick={() => setIsSignUp(!isSignUp)}
            className="font-medium text-[color:var(--cq-azure-base)] hover:underline"
          >
            {isSignUp ? "Sign in" : "Sign up"}
          </button>
        </div>

        <div className="relative mt-6">
          <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-neutral-200"></div></div>
          <div className="relative flex justify-center text-sm"><span className="bg-white px-2 text-neutral-500">Or continue with</span></div>
        </div>

        <button
          onClick={handleGoogleLogin}
          className="mt-6 flex w-full items-center justify-center gap-2 rounded-lg border border-neutral-200 px-4 py-2.5 text-sm font-medium text-neutral-700 transition hover:bg-neutral-50"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.920 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
          Google SSO
        </button>

        <div className="mt-8 flex items-center justify-center gap-2 border-t border-neutral-100 pt-6 text-xs text-neutral-400">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
          </svg>
          Secured by Firebase
        </div>
      </div>
    </div>
  );
}
