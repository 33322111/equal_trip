import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import JoinByInvitePage from "./JoinByInvitePage";

const { mockGetInviteInfo, mockAcceptInvite, mockUseAuth, mockNavigate, mockUseParams } = vi.hoisted(() => ({
  mockGetInviteInfo: vi.fn(),
  mockAcceptInvite: vi.fn(),
  mockUseAuth: vi.fn(),
  mockNavigate: vi.fn(),
  mockUseParams: vi.fn(),
}));

vi.mock("../api/trips", () => ({
  getInviteInfo: (...args: unknown[]) => mockGetInviteInfo(...args),
  acceptInvite: (...args: unknown[]) => mockAcceptInvite(...args),
}));

vi.mock("../context/AuthContext", () => ({
  useAuth: () => mockUseAuth(),
}));

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useParams: () => mockUseParams(),
  };
});

function renderPage() {
  return render(
    <MemoryRouter>
      <JoinByInvitePage />
    </MemoryRouter>
  );
}

describe("JoinByInvitePage", () => {
  beforeEach(() => {
    localStorage.clear();
    mockGetInviteInfo.mockReset();
    mockAcceptInvite.mockReset();
    mockUseAuth.mockReset();
    mockNavigate.mockReset();
    mockUseParams.mockReset();
    mockUseParams.mockReturnValue({ token: "invite-token" });
  });

  it("redirects unauthenticated user to login and stores token", async () => {
    mockUseAuth.mockReturnValue({
      isAuthenticated: false,
      isLoading: false,
    });

    renderPage();

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith("/login", { replace: true });
    });
    expect(localStorage.getItem("pendingInviteToken")).toBe("invite-token");
  });

  it("loads and displays invite information for authenticated user", async () => {
    mockUseAuth.mockReturnValue({
      isAuthenticated: true,
      isLoading: false,
    });
    mockGetInviteInfo.mockResolvedValue({
      token: "invite-token",
      is_member: false,
      trip: {
        id: 7,
        title: "Лето в Казани",
        start_date: "2026-07-01",
        end_date: "2026-07-05",
        owner: { id: 1, username: "owner", email: "owner@example.com" },
      },
    });

    renderPage();

    expect(await screen.findByText(/Лето в Казани/)).toBeInTheDocument();
    expect(screen.getByText(/owner@example.com/)).toBeInTheDocument();
    expect(mockGetInviteInfo).toHaveBeenCalledWith("invite-token");
  });

  it("accepts invite, clears token and navigates to trip", async () => {
    const user = userEvent.setup();
    mockUseAuth.mockReturnValue({
      isAuthenticated: true,
      isLoading: false,
    });
    mockGetInviteInfo.mockResolvedValue({
      token: "invite-token",
      is_member: false,
      trip: {
        id: 7,
        title: "Лето в Казани",
        start_date: "2026-07-01",
        end_date: "2026-07-05",
        owner: { id: 1, username: "owner", email: "owner@example.com" },
      },
    });
    mockAcceptInvite.mockResolvedValue({ trip_id: 7 });
    localStorage.setItem("pendingInviteToken", "invite-token");

    renderPage();
    await screen.findByText(/Лето в Казани/);

    await user.click(screen.getByRole("button", { name: "Принять приглашение" }));

    await waitFor(() => {
      expect(mockAcceptInvite).toHaveBeenCalledWith("invite-token");
      expect(mockNavigate).toHaveBeenCalledWith("/trips/7", { replace: true });
    });
    expect(localStorage.getItem("pendingInviteToken")).toBeNull();
  });

  it("clears invalid token and shows error when invite is not found", async () => {
    mockUseAuth.mockReturnValue({
      isAuthenticated: true,
      isLoading: false,
    });
    localStorage.setItem("pendingInviteToken", "invite-token");
    mockGetInviteInfo.mockRejectedValue({
      response: {
        status: 404,
        data: { detail: "Invite not found." },
      },
    });

    renderPage();

    expect(await screen.findByText("Приглашение не найдено.")).toBeInTheDocument();
    expect(localStorage.getItem("pendingInviteToken")).toBeNull();
  });
});
