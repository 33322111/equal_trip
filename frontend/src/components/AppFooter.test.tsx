import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import AppFooter from "./AppFooter";

describe("AppFooter", () => {
  it("renders support email link", () => {
    render(<AppFooter />);

    const supportLink = screen.getByRole("link", { name: "industroo@yandex.ru" });
    expect(supportLink).toBeInTheDocument();
    expect(supportLink).toHaveAttribute("href", "mailto:industroo@yandex.ru");
  });
});
