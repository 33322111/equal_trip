import { api } from "./http";

export type Currency = {
  code: string;
  name: string;
};

export async function listCurrencies(): Promise<Currency[]> {
  const res = await api.get("/currencies/");
  return res.data;
}