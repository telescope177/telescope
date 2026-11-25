import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { clearToken, saveToken } from "./api";
import { allows, canOpen, findAccount, firstPage, type Action, type PageId, type Role } from "./auth";

export type { PageId, Role };

interface Session {
  user: string | null;
  role: Role;
  page: PageId;
  grants: Record<string, Action[]> | null;
  collectRan: boolean;
  retryLogs: string[];
  extracted: Record<"UP-01" | "UP-02", boolean>;
  archived: boolean;
  exactDone: boolean;
  fuzzyDone: boolean;
  draftChecked: boolean;
  typoAccepted: boolean;
  reused: boolean;
  returned: boolean;
  returnOpinion: string;
  reviewOpinion: string;
  dataChecked: boolean;
  ledgerImported: boolean;
  extractMatched: boolean;
  exported: boolean;
  toast: string;
}

const initial: Session = {
  user: null,
  role: "管理员",
  page: "intake",
  grants: null,
  collectRan: false,
  retryLogs: [],
  extracted: { "UP-01": false, "UP-02": false },
  archived: false,
  exactDone: false,
  fuzzyDone: false,
  draftChecked: false,
  typoAccepted: false,
  reused: false,
  returned: false,
  returnOpinion: "",
  reviewOpinion: "",
  dataChecked: false,
  ledgerImported: false,
  extractMatched: false,
  exported: false,
  toast: "",
};

interface Store {
  state: Session;
  go: (page: PageId) => void;
  patch: (partial: Partial<Session>) => void;
  toast: (message: string) => void;
  login: (username: string, password: string) => Promise<boolean>;
  can: (action: Action) => boolean;
  logout: () => void;
  reset: () => void;
  doneCount: number;
}

const KEY = "gov-demo-session-v1";
const Ctx = createContext<Store | null>(null);

function loadSession(): Session {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return initial;
    const session = { ...initial, ...(JSON.parse(raw) as Partial<Session>), toast: "" };
    const account = findAccount(session.user);
    if (!account) return { ...session, user: null };
    return { ...session, role: account.role, page: canOpen(account.username, session.page, session.grants) ? session.page : firstPage(account.username, session.grants) };
  } catch {
    return initial;
  }
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<Session>(loadSession);

  useEffect(() => {
    sessionStorage.setItem(KEY, JSON.stringify({ ...state, toast: "" }));
  }, [state]);
  const api = useMemo<Store>(() => {
    const flags = [
      state.collectRan,
      state.extracted["UP-01"] && state.extracted["UP-02"],
      state.archived,
      state.exactDone,
      state.fuzzyDone,
      state.draftChecked,
      state.draftChecked,
      state.draftChecked,
      state.reused,
      state.returned,
      state.dataChecked,
      state.exported,
    ];
    return {
      state,
      go: (page) => setState((prev) => {
        if (!canOpen(prev.user, page, prev.grants)) return { ...prev, toast: "当前账号没有这项功能" };
        return { ...prev, page };
      }),
      can: (action) => allows(state.role, action, state.grants),
      patch: (partial) => setState((prev) => ({ ...prev, ...partial })),
      toast: (message) => {
        setState((prev) => ({ ...prev, toast: message }));
        window.setTimeout(() => setState((prev) => ({ ...prev, toast: "" })), 2600);
      },
      login: async (username, password) => {
        const name = username.trim();
        try {
          const response = await fetch("/api/login", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ username: name, password }),
          });
          const body = await response.json();
          if (!response.ok || !body.ok) throw new Error(body.error || "账号或密码不正确");
          saveToken(body.token);
          const grants = body.grants ?? null;
          setState((prev) => ({ ...prev, user: body.username, role: body.role, grants, page: firstPage(body.username, grants), toast: "" }));
          return true;
        } catch (cause) {
          const account = findAccount(name);
          if (account && account.password === password && cause instanceof TypeError) {
            clearToken();
            setState((prev) => ({ ...prev, user: account.username, role: account.role, grants: null, page: firstPage(account.username), toast: "接口未连接，仅本地会话" }));
            window.setTimeout(() => setState((prev) => ({ ...prev, toast: "" })), 2600);
            return true;
          }
          clearToken();
          const message = cause instanceof Error ? cause.message : "账号或密码不正确";
          setState((prev) => ({ ...prev, toast: message.includes("JSON") ? "咨询接口未连接" : message }));
          window.setTimeout(() => setState((prev) => ({ ...prev, toast: "" })), 2600);
          return false;
        }
      },
      logout: () => {
        clearToken();
        setState((prev) => ({ ...prev, user: null, grants: null, page: "intake", toast: "" }));
      },
      reset: () => {
        sessionStorage.removeItem(KEY);
        clearToken();
        setState({ ...initial, toast: "已重置" });
      },
      doneCount: flags.filter(Boolean).length,
    };
  }, [state]);
  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export function useStore() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("store");
  return ctx;
}
