import React, { useState } from "react";
import { Container, Typography, TextField, Button, Alert, Box } from "@mui/material";
import { requestPasswordReset } from "../api/passwordReset";
import { Link } from "react-router-dom";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success">("idle");
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setStatus("loading");
    try {
      await requestPasswordReset(email.trim());
      setStatus("success");
    } catch (err: any) {
      setError("Не удалось отправить письмо. Проверь email и попробуй снова.");
      setStatus("idle");
    }
  };

  return (
    <Container maxWidth="sm" sx={{ mt: 8 }}>
      <Typography variant="h4" gutterBottom>
        Сброс пароля
      </Typography>

      {status === "success" ? (
        <Alert severity="success" sx={{ mb: 2 }}>
          Если такой email зарегистрирован, письмо со ссылкой отправлено. Проверь консоль backend (в dev-режиме) или почту.
        </Alert>
      ) : null}

      {error ? (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      ) : null}

      <Box component="form" onSubmit={onSubmit}>
        <TextField
          label="Email"
          type="email"
          fullWidth
          margin="normal"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <Button type="submit" variant="contained" fullWidth disabled={status === "loading"} sx={{ mt: 2 }}>
          Отправить ссылку
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