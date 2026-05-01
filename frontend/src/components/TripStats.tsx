import React, { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Box,
  Button,
  Divider,
  Paper,
  Stack,
  Typography,
  useMediaQuery,
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { TripStats } from "../api/stats";

const COLORS = ["#1976d2", "#14b8a6", "#f59e0b", "#ff7043", "#9c27b0", "#ef4444", "#0ea5e9", "#8b5cf6"];

function formatAmount(value: number) {
  return new Intl.NumberFormat("ru-RU", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export default function TripStatsView({ stats }: { stats: TripStats }) {
  const theme = useTheme();
  const isXs = useMediaQuery(theme.breakpoints.down("sm"));
  const isMdDown = useMediaQuery(theme.breakpoints.down("md"));
  const [showAllCategories, setShowAllCategories] = useState(false);

  const totalAmount = useMemo(() => Number(stats.total) || 0, [stats.total]);

  const pieData = useMemo(
    () =>
      stats.by_category
        .map((x, index) => {
          const amount = Number(x.amount);
          const share = totalAmount > 0 ? (amount / totalAmount) * 100 : 0;
          return {
            category: x.category,
            amount,
            share,
            color: COLORS[index % COLORS.length],
          };
        })
        .filter((x) => Number.isFinite(x.amount) && x.amount > 0)
        .sort((a, b) => b.amount - a.amount),
    [stats.by_category, totalAmount]
  );

  const barData = useMemo(
    () =>
      [...stats.by_user]
        .map((x) => ({
          username: x.username,
          amount: Number(x.amount),
        }))
        .sort((a, b) => b.amount - a.amount),
    [stats.by_user]
  );

  const chartHeight = isXs ? 260 : 320;
  const compactLegendCount = isXs ? 5 : 8;
  const canExpandCategories = pieData.length > compactLegendCount;
  const legendItems = showAllCategories ? pieData : pieData.slice(0, compactLegendCount);
  const extraCategories = Math.max(0, pieData.length - legendItems.length);

  return (
    <Paper sx={{ p: { xs: 2, md: 3 } }}>
      <Typography variant="h6" gutterBottom>
        Статистика расходов
      </Typography>

      <Typography sx={{ mb: 3 }}>
        Общий бюджет: <b>{formatAmount(totalAmount)} RUB</b>
      </Typography>

      <Typography variant="subtitle1" sx={{ mb: 1.5 }}>
        По категориям
      </Typography>

      {pieData.length > 0 ? (
        <Stack
          direction={{ xs: "column", lg: "row" }}
          spacing={{ xs: 2, lg: 3 }}
          alignItems={{ xs: "stretch", lg: "center" }}
        >
          <Box
            sx={{
              width: "100%",
              minWidth: 0,
              flex: { xs: "1 1 auto", lg: "0 0 420px" },
              alignSelf: "center",
            }}
          >
            <ResponsiveContainer width="100%" height={chartHeight}>
              <PieChart>
                <Pie
                  data={pieData}
                  dataKey="amount"
                  nameKey="category"
                  innerRadius={isXs ? 48 : 64}
                  outerRadius={isXs ? 88 : 112}
                  paddingAngle={2}
                  stroke="#ffffff"
                  strokeWidth={2}
                >
                  {pieData.map((entry) => (
                    <Cell key={entry.category} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value: number) => [`${formatAmount(Number(value))} RUB`, "Сумма"]}
                  labelFormatter={(label) => `Категория: ${label}`}
                />
              </PieChart>
            </ResponsiveContainer>
          </Box>

          <Box
            sx={{
              flex: "1 1 auto",
              minWidth: 0,
              border: "1px solid",
              borderColor: "divider",
              borderRadius: 3,
              p: 2,
              backgroundColor: "rgba(255,255,255,0.72)",
            }}
          >
            <Stack spacing={1.25} divider={<Divider flexItem />}>
              {legendItems.map((item) => (
                <Box
                  key={item.category}
                  display="flex"
                  alignItems="center"
                  justifyContent="space-between"
                  gap={1.5}
                  flexWrap="wrap"
                >
                  <Box display="flex" alignItems="center" gap={1.25} minWidth={0}>
                    <Box
                      sx={{
                        width: 12,
                        height: 12,
                        borderRadius: "50%",
                        backgroundColor: item.color,
                        flexShrink: 0,
                      }}
                    />
                    <Typography sx={{ minWidth: 0, wordBreak: "break-word" }}>
                      {item.category}
                    </Typography>
                  </Box>
                  <Typography
                    color="text.secondary"
                    sx={{ fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}
                  >
                    {formatAmount(item.amount)} RUB • {item.share.toFixed(1)}%
                  </Typography>
                </Box>
              ))}
            </Stack>

            {canExpandCategories ? (
              <Box sx={{ mt: 1.5 }}>
                {!showAllCategories && extraCategories > 0 ? (
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
                    И ещё {extraCategories} {extraCategories === 1 ? "категория" : extraCategories < 5 ? "категории" : "категорий"} в диаграмме.
                  </Typography>
                ) : null}
                <Button
                  variant="text"
                  onClick={() => setShowAllCategories((prev) => !prev)}
                  sx={{ px: 0, minWidth: 0, textTransform: "none", fontWeight: 600 }}
                >
                  {showAllCategories ? "Свернуть список категорий" : `Показать все категории (${pieData.length})`}
                </Button>
              </Box>
            ) : null}
          </Box>
        </Stack>
      ) : (
        <Typography color="text.secondary">Категории расходов пока отсутствуют.</Typography>
      )}

      <Typography variant="subtitle1" sx={{ mt: 4, mb: 1.5 }}>
        Кто сколько потратил после деления
      </Typography>

      <ResponsiveContainer width="100%" height={isMdDown ? 280 : 320}>
        <BarChart
          data={barData}
          margin={{
            top: 8,
            right: 8,
            left: isXs ? -20 : 0,
            bottom: isXs ? 52 : 12,
          }}
        >
          <XAxis
            dataKey="username"
            interval={0}
            angle={isXs ? -28 : 0}
            textAnchor={isXs ? "end" : "middle"}
            height={isXs ? 68 : 36}
          />
          <YAxis tickFormatter={(value) => formatAmount(Number(value))} width={isXs ? 56 : 80} />
          <Tooltip formatter={(value: number) => [`${formatAmount(Number(value))} RUB`, "Потрачено"]} />
          <Bar dataKey="amount" fill="#1976d2" radius={[8, 8, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </Paper>
  );
}
