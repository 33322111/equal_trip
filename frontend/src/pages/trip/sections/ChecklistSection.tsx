import React, { useEffect, useState } from "react";
import {
  Paper,
  Typography,
  Stack,
  TextField,
  Button,
  Divider,
  Box,
  IconButton,
  Checkbox,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Chip,
  Alert,
} from "@mui/material";
import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider";
import { AdapterDateFns } from "@mui/x-date-pickers/AdapterDateFns";
import { DatePicker } from "@mui/x-date-pickers/DatePicker";
import ruLocale from "date-fns/locale/ru";

import DeleteIcon from "@mui/icons-material/Delete";
import EditIcon from "@mui/icons-material/Edit";
import ChatBubbleOutlineIcon from "@mui/icons-material/ChatBubbleOutline";
import Autocomplete from "@mui/material/Autocomplete";

import {
  listChecklists,
  createChecklist,
  deleteChecklist,
  listChecklistItems,
  createChecklistItem,
  patchChecklistItem,
  deleteChecklistItem,
  addChecklistComment,
  patchChecklistComment,
  deleteChecklistComment,
  Checklist,
  ChecklistItem,
} from "../../../api/checklists";
import { useAuth } from "../../../context/AuthContext";

type MemberUser = { id: number; username: string; email: string };

type Props = {
  tripId: number;
  members: { user: MemberUser }[];
};

function toLocalDatePickerValue(value: string | null | undefined) {
  if (!value) return null;
  const parts = value.split("-").map(Number);
  if (parts.length !== 3 || parts.some((part) => !Number.isFinite(part))) return null;
  const [year, month, day] = parts;
  return new Date(year, month - 1, day);
}

