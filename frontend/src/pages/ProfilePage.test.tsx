import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import ProfilePage from "./ProfilePage";

const { mockGetProfile, mockUpdateProfile, mockUseAuth } = vi.hoisted(() => ({
  mockGetProfile: vi.fn(),
  mockUpdateProfile: vi.fn(),
  mockUseAuth: vi.fn(),
}));

vi.mock("../api/profile", () => ({
  getProfile: (...args: unknown[]) => mockGetProfile(...args),
  updateProfile: (...args: unknown[]) => mockUpdateProfile(...args),
}));

vi.mock("../context/AuthContext", () => ({
  useAuth: () => mockUseAuth(),
}));

describe("ProfilePage", () => {
  beforeEach(() => {
    mockGetProfile.mockReset();
    mockUpdateProfile.mockReset();
    mockUseAuth.mockReset();
    mockUseAuth.mockReturnValue({
      updateCurrentUser: vi.fn(),
    });
  });

  it("loads and shows profile data", async () => {
    mockGetProfile.mockResolvedValue({
      id: 1,
      username: "ivan",
      email: "ivan@example.com",
      avatar: null,
    });

    render(<ProfilePage />);

    expect(await screen.findByDisplayValue("ivan")).toBeInTheDocument();
    expect(screen.getByDisplayValue("ivan@example.com")).toBeInTheDocument();
  });

  it("shows load error when profile request fails", async () => {
    mockGetProfile.mockRejectedValue(new Error("boom"));

    render(<ProfilePage />);

    expect(await screen.findByText("Не удалось загрузить профиль.")).toBeInTheDocument();
  });

  it("submits updated profile and shows success state", async () => {
    const user = userEvent.setup();
    const updateCurrentUser = vi.fn();
    mockUseAuth.mockReturnValue({ updateCurrentUser });
    mockGetProfile.mockResolvedValue({
      id: 1,
      username: "ivan",
      email: "ivan@example.com",
      avatar: null,
    });
    mockUpdateProfile.mockResolvedValue({
      id: 1,
      username: "ivan-updated",
      email: "new@example.com",
      avatar: null,
    });

    render(<ProfilePage />);

    const usernameInput = await screen.findByDisplayValue("ivan");
    const emailInput = screen.getByDisplayValue("ivan@example.com");

    await user.clear(usernameInput);
    await user.type(usernameInput, "ivan-updated");
    await user.clear(emailInput);
    await user.type(emailInput, "new@example.com");
    await user.click(screen.getByRole("button", { name: "Сохранить" }));

    await waitFor(() => {
      expect(mockUpdateProfile).toHaveBeenCalledTimes(1);
      expect(updateCurrentUser).toHaveBeenCalledWith({
        id: 1,
        username: "ivan-updated",
        email: "new@example.com",
        avatar: null,
      });
    });

    expect(await screen.findByText("Профиль обновлён")).toBeInTheDocument();
  });
});
