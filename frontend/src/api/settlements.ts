import { api } from "./http";

export type Settlement = {
  id: number;
  trip: number;
  from_user: number;
  to_user: number;
  amount: string;
  currency: string;
  status: "pending" | "confirmed";
  proof: string | null;
  created_at: string;
  confirmed_at: string | null;
};

export async function listSettlements(tripId: number): Promise<Settlement[]> {
  const res = await api.get(`/trips/${tripId}/settlements/`);
  return res.data;
}

export async function createSettlement(tripId: number, data: FormData): Promise<Settlement> {
  const res = await api.post(`/trips/${tripId}/settlements/`, data);
  return res.data;
}

export async function confirmSettlement(tripId: number, settlementId: number, data?: FormData): Promise<Settlement> {
  const res = await api.post(`/trips/${tripId}/settlements/${settlementId}/confirm/`, data ?? undefined);
  return res.data;
}

export async function deleteSettlement(tripId: number, settlementId: number) {
  await api.delete(`/trips/${tripId}/settlements/${settlementId}/`);
}