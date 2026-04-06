import React, { useMemo, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Container, TextField, Button, Typography, Box, Alert, Paper, Stack } from '@mui/material';
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import RadioButtonUncheckedIcon from "@mui/icons-material/RadioButtonUnchecked";

type PasswordRule = {
  id: string;
  label: string;
  check: (value: string) => boolean;
};

const PASSWORD_RULES: PasswordRule[] = [
  { id: "len", label: "Минимум 8 символов", check: (value) => value.length >= 8 },
  { id: "upper", label: "Хотя бы 1 заглавная буква", check: (value) => /[A-Z]/.test(value) },
  { id: "lower", label: "Хотя бы 1 строчная буква", check: (value) => /[a-z]/.test(value) },
  { id: "digit", label: "Хотя бы 1 цифра", check: (value) => /\d/.test(value) },
  { id: "special", label: "Хотя бы 1 спецсимвол", check: (value) => /[^\w\s]/.test(value) },
];

const RegisterPage: React.FC = () => {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const passwordRuleResults = useMemo(
    () =>
      PASSWORD_RULES.map((rule) => ({
        ...rule,
        passed: rule.check(password),
      })),
    [password]
  );

  const isPasswordValid = passwordRuleResults.every((r) => r.passed);
  const isPasswordMismatch = password2.length > 0 && password !== password2;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!isPasswordValid) {
      setError('Пароль не соответствует требованиям.');
      return;
    }

    if (password !== password2) {
      setError('Пароли не совпадают');
      return;
    }

    setIsSubmitting(true);
    try {
      await register(username, email, password);
      navigate('/trips');
    } catch (err: any) {
      const data = err?.response?.data;
      const details = [
        ...(Array.isArray(data?.password) ? data.password : []),
        ...(Array.isArray(data?.username) ? data.username : []),
        ...(Array.isArray(data?.email) ? data.email : []),
      ];

      if (details.length > 0) {
        setError(details.join(' '));
        return;
      }

      if (typeof data?.detail === "string") {
        setError(data.detail);
        return;
      }

      setError('Ошибка регистрации');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Box sx={{ minHeight: "100vh", backgroundColor: "#edf1f5", py: { xs: 4, md: 8 } }}>
      <Container maxWidth="sm">
        <Paper sx={{ p: { xs: 2.5, md: 4 }, borderRadius: 4, border: "1px solid #d6dee6", boxShadow: "0 18px 40px rgba(15, 23, 42, 0.08)" }}>
          <Typography variant="h4" gutterBottom>
            Регистрация в EqualTrip
          </Typography>
          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}
          <Box component="form" onSubmit={handleSubmit}>
            <TextField
              label="Имя пользователя"
              fullWidth
              margin="normal"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
            <TextField
              label="Email"
              type="email"
              fullWidth
              margin="normal"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <TextField
              label="Пароль"
              type="password"
              fullWidth
              margin="normal"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <Paper
              variant="outlined"
              sx={{
                p: 1.5,
                borderRadius: 2,
                borderColor: "#dbe3ea",
                backgroundColor: "#f8fafc",
                mt: 1,
              }}
            >
              <Typography variant="subtitle2" sx={{ mb: 1 }}>
                Требования к паролю
              </Typography>
              <Stack spacing={0.75}>
                {passwordRuleResults.map((rule) => (
                  <Box key={rule.id} display="flex" alignItems="center" gap={1}>
                    {rule.passed ? (
                      <CheckCircleOutlineIcon color="success" fontSize="small" />
                    ) : (
                      <RadioButtonUncheckedIcon sx={{ color: "#94a3b8", fontSize: 17 }} />
                    )}
                    <Typography
                      variant="body2"
                      sx={{ color: rule.passed ? "success.main" : "text.secondary" }}
                    >
                      {rule.label}
                    </Typography>
                  </Box>
                ))}
              </Stack>
            </Paper>
            <TextField
              label="Повторите пароль"
              type="password"
              fullWidth
              margin="normal"
              value={password2}
              onChange={(e) => setPassword2(e.target.value)}
              error={isPasswordMismatch}
              helperText={isPasswordMismatch ? "Пароли не совпадают" : " "}
              required
            />
            <Button
              type="submit"
              variant="contained"
              fullWidth
              disabled={isSubmitting}
              sx={{ mt: 2 }}
            >
              Зарегистрироваться
            </Button>
          </Box>
          <Box mt={2}>
            <Typography variant="body2">
              Уже есть аккаунт? <Link to="/login">Войти</Link>
            </Typography>
          </Box>
        </Paper>
      </Container>
    </Box>
  );
};

export default RegisterPage;
