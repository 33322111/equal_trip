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
  Alert,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider";
import { AdapterDateFns } from "@mui/x-date-pickers/AdapterDateFns";
import { DatePicker } from "@mui/x-date-pickers/DatePicker";
import { TimeField } from "@mui/x-date-pickers/TimeField";
import ruLocale from "date-fns/locale/ru";

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
import { extractApiErrorMessage } from "../../../utils/errorMessages";

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
  onAfterChange?: () => Promise<void> | void;
  onExpensesChange?: (expenses: Expense[]) => void;
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

function formatDateOnlyValue(value: string | null | undefined) {
  if (!value) return null;
  const parts = value.split("-").map(Number);
  if (parts.length !== 3 || parts.some((part) => !Number.isFinite(part))) return null;
  const [year, month, day] = parts;
  return new Intl.DateTimeFormat("ru-RU", {
    dateStyle: "medium",
  }).format(new Date(year, month - 1, day));
}

function formatExpenseDateShort(
  value: string | null | undefined,
  includeTime = true,
  localDate?: string | null,
) {
  if (!includeTime && localDate) {
    return formatDateOnlyValue(localDate);
  }
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
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

function todayDateInputValue() {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function toLocalDateFieldValue(value: string | null | undefined) {
  if (!value) return null;
  const parts = value.split("-").map(Number);
  if (parts.length !== 3 || parts.some((part) => !Number.isFinite(part))) return null;
  const [year, month, day] = parts;
  return new Date(year, month - 1, day);
}

function fromLocalDateFieldValue(value: Date | null) {
  if (!value || Number.isNaN(value.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
}

function toLocalTimeFieldValue(value: string | null | undefined) {
  if (!value) return null;
  const [hRaw, mRaw] = value.split(":");
  const h = Number(hRaw);
  const m = Number(mRaw);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  const date = new Date();
  date.setHours(h, m, 0, 0);
  return date;
}

function fromLocalTimeFieldValue(value: Date | null) {
  if (!value || Number.isNaN(value.getTime())) return "";
  return `${String(value.getHours()).padStart(2, "0")}:${String(value.getMinutes()).padStart(2, "0")}`;
}

function extractErrorMessage(error: any, fallback: string) {
  return extractApiErrorMessage(error, fallback, [
    "receipt",
    "amount",
    "currency",
    "spent_date",
    "spent_time",
    "spent_at",
    "category_id",
    "share_amounts",
    "share_user_ids",
    "lat",
    "lng",
  ]);
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

function isPdfUrl(url: string) {
  return url.split("?")[0].toLowerCase().endsWith(".pdf");
}

function toSortAmountRub(ex: Expense) {
  const rub = Number(ex.amount_rub);
  if (Number.isFinite(rub)) return rub;
  const base = Number(ex.amount);
  return Number.isFinite(base) ? base : 0;
}

function mergeExpense(prevExpense: Expense, nextExpense: Expense) {
  return {
    ...prevExpense,
    ...nextExpense,
    created_by: nextExpense.created_by ?? prevExpense.created_by,
    category: nextExpense.category === undefined ? prevExpense.category : nextExpense.category,
    shares: nextExpense.shares ?? prevExpense.shares,
    receipt: nextExpense.receipt === undefined ? prevExpense.receipt : nextExpense.receipt,
  };
}

export default function ExpensesSection({ tripId, trip, onAfterChange, onExpensesChange, onError }: Props) {
  const maxSpentDate = useMemo(() => toLocalDateFieldValue(todayDateInputValue()), []);
  const [categories, setCategories] = useState<Category[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [currencies, setCurrencies] = useState<Currency[]>([]);

  // Create expense form
  const [formTitle, setFormTitle] = useState("");
  const [formAmount, setFormAmount] = useState<string>("");
  const [formCategoryId, setFormCategoryId] = useState<number | "">("");
  const [formCurrency, setFormCurrency] = useState<string>("RUB");
  const [formSpentDate, setFormSpentDate] = useState<string>("");
  const [formSpentTime, setFormSpentTime] = useState<string>("");
  const [formSplitMode, setFormSplitMode] = useState<SplitMode>("equal");
  const [formShareUserIds, setFormShareUserIds] = useState<number[]>([]);
  const [formShareAmounts, setFormShareAmounts] = useState<Record<number, string>>({});
  const [expenseSortMode, setExpenseSortMode] = useState<ExpenseSortMode>("created_desc");
  const [formLat, setFormLat] = useState<number | null>(null);
  const [formLng, setFormLng] = useState<number | null>(null);
  const [formReceiptFile, setFormReceiptFile] = useState<File | null>(null);
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
  const [uploadingReceiptIds, setUploadingReceiptIds] = useState<number[]>([]);
  const [sectionError, setSectionError] = useState<string | null>(null);
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

  useEffect(() => {
    if (!Number.isFinite(tripId)) return;
    Promise.all([listCategories(), listExpenses(tripId)])
      .then(([cats, exp]) => {
        setCategories(cats);
        replaceExpenses(exp);
      })
      .catch(() => onError("Не удалось загрузить расходы/категории."));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripId]);

  useEffect(() => {
    listCurrencies()
      .then(setCurrencies)
      .catch(() => onError("Не удалось загрузить список валют"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refreshRelatedDataInBackground = () => {
    if (!onAfterChange) return;
    void Promise.resolve(onAfterChange()).catch(() => {
      onError("Не удалось обновить баланс и статистику после изменения расхода.");
    });
  };

  const reportSectionError = (message: string) => {
    setSectionError(message);
  };

  const replaceExpenses = (nextExpenses: Expense[]) => {
    setExpenses(nextExpenses);
    onExpensesChange?.(nextExpenses);
  };

  const updateExpenses = (updater: (prev: Expense[]) => Expense[]) => {
    setExpenses((prev) => {
      const next = updater(prev);
      onExpensesChange?.(next);
      return next;
    });
  };

  const mergeExpenseIntoList = (nextExpense: Expense) => {
    setSelectedExpense((prev) => (prev && prev.id === nextExpense.id ? mergeExpense(prev, nextExpense) : prev));
    setDetailsExpense((prev) => (prev && prev.id === nextExpense.id ? mergeExpense(prev, nextExpense) : prev));
    updateExpenses((prev) =>
      prev.map((expense) => (expense.id === nextExpense.id ? mergeExpense(expense, nextExpense) : expense))
    );
  };

  const markReceiptUploading = (expenseId: number) => {
    setUploadingReceiptIds((prev) => (prev.includes(expenseId) ? prev : [...prev, expenseId]));
  };

  const unmarkReceiptUploading = (expenseId: number) => {
    setUploadingReceiptIds((prev) => prev.filter((id) => id !== expenseId));
  };

  const onAddExpense = async (e: React.FormEvent) => {
    e.preventDefault();

    const amountNum = parseDecimal(formAmount);
    const hasLat = formLat !== null;
    const hasLng = formLng !== null;
    const hasCoords = Number.isFinite(formLat) && Number.isFinite(formLng);
    if (!formTitle.trim()) {
      reportSectionError("Введите название расхода.");
      return;
    }
    if (!Number.isFinite(amountNum) || amountNum <= 0) {
      reportSectionError("Введите корректную сумму > 0.");
      return;
    }
    if (formShareUserIds.length === 0) {
      reportSectionError("Выбери хотя бы одного участника для деления расхода.");
      return;
    }
    if (formSplitMode === "custom") {
      const invalidCustomAmount = formShareUserIds.some((uid) => {
        const value = parseDecimal(formShareAmounts[uid] ?? "");
        return !Number.isFinite(value) || value <= 0;
      });
      if (invalidCustomAmount) {
        reportSectionError("Для каждого выбранного участника нужно указать сумму > 0.");
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
        reportSectionError(
          `Сумма долей (${customTotal.toFixed(2)}) должна быть равна сумме расхода (${amountNum.toFixed(2)}).`
        );
        return;
      }
    }
    if ((hasLat || hasLng) && !hasCoords) {
      reportSectionError("Введите корректные координаты или очистите точку на карте.");
      return;
    }

    setIsSubmitting(true);
    setSectionError(null);
    try {
      const payload: {
        title: string;
        amount: number;
        currency: string;
        spent_date?: string | null;
        spent_time?: string | null;
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
        spent_date: formSpentDate || null,
        spent_time: formSpentDate && formSpentTime ? formSpentTime : null,
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

      const receiptFile = formReceiptFile;
      const nextExpense = await createExpense(tripId, payload);

      setFormTitle("");
      setFormAmount("");
      setFormCategoryId("");
      setFormCurrency("RUB");
      setFormSpentDate("");
      setFormSpentTime("");
      setFormSplitMode("equal");
      setFormShareUserIds(tripUsers.map((u) => u.id));
      setFormShareAmounts({});
      setFormLat(null);
      setFormLng(null);
      setFormReceiptFile(null);
      setMapCenter(DEFAULT_MAP_CENTER);

      updateExpenses((prev) => [nextExpense, ...prev]);
      refreshRelatedDataInBackground();

      if (receiptFile) {
        markReceiptUploading(nextExpense.id);
        void uploadExpenseReceipt(tripId, nextExpense.id, receiptFile)
          .then((expenseWithReceipt) => {
            mergeExpenseIntoList(expenseWithReceipt);
            unmarkReceiptUploading(nextExpense.id);
            setSectionError(null);
          })
          .catch((e: any) => {
            unmarkReceiptUploading(nextExpense.id);
            const message = extractErrorMessage(e, "Расход добавлен, но чек загрузить не удалось.");
            reportSectionError(String(message));
          });
      }
    } catch (e: any) {
      const message = extractErrorMessage(e, "Не удалось добавить расход. Проверь данные и попробуй снова.");
      reportSectionError(String(message));
    } finally {
      setIsSubmitting(false);
    }
  };

  const onDeleteExpense = async (expenseId: number) => {
    if (!window.confirm("Удалить расход?")) return;
    try {
      await deleteExpense(tripId, expenseId);
      updateExpenses((prev) => prev.filter((expense) => expense.id !== expenseId));
      refreshRelatedDataInBackground();
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
    markReceiptUploading(ex.id);
    try {
      const updatedExpense = await uploadExpenseReceipt(tripId, ex.id, file);
      mergeExpenseIntoList(updatedExpense);
      setSectionError(null);
    } catch (e: any) {
      const message = extractErrorMessage(e, "Не удалось загрузить чек.");
      reportSectionError(String(message));
    } finally {
      unmarkReceiptUploading(ex.id);
      // чтобы можно было выбрать тот же файл повторно
      inputEl.value = "";
    }
  };

  const onOpenReceipt = (ex: Expense) => {
    if (!ex.receipt) return;
    const absoluteReceiptUrl = toAbsUrl(ex.receipt);
    if (isPdfUrl(absoluteReceiptUrl)) {
      window.open(absoluteReceiptUrl, "_blank", "noopener,noreferrer");
      return;
    }
    setReceiptTitle(ex.title);
    setReceiptUrl(absoluteReceiptUrl);
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
      const updatedExpense = await deleteExpenseReceipt(tripId, receiptExpenseId);
      mergeExpenseIntoList(updatedExpense);
      onCloseReceipt();
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
    <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={ruLocale}>
    <>
      <Paper sx={{ p: 2, mb: 3 }}>
        <Typography variant="h6" gutterBottom>
          Расходы
        </Typography>

        {/* Форма добавления */}
        <Box component="form" onSubmit={onAddExpense} sx={{ mb: 2 }}>
          <Box
            sx={{
              display: "grid",
              gap: 2,
              gridTemplateColumns: {
                xs: "minmax(0, 1fr)",
                sm: "repeat(2, minmax(0, 1fr))",
                lg: "minmax(0, 1.4fr) minmax(0, 1fr) minmax(240px, 1fr)",
                xl: "minmax(0, 1.4fr) minmax(0, 1fr) minmax(260px, 1fr) minmax(180px, 0.9fr) auto",
              },
              alignItems: "start",
            }}
          >
            <TextField
              label="Название"
              value={formTitle}
              onChange={(e) => setFormTitle(e.target.value)}
              fullWidth
              required
              sx={{ minWidth: 0 }}
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
              sx={{ minWidth: 0 }}
            />

            <Stack
              direction={{ xs: "column", md: "row" }}
              spacing={1}
              sx={{ minWidth: 0 }}
              alignItems="flex-start"
            >
              <DatePicker
                label="Дата расхода"
                value={toLocalDateFieldValue(formSpentDate)}
                onChange={(value) => {
                  const nextDate = fromLocalDateFieldValue(value);
                  setFormSpentDate(nextDate);
                  if (!nextDate) {
                    setFormSpentTime("");
                  }
                }}
                format="dd.MM.yyyy"
                maxDate={maxSpentDate ?? undefined}
                slotProps={{
                  textField: {
                    sx: { flex: 1, minWidth: 0, width: "100%" },
                  },
                }}
              />
              <TimeField
                label="Время расхода"
                value={toLocalTimeFieldValue(formSpentTime)}
                onChange={(value) => setFormSpentTime(fromLocalTimeFieldValue(value))}
                disabled={!formSpentDate}
                format="HH:mm"
                ampm={false}
                sx={{ flex: 1, minWidth: 0, width: "100%" }}
              />
            </Stack>

            <Autocomplete
              options={currencies}
              sx={{ width: "100%", minWidth: 0 }}
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
              sx={{
                width: "100%",
                minWidth: 0,
                gridColumn: {
                  xs: "auto",
                  sm: "span 2",
                  lg: "span 2",
                  xl: "span 1",
                },
              }}
            >
              <MenuItem value="">Без категории</MenuItem>
              {categories.map((c) => (
                <MenuItem key={c.id} value={c.id}>
                  {c.name}
                </MenuItem>
              ))}
            </TextField>
          </Box>

          <Stack
            direction={{ xs: "column", sm: "row" }}
            spacing={1}
            alignItems={{ xs: "stretch", sm: "center" }}
            sx={{ mt: 1.5 }}
          >
            <Button
              component="label"
              variant="outlined"
              startIcon={<AttachFileIcon />}
              sx={{ width: { xs: "100%", sm: "auto" } }}
            >
              {formReceiptFile ? "Чек выбран" : "Прикрепить чек"}
              <input
                type="file"
                hidden
                accept="image/jpeg,image/png,image/gif,image/webp,application/pdf,.pdf"
                onChange={(e) => {
                  const file = e.target.files?.[0] ?? null;
                  setSectionError(null);
                  setFormReceiptFile(file);
                  e.currentTarget.value = "";
                }}
              />
            </Button>

            {formReceiptFile ? (
              <Button
                variant="outlined"
                color="inherit"
                onClick={() => setFormReceiptFile(null)}
                sx={{
                  width: { xs: "100%", sm: "auto" },
                  borderColor: "divider",
                  whiteSpace: "nowrap",
                }}
              >
                Убрать чек
              </Button>
            ) : null}

            <Typography variant="body2" color="text.secondary" sx={{ wordBreak: "break-word" }}>
              {formReceiptFile ? formReceiptFile.name : "Чек не выбран"}
            </Typography>
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

            <Stack direction={{ xs: "column", md: "row" }} spacing={2} sx={{ mt: 1.5 }}>
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
                sx={{
                  width: { xs: "100%", md: "auto" },
                  minWidth: { md: 140 },
                  flexShrink: 0,
                  whiteSpace: "nowrap",
                  alignSelf: { xs: "stretch", md: "center" },
                }}
              >
                Очистить
              </Button>
            </Stack>
          </Box>

          <Box
            sx={{
              mt: 3,
              display: "flex",
              justifyContent: { xs: "stretch", sm: "flex-end" },
            }}
          >
            <Button
              type="submit"
              variant="contained"
              disabled={isSubmitting}
              sx={{
                width: { xs: "100%", sm: 240 },
                height: 56,
              }}
            >
              Добавить
            </Button>
          </Box>

          {sectionError ? (
            <Alert severity="error" sx={{ mt: 2, borderRadius: 3 }}>
              {sectionError}
            </Alert>
          ) : null}
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
            const isReceiptUploading = uploadingReceiptIds.includes(ex.id);

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

                    {ex.spent_at || ex.spent_date_local ? (
                      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                        Дата расхода: {formatExpenseDateShort(ex.spent_at, ex.spent_time_known, ex.spent_date_local)}
                      </Typography>
                    ) : null}

                    {ex.shares?.length ? (
                      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                        Делится на:{" "}
                        {ex.shares
                          .map((s) => membersById.get(s.user.id)?.username ?? s.user.username)
                          .join(", ")}
                      </Typography>
                    ) : null}

                    <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                      Чек: {isReceiptUploading ? "загружается..." : ex.receipt ? "прикреплён" : "нет"}
                    </Typography>
                  </Box>

                  <Box display="flex" alignItems="center" gap={1} flexWrap="wrap" width={{ xs: "100%", sm: "auto" }}>
                    <Typography fontWeight={700} sx={{ whiteSpace: "nowrap", mr: { xs: "auto", sm: 0 } }}>
                      {ex.amount} {ex.currency}
                      {ex.amount_rub && ex.currency.toUpperCase() !== "RUB" ? ` (≈ ${ex.amount_rub} RUB)` : ""}
                    </Typography>

                    {/* Upload receipt */}
                    <IconButton size="small" component="label" aria-label="upload-receipt" disabled={isReceiptUploading}>
                      <AttachFileIcon fontSize="small" />
                      <input
                        type="file"
                        hidden
                        accept="image/jpeg,image/png,image/gif,image/webp,application/pdf,.pdf"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          setSectionError(null);
                          onUploadReceipt(ex, file, e.currentTarget);
                        }}
                      />
                    </IconButton>

                    {/* View/download receipt */}
                    {receiptAbs && !isReceiptUploading ? (
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
        onSaved={async (updatedExpense) => {
          mergeExpenseIntoList(updatedExpense);
          refreshRelatedDataInBackground();
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
    </LocalizationProvider>
  );
}
