import React, { useEffect, useState } from "react";
import { Container, Typography } from "@mui/material";
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
    <Container sx={{ mt: 8 }}>
      <Typography>{status}</Typography>
    </Container>
  );
}