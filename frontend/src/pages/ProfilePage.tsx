import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Container,
  Typography,
  TextField,
  Button,
  Avatar,
  Box,
  Alert,
  Paper,
} from "@mui/material";
import { getProfile, updateProfile, Profile } from "../api/profile";
import { API_BASE_URL } from "../config/runtime";
import { useAuth } from "../context/AuthContext";
import { extractApiErrorMessage } from "../utils/errorMessages";

export default function ProfilePage() {
  const { updateCurrentUser } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);

  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");

  const [avatarFile, setAvatarFile] = useState<File | null>(null);

  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [status, setStatus] = useState<"idle" | "saving" | "success">("idle");
  const [error, setError] = useState<string | null>(null);

  const savedAvatarUrl = useMemo(() => {
    if (!profile?.avatar) return undefined;
    return profile.avatar.startsWith("http")
      ? profile.avatar
      : `${API_BASE_URL}${profile.avatar}`;
  }, [profile?.avatar]);

  const avatarSrc = avatarPreviewUrl ?? savedAvatarUrl;

  useEffect(() => {
    getProfile()
      .then((p) => {
        setProfile(p);
        setUsername(p.username);
        setEmail(p.email);
      })
      .catch(() => setError("Не удалось загрузить профиль."));
  }, []);

  useEffect(() => {
    return () => {
      if (avatarPreviewUrl) URL.revokeObjectURL(avatarPreviewUrl);
    };
  }, [avatarPreviewUrl]);

  const onPickAvatar = (file: File | null) => {
    setStatus("idle");
    setError(null);

    if (avatarPreviewUrl) URL.revokeObjectURL(avatarPreviewUrl);

    if (!file) {
      setAvatarFile(null);
      setAvatarPreviewUrl(null);
      return;
    }

    setAvatarFile(file);
    setAvatarPreviewUrl(URL.createObjectURL(file));

    // чтобы можно было выбрать тот же файл повторно
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;

    setError(null);
    setStatus("saving");

    try {
      const form = new FormData();
      form.append("username", username);
      form.append("email", email);
      if (avatarFile) form.append("avatar", avatarFile);

      const updated = await updateProfile(form);
      setProfile(updated);
      updateCurrentUser(updated);

      // сохранено -> сбрасываем локальное превью
      if (avatarPreviewUrl) URL.revokeObjectURL(avatarPreviewUrl);
      setAvatarPreviewUrl(null);
      setAvatarFile(null);

      setStatus("success");
    } catch (err: any) {
      setError(
        extractApiErrorMessage(err, "Не удалось сохранить профиль.", ["avatar", "username", "email"])
      );
      setStatus("idle");
    }
  };

  if (!profile) {
    return (
      <Box sx={{ minHeight: "100%", backgroundColor: "#edf1f5", py: { xs: 4, md: 6 } }}>
        <Container maxWidth="sm">
          <Paper
            sx={{
              p: { xs: 2.5, md: 4 },
              borderRadius: 4,
              border: "1px solid #d6dee6",
              boxShadow: "0 18px 40px rgba(15, 23, 42, 0.08)",
            }}
          >
            {error ? (
              <Alert severity="error">{error}</Alert>
            ) : (
              <Typography color="text.secondary">Загрузка...</Typography>
            )}
          </Paper>
        </Container>
      </Box>
    );
  }

  return (
    <Box sx={{ minHeight: "100%", backgroundColor: "#edf1f5", py: { xs: 4, md: 6 } }}>
      <Container maxWidth="sm">
        <Paper sx={{ p: { xs: 2.5, md: 4 }, borderRadius: 4, border: "1px solid #d6dee6", boxShadow: "0 18px 40px rgba(15, 23, 42, 0.08)" }}>
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
            <Box
              display="flex"
              flexDirection={{ xs: "column", sm: "row" }}
              alignItems={{ xs: "flex-start", sm: "center" }}
              gap={2}
              mb={3}
            >
              <Avatar src={avatarSrc} sx={{ width: 80, height: 80 }} />

              <Box display="flex" flexDirection="column" gap={1} width={{ xs: "100%", sm: "auto" }}>
                <Button variant="outlined" component="label" sx={{ width: { xs: "100%", sm: "auto" } }}>
                  Загрузить аватар
                  <input
                    ref={fileInputRef}
                    type="file"
                    hidden
                    accept="image/jpeg,image/png,image/gif,image/webp"
                    onChange={(e) => onPickAvatar(e.target.files?.[0] ?? null)}
                  />
                </Button>

                {avatarFile ? (
                  <Button
                    variant="outlined"
                    color="error"
                    onClick={() => onPickAvatar(null)}
                    sx={{ width: { xs: "100%", sm: "auto" } }}
                  >
                    Сбросить выбор
                  </Button>
                ) : null}
              </Box>
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
        </Paper>
      </Container>
    </Box>
  );
}
