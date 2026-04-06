import React, { useEffect, useRef, useState } from "react";
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
  TextField,
  IconButton,
  Stack,
  CircularProgress,
  Avatar,
  Collapse,
} from "@mui/material";

import EditIcon from "@mui/icons-material/Edit";
import PersonAddIcon from "@mui/icons-material/PersonAdd";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";

import Autocomplete from "@mui/material/Autocomplete";

import { useParams, useNavigate } from "react-router-dom";

import {
  createInvite,
  getTrip,
  TripDetail,
  updateTrip,
  removeTripMember,
  leaveTrip,
  addTripMember,
} from "../api/trips";

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

import ItinerarySection from "./trip/sections/ItinerarySection";
import ChecklistSection from "./trip/sections/ChecklistSection";
import ExpensesSection from "./trip/sections/ExpensesSection";
import BalanceSettlementsSection from "./trip/sections/BalanceSettlementsSection";

import { listSettlements, Settlement } from "../api/settlements";

import ReceiptDialog from "../components/ReceiptDialog";

import { searchUsers } from "../api/users";

const API_BASE_URL = "http://localhost:8000";
const toAbsUrl = (url: string) => (url.startsWith("http") ? url : `${API_BASE_URL}${url}`);

type UserShort = {
  id: number;
  username: string;
  email: string;
  avatar?: string | null;
};

type SectionKey =
  | "members"
  | "invite"
  | "checklists"
  | "itinerary"
  | "expenses"
  | "map"
  | "balance"
  | "stats"
  | "actions";

function TripSection({
  title,
  collapsed,
  onToggle,
  children,
}: {
  title: string;
  collapsed: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <Paper
      sx={{
        mb: 3,
        px: { xs: 1.5, md: 2 },
        py: 1.5,
        borderRadius: 3,
        border: "1px solid #dbe3ea",
        backgroundColor: "#f8fafc",
        boxShadow: "0 14px 34px rgba(15, 23, 42, 0.06)",
      }}
    >
      <Box display="flex" justifyContent="space-between" alignItems="center" gap={2}>
        <Typography variant="h6">{title}</Typography>
        <Button
          variant="text"
          size="small"
          onClick={onToggle}
          endIcon={collapsed ? <ExpandMoreIcon /> : <ExpandLessIcon />}
          sx={{ color: "#475569", minWidth: 0 }}
        >
          {collapsed ? "Развернуть" : "Свернуть"}
        </Button>
      </Box>

      <Collapse in={!collapsed}>
        <Box
          sx={{
            pt: 2,
            "& > .MuiPaper-root": {
              borderRadius: 3,
              border: "1px solid #e2e8f0",
              boxShadow: "0 10px 24px rgba(15, 23, 42, 0.05)",
            },
          }}
        >
          {children}
        </Box>
      </Collapse>
    </Paper>
  );
}

