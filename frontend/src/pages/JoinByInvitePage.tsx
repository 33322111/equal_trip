import React, { useEffect, useState } from "react";
import { Container, Typography, Box, Paper } from "@mui/material";
import { useNavigate, useParams } from "react-router-dom";
import { acceptInvite } from "../api/trips";

export default function JoinByInvitePage() {
  const { token } = useParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState("Присоединяемся к поездке...");

  useEffect(() => {
    const run = async () => {
      try {
        if (!token) throw new Error("no token");
        const { trip_id } = await acceptInvite(token);
        navigate(`/trips/${trip_id}`, { replace: true });
      } catch (e) {
        setStatus("Не удалось принять приглашение (возможно, ссылка устарела).");
      }
    };
    run();
  }, [token, navigate]);

  return (
    <Box sx={{ minHeight: "100vh", backgroundColor: "#edf1f5", py: { xs: 4, md: 8 } }}>
      <Container maxWidth="sm">
        <Paper sx={{ p: { xs: 2.5, md: 4 }, borderRadius: 4, border: "1px solid #d6dee6", boxShadow: "0 18px 40px rgba(15, 23, 42, 0.08)" }}>
          <Typography>{status}</Typography>
        </Paper>
      </Container>
    </Box>
  );
}
