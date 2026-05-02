import axios from 'axios';
import { API_PREFIX } from "../config/runtime";

export const api = axios.create({
  baseURL: API_PREFIX,
});

const refreshApi = axios.create({
  baseURL: API_PREFIX,
});

let refreshPromise: Promise<string> | null = null;

const resolveClientTimezone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
};

const isAuthRequestUrl = (url?: string) => {
  const requestUrl = url ?? '';
  return (
    requestUrl.includes('/auth/login/') ||
    requestUrl.includes('/auth/register/') ||
    requestUrl.includes('/auth/refresh/')
  );
};

const clearStoredTokens = () => {
  localStorage.removeItem('accessToken');
  localStorage.removeItem('refreshToken');
};

const refreshAccessToken = async (): Promise<string> => {
  const storedRefreshToken = localStorage.getItem('refreshToken');
  if (!storedRefreshToken) {
    clearStoredTokens();
    throw new Error('No refresh token');
  }

  if (!refreshPromise) {
    refreshPromise = refreshApi
      .post('/auth/refresh/', { refresh: storedRefreshToken })
      .then((res) => {
        const nextAccess = res.data?.access as string | undefined;
        const nextRefresh = res.data?.refresh as string | undefined;

        if (!nextAccess) {
          clearStoredTokens();
          throw new Error('No access token in refresh response');
        }

        localStorage.setItem('accessToken', nextAccess);
        if (nextRefresh) {
          localStorage.setItem('refreshToken', nextRefresh);
        }

        return nextAccess;
      })
      .catch((error) => {
        clearStoredTokens();
        throw error;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }

  return refreshPromise;
};

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('accessToken');
  if (token && config.headers) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  if (config.headers && !isAuthRequestUrl(config.url)) {
    config.headers['X-Client-Timezone'] = resolveClientTimezone();
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error?.config as
      | (typeof error.config & { _retry?: boolean; url?: string; headers?: any })
      | undefined;
    const status = error?.response?.status as number | undefined;

    if (!originalRequest || status !== 401 || originalRequest._retry) {
      return Promise.reject(error);
    }

    const isAuthEndpoint = isAuthRequestUrl(originalRequest.url);

    if (isAuthEndpoint) {
      return Promise.reject(error);
    }

    if (!localStorage.getItem('refreshToken')) {
      clearStoredTokens();
      return Promise.reject(error);
    }

    originalRequest._retry = true;

    try {
      const nextAccess = await refreshAccessToken();

      if (originalRequest.headers && typeof originalRequest.headers.set === 'function') {
        originalRequest.headers.set('Authorization', `Bearer ${nextAccess}`);
      } else {
        originalRequest.headers = {
          ...(originalRequest.headers ?? {}),
          Authorization: `Bearer ${nextAccess}`,
        };
      }

      return api(originalRequest);
    } catch (refreshError) {
      return Promise.reject(refreshError);
    }
  }
);
