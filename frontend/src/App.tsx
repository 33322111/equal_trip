import React from "react";
import { Routes, Route } from "react-router-dom";

import LoginPage from "./pages/LoginPage.tsx";
import RegisterPage from "./pages/RegisterPage.tsx";
import TripsPage from "./pages/TripsPage.tsx";
import TripDetailsPage from "./pages/TripDetailPage.tsx";
import JoinByTokenPage from "./pages/JoinByInvitePage.tsx";

import { PrivateRoute } from "./components/PrivateRoute.tsx";
import { useAuth } from "./context/AuthContext.tsx";

import ForgotPasswordPage from "./pages/ForgotPasswordPage";
import ResetPasswordPage from "./pages/ResetPasswordPage";
import ProfilePage from "./pages/ProfilePage";

import Header from "./components/Header";

const App: React.FC = () => {
  const { isAuthenticated } = useAuth();

  return (
    <>
      <Header />

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
    </>
  );
};

export default App;