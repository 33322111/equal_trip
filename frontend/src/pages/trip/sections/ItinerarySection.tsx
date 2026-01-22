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
  Badge,
} from "@mui/material";
import DeleteIcon from "@mui/icons-material/Delete";
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
  DayPlan,
  DayPlanItem,
} from "../../../api/itinerary";

type MemberUser = { id: number; username: string; email: string };
type Props = {
  tripId: number;
  members: { user: MemberUser }[];
  onError: (msg: string) => void;
};

export default function ItinerarySection({ tripId, members, onError }: Props) {
  const [days, setDays] = useState<DayPlan[]>([]);
  const [activeDayId, setActiveDayId] = useState<number | null>(null);
  const [dayItems, setDayItems] = useState<DayPlanItem[]>([]);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);

  const [itTitle, setItTitle] = useState("");
  const [itFrom, setItFrom] = useState("");
  const [itTo, setItTo] = useState("");
  const [itDesc, setItDesc] = useState("");
  const [itAssigneeId, setItAssigneeId] = useState<number | null>(null);

  const iso = (d: Date) => format(d, "yyyy-MM-dd");

  const dayByIso = useMemo(() => {
    const m = new Map<string, DayPlan>();
    for (const d of days) m.set(d.date, d);
    return m;
  }, [days]);

  // точки на календаре только если есть активности
const daysWithItems = useMemo(() => {
  const s = new Set<string>();
  for (const d of days) {
    if ((d as any).items_count > 0) s.add(d.date);
  }
  return s;
}, [days]);

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

  const renderDay = (day: Date, _selected: Array<Date | null>, props: PickersDayProps<Date>) => {
    const key = iso(day);
    const has = daysWithItems.has(key);
    return (
      <Badge key={key} overlap="circular" variant={has ? "dot" : "standard"}>
        <PickersDay {...props} />
      </Badge>
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

  const selectedIso = selectedDate ? iso(selectedDate) : null;

  return (
    <Paper sx={{ p: 2, mt: 3 }}>
      <Typography variant="h6" gutterBottom>
        Планировщик по дням
      </Typography>

      <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={ruLocale}>
        <Stack direction={{ xs: "column", md: "row" }} spacing={3}>
          <Box sx={{ minWidth: 320 }}>
            <DateCalendar value={selectedDate} onChange={onPickDate} renderDay={renderDay} />

            {selectedDate && !dayByIso.has(iso(selectedDate)) ? (
              <Box sx={{ mt: 2 }}>
                <Alert severity="info" sx={{ mb: 1 }}>
                  Для этой даты ещё нет дня в планировщике.
                </Alert>
                <Button variant="contained" onClick={createDayForSelected}>
                  Создать день
                </Button>
              </Box>
            ) : null}
          </Box>

          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
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
                <Button color="error" variant="text" onClick={onDeleteDay}>
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
                  <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
                    <TextField
                      label="Активность"
                      value={itTitle}
                      onChange={(e) => setItTitle(e.target.value)}
                      fullWidth
                      required
                    />
                    <TextField label="С" type="time" value={itFrom} onChange={(e) => setItFrom(e.target.value)} />
                    <TextField label="До" type="time" value={itTo} onChange={(e) => setItTo(e.target.value)} />

                    <Autocomplete
                      sx={{ minWidth: 240 }}
                      options={members.map((m) => m.user)}
                      getOptionLabel={(u) => `${u.username} (${u.email})`}
                      value={itAssigneeId ? members.map((m) => m.user).find((u) => u.id === itAssigneeId) ?? null : null}
                      onChange={(_, v) => setItAssigneeId(v ? v.id : null)}
                      renderInput={(params) => <TextField {...params} label="Ответственный" />}
                    />

                    <Button type="submit" variant="contained">
                      Добавить
                    </Button>
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
                    const timeLabel =
                      it.time_from || it.time_to
                        ? `${it.time_from ?? ""}${it.time_to ? "–" + it.time_to : ""}`
                        : "Без времени";

                    return (
                      <Paper key={it.id} variant="outlined" sx={{ p: 1.5 }}>
                        <Box display="flex" justifyContent="space-between" alignItems="flex-start" gap={2}>
                          <Box sx={{ minWidth: 0 }}>
                            <Box display="flex" alignItems="center" gap={1}>
                              <Checkbox checked={it.is_done} onChange={() => onToggleDone(it)} />
                              <Typography fontWeight={700} noWrap>
                                {it.title}
                              </Typography>
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
                          </Box>

                          <Box display="flex" gap={1}>
                            <IconButton size="small" disabled aria-label="comments-disabled">
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
  );
}