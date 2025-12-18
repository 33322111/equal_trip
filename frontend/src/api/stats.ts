import { api } from "./http";

export type TripStats = {
  total: string;
  by_category: { category: string; amount: string }[];
  by_user: { user_id: number; username: string; amount: string }[];
};

export async function getTripStats(tripId: number): Promise<TripStats> {
  const res = await api.get(`/trips/${tripId}/stats/`);
  return res.data;
}