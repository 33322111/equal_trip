import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import RegisterPage from "./RegisterPage";

const { mockUseAuth, mockNavigate, mockRegister } = vi.hoisted(() => ({
  mockUseAuth: vi.fn(),
  mockNavigate: vi.fn(),
  mockRegister: vi.fn(),
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
      <RegisterPage />
    </MemoryRouter>
  );
}

async function fillBaseFields(user: ReturnType<typeof userEvent.setup>, overrides?: { password?: string; password2?: string }) {
  await user.type(screen.getByLabelText(/Имя пользователя/i), "ivan");
  await user.type(screen.getByLabelText(/Email/i), "ivan@example.com");
  await user.type(screen.getByLabelText(/^Пароль/i), overrides?.password ?? "StrongPass1!");
  await user.type(screen.getByLabelText(/Повторите пароль/i), overrides?.password2 ?? (overrides?.password ?? "StrongPass1!"));
}

describe("RegisterPage", () => {
  beforeEach(() => {
    localStorage.clear();
    mockNavigate.mockReset();
    mockRegister.mockReset();
    mockUseAuth.mockReset();
    mockUseAuth.mockReturnValue({
      register: mockRegister,
      isAuthenticated: false,
      isLoading: false,
    });
  });

  it("blocks submission when password does not meet requirements", async () => {
    const user = userEvent.setup();

    renderPage();
    await fillBaseFields(user, { password: "weak", password2: "weak" });
    await user.click(screen.getByRole("button", { name: "Зарегистрироваться" }));

    expect(await screen.findByText("Пароль не соответствует требованиям.")).toBeInTheDocument();
    expect(mockRegister).not.toHaveBeenCalled();
  });

  it("blocks submission when passwords do not match", async () => {
    const user = userEvent.setup();

    renderPage();
    await fillBaseFields(user, { password2: "AnotherPass1!" });
    await user.click(screen.getByRole("button", { name: "Зарегистрироваться" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Пароли не совпадают");
    expect(mockRegister).not.toHaveBeenCalled();
  });

  it("submits registration and navigates to trips", async () => {
    const user = userEvent.setup();
    mockRegister.mockResolvedValue(undefined);

    renderPage();
    await fillBaseFields(user);
    await user.click(screen.getByRole("button", { name: "Зарегистрироваться" }));

    await waitFor(() => {
      expect(mockRegister).toHaveBeenCalledWith("ivan", "ivan@example.com", "StrongPass1!");
      expect(mockNavigate).toHaveBeenCalledWith("/trips");
    });
  });

  it("shows translated API error returned from backend", async () => {
    const user = userEvent.setup();
    mockRegister.mockRejectedValue({
      response: {
        data: {
          email: ["Enter a valid email address."],
        },
      },
    });

    renderPage();
    await fillBaseFields(user);
    await user.click(screen.getByRole("button", { name: "Зарегистрироваться" }));

    expect(await screen.findByText("Введите корректный email.")).toBeInTheDocument();
  });
});
