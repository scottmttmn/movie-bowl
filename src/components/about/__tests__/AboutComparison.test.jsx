import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import AboutComparison from "../AboutComparison";

describe("AboutComparison", () => {
  afterEach(cleanup);

  it("places the bowl between browsing and recommendation without a straw man", () => {
    render(<AboutComparison />);

    expect(screen.getByRole("heading", { name: /where this sits/i })).toBeInTheDocument();
    expect(screen.getByText("Browse everything")).toBeInTheDocument();
    expect(screen.getByText("Draw from the bowl")).toBeInTheDocument();
    expect(screen.getByText("Take a recommendation")).toBeInTheDocument();
    expect(screen.getByText(/comfortable letting a system set the shortlist/i)).toBeInTheDocument();
  });

  it("stays static — the alternatives are described, not simulated", () => {
    render(<AboutComparison />);

    expect(screen.queryAllByRole("button")).toHaveLength(0);
    expect(screen.queryAllByRole("tab")).toHaveLength(0);
  });
});
