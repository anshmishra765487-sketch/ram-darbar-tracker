import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api } from "./api";

const TOKEN_KEY = "rdt_token";
const USER_KEY = "rdt_user";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY) || "");
  const [user, setUser] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(USER_KEY)) || null;
    } catch {
      return null;
    }
  });
  const [checking, setChecking] = useState(Boolean(token));

  const logoutLocal = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    setToken("");
    setUser(null);
  }, []);

  useEffect(() => {
    if (!token) {
      setChecking(false);
      return;
    }
    let cancelled = false;
    api
      .get("/auth/me")
      .then((res) => {
        if (cancelled) return;
        setUser(res.data);
        localStorage.setItem(USER_KEY, JSON.stringify(res.data));
      })
      .catch(() => !cancelled && logoutLocal())
      .finally(() => !cancelled && setChecking(false));
    return () => {
      cancelled = true;
    };
  }, [token, logoutLocal]);

  const applySession = useCallback((data) => {
    localStorage.setItem(TOKEN_KEY, data.access_token);
    localStorage.setItem(USER_KEY, JSON.stringify(data.user));
    setToken(data.access_token);
    setUser(data.user);
    return data.user;
  }, []);

  const login = useCallback(
    async (identifier, password) => {
      const res = await api.post("/auth/login", { identifier: identifier.trim(), password });
      return applySession(res.data);
    },
    [applySession],
  );

  const signup = useCallback(
    async ({ name, phone, password, email }) => {
      // Account bana deta hai, lekin login nahi karta - user ko phir se
      // login screen par apne number + password se login karna hota hai.
      const res = await api.post("/auth/signup", {
        name: name.trim(),
        phone: phone.trim(),
        password,
        email: email?.trim() || undefined,
      });
      return res.data.user;
    },
    [],
  );

  const loginWithOtp = useCallback(
    async (identifier, code) => {
      const res = await api.post("/auth/otp/verify", {
        identifier: identifier.trim(),
        code: String(code).trim(),
      });
      return applySession(res.data);
    },
    [applySession],
  );

  const resetPassword = useCallback(async (identifier, code, newPassword) => {
    const res = await api.post("/auth/password-reset", {
      identifier: identifier.trim(),
      code: String(code).trim(),
      new_password: newPassword,
    });
    return res.data;
  }, []);

  const refreshUser = useCallback(async () => {
    const res = await api.get("/auth/me");
    setUser(res.data);
    localStorage.setItem(USER_KEY, JSON.stringify(res.data));
    return res.data;
  }, []);

  const logout = useCallback(() => logoutLocal(), [logoutLocal]);

  const value = useMemo(
    () => ({
      token,
      user,
      checking,
      isAuthenticated: Boolean(token),
      login,
      signup,
      loginWithOtp,
      resetPassword,
      refreshUser,
      logout,
    }),
    [token, user, checking, login, signup, loginWithOtp, resetPassword, refreshUser, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return (
    useContext(AuthContext) || {
      user: null,
      checking: false,
      isAuthenticated: false,
      login: async () => {},
      signup: async () => {},
      loginWithOtp: async () => {},
      resetPassword: async () => {},
      refreshUser: async () => {},
      logout: () => {},
    }
  );
}