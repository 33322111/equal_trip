import { api } from "./http";

export type Checklist = {
  id: number;
  title: string;
  created_at: string;
  items?: ChecklistItem[];
};

export type ChecklistItem = {
  id: number;
  checklist: number;
  title: string;
  assignee: { id: number; username: string; email: string } | null;
  due_date: string | null;
  is_done: boolean;
  updated_at: string;
  comments?: { id: number; user: { id: number; username: string }; text: string; created_at: string }[];
};

export async function listChecklists(tripId: number): Promise<Checklist[]> {
  const res = await api.get(`/trips/${tripId}/checklists/`);
  return res.data;
}

export async function createChecklist(tripId: number, title: string): Promise<Checklist> {
  const res = await api.post(`/trips/${tripId}/checklists/`, { title });
  return res.data;
}

export async function deleteChecklist(tripId: number, checklistId: number) {
  await api.delete(`/trips/${tripId}/checklists/${checklistId}/`);
}

export async function listChecklistItems(tripId: number, checklistId: number): Promise<ChecklistItem[]> {
  const res = await api.get(`/trips/${tripId}/checklists/${checklistId}/items/`);
  return res.data;
}

export async function createChecklistItem(
  tripId: number,
  checklistId: number,
  data: { title: string; assignee_id?: number | null; due_date?: string | null }
): Promise<ChecklistItem> {
  const res = await api.post(`/trips/${tripId}/checklists/${checklistId}/items/`, data);
  return res.data;
}

export async function patchChecklistItem(
  tripId: number,
  checklistId: number,
  itemId: number,
  data: Partial<{ title: string; assignee_id: number | null; due_date: string | null; is_done: boolean }>
): Promise<ChecklistItem> {
  const res = await api.patch(`/trips/${tripId}/checklists/${checklistId}/items/${itemId}/`, data);
  return res.data;
}

export async function deleteChecklistItem(tripId: number, checklistId: number, itemId: number) {
  await api.delete(`/trips/${tripId}/checklists/${checklistId}/items/${itemId}/`);
}

export async function addChecklistComment(tripId: number, checklistId: number, itemId: number, text: string) {
  const res = await api.post(`/trips/${tripId}/checklists/${checklistId}/items/${itemId}/comments/`, { text });
  return res.data;
}