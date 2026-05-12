import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import TripsPage from "./TripsPage";

const { mockListTrips, mockCreateTrip } = vi.hoisted(() => ({
  mockListTrips: vi.fn(),
  mockCreateTrip: vi.fn(),
}));

vi.mock("../api/trips", () => ({
  listTrips: (...args: unknown[]) => mockListTrips(...args),
  createTrip: (...args: unknown[]) => mockCreateTrip(...args),
}));

vi.mock("@mui/x-date-pickers/LocalizationProvider", () => ({
  LocalizationProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@mui/x-date-pickers/AdapterDateFns", () => ({
  AdapterDateFns: function AdapterDateFns() {},
}));

vi.mock("@mui/x-date-pickers/DatePicker", () => ({
  DatePicker: ({
    label,
    value,
    onChange,
  }: {
    label: string;
    value: Date | null;
    onChange: (next: Date | null) => void;
  }) => (
    <label>
      {label}
      <input
        aria-label={label}
        value={value ? value.toISOString().slice(0, 10) : ""}
        onChange={(e) => {
          const next = e.target.value ? new Date(`${e.target.value}T00:00:00`) : null;
          onChange(next);
        }}
      />
    </label>
  ),
}));

function renderPage() {
  return render(
    <MemoryRouter>
      <TripsPage />
    </MemoryRouter>
  );
}

describe("TripsPage", () => {
  beforeEach(() => {
    mockListTrips.mockReset();
    mockCreateTrip.mockReset();
  });

  it("loads and displays grouped trips", async () => {
    mockListTrips.mockResolvedValue([
      {
        id: 1,
        title: "Текущая поездка",
        description: "",
        start_date: "2026-05-10",
        end_date: "2026-05-15",
        owner: { id: 1, username: "ivan", email: "ivan@example.com", avatar: null },
        created_at: "2026-05-01T10:00:00Z",
      },
      {
        id: 2,
        title: "Будущая поездка",
        description: "",
        start_date: "2026-06-01",
        end_date: "2026-06-10",
        owner: { id: 1, username: "ivan", email: "ivan@example.com", avatar: null },
        created_at: "2026-05-02T10:00:00Z",
      },
      {
        id: 3,
        title: "Прошлая поездка",
        description: "",
        start_date: "2026-04-01",
        end_date: "2026-04-05",
        owner: { id: 1, username: "ivan", email: "ivan@example.com", avatar: null },
        created_at: "2026-04-01T10:00:00Z",
      },
    ]);

    renderPage();

    expect(await screen.findByText("Текущая поездка")).toBeInTheDocument();
    expect(screen.getByText("Будущая поездка")).toBeInTheDocument();
    expect(screen.getByText("Прошлая поездка")).toBeInTheDocument();
    expect(screen.getByText("Текущие поездки")).toBeInTheDocument();
    expect(screen.getByText("Предстоящие поездки")).toBeInTheDocument();
    expect(screen.getByText("Завершенные поездки")).toBeInTheDocument();
  });

  it("shows validation error when title is empty", async () => {
    const user = userEvent.setup();
    mockListTrips.mockResolvedValue([]);

    renderPage();
    await screen.findByText("Пока нет поездок. Создай первую");

    await user.click(screen.getByRole("button", { name: "Создать" }));

    expect(await screen.findByText("Введите название поездки.")).toBeInTheDocument();
    expect(mockCreateTrip).not.toHaveBeenCalled();
  });

  it("creates trip with selected dates and reloads list", async () => {
    const user = userEvent.setup();
    mockListTrips
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: 5,
          title: "Новая поездка",
          description: "Описание",
          start_date: "2026-07-01",
          end_date: "2026-07-10",
          owner: { id: 1, username: "ivan", email: "ivan@example.com", avatar: null },
          created_at: "2026-05-12T10:00:00Z",
        },
      ]);
    mockCreateTrip.mockResolvedValue({ id: 5 });

    renderPage();
    await screen.findByText("Пока нет поездок. Создай первую");

    fireEvent.change(screen.getByLabelText("Название"), {
      target: { value: "Новая поездка" },
    });
    fireEvent.change(screen.getByLabelText("Описание"), {
      target: { value: "Описание" },
    });
    fireEvent.change(screen.getByLabelText("Дата начала"), {
      target: { value: "2026-07-01" },
    });
    fireEvent.change(screen.getByLabelText("Дата окончания"), {
      target: { value: "2026-07-10" },
    });
    await user.click(screen.getByRole("button", { name: "Создать" }));

    await waitFor(() => {
      expect(mockCreateTrip).toHaveBeenCalledWith({
        title: "Новая поездка",
        description: "Описание",
        start_date: "2026-07-01",
        end_date: "2026-07-10",
      });
    });

    expect(await screen.findByText("Новая поездка")).toBeInTheDocument();
  });
});
