import { api } from "./http";

export type Category = { id: number; name: string };

export type Expense = {
  id: number;
  title: string;
  amount: string;
  currency: string;
  spent_at: string | null;
  created_at: string;
  created_by: { id: number; username: string; email: string };
  category: Category | null;
  shares: { id: number; user: { id: number; username: string; email: string }; weight: string }[];
};

export type BalanceResponse = {
  paid: Record<string, string>;
  owed: Record<string, string>;
  net: Record<string, string>;
  transfers: { from_user: number; to_user: number; amount: string }[];
};

export async function listCategories(): Promise<Category[]> {
  const res = await api.get("/categories/");
  return res.data;
}

export async function listExpenses(tripId: number): Promise<Expense[]> {
  const res = await api.get(`/trips/${tripId}/expenses/`);
  return res.data;
}

export async function createExpense(
  tripId: number,
  payload: {
    title: string;
    amount: number | string;
    currency?: string;
    spent_at?: string | null;
    category_id?: number | null;
    lat: number,
    lng: number,
  }
): Promise<Expense> {
  const res = await api.post(`/trips/${tripId}/expenses/`, payload);
  return res.data;
}

export async function getBalance(tripId: number): Promise<BalanceResponse> {
  const res = await api.get(`/trips/${tripId}/balance/`);
  return res.data;
}