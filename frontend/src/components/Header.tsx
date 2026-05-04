import React, { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  AppBar,
  Toolbar,
  Box,
  Button,
  IconButton,
  Avatar,
  Menu,
  MenuItem,
  ListItemIcon,
  Divider,
  Tooltip,
} from "@mui/material";

import PersonIcon from "@mui/icons-material/Person";
import LuggageIcon from "@mui/icons-material/Luggage";
import LogoutIcon from "@mui/icons-material/Logout";

import { useAuth } from "../context/AuthContext";
import { API_BASE_URL } from "../config/runtime";

export default function Header() {
  const { isAuthenticated, logout, user } = useAuth();
  const navigate = useNavigate();

  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const open = Boolean(anchorEl);

  const avatarUrl = useMemo(() => {
    if (!user?.avatar) return undefined;
    const baseUrl = user.avatar.startsWith("http") ? user.avatar : `${API_BASE_URL}${user.avatar}`;
    const separator = baseUrl.includes("?") ? "&" : "?";
    return `${baseUrl}${separator}v=${user.avatarVersion ?? 0}`;
  }, [user?.avatar, user?.avatarVersion]);

  const onLogout = () => {
    logout();
    setAnchorEl(null);
    navigate("/");
  };

  return (
    <AppBar position="static">
      <Toolbar
        sx={{
          flexWrap: { xs: "wrap", sm: "nowrap" },
          gap: { xs: 1, sm: 0 },
          py: { xs: 0.5, sm: 0 },
        }}
      >
        <Box
          component={Link}
          to="/"
          sx={{
            flexGrow: 1,
            textDecoration: "none",
            color: "inherit",
            width: { xs: "100%", sm: "auto" },
            display: "flex",
            alignItems: "center",
            minHeight: { xs: 40, sm: 58 },
          }}
        >
          <Box
            component="img"
            src="/logo.png"
            alt="EqualTrip"
            sx={{
              height: { xs: 38, sm: 56 },
              width: "auto",
              maxWidth: { xs: "100%", sm: 500 },
              objectFit: "contain",
              display: "block",
            }}
          />
        </Box>

        <Box sx={{ width: { xs: "100%", sm: "auto" }, display: "flex", justifyContent: "flex-end" }}>
          {!isAuthenticated ? (
            <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", justifyContent: "flex-end" }}>
              <Button
                component={Link}
                to="/login"
                color="inherit"
                size="small"
              >
                Войти
              </Button>
              <Button component={Link} to="/register" color="inherit" size="small">
                Регистрация
              </Button>
            </Box>
          ) : (
            <>
              <Tooltip title="Меню">
                <IconButton onClick={(e) => setAnchorEl(e.currentTarget)} size="small" sx={{ ml: 1 }}>
                  <Avatar
                    src={avatarUrl}
                    alt={user?.username ?? "avatar"}
                    imgProps={{
                      referrerPolicy: "no-referrer",
                    }}
                  >
                    {(user?.username ?? "U").slice(0, 1).toUpperCase()}
                  </Avatar>
                </IconButton>
              </Tooltip>

              <Menu
                anchorEl={anchorEl}
                open={open}
                onClose={() => setAnchorEl(null)}
                onClick={() => setAnchorEl(null)}
                transformOrigin={{ horizontal: "right", vertical: "top" }}
                anchorOrigin={{ horizontal: "right", vertical: "bottom" }}
              >
                <MenuItem component={Link} to="/profile">
                  <ListItemIcon>
                    <PersonIcon fontSize="small" />
                  </ListItemIcon>
                  Профиль
                </MenuItem>

                <MenuItem component={Link} to="/trips">
                  <ListItemIcon>
                    <LuggageIcon fontSize="small" />
                  </ListItemIcon>
                  Мои поездки
                </MenuItem>

                <Divider />

                <MenuItem onClick={onLogout}>
                  <ListItemIcon>
                    <LogoutIcon fontSize="small" />
                  </ListItemIcon>
                  Выйти
                </MenuItem>
              </Menu>
            </>
          )}
        </Box>
      </Toolbar>
    </AppBar>
  );
}
