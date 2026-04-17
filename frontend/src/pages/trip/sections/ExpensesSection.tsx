import React, { Suspense, lazy, useEffect, useMemo, useState } from "react";
import {
  Paper,
  Typography,
  Stack,
  TextField,
  Button,
  Divider,
  Box,
  IconButton,
  MenuItem,
  InputAdornment,
  useMediaQuery,
  FormControlLabel,
  Checkbox,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TablePagination,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";

import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import AttachFileIcon from "@mui/icons-material/AttachFile";
import ImageIcon from "@mui/icons-material/Image";
import DownloadIcon from "@mui/icons-material/Download";

import Autocomplete from "@mui/material/Autocomplete";

import {
  listCategories,
  listExpenses,
  createExpense,
  deleteExpense,
  uploadExpenseReceipt,
  deleteExpenseReceipt,
  Category,
  Expense,
} from "../../../api/expenses";

import { listCurrencies, Currency } from "../../../api/currencies";
import { downloadReceipt } from "../../../api/exports";
import ExpenseEditDialog from "../../../components/ExpenseEditDialog";
import { TripDetail } from "../../../api/trips";
import ReceiptDialog from "../../../components/ReceiptDialog";
import { API_BASE_URL } from "../../../config/runtime";
import ExpenseDetailsPanel from "../../../components/ExpenseDetailsPanel";

const DEFAULT_MAP_CENTER: [number, number] = [55.751244, 37.618423];
const ExpenseLocationMapPicker = lazy(() => import("../../../components/ExpenseLocationMapPicker"));
type SplitMode = "equal" | "custom";
type ExpenseSortMode =
  | "created_desc"
  | "created_asc"
  | "amount_rub_desc"
  | "amount_rub_asc"
  | "title_asc"
  | "title_desc"
  | "category_asc"
  | "category_desc"
  | "payer_asc"
  | "payer_desc";

type Props = {
  tripId: number;
  trip: TripDetail;
  onAfterChange?: () => Promise<void> | void; // чтобы родитель мог reload balance/stats/etc.
  onError: (msg: string) => void;
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

function toTimestamp(value: string | null | undefined) {
  if (!value) return 0;
  const ts = Date.parse(value);
  return Number.isFinite(ts) ? ts : 0;
}

function toSortAmountRub(ex: Expense) {
  const rub = Number(ex.amount_rub);
  if (Number.isFinite(rub)) return rub;
  const base = Number(ex.amount);
  return Number.isFinite(base) ? base : 0;
}

export default function ExpensesSection({ tripId, trip, onAfterChange, onError }: Props) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [currencies, setCurrencies] = useState<Currency[]>([]);

  // Create expense form
  const [formTitle, setFormTitle] = useState("");
  const [formAmount, setFormAmount] = useState<string>("");
  const [formCategoryId, setFormCategoryId] = useState<number | "">("");
  const [formCurrency, setFormCurrency] = useState<string>("RUB");
  const [formSplitMode, setFormSplitMode] = useState<SplitMode>("equal");
  const [formShareUserIds, setFormShareUserIds] = useState<number[]>([]);
  const [formShareAmounts, setFormShareAmounts] = useState<Record<number, string>>({});
  const [expenseSortMode, setExpenseSortMode] = useState<ExpenseSortMode>("created_desc");
  const [formLat, setFormLat] = useState<number | null>(null);
  const [formLng, setFormLng] = useState<number | null>(null);
  const [mapCenter, setMapCenter] = useState<[number, number]>(DEFAULT_MAP_CENTER);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [expensePage, setExpensePage] = useState(0);
  const [expenseRowsPerPage, setExpenseRowsPerPage] = useState(10);

  // Edit dialog
  const [editOpen, setEditOpen] = useState(false);
  const [selectedExpense, setSelectedExpense] = useState<Expense | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [detailsExpense, setDetailsExpense] = useState<Expense | null>(null);

  // Receipt dialog
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [receiptUrl, setReceiptUrl] = useState<string | null>(null);
  const [receiptTitle, setReceiptTitle] = useState<string>("");
  const [receiptExpenseId, setReceiptExpenseId] = useState<number | null>(null);
  const theme = useTheme();
  const isXs = useMediaQuery(theme.breakpoints.down("sm"));
  const isSm = useMediaQuery(theme.breakpoints.between("sm", "md"));
  const mapHeight = isXs ? 220 : isSm ? 260 : 300;

  const membersById = useMemo(() => {
    const map = new Map<number, { username: string; email: string }>();
    for (const m of trip.members) {
      map.set(m.user.id, { username: m.user.username, email: m.user.email });
    }
    return map;
  }, [trip.members]);

  const tripUsers = useMemo(() => trip.members.map((m) => m.user), [trip.members]);

  useEffect(() => {
    const allIds = tripUsers.map((u) => u.id);
    setFormShareUserIds((prev) => {
      if (prev.length === 0) return allIds;
      return prev.filter((id) => allIds.includes(id));
    });
    setFormShareAmounts((prev) => {
      const next = { ...prev };
      let changed = false;
      allIds.forEach((uid) => {
        if (next[uid] === undefined) {
          next[uid] = "0.00";
          changed = true;
        }
      });
      Object.keys(next).forEach((rawId) => {
        const uid = Number(rawId);
        if (!allIds.includes(uid)) {
          delete next[uid];
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [tripUsers]);

  useEffect(() => {
    setFormShareAmounts((prev) => {
      const next = { ...prev };
      let changed = false;
      formShareUserIds.forEach((uid) => {
        if (next[uid] === undefined) {
          next[uid] = "0.00";
          changed = true;
        }
      });
      Object.keys(next).forEach((rawId) => {
        const uid = Number(rawId);
        if (!formShareUserIds.includes(uid)) {
          delete next[uid];
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [formShareUserIds]);

  const loadLocal = async () => {
    try {
      const [cats, exp] = await Promise.all([listCategories(), listExpenses(tripId)]);
      setCategories(cats);
      setExpenses(exp);
    } catch {
      onError("Не удалось загрузить расходы/категории.");
    }
  };

  useEffect(() => {
    if (!Number.isFinite(tripId)) return;
    loadLocal();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripId]);

  useEffect(() => {
    listCurrencies()
      .then(setCurrencies)
      .catch(() => onError("Не удалось загрузить список валют"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onAddExpense = async (e: React.FormEvent) => {
    e.preventDefault();

    const amountNum = parseDecimal(formAmount);
    const hasLat = formLat !== null;
    const hasLng = formLng !== null;
    const hasCoords = Number.isFinite(formLat) && Number.isFinite(formLng);
    if (!formTitle.trim()) {
      onError("Введите название расхода.");
      return;
    }
    if (!Number.isFinite(amountNum) || amountNum <= 0) {
      onError("Введите корректную сумму > 0.");
      return;
    }
    if (formShareUserIds.length === 0) {
      onError("Выбери хотя бы одного участника для деления расхода.");
      return;
    }
    if (formSplitMode === "custom") {
      const invalidCustomAmount = formShareUserIds.some((uid) => {
        const value = parseDecimal(formShareAmounts[uid] ?? "");
        return !Number.isFinite(value) || value <= 0;
      });
      if (invalidCustomAmount) {
        onError("Для каждого выбранного участника нужно указать сумму > 0.");
        return;
      }

      const customTotal = round2(
        formShareUserIds.reduce((sum, uid) => {
          const value = parseDecimal(formShareAmounts[uid] ?? "");
          return sum + (Number.isFinite(value) ? value : 0);
        }, 0)
      );
      const diff = round2(customTotal - amountNum);
      if (Math.abs(diff) >= 0.01) {
        onError(`Сумма долей (${customTotal.toFixed(2)}) должна быть равна сумме расхода (${amountNum.toFixed(2)}).`);
        return;
      }
    }
    if ((hasLat || hasLng) && !hasCoords) {
      onError("Введите корректные координаты или очистите точку на карте.");
      return;
    }

    setIsSubmitting(true);
    try {
      const payload: {
        title: string;
        amount: number;
        currency: string;
        category_id: number | null;
        lat?: number;
        lng?: number;
        share_user_ids?: number[];
        share_amounts?: { user_id: number; amount: string }[];
      } = {
        title: formTitle.trim(),
        amount: amountNum,
        currency: formCurrency,
        category_id: formCategoryId === "" ? null : formCategoryId,
      };

      if (formSplitMode === "custom") {
        payload.share_amounts = formShareUserIds.map((uid) => ({
          user_id: uid,
          amount: round2(parseDecimal(formShareAmounts[uid] ?? "0")).toFixed(2),
        }));
      } else {
        payload.share_user_ids = formShareUserIds;
      }

      if (hasCoords) {
        payload.lat = formLat;
        payload.lng = formLng;
      }

      await createExpense(tripId, payload);

      setFormTitle("");
      setFormAmount("");
      setFormCategoryId("");
      setFormCurrency("RUB");
      setFormSplitMode("equal");
      setFormShareUserIds(tripUsers.map((u) => u.id));
      setFormShareAmounts({});
      setFormLat(null);
      setFormLng(null);
      setMapCenter(DEFAULT_MAP_CENTER);

      await loadLocal();
      if (onAfterChange) await onAfterChange();
    } catch (e: any) {
      const data = e?.response?.data;
      const message =
        data?.detail ||
        data?.non_field_errors?.[0] ||
        data?.amount?.[0] ||
        data?.currency?.[0] ||
        data?.category_id?.[0] ||
        data?.share_amounts?.[0] ||
        data?.share_user_ids?.[0] ||
        data?.lat?.[0] ||
        data?.lng?.[0] ||
        "Не удалось добавить расход. Проверь данные и попробуй снова.";
      onError(String(message));
    } finally {
      setIsSubmitting(false);
    }
  };

  const onDeleteExpense = async (expenseId: number) => {
    if (!window.confirm("Удалить расход?")) return;
    try {
      await deleteExpense(tripId, expenseId);
      await loadLocal();
      if (onAfterChange) await onAfterChange();
    } catch {
      onError("Не удалось удалить расход.");
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

  const onOpenDetails = (expense: Expense) => {
    setDetailsExpense(expense);
    setDetailsOpen(true);
  };

  const onCloseDetails = () => {
    setDetailsOpen(false);
    setDetailsExpense(null);
  };

  const onUploadReceipt = async (ex: Expense, file: File, inputEl: HTMLInputElement) => {
    try {
      await uploadExpenseReceipt(tripId, ex.id, file);
      await loadLocal();
      if (onAfterChange) await onAfterChange();
    } catch {
      onError("Не удалось загрузить чек.");
    } finally {
      // чтобы можно было выбрать тот же файл повторно
      inputEl.value = "";
    }
  };

  const onOpenReceipt = (ex: Expense) => {
    if (!ex.receipt) return;
    setReceiptTitle(ex.title);
    setReceiptUrl(toAbsUrl(ex.receipt)); // делаем абсолютный URL
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
    if (!window.confirm("Удалить чек у расхода?")) return;

    try {
      await deleteExpenseReceipt(tripId, receiptExpenseId);
      onCloseReceipt();
      await loadLocal();
      if (onAfterChange) await onAfterChange();
    } catch {
      onError("Не удалось удалить чек.");
    }
  };

  const onDownloadReceiptFromDialog = () => {
    if (!receiptUrl) return;
    downloadReceipt(receiptUrl, guessFilename(receiptUrl, "receipt.jpg"));
  };

  const selectedPoint =
    formLat !== null && formLng !== null ? ([formLat, formLng] as [number, number]) : null;

  const formAmountNum = parseDecimal(formAmount);
  const formCustomTotal = round2(
    formShareUserIds.reduce((sum, uid) => {
      const value = parseDecimal(formShareAmounts[uid] ?? "");
      return sum + (Number.isFinite(value) ? value : 0);
    }, 0)
  );
  const formCustomDiff = round2(formCustomTotal - (Number.isFinite(formAmountNum) ? formAmountNum : 0));

  const toggleFormShareUser = (uid: number) => {
    setFormShareUserIds((prev) => (prev.includes(uid) ? prev.filter((x) => x !== uid) : [...prev, uid]));
  };

  const sortedExpenses = useMemo(() => {
    const list = [...expenses];
    list.sort((a, b) => {
      switch (expenseSortMode) {
        case "created_asc":
          return toTimestamp(a.created_at) - toTimestamp(b.created_at);
        case "amount_rub_desc":
          return toSortAmountRub(b) - toSortAmountRub(a);
        case "amount_rub_asc":
          return toSortAmountRub(a) - toSortAmountRub(b);
        case "title_asc":
          return a.title.localeCompare(b.title, "ru-RU", { sensitivity: "base" });
        case "title_desc":
          return b.title.localeCompare(a.title, "ru-RU", { sensitivity: "base" });
        case "category_asc":
          return (a.category?.name ?? "Без категории").localeCompare(b.category?.name ?? "Без категории", "ru-RU", {
            sensitivity: "base",
          });
        case "category_desc":
          return (b.category?.name ?? "Без категории").localeCompare(a.category?.name ?? "Без категории", "ru-RU", {
            sensitivity: "base",
          });
        case "payer_asc":
          return a.created_by.username.localeCompare(b.created_by.username, "ru-RU", { sensitivity: "base" });
        case "payer_desc":
          return b.created_by.username.localeCompare(a.created_by.username, "ru-RU", { sensitivity: "base" });
        case "created_desc":
        default:
          return toTimestamp(b.created_at) - toTimestamp(a.created_at);
      }
    });
    return list;
  }, [expenses, expenseSortMode]);

  useEffect(() => {
    setExpensePage(0);
  }, [expenseSortMode, tripId]);

  useEffect(() => {
    const maxPage = Math.max(0, Math.ceil(sortedExpenses.length / expenseRowsPerPage) - 1);
    if (expensePage > maxPage) {
      setExpensePage(maxPage);
    }
  }, [sortedExpenses.length, expenseRowsPerPage, expensePage]);

  const visibleExpenses = useMemo(() => {
    const start = expensePage * expenseRowsPerPage;
    return sortedExpenses.slice(start, start + expenseRowsPerPage);
  }, [sortedExpenses, expensePage, expenseRowsPerPage]);

  return (
    <>
      <Paper sx={{ p: 2, mb: 3 }}>
        <Typography variant="h6" gutterBottom>
          Расходы
        </Typography>

        {/* Форма добавления */}
        <Box component="form" onSubmit={onAddExpense} sx={{ mb: 2 }}>
          <Stack direction={{ xs: "column", lg: "row" }} spacing={2}>
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
              InputProps={{
                endAdornment: <InputAdornment position="end">{formCurrency}</InputAdornment>,
              }}
            />

            <Autocomplete
              options={currencies}
              sx={{ width: { xs: "100%", sm: 260, lg: 300 } }}
              autoHighlight
              value={currencies.find((c) => c.code === formCurrency) ?? null}
              onChange={(_, newValue) => setFormCurrency(newValue?.code ?? "RUB")}
              getOptionLabel={(option) => `${option.code} — ${option.name}`}
              isOptionEqualToValue={(option, value) => option.code === value.code}
              renderInput={(params) => (
                <TextField {...params} label="Валюта" placeholder="Начни вводить: USD, EUR..." />
              )}
            />

            <TextField
              select
              label="Категория"
              value={formCategoryId}
              onChange={(e) => {
                const v = e.target.value;
                setFormCategoryId(v === "" ? "" : Number(v));
              }}
              sx={{ width: { xs: "100%", sm: 220 } }}
            >
              <MenuItem value="">Без категории</MenuItem>
              {categories.map((c) => (
                <MenuItem key={c.id} value={c.id}>
                  {c.name}
                </MenuItem>
              ))}
            </TextField>

            <Button
              type="submit"
              variant="contained"
              disabled={isSubmitting}
              sx={{ width: { xs: "100%", lg: "auto" } }}
            >
              Добавить
            </Button>
          </Stack>

          <Box sx={{ mt: 2 }}>
            <Typography variant="subtitle1">На кого делим</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              Выбери участников и способ деления расхода.
            </Typography>

            <TextField
              select
              label="Способ деления"
              value={formSplitMode}
              onChange={(e) => setFormSplitMode(e.target.value as SplitMode)}
              sx={{ width: { xs: "100%", sm: 320 }, mb: 1 }}
            >
              <MenuItem value="equal">Поровну между выбранными</MenuItem>
              <MenuItem value="custom">Кастомно по суммам</MenuItem>
            </TextField>

            <Box display="flex" flexWrap="wrap">
              {tripUsers.map((u) => (
                <FormControlLabel
                  key={u.id}
                  control={
                    <Checkbox
                      checked={formShareUserIds.includes(u.id)}
                      onChange={() => toggleFormShareUser(u.id)}
                    />
                  }
                  label={`${u.username} (${u.email})`}
                />
              ))}
            </Box>

            {formSplitMode === "custom" ? (
              <Box sx={{ mt: 1 }}>
                <Stack direction={{ xs: "column", sm: "row" }} spacing={1} alignItems={{ xs: "stretch", sm: "center" }}>
                  <Typography variant="subtitle2">Сумма по участникам</Typography>
                  <Button
                    size="small"
                    variant="text"
                    disabled={formShareUserIds.length === 0}
                    onClick={() => {
                      const even = buildEvenSplit(Number.isFinite(formAmountNum) ? formAmountNum : 0, formShareUserIds);
                      setFormShareAmounts((prev) => ({ ...prev, ...even }));
                    }}
                  >
                    Распределить поровну
                  </Button>
                </Stack>

                <Stack spacing={1} sx={{ mt: 1 }}>
                  {tripUsers
                    .filter((u) => formShareUserIds.includes(u.id))
                    .map((u) => (
                      <TextField
                        key={u.id}
                        label={`${u.username} (${u.email})`}
                        value={formShareAmounts[u.id] ?? ""}
                        onChange={(e) =>
                          setFormShareAmounts((prev) => ({ ...prev, [u.id]: e.target.value }))
                        }
                        InputProps={{
                          endAdornment: <InputAdornment position="end">{formCurrency}</InputAdornment>,
                        }}
                        fullWidth
                      />
                    ))}
                </Stack>

                <Typography color={Math.abs(formCustomDiff) < 0.01 ? "success.main" : "warning.main"} sx={{ mt: 1 }}>
                  Итого по долям: {formCustomTotal.toFixed(2)} {formCurrency} {Math.abs(formCustomDiff) < 0.01 ? "" : `(разница ${formCustomDiff.toFixed(2)})`}
                </Typography>
              </Box>
            ) : null}
          </Box>

          <Box sx={{ mt: 2 }}>
            <Typography variant="subtitle1" gutterBottom>
              Точка расхода на карте
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
              Нажми на карту, чтобы выбрать место расхода. Поле можно оставить пустым.
            </Typography>

            <Suspense fallback={<Paper variant="outlined" sx={{ height: mapHeight, display: "grid", placeItems: "center" }}><Typography color="text.secondary">Загрузка карты…</Typography></Paper>}>
              <ExpenseLocationMapPicker
                center={mapCenter}
                selectedPoint={selectedPoint}
                height={mapHeight}
                onPickPoint={(lat, lng) => {
                  setFormLat(lat);
                  setFormLng(lng);
                  setMapCenter([lat, lng]);
                }}
              />
            </Suspense>

            <Stack direction={{ xs: "column", sm: "row" }} spacing={2} sx={{ mt: 1.5 }}>
              <TextField
                label="Широта"
                value={formLat ?? ""}
                onChange={(e) => setFormLat(e.target.value === "" ? null : Number(e.target.value))}
                fullWidth
              />
              <TextField
                label="Долгота"
                value={formLng ?? ""}
                onChange={(e) => setFormLng(e.target.value === "" ? null : Number(e.target.value))}
                fullWidth
              />
              <Button
                variant="outlined"
                color="inherit"
                onClick={() => {
                  setFormLat(null);
                  setFormLng(null);
                  setMapCenter(DEFAULT_MAP_CENTER);
                }}
                sx={{ width: { xs: "100%", sm: "auto" } }}
              >
                Очистить
              </Button>
            </Stack>
          </Box>
        </Box>

        <Divider sx={{ mb: 2 }} />

        {/* Список расходов */}
        <Stack
          direction={{ xs: "column", sm: "row" }}
          justifyContent="space-between"
          alignItems={{ xs: "stretch", sm: "center" }}
          spacing={1.5}
          sx={{ mb: 2 }}
        >
          <Typography variant="subtitle1">Список расходов</Typography>
          <TextField
            select
            label="Сортировка"
            value={expenseSortMode}
            onChange={(e) => setExpenseSortMode(e.target.value as ExpenseSortMode)}
            sx={{ width: { xs: "100%", sm: 320 } }}
            size="small"
          >
            <MenuItem value="created_desc">Сначала новые</MenuItem>
            <MenuItem value="created_asc">Сначала старые</MenuItem>
            <MenuItem value="amount_rub_desc">Сумма (больше → меньше)</MenuItem>
            <MenuItem value="amount_rub_asc">Сумма (меньше → больше)</MenuItem>
            <MenuItem value="title_asc">Название (А → Я)</MenuItem>
            <MenuItem value="title_desc">Название (Я → А)</MenuItem>
            <MenuItem value="category_asc">Категория (А → Я)</MenuItem>
            <MenuItem value="category_desc">Категория (Я → А)</MenuItem>
            <MenuItem value="payer_asc">Кто оплатил (А → Я)</MenuItem>
            <MenuItem value="payer_desc">Кто оплатил (Я → А)</MenuItem>
          </TextField>
        </Stack>

        <Box display="flex" flexDirection="column" gap={1}>
          {visibleExpenses.map((ex) => {
            const receiptAbs = ex.receipt ? toAbsUrl(ex.receipt) : null;

            return (
              <Paper key={ex.id} variant="outlined" sx={{ p: 1.5 }}>
                <Box
                  display="flex"
                  flexDirection={{ xs: "column", sm: "row" }}
                  justifyContent="space-between"
                  alignItems={{ xs: "flex-start", sm: "center" }}
                  gap={1.5}
                >
                  <Box sx={{ minWidth: 0 }}>
                    <Button
                      variant="text"
                      onClick={() => onOpenDetails(ex)}
                      sx={{
                        p: "2px 6px",
                        m: "-2px -6px 0",
                        minWidth: 0,
                        textTransform: "none",
                        fontSize: "1rem",
                        fontWeight: 700,
                        color: "primary.main",
                        justifyContent: "flex-start",
                        alignSelf: "flex-start",
                        textDecoration: "underline",
                        textDecorationStyle: "dotted",
                        textUnderlineOffset: "3px",
                        borderRadius: 1,
                        "&:hover": {
                          textDecorationStyle: "solid",
                          backgroundColor: "action.hover",
                        },
                      }}
                    >
                      {ex.title}
                    </Button>

                    <Typography variant="body2" color="text.secondary" sx={{ wordBreak: "break-word" }}>
                      {ex.category ? ex.category.name : "Без категории"} • оплатил: {ex.created_by.username}
                    </Typography>

                    {ex.shares?.length ? (
                      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                        Делится на:{" "}
                        {ex.shares
                          .map((s) => membersById.get(s.user.id)?.username ?? s.user.username)
                          .join(", ")}
                      </Typography>
                    ) : null}

                    <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                      Чек: {ex.receipt ? "прикреплён" : "нет"}
                    </Typography>
                  </Box>

                  <Box display="flex" alignItems="center" gap={1} flexWrap="wrap" width={{ xs: "100%", sm: "auto" }}>
                    <Typography fontWeight={700} sx={{ whiteSpace: "nowrap", mr: { xs: "auto", sm: 0 } }}>
                      {ex.amount} {ex.currency}
                      {ex.amount_rub && ex.currency.toUpperCase() !== "RUB" ? ` (≈ ${ex.amount_rub} RUB)` : ""}
                    </Typography>

                    {/* Upload receipt */}
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

                    {/* View/download receipt */}
                    {receiptAbs ? (
                      <>
                        <IconButton size="small" onClick={() => onOpenReceipt(ex)} aria-label="view-receipt">
                          <ImageIcon fontSize="small" />
                        </IconButton>

                        <IconButton
                          size="small"
                          onClick={() => downloadReceipt(receiptAbs, guessFilename(receiptAbs, `receipt_${ex.id}.jpg`))}
                          aria-label="download-receipt"
                        >
                          <DownloadIcon fontSize="small" />
                        </IconButton>
                      </>
                    ) : null}

                    {/* Edit / Delete */}
                    <IconButton size="small" onClick={() => onOpenEdit(ex)} aria-label="edit-expense">
                      <EditIcon fontSize="small" />
                    </IconButton>

                    <IconButton size="small" onClick={() => onDeleteExpense(ex.id)} aria-label="delete-expense">
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </Box>
                </Box>
              </Paper>
            );
          })}

          {sortedExpenses.length === 0 ? (
            <Typography color="text.secondary">Пока нет расходов. Добавь первый 🙂</Typography>
          ) : null}
        </Box>

        {sortedExpenses.length > 0 ? (
          <TablePagination
            component="div"
            count={sortedExpenses.length}
            page={expensePage}
            onPageChange={(_, page) => setExpensePage(page)}
            rowsPerPage={expenseRowsPerPage}
            onRowsPerPageChange={(event) => {
              setExpenseRowsPerPage(parseInt(event.target.value, 10));
              setExpensePage(0);
            }}
            rowsPerPageOptions={[10, 20, 50]}
            labelRowsPerPage="Расходов на странице:"
            labelDisplayedRows={({ from, to, count }) => `${from}–${to} из ${count}`}
          />
        ) : null}
      </Paper>

      {/* Edit dialog */}
      <ExpenseEditDialog
        open={editOpen}
        onClose={onCloseEdit}
        tripId={tripId}
        trip={trip}
        categories={categories}
        expense={selectedExpense}
        onSaved={async () => {
          await loadLocal();
          if (onAfterChange) await onAfterChange();
        }}
      />

      {/* Receipt dialog */}
      <ReceiptDialog
        open={receiptOpen}
        title={receiptTitle}
        url={receiptUrl}
        onClose={onCloseReceipt}
        onDownload={onDownloadReceiptFromDialog}
        onDelete={receiptUrl ? onDeleteReceipt : undefined}
      />

      <Dialog open={detailsOpen} onClose={onCloseDetails} maxWidth="md" fullWidth>
        <DialogTitle>Детали расхода</DialogTitle>
        <DialogContent dividers>{detailsExpense ? <ExpenseDetailsPanel expense={detailsExpense} /> : null}</DialogContent>
        <DialogActions>
          <Button onClick={onCloseDetails}>Закрыть</Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
