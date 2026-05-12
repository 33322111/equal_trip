import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import ItinerarySection from "./ItinerarySection";

const mockUseAuth = vi.fn();
const mockListDays = vi.fn();
const mockListDayItems = vi.fn();

vi.mock("../../../context/AuthContext", () => ({
  useAuth: () => mockUseAuth(),
}));

vi.mock("../../../api/itinerary", () => ({
  listDays: (...args: unknown[]) => mockListDays(...args),
  createDay: vi.fn(),
  deleteDay: vi.fn(),
  listDayItems: (...args: unknown[]) => mockListDayItems(...args),
  createDayItem: vi.fn(),
  patchDayItem: vi.fn(),
  deleteDayItem: vi.fn(),
  addDayItemComment: vi.fn(),
  patchDayItemComment: vi.fn(),
  deleteDayItemComment: vi.fn(),
}));

vi.mock("@mui/x-date-pickers/DateCalendar", () => ({
  DateCalendar: ({ value }: { value: Date | null }) => (
    <div data-testid="date-calendar">{value ? value.toISOString().slice(0, 10) : "no-date"}</div>
  ),
}));

describe("ItinerarySection", () => {
  beforeEach(() => {
    mockUseAuth.mockReset();
    mockListDays.mockReset();
    mockListDayItems.mockReset();

    mockUseAuth.mockReturnValue({
      user: { id: 1, username: "owner" },
    });

    mockListDays.mockResolvedValue([
      { id: 1, date: "2026-05-11", title: "Day 1", items_count: 1 },
    ]);

    mockListDayItems.mockResolvedValue([
      {
        id: 10,
        title: "Morning walk",
        time_from: "09:00:00",
        time_to: "10:00:00",
        description: "Park",
        assignee: { id: 2, username: "member", email: "member@example.com" },
        is_done: false,
        comments: [],
      },
    ]);
  });

  it("opens edit dialog without crashing the page", async () => {
    const user = userEvent.setup();

    render(
      <ItinerarySection
        tripId={123}
        members={[
          {
            user: { id: 2, username: "member", email: "member@example.com" },
          },
        ]}
      />
    );

    await waitFor(() => {
      expect(mockListDays).toHaveBeenCalledWith(123);
      expect(mockListDayItems).toHaveBeenCalledWith(123, 1);
    });

    expect(await screen.findByText("Morning walk")).toBeInTheDocument();

    await user.click(screen.getByLabelText("edit-activity"));

    expect(await screen.findByText("Редактировать активность")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Morning walk")).toBeInTheDocument();
  });
});
