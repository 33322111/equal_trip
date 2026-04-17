import React, { useMemo, useState } from "react";
import { YMaps, Map, Placemark } from "@pbe/react-yandex-maps";
import { Box, Button, Chip, Divider, Paper, Stack, Typography, useMediaQuery } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { Expense } from "../api/expenses";
import { API_BASE_URL } from "../config/runtime";
import { downloadReceipt } from "../api/exports";

interface Props {
  expenses: Expense[];
}

const DEFAULT_CENTER: [number, number] = [55.751244, 37.618423];

function toAbsUrl(url: string) {
  return url.startsWith("http") ? url : `${API_BASE_URL}${url}`;
}

function guessFilename(url: string, fallback: string) {
  try {
    const clean = url.split("?")[0];
    const last = clean.substring(clean.lastIndexOf("/") + 1);
    return last || fallback;
  } catch {
    return fallback;
  }
}

function formatExpenseDate(value: string | null) {
  if (!value) return "Дата не указана";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Дата не указана";
  return new Intl.DateTimeFormat("ru-RU", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function formatRubAmount(value: string) {
  const amount = Number(value);
  if (Number.isNaN(amount)) return value;
  return new Intl.NumberFormat("ru-RU", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
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

  const showRubChip =
    !!selectedExpense &&
    selectedExpense.currency.toUpperCase() !== "RUB" &&
    Number.isFinite(Number(selectedExpense.amount_rub));

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
          <Stack spacing={1.5}>
            <Box
              display="flex"
              flexDirection={{ xs: "column", sm: "row" }}
              justifyContent="space-between"
              gap={1.5}
              alignItems={{ xs: "flex-start", sm: "flex-start" }}
            >
              <Box>
                <Typography variant="h6">{selectedExpense.title}</Typography>
                <Typography color="text.secondary">{selectedExpense.category?.name ?? "Без категории"}</Typography>
              </Box>
              <Stack direction="column" spacing={1} alignItems={{ xs: "flex-start", sm: "flex-end" }}>
                <Chip
                  color="primary"
                  label={`${selectedExpense.amount} ${selectedExpense.currency}`}
                  sx={{ fontWeight: 600 }}
                />
                {showRubChip ? (
                  <Chip
                    variant="outlined"
                    color="secondary"
                    label={`≈ ${formatRubAmount(selectedExpense.amount_rub)} RUB`}
                    sx={{ fontWeight: 600 }}
                  />
                ) : null}
              </Stack>
            </Box>
            <Divider />
            <Typography>Автор: {selectedExpense.created_by.username}</Typography>
            <Typography>Время добавления: {formatExpenseDate(selectedExpense.created_at)}</Typography>
            <Typography>
              Координаты: {Number(selectedExpense.lat).toFixed(6)}, {Number(selectedExpense.lng).toFixed(6)}
            </Typography>
            <Typography>Чек: {selectedExpense.receipt ? "прикреплён" : "не прикреплён"}</Typography>
            {selectedExpense.receipt ? (
              <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
                <Button
                  variant="outlined"
                  component="a"
                  href={toAbsUrl(selectedExpense.receipt)}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Открыть чек
                </Button>
                <Button
                  variant="outlined"
                  onClick={() =>
                    downloadReceipt(
                      toAbsUrl(selectedExpense.receipt!),
                      guessFilename(toAbsUrl(selectedExpense.receipt!), `receipt_${selectedExpense.id}.jpg`)
                    )
                  }
                >
                  Скачать чек
                </Button>
              </Stack>
            ) : null}
          </Stack>
        </Paper>
      ) : null}
    </Paper>
  );
}
