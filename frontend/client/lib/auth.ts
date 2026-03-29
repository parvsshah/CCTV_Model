const TOKEN_KEY = "yc-auth-token";
const REFRESH_KEY = "yc-auth-refresh";
const USER_KEY = "yc-auth-user";
const TOKEN_EXPIRY_BUFFER = 5 * 60 * 1000; // 5 minutes in milliseconds

const safeStorage = typeof window !== "undefined" ? window.localStorage : undefined;

interface TokenPayload {
  exp: number;
  iat: number;
  sub: string;
  email: string;
  role?: string;
  [key: string]: any;
}

function decodeToken(token: string): TokenPayload | null {
  try {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    return JSON.parse(jsonPayload);
  } catch (error) {
    console.error('Failed to decode token:', error);
    return null;
  }
}

export const authStorage = {
  getToken(): string | null {
    return safeStorage?.getItem(TOKEN_KEY) ?? null;
  },

  getRefreshToken(): string | null {
    return safeStorage?.getItem(REFRESH_KEY) ?? null;
  },

  getUser(): any | null {
    const user = safeStorage?.getItem(USER_KEY);
    return user ? JSON.parse(user) : null;
  },

  save(token: string, refreshToken?: string, user?: any): void {
    if (!token) return;
    
    safeStorage?.setItem(TOKEN_KEY, token);
    
    if (refreshToken) {
      safeStorage?.setItem(REFRESH_KEY, refreshToken);
    }
    
    if (user) {
      safeStorage?.setItem(USER_KEY, JSON.stringify(user));
    } else {
      // Try to extract user info from token if not provided
      const payload = decodeToken(token);
      if (payload) {
        const { exp, iat, ...userData } = payload;
        safeStorage?.setItem(USER_KEY, JSON.stringify(userData));
      }
    }
  },

  clear(): void {
    safeStorage?.removeItem(TOKEN_KEY);
    safeStorage?.removeItem(REFRESH_KEY);
    safeStorage?.removeItem(USER_KEY);
  },

  isAuthenticated(): boolean {
    const token = this.getToken();
    if (!token) return false;
    
    const payload = decodeToken(token);
    if (!payload) return false;
    
    // Check if token is expired (with buffer)
    const currentTime = Date.now() / 1000;
    return payload.exp > currentTime - TOKEN_EXPIRY_BUFFER / 1000;
  },

  getTokenExpiration(): Date | null {
    const token = this.getToken();
    if (!token) return null;
    
    const payload = decodeToken(token);
    return payload ? new Date(payload.exp * 1000) : null;
  },

  getTokenExpiresIn(): number | null {
    const token = this.getToken();
    if (!token) return null;
    
    const payload = decodeToken(token);
    if (!payload) return null;
    
    const currentTime = Date.now() / 1000;
    return Math.max(0, payload.exp - currentTime);
  },

  async refreshToken(): Promise<{ token: string; refreshToken: string } | null> {
    const refreshToken = this.getRefreshToken();
    if (!refreshToken) {
      this.clear();
      return null;
    }

    try {
      const response = await fetch('/api/auth/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });

      if (!response.ok) {
        throw new Error('Token refresh failed');
      }

      const data = await response.json();
      this.save(data.token, data.refreshToken, data.user);
      return data;
    } catch (error) {
      console.error('Failed to refresh token:', error);
      this.clear();
      return null;
    }
  },
};

/**
 * Returns auth headers for raw fetch() calls.
 * Usage: fetch(url, { headers: authHeaders() })
 */
export function authHeaders(): Record<string, string> {
  const token = authStorage.getToken();
  if (token) {
    return { Authorization: `Bearer ${token}` };
  }
  return {};
}
