import React, { useRef } from "react";
import { YMaps, Map as YandexMap, Placemark, SearchControl } from "@pbe/react-yandex-maps";

type Props = {
  center: [number, number];
  selectedPoint: [number, number] | null;
  height: number;
  onPickPoint: (lat: number, lng: number) => void;
};

export default function ExpenseLocationMapPicker({ center, selectedPoint, height, onPickPoint }: Props) {
  const searchControlRef = useRef<any>(null);

  return (
    <YMaps query={{ apikey: import.meta.env.VITE_YMAPS_API_KEY }}>
      <YandexMap
        state={{ center, zoom: 10 }}
        width="100%"
        height={height}
        onClick={(event: any) => {
          const coords = event.get("coords") as number[] | undefined;
          if (!coords || coords.length < 2) return;
          const nextLat = Number(coords[0].toFixed(6));
          const nextLng = Number(coords[1].toFixed(6));
          onPickPoint(nextLat, nextLng);
        }}
      >
        <SearchControl
          instanceRef={searchControlRef}
          options={{
            float: "right",
            noPlacemark: true,
            placeholderContent: "Найти адрес или место",
          }}
          modules={["control.SearchControl"]}
          onResultSelect={async (event: any) => {
            const index = event.get("index");
            const control = searchControlRef.current;
            if (!control) return;
            const result = await control.getResult(index);
            const coords = result?.geometry?.getCoordinates?.();
            if (!coords || coords.length < 2) return;
            const nextLat = Number(coords[0].toFixed(6));
            const nextLng = Number(coords[1].toFixed(6));
            onPickPoint(nextLat, nextLng);
          }}
        />
        {selectedPoint ? <Placemark geometry={selectedPoint} /> : null}
      </YandexMap>
    </YMaps>
  );
}
