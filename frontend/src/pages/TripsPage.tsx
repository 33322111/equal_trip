import React, { useEffect, useState } from "react";
import { Container, Typography, Button, Box, TextField, Paper } from "@mui/material";
import { Link } from "react-router-dom";
import { listTrips, createTrip, Trip } from "../api/trips";

export default function TripsPage() {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [title, setTitle] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  const load = async () => {
    const data = await listTrips();
    setTrips(data);
  };

  useEffect(() => {
    load();
  }, []);

  const onCreate = async () => {
    if (!title.trim()) return;
    setIsCreating(true);
    try {
      await createTrip({ title });
      setTitle("");
      await load();
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <Container sx={{ mt: 4 }}>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography variant="h4">Мои поездки</Typography>
      </Box>

      <Paper sx={{ p: 2, mb: 3 }}>
        <Typography variant="h6" gutterBottom>Создать поездку</Typography>
        <Box display="flex" gap={2}>
          <TextField
            label="Название"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            fullWidth
          />
          <Button variant="contained" onClick={onCreate} disabled={isCreating}>
            Создать
          </Button>
        </Box>
      </Paper>

      <Box display="flex" flexDirection="column" gap={1}>
        {trips.map((t) => (
          <Paper key={t.id} sx={{ p: 2 }}>
            <Typography variant="h6">
              <Link to={`/trips/${t.id}`}>{t.title}</Link>
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Owner: {t.owner.username}
            </Typography>
          </Paper>
        ))}
        {trips.length === 0 && (
          <Typography color="text.secondary">Пока нет поездок. Создай первую</Typography>
        )}
      </Box>
    </Container>
  );
}