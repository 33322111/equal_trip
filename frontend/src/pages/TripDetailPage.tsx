import React, { useEffect, useMemo, useState } from "react";
import {
  Container,
  Typography,
  Paper,
  Box,
  Button,
  TextField,
  Alert,
  MenuItem,
  Divider,
  Stack,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from "@mui/material";

import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import AttachFileIcon from "@mui/icons-material/AttachFile";
import ImageIcon from "@mui/icons-material/Image";
import DownloadIcon from "@mui/icons-material/Download";
import DeleteForeverIcon from "@mui/icons-material/DeleteForever";

import { useParams } from "react-router-dom";

import { createInvite, getTrip, TripDetail } from "../api/trips";
import { useAuth } from "../context/AuthContext";

import {
  listCategories,
  listExpenses,
  createExpense,
  getBalance,
  deleteExpense,
  uploadExpenseReceipt,
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

const API_BASE_URL = "http://localhost:8000";

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

  // Create expense form
  const [formTitle, setFormTitle] = useState("");
  const [formAmount, setFormAmount] = useState<string>("");
  const [formCategoryId, setFormCategoryId] = useState<number | "">("");
  const [formCurrency, setFormCurrency] = useState<string>("RUB");

  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Edit dialog
  const [editOpen, setEditOpen] = useState(false);
  const [selectedExpense, setSelectedExpense] = useState<Expense | null>(null);

  // Receipt dialog
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [receiptUrl, setReceiptUrl] = useState<string | null>(null);
  const [receiptTitle, setReceiptTitle] = useState<string>("");
  const [receiptExpenseId, setReceiptExpenseId] = useState<number | null>(null);

  const toAbsUrl = (url: string) => (url.startsWith("http") ? url : `${API_BASE_URL}${url}`);

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
      const [tripData, cats, exp, bal, st] = await Promise.all([
        getTrip(tripId),
        listCategories(),
        listExpenses(tripId),
        getBalance(tripId),
        getTripStats(tripId),
      ]);
      setTrip(tripData);
      setCategories(cats);
      setExpenses(exp);
      setBalance(bal);
      setStats(st);
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

  const onAddExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const amountNum = Number(formAmount);
    if (!formTitle.trim()) {
      setError("Введите название расхода.");
      return;
    }
    if (!Number.isFinite(amountNum) || amountNum <= 0) {
      setError("Введите корректную сумму > 0.");
      return;
    }

    setIsSubmitting(true);
    try {
      await createExpense(tripId, {
        title: formTitle.trim(),
        amount: amountNum,
        currency: formCurrency,
        category_id: formCategoryId === "" ? null : formCategoryId,
        // MVP координаты — можно позже сделать выбор точки на карте
        lat: 55.751244,
        lng: 37.618423,
      });

      await loadAll();

      setFormTitle("");
      setFormAmount("");
      setFormCategoryId("");
      setFormCurrency("RUB");
    } catch (err) {
      setError("Не удалось добавить расход. Проверь данные и попробуй снова.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const onDeleteExpense = async (expenseId: number) => {
    const ok = window.confirm("Удалить расход?");
    if (!ok) return;

    try {
      setError(null);
      await deleteExpense(tripId, expenseId);
      await loadAll();
    } catch (e) {
      setError("Не удалось удалить расход.");
    }
  };

  const onOpenEdit = (ex: Expense) => {
    setSelectedExpense(ex);
    setEditOpen(true);
  };

  const onCloseEdit = () => {
    setEditOpen(false);
    setSelectedExpense(null);
  };

  const onUploadReceipt = async (ex: Expense, file: File, inputEl: HTMLInputElement) => {
    try {
      setError(null);
      await uploadExpenseReceipt(tripId, ex.id, file);
      await loadAll();
    } catch (e) {
      setError("Не удалось загрузить чек.");
    } finally {
      // чтобы можно было выбрать тот же файл повторно
      inputEl.value = "";
    }
  };

  const onOpenReceipt = (ex: Expense) => {
    if (!ex.receipt) return;
    setReceiptTitle(ex.title);
    setReceiptUrl(toAbsUrl(ex.receipt));
    setReceiptOpen(true);
    setReceiptExpenseId(ex.id);
  };

  const onCloseReceipt = () => {
    setReceiptOpen(false);
    setReceiptTitle("");
    setReceiptUrl(null);
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

      {/* РАСХОДЫ */}
      <Paper sx={{ p: 2, mb: 3 }}>
        <Typography variant="h6" gutterBottom>
          Расходы
        </Typography>

        {/* Форма добавления */}
        <Box component="form" onSubmit={onAddExpense} sx={{ mb: 2 }}>
          <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
            <TextField
              label="Название"
              value={formTitle}
              onChange={(e) => setFormTitle(e.target.value)}
              fullWidth
              required
            />
            <TextField
              label="Сумма"
              value={formAmount}
              onChange={(e) => setFormAmount(e.target.value)}
              fullWidth
              required
            />
            <TextField
              label="Валюта"
              value={formCurrency}
              onChange={(e) => setFormCurrency(e.target.value)}
              sx={{ minWidth: 120 }}
            />
            <TextField
              select
              label="Категория"
              value={formCategoryId}
              onChange={(e) => {
                const v = e.target.value;
                setFormCategoryId(v === "" ? "" : Number(v));
              }}
              sx={{ minWidth: 220 }}
            >
              <MenuItem value="">Без категории</MenuItem>
              {categories.map((c) => (
                <MenuItem key={c.id} value={c.id}>
                  {c.name}
                </MenuItem>
              ))}
            </TextField>

            <Button type="submit" variant="contained" disabled={isSubmitting}>
              Добавить
            </Button>
          </Stack>
        </Box>

        <Divider sx={{ mb: 2 }} />

        {/* Список расходов */}
        <Box display="flex" flexDirection="column" gap={1}>
          {expenses.map((ex) => (
            <Paper key={ex.id} variant="outlined" sx={{ p: 1.5 }}>
              <Box display="flex" justifyContent="space-between" alignItems="center" gap={2}>
                <Box sx={{ minWidth: 0 }}>
                  <Typography fontWeight={600} noWrap>
                    {ex.title}
                  </Typography>
                  <Typography variant="body2" color="text.secondary" noWrap>
                    {ex.category ? ex.category.name : "Без категории"} • оплатил: {ex.created_by.username}
                  </Typography>

                  {/* На кого делится */}
                  {ex.shares?.length ? (
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                      Делится на:{" "}
                      {ex.shares
                        .map((s) => membersById.get(s.user.id)?.username ?? s.user.username)
                        .join(", ")}
                    </Typography>
                  ) : null}

                  {/* Статус чека */}
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                    Чек: {ex.receipt ? "прикреплён" : "нет"}
                  </Typography>
                </Box>

                <Box display="flex" alignItems="center" gap={1}>
                  <Typography fontWeight={700} sx={{ whiteSpace: "nowrap" }}>
                    {ex.amount} {ex.currency}
                  </Typography>

                  {/* Загрузка чека */}
                  <IconButton size="small" component="label" aria-label="upload-receipt">
                    <AttachFileIcon fontSize="small" />
                    <input
                      type="file"
                      hidden
                      accept="image/*"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        onUploadReceipt(ex, file, e.currentTarget);
                      }}
                    />
                  </IconButton>

                  {/* Просмотр/скачивание чека */}
                  {ex.receipt ? (
                    <>
                      <IconButton
                        size="small"
                        onClick={() => onOpenReceipt(ex)}
                        aria-label="view-receipt"
                      >
                        <ImageIcon fontSize="small" />
                      </IconButton>

                      <IconButton
                        size="small"
                        onClick={() => downloadReceipt(ex.receipt!, `receipt_${ex.id}.jpg`)}
                        aria-label="download-receipt"
                      >
                        <DownloadIcon fontSize="small" />
                      </IconButton>
                    </>
                  ) : null}

                  {/* Редактирование */}
                  <IconButton size="small" onClick={() => onOpenEdit(ex)} aria-label="edit-expense">
                    <EditIcon fontSize="small" />
                  </IconButton>

                  {/* Удаление */}
                  <IconButton size="small" onClick={() => onDeleteExpense(ex.id)} aria-label="delete-expense">
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </Box>
              </Box>
            </Paper>
          ))}

          {expenses.length === 0 && (
            <Typography color="text.secondary">Пока нет расходов. Добавь первый 🙂</Typography>
          )}
        </Box>
      </Paper>

      {/* Карта */}
      <Box mt={3}>
        <TripMap expenses={expenses} />
      </Box>

      {/* Баланс */}
      <Paper sx={{ p: 2, mt: 3 }}>
        <Typography variant="h6" gutterBottom>
          Баланс (кто кому должен)
        </Typography>

        {!balance ? (
          <Typography color="text.secondary">Загрузка баланса...</Typography>
        ) : balance.transfers.length === 0 ? (
          <Typography color="text.secondary">Баланс нулевой — никто никому не должен ✅</Typography>
        ) : (
          <Box display="flex" flexDirection="column" gap={1}>
            {balance.transfers.map((t, idx) => {
              const from = membersById.get(t.from_user);
              const to = membersById.get(t.to_user);
              return (
                <Paper key={idx} variant="outlined" sx={{ p: 1.5 }}>
                  <Typography>
                    <b>{from?.username ?? `User#${t.from_user}`}</b> →{" "}
                    <b>{to?.username ?? `User#${t.to_user}`}</b>: <b>{t.amount} RUB</b>
                  </Typography>
                </Paper>
              );
            })}
          </Box>
        )}
      </Paper>

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

      {/* Диалог редактирования */}
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
          {receiptUrl ? (
            <Button onClick={() => downloadReceipt(receiptUrl!, `receipt.jpg`)}>Скачать</Button>
          ) : null}
          {receiptUrl ? (
          <Button
            color="error"
            onClick={onDeleteReceipt}
            startIcon={<DeleteForeverIcon />}
          >
            Удалить
          </Button>
        ) : null}
          <Button onClick={onCloseReceipt}>Закрыть</Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
}