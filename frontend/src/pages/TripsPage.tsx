import React, { useEffect, useState } from "react";
import { Container, Typography, Button, Box, TextField, Paper, Alert } from "@mui/material";
import { Link } from "react-router-dom";
import { listTrips, createTrip, Trip } from "../api/trips";

export default function TripsPage() {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [title, setTitle] = useState("");
  const [startDate, setStartDate] = useState<string>(""); // yyyy-mm-dd
  const [endDate, setEndDate] = useState<string>(""); // yyyy-mm-dd
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  const fmt = new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const formatDateRu = (isoDate: string) => {
    // isoDate = "YYYY-MM-DD"
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

      <Box display="flex" flexDirection="column" gap={1}>
        {trips.map((t) => (
          <Paper key={t.id} sx={{ p: 2 }}>
            <Typography variant="h6">
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

        {trips.length === 0 && (
          <Typography color="text.secondary">Пока нет поездок. Создай первую</Typography>
        )}
      </Box>
    </Container>
  );
}