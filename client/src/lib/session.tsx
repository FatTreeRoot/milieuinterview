import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { api } from "./api";
import type { Capabilities, CurrentUser } from "./types";

type SessionValue = {
  user: CurrentUser | null;
  capabilities: Capabilities;
  loading: boolean;
  setUser: (user: CurrentUser | null) => void;
  signOut: () => Promise<void>;
};

const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [capabilities, setCapabilities] = useState<Capabilities>({
    ai: false,
    email: false,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const me = await api.get<{ user: CurrentUser | null }>("/api/auth/me");
        if (cancelled) return;
        setUser(me.user);
        if (me.user) {
          const caps = await api.get<Capabilities>("/api/capabilities");
          if (!cancelled) setCapabilities(caps);
        }
      } catch {
        // Treated as signed out; the login screen will surface any real problem.
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Capabilities depend on server configuration, so they are read per sign-in.
  const handleSetUser = useCallback((next: CurrentUser | null) => {
    setUser(next);
    if (next) {
      void api
        .get<Capabilities>("/api/capabilities")
        .then(setCapabilities)
        .catch(() => undefined);
    }
  }, []);

  const signOut = useCallback(async () => {
    await api.post("/api/auth/logout").catch(() => undefined);
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ user, capabilities, loading, setUser: handleSetUser, signOut }),
    [user, capabilities, loading, handleSetUser, signOut],
  );

  return (
    <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
  );
}

export function useSession(): SessionValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error("useSession must be used inside SessionProvider");
  return value;
}
