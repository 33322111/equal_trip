import React from "react";
import { Box, Button, Container, Grid, Paper, Stack, Typography } from "@mui/material";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function LandingPage() {
  const { isAuthenticated } = useAuth();

  return (
    <Box sx={{ minHeight: "100%", backgroundColor: "#edf1f5", py: { xs: 4, md: 7 } }}>
      <Container>
        <Paper
          sx={{
            p: { xs: 2.5, md: 4 },
            borderRadius: 4,
            border: "1px solid #d6dee6",
            background: "linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)",
            boxShadow: "0 18px 40px rgba(15, 23, 42, 0.08)",
            mb: 3,
          }}
        >
          <Typography variant="h3" sx={{ fontSize: { xs: "2rem", md: "2.6rem" }, color: "#0f172a", mb: 1.25 }}>
            EqualTrip
          </Typography>
          <Typography sx={{ color: "#475569", maxWidth: 760, mb: 2 }}>
            Веб-приложение для совместных поездок: планируйте активности по дням, ведите чек-листы,
            фиксируйте расходы и автоматически считайте взаиморасчеты между участниками.
          </Typography>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
            {!isAuthenticated ? (
              <>
                <Button variant="contained" component={Link} to="/register">
                  Зарегистрироваться
                </Button>
                <Button variant="outlined" component={Link} to="/login">
                  Войти
                </Button>
              </>
            ) : (
              <Button variant="contained" component={Link} to="/trips">
                Перейти к поездкам
              </Button>
            )}
          </Stack>
        </Paper>

        <Grid container spacing={2}>
          <Grid size={{ xs: 12, md: 4 }}>
            <Paper sx={{ p: 2, borderRadius: 3, border: "1px solid #dbe3ea", height: "100%" }}>
              <Typography variant="h6" sx={{ mb: 1 }}>
                Планирование
              </Typography>
              <Typography color="text.secondary">
                Формируйте план поездки по дням и назначайте ответственных за активности.
              </Typography>
            </Paper>
          </Grid>
          <Grid size={{ xs: 12, md: 4 }}>
            <Paper sx={{ p: 2, borderRadius: 3, border: "1px solid #dbe3ea", height: "100%" }}>
              <Typography variant="h6" sx={{ mb: 1 }}>
                Контроль задач
              </Typography>
              <Typography color="text.secondary">
                Ведите чек-листы, отслеживайте прогресс и обсуждайте задачи в комментариях.
              </Typography>
            </Paper>
          </Grid>
          <Grid size={{ xs: 12, md: 4 }}>
            <Paper sx={{ p: 2, borderRadius: 3, border: "1px solid #dbe3ea", height: "100%" }}>
              <Typography variant="h6" sx={{ mb: 1 }}>
                Финансы
              </Typography>
              <Typography color="text.secondary">
                Добавляйте расходы, смотрите статистику и получайте готовые взаиморасчеты по группе.
              </Typography>
            </Paper>
          </Grid>
        </Grid>
      </Container>
    </Box>
  );
}
