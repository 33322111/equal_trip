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
  canDownload?: boolean;
  canDelete?: boolean;
};

function isPdfUrl(url: string) {
  return url.split("?")[0].toLowerCase().endsWith(".pdf");
}

export default function ReceiptDialog({
  open,
  title,
  url,
  onClose,
  onDownload,
  onDelete,
  deleteLabel = "Удалить",
  canDownload,
  canDelete,
}: Props) {
  const isPdf = url ? isPdfUrl(url) : false;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>Чек: {title}</DialogTitle>

      <DialogContent dividers>
        {url ? (
          isPdf ? (
            <Box sx={{ width: "100%", height: { xs: 420, md: 720 } }}>
              <object data={url} type="application/pdf" width="100%" height="100%">
                <Alert severity="info" sx={{ mt: 1 }}>
                  Предпросмотр PDF не поддерживается в этом браузере. Открой или скачай чек ниже.
                </Alert>
              </object>
            </Box>
          ) : (
            <Box display="flex" justifyContent="center">
              <img
                src={url}
                alt="receipt"
                style={{ maxWidth: "100%", height: "auto", borderRadius: 8 }}
              />
            </Box>
          )
        ) : (
          <Alert severity="info">Чек не найден.</Alert>
        )}
      </DialogContent>

      <DialogActions sx={{ flexDirection: { xs: "column", sm: "row" }, gap: 1, alignItems: "stretch" }}>
        {url && (canDownload ?? true) ? <Button onClick={onDownload}>Скачать</Button> : null}

        {url && onDelete && (canDelete ?? true) ? (
          <Button color="error" onClick={onDelete} startIcon={<DeleteForeverIcon />}>
            {deleteLabel}
          </Button>
        ) : null}

        <Button onClick={onClose}>Закрыть</Button>
      </DialogActions>
    </Dialog>
  );
}
