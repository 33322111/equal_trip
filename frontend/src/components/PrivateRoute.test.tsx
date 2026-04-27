import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { PrivateRoute } from "./PrivateRoute";

const mockUseAuth = vi.fn();

vi.mock("../context/AuthContext.js", () => ({
  useAuth: () => mockUseAuth(),
}));

function renderWithRouter() {
  render(
    <MemoryRouter initialEntries={["/private"]}>
      <Routes>
        <Route
          path="/private"
          element={
            <PrivateRoute>
              <div>Private Content</div>
            </PrivateRoute>
          }
        />
        <Route path="/" element={<div>Landing Content</div>} />
      </Routes>
    </MemoryRouter>
  );
}

describe("PrivateRoute", () => {
  beforeEach(() => {
    mockUseAuth.mockReset();
  });

  it("shows loading state while auth is being resolved", () => {
    mockUseAuth.mockReturnValue({
      isAuthenticated: false,
      isLoading: true,
    });

    renderWithRouter();
    expect(screen.getByText("Загрузка...")).toBeInTheDocument();
  });

  it("redirects unauthenticated user to root route", () => {
    mockUseAuth.mockReturnValue({
      isAuthenticated: false,
      isLoading: false,
    });

    renderWithRouter();
    expect(screen.getByText("Landing Content")).toBeInTheDocument();
  });

  it("renders children for authenticated user", () => {
    mockUseAuth.mockReturnValue({
      isAuthenticated: true,
      isLoading: false,
    });

    renderWithRouter();
    expect(screen.getByText("Private Content")).toBeInTheDocument();
  });
});
