import { emptySession, type Session } from "./domain";

const KEY = "braindump.v1";

// Text only. Audio is never stored: it lives in memory until it is turned into text.
export function loadSession(): Session | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const stored = JSON.parse(raw) as Partial<Session>;
    const base = emptySession();
    return {
      ...base,
      ...stored,
      header: { ...base.header, ...(stored.header ?? {}) },
      answers: { ...(stored.answers ?? {}) },
      approaches: stored.approaches ?? [],
      repro: { ...base.repro, ...(stored.repro ?? {}) },
    };
  } catch {
    return null;
  }
}

export function saveSession(session: Session): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(session));
    return true;
  } catch {
    return false;
  }
}

export function clearSession() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* nothing to clear */
  }
}
