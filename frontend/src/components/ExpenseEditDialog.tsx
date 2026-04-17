import React, { useEffect, useMemo, useState } from "react";
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Button, TextField, MenuItem, FormControlLabel, Checkbox,
  Typography, Box, Stack, InputAdornment, Alert
} from "@mui/material";
import { Category, Expense, updateExpense } from "../api/expenses";
import { TripDetail } from "../api/trips";

type Props = {
  open: boolean;
  onClose: () => void;
  tripId: number;
  trip: TripDetail;
  categories: Category[];
  expense: Expense | null;
  onSaved: () => Promise<void>;
};

type SplitMode = "equal" | "custom";

function normalizeNumber(value: string) {
  return value.replace(",", ".").trim();
}

function parseDecimal(value: string) {
  const num = Number(normalizeNumber(value));
  return Number.isFinite(num) ? num : NaN;
}

function round2(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function buildEvenSplit(total: number, userIds: number[]) {
  const result: Record<number, string> = {};
  if (!Number.isFinite(total) || total <= 0 || userIds.length === 0) {
    userIds.forEach((uid) => {
      result[uid] = "0.00";
    });
    return result;
  }

  const cents = Math.round(total * 100);
  const base = Math.floor(cents / userIds.length);
  let remainder = cents - base * userIds.length;

  for (const uid of userIds) {
    const extra = remainder > 0 ? 1 : 0;
    remainder -= extra;
    result[uid] = ((base + extra) / 100).toFixed(2);
  }

  return result;
}

export default function ExpenseEditDialog({
  open, onClose, tripId, trip, categories, expense, onSaved
}: Props) {
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("RUB");
  const [categoryId, setCategoryId] = useState<number | "">("");
  const [selectedUserIds, setSelectedUserIds] = useState<number[]>([]);
  const [splitMode, setSplitMode] = useState<SplitMode>("equal");
  const [customShareAmounts, setCustomShareAmounts] = useState<Record<number, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const members = useMemo(() => trip.members.map(m => m.user), [trip]);

  useEffect(() => {
    if (!expense) return;

    setTitle(expense.title);
    setAmount(String(expense.amount));
    setCurrency(expense.currency);
    setCategoryId(expense.category?.id ?? "");
    setFormError(null);

    const shareUserIds = expense.shares.map((s) => s.user.id);
    setSelectedUserIds(shareUserIds);

    const weights = expense.shares.map((s) => Number(s.weight));
    const allWeightsEqual = weights.length > 0 && weights.every((w) => Math.abs(w - weights[0]) < 1e-9);

    const expenseAmount = parseDecimal(String(expense.amount));
    const totalWeight = weights.reduce((sum, w) => sum + (Number.isFinite(w) ? w : 0), 0);
    const nextAmounts: Record<number, string> = {};
    expense.shares.forEach((s) => {
      const weight = Number(s.weight);
      const value =
        Number.isFinite(expenseAmount) && expenseAmount > 0 && totalWeight > 0 && Number.isFinite(weight)
          ? round2((expenseAmount * weight) / totalWeight)
          : 0;
      nextAmounts[s.user.id] = value.toFixed(2);
    });
    setCustomShareAmounts(nextAmounts);
    setSplitMode(allWeightsEqual ? "equal" : "custom");
  }, [expense]);

  useEffect(() => {
    setCustomShareAmounts((prev) => {
      const next = { ...prev };
      let changed = false;

      selectedUserIds.forEach((uid) => {
        if (next[uid] === undefined) {
          next[uid] = "0.00";
          changed = true;
        }
      });

      Object.keys(next).forEach((rawId) => {
        const uid = Number(rawId);
        if (!selectedUserIds.includes(uid)) {
          delete next[uid];
          changed = true;
        }
      });

      return changed ? next : prev;
    });
  }, [selectedUserIds]);

  const toggleUser = (uid: number) => {
    setSelectedUserIds(prev =>
      prev.includes(uid) ? prev.filter(x => x !== uid) : [...prev, uid]
    );
  };

  const amountNum = parseDecimal(amount);
  const customTotal = round2(
    selectedUserIds.reduce((sum, uid) => {
      const value = parseDecimal(customShareAmounts[uid] ?? "");
      return sum + (Number.isFinite(value) ? value : 0);
    }, 0)
  );
  const customAmountsInvalid = selectedUserIds.some((uid) => {
    const value = parseDecimal(customShareAmounts[uid] ?? "");
    return !Number.isFinite(value) || value <= 0;
  });
  const customSumDiff = round2(customTotal - (Number.isFinite(amountNum) ? amountNum : 0));
  const customBalanced = Number.isFinite(amountNum) && Math.abs(customSumDiff) < 0.01;

  const canSave =
    !!title.trim() &&
    Number.isFinite(amountNum) &&
    amountNum > 0 &&
    selectedUserIds.length > 0 &&
    (splitMode === "equal" || (!customAmountsInvalid && customBalanced));

  const onSubmit = async () => {
    if (!expense) return;
    setFormError(null);

    if (!title.trim()) {
      setFormError("Введите название расхода.");
      return;
    }
    if (!Number.isFinite(amountNum) || amountNum <= 0) {
      setFormError("Введите корректную сумму расхода.");
      return;
    }
    if (selectedUserIds.length === 0) {
      setFormError("Нужно выбрать хотя бы одного участника.");
      return;
    }
    if (splitMode === "custom" && customAmountsInvalid) {
      setFormError("Для каждого выбранного участника укажи сумму больше 0.");
      return;
    }
    if (splitMode === "custom" && !customBalanced) {
      setFormError("Сумма долей должна быть равна сумме расхода.");
      return;
    }

    setSaving(true);
    try {
      const payload: {
        title: string;
        amount: number;
        currency: string;
        category_id: number | null;
        share_user_ids?: number[];
        share_amounts?: { user_id: number; amount: string }[];
      } = {
        title: title.trim(),
        amount: amountNum,
        currency,
        category_id: categoryId === "" ? null : categoryId,
      };

      if (splitMode === "custom") {
        payload.share_amounts = selectedUserIds.map((uid) => ({
          user_id: uid,
          amount: round2(parseDecimal(customShareAmounts[uid] ?? "0")).toFixed(2),
        }));
      } else {
        payload.share_user_ids = selectedUserIds;
      }

      await updateExpense(tripId, expense.id, {
        ...payload,
      });
      await onSaved();
      onClose();
    } catch (e: any) {
      const data = e?.response?.data;
      const message =
        data?.detail ||
        data?.non_field_errors?.[0] ||
        data?.share_amounts?.[0] ||
        data?.share_user_ids?.[0] ||
        "Не удалось сохранить расход.";
      setFormError(String(message));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Редактировать расход</DialogTitle>
      <DialogContent sx={{ pt: 2 }}>
        {formError ? <Alert severity="error" sx={{ mb: 1 }}>{formError}</Alert> : null}

        <TextField
          label="Название"
          fullWidth
          margin="normal"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <TextField
          label="Сумма"
          fullWidth
          margin="normal"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          InputProps={{
            endAdornment: <InputAdornment position="end">{currency || "RUB"}</InputAdornment>,
          }}
        />
        <TextField
          label="Валюта"
          fullWidth
          margin="normal"
          value={currency}
          onChange={(e) => setCurrency(e.target.value)}
        />
        <TextField
          select
          label="Категория"
          fullWidth
          margin="normal"
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value === "" ? "" : Number(e.target.value))}
        >
          <MenuItem value="">Без категории</MenuItem>
          {categories.map(c => (
            <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>
          ))}
        </TextField>

        <Box mt={2}>
          <Typography variant="subtitle1">На кого делим</Typography>
          <Typography variant="body2" color="text.secondary">
            Выбери участников, которые участвуют в этом расходе (минимум 1).
          </Typography>

          <TextField
            select
            label="Способ деления"
            fullWidth
            margin="normal"
            value={splitMode}
            onChange={(e) => setSplitMode(e.target.value as SplitMode)}
          >
            <MenuItem value="equal">Поровну между выбранными</MenuItem>
            <MenuItem value="custom">Кастомно по суммам</MenuItem>
          </TextField>

          {members.map(u => (
            <FormControlLabel
              key={u.id}
              control={
                <Checkbox
                  checked={selectedUserIds.includes(u.id)}
                  onChange={() => toggleUser(u.id)}
                />
              }
              label={`${u.username} (${u.email})`}
            />
          ))}

          {splitMode === "custom" ? (
            <Box mt={1}>
              <Stack direction={{ xs: "column", sm: "row" }} spacing={1} alignItems={{ xs: "stretch", sm: "center" }}>
                <Typography variant="subtitle2">Сумма по участникам</Typography>
                <Button
                  size="small"
                  variant="text"
                  onClick={() => {
                    const even = buildEvenSplit(Number.isFinite(amountNum) ? amountNum : 0, selectedUserIds);
                    setCustomShareAmounts((prev) => ({ ...prev, ...even }));
                  }}
                  disabled={selectedUserIds.length === 0}
                >
                  Распределить поровну
                </Button>
              </Stack>

              <Stack spacing={1} sx={{ mt: 1 }}>
                {members
                  .filter((u) => selectedUserIds.includes(u.id))
                  .map((u) => (
                    <TextField
                      key={u.id}
                      label={`${u.username} (${u.email})`}
                      value={customShareAmounts[u.id] ?? ""}
                      onChange={(e) =>
                        setCustomShareAmounts((prev) => ({ ...prev, [u.id]: e.target.value }))
                      }
                      InputProps={{
                        endAdornment: <InputAdornment position="end">{currency || "RUB"}</InputAdornment>,
                      }}
                      fullWidth
                    />
                  ))}
              </Stack>

              <Typography color={customBalanced ? "success.main" : "warning.main"} sx={{ mt: 1 }}>
                Итого по долям: {customTotal.toFixed(2)} {currency || "RUB"} {customBalanced ? "" : `(разница ${customSumDiff.toFixed(2)})`}
              </Typography>
            </Box>
          ) : null}
        </Box>

        {selectedUserIds.length === 0 && (
          <Typography color="error" sx={{ mt: 1 }}>
            Нужно выбрать хотя бы одного участника.
          </Typography>
        )}
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose}>Отмена</Button>
        <Button variant="contained" onClick={onSubmit} disabled={!canSave || saving}>
          Сохранить
        </Button>
      </DialogActions>
    </Dialog>
  );
}
