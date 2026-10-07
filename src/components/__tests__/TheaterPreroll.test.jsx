import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import TheaterPreroll from "../TheaterPreroll";

const QUEUE = [
  { movieId: "m2", title: "Heat", trailer: { key: "aaa", site: "YouTube" } },
  { movieId: "m3", title: "Ronin", trailer: { key: "bbb", site: "YouTube" } },
];

let playerOptions;
let player;

function mountPlayer() {
  playerOptions = undefined;
  player = {
    playVideo: vi.fn(),
    pauseVideo: vi.fn(),
    seekTo: vi.fn(),
    stopVideo: vi.fn(),
    loadVideoById: vi.fn(),
    destroy: vi.fn(),
  };
  window.YT = {
    Player: vi.fn((_id, options) => {
      playerOptions = options;
      return player;
    }),
    PlayerState: { ENDED: 0, PLAYING: 1 },
  };
}

async function renderPreroll(props = {}) {
  const onFinish = props.onFinish || vi.fn();
  render(<TheaterPreroll queue={QUEUE} featureTitle="Arrival" onFinish={onFinish} {...props} />);
  await waitFor(() => expect(playerOptions).toBeDefined());
  return { onFinish };
}

function ready() {
  act(() => playerOptions.events.onReady({ target: player }));
}

// The first preview is held under the announcement and starts once it goes.
function playThroughAnnouncement() {
  act(() => playerOptions.events.onStateChange({ data: 1 }));
  act(() => vi.advanceTimersByTime(4200));
  act(() => playerOptions.events.onStateChange({ data: 1 }));
}

