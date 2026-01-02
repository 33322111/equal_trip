import { api } from "./http";

export type Profile = {
  id: number;
  username: string;
  email: string;
  avatar: string | null;
};

export async function getProfile(): Promise<Profile> {
  const res = await api.get("/profile/");
  return res.data;
}

export async function updateProfile(data: FormData): Promise<Profile> {
  const res = await api.patch("/profile/", data, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return res.data;
}