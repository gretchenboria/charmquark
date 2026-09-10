"use client";

import { useCallback, useRef, useState } from "react";
import type { LogEntry, LogFn, LogKind } from "./types";

/** Activity-log state + append fn shared by every workflow body. Timestamps are
 *  local HH:MM:SS so the narration reads like a real run trace. */
export function useActivityLog(): { entries: LogEntry[]; log: LogFn; reset: () => void } {
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const seq = useRef(0);
  const log = useCallback((kind: LogKind, text: string) => {
    const at = new Date().toLocaleTimeString(undefined, { hour12: false });
    seq.current += 1;
    setEntries((cur) => [...cur, { id: seq.current, at, kind, text }]);
  }, []);
  const reset = useCallback(() => setEntries([]), []);
  return { entries, log, reset };
}
