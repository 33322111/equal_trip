import { api } from "./http";

export type UserShort = { id: number; username: string; email: string; avatar: string | null };

export type Trip = {
  id: number;
  title: string;
  description: string;
  start_date: string | null;
  end_date: string | null;
  owner: UserShort;
  created_at: string;
};

export type TripMember = {
  id: number;
  user: UserShort;
  role: "OWNER" | "MEMBER";
  joined_at: string;
};

export type TripDetail = Trip & { members: TripMember[] };

export async function listTrips(): Promise<Trip[]> {
  const res = await api.get("/trips/");
  return res.data;
}

export async function createTrip(payload: {
  title: string;
  description?: string;
  start_date?: string | null;
  end_date?: string | null;
}): Promise<Trip> {
  const res = await api.post("/trips/", payload);
  return res.data;
}

export async function getTrip(id: number): Promise<TripDetail> {
  const res = await api.get(`/trips/${id}/`);
  return res.data;
}

export async function createInvite(tripId: number): Promise<{ token: string }> {
  const res = await api.post(`/trips/${tripId}/create_invite/`);
  return res.data;
}

export async function acceptInvite(token: string): Promise<{ trip_id: number }> {
  const res = await api.post(`/invites/accept/${token}/`);
  return res.data;
}

export async function updateTrip(
  id: number,
  payload: Partial<Pick<Trip, "title" | "description" | "start_date" | "end_date">>
): Promise<Trip> {
  const res = await api.patch(`/trips/${id}/`, payload);
  return res.data;
}

export async function removeTripMember(tripId: number, memberId: number): Promise<void> {
  await api.delete(`/trips/${tripId}/members/${memberId}/`);
}

export async function leaveTrip(tripId: number): Promise<{ detail: string }> {
  const res = await api.post(`/trips/${tripId}/leave/`);
  return res.data;
}

export async function addTripMember(tripId: number, userId: number): Promise<{ detail: string }> {
  const res = await api.post(`/trips/${tripId}/members/add/`, { user_id: userId });
  return res.data;
}