import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import LoginPage from "./LoginPage";

const { mockUseAuth, mockNavigate, mockLogin } = vi.hoisted(() => ({
  mockUseAuth: vi.fn(),
  mockNavigate: vi.fn(),
  mockLogin: vi.fn(),
}));

vi.mock("../context/AuthContext", () => ({
  useAuth: () => mockUseAuth(),
}));

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

function renderPage() {
  return render(
    <MemoryRouter>
      <LoginPage />
    </MemoryRouter>
  );
}

describe("LoginPage", () => {
  beforeEach(() => {
    localStorage.clear();
    mockNavigate.mockReset();
    mockLogin.mockReset();
    mockUseAuth.mockReset();
    mockUseAuth.mockReturnValue({
      login: mockLogin,
      isAuthenticated: false,
      isLoading: false,
    });
  });

  it("submits credentials and navigates to trips", async () => {
    const user = userEvent.setup();
    mockLogin.mockResolvedValue(undefined);

    renderPage();

    await user.type(screen.getByLabelText(/Имя пользователя/i), "ivan");
    await user.type(screen.getByLabelText(/Пароль/i), "StrongPass1!");
    await user.click(screen.getByRole("button", { name: "Войти" }));

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith("ivan", "StrongPass1!");
      expect(mockNavigate).toHaveBeenCalledWith("/trips");
    });
  });

  it("navigates to pending invite after successful login when token is stored", async () => {
    const user = userEvent.setup();
    mockLogin.mockResolvedValue(undefined);
    localStorage.setItem("pendingInviteToken", "invite-123");

    renderPage();

    await user.type(screen.getByLabelText(/Имя пользователя/i), "ivan");
    await user.type(screen.getByLabelText(/Пароль/i), "StrongPass1!");
    await user.click(screen.getByRole("button", { name: "Войти" }));

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith("/join/invite-123");
    });
  });

  it("shows auth error on failed login", async () => {
    const user = userEvent.setup();
    mockLogin.mockRejectedValue(new Error("Unauthorized"));

    renderPage();

    await user.type(screen.getByLabelText(/Имя пользователя/i), "ivan");
    await user.type(screen.getByLabelText(/Пароль/i), "wrong");
    await user.click(screen.getByRole("button", { name: "Войти" }));

    expect(await screen.findByText("Неверное имя пользователя или пароль")).toBeInTheDocument();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it("redirects authenticated user on mount", async () => {
    localStorage.setItem("pendingInviteToken", "stored-token");
    mockUseAuth.mockReturnValue({
      login: mockLogin,
      isAuthenticated: true,
      isLoading: false,
    });

    renderPage();

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith("/join/stored-token", { replace: true });
    });
  });
});
