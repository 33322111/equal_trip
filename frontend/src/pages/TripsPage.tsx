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
  Collapse,
} from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import { Link } from "react-router-dom";
import { listTrips, createTrip, Trip } from "../api/trips";

type SortOrder = "asc" | "desc";
type TripsSectionKey = "create" | "current" | "upcoming" | "past";

function PageSection({
  title,
  collapsed,
  onToggle,
  children,
}: {
  title: string;
  collapsed: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <Paper
      sx={{
        mb: 3,
        px: { xs: 1.5, md: 2 },
        py: 1.5,
        borderRadius: 3,
        border: "1px solid #dbe3ea",
        backgroundColor: "#f8fafc",
        boxShadow: "0 14px 34px rgba(15, 23, 42, 0.06)",
      }}
    >
      <Box display="flex" justifyContent="space-between" alignItems="center" gap={2}>
        <Typography variant="h6">{title}</Typography>
        <Button
          variant="text"
          size="small"
          onClick={onToggle}
          endIcon={collapsed ? <ExpandMoreIcon /> : <ExpandLessIcon />}
          sx={{ color: "#475569", minWidth: 0 }}
        >
          {collapsed ? "Развернуть" : "Свернуть"}
        </Button>
      </Box>

      <Collapse in={!collapsed}>
        <Box
          sx={{
            pt: 2,
            "& > .MuiPaper-root": {
              borderRadius: 3,
              border: "1px solid #e2e8f0",
              boxShadow: "0 10px 24px rgba(15, 23, 42, 0.05)",
            },
          }}
        >
          {children}
        </Box>
      </Collapse>
    </Paper>
  );
}

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
  const [collapsedSections, setCollapsedSections] = useState<Record<TripsSectionKey, boolean>>({
    create: false,
    current: false,
    upcoming: false,
    past: false,
  });

  const load = async () => {
    const data = await listTrips();
    setTrips(data);
  };

  useEffect(() => {
    load();
  }, []);

  const toggleSection = (key: TripsSectionKey) => {
    setCollapsedSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

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
    collapsed,
    onToggle,
  }: {
    title: string;
    trips: Trip[];
    sortOrder: SortOrder;
    onChangeSort: (v: SortOrder) => void;
    collapsed: boolean;
    onToggle: () => void;
  }) => {
    if (trips.length === 0) return null;

    return (
      <PageSection title={title} collapsed={collapsed} onToggle={onToggle}>
        <Stack
          direction={{ xs: "column", sm: "row" }}
          alignItems={{ xs: "stretch", sm: "center" }}
          justifyContent="space-between"
          gap={2}
          sx={{ mb: 1 }}
        >
          <Typography variant="subtitle1" sx={{ color: "#475569" }}>
            Всего поездок: {trips.length}
          </Typography>

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

        <Box display="flex" flexDirection="column" gap={1.25}>
          {trips.map((t) => (
            <Paper key={t.id} variant="outlined" sx={{ p: 2.25, backgroundColor: "#ffffff" }}>
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
      </PageSection>
    );
  };

  return (
    <Box sx={{ minHeight: "100vh", backgroundColor: "#edf1f5", py: { xs: 3, md: 5 } }}>
      <Container>
        <Paper
          sx={{
            p: { xs: 2, md: 3 },
            mb: 3,
            borderRadius: 4,
            border: "1px solid #d6dee6",
            background: "linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)",
            boxShadow: "0 18px 40px rgba(15, 23, 42, 0.08)",
          }}
        >
          <Box display="flex" justifyContent="space-between" alignItems="center" mb={0.5}>
            <Typography variant="h4" sx={{ color: "#0f172a" }}>
              Мои поездки
            </Typography>
          </Box>
          <Typography color="text.secondary">
            Управляй поездками, следи за активными планами и быстро возвращайся к завершённым маршрутам.
          </Typography>
        </Paper>

        <PageSection
          title="Создать поездку"
          collapsed={collapsedSections.create}
          onToggle={() => toggleSection("create")}
        >
          {error && (
            <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }}>
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
        </PageSection>

        <Section
          title="Текущие поездки"
          trips={currentTrips}
          sortOrder={sortCurrent}
          onChangeSort={setSortCurrent}
          collapsed={collapsedSections.current}
          onToggle={() => toggleSection("current")}
        />

        <Section
          title="Предстоящие поездки"
          trips={upcomingTrips}
          sortOrder={sortUpcoming}
          onChangeSort={setSortUpcoming}
          collapsed={collapsedSections.upcoming}
          onToggle={() => toggleSection("upcoming")}
        />

        <Section
          title="Завершенные поездки"
          trips={pastTrips}
          sortOrder={sortPast}
          onChangeSort={setSortPast}
          collapsed={collapsedSections.past}
          onToggle={() => toggleSection("past")}
        />

        {trips.length === 0 && (
          <Paper
            sx={{
              p: 3,
              borderRadius: 3,
              border: "1px dashed #cbd5e1",
              backgroundColor: "#f8fafc",
            }}
          >
            <Typography color="text.secondary">Пока нет поездок. Создай первую</Typography>
          </Paper>
        )}
      </Container>
    </Box>
  );
}
