const envApiBase = import.meta.env.VITE_API_BASE_URL as string | undefined;
const fallbackApiBase = `${window.location.protocol}//${window.location.hostname}:8000`;

export const API_BASE_URL = (envApiBase && envApiBase.trim() ? envApiBase : fallbackApiBase).replace(/\/+$/, "");
export const API_PREFIX = `${API_BASE_URL}/api`;
