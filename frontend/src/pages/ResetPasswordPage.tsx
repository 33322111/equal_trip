import React, { useState } from "react";
import { Container, Typography, TextField, Button, Alert, Box } from "@mui/material";
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
    <Container maxWidth="sm" sx={{ mt: 8 }}>
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
    </Container>
  );
}