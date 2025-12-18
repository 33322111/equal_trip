import React from 'react';
import { Routes, Route, Link } from 'react-router-dom';
import { AppBar, Toolbar, Typography, Button, Box } from '@mui/material';

import LoginPage from './pages/LoginPage.tsx';
import RegisterPage from './pages/RegisterPage.tsx';
import TripsPage from './pages/TripsPage.tsx';

import TripDetailsPage from './pages/TripDetailPage.tsx';
import JoinByTokenPage from './pages/JoinByInvitePage.tsx';

import { PrivateRoute } from './components/PrivateRoute.tsx';
import { useAuth } from './context/AuthContext.tsx';

const App: React.FC = () => {
  const { isAuthenticated } = useAuth();

  return (
    <>
      <AppBar position="static">
        <Toolbar>
          <Typography
            variant="h6"
            component={Link}
            to="/"
            sx={{ flexGrow: 1, textDecoration: 'none', color: 'inherit' }}
          >
            EqualTrip
          </Typography>

          <Box>
            {isAuthenticated ? (
              <Button color="inherit" component={Link} to="/trips">
                Мои поездки
              </Button>
            ) : (
              <>
                <Button color="inherit" component={Link} to="/login">
                  Войти
                </Button>
                <Button color="inherit" component={Link} to="/register">
                  Регистрация
                </Button>
              </>
            )}
          </Box>
        </Toolbar>
      </AppBar>

      <Routes>
        <Route path="/" element={isAuthenticated ? <TripsPage /> : <LoginPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />

        <Route
          path="/trips"
          element={
            <PrivateRoute>
              <TripsPage />
            </PrivateRoute>
          }
        />

        <Route
          path="/trips/:id"
          element={
            <PrivateRoute>
              <TripDetailsPage />
            </PrivateRoute>
          }
        />

        <Route
          path="/join/:token"
          element={
            <PrivateRoute>
              <JoinByTokenPage />
            </PrivateRoute>
          }
        />
      </Routes>
    </>
  );
};

export default App;