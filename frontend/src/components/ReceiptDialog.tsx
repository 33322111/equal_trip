import React from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Box,
  Button,
  Alert,
} from "@mui/material";
import DeleteForeverIcon from "@mui/icons-material/DeleteForever";

type Props = {
  open: boolean;
  title: string;
  url: string | null;
  onClose: () => void;
  onDownload: () => void;
  onDelete?: () => void; // optional
  deleteLabel?: string;
};

export default function ReceiptDialog({
  open,
  title,
  url,
  onClose,
  onDownload,
  onDelete,
  deleteLabel = "Удалить",
}: Props) {
  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>Чек: {title}</DialogTitle>

      <DialogContent dividers>
        {url ? (
          <Box display="flex" justifyContent="center">
            <img
              src={url}
              alt="receipt"
              style={{ maxWidth: "100%", height: "auto", borderRadius: 8 }}
            />
          </Box>
        ) : (
          <Alert severity="info">Чек не найден.</Alert>
        )}
      </DialogContent>

      <DialogActions>
        {url ? <Button onClick={onDownload}>Скачать</Button> : null}

        {url && onDelete ? (
          <Button color="error" onClick={onDelete} startIcon={<DeleteForeverIcon />}>
            {deleteLabel}
          </Button>
        ) : null}

        <Button onClick={onClose}>Закрыть</Button>
      </DialogActions>
    </Dialog>
  );
}