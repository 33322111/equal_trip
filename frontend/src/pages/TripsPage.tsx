import React, { useEffect, useMemo, useState } from "react";
import {
  Container,
  Typography,
  Button,
  Box,
  TextField,
  Paper,
  Alert,
  Stack,
  MenuItem,
} from "@mui/material";
import { Link } from "react-router-dom";
import { listTrips, createTrip, Trip } from "../api/trips";

type SortOrder = "asc" | "desc";

export default function TripsPage() {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [title, setTitle] = useState("");
  const [startDate, setStartDate] = useState<string>(""); // yyyy-mm-dd
  const [endDate, setEndDate] = useState<string>(""); // yyyy-mm-dd
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // сортировки по группам
  const [sortCurrent, setSortCurrent] = useState<SortOrder>("asc");
  const [sortUpcoming, setSortUpcoming] = useState<SortOrder>("asc");
  const [sortPast, setSortPast] = useState<SortOrder>("desc");

  const load = async () => {
    const data = await listTrips();
    setTrips(data);
  };

  useEffect(() => {
    load();
  }, []);

  const onCreate = async () => {
    setError(null);

    if (!title.trim()) {
      setError("Введите название поездки.");
      return;
    }
    if (!startDate) {
      setError("Выберите дату начала.");
      return;
    }
    if (!endDate) {
      setError("Выберите дату окончания.");
      return;
    }
    if (endDate < startDate) {
      setError("Дата окончания не может быть раньше даты начала.");
      return;
    }

    setIsCreating(true);
    try {
      await createTrip({
        title: title.trim(),
        start_date: startDate,
        end_date: endDate,
      });

      setTitle("");
      setStartDate("");
      setEndDate("");
      await load();
    } catch (e: any) {
      const msg =
        e?.response?.data?.detail ||
        e?.response?.data?.start_date?.[0] ||
        e?.response?.data?.end_date?.[0] ||
        "Не удалось создать поездку.";
      setError(String(msg));
    } finally {
      setIsCreating(false);
    }
  };

  // Формат дат по-русски
  const fmt = useMemo(
    () =>
      new Intl.DateTimeFormat("ru-RU", {
        day: "numeric",
        month: "long",
        year: "numeric",
      }),
    []
  );

  const parseIsoDate = (iso: string | null) => {
    if (!iso) return null;
    const d = new Date(`${iso}T00:00:00`);
    return Number.isNaN(d.getTime()) ? null : d;
  };

  const formatDateRu = (isoDate: string) => {
    const d = new Date(`${isoDate}T00:00:00`);
    if (Number.isNaN(d.getTime())) return isoDate;
    return fmt.format(d);
  };

  const formatRange = (t: Trip) => {
    if (!t.start_date && !t.end_date) return null;
    if (t.start_date && t.end_date) {
      return `${formatDateRu(t.start_date)} — ${formatDateRu(t.end_date)}`;
    }
    return formatDateRu(t.start_date ?? t.end_date!);
  };

  // Группировка + сортировка
  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const getSortKey = (t: Trip) => {
    // сортируем по start_date, если нет — по end_date
    const s = parseIsoDate(t.start_date);
    const e = parseIsoDate(t.end_date);
    return (s ?? e ?? new Date(0)).getTime();
  };

  const sortTrips = (arr: Trip[], order: SortOrder) => {
    const mul = order === "asc" ? 1 : -1;
    return [...arr].sort((a, b) => (getSortKey(a) - getSortKey(b)) * mul);
  };

  const groups = useMemo(() => {
    const current: Trip[] = [];
    const upcoming: Trip[] = [];
    const past: Trip[] = [];

    for (const t of trips) {
      const s = parseIsoDate(t.start_date);
      const e = parseIsoDate(t.end_date);

      if (!s && !e) {
        upcoming.push(t);
        continue;
      }

      const start = s ?? e!;
      const end = e ?? s!;

      if (end < today) past.push(t);
      else if (start > today) upcoming.push(t);
      else current.push(t); // пересечение с today
    }

    return {
      current,
      upcoming,
      past,
    };
  }, [trips, today]);

  const currentTrips = useMemo(() => sortTrips(groups.current, sortCurrent), [groups.current, sortCurrent]);
  const upcomingTrips = useMemo(() => sortTrips(groups.upcoming, sortUpcoming), [groups.upcoming, sortUpcoming]);
  const pastTrips = useMemo(() => sortTrips(groups.past, sortPast), [groups.past, sortPast]);

  const Section = ({
    title,
    trips,
    sortOrder,
    onChangeSort,
  }: {
    title: string;
    trips: Trip[];
    sortOrder: SortOrder;
    onChangeSort: (v: SortOrder) => void;
  }) => {
    if (trips.length === 0) return null;

    return (
      <Paper sx={{ p: 2, mb: 2 }}>
        <Stack
          direction={{ xs: "column", sm: "row" }}
          alignItems={{ xs: "stretch", sm: "center" }}
          justifyContent="space-between"
          gap={2}
          sx={{ mb: 1 }}
        >
          <Typography variant="h6">{title}</Typography>

          <TextField
            select
            size="small"
            label="Сортировка"
            value={sortOrder}
            onChange={(e) => onChangeSort(e.target.value as SortOrder)}
            sx={{ minWidth: 220 }}
          >
            <MenuItem value="asc">От старых к новым</MenuItem>
            <MenuItem value="desc">От новых к старым</MenuItem>
          </TextField>
        </Stack>

        <Box display="flex" flexDirection="column" gap={1}>
          {trips.map((t) => (
            <Paper key={t.id} variant="outlined" sx={{ p: 2 }}>
              <Typography variant="h6" sx={{ mb: 0.5 }}>
                <Link to={`/trips/${t.id}`}>{t.title}</Link>
              </Typography>

              {formatRange(t) ? (
                <Typography variant="body2" color="text.secondary">
                  Даты: {formatRange(t)}
                </Typography>
              ) : null}

              <Typography variant="body2" color="text.secondary">
                Owner: {t.owner.username}
              </Typography>
            </Paper>
          ))}
        </Box>
      </Paper>
    );
  };

  return (
    <Container sx={{ mt: 4 }}>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography variant="h4">Мои поездки</Typography>
      </Box>

      <Paper sx={{ p: 2, mb: 3 }}>
        <Typography variant="h6" gutterBottom>
          Создать поездку
        </Typography>

        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        <Box display="flex" gap={2} flexWrap="wrap">
          <TextField
            label="Название"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            fullWidth
          />

          <TextField
            label="Дата начала"
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            InputLabelProps={{ shrink: true }}
            sx={{ minWidth: 200 }}
          />

          <TextField
            label="Дата окончания"
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            InputLabelProps={{ shrink: true }}
            sx={{ minWidth: 200 }}
          />

          <Button variant="contained" onClick={onCreate} disabled={isCreating}>
            Создать
          </Button>
        </Box>
      </Paper>

      <Section
        title="Текущие поездки"
        trips={currentTrips}
        sortOrder={sortCurrent}
        onChangeSort={setSortCurrent}
      />

      <Section
        title="Предстоящие поездки"
        trips={upcomingTrips}
        sortOrder={sortUpcoming}
        onChangeSort={setSortUpcoming}
      />

      <Section
        title="Завершенные поездки"
        trips={pastTrips}
        sortOrder={sortPast}
        onChangeSort={setSortPast}
      />

      {trips.length === 0 && (
        <Typography color="text.secondary">Пока нет поездок. Создай первую</Typography>
      )}
    </Container>
  );
}