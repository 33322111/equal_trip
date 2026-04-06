import React, { useState } from "react";
import { Container, Typography, TextField, Button, Alert, Box, Paper } from "@mui/material";
import { confirmPasswordReset } from "../api/passwordReset";
import { useParams, useNavigate, Link } from "react-router-dom";

export default function ResetPasswordPage() {
  const { token } = useParams();
  const navigate = useNavigate();

  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success">("idle");
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!token) {
      setError("Токен не найден в ссылке.");
      return;
    }
    if (password !== password2) {
      setError("Пароли не совпадают.");
      return;
    }
    if (password.length < 8) {
      setError("Пароль должен быть не короче 8 символов.");
      return;
    }

    setStatus("loading");
    try {
      await confirmPasswordReset(token, password);
      setStatus("success");
      // на MVP просто отправим на login
      setTimeout(() => navigate("/login", { replace: true }), 800);
    } catch (err: any) {
      setError("Не удалось сбросить пароль. Возможно ссылка устарела.");
      setStatus("idle");
    }
  };

  return (
    <Box sx={{ minHeight: "100vh", backgroundColor: "#edf1f5", py: { xs: 4, md: 8 } }}>
      <Container maxWidth="sm">
        <Paper sx={{ p: { xs: 2.5, md: 4 }, borderRadius: 4, border: "1px solid #d6dee6", boxShadow: "0 18px 40px rgba(15, 23, 42, 0.08)" }}>
          <Typography variant="h4" gutterBottom>
            Новый пароль
          </Typography>

          {status === "success" ? (
            <Alert severity="success" sx={{ mb: 2 }}>
              Пароль изменён. Сейчас перенаправим на вход...
            </Alert>
          ) : null}

          {error ? (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          ) : null}

          <Box component="form" onSubmit={onSubmit}>
            <TextField
              label="Новый пароль"
              type="password"
              fullWidth
              margin="normal"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />

            <TextField
              label="Повторите пароль"
              type="password"
              fullWidth
              margin="normal"
              value={password2}
              onChange={(e) => setPassword2(e.target.value)}
              required
            />

            <Button type="submit" variant="contained" fullWidth disabled={status === "loading"} sx={{ mt: 2 }}>
              Сохранить пароль
            </Button>
          </Box>

          <Box mt={2}>
            <Typography variant="body2">
              <Link to="/login">Вернуться на вход</Link>
            </Typography>
          </Box>
        </Paper>
      </Container>
    </Box>
  );
}
