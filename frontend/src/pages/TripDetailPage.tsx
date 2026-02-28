import React, { useEffect, useMemo, useState } from "react";
import {
  Container,
  Typography,
  Paper,
  Box,
  Button,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  IconButton,
  Stack,
} from "@mui/material";

import EditIcon from "@mui/icons-material/Edit";

import { useParams } from "react-router-dom";

import { createInvite, getTrip, TripDetail, updateTrip } from "../api/trips";
import { useAuth } from "../context/AuthContext";

import {
  listCategories,
  listExpenses,
  getBalance,
  deleteExpenseReceipt,
  Category,
  Expense,
  BalanceResponse,
} from "../api/expenses";

import { getTripStats, TripStats } from "../api/stats";
import TripStatsView from "../components/TripStats";
import TripMap from "../components/TripMap";
import { downloadTripCsv, downloadTripPdf, downloadReceipt } from "../api/exports";

import ItinerarySection from "./trip/sections/ItinerarySection";
import ChecklistSection from "./trip/sections/ChecklistSection";
import ExpensesSection from "./trip/sections/ExpensesSection";
import BalanceSettlementsSection from "./trip/sections/BalanceSettlementsSection";

import { listSettlements, Settlement } from "../api/settlements";

import ReceiptDialog from "../components/ReceiptDialog";

const API_BASE_URL = "http://localhost:8000";
const toAbsUrl = (url: string) => (url.startsWith("http") ? url : `${API_BASE_URL}${url}`);

