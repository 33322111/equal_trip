import React from "react";
import { Paper, Typography } from "@mui/material";
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis
} from "recharts";
import { TripStats } from "../api/stats";
import { useMemo } from "react";


const COLORS = ["#0088FE", "#00C49F", "#FFBB28", "#FF8042", "#9C27B0"];

export default function TripStatsView({ stats }: { stats: TripStats }) {
    const pieData = useMemo(
    () =>
      stats.by_category
        .map((x) => ({
          category: x.category,
          amount: Number(x.amount),
        }))
        .filter((x) => Number.isFinite(x.amount) && x.amount > 0),
    [stats]
  );

  const barData = useMemo(
    () =>
      stats.by_user.map((x) => ({
        username: x.username,
        amount: Number(x.amount),
      })),
    [stats]
  );

  return (
    <Paper sx={{ p: 2 }}>
      <Typography variant="h6" gutterBottom>
        Статистика расходов
      </Typography>

      <Typography sx={{ mb: 2 }}>
        Общий бюджет: <b>{stats.total} RUB</b>
      </Typography>
      <Typography variant="subtitle1">По категориям</Typography>
      <ResponsiveContainer width="100%" height={250}>
        <PieChart>
          <Pie
            data={pieData}
            dataKey="amount"
            nameKey="category"
            label
          >
            {pieData.map((_, i) => (
              <Cell key={i} fill={COLORS[i % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip />
        </PieChart>
      </ResponsiveContainer>

      <Typography variant="subtitle1" sx={{ mt: 3 }}>
        Кто сколько потратил
      </Typography>

      <ResponsiveContainer width="100%" height={250}>
        <BarChart data={stats.by_user}>
          <XAxis dataKey="username" />
          <YAxis />
          <Tooltip />
          <Bar dataKey="amount" fill="#1976d2" />
        </BarChart>
      </ResponsiveContainer>
    </Paper>
  );
}