function fromLocalDatePickerValue(value: Date | null) {
  if (!value || Number.isNaN(value.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
}

export default function ChecklistSection({ tripId, members }: Props) {
  const { user } = useAuth();
  const [checklists, setChecklists] = useState<Checklist[]>([]);
  const [activeChecklistId, setActiveChecklistId] = useState<number | null>(null);
  const [checklistItems, setChecklistItems] = useState<ChecklistItem[]>([]);
  const [sectionError, setSectionError] = useState<string | null>(null);
  const [editItemError, setEditItemError] = useState<string | null>(null);
  const [commentError, setCommentError] = useState<string | null>(null);

  const [newChecklistTitle, setNewChecklistTitle] = useState<string>(
    "Список дел / паковочный лист"
  );

  const [itemTitle, setItemTitle] = useState("");
  const [itemDueDate, setItemDueDate] = useState<string>("");
  const [itemAssigneeId, setItemAssigneeId] = useState<number | null>(null);
  const [editItemOpen, setEditItemOpen] = useState(false);
  const [editItem, setEditItem] = useState<ChecklistItem | null>(null);
  const [editItemTitle, setEditItemTitle] = useState("");
  const [editItemDueDate, setEditItemDueDate] = useState("");
  const [editItemAssigneeId, setEditItemAssigneeId] = useState<number | null>(null);
  const [editItemSaving, setEditItemSaving] = useState(false);

  // comments dialog
  const [commentOpen, setCommentOpen] = useState(false);
  const [commentItem, setCommentItem] = useState<ChecklistItem | null>(null);
  const [commentText, setCommentText] = useState("");
  const [editingCommentId, setEditingCommentId] = useState<number | null>(null);
  const [editingCommentText, setEditingCommentText] = useState("");

  const reloadChecklists = async () => {
    const cls = await listChecklists(tripId);
    setChecklists(cls);

    // если активный не выбран – выберем первый
    if (!activeChecklistId && cls.length) setActiveChecklistId(cls[0].id);

    // если активный выбран, но его удалили – сброс
    if (activeChecklistId && !cls.some((c) => c.id === activeChecklistId)) {
      setActiveChecklistId(cls.length ? cls[0].id : null);
    }
  };

  const reloadItems = async (cid: number) => {
    const items = await listChecklistItems(tripId, cid);
    setChecklistItems(items);
  };

  // init load
  useEffect(() => {
    if (!Number.isFinite(tripId)) return;
    reloadChecklists().catch(() => setSectionError("Не удалось загрузить чек-листы"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripId]);

  // load items when active checklist changes
  useEffect(() => {
    if (!activeChecklistId) {
      setChecklistItems([]);
      return;
    }
    reloadItems(activeChecklistId).catch(() => setSectionError("Не удалось загрузить задачи чек-листа"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripId, activeChecklistId]);

  const onCreateChecklist = async () => {
    try {
      setSectionError(null);
      const title = newChecklistTitle.trim() || "Чек-лист";
      const created = await createChecklist(tripId, title);

      await reloadChecklists();
      setActiveChecklistId(created.id);
    } catch {
      setSectionError("Не удалось создать чек-лист.");
    }
  };

  const onDeleteChecklist = async (cid: number) => {
    if (!window.confirm("Удалить чек-лист?")) return;
    try {
      setSectionError(null);
      await deleteChecklist(tripId, cid);
      await reloadChecklists();
      // items подтянутся useEffectом
    } catch {
      setSectionError("Не удалось удалить чек-лист.");
    }
  };

  const onAddItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeChecklistId) return;

    if (!itemTitle.trim()) {
      setSectionError("Введите название задачи.");
      return;
    }

    try {
      setSectionError(null);
      await createChecklistItem(tripId, activeChecklistId, {
        title: itemTitle.trim(),
        assignee_id: itemAssigneeId,
        due_date: itemDueDate ? itemDueDate : null,
      });

      setItemTitle("");
      setItemDueDate("");
      setItemAssigneeId(null);

      await reloadItems(activeChecklistId);
    } catch {
      setSectionError("Не удалось добавить задачу.");
    }
  };

  const onToggleDone = async (it: ChecklistItem) => {
    if (!activeChecklistId) return;
    try {
      setSectionError(null);
      await patchChecklistItem(tripId, activeChecklistId, it.id, { is_done: !it.is_done });
      await reloadItems(activeChecklistId);
    } catch {
      setSectionError("Не удалось обновить задачу.");
    }
  };

  const onDeleteItem = async (itemId: number) => {
    if (!activeChecklistId) return;
    if (!window.confirm("Удалить задачу?")) return;

    try {
      setSectionError(null);
      await deleteChecklistItem(tripId, activeChecklistId, itemId);
      await reloadItems(activeChecklistId);
    } catch {
      setSectionError("Не удалось удалить задачу.");
    }
  };

  const onOpenEditItem = (item: ChecklistItem) => {
    setEditItemError(null);
    setEditItem(item);
    setEditItemTitle(item.title);
    setEditItemDueDate(item.due_date ?? "");
    setEditItemAssigneeId(item.assignee?.id ?? null);
    setEditItemOpen(true);
  };

  const onCloseEditItem = () => {
    setEditItemOpen(false);
    setEditItem(null);
    setEditItemTitle("");
    setEditItemDueDate("");
    setEditItemAssigneeId(null);
    setEditItemSaving(false);
    setEditItemError(null);
  };

  const onSaveEditedItem = async () => {
    if (!activeChecklistId || !editItem) return;
    if (!editItemTitle.trim()) {
      setEditItemError("Введите название задачи.");
      return;
    }

    setEditItemSaving(true);
    try {
      setEditItemError(null);
      await patchChecklistItem(tripId, activeChecklistId, editItem.id, {
        title: editItemTitle.trim(),
        assignee_id: editItemAssigneeId,
        due_date: editItemDueDate ? editItemDueDate : null,
      });
      await reloadItems(activeChecklistId);
      onCloseEditItem();
    } catch {
      setEditItemError("Не удалось сохранить изменения задачи.");
      setEditItemSaving(false);
    }
  };

  const refreshCommentItem = async (checklistId: number, itemId: number) => {
    const items = await listChecklistItems(tripId, checklistId);
    setChecklistItems(items);
    const updated = items.find((x) => x.id === itemId) ?? null;
    setCommentItem(updated);
  };

  const onOpenComments = (it: ChecklistItem) => {
    setCommentError(null);
    setCommentItem(it);
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
    setCommentError(null);
  };

  const onSendComment = async () => {
    if (!activeChecklistId || !commentItem) return;
    const text = commentText.trim();
    if (!text) return;

    try {
      setCommentError(null);
      await addChecklistComment(tripId, activeChecklistId, commentItem.id, text);
      setCommentText("");
      await refreshCommentItem(activeChecklistId, commentItem.id);
    } catch {
      setCommentError("Не удалось добавить комментарий.");
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
    if (!activeChecklistId || !commentItem || !editingCommentId) return;
    const text = editingCommentText.trim();
    if (!text) {
      setCommentError("Комментарий не может быть пустым.");
      return;
    }

    try {
      setCommentError(null);
      await patchChecklistComment(tripId, activeChecklistId, commentItem.id, editingCommentId, text);
      onCancelEditComment();
      await refreshCommentItem(activeChecklistId, commentItem.id);
    } catch {
      setCommentError("Не удалось обновить комментарий.");
    }
  };

  const onDeleteComment = async (commentId: number) => {
    if (!activeChecklistId || !commentItem) return;
    if (!window.confirm("Удалить комментарий?")) return;

    try {
      setCommentError(null);
      await deleteChecklistComment(tripId, activeChecklistId, commentItem.id, commentId);
      if (editingCommentId === commentId) onCancelEditComment();
      await refreshCommentItem(activeChecklistId, commentItem.id);
    } catch {
      setCommentError("Не удалось удалить комментарий.");
    }
  };

  const canManageComment = (comment: NonNullable<ChecklistItem["comments"]>[number]) => {
    return comment.user?.id === user?.id;
  };

  const today = new Date();
  const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(
    today.getDate()
  ).padStart(2, "0")}`;
  const isChecklistItemOverdue = (item: ChecklistItem) =>
    !!item.due_date && !item.is_done && item.due_date < todayIso;

  return (
    <>
      <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={ruLocale}>
      <Paper sx={{ p: 2, mt: 3 }}>
        <Typography variant="h6" gutterBottom>
          Чек-листы и задачи
        </Typography>

        {sectionError ? (
          <Alert severity="error" sx={{ mb: 2, borderRadius: 3 }}>
            {sectionError}
          </Alert>
        ) : null}

        <Stack direction={{ xs: "column", md: "row" }} spacing={2} sx={{ mb: 2 }}>
          <TextField
            label="Название чек-листа"
            value={newChecklistTitle}
            onChange={(e) => setNewChecklistTitle(e.target.value)}
            fullWidth
          />
          <Button variant="contained" onClick={onCreateChecklist}>
            Создать
          </Button>
        </Stack>

        <Divider sx={{ mb: 2 }} />

        {/* список чек-листов */}
        <Stack direction="row" spacing={1} sx={{ mb: 2, flexWrap: "wrap" }}>
          {checklists.map((c) => (
            <Button
              key={c.id}
              variant={c.id === activeChecklistId ? "contained" : "outlined"}
              onClick={() => setActiveChecklistId(c.id)}
              sx={{ width: { xs: "100%", sm: "auto" } }}
            >
              {c.title}
            </Button>
          ))}

          {activeChecklistId ? (
            <Button
              color="error"
              variant="text"
              onClick={() => onDeleteChecklist(activeChecklistId)}
              sx={{ width: { xs: "100%", sm: "auto" } }}
            >
              Удалить выбранный
            </Button>
          ) : null}
        </Stack>

        {!activeChecklistId ? (
          <Typography color="text.secondary">Создай или выбери чек-лист.</Typography>
        ) : (
          <>
            {/* форма добавления задачи */}
            <Box component="form" onSubmit={onAddItem} sx={{ mb: 2 }}>
              <Stack direction={{ xs: "column", lg: "row" }} spacing={2}>
                <TextField
                  label="Задача"
                  value={itemTitle}
                  onChange={(e) => setItemTitle(e.target.value)}
                  fullWidth
                />

                <Autocomplete
                  sx={{ width: { xs: "100%", sm: 260 } }}
                  options={members.map((m) => m.user)}
                  getOptionLabel={(u) => `${u.username} (${u.email})`}
                  value={
                    itemAssigneeId ? members.map((m) => m.user).find((u) => u.id === itemAssigneeId) ?? null : null
                  }
                  onChange={(_, v) => setItemAssigneeId(v ? v.id : null)}
                  renderInput={(params) => <TextField {...params} label="Ответственный" />}
                />

                <DatePicker
                  label="Срок"
                  value={toLocalDatePickerValue(itemDueDate)}
                  onChange={(value) => setItemDueDate(fromLocalDatePickerValue(value))}
                  format="dd.MM.yyyy"
                  slotProps={{
                    textField: {
                      sx: { width: { xs: "100%", sm: 180 } },
                    },
                  }}
                />

                <Button type="submit" variant="contained" sx={{ width: { xs: "100%", lg: "auto" } }}>
                  Добавить
                </Button>
              </Stack>
            </Box>

            {/* список задач */}
            <Box display="flex" flexDirection="column" gap={1}>
              {checklistItems.map((it) => (
                <Paper key={it.id} variant="outlined" sx={{ p: 1.5 }}>
                  <Box
                    display="flex"
                    flexDirection={{ xs: "column", sm: "row" }}
                    alignItems={{ xs: "flex-start", sm: "center" }}
                    justifyContent="space-between"
                    gap={1.5}
                  >
                    <Box display="flex" alignItems="center" gap={1} sx={{ minWidth: 0 }}>
                      <Checkbox checked={it.is_done} onChange={() => onToggleDone(it)} />
                      <Box sx={{ minWidth: 0 }}>
                        <Box display="flex" alignItems="center" gap={1} flexWrap="wrap">
                          <Typography fontWeight={600} sx={{ wordBreak: "break-word" }}>
                            {it.title}
                          </Typography>
                          {isChecklistItemOverdue(it) ? (
                            <Chip label="Просрочено" size="small" color="error" />
                          ) : null}
                        </Box>
                        <Typography variant="body2" color="text.secondary" sx={{ wordBreak: "break-word" }}>
                          {it.assignee ? `Ответственный: ${it.assignee.username}` : "Ответственный: —"}
                          {it.due_date ? ` • Срок: ${it.due_date}` : ""}
                        </Typography>
                      </Box>
                    </Box>

                    <Box display="flex" alignItems="center" gap={1} sx={{ alignSelf: { xs: "flex-end", sm: "auto" } }}>
                      <IconButton size="small" onClick={() => onOpenEditItem(it)} aria-label="edit-item">
                        <EditIcon fontSize="small" />
                      </IconButton>
                      <IconButton size="small" onClick={() => onOpenComments(it)} aria-label="comments">
                        <ChatBubbleOutlineIcon fontSize="small" />
                      </IconButton>
                      <IconButton size="small" onClick={() => onDeleteItem(it.id)} aria-label="delete-item">
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </Box>
                  </Box>

                  {it.comments?.length ? (
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                      Комментариев: {it.comments.length}
                    </Typography>
                  ) : null}
                </Paper>
              ))}

              {checklistItems.length === 0 ? (
                <Typography color="text.secondary">Пока задач нет. Добавь первую!</Typography>
              ) : null}
            </Box>
          </>
        )}
      </Paper>

      <Dialog open={editItemOpen} onClose={onCloseEditItem} maxWidth="sm" fullWidth>
        <DialogTitle>Редактировать задачу</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2} sx={{ mt: 0.5 }}>
            {editItemError ? (
              <Alert severity="error" sx={{ borderRadius: 3 }}>
                {editItemError}
              </Alert>
            ) : null}

            <TextField
              label="Задача"
              value={editItemTitle}
              onChange={(e) => setEditItemTitle(e.target.value)}
              fullWidth
              required
            />

            <Autocomplete
              options={members.map((m) => m.user)}
              getOptionLabel={(u) => `${u.username} (${u.email})`}
              value={
                editItemAssigneeId
                  ? members.map((m) => m.user).find((u) => u.id === editItemAssigneeId) ?? null
                  : null
              }
              onChange={(_, v) => setEditItemAssigneeId(v ? v.id : null)}
              renderInput={(params) => <TextField {...params} label="Ответственный" />}
            />

            <DatePicker
              label="Срок"
              value={toLocalDatePickerValue(editItemDueDate)}
              onChange={(value) => setEditItemDueDate(fromLocalDatePickerValue(value))}
              format="dd.MM.yyyy"
              slotProps={{
                textField: {
                  fullWidth: true,
                },
              }}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={onCloseEditItem}>Отмена</Button>
          <Button
            variant="contained"
            onClick={onSaveEditedItem}
            disabled={editItemSaving || !editItemTitle.trim()}
          >
            Сохранить
          </Button>
        </DialogActions>
      </Dialog>

      {/* Диалог комментариев */}
      </LocalizationProvider>
      <Dialog open={commentOpen} onClose={onCloseComments} maxWidth="sm" fullWidth>
        <DialogTitle>Комментарии: {commentItem?.title}</DialogTitle>
        <DialogContent dividers>
          {commentError ? (
            <Alert severity="error" sx={{ mb: 2, borderRadius: 3 }}>
              {commentError}
            </Alert>
          ) : null}

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
