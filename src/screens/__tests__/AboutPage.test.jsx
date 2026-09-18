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

  it("renders the hero and the origin story that carries the page", () => {
    renderAboutPage();

    expect(
      screen.getByRole("heading", { name: /stop searching\. start watching\./i })
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /why there is a bowl/i })).toBeInTheDocument();
    expect(screen.getByText(/began because of a problem with my girlfriend/i)).toBeInTheDocument();
    expect(screen.getByText(/chance is not a compromise/i)).toBeInTheDocument();
  });

  it("puts a working draw in the hero rather than describing one", () => {
    renderAboutPage();

    expect(screen.getByRole("button", { name: /draw tonight's movie/i })).toBeInTheDocument();
  });

  it("pairs each thing that went wrong with the feature that answers it", () => {
    renderAboutPage();

    expect(
      screen.getByRole("heading", { name: /then i started noticing things/i })
    ).toBeInTheDocument();
    expect(screen.getByText(/one person could dominate the bowl/i)).toBeInTheDocument();
    expect(screen.getByText(/the draw picks a person first/i)).toBeInTheDocument();
    expect(screen.getByText(/most importantly, the bowl was in one location/i))
      .toBeInTheDocument();
  });

  it("hands a reader the directions for running a bowl on paper", () => {
    renderAboutPage();

    expect(screen.getByText(/i encourage you to go right ahead/i)).toBeInTheDocument();
    const directions = screen.getByRole("heading", { name: /how to run a bowl out of paper/i })
      .parentElement.querySelectorAll("ol > li");
    expect(directions).toHaveLength(7);
    expect(screen.getByText(/folded so that the title is hidden/i)).toBeInTheDocument();
  });

  it("signs the page once, at the end", () => {
    renderAboutPage();

    // The signature sat under the story while the page kept talking in first
    // person afterwards, which read as a false ending. One signature, last.
    const signatures = screen.getAllByText(/^— Scott$/);
    expect(signatures).toHaveLength(1);
    expect(screen.getByText("Welcome.")).toBeInTheDocument();
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

  it("leaves first-run guidance to the empty My Bowls screen", () => {
    renderAboutPage();

    // The real onboarding lives there. This page explains why the app exists,
    // and a second set of steps here would compete with it.
    expect(screen.queryByText(/collect over time/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/filter for tonight/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /where this sits/i })).not.toBeInTheDocument();
  });

  it("attributes TMDB and JustWatch data", () => {
    renderAboutPage();

    expect(screen.getByText(/uses the TMDB API but is not endorsed or certified/i))
      .toBeInTheDocument();
    expect(screen.getByRole("link", { name: /the movie database/i }))
      .toHaveAttribute("href", "https://www.themoviedb.org");
    expect(screen.getByRole("link", { name: "JustWatch" }))
      .toHaveAttribute("href", "https://www.justwatch.com");
  });
});
