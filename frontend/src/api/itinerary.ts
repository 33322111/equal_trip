import { api } from "./http";

export type DayPlan = {
  id: number;
  date: string; // YYYY-MM-DD
  title?: string;
  items?: DayPlanItem[];
};

export type DayPlanItem = {
  id: number;
  title: string;
  time_from?: string | null;
  time_to?: string | null;
  description?: string;
  assignee?: { id: number; username: string; email: string } | null;
  is_done: boolean;
  lat?: string | null;
  lng?: string | null;
  comments?: { id: number; user: { id: number; username: string }; text: string; created_at: string }[];
};

export async function listDays(tripId: number): Promise<DayPlan[]> {
  const res = await api.get(`/trips/${tripId}/days/`);
  return res.data;
}

export async function createDay(tripId: number, date: string, title?: string): Promise<DayPlan> {
  const res = await api.post(`/trips/${tripId}/days/`, { date, title });
  return res.data;
}

export async function deleteDay(tripId: number, dayId: number) {
  await api.delete(`/trips/${tripId}/days/${dayId}/`);
}

export async function listDayItems(tripId: number, dayId: number): Promise<DayPlanItem[]> {
  const res = await api.get(`/trips/${tripId}/days/${dayId}/items/`);
  return res.data;
}

export async function createDayItem(
  tripId: number,
  dayId: number,
  data: {
    title: string;
    time_from?: string | null;
    time_to?: string | null;
    description?: string;
    assignee_id?: number | null;
    lat?: number | null;
    lng?: number | null;
  }
): Promise<DayPlanItem> {
  const res = await api.post(`/trips/${tripId}/days/${dayId}/items/`, data);
  return res.data;
}

export async function patchDayItem(
  tripId: number,
  dayId: number,
  itemId: number,
  data: Partial<{
    title: string;
    time_from: string | null;
    time_to: string | null;
    description: string;
    assignee_id: number | null;
    is_done: boolean;
  }>
): Promise<DayPlanItem> {
  const res = await api.patch(`/trips/${tripId}/days/${dayId}/items/${itemId}/`, data);
  return res.data;
}

export async function deleteDayItem(tripId: number, dayId: number, itemId: number) {
  await api.delete(`/trips/${tripId}/days/${dayId}/items/${itemId}/`);
}

export async function addDayItemComment(
  tripId: number,
  dayId: number,
  itemId: number,
  text: string
) {
  const res = await api.post(`/trips/${tripId}/days/${dayId}/items/${itemId}/comments/`, { text });
  return res.data;
}