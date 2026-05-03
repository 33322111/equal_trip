import React, { useMemo } from "react";
import { Box, Button, Chip, Divider, Stack, Typography } from "@mui/material";
import { Expense } from "../api/expenses";
import { API_BASE_URL } from "../config/runtime";
import { downloadReceipt } from "../api/exports";

type Props = {
  expense: Expense;
};

function toAbsUrl(url: string) {
  return url.startsWith("http") ? url : `${API_BASE_URL}${url}`;
}

function guessFilename(url: string, fallback: string) {
  try {
    const clean = url.split("?")[0];
    const last = clean.substring(clean.lastIndexOf("/") + 1);
    return last || fallback;
  } catch {
    return fallback;
  }
}

function round2(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function formatAmount(value: number | null) {
  if (value === null || Number.isNaN(value) || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("ru-RU", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(round2(value));
}

function formatDateOnlyValue(value: string | null | undefined) {
  if (!value) return "Дата не указана";
  const parts = value.split("-").map(Number);
  if (parts.length !== 3 || parts.some((part) => !Number.isFinite(part))) return "Дата не указана";
  const [year, month, day] = parts;
  return new Intl.DateTimeFormat("ru-RU", {
    dateStyle: "medium",
  }).format(new Date(year, month - 1, day));
}

function formatExpenseDate(value: string | null, includeTime = true, localDate?: string | null) {
  if (!includeTime && localDate) {
    return formatDateOnlyValue(localDate);
  }
  if (!value) return "Дата не указана";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Дата не указана";
  if (includeTime) {
    return new Intl.DateTimeFormat("ru-RU", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(date);
  }
  return new Intl.DateTimeFormat("ru-RU", {
    dateStyle: "medium",
  }).format(date);
}

function formatRubAmount(value: string) {
  const amount = Number(value);
  if (Number.isNaN(amount)) return value;
  return new Intl.NumberFormat("ru-RU", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

export default function ExpenseDetailsPanel({ expense }: Props) {
  const showRubChip =
    expense.currency.toUpperCase() !== "RUB" &&
    Number.isFinite(Number(expense.amount_rub));

  const splitType =
    expense.shares.length > 0
      ? expense.shares.every((s) => Number(s.weight) === Number(expense.shares[0].weight))
        ? "Поровну"
        : "Кастомно"
      : "Не указано";

  const shareDetails = useMemo(() => {
    if (!expense.shares.length) return [];

    const totalWeight = expense.shares.reduce((sum, s) => sum + Number(s.weight), 0);
    const expenseAmount = Number(expense.amount);
    const expenseAmountRub = Number(expense.amount_rub);

    return expense.shares.map((share) => {
      const weight = Number(share.weight);
      const byCurrency =
        totalWeight > 0 && Number.isFinite(expenseAmount)
          ? (expenseAmount * weight) / totalWeight
          : null;
      const byRub =
        totalWeight > 0 && Number.isFinite(expenseAmountRub)
          ? (expenseAmountRub * weight) / totalWeight
          : null;

      return {
        userId: share.user.id,
        username: share.user.username,
        email: share.user.email,
        byCurrency,
        byRub,
      };
    });
  }, [expense]);

  const receiptAbs = expense.receipt ? toAbsUrl(expense.receipt) : null;

  return (
    <Stack spacing={1.5}>
      <Box
        display="flex"
        flexDirection={{ xs: "column", sm: "row" }}
        justifyContent="space-between"
        gap={1.5}
        alignItems={{ xs: "flex-start", sm: "flex-start" }}
      >
        <Box>
          <Typography variant="h6">{expense.title}</Typography>
          <Typography color="text.secondary">{expense.category?.name ?? "Без категории"}</Typography>
        </Box>
        <Stack direction="column" spacing={1} alignItems={{ xs: "flex-start", sm: "flex-end" }}>
          <Chip color="primary" label={`${expense.amount} ${expense.currency}`} sx={{ fontWeight: 600 }} />
          {showRubChip ? (
            <Chip
              variant="outlined"
              color="secondary"
              label={`≈ ${formatRubAmount(expense.amount_rub)} RUB`}
              sx={{ fontWeight: 600 }}
            />
          ) : null}
        </Stack>
      </Box>

      <Divider />

      <Typography>Автор: {expense.created_by.username}</Typography>
      <Typography>Почта автора: {expense.created_by.email || "—"}</Typography>
      <Typography>
        Дата расхода:{" "}
        {expense.spent_at || expense.spent_date_local
          ? formatExpenseDate(expense.spent_at, expense.spent_time_known, expense.spent_date_local)
          : "не указана"}
      </Typography>
      <Typography>Время добавления: {formatExpenseDate(expense.created_at)}</Typography>
      {expense.currency.toUpperCase() !== "RUB" ? (
        <Typography>
          Курс: 1 {expense.currency} = {formatRubAmount(String(expense.fx_rate))} RUB
        </Typography>
      ) : null}
      <Typography>
        Координаты:{" "}
        {expense.lat && expense.lng
          ? `${Number(expense.lat).toFixed(6)}, ${Number(expense.lng).toFixed(6)}`
          : "не указаны"}
      </Typography>
      <Typography>
        Тип деления: {splitType} • Участников: {expense.shares.length}
      </Typography>

      {shareDetails.length ? (
        <Box
          sx={{
            border: "1px solid #d6dee6",
            borderRadius: 2,
            p: 1.25,
            backgroundColor: "#f8fafc",
          }}
        >
          <Typography variant="subtitle2" sx={{ mb: 0.75 }}>
            Распределение по участникам
          </Typography>
          <Stack spacing={0.75}>
            {shareDetails.map((s) => (
              <Box
                key={s.userId}
                display="flex"
                flexDirection={{ xs: "column", sm: "row" }}
                justifyContent="space-between"
                gap={0.5}
              >
                <Typography variant="body2">
                  {s.username} ({s.email || "—"})
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {formatAmount(s.byCurrency)} {expense.currency} • ≈ {formatAmount(s.byRub)} RUB
                </Typography>
              </Box>
            ))}
          </Stack>
        </Box>
      ) : null}

      <Typography>Чек: {expense.receipt ? "прикреплён" : "не прикреплён"}</Typography>
      {receiptAbs ? (
        <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
          <Button
            variant="outlined"
            component="a"
            href={receiptAbs}
            target="_blank"
            rel="noopener noreferrer"
          >
            Открыть чек
          </Button>
          <Button
            variant="outlined"
            onClick={() =>
              downloadReceipt(
                receiptAbs,
                guessFilename(receiptAbs, `receipt_${expense.id}.jpg`)
              )
            }
          >
            Скачать чек
          </Button>
        </Stack>
      ) : null}
    </Stack>
  );
}
