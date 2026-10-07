import { useEffect, useRef, useState } from "react";

/**
 * State that survives the screen going away.
 *
 * A browser tab can be re-created for reasons the user never asked for — a dev
 * reload, a mobile tab eviction, an accidental swipe, a crashed renderer — and
 * losing an in-progress timer or a half-finished quiz to that feels like the
 * app threw the work away. Anything the user is in the middle of is therefore
 * mirrored to `localStorage` under a versioned envelope and restored on mount,
 * so a remount resumes instead of resetting.
 *
 * Only ephemeral, user-local progress belongs here. Anything that matters after
 * today goes to the server.
 */

interface Envelope<T> {
  /** Payload. */
  v: T;
  /** Wall-clock write time, so stale progress can be dropped rather than resumed. */
  at: number;
}

/** Reads a snapshot, returning null when absent, unreadable or too old. */
export function readPersisted<T>(key: string, maxAgeMs?: number): T | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const env = JSON.parse(raw) as Envelope<T>;
    if (!env || typeof env.at !== "number") return null;
    if (maxAgeMs !== undefined && Date.now() - env.at > maxAgeMs) {
      localStorage.removeItem(key);
      return null;
    }
    return env.v ?? null;
  } catch {
    // Private mode, quota, or hand-edited garbage — treat as "nothing saved".
    return null;
  }
}

/**
 * When a snapshot was written, in epoch ms, or null when there isn't one.
 * Anything that counts down needs this to know how much real time it missed.
 */
export function readPersistedAt(key: string): number | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const env = JSON.parse(raw) as Envelope<unknown>;
    return typeof env?.at === "number" ? env.at : null;
  } catch {
    return null;
  }
}

/** Writes a snapshot. Silently gives up when storage is unavailable. */
export function writePersisted<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify({ v: value, at: Date.now() } satisfies Envelope<T>));
  } catch {
    /* progress just won't survive a reload */
  }
}

/** Drops a snapshot — call it once the work it described is finished. */
export function clearPersisted(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    /* nothing to do */
  }
}

/**
 * `useState`, mirrored to `localStorage`.
 *
 * `maxAgeMs` bounds how long a snapshot stays resumable; past it the initial
 * value is used instead. Changing `key` re-reads for the new key, so a
 * per-record key (a quiz id, say) keeps each record's progress separate.
 */
export function usePersistentState<T>(
  key: string,
  initial: T,
  options?: { maxAgeMs?: number },
): [T, React.Dispatch<React.SetStateAction<T>>] {
  const maxAgeMs = options?.maxAgeMs;
  const [value, setValue] = useState<T>(() => readPersisted<T>(key, maxAgeMs) ?? initial);

  const keyRef = useRef(key);
  const initialRef = useRef(initial);
  useEffect(() => {
    if (keyRef.current === key) return;
    keyRef.current = key;
    setValue(readPersisted<T>(key, maxAgeMs) ?? initialRef.current);
  }, [key, maxAgeMs]);

  useEffect(() => {
    writePersisted(key, value);
  }, [key, value]);

  return [value, setValue];
}
