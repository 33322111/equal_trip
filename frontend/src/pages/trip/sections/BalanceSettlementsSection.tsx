import React, { useMemo, useState } from "react";
import {
  Paper,
  Typography,
  Box,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Alert,
} from "@mui/material";

import AttachFileIcon from "@mui/icons-material/AttachFile";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import PaidIcon from "@mui/icons-material/Paid";

import { BalanceResponse } from "../../../api/expenses";
import {
  Settlement,
  createSettlement,
  confirmSettlement,
  deleteSettlement,
} from "../../../api/settlements";
import { downloadReceipt } from "../../../api/exports";
import { API_BASE_URL } from "../../../config/runtime";
import { extractApiErrorMessage } from "../../../utils/errorMessages";

type MemberUser = { id: number; username: string; email: string };
type TripMember = { id: number; role: string; user: MemberUser };

type Props = {
  tripId: number;
  userId?: number;
  isOwner: boolean;
  members: TripMember[];
  balance: BalanceResponse | null;
  settlements: Settlement[];
  onAfterChange: () => Promise<void>;
  onError: (msg: string) => void;
};

export default function BalanceSettlementsSection({
  tripId,
  userId,
  isOwner,
  members,
  balance,
  settlements,
  onAfterChange,
  onError,
}: Props) {
  const toAbsUrl = (url: string) => (url.startsWith("http") ? url : `${API_BASE_URL}${url}`);

  const membersById = useMemo(() => {
    const map = new Map<number, { username: string; email: string }>();
    for (const m of members) map.set(m.user.id, { username: m.user.username, email: m.user.email });
    return map;
  }, [members]);

  // Pay dialog state
  const [payOpen, setPayOpen] = useState(false);
  const [payFromUserId, setPayFromUserId] = useState<number | null>(null);
  const [payToUserId, setPayToUserId] = useState<number | null>(null);
  const [payAmount, setPayAmount] = useState<string>("");
  const [payProofFile, setPayProofFile] = useState<File | null>(null);
  const [paySubmitting, setPaySubmitting] = useState(false);

  // Confirm dialog state
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmSettlementId, setConfirmSettlementId] = useState<number | null>(null);
  const [confirmProofFile, setConfirmProofFile] = useState<File | null>(null);
  const [confirmSubmitting, setConfirmSubmitting] = useState(false);

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
      onError("Введите корректную сумму оплаты > 0.");
      return;
    }

    setPaySubmitting(true);
    try {
      const fd = new FormData();
      fd.append("from_user", String(payFromUserId));
      fd.append("to_user", String(payToUserId));
      fd.append("amount", String(amt));
      fd.append("currency", "RUB");
      if (payProofFile) fd.append("proof", payProofFile);

      await createSettlement(tripId, fd);
      closePayDialog();
      await onAfterChange();
    } catch (e: any) {
      onError(extractApiErrorMessage(e, "Не удалось создать оплату.", ["proof"]));
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
      const fd = new FormData();
      if (confirmProofFile) fd.append("proof", confirmProofFile);

      await confirmSettlement(tripId, confirmSettlementId, fd);
      closeConfirmDialog();
      await onAfterChange();
    } catch (e: any) {
      onError(extractApiErrorMessage(e, "Не удалось подтвердить оплату.", ["proof"]));
    } finally {
      setConfirmSubmitting(false);
    }
  };

  const onDeleteSettlement = async (settlementId: number) => {
    const ok = window.confirm("Удалить запись об оплате?");
    if (!ok) return;

    try {
      await deleteSettlement(tripId, settlementId);
      await onAfterChange();
    } catch {
      onError("Не удалось удалить оплату.");
    }
  };

  const canConfirm = (s: Settlement) => s.status === "pending" && s.to_user === userId;

  return (
    <>
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
              const canPay = t.from_user === userId;

              return (
                <Paper key={idx} variant="outlined" sx={{ p: 1.5 }}>
                  <Box
                    display="flex"
                    flexDirection={{ xs: "column", sm: "row" }}
                    alignItems={{ xs: "flex-start", sm: "center" }}
                    justifyContent="space-between"
                    gap={1.5}
                  >
                    <Typography sx={{ minWidth: 0, wordBreak: "break-word" }}>
                      <b>{from?.username ?? `User#${t.from_user}`}</b> →{" "}
                      <b>{to?.username ?? `User#${t.to_user}`}</b>: <b>{t.amount} RUB</b>
                    </Typography>

                    {canPay ? (
                      <Button
                        size="small"
                        variant="outlined"
                        startIcon={<PaidIcon />}
                        onClick={() => openPayDialogFromTransfer(t.from_user, t.to_user, t.amount)}
                        sx={{ width: { xs: "100%", sm: "auto" } }}
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

      {/* Оплаты */}
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
                  <Box
                    display="flex"
                    flexDirection={{ xs: "column", sm: "row" }}
                    justifyContent="space-between"
                    alignItems={{ xs: "flex-start", sm: "center" }}
                    gap={1.5}
                  >
                    <Box sx={{ minWidth: 0 }}>
                      <Typography sx={{ wordBreak: "break-word" }}>
                        <b>{from?.username ?? `User#${s.from_user}`}</b> →{" "}
                        <b>{to?.username ?? `User#${s.to_user}`}</b>:{" "}
                        <b>
                          {s.amount} {s.currency}
                        </b>
                      </Typography>

                      <Typography variant="body2" color="text.secondary">
                        Статус: {s.status === "confirmed" ? "подтверждено ✅" : "ожидает подтверждения ⏳"}
                      </Typography>

                      <Typography variant="body2" color="text.secondary">
                        Скриншот: {s.proof ? "есть" : "нет"}
                      </Typography>
                    </Box>

                    <Box
                      display="flex"
                      alignItems="center"
                      gap={1}
                      flexWrap="wrap"
                      width={{ xs: "100%", sm: "auto" }}
                    >
                      {s.proof ? (
                        <>
                          <Button
                            size="small"
                            variant="text"
                            onClick={() => window.open(toAbsUrl(s.proof!), "_blank")}
                            sx={{ width: { xs: "100%", sm: "auto" } }}
                          >
                            Открыть
                          </Button>
                          <Button
                            size="small"
                            variant="text"
                            onClick={() => downloadReceipt(toAbsUrl(s.proof!), `payment_proof_${s.id}`)}
                            sx={{ width: { xs: "100%", sm: "auto" } }}
                          >
                            Скачать
                          </Button>
                        </>
                      ) : null}

                      {canConfirm(s) ? (
                        <Button
                          size="small"
                          variant="contained"
                          startIcon={<CheckCircleIcon />}
                          onClick={() => openConfirmDialog(s.id)}
                          sx={{ width: { xs: "100%", sm: "auto" } }}
                        >
                          Подтвердить
                        </Button>
                      ) : null}

                      {(s.from_user === userId || isOwner) ? (
                        <Button
                          size="small"
                          color="error"
                          variant="outlined"
                          onClick={() => onDeleteSettlement(s.id)}
                          sx={{ width: { xs: "100%", sm: "auto" } }}
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

      {/* Диалог: Я оплатил */}
      <Dialog open={payOpen} onClose={closePayDialog} maxWidth="sm" fullWidth>
        <DialogTitle>Отметить оплату</DialogTitle>
        <DialogContent dividers>
          <Alert severity="info" sx={{ mb: 2 }}>
            Можно прикрепить скрин перевода (опционально).
          </Alert>

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
              accept="application/pdf,image/jpeg,image/png,image/gif,image/webp"
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

      {/* Диалог: Подтвердить */}
      <Dialog open={confirmOpen} onClose={closeConfirmDialog} maxWidth="sm" fullWidth>
        <DialogTitle>Подтвердить оплату</DialogTitle>
        <DialogContent dividers>
          <Alert severity="info" sx={{ mb: 2 }}>
            Можно прикрепить скрин (опционально). После подтверждения баланс пересчитается.
          </Alert>

          <Button variant="outlined" component="label" startIcon={<AttachFileIcon />}>
            Прикрепить скриншот
            <input
              hidden
              type="file"
              accept="application/pdf,image/jpeg,image/png,image/gif,image/webp"
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
    </>
  );
}
