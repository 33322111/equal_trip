import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  AppBar,
  Toolbar,
  Typography,
  Box,
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
import { getProfile } from "../api/profile";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";

export default function Header() {
  const { isAuthenticated, logout, user } = useAuth();
  const navigate = useNavigate();

  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const open = Boolean(anchorEl);

  const [avatar, setAvatar] = useState<string | null>(null);

  const avatarUrl = useMemo(() => {
    if (!avatar) return undefined;
    return avatar.startsWith("http") ? avatar : `${API_BASE_URL}${avatar}`;
  }, [avatar]);

  useEffect(() => {
    let cancelled = false;

    if (!isAuthenticated) {
      setAvatar(null);
      return;
    }

    getProfile()
      .then((p) => {
        if (cancelled) return;
        setAvatar(p?.avatar ?? null);
      })
      .catch(() => {
        // если не удалось – просто оставим букву
        if (cancelled) return;
        setAvatar(null);
      });

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated]);

  const onLogout = () => {
    logout();
    setAnchorEl(null);
    navigate("/login");
  };

  return (
    <AppBar position="static">
      <Toolbar>
        <Typography
          variant="h6"
          component={Link}
          to="/"
          sx={{ flexGrow: 1, textDecoration: "none", color: "inherit" }}
        >
          EqualTrip
        </Typography>

        <Box>
          {!isAuthenticated ? (
            <Box sx={{ display: "flex", gap: 1 }}>
              <Typography
                component={Link}
                to="/login"
                style={{ color: "inherit", textDecoration: "none", marginRight: 12 }}
              >
                Войти
              </Typography>
              <Typography component={Link} to="/register" style={{ color: "inherit", textDecoration: "none" }}>
                Регистрация
              </Typography>
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