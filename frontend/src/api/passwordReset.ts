import { api } from "./http";

export async function requestPasswordReset(email: string) {
  // django-rest-passwordreset ожидает { email: "" }
  const res = await api.post("/password_reset/", { email });
  return res.data;
}

export async function confirmPasswordReset(token: string, password: string) {
  // confirm endpoint ожидает { token, password }
  const res = await api.post("/password_reset/confirm/", { token, password });
  return res.data;
}