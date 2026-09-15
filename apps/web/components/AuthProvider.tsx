"use client";

import {
  BrowserCacheLocation,
  InteractionRequiredAuthError,
  PublicClientApplication,
  type AccountInfo,
} from "@azure/msal-browser";
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

const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api").replace(/\/$/, "");
const developmentMode = (process.env.NEXT_PUBLIC_AUTH_MODE ?? "development") === "development";

export interface AppUser {
  id?: string;
  email: string;
  displayName: string;
  permissions?: string[];
}

interface AuthContextValue {
  ready: boolean;
  user: AppUser | null;
  apiUrl: string;
  request<T>(path: string, init?: RequestInit): Promise<T>;
  login(): Promise<void>;
  logout(): Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function initials(name: string) {
  const pieces = name.trim().split(/\s+/).filter(Boolean);
  return (pieces.length > 1 ? `${pieces[0][0]}${pieces.at(-1)?.[0] ?? ""}` : pieces[0]?.slice(0, 2) ?? "U").toUpperCase();
}

export function userInitials(user: AppUser | null) {
  return user ? initials(user.displayName || user.email) : "--";
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const appRef = useRef<PublicClientApplication | null>(null);
  const accountRef = useRef<AccountInfo | null>(null);
  const [ready, setReady] = useState(developmentMode);
  const [user, setUser] = useState<AppUser | null>(developmentMode ? {
    email: "admin@mspcrm.local",
    displayName: "Local Administrator",
    permissions: ["*"],
  } : null);

  const login = useCallback(async () => {
    if (developmentMode) return;
    const app = appRef.current;
    if (!app) return;
    const scope = process.env.NEXT_PUBLIC_API_SCOPE;
    if (!scope) throw new Error("NEXT_PUBLIC_API_SCOPE is required for production authentication.");
    await app.loginRedirect({ scopes: ["openid", "profile", "email", scope] });
  }, []);

  const logout = useCallback(async () => {
    if (developmentMode) return;
    const app = appRef.current;
    const account = accountRef.current;
    if (!app || !account) return;
    await app.logoutRedirect({ account });
  }, []);

  const token = useCallback(async () => {
    if (developmentMode) return undefined;
    const app = appRef.current;
    const account = accountRef.current;
    const scope = process.env.NEXT_PUBLIC_API_SCOPE;
    if (!app || !account || !scope) throw new Error("Authentication has not initialized.");
    try {
      const result = await app.acquireTokenSilent({ account, scopes: [scope] });
      return result.accessToken;
    } catch (error) {
      if (error instanceof InteractionRequiredAuthError) {
        await app.acquireTokenRedirect({ account, scopes: [scope] });
        return undefined;
      }
      throw error;
    }
  }, []);

  const request = useCallback(async <T,>(path: string, init: RequestInit = {}): Promise<T> => {
    const accessToken = await token();
    const response = await fetch(`${API_URL}${path.startsWith("/") ? path : `/${path}`}`, {
      ...init,
      headers: {
        Accept: "application/json",
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        ...(init.headers ?? {}),
      },
      cache: "no-store",
    });
    if (response.status === 204) return undefined as T;
    const contentType = response.headers.get("content-type") ?? "";
    const payload = contentType.includes("application/json") ? await response.json() : await response.text();
    if (!response.ok) {
      const message = typeof payload === "object" && payload && "message" in payload
        ? String((payload as { message?: unknown }).message)
        : `Request failed (${response.status}).`;
      throw new Error(message);
    }
    return payload as T;
  }, [token]);

  useEffect(() => {
    if (developmentMode) {
      void request<AppUser>("/me").then(setUser).catch(() => undefined);
      return;
    }

    let cancelled = false;
    void (async () => {
      const tenantId = process.env.NEXT_PUBLIC_ENTRA_TENANT_ID;
      const clientId = process.env.NEXT_PUBLIC_ENTRA_CLIENT_ID;
      if (!tenantId || !clientId) throw new Error("Microsoft Entra frontend authentication is not configured.");

      const app = new PublicClientApplication({
        auth: {
          clientId,
          authority: `https://login.microsoftonline.com/${tenantId}`,
          redirectUri: window.location.origin,
          postLogoutRedirectUri: window.location.origin,
        },
        cache: {
          cacheLocation: BrowserCacheLocation.SessionStorage,
        },
      });
      appRef.current = app;
      await app.initialize();
      const redirect = await app.handleRedirectPromise();
      const account = redirect?.account ?? app.getActiveAccount() ?? app.getAllAccounts()[0] ?? null;
      if (!account) {
        await app.loginRedirect({
          scopes: ["openid", "profile", "email", process.env.NEXT_PUBLIC_API_SCOPE ?? ""].filter(Boolean),
        });
        return;
      }
      app.setActiveAccount(account);
      accountRef.current = account;
      if (cancelled) return;
      setUser({
        email: account.username,
        displayName: account.name ?? account.username,
      });
      setReady(true);

      try {
        const me = await request<AppUser>("/me");
        if (!cancelled) setUser(me);
      } catch {
        // The account identity is still useful while the API is temporarily unavailable.
      }
    })().catch((error) => {
      console.error("Authentication initialization failed", error);
      if (!cancelled) setReady(true);
    });
    return () => { cancelled = true; };
  }, [request]);

  const value = useMemo<AuthContextValue>(() => ({ ready, user, apiUrl: API_URL, request, login, logout }), [ready, user, request, login, logout]);

  if (!ready) {
    return (
      <div className="authLoading">
        <div className="brandIcon">M</div>
        <strong>Signing in…</strong>
      </div>
    );
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider.");
  return value;
}
