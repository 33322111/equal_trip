import { api } from './http.js';

export interface LoginPayload {
  username: string;
  password: string;
}

export interface RegisterPayload {
  username: string;
  email: string;
  password: string;
}

export interface User {
  id: number;
  username: string;
  email: string;
}

export async function login(payload: LoginPayload) {
  const res = await api.post('/auth/login/', payload);
  return res.data; // { access, refresh }
}

export async function register(payload: RegisterPayload) {
  const res = await api.post('/auth/register/', payload);
  return res.data; // созданный пользователь
}

export async function getMe(): Promise<User> {
  const res = await api.get('/auth/me/');
  return res.data;
}