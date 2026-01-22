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
} from "@mui/material";

import DeleteIcon from "@mui/icons-material/Delete";
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
  Checklist,
  ChecklistItem,
} from "../../../api/checklists";

type MemberUser = { id: number; username: string; email: string };

type Props = {
  tripId: number;
  members: { user: MemberUser }[];
  onError: (msg: string) => void;
};

export default function ChecklistSection({ tripId, members, onError }: Props) {
  const [checklists, setChecklists] = useState<Checklist[]>([]);
  const [activeChecklistId, setActiveChecklistId] = useState<number | null>(null);
  const [checklistItems, setChecklistItems] = useState<ChecklistItem[]>([]);

  const [newChecklistTitle, setNewChecklistTitle] = useState<string>(
    "Список дел / паковочный лист"
  );

  const [itemTitle, setItemTitle] = useState("");
  const [itemDueDate, setItemDueDate] = useState<string>("");
  const [itemAssigneeId, setItemAssigneeId] = useState<number | null>(null);

  // comments dialog
  const [commentOpen, setCommentOpen] = useState(false);
  const [commentItem, setCommentItem] = useState<ChecklistItem | null>(null);
  const [commentText, setCommentText] = useState("");

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
    reloadChecklists().catch(() => onError("Не удалось загрузить чек-листы"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripId]);

  // load items when active checklist changes
  useEffect(() => {
    if (!activeChecklistId) {
      setChecklistItems([]);
      return;
    }
    reloadItems(activeChecklistId).catch(() => onError("Не удалось загрузить задачи чек-листа"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripId, activeChecklistId]);

  const onCreateChecklist = async () => {
    try {
      const title = newChecklistTitle.trim() || "Чек-лист";
      const created = await createChecklist(tripId, title);

      await reloadChecklists();
      setActiveChecklistId(created.id);
    } catch {
      onError("Не удалось создать чек-лист.");
    }
  };

  const onDeleteChecklist = async (cid: number) => {
    if (!window.confirm("Удалить чек-лист?")) return;
    try {
      await deleteChecklist(tripId, cid);
      await reloadChecklists();
      // items подтянутся useEffectом
    } catch {
      onError("Не удалось удалить чек-лист.");
    }
  };

  const onAddItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeChecklistId) return;

    if (!itemTitle.trim()) {
      onError("Введите название задачи.");
      return;
    }

    try {
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
      onError("Не удалось добавить задачу.");
    }
  };

  const onToggleDone = async (it: ChecklistItem) => {
    if (!activeChecklistId) return;
    try {
      await patchChecklistItem(tripId, activeChecklistId, it.id, { is_done: !it.is_done });
      await reloadItems(activeChecklistId);
    } catch {
      onError("Не удалось обновить задачу.");
    }
  };

  const onDeleteItem = async (itemId: number) => {
    if (!activeChecklistId) return;
    if (!window.confirm("Удалить задачу?")) return;

    try {
      await deleteChecklistItem(tripId, activeChecklistId, itemId);
      await reloadItems(activeChecklistId);
    } catch {
      onError("Не удалось удалить задачу.");
    }
  };

  const onOpenComments = (it: ChecklistItem) => {
    setCommentItem(it);
    setCommentText("");
    setCommentOpen(true);
  };

  const onCloseComments = () => {
    setCommentOpen(false);
    setCommentItem(null);
    setCommentText("");
  };

  const onSendComment = async () => {
    if (!activeChecklistId || !commentItem) return;
    const text = commentText.trim();
    if (!text) return;

    try {
      await addChecklistComment(tripId, activeChecklistId, commentItem.id, text);
      setCommentText("");
      await reloadItems(activeChecklistId);

      // обновим commentItem, чтобы новые комментарии сразу были видны
      const updated = (await listChecklistItems(tripId, activeChecklistId)).find(
        (x) => x.id === commentItem.id
      );
      if (updated) setCommentItem(updated);
    } catch {
      onError("Не удалось добавить комментарий.");
    }
  };

  return (
    <>
      <Paper sx={{ p: 2, mt: 3 }}>
        <Typography variant="h6" gutterBottom>
          Чек-листы и задачи
        </Typography>

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
            >
              {c.title}
            </Button>
          ))}

          {activeChecklistId ? (
            <Button color="error" variant="text" onClick={() => onDeleteChecklist(activeChecklistId)}>
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
              <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
                <TextField
                  label="Задача"
                  value={itemTitle}
                  onChange={(e) => setItemTitle(e.target.value)}
                  fullWidth
                />

                <Autocomplete
                  sx={{ minWidth: 240 }}
                  options={members.map((m) => m.user)}
                  getOptionLabel={(u) => `${u.username} (${u.email})`}
                  value={
                    itemAssigneeId ? members.map((m) => m.user).find((u) => u.id === itemAssigneeId) ?? null : null
                  }
                  onChange={(_, v) => setItemAssigneeId(v ? v.id : null)}
                  renderInput={(params) => <TextField {...params} label="Ответственный" />}
                />

                <TextField
                  label="Срок"
                  type="date"
                  value={itemDueDate}
                  onChange={(e) => setItemDueDate(e.target.value)}
                  InputLabelProps={{ shrink: true }}
                  sx={{ minWidth: 170 }}
                />

                <Button type="submit" variant="contained">
                  Добавить
                </Button>
              </Stack>
            </Box>

            {/* список задач */}
            <Box display="flex" flexDirection="column" gap={1}>
              {checklistItems.map((it) => (
                <Paper key={it.id} variant="outlined" sx={{ p: 1.5 }}>
                  <Box display="flex" alignItems="center" justifyContent="space-between" gap={2}>
                    <Box display="flex" alignItems="center" gap={1} sx={{ minWidth: 0 }}>
                      <Checkbox checked={it.is_done} onChange={() => onToggleDone(it)} />
                      <Box sx={{ minWidth: 0 }}>
                        <Typography fontWeight={600} noWrap>
                          {it.title}
                        </Typography>
                        <Typography variant="body2" color="text.secondary" noWrap>
                          {it.assignee ? `Ответственный: ${it.assignee.username}` : "Ответственный: —"}
                          {it.due_date ? ` • Срок: ${it.due_date}` : ""}
                        </Typography>
                      </Box>
                    </Box>

                    <Box display="flex" alignItems="center" gap={1}>
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
                <Typography color="text.secondary">Пока задач нет. Добавь первую</Typography>
              ) : null}
            </Box>
          </>
        )}
      </Paper>

      {/* Диалог комментариев */}
      <Dialog open={commentOpen} onClose={onCloseComments} maxWidth="sm" fullWidth>
        <DialogTitle>Комментарии: {commentItem?.title}</DialogTitle>
        <DialogContent dividers>
          {(commentItem?.comments ?? []).map((c: any) => (
            <Paper key={c.id} variant="outlined" sx={{ p: 1, mb: 1 }}>
              <Typography variant="body2" fontWeight={600}>
                {c.user.username}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {c.text}
              </Typography>
            </Paper>
          ))}

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