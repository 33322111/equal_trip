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
          flexWrap: "nowrap",
          justifyContent: "space-between",
          alignItems: "center",
          gap: { xs: 1, sm: 2 },
          py: { xs: 0.5, sm: 0 },
          minHeight: { xs: 56, sm: 64 },
        }}
      >
        <Box
          component={Link}
          to="/"
          sx={{
            flexGrow: 1,
            textDecoration: "none",
            color: "inherit",
            display: "flex",
            alignItems: "center",
            minWidth: 0,
            minHeight: { xs: 40, sm: 58 },
          }}
        >
          <Box
            component="img"
            src="/logo.png"
            alt="EqualTrip"
            sx={{
              height: { xs: 28, sm: 56 },
              width: "auto",
              maxWidth: { xs: 132, sm: 500 },
              objectFit: "contain",
              display: "block",
              flexShrink: 1,
            }}
          />
        </Box>

        <Box sx={{ display: "flex", justifyContent: "flex-end", flexShrink: 0 }}>
          {!isAuthenticated ? (
            <Box sx={{ display: "flex", gap: { xs: 0.25, sm: 1 }, flexWrap: "nowrap", justifyContent: "flex-end" }}>
              <Button
                component={Link}
                to="/login"
                color="inherit"
                size="small"
                sx={{
                  minWidth: 0,
                  px: { xs: 0.75, sm: 1.25 },
                  fontSize: { xs: "0.82rem", sm: "0.875rem" },
                  whiteSpace: "nowrap",
                }}
              >
                Войти
              </Button>
              <Button
                component={Link}
                to="/register"
                color="inherit"
                size="small"
                sx={{
                  minWidth: 0,
                  px: { xs: 0.75, sm: 1.25 },
                  fontSize: { xs: "0.82rem", sm: "0.875rem" },
                  whiteSpace: "nowrap",
                }}
              >
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
