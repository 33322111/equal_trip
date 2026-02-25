import React, { useEffect, useMemo, useState } from "react";
import {
  Container,
  Typography,
  Paper,
  Box,
  Button,
  TextField,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from "@mui/material";

import AttachFileIcon from "@mui/icons-material/AttachFile";
import DeleteForeverIcon from "@mui/icons-material/DeleteForever";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import PaidIcon from "@mui/icons-material/Paid";

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

import {
  listSettlements,
  createSettlement,
  confirmSettlement,
  deleteSettlement,
  Settlement,
} from "../api/settlements";

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

  // Payment dialogs
  const [payOpen, setPayOpen] = useState(false);
  const [payFromUserId, setPayFromUserId] = useState<number | null>(null);
  const [payToUserId, setPayToUserId] = useState<number | null>(null);
  const [payAmount, setPayAmount] = useState<string>("");
  const [payProofFile, setPayProofFile] = useState<File | null>(null);
  const [paySubmitting, setPaySubmitting] = useState(false);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmSettlementId, setConfirmSettlementId] = useState<number | null>(null);
  const [confirmProofFile, setConfirmProofFile] = useState<File | null>(null);
  const [confirmSubmitting, setConfirmSubmitting] = useState(false);

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

  // PAYMENTS

  const openPayDialogFromTransfer = (fromUser: number, toUser: number, amount: string) => {
    setPayFromUserId(fromUser);
    setPayToUserId(toUser);
    setPayAmount(String(amount));
    setPayProofFile(null);
    setPayOpen(true);
  };

  const closePayDialog = () => {
    setPayOpen(false);
    setPayFromUserId(null);
    setPayToUserId(null);
    setPayAmount("");
    setPayProofFile(null);
  };

  const submitPay = async () => {
    if (!payFromUserId || !payToUserId) return;
    const amt = Number(payAmount);
    if (!Number.isFinite(amt) || amt <= 0) {
      setError("Введите корректную сумму оплаты > 0.");
      return;
    }

    setPaySubmitting(true);
    try {
      setError(null);
      const fd = new FormData();
      fd.append("from_user", String(payFromUserId));
      fd.append("to_user", String(payToUserId));
      fd.append("amount", String(amt));
      fd.append("currency", "RUB");
      if (payProofFile) fd.append("proof", payProofFile);

      await createSettlement(tripId, fd);
      closePayDialog();
      await loadAll(); // чтобы баланс пересчитался и settlement появился в списке
    } catch (e) {
      setError("Не удалось создать оплату.");
    } finally {
      setPaySubmitting(false);
    }
  };

  const openConfirmDialog = (settlementId: number) => {
    setConfirmSettlementId(settlementId);
    setConfirmProofFile(null);
    setConfirmOpen(true);
  };

  const closeConfirmDialog = () => {
    setConfirmOpen(false);
    setConfirmSettlementId(null);
    setConfirmProofFile(null);
  };

  const submitConfirm = async () => {
    if (!confirmSettlementId) return;

    setConfirmSubmitting(true);
    try {
      setError(null);

      // proof опционален
      const fd = new FormData();
      if (confirmProofFile) fd.append("proof", confirmProofFile);

      await confirmSettlement(tripId, confirmSettlementId, fd);
      closeConfirmDialog();
      await loadAll(); // баланс пересчитался
    } catch (e) {
      setError("Не удалось подтвердить оплату.");
    } finally {
      setConfirmSubmitting(false);
    }
  };

  const onDeleteSettlement = async (settlementId: number) => {
    const ok = window.confirm("Удалить запись об оплате?");
    if (!ok) return;

    try {
      setError(null);
      await deleteSettlement(tripId, settlementId);
      await loadAll();
    } catch (e) {
      setError("Не удалось удалить оплату.");
    }
  };

  const canConfirm = (s: Settlement) => s.status === "pending" && s.to_user === user?.id;

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
              const canPay = t.from_user === user?.id;

              return (
                <Paper key={idx} variant="outlined" sx={{ p: 1.5 }}>
                  <Box display="flex" alignItems="center" justifyContent="space-between" gap={2}>
                    <Typography sx={{ minWidth: 0 }}>
                      <b>{from?.username ?? `User#${t.from_user}`}</b> →{" "}
                      <b>{to?.username ?? `User#${t.to_user}`}</b>: <b>{t.amount} RUB</b>
                    </Typography>

                    {canPay ? (
                      <Button
                        size="small"
                        variant="outlined"
                        startIcon={<PaidIcon />}
                        onClick={() => openPayDialogFromTransfer(t.from_user, t.to_user, t.amount)}
                      >
                        Я оплатил
                      </Button>
                    ) : null}
                  </Box>
                </Paper>
              );
            })}
          </Box>
        )}
      </Paper>

      {/* Оплаты (Settlements) */}
      <Paper sx={{ p: 2, mt: 3 }}>
        <Typography variant="h6" gutterBottom>
          Оплаты
        </Typography>

        {settlements.length === 0 ? (
          <Typography color="text.secondary">Пока нет оплат.</Typography>
        ) : (
          <Box display="flex" flexDirection="column" gap={1}>
            {settlements.map((s) => {
              const from = membersById.get(s.from_user);
              const to = membersById.get(s.to_user);

              return (
                <Paper key={s.id} variant="outlined" sx={{ p: 1.5 }}>
                  <Box display="flex" justifyContent="space-between" alignItems="center" gap={2}>
                    <Box sx={{ minWidth: 0 }}>
                      <Typography>
                        <b>{from?.username ?? `User#${s.from_user}`}</b> →{" "}
                        <b>{to?.username ?? `User#${s.to_user}`}</b>:{" "}
                        <b>{s.amount} {s.currency}</b>
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        Статус: {s.status === "confirmed" ? "подтверждено ✅" : "ожидает подтверждения ⏳"}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        Скриншот: {s.proof ? "есть" : "нет"}
                      </Typography>
                    </Box>

                    <Box display="flex" alignItems="center" gap={1} flexWrap="wrap">
                      {s.proof ? (
                        <>
                          <Button
                            size="small"
                            variant="text"
                            onClick={() => window.open(toAbsUrl(s.proof!), "_blank")}
                          >
                            Открыть скриншот
                          </Button>
                          <Button
                            size="small"
                            variant="text"
                            onClick={() => downloadReceipt(toAbsUrl(s.proof!), `payment_proof_${s.id}`)}
                          >
                            Скачать скриншот
                          </Button>
                        </>
                      ) : null}

                      {canConfirm(s) ? (
                        <Button
                          size="small"
                          variant="contained"
                          startIcon={<CheckCircleIcon />}
                          onClick={() => openConfirmDialog(s.id)}
                        >
                          Подтвердить
                        </Button>
                      ) : null}

                      {/* MVP: разрешил удалять запись инициатору или владельцу поездки */}
                      {(s.from_user === user?.id || isOwner) ? (
                        <Button
                          size="small"
                          color="error"
                          variant="outlined"
                          onClick={() => onDeleteSettlement(s.id)}
                        >
                          Удалить
                        </Button>
                      ) : null}
                    </Box>
                  </Box>
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

      {/* Диалог: Я оплатил */}
      <Dialog open={payOpen} onClose={closePayDialog} maxWidth="sm" fullWidth>
        <DialogTitle>Отметить оплату</DialogTitle>
        <DialogContent dividers>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Можно прикрепить скрин перевода (опционально).
          </Typography>

          <TextField
            label="Сумма"
            value={payAmount}
            onChange={(e) => setPayAmount(e.target.value)}
            fullWidth
            margin="normal"
          />

          <Button variant="outlined" component="label" startIcon={<AttachFileIcon />} sx={{ mt: 1 }}>
            Прикрепить скриншот
            <input
              hidden
              type="file"
              onChange={(e) => setPayProofFile(e.target.files?.[0] ?? null)}
            />
          </Button>

          {payProofFile ? (
            <Typography variant="body2" sx={{ mt: 1 }}>
              Файл: {payProofFile.name}
            </Typography>
          ) : null}
        </DialogContent>

        <DialogActions>
          <Button onClick={closePayDialog}>Отмена</Button>
          <Button variant="contained" onClick={submitPay} disabled={paySubmitting}>
            Создать
          </Button>
        </DialogActions>
      </Dialog>

      {/* Диалог: Подтвердить оплату */}
      <Dialog open={confirmOpen} onClose={closeConfirmDialog} maxWidth="sm" fullWidth>
        <DialogTitle>Подтвердить оплату</DialogTitle>
        <DialogContent dividers>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Можно прикрепить скрин (опционально). После подтверждения баланс пересчитается.
          </Typography>

          <Button variant="outlined" component="label" startIcon={<AttachFileIcon />}>
            Прикрепить скриншот
            <input
              hidden
              type="file"
              onChange={(e) => setConfirmProofFile(e.target.files?.[0] ?? null)}
            />
          </Button>

          {confirmProofFile ? (
            <Typography variant="body2" sx={{ mt: 1 }}>
              Файл: {confirmProofFile.name}
            </Typography>
          ) : null}
        </DialogContent>

        <DialogActions>
          <Button onClick={closeConfirmDialog}>Отмена</Button>
          <Button variant="contained" onClick={submitConfirm} disabled={confirmSubmitting}>
            Подтвердить
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
}