export default function TripDetailPage() {
  const { id } = useParams();
  const tripId = Number(id);

  const { user } = useAuth();
  const navigate = useNavigate();

  const [trip, setTrip] = useState<TripDetail | null>(null);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);

  const [categories, setCategories] = useState<Category[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [balance, setBalance] = useState<BalanceResponse | null>(null);
  const [stats, setStats] = useState<TripStats | null>(null);
  const [settlements, setSettlements] = useState<Settlement[]>([]);

  const [error, setError] = useState<string | null>(null);

  // Receipt dialog state
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [receiptUrl, setReceiptUrl] = useState<string | null>(null);
  const [receiptTitle, setReceiptTitle] = useState<string>("");
  const [receiptExpenseId, setReceiptExpenseId] = useState<number | null>(null);

  // Edit dates dialog
  const [editDatesOpen, setEditDatesOpen] = useState(false);
  const [editStartDate, setEditStartDate] = useState<string | null>(null);
  const [editEndDate, setEditEndDate] = useState<string | null>(null);
  const [savingDates, setSavingDates] = useState(false);

  // Edit title dialog
  const [editTitleOpen, setEditTitleOpen] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [savingTitle, setSavingTitle] = useState(false);

  // Invite by search
  const [userQuery, setUserQuery] = useState("");
  const [userOptions, setUserOptions] = useState<UserShort[]>([]);
  const [userLoading, setUserLoading] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserShort | null>(null);
  const [addingUser, setAddingUser] = useState(false);
  const searchTimer = useRef<number | null>(null);
  const [collapsedSections, setCollapsedSections] = useState<Record<SectionKey, boolean>>({
    members: false,
    invite: false,
    checklists: false,
    itinerary: false,
    expenses: false,
    map: false,
    balance: false,
    stats: false,
    actions: false,
  });

  const isOwner = trip?.owner?.id === user?.id;

  const formatTripDates = (start: string | null, end: string | null) => {
    if (!start && !end) return null;

    const months = [
      "января",
      "февраля",
      "марта",
      "апреля",
      "мая",
      "июня",
      "июля",
      "августа",
      "сентября",
      "октября",
      "ноября",
      "декабря",
    ];

    const format = (dateStr: string) => {
      const d = new Date(dateStr);
      return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
    };

    if (start && end) {
      const s = new Date(start);
      const e = new Date(end);

      if (s.getFullYear() === e.getFullYear() && s.getMonth() === e.getMonth()) {
        return `${s.getDate()}–${e.getDate()} ${months[s.getMonth()]} ${s.getFullYear()}`;
      }
      return `${format(start)} – ${format(end)}`;
    }

    return start ? format(start) : format(end!);
  };

  const getAvatarSrc = (avatar?: string | null) => {
    if (!avatar) return undefined;
    return toAbsUrl(avatar);
  };

  const toggleSection = (key: SectionKey) => {
    setCollapsedSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

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
    } catch {
      setError("Не удалось загрузить данные поездки.");
    }
  };

  useEffect(() => {
    if (!Number.isFinite(tripId)) return;
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripId]);

  // Leave trip
  const onLeaveTrip = async () => {
    if (!window.confirm("Покинуть поездку?")) return;
    try {
      setError(null);
      await leaveTrip(tripId);
      navigate("/trips");
    } catch {
      setError("Не удалось покинуть поездку.");
    }
  };

  // Remove member
  const onRemoveMember = async (memberId: number, label: string) => {
    if (!window.confirm(`Удалить участника ${label} из поездки?`)) return;

    try {
      setError(null);
      await removeTripMember(tripId, memberId);
      await loadAll();
    } catch (e: any) {
      const msg = e?.response?.data?.detail || "Не удалось удалить участника.";
      setError(String(msg));
    }
  };

  // Invite link
  const onCreateInvite = async () => {
    try {
      setError(null);
      const { token } = await createInvite(tripId);
      const url = `${window.location.origin}/join/${token}`;
      setInviteUrl(url);
      await navigator.clipboard.writeText(url);
    } catch {
      setError("Не удалось создать приглашение.");
    }
  };

  // Search users
  useEffect(() => {
    if (!isOwner) return;

    if (searchTimer.current) window.clearTimeout(searchTimer.current);
    const q = userQuery.trim();

    if (!q) {
      setUserOptions([]);
      return;
    }

    searchTimer.current = window.setTimeout(async () => {
      setUserLoading(true);
      try {
        const res = await searchUsers(q);

        // фильтруем уже добавленных
        const existingUserIds = new Set((trip?.members ?? []).map((m) => m.user.id));
        setUserOptions(res.filter((u: any) => !existingUserIds.has(u.id)));
      } catch {
        setError("Не удалось выполнить поиск пользователей.");
      } finally {
        setUserLoading(false);
      }
    }, 350);

    return () => {
      if (searchTimer.current) window.clearTimeout(searchTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userQuery, isOwner, trip?.members?.length]);

  const onAddMemberBySearch = async () => {
    if (!selectedUser) return;
    try {
      setAddingUser(true);
      setError(null);
      await addTripMember(tripId, selectedUser.id);
      setSelectedUser(null);
      setUserQuery("");
      setUserOptions([]);
      await loadAll();
    } catch (e: any) {
      const msg = e?.response?.data?.detail || "Не удалось добавить участника.";
      setError(String(msg));
    } finally {
      setAddingUser(false);
    }
  };

  // Receipt
  const onOpenReceipt = (ex: Expense) => {
    if (!ex.receipt) return;
    setReceiptTitle(ex.title);
    setReceiptUrl(toAbsUrl(ex.receipt));
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
    const ok = window.confirm("Удалить чек у расхода?");
    if (!ok) return;

    try {
      setError(null);
      await deleteExpenseReceipt(tripId, receiptExpenseId);
      onCloseReceipt();
      await loadAll();
    } catch {
      setError("Не удалось удалить чек.");
    }
  };

  const onDownloadCurrentReceipt = () => {
    if (!receiptUrl) return;
    downloadReceipt(receiptUrl, `receipt_${receiptExpenseId ?? "file"}.jpg`);
  };

  // Edit dates
  const openEditDates = () => {
    if (!trip) return;
    setEditStartDate(trip.start_date);
    setEditEndDate(trip.end_date);
    setEditDatesOpen(true);
  };

  const saveDates = async () => {
    if (!trip) return;

    if (editStartDate && editEndDate && editEndDate < editStartDate) {
      setError("Дата окончания не может быть раньше даты начала.");
      return;
    }

    setSavingDates(true);
    try {
      const updated = await updateTrip(tripId, {
        start_date: editStartDate,
        end_date: editEndDate,
      });

      setTrip((prev) => (prev ? { ...prev, start_date: updated.start_date, end_date: updated.end_date } : prev));
      setEditDatesOpen(false);
    } catch {
      setError("Не удалось обновить даты поездки.");
    } finally {
      setSavingDates(false);
    }
  };

  // Edit title
  const openEditTitle = () => {
    if (!trip) return;
    setEditTitle(trip.title);
    setEditTitleOpen(true);
  };

  const saveTitle = async () => {
    const nextTitle = editTitle.trim();
    if (!nextTitle) {
      setError("Название поездки не может быть пустым.");
      return;
    }

    setSavingTitle(true);
    try {
      const updated = await updateTrip(tripId, { title: nextTitle });
      setTrip((prev) => (prev ? { ...prev, title: updated.title } : prev));
      setEditTitleOpen(false);
    } catch {
      setError("Не удалось обновить название поездки.");
    } finally {
      setSavingTitle(false);
    }
  };

  if (!trip) return <div>Загрузка...</div>;

  return (
    <>
    <Box sx={{ minHeight: "100vh", backgroundColor: "#edf1f5", py: { xs: 3, md: 5 } }}>
      <Container sx={{ mb: 6 }}>
        <Paper
          sx={{
            p: { xs: 2, md: 3 },
            mb: 3,
            borderRadius: 4,
            border: "1px solid #d6dee6",
            background: "linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)",
            boxShadow: "0 18px 40px rgba(15, 23, 42, 0.08)",
          }}
        >
          <Box display="flex" justifyContent="space-between" alignItems="flex-start" gap={2}>
            <Box sx={{ minWidth: 0 }}>
              <Stack direction="row" spacing={1} alignItems="center" sx={{ minWidth: 0 }}>
                <Typography variant="h4" sx={{ wordBreak: "break-word", color: "#0f172a" }}>
                  {trip.title}
                </Typography>

                {isOwner ? (
                  <IconButton size="small" onClick={openEditTitle} aria-label="edit-title">
                    <EditIcon fontSize="small" />
                  </IconButton>
                ) : null}
              </Stack>

              {formatTripDates(trip.start_date, trip.end_date) ? (
                <Typography variant="subtitle1" color="text.secondary">
                  {formatTripDates(trip.start_date, trip.end_date)}
                </Typography>
              ) : null}
            </Box>

            {isOwner ? (
              <Button variant="outlined" size="small" onClick={openEditDates}>
                Редактировать даты
              </Button>
            ) : (
              <Button variant="outlined" color="error" size="small" onClick={onLeaveTrip}>
                Покинуть поездку
              </Button>
            )}
          </Box>
        </Paper>

        {error && (
          <Alert severity="error" sx={{ mb: 2, borderRadius: 3 }}>
            {error}
          </Alert>
        )}

        <TripSection
          title="Участники"
          collapsed={collapsedSections.members}
          onToggle={() => toggleSection("members")}
        >
          <Box sx={{ px: 0.5 }}>
            {trip.members.map((m) => {
              const canRemove = isOwner && m.role === "MEMBER" && m.user.id !== user?.id;
              const avatarSrc = getAvatarSrc(m.user.avatar);
              return (
                <Box
                  key={m.id}
                  display="flex"
                  justifyContent="space-between"
                  alignItems="center"
                  py={0.9}
                  gap={2}
                >
                  <Box display="flex" alignItems="center" gap={1.5} sx={{ minWidth: 0 }}>
                    <Avatar src={avatarSrc} sx={{ width: 36, height: 36 }} />
                    <Box sx={{ minWidth: 0 }}>
                      <Typography noWrap>
                        {m.user.username} ({m.user.email})
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        {m.role === "OWNER" ? "ВЛАДЕЛЕЦ" : "УЧАСТНИК"}
                      </Typography>
                    </Box>
                  </Box>

                  {canRemove ? (
                    <Button
                      color="error"
                      variant="outlined"
                      size="small"
                      onClick={() => onRemoveMember(m.id, m.user.username)}
                    >
                      Удалить
                    </Button>
                  ) : null}
                </Box>
              );
            })}
          </Box>
        </TripSection>

        {isOwner && (
          <TripSection
            title="Приглашение"
            collapsed={collapsedSections.invite}
            onToggle={() => toggleSection("invite")}
          >
            <Stack spacing={2}>
              <Button variant="contained" onClick={onCreateInvite}>
                Сгенерировать ссылку (и скопировать)
              </Button>

              {inviteUrl && (
                <Typography color="text.secondary" sx={{ wordBreak: "break-all" }}>
                  {inviteUrl}
                </Typography>
              )}

              <Autocomplete
                options={userOptions}
                loading={userLoading}
                value={selectedUser}
                inputValue={userQuery}
                onInputChange={(_, v) => setUserQuery(v)}
                onChange={(_, v) => setSelectedUser(v)}
                getOptionLabel={(u) => `${u.username} (${u.email})`}
                isOptionEqualToValue={(a, b) => a.id === b.id}
                noOptionsText={userQuery.trim() ? "Ничего не найдено" : "Начни вводить никнейм"}
                renderOption={(props, option) => (
                  <li {...props} key={option.id}>
                    <Box display="flex" alignItems="center" gap={1.5} sx={{ width: "100%" }}>
                      <Avatar
                        src={getAvatarSrc(option.avatar)}
                        alt={option.username}
                        sx={{ width: 28, height: 28 }}
                        imgProps={{ referrerPolicy: "no-referrer" }}
                      >
                        {option.username.slice(0, 1).toUpperCase()}
                      </Avatar>
                      <Box sx={{ minWidth: 0 }}>
                        <Typography noWrap>{option.username}</Typography>
                        <Typography variant="body2" color="text.secondary" noWrap>
                          {option.email}
                        </Typography>
                      </Box>
                    </Box>
                  </li>
                )}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label="Найти пользователя по никнейму"
                    placeholder="Например: nickname"
                    InputProps={{
                      ...params.InputProps,
                      endAdornment: (
                        <>
                          {userLoading ? <CircularProgress size={18} /> : null}
                          {params.InputProps.endAdornment}
                        </>
                      ),
                    }}
                  />
                )}
              />

              <Button
                variant="outlined"
                startIcon={<PersonAddIcon />}
                disabled={!selectedUser || addingUser}
                onClick={onAddMemberBySearch}
              >
                Добавить в поездку
              </Button>
            </Stack>
          </TripSection>
        )}

        <TripSection
          title="Чек-листы"
          collapsed={collapsedSections.checklists}
          onToggle={() => toggleSection("checklists")}
        >
          <ChecklistSection tripId={tripId} members={trip.members} onError={(msg) => setError(msg)} />
        </TripSection>

        <TripSection
          title="План поездки"
          collapsed={collapsedSections.itinerary}
          onToggle={() => toggleSection("itinerary")}
        >
          <ItinerarySection tripId={tripId} members={trip.members} onError={(msg) => setError(msg)} />
        </TripSection>

        <TripSection
          title="Расходы"
          collapsed={collapsedSections.expenses}
          onToggle={() => toggleSection("expenses")}
        >
          <ExpensesSection
            tripId={tripId}
            trip={trip}
            onError={(msg) => setError(msg)}
            onAfterChange={loadAll}
          />
        </TripSection>

        <TripSection
          title="Карта"
          collapsed={collapsedSections.map}
          onToggle={() => toggleSection("map")}
        >
          <TripMap expenses={expenses} />
        </TripSection>

        <TripSection
          title="Баланс и взаиморасчёты"
          collapsed={collapsedSections.balance}
          onToggle={() => toggleSection("balance")}
        >
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
        </TripSection>

        {stats && (
          <TripSection
            title="Статистика"
            collapsed={collapsedSections.stats}
            onToggle={() => toggleSection("stats")}
          >
            <TripStatsView stats={stats} />
          </TripSection>
        )}

        <TripSection
          title="Действия"
          collapsed={collapsedSections.actions}
          onToggle={() => toggleSection("actions")}
        >
          <Box display="flex" gap={2} flexWrap="wrap">
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
        </TripSection>
      </Container>
    </Box>

      {/* Диалог редактирования названия */}
      <Dialog open={editTitleOpen} onClose={() => setEditTitleOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Изменить название поездки</DialogTitle>

        <DialogContent dividers>
          <TextField
            label="Название"
            fullWidth
            autoFocus
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
          />
        </DialogContent>

        <DialogActions>
          <Button onClick={() => setEditTitleOpen(false)}>Отмена</Button>
          <Button variant="contained" onClick={saveTitle} disabled={savingTitle}>
            Сохранить
          </Button>
        </DialogActions>
      </Dialog>

      {/* Диалог редактирования дат */}
      <Dialog open={editDatesOpen} onClose={() => setEditDatesOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Редактировать даты поездки</DialogTitle>

        <DialogContent dividers>
          <TextField
            label="Дата начала"
            type="date"
            fullWidth
            margin="normal"
            InputLabelProps={{ shrink: true }}
            value={editStartDate ?? ""}
            onChange={(e) => setEditStartDate(e.target.value || null)}
          />

          <TextField
            label="Дата окончания"
            type="date"
            fullWidth
            margin="normal"
            InputLabelProps={{ shrink: true }}
            value={editEndDate ?? ""}
            onChange={(e) => setEditEndDate(e.target.value || null)}
          />
        </DialogContent>

        <DialogActions>
          <Button onClick={() => setEditDatesOpen(false)}>Отмена</Button>
          <Button variant="contained" onClick={saveDates} disabled={savingDates}>
            Сохранить
          </Button>
        </DialogActions>
      </Dialog>

      {/* Диалог просмотра чека */}
      <ReceiptDialog
        open={receiptOpen}
        title={receiptTitle}
        url={receiptUrl}
        onClose={onCloseReceipt}
        onDownload={onDownloadCurrentReceipt}
        onDelete={onDeleteReceipt}
        canDownload={!!receiptUrl}
        canDelete={!!receiptUrl}
      />
    </>
  );
}
