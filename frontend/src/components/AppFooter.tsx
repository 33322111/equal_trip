import React from "react";
import { Box, Container, Link, Typography } from "@mui/material";

export default function AppFooter() {
  return (
    <Box
      component="footer"
      sx={{
        borderTop: "1px solid #d6dee6",
        backgroundColor: "#f8fafc",
        py: 1.5,
      }}
    >
      <Container
        sx={{
          display: "flex",
          flexDirection: { xs: "column", sm: "row" },
          alignItems: { xs: "flex-start", sm: "center" },
          justifyContent: "space-between",
          gap: 0.75,
        }}
      >
        <Typography variant="body2" color="text.secondary">
          EqualTrip
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Поддержка:{" "}
          <Link href="mailto:industroo@yandex.ru" underline="hover" color="inherit">
            industroo@yandex.ru
          </Link>
        </Typography>
      </Container>
    </Box>
  );
}
