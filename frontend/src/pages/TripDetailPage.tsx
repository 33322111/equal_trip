import React, { useEffect, useState } from "react";
import { Container, Typography, Paper, Box, Button } from "@mui/material";
import { useParams } from "react-router-dom";
import { createInvite, getTrip, TripDetail } from "../api/trips";
import { useAuth } from "../context/AuthContext";

export default function TripDetailPage() {
  const { id } = useParams();
  const tripId = Number(id);

  const { user } = useAuth();
  const [trip, setTrip] = useState<TripDetail | null>(null);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);

  const load = async () => {
    const data = await getTrip(tripId);
    setTrip(data);
  };

  useEffect(() => {
    load();
  }, [tripId]);

  const isOwner = trip?.owner?.id === user?.id;

  const onCreateInvite = async () => {
    const { token } = await createInvite(tripId);
    const url = `${window.location.origin}/join/${token}`;
    setInviteUrl(url);
    await navigator.clipboard.writeText(url);
  };

  if (!trip) return <div>Загрузка...</div>;

  return (
    <Container sx={{ mt: 4 }}>
      <Typography variant="h4" gutterBottom>{trip.title}</Typography>

      <Paper sx={{ p: 2, mb: 3 }}>
        <Typography variant="h6">Участники</Typography>
        {trip.members.map((m) => (
          <Box key={m.id} display="flex" justifyContent="space-between" py={0.5}>
            <Typography>{m.user.username} ({m.user.email})</Typography>
            <Typography color="text.secondary">{m.role}</Typography>
          </Box>
        ))}
      </Paper>

      {isOwner && (
        <Paper sx={{ p: 2 }}>
          <Typography variant="h6" gutterBottom>Приглашение по ссылке</Typography>
          <Button variant="contained" onClick={onCreateInvite}>
            Сгенерировать ссылку (и скопировать)
          </Button>
          {inviteUrl && (
            <Typography sx={{ mt: 2 }} color="text.secondary">
              {inviteUrl}
            </Typography>
          )}
        </Paper>
      )}
    </Container>
  );
}