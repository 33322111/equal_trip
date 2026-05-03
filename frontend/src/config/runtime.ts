const envApiBase = import.meta.env.VITE_API_BASE_URL as string | undefined;
const fallbackApiBase = import.meta.env.DEV
  ? `${window.location.protocol}//${window.location.hostname}:8000`
  : window.location.origin;

export const API_BASE_URL = (envApiBase && envApiBase.trim() ? envApiBase : fallbackApiBase).replace(/\/+$/, "");
export const API_PREFIX = `${API_BASE_URL}/api`;
