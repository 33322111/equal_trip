import React, { useState } from "react";
import { Container, Typography, TextField, Button, Alert, Box, Paper } from "@mui/material";
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
      setStatus("success");
    }
  };

  return (
    <Box sx={{ minHeight: "100vh", backgroundColor: "#edf1f5", py: { xs: 4, md: 8 } }}>
      <Container maxWidth="sm">
        <Paper sx={{ p: { xs: 2.5, md: 4 }, borderRadius: 4, border: "1px solid #d6dee6", boxShadow: "0 18px 40px rgba(15, 23, 42, 0.08)" }}>
          <Typography variant="h4" gutterBottom>
            Сброс пароля
          </Typography>

          {status === "success" ? (
            <Alert severity="success" sx={{ mb: 2 }}>
              Если такой email зарегистрирован, письмо со ссылкой отправлено.
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
        </Paper>
      </Container>
    </Box>
  );
}
