import React, { useEffect, useMemo, useState } from "react";
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Button, TextField, MenuItem, FormControlLabel, Checkbox,
  Typography, Box
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

export default function ExpenseEditDialog({
  open, onClose, tripId, trip, categories, expense, onSaved
}: Props) {
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("RUB");
  const [categoryId, setCategoryId] = useState<number | "">("");
  const [selectedUserIds, setSelectedUserIds] = useState<number[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!expense) return;
    setTitle(expense.title);
    setAmount(String(expense.amount));
    setCurrency(expense.currency);
    setCategoryId(expense.category?.id ?? "");
    setSelectedUserIds(expense.shares.map(s => s.user.id));
  }, [expense]);

  const members = useMemo(() => trip.members.map(m => m.user), [trip]);

  const toggleUser = (uid: number) => {
    setSelectedUserIds(prev =>
      prev.includes(uid) ? prev.filter(x => x !== uid) : [...prev, uid]
    );
  };

  const onSubmit = async () => {
    if (!expense) return;
    if (!title.trim()) return;
    if (selectedUserIds.length === 0) return;

    setSaving(true);
    try {
      await updateExpense(tripId, expense.id, {
        title: title.trim(),
        amount: Number(amount),
        currency,
        category_id: categoryId === "" ? null : categoryId,
        share_user_ids: selectedUserIds,
      });
      await onSaved();
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const canSave = title.trim() && Number(amount) > 0 && selectedUserIds.length > 0;

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Редактировать расход</DialogTitle>
      <DialogContent sx={{ pt: 2 }}>
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