export default function TripDetailPage() {
  const { id } = useParams();
  const tripId = Number(id);

  const { user } = useAuth();

  const [trip, setTrip] = useState<TripDetail | null>(null);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);

  const [categories, setCategories] = useState<Category[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [balance, setBalance] = useState<BalanceResponse | null>(null);
  const [stats, setStats] = useState<TripStats | null>(null);

  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Receipt dialog state
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [receiptUrl, setReceiptUrl] = useState<string | null>(null);
  const [receiptTitle, setReceiptTitle] = useState<string>("");
  const [receiptExpenseId, setReceiptExpenseId] = useState<number | null>(null);

  // Edit dates dialog
  const [editDatesOpen, setEditDatesOpen] = useState(false);
  const [editStartDate, setEditStartDate] = useState<string | null>(null);
  const [editEndDate, setEditEndDate] = useState<string | null>(null);
  const [savingDates, setSavingDates] = useState(false);

  // Edit title dialog
  const [editTitleOpen, setEditTitleOpen] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [savingTitle, setSavingTitle] = useState(false);

  const isOwner = trip?.owner?.id === user?.id;

  const formatTripDates = (start: string | null, end: string | null) => {
    if (!start && !end) return null;

    const months = [
      "января",
      "февраля",
      "марта",
      "апреля",
      "мая",
      "июня",
      "июля",
      "августа",
      "сентября",
      "октября",
      "ноября",
      "декабря",
    ];

    const format = (dateStr: string) => {
      const d = new Date(dateStr);
      return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
    };

    if (start && end) {
      const s = new Date(start);
      const e = new Date(end);

      if (s.getFullYear() === e.getFullYear() && s.getMonth() === e.getMonth()) {
        return `${s.getDate()}–${e.getDate()} ${months[s.getMonth()]} ${s.getFullYear()}`;
      }

      return `${format(start)} – ${format(end)}`;
    }

    return start ? format(start) : format(end!);
  };

  const membersById = useMemo(() => {
    const map = new Map<number, { username: string; email: string }>();
    if (trip?.members) {
      for (const m of trip.members) {
        map.set(m.user.id, { username: m.user.username, email: m.user.email });
      }
    }
    return map;
  }, [trip]);

  const loadAll = async () => {
    setError(null);
    try {
      const [tripData, cats, exp, bal, st, pays] = await Promise.all([
        getTrip(tripId),
        listCategories(),
        listExpenses(tripId),
        getBalance(tripId),
        getTripStats(tripId),
        listSettlements(tripId),
      ]);
      setTrip(tripData);
      setCategories(cats);
      setExpenses(exp);
      setBalance(bal);
      setStats(st);
      setSettlements(pays);
    } catch (e) {
      setError("Не удалось загрузить данные поездки.");
    }
  };

  useEffect(() => {
    if (!Number.isFinite(tripId)) return;
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripId]);

  const onCreateInvite = async () => {
    try {
      setError(null);
      const { token } = await createInvite(tripId);
      const url = `${window.location.origin}/join/${token}`;
      setInviteUrl(url);
      await navigator.clipboard.writeText(url);
    } catch (e) {
      setError("Не удалось создать приглашение.");
    }
  };

  // Receipt
  const onOpenReceipt = (ex: Expense) => {
    if (!ex.receipt) return;
    setReceiptTitle(ex.title);
    setReceiptUrl(toAbsUrl(ex.receipt));
    setReceiptExpenseId(ex.id);
    setReceiptOpen(true);
  };

  const onCloseReceipt = () => {
    setReceiptOpen(false);
    setReceiptTitle("");
    setReceiptUrl(null);
    setReceiptExpenseId(null);
  };

  const onDeleteReceipt = async () => {
    if (!receiptExpenseId) return;

    const ok = window.confirm("Удалить чек у расхода?");
    if (!ok) return;

    try {
      setError(null);
      await deleteExpenseReceipt(tripId, receiptExpenseId);
      onCloseReceipt();
      await loadAll();
    } catch (e) {
      setError("Не удалось удалить чек.");
    }
  };

  const onDownloadCurrentReceipt = () => {
    if (!receiptUrl) return;
    downloadReceipt(receiptUrl, `receipt_${receiptExpenseId ?? "file"}.jpg`);
  };

  // Edit dates
  const openEditDates = () => {
    if (!trip) return;
    setEditStartDate(trip.start_date);
    setEditEndDate(trip.end_date);
    setEditDatesOpen(true);
  };

  const saveDates = async () => {
    if (!trip) return;

    if (editStartDate && editEndDate && editEndDate < editStartDate) {
      setError("Дата окончания не может быть раньше даты начала.");
      return;
    }

    setSavingDates(true);
    try {
      const updated = await updateTrip(tripId, {
        start_date: editStartDate,
        end_date: editEndDate,
      });

      setTrip((prev) =>
        prev
          ? {
              ...prev,
              start_date: updated.start_date,
              end_date: updated.end_date,
            }
          : prev
      );

      setEditDatesOpen(false);
    } catch {
      setError("Не удалось обновить даты поездки.");
    } finally {
      setSavingDates(false);
    }
  };

  // Edit title
  const openEditTitle = () => {
    if (!trip) return;
    setEditTitle(trip.title);
    setEditTitleOpen(true);
  };

  const saveTitle = async () => {
    const nextTitle = editTitle.trim();
    if (!nextTitle) {
      setError("Название поездки не может быть пустым.");
      return;
    }

    setSavingTitle(true);
    try {
      const updated = await updateTrip(tripId, { title: nextTitle });

      setTrip((prev) =>
        prev
          ? {
              ...prev,
              title: updated.title,
            }
          : prev
      );

      setEditTitleOpen(false);
    } catch {
      setError("Не удалось обновить название поездки.");
    } finally {
      setSavingTitle(false);
    }
  };

  if (!trip) return <div>Загрузка...</div>;

  return (
    <Container sx={{ mt: 4, mb: 6 }}>
      <Box display="flex" justifyContent="space-between" alignItems="flex-start" mb={2} gap={2}>
        <Box sx={{ minWidth: 0 }}>
          <Stack direction="row" spacing={1} alignItems="center" sx={{ minWidth: 0 }}>
            <Typography variant="h4" sx={{ wordBreak: "break-word" }}>
              {trip.title}
            </Typography>

            {isOwner ? (
              <IconButton size="small" onClick={openEditTitle} aria-label="edit-title">
                <EditIcon fontSize="small" />
              </IconButton>
            ) : null}
          </Stack>

          {formatTripDates(trip.start_date, trip.end_date) ? (
            <Typography variant="subtitle1" color="text.secondary">
              {formatTripDates(trip.start_date, trip.end_date)}
            </Typography>
          ) : null}
        </Box>

        {isOwner ? (
          <Button variant="outlined" size="small" onClick={openEditDates}>
            Редактировать даты
          </Button>
        ) : null}
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {/* УЧАСТНИКИ */}
      <Paper sx={{ p: 2, mb: 3 }}>
        <Typography variant="h6">Участники</Typography>
        {trip.members.map((m) => (
          <Box key={m.id} display="flex" justifyContent="space-between" py={0.5}>
            <Typography>
              {m.user.username} ({m.user.email})
            </Typography>
            <Typography color="text.secondary">{m.role}</Typography>
          </Box>
        ))}
      </Paper>

      {/* INVITE */}
      {isOwner && (
        <Paper sx={{ p: 2, mb: 3 }}>
          <Typography variant="h6" gutterBottom>
            Приглашение по ссылке
          </Typography>
          <Button variant="contained" onClick={onCreateInvite}>
            Сгенерировать ссылку (и скопировать)
          </Button>
          {inviteUrl && (
            <Typography sx={{ mt: 2 }} color="text.secondary">
              {inviteUrl}
            </Typography>
          )}
        </Paper>
      )}

      <ChecklistSection tripId={tripId} members={trip.members} onError={(msg) => setError(msg)} />
      <ItinerarySection tripId={tripId} members={trip.members} onError={(msg) => setError(msg)} />

      <ExpensesSection
        tripId={tripId}
        trip={trip}
        onError={(msg) => setError(msg)}
        onAfterChange={loadAll}
        onOpenReceipt={onOpenReceipt}
      />

      <Box mt={3}>
        <TripMap expenses={expenses} />
      </Box>

      <BalanceSettlementsSection
        tripId={tripId}
        userId={user?.id}
        isOwner={isOwner}
        members={trip.members}
        balance={balance}
        settlements={settlements}
        onAfterChange={loadAll}
        onError={(msg) => setError(msg)}
      />

      {stats && (
        <Box mt={3}>
          <TripStatsView stats={stats} />
        </Box>
      )}

      <Box mt={3} display="flex" gap={2} flexWrap="wrap">
        <Button variant="text" onClick={loadAll}>
          Обновить данные
        </Button>

        <Button variant="outlined" onClick={() => downloadTripCsv(tripId)}>
          Экспорт CSV
        </Button>

        <Button variant="outlined" onClick={() => downloadTripPdf(tripId)}>
          Экспорт PDF
        </Button>
      </Box>

      {/* Диалог редактирования названия */}
      <Dialog open={editTitleOpen} onClose={() => setEditTitleOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Изменить название поездки</DialogTitle>

        <DialogContent dividers>
          <TextField
            label="Название"
            fullWidth
            autoFocus
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
          />
        </DialogContent>

        <DialogActions>
          <Button onClick={() => setEditTitleOpen(false)}>Отмена</Button>
          <Button variant="contained" onClick={saveTitle} disabled={savingTitle}>
            Сохранить
          </Button>
        </DialogActions>
      </Dialog>

      {/* Диалог редактирования дат */}
      <Dialog open={editDatesOpen} onClose={() => setEditDatesOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Редактировать даты поездки</DialogTitle>

        <DialogContent dividers>
          <TextField
            label="Дата начала"
            type="date"
            fullWidth
            margin="normal"
            InputLabelProps={{ shrink: true }}
            value={editStartDate ?? ""}
            onChange={(e) => setEditStartDate(e.target.value || null)}
          />

          <TextField
            label="Дата окончания"
            type="date"
            fullWidth
            margin="normal"
            InputLabelProps={{ shrink: true }}
            value={editEndDate ?? ""}
            onChange={(e) => setEditEndDate(e.target.value || null)}
          />
        </DialogContent>

        <DialogActions>
          <Button onClick={() => setEditDatesOpen(false)}>Отмена</Button>
          <Button variant="contained" onClick={saveDates} disabled={savingDates}>
            Сохранить
          </Button>
        </DialogActions>
      </Dialog>

      {/* Диалог просмотра чека */}
      <ReceiptDialog
        open={receiptOpen}
        title={receiptTitle}
        url={receiptUrl}
        onClose={onCloseReceipt}
        onDownload={onDownloadCurrentReceipt}
        onDelete={onDeleteReceipt}
        canDownload={!!receiptUrl}
        canDelete={!!receiptUrl}
      />
    </Container>
  );
}