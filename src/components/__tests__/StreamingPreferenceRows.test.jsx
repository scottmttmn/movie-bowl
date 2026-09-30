import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import StreamingPreferenceRows from "../StreamingPreferenceRows";

function renderRows(props = {}) {
  const handlers = { onPrioritizeChange: vi.fn(), onUseRankChange: vi.fn(), onChangeServices: vi.fn() };
  render(
    <StreamingPreferenceRows idSuffix="test" services={["Netflix", "Max"]} prioritize useRank {...handlers} {...props} />
  );
  return handlers;
}

describe("StreamingPreferenceRows", () => {
  afterEach(() => {
    cleanup();
  });

  it("switches favoring and ranking, and opens the service list from the logos", () => {
    const handlers = renderRows({ useRank: false });

    fireEvent.click(screen.getByRole("checkbox", { name: "Favor my services" }));
    expect(handlers.onPrioritizeChange).toHaveBeenCalledWith(false);
    fireEvent.click(screen.getByRole("checkbox", { name: "Top service first" }));
    expect(handlers.onUseRankChange).toHaveBeenCalledWith(true);
    fireEvent.click(screen.getByRole("button", { name: "Change your streaming services" }));
    expect(handlers.onChangeServices).toHaveBeenCalledTimes(1);
  });

  it("names a service that has no logo and counts services past six", () => {
    renderRows({ services: ["Netflix", "Max", "Hulu", "Disney+", "Peacock", "Paramount+", "Apple TV+", "Showtime"] });
    const services = screen.getByRole("button", { name: "Change your streaming services" });
    expect(services.querySelectorAll("img")).toHaveLength(6);
    expect(services).toHaveTextContent("+2");

    cleanup();
    renderRows({ services: ["Showtime"] });
    expect(screen.getByRole("button", { name: "Change your streaming services" })).toHaveTextContent("Showtime");
  });

  it("hides ranking while services are not favored", () => {
    renderRows({ prioritize: false });
    expect(screen.queryByRole("checkbox", { name: "Top service first" })).toBeNull();
  });

  it("offers choosing services instead of a switch that cannot turn on", () => {
    const handlers = renderRows({ services: [] });

    expect(screen.queryByRole("checkbox")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Favor my services.*Choose your services/ }));
    expect(handlers.onChangeServices).toHaveBeenCalledTimes(1);
  });
});
