import React, { useEffect, useMemo, useRef, useState } from "react";
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
} from "@mui/material";
import { YMaps, Map as YandexMap, Placemark, SearchControl } from "@pbe/react-yandex-maps";

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

const API_BASE_URL = "http://localhost:8000";
const DEFAULT_MAP_CENTER: [number, number] = [55.751244, 37.618423];

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

export default function ExpensesSection({ tripId, trip, onAfterChange, onError }: Props) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [currencies, setCurrencies] = useState<Currency[]>([]);

  // Create expense form
  const [formTitle, setFormTitle] = useState("");
  const [formAmount, setFormAmount] = useState<string>("");
  const [formCategoryId, setFormCategoryId] = useState<number | "">("");
  const [formCurrency, setFormCurrency] = useState<string>("RUB");
  const [formLat, setFormLat] = useState<number | null>(null);
  const [formLng, setFormLng] = useState<number | null>(null);
  const [mapCenter, setMapCenter] = useState<[number, number]>(DEFAULT_MAP_CENTER);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const searchControlRef = useRef<any>(null);

  // Edit dialog
  const [editOpen, setEditOpen] = useState(false);
  const [selectedExpense, setSelectedExpense] = useState<Expense | null>(null);

  // Receipt dialog
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [receiptUrl, setReceiptUrl] = useState<string | null>(null);
  const [receiptTitle, setReceiptTitle] = useState<string>("");
  const [receiptExpenseId, setReceiptExpenseId] = useState<number | null>(null);

  const membersById = useMemo(() => {
    const map = new Map<number, { username: string; email: string }>();
    for (const m of trip.members) {
      map.set(m.user.id, { username: m.user.username, email: m.user.email });
    }
    return map;
  }, [trip.members]);

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

    const amountNum = Number(formAmount);
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
      } = {
        title: formTitle.trim(),
        amount: amountNum,
        currency: formCurrency,
        category_id: formCategoryId === "" ? null : formCategoryId,
      };

      if (hasCoords) {
        payload.lat = formLat;
        payload.lng = formLng;
      }

      await createExpense(tripId, payload);

      setFormTitle("");
      setFormAmount("");
      setFormCategoryId("");
      setFormCurrency("RUB");
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

  return (
    <>
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
              InputProps={{
                endAdornment: <InputAdornment position="end">{formCurrency}</InputAdornment>,
              }}
            />

            <Autocomplete
              options={currencies}
              sx={{ minWidth: 320 }}
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

          <Box sx={{ mt: 2 }}>
            <Typography variant="subtitle1" gutterBottom>
              Точка расхода на карте
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
              Нажми на карту, чтобы выбрать место расхода. Поле можно оставить пустым.
            </Typography>

            <YMaps query={{ apikey: import.meta.env.VITE_YMAPS_API_KEY }}>
              <YandexMap
                state={{ center: mapCenter, zoom: 10 }}
                width="100%"
                height={260}
                onClick={(event: any) => {
                  const coords = event.get("coords") as number[] | undefined;
                  if (!coords || coords.length < 2) return;
                  const nextLat = Number(coords[0].toFixed(6));
                  const nextLng = Number(coords[1].toFixed(6));
                  setFormLat(nextLat);
                  setFormLng(nextLng);
                  setMapCenter([nextLat, nextLng]);
                }}
              >
                <SearchControl
                  instanceRef={searchControlRef}
                  options={{
                    float: "right",
                    noPlacemark: true,
                    placeholderContent: "Найти адрес или место",
                  }}
                  modules={["control.SearchControl"]}
                  onResultSelect={async (event: any) => {
                    const index = event.get("index");
                    const control = searchControlRef.current;
                    if (!control) return;
                    const result = await control.getResult(index);
                    const coords = result?.geometry?.getCoordinates?.();
                    if (!coords || coords.length < 2) return;
                    const nextLat = Number(coords[0].toFixed(6));
                    const nextLng = Number(coords[1].toFixed(6));
                    setFormLat(nextLat);
                    setFormLng(nextLng);
                    setMapCenter([nextLat, nextLng]);
                  }}
                />
                {selectedPoint ? <Placemark geometry={selectedPoint} /> : null}
              </YandexMap>
            </YMaps>

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
              >
                Очистить
              </Button>
            </Stack>
          </Box>
        </Box>

        <Divider sx={{ mb: 2 }} />

        {/* Список расходов */}
        <Box display="flex" flexDirection="column" gap={1}>
          {expenses.map((ex) => {
            const receiptAbs = ex.receipt ? toAbsUrl(ex.receipt) : null;

            return (
              <Paper key={ex.id} variant="outlined" sx={{ p: 1.5 }}>
                <Box display="flex" justifyContent="space-between" alignItems="center" gap={2}>
                  <Box sx={{ minWidth: 0 }}>
                    <Typography fontWeight={600} noWrap>
                      {ex.title}
                    </Typography>

                    <Typography variant="body2" color="text.secondary" noWrap>
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

                  <Box display="flex" alignItems="center" gap={1}>
                    <Typography fontWeight={700} sx={{ whiteSpace: "nowrap" }}>
                      {ex.amount} {ex.currency}
                      {ex.amount_rub ? ` (≈ ${ex.amount_rub} RUB)` : ""}
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

          {expenses.length === 0 ? (
            <Typography color="text.secondary">Пока нет расходов. Добавь первый 🙂</Typography>
          ) : null}
        </Box>
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
    </>
  );
}
