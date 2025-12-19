import React from "react";
import { YMaps, Map, Placemark } from "@pbe/react-yandex-maps";
import { Paper, Typography } from "@mui/material";
import { Expense } from "../api/expenses";

interface Props {
  expenses: Expense[];
}

const DEFAULT_CENTER: [number, number] = [55.751244, 37.618423]; // Москва

export default function TripMap({ expenses }: Props) {
  const points = expenses.filter((e) => e.lat && e.lng);

  const center: [number, number] =
    points.length > 0
      ? [Number(points[0].lat), Number(points[0].lng)]
      : DEFAULT_CENTER;

  return (
    <Paper sx={{ p: 2 }}>
      <Typography variant="h6" gutterBottom>
        Карта поездки
      </Typography>

      <YMaps query={{ apikey: import.meta.env.VITE_YMAPS_API_KEY }}>
        <Map
          defaultState={{ center, zoom: 10 }}
          width="100%"
          height={400}
        >
          {points.map((e) => (
            <Placemark
              key={e.id}
              geometry={[Number(e.lat), Number(e.lng)]}
              properties={{
                balloonContent: `
                  <b>${e.title}</b><br/>
                  ${e.amount} ${e.currency}<br/>
                  оплатил: ${e.created_by.username}
                `,
              }}
            />
          ))}
        </Map>
      </YMaps>
    </Paper>
  );
}