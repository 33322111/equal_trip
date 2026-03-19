import { api } from "./http";

export type UserSearchItem = {
  id: number;
  username: string;
  email: string;
  avatar: string | null;
};

export async function searchUsers(q: string): Promise<UserSearchItem[]> {
  const res = await api.get("/users/search/", { params: { q } });
  return res.data;
}