"use client";

import { useEffect, useState } from "react";
import { getUser, type User } from "./session";

/** Reactive current-user hook. Re-renders on login/logout (same tab). */
export function useUser(): User | null {
  const [user, setUserState] = useState<User | null>(getUser);
  useEffect(() => {
    const sync = () => setUserState(getUser());
    sync();
    window.addEventListener("charmquark-user-changed", sync);
    return () => window.removeEventListener("charmquark-user-changed", sync);
  }, []);
  return user;
}
