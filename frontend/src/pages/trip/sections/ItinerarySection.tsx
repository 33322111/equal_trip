import React, { useEffect, useMemo, useState } from "react";
import {
  Paper,
  Typography,
  Box,
  Stack,
  Button,
  TextField,
  Alert,
  IconButton,
  Checkbox,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Chip,
} from "@mui/material";
import DeleteIcon from "@mui/icons-material/Delete";
import EditIcon from "@mui/icons-material/Edit";
import Autocomplete from "@mui/material/Autocomplete";
import ChatBubbleOutlineIcon from "@mui/icons-material/ChatBubbleOutline";

import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider";
import { DateCalendar } from "@mui/x-date-pickers/DateCalendar";
import { AdapterDateFns } from "@mui/x-date-pickers/AdapterDateFns";
import ruLocale from "date-fns/locale/ru";
import { PickersDay } from "@mui/x-date-pickers/PickersDay";
import type { PickersDayProps } from "@mui/x-date-pickers/PickersDay";

import { format, parseISO } from "date-fns";

import {
  listDays,
  createDay,
  deleteDay,
  listDayItems,
  createDayItem,
  patchDayItem,
  deleteDayItem,
  addDayItemComment,
  patchDayItemComment,
  deleteDayItemComment,
  DayPlan,
  DayPlanItem,
} from "../../../api/itinerary";
import { useAuth } from "../../../context/AuthContext";

type MemberUser = { id: number; username: string; email: string };
type Props = {
  tripId: number;
  members: { user: MemberUser }[];
  onError: (msg: string) => void;
};

function getTodayIsoLocal() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function timeToMinutes(value: string | null | undefined) {
  if (!value) return null;
  const [hRaw, mRaw] = value.split(":");
  const h = Number(hRaw);
  const m = Number(mRaw);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return h * 60 + m;
}

function toHm(value: string | null | undefined) {
  if (!value) return "";
  const [hRaw, mRaw] = value.split(":");
  if (hRaw === undefined || mRaw === undefined) return value;
  return `${hRaw}:${mRaw}`;
}

