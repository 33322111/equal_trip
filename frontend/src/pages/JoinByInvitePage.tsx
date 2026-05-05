import React, { useEffect, useState } from "react";
import { Container, Typography, Box, Paper, Alert, Button, Stack } from "@mui/material";
import { useNavigate, useParams } from "react-router-dom";
import { acceptInvite, getInviteInfo, InviteInfo } from "../api/trips";
import { useAuth } from "../context/AuthContext";
import { extractApiErrorMessage } from "../utils/errorMessages";

const PENDING_INVITE_TOKEN_KEY = "pendingInviteToken";

function formatTripDates(start: string | null, end: string | null) {
  if (!start && !end) return "Даты не указаны";

  const fmt = new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

  const formatOne = (value: string) => {
    const d = new Date(`${value}T00:00:00`);
    return Number.isNaN(d.getTime()) ? value : fmt.format(d);
  };

  if (start && end) return `${formatOne(start)} — ${formatOne(end)}`;
  return formatOne(start ?? end!);
}

export default function JoinByInvitePage() {
  const { token } = useParams();
  const navigate = useNavigate();
  const { isAuthenticated, isLoading } = useAuth();
  const [inviteInfo, setInviteInfo] = useState<InviteInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const clearPendingInviteToken = () => localStorage.removeItem(PENDING_INVITE_TOKEN_KEY);

  useEffect(() => {
    if (!token) {
      setError("Ссылка приглашения некорректна.");
      setLoading(false);
      return;
    }

    localStorage.setItem(PENDING_INVITE_TOKEN_KEY, token);

    if (isLoading) {
      setLoading(true);
      return;
    }

    if (!isAuthenticated) {
      navigate("/login", { replace: true });
      return;
    }

    setLoading(true);
    setError(null);

    getInviteInfo(token)
      .then((info) => {
        setInviteInfo(info);
      })
      .catch((e: any) => {
        const statusCode = e?.response?.status;
        if (statusCode === 400 || statusCode === 404) {
          clearPendingInviteToken();
        }
        setError(extractApiErrorMessage(e, "Не удалось загрузить приглашение."));
      })
      .finally(() => setLoading(false));
  }, [token, isAuthenticated, isLoading, navigate]);

  const onAccept = async () => {
    if (!token) return;
    setSubmitting(true);
    setError(null);
    try {
      const { trip_id } = await acceptInvite(token);
      clearPendingInviteToken();
      navigate(`/trips/${trip_id}`, { replace: true });
    } catch (e: any) {
      const statusCode = e?.response?.status;
      if (statusCode === 400 || statusCode === 404) {
        clearPendingInviteToken();
      }
      setError(extractApiErrorMessage(e, "Не удалось принять приглашение."));
    } finally {
      setSubmitting(false);
    }
  };

  const onDecline = () => {
    clearPendingInviteToken();
    navigate("/trips", { replace: true });
  };

  return (
    <Box sx={{ minHeight: "100%", backgroundColor: "#edf1f5", py: { xs: 4, md: 8 } }}>
      <Container maxWidth="sm">
        <Paper
          sx={{
            p: { xs: 2.5, md: 4 },
            borderRadius: 4,
            border: "1px solid #d6dee6",
            boxShadow: "0 18px 40px rgba(15, 23, 42, 0.08)",
          }}
        >
          <Typography variant="h5" sx={{ mb: 2 }}>
            Приглашение в поездку
          </Typography>

          {loading ? <Typography color="text.secondary">Загрузка приглашения...</Typography> : null}

          {error ? (
            <Stack spacing={1.5} sx={{ mb: 2 }}>
              <Alert severity="error">{error}</Alert>
              <Button variant="outlined" onClick={onDecline}>
                К моим поездкам
              </Button>
            </Stack>
          ) : null}

          {!loading && inviteInfo ? (
            <Stack spacing={1.25}>
              <Typography>
                <b>Название:</b> {inviteInfo.trip.title}
              </Typography>
              <Typography>
                <b>Даты:</b> {formatTripDates(inviteInfo.trip.start_date, inviteInfo.trip.end_date)}
              </Typography>
              <Typography>
                <b>Владелец:</b> {inviteInfo.trip.owner.username} ({inviteInfo.trip.owner.email})
              </Typography>

              {inviteInfo.is_member ? (
                <Alert severity="info" sx={{ mt: 1 }}>
                  Вы уже состоите в этой поездке.
                </Alert>
              ) : null}

              <Stack direction={{ xs: "column", sm: "row" }} spacing={1.25} sx={{ pt: 1 }}>
                <Button variant="contained" onClick={onAccept} disabled={submitting || inviteInfo.is_member}>
                  Принять приглашение
                </Button>
                <Button variant="outlined" color="inherit" onClick={onDecline} disabled={submitting}>
                  Отклонить
                </Button>
              </Stack>
            </Stack>
          ) : null}

          {!loading && !inviteInfo && !error ? (
            <Button variant="outlined" onClick={onDecline}>
              К моим поездкам
            </Button>
          ) : null}
        </Paper>
      </Container>
    </Box>
  );
}
