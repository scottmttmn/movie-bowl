import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import TvFullscreenTrailer from "../TvFullscreenTrailer";

const TRAILER = { site: "YouTube", key: "original", fallbacks: [{ key: "50th" }] };

describe("TvFullscreenTrailer", () => {
  let playerOptions;
  let player;

  beforeEach(() => {
    playerOptions = undefined;
    player = { playVideo: vi.fn(), loadVideoById: vi.fn(), destroy: vi.fn() };
    window.YT = {
      Player: vi.fn((_id, options) => {
        playerOptions = options;
        return player;
      }),
      PlayerState: { ENDED: 0 },
    };
  });

  afterEach(() => {
    cleanup();
    delete window.YT;
  });

  async function renderTrailer(props = {}) {
    const onClose = vi.fn();
    render(<TvFullscreenTrailer movieTitle="The Godfather" trailer={TRAILER} onClose={onClose} {...props} />);
    await waitFor(() => expect(playerOptions).toBeDefined());
    return { onClose };
  }

  it("plays the next trailer when YouTube refuses the first", async () => {
    await renderTrailer();

    act(() => playerOptions.events.onError({ data: 150 }));

    expect(player.loadVideoById).toHaveBeenCalledWith("50th");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  // YouTube's own message offers "Watch on YouTube", which goes nowhere inside
  // the TV app, so the overlay has to say it and leave Close in reach.
  it("says the trailer is unavailable once every candidate is refused", async () => {
    const { onClose } = await renderTrailer();

    act(() => playerOptions.events.onError({ data: 150 }));
    act(() => playerOptions.events.onError({ data: 150 }));

    expect(screen.getByRole("status")).toHaveTextContent(/trailer unavailable/i);
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /close trailer/i }));
    expect(onClose).toHaveBeenCalled();
  });

  describe("the cover", () => {
    const cover = () => document.querySelector(".tv-trailer-cover");

    // YouTube paints "unavailable" before the refusal reaches us.
    it("stays over a refused trailer until the fallback is playing", async () => {
      await renderTrailer();
      expect(cover()).toBeInTheDocument();

      act(() => playerOptions.events.onError({ data: 150 }));
      expect(cover()).toBeInTheDocument();

      act(() => playerOptions.events.onStateChange({ data: 1 }));
      expect(cover()).not.toBeInTheDocument();
    });

    // Recorded against real YouTube: a refused fallback reports BUFFERING
    // before its error, so lifting on it flashed the refusal screen.
    it("does not lift while a fallback is only buffering", async () => {
      await renderTrailer();

      act(() => playerOptions.events.onError({ data: 150 }));
      act(() => playerOptions.events.onStateChange({ data: 3 }));

      expect(cover()).toBeInTheDocument();
    });

    it("keeps YouTube's message covered once every trailer is refused", async () => {
      await renderTrailer();

      act(() => playerOptions.events.onError({ data: 150 }));
      act(() => playerOptions.events.onError({ data: 150 }));

      expect(cover()).toBeInTheDocument();
      expect(screen.getByRole("status")).toHaveTextContent(/trailer unavailable/i);
    });

    it("shows the player if an accepted trailer never starts", async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      try {
        await renderTrailer();

        act(() => vi.advanceTimersByTime(4000));

        expect(cover()).not.toBeInTheDocument();
      } finally {
        vi.useRealTimers();
      }
    });
  });

  it("closes when the trailer finishes", async () => {
    const { onClose } = await renderTrailer();

    act(() => playerOptions.events.onStateChange({ data: 0 }));

    expect(onClose).toHaveBeenCalled();
  });

  // A parent re-render hands down a new onClose; rebuilding the player for it
  // would restart the trailer and forget which fallback it had reached.
  it("keeps the same player when onClose changes identity", async () => {
    const { rerender } = render(
      <TvFullscreenTrailer movieTitle="The Godfather" trailer={TRAILER} onClose={vi.fn()} />
    );
    await waitFor(() => expect(window.YT.Player).toHaveBeenCalledTimes(1));

    rerender(<TvFullscreenTrailer movieTitle="The Godfather" trailer={TRAILER} onClose={vi.fn()} />);

    expect(window.YT.Player).toHaveBeenCalledTimes(1);
    expect(player.destroy).not.toHaveBeenCalled();
  });
});
