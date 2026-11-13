import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import RestaurantSheet from "../RestaurantSheet";

const slip = { id: "r1", tmdb_id: null, title: "La Rana Bistro", cuisine: "Mediterranean", place_id: "ChIJlarana", added_by: "u1" };
const BOWL_ID = "bowl-1";

const answer = (details) => vi.fn(async () => ({ available: true, details }));

afterEach(cleanup);

describe("RestaurantSheet", () => {
  it("asks Google only for the drawn pick, and shows no photo", async () => {
    const getPlaceDetails = answer({
      openNow: true,
      nextCloseTime: new Date(Date.now() + 3_600_000).toISOString(),
      utcOffsetMinutes: 0,
      phone: "+15635550101",
      phoneLabel: "(563) 555-0101",
      website: "https://laranabistro.com/",
      reserveUrl: "https://maps.google.com/?cid=1",
    });

    render(<RestaurantSheet slip={slip} tonight bowlId={BOWL_ID} getPlaceDetails={getPlaceDetails} onClose={vi.fn()} />);

    expect(await screen.findByRole("link", { name: "Reserve a table" })).toHaveAttribute("href", "https://maps.google.com/?cid=1");
    expect(getPlaceDetails).toHaveBeenCalledWith({ placeId: "ChIJlarana", bowlId: BOWL_ID, signal: expect.anything() });
    expect(screen.getByText(/^Open until/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Website" })).toHaveAttribute("href", "https://laranabistro.com/");
    expect(screen.getByRole("link", { name: "Call" })).toHaveAttribute("href", "tel:+15635550101");
    expect(screen.getByRole("link", { name: "Directions" }).getAttribute("href")).toContain("query_place_id=ChIJlarana");
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.getByText("Google Maps")).toBeInTheDocument();
  });

  it("spends nothing on a slip opened from a list, or one Google never found", () => {
    const getPlaceDetails = answer({});
    render(<RestaurantSheet slip={slip} bowlId={BOWL_ID} getPlaceDetails={getPlaceDetails} onClose={vi.fn()} />);
    cleanup();
    render(<RestaurantSheet slip={{ ...slip, place_id: null }} tonight bowlId={BOWL_ID} getPlaceDetails={getPlaceDetails} onClose={vi.fn()} />);
    expect(getPlaceDetails).not.toHaveBeenCalled();
    expect(screen.getByRole("link", { name: "Directions" })).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("keeps Directions as the one big button when Google has nothing more", async () => {
    const getPlaceDetails = vi.fn(async () => ({ available: false, details: null }));
    render(<RestaurantSheet slip={slip} tonight bowlId={BOWL_ID} getPlaceDetails={getPlaceDetails} onClose={vi.fn()} />);
    await waitFor(() => expect(getPlaceDetails).toHaveBeenCalled());
    const directions = await screen.findByRole("link", { name: "Directions" });
    expect(directions.className).toContain("btn-primary");
    expect(screen.queryByRole("link", { name: "Reserve a table" })).not.toBeInTheDocument();
    expect(screen.queryByText("Google Maps")).not.toBeInTheDocument();
  });
});
