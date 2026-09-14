import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import TrailerEmbed from "../TrailerEmbed";

const GODFATHER = {
  site: "YouTube",
  key: "original",
  embedUrl: "https://www.youtube.com/embed/original",
  fallbacks: [{ key: "50th" }, { key: "45th" }],
};

describe("TrailerEmbed", () => {
  let playerOptions;
  let player;

  beforeEach(() => {
    playerOptions = undefined;
    player = { cueVideoById: vi.fn(), destroy: vi.fn() };
    window.YT = {
      Player: vi.fn((_id, options) => {
        playerOptions = options;
        return player;
      }),
    };
  });

  afterEach(() => {
    cleanup();
    delete window.YT;
  });

  it("embeds the best trailer with the player API enabled", () => {
    render(<TrailerEmbed trailer={GODFATHER} title="The Godfather trailer" />);

    const src = screen.getByTitle("The Godfather trailer").getAttribute("src");
    expect(src).toContain("https://www.youtube.com/embed/original");
    expect(src).toContain("enablejsapi=1");
    expect(src).not.toContain("autoplay=1");
  });

  // An age-restricted trailer is refused as it loads; the next one is cued,
  // not played, because the viewer still starts it themselves.
  it("cues the next trailer each time YouTube refuses one", async () => {
    render(<TrailerEmbed trailer={GODFATHER} title="The Godfather trailer" />);
    await waitFor(() => expect(playerOptions).toBeDefined());

    act(() => playerOptions.events.onError({ data: 150 }));
    expect(player.cueVideoById).toHaveBeenLastCalledWith("50th");

    act(() => playerOptions.events.onError({ data: 150 }));
    expect(player.cueVideoById).toHaveBeenLastCalledWith("45th");

    // Out of candidates: YouTube's own message, with its link out, stays up.
    act(() => playerOptions.events.onError({ data: 150 }));
    expect(player.cueVideoById).toHaveBeenCalledTimes(2);
    expect(screen.getByTitle("The Godfather trailer")).toBeInTheDocument();
  });

  // The embed paints YouTube's "unavailable" screen before the API can report
  // the refusal, so the player stays covered until a video is accepted.
  describe("the cover", () => {
    beforeEach(() => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    const cover = () => screen.queryByTestId("trailer-cover");

    it("hides a refused trailer and lifts once the fallback is accepted", async () => {
      render(<TrailerEmbed trailer={GODFATHER} title="The Godfather trailer" />);
      expect(cover()).toBeInTheDocument();
      await waitFor(() => expect(playerOptions).toBeDefined());

      // The refusal lands in the same tick as ready, before the grace period.
      act(() => playerOptions.events.onReady({ target: player }));
      act(() => playerOptions.events.onError({ data: 150 }));
      act(() => vi.advanceTimersByTime(1000));
      expect(cover()).toBeInTheDocument();

      act(() => playerOptions.events.onStateChange({ data: 5 }));
      act(() => vi.advanceTimersByTime(300));
      expect(cover()).not.toBeInTheDocument();
    });

    it("lifts on a trailer that is accepted outright", async () => {
      render(<TrailerEmbed trailer={GODFATHER} title="The Godfather trailer" />);
      await waitFor(() => expect(playerOptions).toBeDefined());

      act(() => playerOptions.events.onReady({ target: player }));
      act(() => vi.advanceTimersByTime(300));

      expect(cover()).not.toBeInTheDocument();
    });

    // On the web YouTube's own message links out, so it is worth showing.
    it("lifts on YouTube's message once every trailer is refused", async () => {
      render(<TrailerEmbed trailer={GODFATHER} title="The Godfather trailer" />);
      await waitFor(() => expect(playerOptions).toBeDefined());

      act(() => playerOptions.events.onError({ data: 150 }));
      act(() => playerOptions.events.onError({ data: 150 }));
      expect(cover()).toBeInTheDocument();

      act(() => playerOptions.events.onError({ data: 150 }));
      expect(cover()).not.toBeInTheDocument();
    });

    it("never holds a blank box if the player does not answer", async () => {
      render(<TrailerEmbed trailer={GODFATHER} title="The Godfather trailer" />);
      await waitFor(() => expect(playerOptions).toBeDefined());

      act(() => vi.advanceTimersByTime(4000));

      expect(cover()).not.toBeInTheDocument();
    });

    it("is never drawn when there is nothing to fall back to", () => {
      render(
        <TrailerEmbed
          trailer={{ site: "YouTube", key: "only", embedUrl: "https://www.youtube.com/embed/only", fallbacks: [] }}
          title="Only trailer"
        />
      );

      expect(cover()).not.toBeInTheDocument();
    });
  });

  it("does not load the player API when there is nothing to fall back to", () => {
    render(
      <TrailerEmbed
        trailer={{ site: "YouTube", key: "only", embedUrl: "https://www.youtube.com/embed/only", fallbacks: [] }}
        title="Only trailer"
      />
    );

    expect(window.YT.Player).not.toHaveBeenCalled();
  });

  it("tears the player down when the trailer closes", async () => {
    const { unmount } = render(<TrailerEmbed trailer={GODFATHER} title="The Godfather trailer" />);
    await waitFor(() => expect(playerOptions).toBeDefined());

    unmount();
    expect(player.destroy).toHaveBeenCalled();
  });
});