export default function ItinerarySection({ tripId, members, onError }: Props) {
  const { user } = useAuth();
  const [days, setDays] = useState<DayPlan[]>([]);
  const [activeDayId, setActiveDayId] = useState<number | null>(null);
  const [dayItems, setDayItems] = useState<DayPlanItem[]>([]);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);

  const [itTitle, setItTitle] = useState("");
  const [itFrom, setItFrom] = useState("");
  const [itTo, setItTo] = useState("");
  const [itDesc, setItDesc] = useState("");
  const [itAssigneeId, setItAssigneeId] = useState<number | null>(null);
  const [editActivityOpen, setEditActivityOpen] = useState(false);
  const [editActivity, setEditActivity] = useState<DayPlanItem | null>(null);
  const [editActivityTitle, setEditActivityTitle] = useState("");
  const [editActivityFrom, setEditActivityFrom] = useState("");
  const [editActivityTo, setEditActivityTo] = useState("");
  const [editActivityDesc, setEditActivityDesc] = useState("");
  const [editActivityAssigneeId, setEditActivityAssigneeId] = useState<number | null>(null);
  const [editActivitySaving, setEditActivitySaving] = useState(false);
  const [commentOpen, setCommentOpen] = useState(false);
  const [commentItem, setCommentItem] = useState<DayPlanItem | null>(null);
  const [commentText, setCommentText] = useState("");
  const [editingCommentId, setEditingCommentId] = useState<number | null>(null);
  const [editingCommentText, setEditingCommentText] = useState("");

  const iso = (d: Date) => format(d, "yyyy-MM-dd");

  const dayByIso = useMemo(() => {
    const m = new Map<string, DayPlan>();
    for (const d of days) m.set(d.date, d);
    return m;
  }, [days]);

  const daysWithItems = useMemo(() => {
    const s = new Set<string>();
    for (const d of days) {
      if ((d as any).items_count > 0) s.add(d.date);
    }
    return s;
  }, [days]);

  const activeDayDate = useMemo(() => days.find((d) => d.id === activeDayId)?.date ?? null, [days, activeDayId]);
  const createTimeInvalid = useMemo(() => {
    const fromMinutes = timeToMinutes(itFrom);
    const toMinutes = timeToMinutes(itTo);
    if (fromMinutes === null || toMinutes === null) return false;
    return toMinutes < fromMinutes;
  }, [itFrom, itTo]);
  const editTimeInvalid = useMemo(() => {
    const fromMinutes = timeToMinutes(editActivityFrom);
    const toMinutes = timeToMinutes(editActivityTo);
    if (fromMinutes === null || toMinutes === null) return false;
    return toMinutes < fromMinutes;
  }, [editActivityFrom, editActivityTo]);

  const reloadDays = async () => {
    const ds = await listDays(tripId);
    setDays(ds);
    if (!activeDayId && ds.length) setActiveDayId(ds[0].id);
  };

  const reloadDayItems = async (dayId: number) => {
    const items = await listDayItems(tripId, dayId);
    setDayItems(items);
  };

  useEffect(() => {
    reloadDays().catch(() => onError("Не удалось загрузить планировщик"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripId]);

  useEffect(() => {
    if (!activeDayId) return;
    reloadDayItems(activeDayId).catch(() => onError("Не удалось загрузить активности дня"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripId, activeDayId]);

  useEffect(() => {
    if (!days.length) return;
    if (!selectedDate) {
      setSelectedDate(parseISO(days[0].date));
      setActiveDayId(days[0].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days]);

  const onPickDate = (d: Date | null) => {
    setSelectedDate(d);
    if (!d) return;
    const key = iso(d);
    const day = dayByIso.get(key);
    setActiveDayId(day ? day.id : null);
  };

  const DayWithPlansMarker = (props: PickersDayProps<Date>) => {
    const hasPlans = !props.outsideCurrentMonth && daysWithItems.has(iso(props.day));
    return (
      <PickersDay
        {...props}
        sx={[
          props.sx,
          hasPlans
            ? {
                boxShadow: "inset 0 0 0 2px #0284c7",
                fontWeight: 700,
                "&.Mui-selected": {
                  boxShadow: "inset 0 0 0 2px #0c4a6e",
                },
              }
            : undefined,
        ]}
      />
    );
  };

  const createDayForSelected = async () => {
    if (!selectedDate) return;
    try {
      const d = await createDay(tripId, iso(selectedDate), "");
      await reloadDays();
      setActiveDayId(d.id);
    } catch {
      onError("Не удалось создать день.");
    }
  };

  const onDeleteDay = async () => {
    if (!activeDayId) return;
    if (!window.confirm("Удалить день?")) return;
    try {
      await deleteDay(tripId, activeDayId);
      setActiveDayId(null);
      setDayItems([]);
      await reloadDays();
    } catch {
      onError("Не удалось удалить день.");
    }
  };

  const onAddItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeDayId || !itTitle.trim()) return;
    if (createTimeInvalid) {
      onError("Время окончания не может быть раньше времени начала.");
      return;
    }

    try {
      await createDayItem(tripId, activeDayId, {
        title: itTitle.trim(),
        time_from: itFrom || null,
        time_to: itTo || null,
        description: itDesc || "",
        assignee_id: itAssigneeId,
      });
      setItTitle("");
      setItFrom("");
      setItTo("");
      setItDesc("");
      setItAssigneeId(null);

      await reloadDayItems(activeDayId);
      await reloadDays(); // обновим точки на календаре
    } catch {
      onError("Не удалось добавить активность");
    }
  };

  const onToggleDone = async (it: DayPlanItem) => {
    if (!activeDayId) return;
    await patchDayItem(tripId, activeDayId, it.id, { is_done: !it.is_done });
    await reloadDayItems(activeDayId);
    await reloadDays();
  };

  const onDeleteItem = async (itemId: number) => {
    if (!activeDayId) return;
    if (!window.confirm("Удалить активность?")) return;
    await deleteDayItem(tripId, activeDayId, itemId);
    await reloadDayItems(activeDayId);
    await reloadDays();
  };

  const onOpenEditActivity = (item: DayPlanItem) => {
    setEditActivity(item);
    setEditActivityTitle(item.title);
    setEditActivityFrom(toHm(item.time_from));
    setEditActivityTo(toHm(item.time_to));
    setEditActivityDesc(item.description ?? "");
    setEditActivityAssigneeId(item.assignee?.id ?? null);
    setEditActivityOpen(true);
  };

  const onCloseEditActivity = () => {
    setEditActivityOpen(false);
    setEditActivity(null);
    setEditActivityTitle("");
    setEditActivityFrom("");
    setEditActivityTo("");
    setEditActivityDesc("");
    setEditActivityAssigneeId(null);
    setEditActivitySaving(false);
  };

  const onSaveEditedActivity = async () => {
    if (!activeDayId || !editActivity) return;
    if (!editActivityTitle.trim()) {
      onError("Введите название активности.");
      return;
    }
    if (editTimeInvalid) {
      onError("Время окончания не может быть раньше времени начала.");
      return;
    }

    setEditActivitySaving(true);
    try {
      await patchDayItem(tripId, activeDayId, editActivity.id, {
        title: editActivityTitle.trim(),
        time_from: editActivityFrom || null,
        time_to: editActivityTo || null,
        description: editActivityDesc || "",
        assignee_id: editActivityAssigneeId,
      });
      await reloadDayItems(activeDayId);
      await reloadDays();
      onCloseEditActivity();
    } catch {
      onError("Не удалось сохранить изменения активности.");
      setEditActivitySaving(false);
    }
  };

  const refreshCommentItem = async (dayId: number, itemId: number) => {
    const items = await listDayItems(tripId, dayId);
    setDayItems(items);
    const updated = items.find((x) => x.id === itemId) ?? null;
    setCommentItem(updated);
  };

  const onOpenComments = (item: DayPlanItem) => {
    setCommentItem(item);
    setCommentText("");
    setEditingCommentId(null);
    setEditingCommentText("");
    setCommentOpen(true);
  };

  const onCloseComments = () => {
    setCommentOpen(false);
    setCommentItem(null);
    setCommentText("");
    setEditingCommentId(null);
    setEditingCommentText("");
  };

  const onSendComment = async () => {
    if (!activeDayId || !commentItem) return;
    const text = commentText.trim();
    if (!text) return;

    try {
      await addDayItemComment(tripId, activeDayId, commentItem.id, text);
      setCommentText("");
      await refreshCommentItem(activeDayId, commentItem.id);
      await reloadDays();
    } catch {
      onError("Не удалось добавить комментарий.");
    }
  };

  const onStartEditComment = (commentId: number, text: string) => {
    setEditingCommentId(commentId);
    setEditingCommentText(text);
  };

  const onCancelEditComment = () => {
    setEditingCommentId(null);
    setEditingCommentText("");
  };

  const onSaveCommentEdit = async () => {
    if (!activeDayId || !commentItem || !editingCommentId) return;
    const text = editingCommentText.trim();
    if (!text) {
      onError("Комментарий не может быть пустым.");
      return;
    }

    try {
      await patchDayItemComment(tripId, activeDayId, commentItem.id, editingCommentId, text);
      onCancelEditComment();
      await refreshCommentItem(activeDayId, commentItem.id);
    } catch {
      onError("Не удалось обновить комментарий.");
    }
  };

  const onDeleteComment = async (commentId: number) => {
    if (!activeDayId || !commentItem) return;
    if (!window.confirm("Удалить комментарий?")) return;

    try {
      await deleteDayItemComment(tripId, activeDayId, commentItem.id, commentId);
      if (editingCommentId === commentId) onCancelEditComment();
      await refreshCommentItem(activeDayId, commentItem.id);
      await reloadDays();
    } catch {
      onError("Не удалось удалить комментарий.");
    }
  };

  const canManageComment = (comment: NonNullable<DayPlanItem["comments"]>[number]) => {
    return comment.user?.id === user?.id;
  };

  const isDayItemOverdue = (item: DayPlanItem) => {
    if (item.is_done || !activeDayDate) return false;

    const todayIso = getTodayIsoLocal();
    if (activeDayDate < todayIso) return true;
    if (activeDayDate > todayIso) return false;

    const dueMinutes = timeToMinutes(item.time_to);
    if (dueMinutes === null) return false;

    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    return currentMinutes > dueMinutes;
  };

  return (
    <>
      <Paper sx={{ p: 2, mt: 3 }}>
        <Typography variant="h6" gutterBottom>
          Планировщик по дням
        </Typography>

        <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={ruLocale}>
          <Stack direction={{ xs: "column", md: "row" }} spacing={3}>
            <Box sx={{ width: { xs: "100%", md: 340 }, maxWidth: 340, mx: { xs: "auto", md: 0 } }}>
              <DateCalendar
                value={selectedDate}
                onChange={onPickDate}
                slots={{ day: DayWithPlansMarker }}
                sx={{ width: "100%", maxWidth: "100%" }}
              />

              <Box display="flex" alignItems="center" gap={1} sx={{ mt: 1.25 }}>
                <Box sx={{ width: 10, height: 10, borderRadius: "50%", border: "2px solid #0284c7", backgroundColor: "#ffffff" }} />
                <Typography variant="caption" color="text.secondary">
                  Дни с активностями
                </Typography>
              </Box>

              {selectedDate && !dayByIso.has(iso(selectedDate)) ? (
                <Box sx={{ mt: 2 }}>
                  <Alert severity="info" sx={{ mb: 1 }}>
                    Для этой даты ещё нет дня в планировщике.
                  </Alert>
                  <Button variant="contained" onClick={createDayForSelected} sx={{ width: { xs: "100%", sm: "auto" } }}>
                    Добавить день
                  </Button>
                </Box>
              ) : null}
            </Box>

            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Stack
                direction={{ xs: "column", sm: "row" }}
                justifyContent="space-between"
                alignItems={{ xs: "flex-start", sm: "center" }}
                sx={{ mb: 1 }}
                gap={1}
              >
                <Typography variant="subtitle1" fontWeight={700} sx={{ textTransform: "capitalize" }}>
                  {selectedDate
                    ? selectedDate.toLocaleDateString("ru-RU", {
                        weekday: "long",
                        day: "2-digit",
                        month: "long",
                      })
                    : "Выбери дату"}
                </Typography>

                {activeDayId ? (
                  <Button color="error" variant="text" onClick={onDeleteDay} sx={{ width: { xs: "100%", sm: "auto" } }}>
                    Удалить день
                  </Button>
                ) : null}
              </Stack>

              {!activeDayId ? (
                <Typography color="text.secondary">
                  Выбери дату с существующим днём (или создай день).
                </Typography>
              ) : (
                <>
                  <Box component="form" onSubmit={onAddItem} sx={{ mb: 2 }}>
                    <Stack spacing={1.5}>
                      {createTimeInvalid ? (
                        <Alert severity="error" variant="outlined">
                          Время окончания не может быть раньше времени начала.
                        </Alert>
                      ) : null}

                      <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
                        <TextField
                          label="Активность"
                          value={itTitle}
                          onChange={(e) => setItTitle(e.target.value)}
                          fullWidth
                          required
                        />

                        <Stack direction={{ xs: "column", sm: "row" }} spacing={2} sx={{ width: { xs: "100%", md: "auto" } }}>
                          <TextField
                            label="С"
                            type="time"
                            value={itFrom}
                            onChange={(e) => setItFrom(e.target.value)}
                            InputLabelProps={{ shrink: true }}
                            inputProps={{ step: 60 }}
                            sx={{ width: { xs: "100%", sm: 140 } }}
                          />
                          <TextField
                            label="До"
                            type="time"
                            value={itTo}
                            onChange={(e) => setItTo(e.target.value)}
                            InputLabelProps={{ shrink: true }}
                            inputProps={{ step: 60, min: itFrom || undefined }}
                            error={createTimeInvalid}
                            sx={{ width: { xs: "100%", sm: 140 } }}
                          />
                        </Stack>
                      </Stack>

                      <Stack direction={{ xs: "column", md: "row" }} spacing={2} alignItems={{ xs: "stretch", md: "flex-start" }}>
                        <Autocomplete
                          sx={{ flex: 1, minWidth: 0 }}
                          options={members.map((m) => m.user)}
                          getOptionLabel={(u) => `${u.username} (${u.email})`}
                          value={itAssigneeId ? members.map((m) => m.user).find((u) => u.id === itAssigneeId) ?? null : null}
                          onChange={(_, v) => setItAssigneeId(v ? v.id : null)}
                          renderInput={(params) => <TextField {...params} label="Ответственный" />}
                        />

                        <Button
                          type="submit"
                          variant="contained"
                          disabled={createTimeInvalid}
                          sx={{ width: { xs: "100%", md: 180 }, height: { md: 56 } }}
                        >
                          Добавить
                        </Button>
                      </Stack>
                    </Stack>

                    <TextField
                      label="Описание"
                      value={itDesc}
                      onChange={(e) => setItDesc(e.target.value)}
                      fullWidth
                      multiline
                      minRows={2}
                      sx={{ mt: 1 }}
                    />
                  </Box>

                  <Box display="flex" flexDirection="column" gap={1}>
                    {dayItems.map((it) => {
                      const fromHm = toHm(it.time_from);
                      const toHmValue = toHm(it.time_to);
                      const timeLabel =
                        fromHm || toHmValue
                          ? `${fromHm}${toHmValue ? "–" + toHmValue : ""}`
                          : "Без времени";

                      return (
                        <Paper key={it.id} variant="outlined" sx={{ p: 1.5 }}>
                          <Box
                            display="flex"
                            flexDirection={{ xs: "column", sm: "row" }}
                            justifyContent="space-between"
                            alignItems={{ xs: "flex-start", sm: "flex-start" }}
                            gap={1.5}
                          >
                            <Box sx={{ minWidth: 0 }}>
                              <Box display="flex" alignItems="center" gap={1} sx={{ minWidth: 0 }}>
                                <Checkbox checked={it.is_done} onChange={() => onToggleDone(it)} />
                                <Box display="flex" alignItems="center" gap={1} flexWrap="wrap">
                                  <Typography fontWeight={700} sx={{ wordBreak: "break-word" }}>
                                    {it.title}
                                  </Typography>
                                  {isDayItemOverdue(it) ? <Chip label="Просрочено" size="small" color="error" /> : null}
                                </Box>
                              </Box>

                              <Typography variant="body2" color="text.secondary">
                                {timeLabel}
                                {it.assignee ? ` • ${it.assignee.username}` : ""}
                              </Typography>

                              {it.description ? (
                                <Typography variant="body2" sx={{ mt: 0.5, whiteSpace: "pre-wrap" }}>
                                  {it.description}
                                </Typography>
                              ) : null}

                              {it.comments?.length ? (
                                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                                  Комментариев: {it.comments.length}
                                </Typography>
                              ) : null}
                            </Box>

                            <Box display="flex" gap={1} sx={{ alignSelf: { xs: "flex-end", sm: "flex-start" } }}>
                              <IconButton size="small" onClick={() => onOpenEditActivity(it)} aria-label="edit-activity">
                                <EditIcon fontSize="small" />
                              </IconButton>
                              <IconButton size="small" onClick={() => onOpenComments(it)} aria-label="comments">
                                <ChatBubbleOutlineIcon fontSize="small" />
                              </IconButton>
                              <IconButton size="small" onClick={() => onDeleteItem(it.id)} aria-label="delete-activity">
                                <DeleteIcon fontSize="small" />
                              </IconButton>
                            </Box>
                          </Box>
                        </Paper>
                      );
                    })}

                    {dayItems.length === 0 ? (
                      <Typography color="text.secondary">Пока активностей нет.</Typography>
                    ) : null}
                  </Box>
                </>
              )}
            </Box>
          </Stack>
        </LocalizationProvider>
      </Paper>

      <Dialog open={editActivityOpen} onClose={onCloseEditActivity} maxWidth="sm" fullWidth>
        <DialogTitle>Редактировать активность</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2} sx={{ mt: 0.5 }}>
            {editTimeInvalid ? (
              <Alert severity="error" variant="outlined">
                Время окончания не может быть раньше времени начала.
              </Alert>
            ) : null}

            <TextField
              label="Активность"
              value={editActivityTitle}
              onChange={(e) => setEditActivityTitle(e.target.value)}
              fullWidth
              required
            />
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
              <TextField
                label="С"
                type="time"
                value={editActivityFrom}
                onChange={(e) => setEditActivityFrom(e.target.value)}
                InputLabelProps={{ shrink: true }}
                inputProps={{ step: 60 }}
                fullWidth
              />
              <TextField
                label="До"
                type="time"
                value={editActivityTo}
                onChange={(e) => setEditActivityTo(e.target.value)}
                InputLabelProps={{ shrink: true }}
                inputProps={{ step: 60, min: editActivityFrom || undefined }}
                error={editTimeInvalid}
                fullWidth
              />
            </Stack>
            <Autocomplete
              options={members.map((m) => m.user)}
              getOptionLabel={(u) => `${u.username} (${u.email})`}
              value={
                editActivityAssigneeId
                  ? members.map((m) => m.user).find((u) => u.id === editActivityAssigneeId) ?? null
                  : null
              }
              onChange={(_, v) => setEditActivityAssigneeId(v ? v.id : null)}
              renderInput={(params) => <TextField {...params} label="Ответственный" />}
            />
            <TextField
              label="Описание"
              value={editActivityDesc}
              onChange={(e) => setEditActivityDesc(e.target.value)}
              fullWidth
              multiline
              minRows={2}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={onCloseEditActivity}>Отмена</Button>
          <Button
            variant="contained"
            onClick={onSaveEditedActivity}
            disabled={editActivitySaving || !editActivityTitle.trim() || editTimeInvalid}
          >
            Сохранить
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={commentOpen} onClose={onCloseComments} maxWidth="sm" fullWidth>
        <DialogTitle>Комментарии: {commentItem?.title}</DialogTitle>
        <DialogContent dividers>
          {(commentItem?.comments ?? []).map((comment) => (
            <Paper key={comment.id} variant="outlined" sx={{ p: 1, mb: 1 }}>
              <Box display="flex" justifyContent="space-between" alignItems="center" gap={1} sx={{ mb: 0.75 }}>
                <Typography variant="body2" fontWeight={600}>
                  {comment.user?.username ?? "Пользователь"}
                </Typography>

                {canManageComment(comment) ? (
                  <Box display="flex" gap={0.5}>
                    <IconButton
                      size="small"
                      onClick={() => onStartEditComment(comment.id, comment.text)}
                      aria-label="edit-comment"
                    >
                      <EditIcon fontSize="small" />
                    </IconButton>
                    <IconButton size="small" onClick={() => onDeleteComment(comment.id)} aria-label="delete-comment">
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </Box>
                ) : null}
              </Box>

              {editingCommentId === comment.id ? (
                <>
                  <TextField
                    value={editingCommentText}
                    onChange={(e) => setEditingCommentText(e.target.value)}
                    fullWidth
                    multiline
                    minRows={2}
                  />
                  <Box display="flex" justifyContent="flex-end" gap={1} sx={{ mt: 1 }}>
                    <Button size="small" onClick={onCancelEditComment}>
                      Отмена
                    </Button>
                    <Button size="small" variant="contained" onClick={onSaveCommentEdit}>
                      Сохранить
                    </Button>
                  </Box>
                </>
              ) : (
                <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: "pre-wrap" }}>
                  {comment.text}
                </Typography>
              )}
            </Paper>
          ))}

          {(commentItem?.comments ?? []).length === 0 ? (
            <Typography color="text.secondary">Пока комментариев нет.</Typography>
          ) : null}

          <TextField
            label="Новый комментарий"
            value={commentText}
            onChange={(e) => setCommentText(e.target.value)}
            fullWidth
            multiline
            minRows={2}
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={onSendComment} variant="contained">
            Отправить
          </Button>
          <Button onClick={onCloseComments}>Закрыть</Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
