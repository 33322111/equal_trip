import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AuthProvider, useAuth } from "./AuthContext";

const { mockApiLogin, mockApiRegister, mockGetMe } = vi.hoisted(() => ({
  mockApiLogin: vi.fn(),
  mockApiRegister: vi.fn(),
  mockGetMe: vi.fn(),
}));

vi.mock("../api/auth", () => ({
  login: mockApiLogin,
  register: mockApiRegister,
  getMe: mockGetMe,
}));

function AuthConsumer() {
  const { user, isLoading, isAuthenticated, login, register, logout } = useAuth();

  return (
    <div>
      <div data-testid="loading-state">{String(isLoading)}</div>
      <div data-testid="auth-state">{String(isAuthenticated)}</div>
      <div data-testid="username">{user?.username ?? ""}</div>

      <button onClick={() => void login("ivan", "StrongPass1!")}>login-action</button>
      <button onClick={() => void register("new-user", "new@example.com", "StrongPass1!")}>register-action</button>
      <button onClick={() => logout()}>logout-action</button>
    </div>
  );
}

function renderProvider() {
  return render(
    <AuthProvider>
      <AuthConsumer />
    </AuthProvider>
  );
}

describe("AuthContext", () => {
  beforeEach(() => {
    localStorage.clear();
    mockApiLogin.mockReset();
    mockApiRegister.mockReset();
    mockGetMe.mockReset();
  });

  it("finishes loading without getMe call when no tokens are stored", async () => {
    renderProvider();

    await waitFor(() => {
      expect(screen.getByTestId("loading-state")).toHaveTextContent("false");
    });

    expect(screen.getByTestId("auth-state")).toHaveTextContent("false");
    expect(mockGetMe).not.toHaveBeenCalled();
  });

  it("restores session from stored tokens and getMe", async () => {
    localStorage.setItem("accessToken", "access");
    localStorage.setItem("refreshToken", "refresh");
    mockGetMe.mockResolvedValue({
      id: 1,
      username: "ivan",
      email: "ivan@example.com",
    });

    renderProvider();

    await waitFor(() => {
      expect(screen.getByTestId("loading-state")).toHaveTextContent("false");
      expect(screen.getByTestId("auth-state")).toHaveTextContent("true");
      expect(screen.getByTestId("username")).toHaveTextContent("ivan");
    });
  });

  it("clears broken stored tokens when getMe fails", async () => {
    localStorage.setItem("accessToken", "broken-access");
    localStorage.setItem("refreshToken", "broken-refresh");
    mockGetMe.mockRejectedValue(new Error("Unauthorized"));

    renderProvider();

    await waitFor(() => {
      expect(screen.getByTestId("loading-state")).toHaveTextContent("false");
      expect(screen.getByTestId("auth-state")).toHaveTextContent("false");
    });

    expect(localStorage.getItem("accessToken")).toBeNull();
    expect(localStorage.getItem("refreshToken")).toBeNull();
  });

  it("login stores tokens and loads user profile", async () => {
    mockApiLogin.mockResolvedValue({
      access: "new-access",
      refresh: "new-refresh",
    });
    mockGetMe.mockResolvedValue({
      id: 2,
      username: "ivan",
      email: "ivan@example.com",
    });

    renderProvider();
    await waitFor(() => expect(screen.getByTestId("loading-state")).toHaveTextContent("false"));

    await userEvent.click(screen.getByRole("button", { name: "login-action" }));

    await waitFor(() => {
      expect(screen.getByTestId("auth-state")).toHaveTextContent("true");
      expect(screen.getByTestId("username")).toHaveTextContent("ivan");
    });

    expect(mockApiLogin).toHaveBeenCalledWith({
      username: "ivan",
      password: "StrongPass1!",
    });
    expect(localStorage.getItem("accessToken")).toBe("new-access");
    expect(localStorage.getItem("refreshToken")).toBe("new-refresh");
  });

  it("register delegates to API and auto-logins user", async () => {
    mockApiRegister.mockResolvedValue({ id: 10 });
    mockApiLogin.mockResolvedValue({
      access: "access-after-register",
      refresh: "refresh-after-register",
    });
    mockGetMe.mockResolvedValue({
      id: 10,
      username: "new-user",
      email: "new@example.com",
    });

    renderProvider();
    await waitFor(() => expect(screen.getByTestId("loading-state")).toHaveTextContent("false"));

    await userEvent.click(screen.getByRole("button", { name: "register-action" }));

    await waitFor(() => {
      expect(screen.getByTestId("auth-state")).toHaveTextContent("true");
      expect(screen.getByTestId("username")).toHaveTextContent("new-user");
    });

    expect(mockApiRegister).toHaveBeenCalledWith({
      username: "new-user",
      email: "new@example.com",
      password: "StrongPass1!",
    });
    expect(mockApiLogin).toHaveBeenCalledWith({
      username: "new-user",
      password: "StrongPass1!",
    });
  });

  it("logout resets local auth state and tokens", async () => {
    localStorage.setItem("accessToken", "existing-access");
    localStorage.setItem("refreshToken", "existing-refresh");
    mockGetMe.mockResolvedValue({
      id: 3,
      username: "existing-user",
      email: "existing@example.com",
    });

    renderProvider();

    await waitFor(() => {
      expect(screen.getByTestId("auth-state")).toHaveTextContent("true");
    });

    await userEvent.click(screen.getByRole("button", { name: "logout-action" }));

    await waitFor(() => {
      expect(screen.getByTestId("auth-state")).toHaveTextContent("false");
      expect(screen.getByTestId("username")).toHaveTextContent("");
    });

    expect(localStorage.getItem("accessToken")).toBeNull();
    expect(localStorage.getItem("refreshToken")).toBeNull();
  });
});
