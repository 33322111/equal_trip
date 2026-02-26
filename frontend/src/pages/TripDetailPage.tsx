import React, { useEffect, useState } from "react";
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
} from "@mui/material";

import DeleteForeverIcon from "@mui/icons-material/DeleteForever";

import { useParams } from "react-router-dom";

import { createInvite, getTrip, TripDetail } from "../api/trips";
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
import ExpenseEditDialog from "../components/ExpenseEditDialog";
import ItinerarySection from "./trip/sections/ItinerarySection";
import ChecklistSection from "./trip/sections/ChecklistSection";
import ExpensesSection from "./trip/sections/ExpensesSection";
import BalanceSettlementsSection from "./trip/sections/BalanceSettlementsSection";

import {
  listSettlements,
  Settlement,
} from "../api/settlements";

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

  // Settlements
  const [settlements, setSettlements] = useState<Settlement[]>([]);

  const [error, setError] = useState<string | null>(null);

  // Edit dialog
  const [editOpen, setEditOpen] = useState(false);
  const [selectedExpense, setSelectedExpense] = useState<Expense | null>(null);

  // Receipt dialog
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [receiptUrl, setReceiptUrl] = useState<string | null>(null);
  const [receiptTitle, setReceiptTitle] = useState<string>("");
  const [receiptExpenseId, setReceiptExpenseId] = useState<number | null>(null);

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

  const isOwner = trip?.owner?.id === user?.id;

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

  const onDeleteReceipt = async () => {
    if (!receiptExpenseId) return;

    const ok = window.confirm("Удалить чек у расхода?");
    if (!ok) return;

    try {
      setError(null);
      await deleteExpenseReceipt(tripId, receiptExpenseId);
      setReceiptOpen(false);
      setReceiptUrl(null);
      setReceiptTitle("");
      setReceiptExpenseId(null);
      await loadAll();
    } catch (e) {
      setError("Не удалось удалить чек.");
    }
  };

  const onCloseEdit = () => {
    setEditOpen(false);
    setSelectedExpense(null);
  };

  const onCloseReceipt = () => {
    setReceiptOpen(false);
    setReceiptTitle("");
    setReceiptUrl(null);
    setReceiptExpenseId(null);
  };

  if (!trip) return <div>Загрузка...</div>;

  return (
    <Container sx={{ mt: 4, mb: 6 }}>
      <Typography variant="h4" gutterBottom>
        {trip.title}
      </Typography>

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

      <ChecklistSection
        tripId={tripId}
        members={trip.members}
        onError={(msg) => setError(msg)}
      />

      <ItinerarySection
        tripId={tripId}
        members={trip.members}
        onError={(msg) => setError(msg)}
      />

      {/* РАСХОДЫ */}
      <ExpensesSection
        tripId={tripId}
        trip={trip}
        onError={(msg) => setError(msg)}
        onAfterChange={async () => {
          // после изменения расходов нужно пересчитать: balance / stats / settlements
          await loadAll();
        }}
      />

      {/* Карта */}
      <Box mt={3}>
        <TripMap expenses={expenses} />
      </Box>

      {/* Баланс + оплаты */}
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

      {/* Статистика */}
      {stats && (
        <Box mt={3}>
          <TripStatsView stats={stats} />
        </Box>
      )}

      {/* Экспорт + обновление */}
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

      {/* Диалог редактирования расхода */}
      {trip && (
        <ExpenseEditDialog
          open={editOpen}
          onClose={onCloseEdit}
          tripId={tripId}
          trip={trip}
          categories={categories}
          expense={selectedExpense}
          onSaved={loadAll}
        />
      )}

      {/* Диалог просмотра чека */}
      <Dialog open={receiptOpen} onClose={onCloseReceipt} maxWidth="md" fullWidth>
        <DialogTitle>Чек: {receiptTitle}</DialogTitle>
        <DialogContent dividers>
          {receiptUrl ? (
            <Box display="flex" justifyContent="center">
              <img src={receiptUrl} alt="receipt" style={{ maxWidth: "100%", height: "auto" }} />
            </Box>
          ) : null}
        </DialogContent>
        <DialogActions>
          {receiptUrl ? <Button onClick={() => downloadReceipt(receiptUrl!, `receipt.jpg`)}>Скачать</Button> : null}
          {receiptUrl ? (
            <Button color="error" onClick={onDeleteReceipt} startIcon={<DeleteForeverIcon />}>
              Удалить
            </Button>
          ) : null}
          <Button onClick={onCloseReceipt}>Закрыть</Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
}