describe("TheaterPreroll", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mountPlayer();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    delete window.YT;
  });

  // playsinline=0 hands iOS its own fullscreen player, which ends the trailer
  // outside this overlay and needs a fresh gesture to get back in -- so the
  // queue breaks rather than merely moving.
  it("plays inline, so the queue survives an iPhone", async () => {
    await renderPreroll();

    expect(screen.getByTitle("Movie Bowl previews")).toHaveAttribute(
      "src",
      expect.stringContaining("playsinline=1")
    );
  });

  it("keeps the room out of YouTube's own controls", async () => {
    await renderPreroll();

    const src = screen.getByTitle("Movie Bowl previews").getAttribute("src");
    expect(src).toContain("controls=0");
    expect(src).toContain("disablekb=1");
  });

  it("asks YouTube to hide captions unless the viewer wants them", async () => {
    await renderPreroll();
    expect(screen.getByTitle("Movie Bowl previews").getAttribute("src")).toContain(
      "cc_load_policy=0"
    );
    cleanup();

    await renderPreroll({ captions: true });
    expect(screen.getByTitle("Movie Bowl previews").getAttribute("src")).toContain(
      "cc_load_policy=1"
    );
  });

  it("moves to the next preview when one ends", async () => {
    await renderPreroll();
    ready();

    act(() => playerOptions.events.onStateChange({ data: 0 }));

    expect(player.loadVideoById).toHaveBeenCalledWith("bbb");
  });

  // A pulled or region-blocked trailer must not strand the room on a dead frame.
  it("steps past a trailer that errors", async () => {
    await renderPreroll();
    ready();

    act(() => playerOptions.events.onError({ data: 150 }));

    expect(player.loadVideoById).toHaveBeenCalledWith("bbb");
  });

  // An age-restricted or unembeddable trailer is refused as it loads. The
  // title is still worth previewing, so its next trailer gets a turn first.
  it("tries a refused preview's fallback before moving on", async () => {
    await renderPreroll({
      queue: [
        { ...QUEUE[0], trailer: { key: "aaa", site: "YouTube", fallbacks: [{ key: "aaa-2" }] } },
        QUEUE[1],
      ],
    });
    ready();

    act(() => playerOptions.events.onError({ data: 150 }));
    expect(player.loadVideoById).toHaveBeenLastCalledWith("aaa-2");

    act(() => playerOptions.events.onError({ data: 150 }));
    expect(player.loadVideoById).toHaveBeenLastCalledWith("bbb");

    // The retry count starts over for the new title, so its end still closes out the queue.
    act(() => playerOptions.events.onStateChange({ data: 0 }));
    expect(screen.getByText(/feature presentation/i)).toBeInTheDocument();
  });

  // The embed paints YouTube's "unavailable" screen before a refusal reaches
  // us, so each preview stays covered until it is actually playing.
  describe("the cover", () => {
    const cover = () => screen.queryByTestId("preroll-cover");

    it("stays until the first preview plays", async () => {
      await renderPreroll();
      ready();
      expect(cover()).toBeInTheDocument();

      playThroughAnnouncement();
      expect(cover()).not.toBeInTheDocument();
    });

    // Recorded against real YouTube: a refused fallback buffers, then errors.
    it("comes back for a refused preview and ignores buffering on the fallback", async () => {
      await renderPreroll({
        queue: [
          { ...QUEUE[0], trailer: { key: "aaa", site: "YouTube", fallbacks: [{ key: "aaa-2" }] } },
          QUEUE[1],
        ],
      });
      ready();
      playThroughAnnouncement();
      expect(cover()).not.toBeInTheDocument();

      act(() => playerOptions.events.onError({ data: 150 }));
      expect(cover()).toBeInTheDocument();

      act(() => playerOptions.events.onStateChange({ data: 3 }));
      expect(cover()).toBeInTheDocument();

      act(() => playerOptions.events.onStateChange({ data: 1 }));
      expect(cover()).not.toBeInTheDocument();
    });

    it("covers the gap between one preview ending and the next playing", async () => {
      await renderPreroll();
      ready();
      act(() => playerOptions.events.onStateChange({ data: 1 }));

      act(() => playerOptions.events.onStateChange({ data: 0 }));
      expect(cover()).toBeInTheDocument();
    });

    it("leaves a paused preview visible", async () => {
      await renderPreroll();
      ready();
      playThroughAnnouncement();

      fireEvent.click(screen.getByRole("button", { name: /pause previews/i }));

      expect(cover()).not.toBeInTheDocument();
    });

    it("keeps tap-to-start reachable above it when autoplay is refused", async () => {
      await renderPreroll();
      ready();
      act(() => vi.advanceTimersByTime(1500));

      expect(cover()).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: /start previews/i }));
      expect(player.playVideo).toHaveBeenCalledTimes(2);
    });

    it("sits behind the feature card", async () => {
      await renderPreroll({ queue: [QUEUE[0]] });
      ready();
      act(() => playerOptions.events.onStateChange({ data: 1 }));

      act(() => playerOptions.events.onStateChange({ data: 0 }));

      expect(screen.getByText(/feature presentation/i)).toBeInTheDocument();
      expect(cover()).toBeInTheDocument();
    });
  });

  // The announcement used to sit over the first preview's opening seconds.
  describe("the announcement", () => {
    const cover = () => screen.queryByTestId("preroll-cover");

    it("holds the first preview at its start until the card has gone", async () => {
      await renderPreroll();
      ready();
      act(() => playerOptions.events.onStateChange({ data: 1 }));

      expect(player.pauseVideo).toHaveBeenCalledTimes(1);
      expect(screen.getByText("2 previews")).toBeInTheDocument();
      expect(cover()).toBeInTheDocument();

      act(() => vi.advanceTimersByTime(4200));
      expect(screen.queryByText("2 previews")).not.toBeInTheDocument();
      expect(player.seekTo).toHaveBeenCalledWith(0, true);
      expect(player.playVideo).toHaveBeenCalledTimes(2);

      act(() => playerOptions.events.onStateChange({ data: 1 }));
      expect(cover()).not.toBeInTheDocument();
      expect(player.pauseVideo).toHaveBeenCalledTimes(1);
    });

    it("lets a preview that starts after the card play straight away", async () => {
      await renderPreroll();
      // A slow player: not even ready while the card shows.
      // The room goes dark on its own, then the card runs its course.
      act(() => vi.advanceTimersByTime(3000));
      act(() => vi.advanceTimersByTime(4200));
      expect(screen.queryByText("2 previews")).not.toBeInTheDocument();

      ready();
      act(() => playerOptions.events.onStateChange({ data: 1 }));
      expect(player.pauseVideo).not.toHaveBeenCalled();
      expect(cover()).not.toBeInTheDocument();
    });

    it("does not hold the next preview when the first title fails during the card", async () => {
      await renderPreroll();
      ready();
      act(() => playerOptions.events.onError({ data: 150 }));
      expect(player.loadVideoById).toHaveBeenCalledWith("bbb");

      act(() => playerOptions.events.onStateChange({ data: 1 }));
      expect(player.pauseVideo).not.toHaveBeenCalled();
      expect(cover()).not.toBeInTheDocument();
    });

    it("never restarts a held preview once the queue has reached the feature", async () => {
      // A hand-off keeps the lights down, so the card's timer is still live.
      await renderPreroll({ queue: [QUEUE[0]], handsOff: true });
      ready();
      act(() => playerOptions.events.onStateChange({ data: 1 }));
      act(() => playerOptions.events.onError({ data: 150 }));
      expect(screen.getByText(/feature presentation/i)).toBeInTheDocument();

      act(() => vi.advanceTimersByTime(4200));
      expect(player.seekTo).not.toHaveBeenCalled();
      expect(player.playVideo).toHaveBeenCalledTimes(1);
    });

    it("starts the previews at once when the screen is pressed during the card", async () => {
      await renderPreroll();
      ready();
      act(() => playerOptions.events.onStateChange({ data: 1 }));

      fireEvent.click(screen.getByRole("button", { name: /play previews/i }));

      expect(screen.queryByText("2 previews")).not.toBeInTheDocument();
      expect(player.seekTo).toHaveBeenCalledWith(0, true);
      expect(player.playVideo).toHaveBeenCalledTimes(2);
    });
  });

  describe("when the browser refuses autoplay", () => {
    it("asks for the gesture it needs instead of stalling", async () => {
      await renderPreroll();
      ready();
      expect(player.playVideo).toHaveBeenCalledTimes(1);

      act(() => vi.advanceTimersByTime(1500));

      const start = screen.getByRole("button", { name: /start previews/i });
      fireEvent.click(start);

      // The second call comes from inside a real gesture handler, which the
      // browser cannot refuse.
      expect(player.playVideo).toHaveBeenCalledTimes(2);
    });

    it("asks for nothing when playback actually starts", async () => {
      await renderPreroll();
      ready();

      playThroughAnnouncement();
      act(() => vi.advanceTimersByTime(1500));

      expect(screen.queryByRole("button", { name: /start previews/i })).not.toBeInTheDocument();
    });
  });

  describe("the exit", () => {
    // A phone has neither Escape nor a Back this page can claim, so the control
    // has to be on screen -- but it says leave, never skip ahead.
    it("is visible and reads as leaving rather than advancing", async () => {
      await renderPreroll();

      const exit = screen.getByRole("button", { name: /exit previews/i });
      expect(exit).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /skip/i })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /next preview/i })).not.toBeInTheDocument();
    });

    it("leaves when the exit is pressed, once the lights are up", async () => {
      const { onFinish } = await renderPreroll();
      ready();

      fireEvent.click(screen.getByRole("button", { name: /exit previews/i }));

      expect(screen.getByRole("dialog")).toHaveAttribute("data-lights", "raising");
      expect(player.pauseVideo).toHaveBeenCalled();
      expect(onFinish).not.toHaveBeenCalled();

      act(() => vi.advanceTimersByTime(550));
      expect(onFinish).toHaveBeenCalledTimes(1);
    });

    it("leaves on Escape, which a laptop reaches for first", async () => {
      const { onFinish } = await renderPreroll();

      fireEvent.keyDown(window, { key: "Escape" });
      act(() => vi.advanceTimersByTime(550));

      expect(onFinish).toHaveBeenCalledTimes(1);
    });

    // Somebody who asks twice wants out now, not the rest of the fade.
    it("skips the lights when asked again", async () => {
      const { onFinish } = await renderPreroll();

      fireEvent.keyDown(window, { key: "Escape" });
      fireEvent.keyDown(window, { key: "Escape" });
      expect(onFinish).toHaveBeenCalledTimes(1);

      act(() => vi.advanceTimersByTime(2000));
      expect(onFinish).toHaveBeenCalledTimes(1);
    });

    // The overlay's Enter/Space shortcut listens on the window, so without a
    // guard it swallowed the focused button's own activation and paused instead.
    it("leaves the exit's own Enter and Space alone", async () => {
      await renderPreroll();
      ready();
      playThroughAnnouncement();
      player.pauseVideo.mockClear();

      const exit = screen.getByRole("button", { name: /exit previews/i });
      exit.focus();

      expect(fireEvent.keyDown(exit, { key: "Enter" })).toBe(true);
      expect(fireEvent.keyDown(exit, { key: " " })).toBe(true);
      expect(player.pauseVideo).not.toHaveBeenCalled();
    });
  });

  it("pauses on Enter when no control has focus", async () => {
    await renderPreroll();
    ready();
    act(() => playerOptions.events.onStateChange({ data: 1 }));

    expect(fireEvent.keyDown(screen.getByRole("dialog"), { key: "Enter" })).toBe(false);
    expect(player.pauseVideo).toHaveBeenCalled();
  });

  it("pauses and resumes on the surface, because a living room has a doorbell", async () => {
    await renderPreroll();
    ready();
    playThroughAnnouncement();

    fireEvent.click(screen.getByRole("button", { name: /pause previews/i }));
    expect(player.pauseVideo).toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /resume previews/i }));
    // Ready, the release from the announcement, and the resume.
    expect(player.playVideo).toHaveBeenCalledTimes(3);
  });

  it("ends on the feature card and then brings the lights up on the reveal", async () => {
    const { onFinish } = await renderPreroll({ queue: [QUEUE[0]] });
    ready();

    act(() => playerOptions.events.onStateChange({ data: 0 }));
    expect(screen.getByText(/feature presentation/i)).toBeInTheDocument();
    expect(player.stopVideo).toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(3600));
    expect(screen.getByRole("dialog")).toHaveAttribute("data-lights", "raising");
    expect(onFinish).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(1600));
    expect(onFinish).toHaveBeenCalledTimes(1);
  });

  // The tab goes to the provider's page from a dark room. Lifting the lights
  // first would flash the reveal for as long as that page took to arrive.
  it("keeps the lights down for a hand-off", async () => {
    const onFinish = vi.fn();
    const onComplete = vi.fn();
    await renderPreroll({ queue: [QUEUE[0]], handsOff: true, onFinish, onComplete });
    ready();
    act(() => playerOptions.events.onStateChange({ data: 1 }));

    act(() => playerOptions.events.onStateChange({ data: 0 }));
    act(() => vi.advanceTimersByTime(3600));

    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("dialog")).toHaveAttribute("data-lights", "down");

    act(() => vi.advanceTimersByTime(5000));
    expect(onFinish).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toHaveAttribute("data-lights", "down");
  });

  describe("the house lights", () => {
    const lights = () => screen.getByRole("dialog").getAttribute("data-lights");

    it("dim over the pick before the screen shows", async () => {
      await renderPreroll();

      expect(lights()).toBe("lowering");
      // The announcement waits in the dark rather than timing out unseen.
      act(() => vi.advanceTimersByTime(1700));
      expect(lights()).toBe("lowering");
      act(() => vi.advanceTimersByTime(200));
      expect(lights()).toBe("down");
      act(() => vi.advanceTimersByTime(4000));
      expect(screen.getByText(/2 previews/i)).toBeInTheDocument();
      act(() => vi.advanceTimersByTime(300));
      expect(screen.queryByText(/2 previews/i)).toBeNull();
    });

    // Autoplay decides when the first preview starts, never the lights.
    it("go straight down when the first preview starts", async () => {
      await renderPreroll();
      ready();
      expect(player.playVideo).toHaveBeenCalledTimes(1);

      act(() => playerOptions.events.onStateChange({ data: 1 }));

      expect(lights()).toBe("down");
    });

    it("go down for the tap a refused autoplay needs", async () => {
      await renderPreroll();
      ready();

      act(() => vi.advanceTimersByTime(1200));

      expect(lights()).toBe("down");
      expect(screen.getByRole("button", { name: /start previews/i })).toBeInTheDocument();
    });

    it("become one short fade with reduced motion", async () => {
      vi.stubGlobal("matchMedia", (query) => ({ matches: query.includes("prefers-reduced-motion") }));
      try {
        const { onFinish } = await renderPreroll();

        act(() => vi.advanceTimersByTime(250));
        expect(lights()).toBe("down");

        fireEvent.keyDown(window, { key: "Escape" });
        act(() => vi.advanceTimersByTime(250));
        expect(onFinish).toHaveBeenCalledTimes(1);
      } finally {
        vi.unstubAllGlobals();
      }
    });
  });
});
