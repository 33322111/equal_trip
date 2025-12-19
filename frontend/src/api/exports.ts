import { api } from "./http";

export async function downloadTripCsv(tripId: number) {
  const res = await api.get(`/trips/${tripId}/export/csv/`, {
    responseType: "blob",
  });

  // Имя файла: пробуем взять из Content-Disposition, иначе дефолт
  const cd = res.headers["content-disposition"] as string | undefined;
  let filename = `trip_${tripId}_expenses.csv`;
  if (cd) {
    const match = cd.match(/filename="?([^"]+)"?/);
    if (match?.[1]) filename = match[1];
  }

  const url = window.URL.createObjectURL(res.data);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
}