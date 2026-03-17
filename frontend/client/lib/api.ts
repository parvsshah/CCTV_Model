import {
  AuthLoginRequest,
  AuthLoginResponse,
  AuthMeResponse,
  DashboardStatsResponse,
  DetectionJobListResponse,
  DetectionPredictionResponse,
  DetectionStartResponse,
} from "@shared/api";
import { authStorage } from "./auth";

const API_BASE_URL = import.meta.env.VITE_API_URL 
  ? `${import.meta.env.VITE_API_URL}/api` 
  : (import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, "") || "/api");

async function request<TResponse>(
  path: string, 
  init?: RequestInit & { 
    skipAuth?: boolean;
    skipErrorHandling?: boolean;
  }
): Promise<TResponse> {
  const makeRequest = async (retry = true): Promise<Response> => {
    const headers = new Headers(init?.headers);
    headers.set("Accept", "application/json");

    const isFormData = typeof FormData !== "undefined" && init?.body instanceof FormData;

    if (init?.body && !headers.has("Content-Type") && !isFormData) {
      headers.set("Content-Type", "application/json");
    }

    if (!init?.skipAuth) {
      const token = authStorage.getToken();
      if (token) {
        headers.set("Authorization", `Bearer ${token}`);
      }
    }

    const response = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers,
      credentials: 'include',
    });

    // Handle 401 Unauthorized (token expired)
    if (response.status === 401 && retry) {
      const refreshToken = authStorage.getRefreshToken();
      if (refreshToken) {
        try {
          // Try to refresh the token
          const refreshResponse = await fetch(`${API_BASE_URL}/auth/refresh`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ refreshToken }),
          });

          if (refreshResponse.ok) {
            const { token: newToken, refreshToken: newRefreshToken } = await refreshResponse.json();
            authStorage.save(newToken, newRefreshToken);
            
            // Retry the original request with the new token
            headers.set("Authorization", `Bearer ${newToken}`);
            return fetch(`${API_BASE_URL}${path}`, {
              ...init,
              headers,
              credentials: 'include',
            });
          }
        } catch (error) {
          console.error('Token refresh failed:', error);
        }
      }
      
      // If we get here, token refresh failed or no refresh token
      authStorage.clear();
      if (typeof window !== 'undefined') {
        window.location.href = '/login';
      }
      throw new Error('Session expired. Please log in again.');
    }

    return response;
  };

  try {
    const response = await makeRequest();

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "");
      const error = new Error(errorBody || response.statusText);
      (error as any).status = response.status;
      
      if (!init?.skipErrorHandling) {
        // Handle common error statuses
        if (response.status === 403) {
          console.error('Forbidden:', error);
        } else if (response.status >= 500) {
          console.error('Server error:', error);
        }
      }
      
      throw error;
    }

    if (response.status === 204) {
      return undefined as TResponse;
    }

    return (await response.json()) as TResponse;
  } catch (error) {
    if (!init?.skipErrorHandling) {
      // Global error handling can be added here (e.g., show toast notification)
      console.error('API request failed:', error);
    }
    throw error;
  }
}

export const apiClient = {
  auth: {
    login: (payload: AuthLoginRequest) =>
      request<AuthLoginResponse>("/auth/login", {
        method: "POST",
        body: JSON.stringify(payload),
        skipAuth: true,
      }),
    me: () => request<AuthMeResponse>("/auth/me"),
    logout: () =>
      request<void>("/auth/logout", {
        method: "POST",
      }),
  },
  dashboard: {
    stats: () => request<DashboardStatsResponse>("/dashboard/stats"),
  },
  detection: {
    start: (data: FormData) =>
      request<DetectionStartResponse>("/detection/start", {
        method: "POST",
        body: data,
      }),
    job: (id: string) => request<DetectionStartResponse>(`/detection/jobs/${id}`),
    list: () => request<DetectionJobListResponse>("/detection/jobs"),
    predict: (id: string, futureSteps: number) =>
      request<DetectionPredictionResponse>(`/detection/jobs/${id}/predict`, {
        method: "POST",
        body: JSON.stringify({ future: futureSteps }),
      }),
  },
};

