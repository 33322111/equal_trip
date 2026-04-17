import React, { useMemo, useState } from "react";
import { YMaps, Map, Placemark } from "@pbe/react-yandex-maps";
import { Paper, Typography, useMediaQuery } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { Expense } from "../api/expenses";
import ExpenseDetailsPanel from "./ExpenseDetailsPanel";

interface Props {
  expenses: Expense[];
}

const DEFAULT_CENTER: [number, number] = [55.751244, 37.618423];

function formatExpenseDate(value: string | null) {
  if (!value) return "Дата не указана";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Дата не указана";
  return new Intl.DateTimeFormat("ru-RU", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export default function TripMap({ expenses }: Props) {
  const points = useMemo(() => expenses.filter((e) => e.lat && e.lng), [expenses]);
  const [selectedExpenseId, setSelectedExpenseId] = useState<number | null>(points[0]?.id ?? null);
  const selectedExpense = points.find((expense) => expense.id === selectedExpenseId) ?? points[0] ?? null;
  const theme = useTheme();
  const isXs = useMediaQuery(theme.breakpoints.down("sm"));
  const isSm = useMediaQuery(theme.breakpoints.between("sm", "md"));
  const mapHeight = isXs ? 260 : isSm ? 320 : 400;

  const center: [number, number] =
    points.length > 0
      ? [Number(points[0].lat), Number(points[0].lng)]
      : DEFAULT_CENTER;

  return (
    <Paper sx={{ p: 2 }}>
      <Typography variant="h6" gutterBottom>
        Карта поездки
      </Typography>

      {!points.length ? <Typography color="text.secondary">Расходы с координатами пока не добавлены.</Typography> : null}

      <YMaps query={{ apikey: import.meta.env.VITE_YMAPS_API_KEY }}>
        <Map defaultState={{ center, zoom: 10 }} width="100%" height={mapHeight}>
          {points.map((e) => (
            <Placemark
              key={e.id}
              geometry={[Number(e.lat), Number(e.lng)]}
              properties={{
                balloonContent: `
                  <b>${e.title}</b><br/>
                  ${e.amount} ${e.currency}<br/>
                  ${e.category?.name ?? "Без категории"}<br/>
                  ${e.created_by.username}<br/>
                  ${formatExpenseDate(e.created_at)}
                `,
              }}
              options={{
                preset: selectedExpense?.id === e.id ? "islands#redIcon" : "islands#blueIcon",
              }}
              onClick={() => setSelectedExpenseId(e.id)}
            />
          ))}
        </Map>
      </YMaps>

      {selectedExpense ? (
        <Paper
          variant="outlined"
          sx={{
            mt: 2,
            p: 2,
            borderRadius: 2,
            background: "linear-gradient(180deg, rgba(248,250,252,1) 0%, rgba(255,255,255,1) 100%)",
          }}
        >
          <ExpenseDetailsPanel expense={selectedExpense} />
        </Paper>
      ) : null}
    </Paper>
  );
}
