import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import AboutPage from "../AboutPage";
import { SUPPORT_EMAIL } from "../../lib/appConfig";

describe("AboutPage", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders title and key sections", () => {
    render(<AboutPage />);

    expect(screen.getByRole("heading", { name: /about movie bowl/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /how it works/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /collaboration basics/i })).toBeInTheDocument();
  });

  it("renders a support mailto CTA", () => {
    render(<AboutPage />);

    const supportLink = screen.getByRole("link", { name: /contact support/i });
    expect(supportLink).toHaveAttribute("href", `mailto:${SUPPORT_EMAIL}`);
  });

  it("includes concise how-it-works bullets", () => {
    render(<AboutPage />);

    expect(screen.getByText(/create or join a bowl/i)).toBeInTheDocument();
    expect(screen.getByText(/add movies or custom entries/i)).toBeInTheDocument();
    expect(screen.getByText(/draw with optional filters and preferences/i)).toBeInTheDocument();
  });
});
