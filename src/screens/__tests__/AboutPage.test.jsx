import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AboutPage from "../AboutPage";
import { SUPPORT_EMAIL } from "../../lib/appConfig";

const mockUseAuth = vi.hoisted(() => vi.fn());

vi.mock("../../hooks/useAuth", () => ({
  default: mockUseAuth,
}));

function renderAboutPage() {
  return render(
    <MemoryRouter>
      <AboutPage />
    </MemoryRouter>
  );
}

describe("AboutPage", () => {
  beforeEach(() => {
    mockUseAuth.mockReturnValue({ session: null });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("renders the new product story and key sections", () => {
    renderAboutPage();

    expect(
      screen.getByRole("heading", { name: /stop searching\. start watching\./i })
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /three ways to choose/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /what movie bowl believes/i })).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /everyone is ready to watch/i })
    ).toBeInTheDocument();
    expect(screen.getByText(/built for couples, families/i)).toBeInTheDocument();
  });

  it("renders support and signed-out product actions", () => {
    renderAboutPage();

    const supportLink = screen.getByRole("link", { name: /contact support/i });
    expect(supportLink).toHaveAttribute("href", `mailto:${SUPPORT_EMAIL}`);
    screen.getAllByRole("link", { name: /start a bowl/i }).forEach((link) => {
      expect(link).toHaveAttribute("href", "/login");
    });
  });

  it("renders a signed-in action for authenticated visitors", () => {
    mockUseAuth.mockReturnValue({
      session: { user: { id: "user-1", email: "user@example.com" } },
    });

    renderAboutPage();

    screen.getAllByRole("link", { name: /open my bowls/i }).forEach((link) => {
      expect(link).toHaveAttribute("href", "/");
    });
  });

  it("explains the product flow and contributor-first fairness", () => {
    renderAboutPage();

    expect(screen.getByText(/collect over time/i)).toBeInTheDocument();
    expect(screen.getByText(/filter for tonight/i)).toBeInTheDocument();
    expect(screen.getByText(/draw together/i)).toBeInTheDocument();
    expect(
      screen.getByText(/the bowl selects a member first, then one of their movies/i)
    ).toBeInTheDocument();
  });
});
