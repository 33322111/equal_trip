import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import ForgotPasswordPage from "./ForgotPasswordPage";

const { mockRequestPasswordReset } = vi.hoisted(() => ({
  mockRequestPasswordReset: vi.fn(),
}));

vi.mock("../api/passwordReset", () => ({
  requestPasswordReset: (...args: unknown[]) => mockRequestPasswordReset(...args),
}));

function renderPage() {
  return render(
    <MemoryRouter>
      <ForgotPasswordPage />
    </MemoryRouter>
  );
}

describe("ForgotPasswordPage", () => {
  beforeEach(() => {
    mockRequestPasswordReset.mockReset();
  });

  it("submits trimmed email and shows success message", async () => {
    const user = userEvent.setup();
    mockRequestPasswordReset.mockResolvedValue({});

    renderPage();

    await user.type(screen.getByLabelText(/Email/i), "  ivan@example.com  ");
    await user.click(screen.getByRole("button", { name: "Отправить ссылку" }));

    await waitFor(() => {
      expect(mockRequestPasswordReset).toHaveBeenCalledWith("ivan@example.com");
    });

    expect(
      await screen.findByText("Если такой email зарегистрирован, письмо со ссылкой отправлено.")
    ).toBeInTheDocument();
  });

  it("shows success message even when reset endpoint fails", async () => {
    const user = userEvent.setup();
    mockRequestPasswordReset.mockRejectedValue(new Error("Server error"));

    renderPage();

    await user.type(screen.getByLabelText(/Email/i), "ivan@example.com");
    await user.click(screen.getByRole("button", { name: "Отправить ссылку" }));

    expect(
      await screen.findByText("Если такой email зарегистрирован, письмо со ссылкой отправлено.")
    ).toBeInTheDocument();
  });
});
