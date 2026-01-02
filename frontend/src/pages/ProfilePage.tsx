import React, { useEffect, useState } from "react";
import {
  Container,
  Typography,
  TextField,
  Button,
  Avatar,
  Box,
  Alert,
} from "@mui/material";
import { getProfile, updateProfile, Profile } from "../api/profile";

export default function ProfilePage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [status, setStatus] = useState<"idle" | "saving" | "success">("idle");
  const [error, setError] = useState<string | null>(null);
  const API_BASE_URL = "http://localhost:8000";

  const avatarUrl =
    profile?.avatar
      ? (profile.avatar.startsWith("http") ? profile.avatar : `${API_BASE_URL}${profile.avatar}`)
      : undefined;

  useEffect(() => {
    getProfile().then((p) => {
      setProfile(p);
      setUsername(p.username);
      setEmail(p.email);
    });
  }, []);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setStatus("saving");

    try {
      const form = new FormData();
      form.append("username", username);
      form.append("email", email);
      if (avatarFile) form.append("avatar", avatarFile);

      const updated = await updateProfile(form);
      setProfile(updated);
      setStatus("success");
    } catch (err) {
      setError("Не удалось сохранить профиль.");
      setStatus("idle");
    }
  };

  if (!profile) return <div>Загрузка...</div>;

  return (
    <Container maxWidth="sm" sx={{ mt: 6 }}>
      <Typography variant="h4" gutterBottom>
        Профиль
      </Typography>

      {status === "success" && (
        <Alert severity="success" sx={{ mb: 2 }}>
          Профиль обновлён
        </Alert>
      )}
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      <Box component="form" onSubmit={onSubmit}>
        <Box display="flex" alignItems="center" gap={2} mb={3}>
          <Avatar
            src={avatarUrl}
            sx={{ width: 80, height: 80 }}
          />
          <Button variant="outlined" component="label">
            Загрузить аватар
            <input
              type="file"
              hidden
              accept="image/*"
              onChange={(e) =>
                setAvatarFile(e.target.files?.[0] || null)
              }
            />
          </Button>
        </Box>

        <TextField
          label="Имя пользователя"
          fullWidth
          margin="normal"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />
        <TextField
          label="Email"
          fullWidth
          margin="normal"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />

        <Button
          type="submit"
          variant="contained"
          disabled={status === "saving"}
          sx={{ mt: 2 }}
        >
          Сохранить
        </Button>
      </Box>
    </Container>
  );
}