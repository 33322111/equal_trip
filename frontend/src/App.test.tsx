import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import App from "./App";

const mockUseAuth = vi.fn();

vi.mock("./context/AuthContext.tsx", () => ({
  useAuth: () => mockUseAuth(),
}));

vi.mock("./components/Header", () => ({
  default: () => <div>Header Mock</div>,
}));

vi.mock("./components/AppFooter", () => ({
  default: () => <div>Footer Mock</div>,
}));

vi.mock("./components/PrivateRoute.tsx", () => ({
  PrivateRoute: ({ children }: { children: JSX.Element }) => <>{children}</>,
}));

vi.mock("./pages/LandingPage", () => ({
  default: () => <div>Landing Mock</div>,
}));

vi.mock("./pages/LoginPage.tsx", () => ({
  default: () => <div>Login Mock</div>,
}));

vi.mock("./pages/RegisterPage.tsx", () => ({
  default: () => <div>Register Mock</div>,
}));

vi.mock("./pages/TripsPage.tsx", () => ({
  default: () => <div>Trips Mock</div>,
}));

vi.mock("./pages/TripDetailPage.tsx", () => ({
  default: () => <div>Trip Details Mock</div>,
}));

vi.mock("./pages/JoinByInvitePage.tsx", () => ({
  default: () => <div>Join Invite Mock</div>,
}));

vi.mock("./pages/ForgotPasswordPage", () => ({
  default: () => <div>Forgot Password Mock</div>,
}));

vi.mock("./pages/ResetPasswordPage", () => ({
  default: () => <div>Reset Password Mock</div>,
}));

vi.mock("./pages/ProfilePage", () => ({
  default: () => <div>Profile Mock</div>,
}));

function renderApp(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>
  );
}

describe("App routing", () => {
  beforeEach(() => {
    mockUseAuth.mockReset();
  });

  it("shows landing page at root for guest users", () => {
    mockUseAuth.mockReturnValue({
      isAuthenticated: false,
    });

    renderApp("/");
    expect(screen.getByText("Landing Mock")).toBeInTheDocument();
  });

  it("redirects authenticated user from root to trips page", async () => {
    mockUseAuth.mockReturnValue({
      isAuthenticated: true,
    });

    renderApp("/");
    expect(await screen.findByText("Trips Mock")).toBeInTheDocument();
  });
});
