import { createContext, PropsWithChildren, useCallback, useEffect, useMemo, useState } from "react";
import { AuthLoginRequest, UserSummary } from "@shared/api";
import { apiClient } from "@/lib/api";
import { authStorage } from "@/lib/auth";

type AuthStatus = "checking" | "authenticated" | "unauthenticated";

export interface AuthContextValue {
  user: UserSummary | null;
  status: AuthStatus;
  login: (payload: AuthLoginRequest) => Promise<void>;
  register: (payload: any) => Promise<void>;
  logout: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: PropsWithChildren) {
  const [user, setUser] = useState<UserSummary | null>(null);
  const [status, setStatus] = useState<AuthStatus>("checking");

  useEffect(() => {
    const token = authStorage.getToken();
    if (!token) {
      setStatus("unauthenticated");
      return;
    }

    apiClient.auth
      .me()
      .then((res) => {
        setUser(res.user);
        setStatus("authenticated");
      })
      .catch(() => {
        authStorage.clear();
        setStatus("unauthenticated");
      });
  }, []);

  const login = useCallback(async (payload: AuthLoginRequest) => {
    setStatus("checking");
    try {
      const response = await apiClient.auth.login(payload);
      authStorage.save(response.token, response.refreshToken);
      setUser(response.user);
      setStatus("authenticated");
    } catch (error) {
      setStatus("unauthenticated");
      throw error;
    }
  }, []);

  const register = useCallback(async (payload: any) => {
    setStatus("checking");
    try {
      const response = await apiClient.auth.register(payload);
      authStorage.save(response.token, response.refreshToken);
      setUser(response.user);
      setStatus("authenticated");
    } catch (error) {
      setStatus("unauthenticated");
      throw error;
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await apiClient.auth.logout();
    } catch (error) {
      console.warn("Logout request failed", error);
    } finally {
      authStorage.clear();
      setUser(null);
      setStatus("unauthenticated");
    }
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      status,
      login,
      register,
      logout,
    }),
    [login, register, logout, status, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}


