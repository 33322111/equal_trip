import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { Box } from "@mui/material";

import LoginPage from "./pages/LoginPage.tsx";
import RegisterPage from "./pages/RegisterPage.tsx";
import TripsPage from "./pages/TripsPage.tsx";
import TripDetailsPage from "./pages/TripDetailPage.tsx";
import JoinByTokenPage from "./pages/JoinByInvitePage.tsx";
import LandingPage from "./pages/LandingPage";

import { PrivateRoute } from "./components/PrivateRoute.tsx";
import { useAuth } from "./context/AuthContext.tsx";

import ForgotPasswordPage from "./pages/ForgotPasswordPage";
import ResetPasswordPage from "./pages/ResetPasswordPage";
import ProfilePage from "./pages/ProfilePage";

import Header from "./components/Header";
import AppFooter from "./components/AppFooter";

const App: React.FC = () => {
  const { isAuthenticated } = useAuth();

  return (
    <Box sx={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <Header />

      <Box sx={{ flex: 1, backgroundColor: "#edf1f5" }}>
        <Routes>
          <Route path="/" element={isAuthenticated ? <Navigate to="/trips" replace /> : <LandingPage />} />
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

          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password/:token" element={<ResetPasswordPage />} />

          <Route
            path="/profile"
            element={
              <PrivateRoute>
                <ProfilePage />
              </PrivateRoute>
            }
          />
        </Routes>
      </Box>

      <AppFooter />
    </Box>
  );
};

export default App;
