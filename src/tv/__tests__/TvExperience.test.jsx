import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  bowls: [
    {
      id: "family",
      name: "Family Night",
      remainingCount: 12,
      memberCount: 4,
      role: "Owner",
      lastActivityAt: "2026-07-27T20:00:00.000Z",
    },
    {
      id: "friends",
      name: "Friday Friends",
      remainingCount: 8,
      memberCount: 6,
      role: "Member",
      lastActivityAt: "2026-07-26T20:00:00.000Z",
    },
  ],
  reloadBowls: vi.fn(),
  signOutThisDevice: vi.fn(async () => ({ error: null })),
  bowlData: {
    remaining: [
      {
        id: "movie-1",
        tmdb_id: 101,
        title: "Arrival",
        genres: ["Science Fiction", "Drama"],
      },
    ],
    watched: [
      {
        id: "draw-1",
        drawEventId: "draw-1",
        bowlMovieId: "movie-1",
        tmdb_id: 101,
        title: "Arrival",
        drawn_at: "2026-08-31T19:00:00.000Z",
        added_by_name: "Alex",
        note: "Smart science fiction for movie night.",
      },
    ],
  },
  bowlError: null,
  bowlLoading: false,
  handleDraw: vi.fn(),
  handleReaddMovie: vi.fn(),
  getTmdbMovieDetails: vi.fn(),
  fetchStreamingProviders: vi.fn(),
  fetchProviderLinks: vi.fn(),
  streamingServices: ["Netflix", "Max"],
  prioritizeStreaming: true,
  theaterModeEnabled: false,
  providersByTmdbId: { 101: ["Netflix"] },
  providerLogosByTmdbId: {},
  drawMethod: "person_first",
}));

vi.mock("../hooks/useTvBowls", () => ({
  useTvBowls: () => ({
    bowls: mocks.bowls,
    isLoading: false,
    errorMessage: null,
    reload: mocks.reloadBowls,
  }),
  useTvBowlAccess: () => ({
    bowlMeta: {
      name: "Family Night",
      ownerId: "user-1",
      canDraw: true,
      drawMethod: mocks.drawMethod,
    },
    isLoading: false,
    errorMessage: null,
  }),
}));

vi.mock("../../hooks/useBowl", () => ({
  default: () => ({
    bowl: mocks.bowlData,
    isLoading: mocks.bowlLoading,
    errorMessage: mocks.bowlError,
    handleDraw: mocks.handleDraw,
    handleReaddMovie: mocks.handleReaddMovie,
  }),
}));

vi.mock("../../lib/streamingProviders", () => ({
  fetchStreamingProviders: (...args) => mocks.fetchStreamingProviders(...args),
}));
vi.mock("../../lib/providerLinks", () => ({ fetchProviderLinks: mocks.fetchProviderLinks }));

vi.mock("../../hooks/useUserStreamingServices", () => ({
  default: () => ({
    streamingServices: mocks.streamingServices,
    defaultDrawSettings: {
      prioritizeStreaming: mocks.prioritizeStreaming,
      theaterModeEnabled: mocks.theaterModeEnabled,
      useStreamingRank: true,
      selectedRatings: ["PG", "PG-13", "R"],
      includeUnknownRatings: true,
      selectedGenres: null,
      includeUnknownGenres: true,
      runtimeMinMinutes: 80,
      runtimeMaxMinutes: 180,
      includeUnknownRuntime: true,
    },
    loading: false,
  }),
}));

vi.mock("../../lib/tmdbApi", () => ({
  getTmdbMovieDetails: mocks.getTmdbMovieDetails,
}));

import TvBowlPicker from "../screens/TvBowlPicker";
import TvTonightScreen from "../screens/TvTonightScreen";

function renderPicker({ autoOpenLastBowl = false, path = "/tv/bowls" } = {}) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route
          path={path}
          element={
            <TvBowlPicker
              userId="user-1"
              userEmail="viewer@example.com"
              onSignOut={mocks.signOutThisDevice}
              autoOpenLastBowl={autoOpenLastBowl}
            />
          }
        />
        <Route path="/tv/bowl/:bowlId" element={<div>Tonight route</div>} />
      </Routes>
    </MemoryRouter>
  );
}

// Split out so a test can re-render the same tree after the account's settings
// change on the phone, which is how a TV learns about one.
function renderTonightTree() {
  return (
    <MemoryRouter initialEntries={["/tv/bowl/family"]}>
      <Routes>
        <Route
          path="/tv/bowl/:bowlId"
          element={
            <TvTonightScreen userId="user-1" />
          }
        />
        <Route path="/tv/bowls" element={<div>Bowl picker route</div>} />
      </Routes>
    </MemoryRouter>
  );
}

function renderTonight() {
  return render(renderTonightTree());
}

// The readout is one element holding several spans, so it is addressed as a
// whole rather than by any one clause inside it. Its counts settle a tick after
// it first renders, which is why callers wait on the content and not the node.
function getDrawReadout() {
  return screen.getByText((_content, element) =>
    Boolean(element?.classList?.contains("tv-draw-readout"))
  );
}

function setElementRect(element, { left, top, width, height }) {
  element.getBoundingClientRect = () => ({
    x: left,
    y: top,
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    toJSON: () => ({}),
  });
}

describe("Movie Bowl TV experience", () => {
  beforeEach(() => {
    mocks.fetchProviderLinks.mockReset().mockResolvedValue({ links: [] });
    window.localStorage.clear();
    window.sessionStorage.clear();
    mocks.handleDraw.mockReset();
    mocks.handleReaddMovie.mockReset();
    mocks.getTmdbMovieDetails.mockReset();
    mocks.fetchStreamingProviders.mockReset();
    mocks.fetchStreamingProviders.mockImplementation(async (tmdbId) => ({
      providers: mocks.providersByTmdbId[tmdbId] || [],
      providerLogos: mocks.providerLogosByTmdbId[tmdbId] || {},
      region: "US",
      fetchedAt: null,
    }));
    mocks.providerLogosByTmdbId = {};
    mocks.prioritizeStreaming = true;
    mocks.theaterModeEnabled = false;
    mocks.streamingServices = ["Netflix", "Max"];
    mocks.bowlError = null;
    mocks.bowlLoading = false;
    mocks.bowlData = {
      remaining: [
        {
          id: "movie-1",
          tmdb_id: 101,
          title: "Arrival",
          genres: ["Science Fiction", "Drama"],
        },
      ],
      watched: [
        {
          id: "draw-1",
          drawEventId: "draw-1",
          bowlMovieId: "movie-1",
          tmdb_id: 101,
          title: "Arrival",
          drawn_at: "2026-08-31T19:00:00.000Z",
          added_by_name: "Alex",
          note: "Smart science fiction for movie night.",
        },
      ],
    };
    mocks.streamingServices = ["Netflix", "Max"];
    mocks.prioritizeStreaming = true;
    mocks.providersByTmdbId = { 101: ["Netflix"] };
    mocks.drawMethod = "person_first";
    delete window.YT;
    delete window.onYouTubeIframeAPIReady;
    vi.useRealTimers();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("opens the last bowl directly from the TV launch route", async () => {
    window.localStorage.setItem("movie-bowl:tv:last-bowl:user-1", "friends");

    renderPicker({ autoOpenLastBowl: true, path: "/tv" });

    expect(await screen.findByText("Tonight route")).toBeInTheDocument();
  });

  // Cancelling must hand focus back to the control that opened the dialog, but
  // only that once. Left standing, the marker would make the most destructive
  // control on the screen the default target every time the picker re-scoped.
  it("returns focus to sign-out after cancelling, and only that once", async () => {
    renderPicker();

    const openSignOut = await screen.findByRole("button", { name: /sign out of this tv/i });
    fireEvent.click(openSignOut);

    fireEvent.click(await screen.findByRole("button", { name: /^cancel$/i }));

    await waitFor(() => expect(openSignOut).toHaveFocus());
    await waitFor(() => expect(openSignOut).not.toHaveAttribute("data-tv-autofocus"));
    expect(mocks.signOutThisDevice).not.toHaveBeenCalled();
  });

  // Back is the whole exit, because the Google TV shell reads the web app
  // leaving /tv as a request to close the app. A control that navigated there
  // instead would drop a remote into the phone interface, which consumes every
  // D-pad key and answers none of them. That includes the empty state, whose
  // next step is genuinely on a phone and cannot be offered here.
  it("offers no control that leaves TV mode", async () => {
    renderPicker();

    expect(await screen.findByRole("heading", { name: "Choose a bowl" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /exit tv mode/i })).not.toBeInTheDocument();

    cleanup();
    const populatedBowls = mocks.bowls;
    mocks.bowls = [];
    try {
      renderPicker();

      expect(await screen.findByRole("heading", { name: "No bowls found" })).toBeInTheDocument();
      expect(screen.queryAllByRole("button").map((button) => button.textContent)).toEqual([
        "Sign out of this TV",
      ]);
    } finally {
      mocks.bowls = populatedBowls;
    }
  });

  it("remembers the last bowl as a focus preference on the bowl picker", async () => {
    window.localStorage.setItem("movie-bowl:tv:last-bowl:user-1", "friends");

    renderPicker();

    expect(screen.getByRole("heading", { name: "Choose a bowl" })).toBeInTheDocument();
    expect(screen.getByText("Last opened")).toBeInTheDocument();

    const familyButton = screen.getByRole("button", { name: /family night/i });
    const friendsButton = screen.getByRole("button", { name: /friday friends/i });
    const signOutButton = screen.getByRole("button", { name: /sign out of this tv/i });

    setElementRect(familyButton, { left: 40, top: 180, width: 360, height: 260 });
    setElementRect(friendsButton, { left: 430, top: 180, width: 360, height: 260 });
    setElementRect(signOutButton, { left: 900, top: 20, width: 160, height: 60 });

    await waitFor(() => expect(friendsButton).toHaveFocus());

    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(friendsButton).toHaveFocus();

    fireEvent.keyDown(window, { key: "ArrowLeft" });
    expect(familyButton).toHaveFocus();

    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(friendsButton).toHaveFocus();

    fireEvent.keyDown(window, { key: "Enter" });
    expect(screen.getByText("Tonight route")).toBeInTheDocument();
  });

  const getStreamingMode = () =>
    screen.getAllByRole("radio").find((mode) => mode.getAttribute("aria-checked") === "true");

  const clickStreamingMode = (name) =>
    fireEvent.click(screen.getByRole("radio", { name }));

  it("states how much of the bowl the draw is favoring", async () => {
    renderTonight();

    await waitFor(() =>
      expect(getDrawReadout()).toHaveTextContent(/^Drawing from 1 on Netflix$/)
    );
  });

  // What the remote changes here belongs to this television. Anyone in the room
  // can pick it up, so relaxing a filter tonight must not rewrite what the
  // account owner browses with tomorrow.
  it("keeps a change made with the remote on this television", async () => {
    renderTonight();

    await screen.findByRole("radio", { name: /^favor netflix, then max$/i });
    expect(getStreamingMode()).toHaveAccessibleName(/^favor netflix, then max$/i);

    clickStreamingMode(/ignore streaming services/i);

    await waitFor(() =>
      expect(getStreamingMode()).toHaveAccessibleName(/ignore streaming services/i)
    );
    expect(
      JSON.parse(window.localStorage.getItem("movie-bowl:tv:draw-settings:user-1"))
    ).toEqual({ prioritizeStreaming: false });
    // The account is untouched: the phone still holds what it held.
    expect(mocks.prioritizeStreaming).toBe(true);
  });

  // Ranking keeps only the highest-ranked service that matched, so the draw
  // never spans both at once and the label must not imply it does.
  it("says favoring is an order while ranking is on, and a set once it is off", async () => {
    renderTonight();

    await screen.findByRole("radio", { name: /^favor netflix, then max$/i });
    expect(getStreamingMode()).toHaveAccessibleName(/^favor netflix, then max$/i);

    clickStreamingMode(/^favor netflix, max$/i);

    await waitFor(() =>
      expect(getStreamingMode()).toHaveAccessibleName(/^favor netflix, max$/i)
    );
  });

  // The rail is a list of services rather than a label about them, so each one
  // has to be nameable: "drawing from this service" is meaningless attached to
  // an unnamed logo.
  it("draws the favored services as named logos in priority order", async () => {
    renderTonight();

    const rail = await screen.findByRole("list");
    const logos = within(rail).getAllByRole("img");
    expect(logos.map((logo) => logo.getAttribute("alt"))).toEqual(["Netflix", "Max"]);
    expect(logos.map((logo) => logo.getAttribute("src"))).toEqual([
      "https://image.tmdb.org/t/p/w92/pbpMk2JmcoNnQwx5JGpXngfoWtp.jpg",
      "https://image.tmdb.org/t/p/w92/jbe4gVSfRlbPTdESXhEKpornsfu.jpg",
    ]);
  });

  it("falls back to a service's name when TMDB has no logo for it", async () => {
    mocks.streamingServices = ["Netflix", "Showtime"];

    renderTonight();

    const rail = await screen.findByRole("list");
    expect(within(rail).getByText("Showtime")).toBeInTheDocument();
    expect(within(rail).getAllByRole("img")).toHaveLength(1);
  });

  // Ranking one service against itself is not a choice, so the mode that would
  // offer it is not there to pick.
  it("offers no ranking mode when there is only one service to rank", async () => {
    mocks.streamingServices = ["Netflix"];

    renderTonight();

    expect(await screen.findByRole("radio", { name: /^favor netflix$/i })).toBeInTheDocument();
    expect(screen.getAllByRole("radio")).toHaveLength(2);
    expect(screen.queryByRole("radio", { name: /then/i })).toBeNull();
  });

  it("marks the controls this television has an opinion about, and only those", async () => {
    renderTonight();

    clickStreamingMode(/ignore streaming services/i);

    const rail = await screen.findByRole("radiogroup");
    await waitFor(() =>
      expect(within(rail.parentElement).getByText("set on this TV")).toBeInTheDocument()
    );
    const theater = screen.getByRole("switch", { name: /^theater mode$/i });
    expect(within(theater).queryByText("set on this TV")).not.toBeInTheDocument();
  });

  it("puts the television's settings into the draw it runs", async () => {
    renderTonight();

    await waitFor(() => expect(mocks.fetchStreamingProviders).toHaveBeenCalled());
    mocks.fetchStreamingProviders.mockClear();

    await screen.findByRole("radio", { name: /^favor netflix, then max$/i });
    clickStreamingMode(/ignore streaming services/i);

    // Priority off means no service lookups, which is the pool changing shape
    // rather than a label changing.
    await waitFor(() =>
      expect(getStreamingMode()).toHaveAccessibleName(/ignore streaming services/i)
    );
    expect(mocks.fetchStreamingProviders).not.toHaveBeenCalled();
  });

  it("lets a phone change through for anything this television has not touched", async () => {
    const view = renderTonight();
    await screen.findByRole("radio", { name: /^favor netflix, then max$/i });
    clickStreamingMode(/ignore streaming services/i);
    await waitFor(() =>
      expect(getStreamingMode()).toHaveAccessibleName(/ignore streaming services/i)
    );

    // The phone turns both on. Only the untouched one should move.
    mocks.prioritizeStreaming = true;
    mocks.theaterModeEnabled = true;
    view.rerender(renderTonightTree());

    await waitFor(() =>
      expect(screen.getByRole("switch", { name: /theater mode/i })).toHaveAttribute(
        "aria-checked",
        "true"
      )
    );
    expect(getStreamingMode()).toHaveAccessibleName(/ignore streaming services/i);
  });

  it("hands the television back to the phone in one action", async () => {
    renderTonight();
    await screen.findByRole("radio", { name: /^favor netflix, then max$/i });
    clickStreamingMode(/ignore streaming services/i);
    fireEvent.click(await screen.findByRole("switch", { name: /^theater mode$/i }));

    fireEvent.click(await screen.findByRole("button", { name: /use my phone's settings/i }));

    await waitFor(() =>
      expect(getStreamingMode()).toHaveAccessibleName(/^favor netflix, then max$/i)
    );
    expect(screen.getByRole("switch", { name: /^theater mode$/i })).toHaveAttribute(
      "aria-checked",
      "false"
    );
    expect(window.localStorage.getItem("movie-bowl:tv:draw-settings:user-1")).toBeNull();
    expect(screen.queryByRole("button", { name: /use my phone's settings/i })).toBeNull();
  });

  it("reads back what a previous night left on this television", async () => {
    window.localStorage.setItem(
      "movie-bowl:tv:draw-settings:user-1",
      JSON.stringify({ theaterModeEnabled: true })
    );

    renderTonight();

    expect(
      await screen.findByRole("switch", { name: /^theater mode on$/i })
    ).toHaveAttribute("aria-checked", "true");
  });

  // The worst a refused write may cost is the setting, never the screen.
  it("still runs, and says so, when this television cannot remember settings", async () => {
    const setItem = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new Error("QuotaExceededError");
      });

    renderTonight();
    await screen.findByRole("radio", { name: /^favor netflix, then max$/i });
    clickStreamingMode(/ignore streaming services/i);

    await waitFor(() =>
      expect(getStreamingMode()).toHaveAccessibleName(/ignore streaming services/i)
    );
    expect(await screen.findByText(/can.t remember settings/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /draw a movie/i })).toBeInTheDocument();

    setItem.mockRestore();
  });

  // Both of these were invisible without geometry, which is why they are
  // asserted with real rectangles rather than through the rendered layout.
  it("does not let a wide control swallow what sits beneath it", async () => {
    mocks.bowlData.watched = [
      { id: "draw-1", drawEventId: "draw-1", bowlMovieId: "movie-1", tmdb_id: 101,
        title: "Arrival", drawn_at: "2026-08-31T19:00:00.000Z", added_by_name: "Alex" },
    ];
    renderTonight();

    const draw = await screen.findByRole("button", { name: /draw a movie/i });
    const settings = await screen.findByRole("radio", { name: /^favor netflix, then max$/i });
    const card = await screen.findByRole("button", {
      name: /view details for arrival in watch history/i,
    });

    // The draw button spans the stage. The card sits under its right half, so
    // its centre is right of the button's centre while the card itself is not
    // beside the button at all. The panel is the only thing genuinely to the
    // right, and pressing right must reach it.
    setElementRect(draw, { left: 130, top: 820, width: 1108, height: 100 });
    setElementRect(card, { left: 986, top: 1000, width: 210, height: 300 });
    setElementRect(settings, { left: 1368, top: 90, width: 430, height: 80 });

    draw.focus();
    fireEvent.keyDown(window, { key: "ArrowRight" });

    expect(settings).toHaveFocus();
  });

  it("lets a stacked group be left horizontally, while a row still stops at its end", async () => {
    // Two cards, because a lone card is not a row and has no traversal to
    // interrupt -- escaping from it sideways is correct.
    mocks.bowlData.watched = [
      { id: "draw-1", drawEventId: "draw-1", bowlMovieId: "movie-1", tmdb_id: 101,
        title: "Arrival", drawn_at: "2026-08-31T19:00:00.000Z", added_by_name: "Alex" },
      { id: "draw-2", drawEventId: "draw-2", bowlMovieId: "movie-2", tmdb_id: 102,
        title: "Heat", drawn_at: "2026-08-30T19:00:00.000Z", added_by_name: "Alex" },
    ];
    renderTonight();

    const draw = await screen.findByRole("button", { name: /draw a movie/i });
    const settings = await screen.findByRole("radio", { name: /^favor netflix, then max$/i });
    const card = await screen.findByRole("button", {
      name: /view details for arrival in watch history/i,
    });

    const secondCard = await screen.findByRole("button", {
      name: /view details for heat in watch history/i,
    });
    setElementRect(draw, { left: 130, top: 820, width: 1108, height: 100 });
    setElementRect(settings, { left: 1368, top: 780, width: 430, height: 80 });
    setElementRect(card, { left: 130, top: 1000, width: 210, height: 300 });
    setElementRect(secondCard, { left: 350, top: 1000, width: 210, height: 300 });

    // The rail's modes are a row, but deliberately not a nav group: its left
    // end is the only way back to the draw button, so left must return to the
    // control it was entered from rather than being held at the row's edge.
    settings.focus();
    fireEvent.keyDown(window, { key: "ArrowLeft" });
    expect(draw).toHaveFocus();

    // The watched strip is a row that IS a group, so its last card keeps
    // holding the edge rather than escaping sideways to the rail.
    secondCard.focus();
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(secondCard).toHaveFocus();
  });

  // The television indicates how the bowl picks without naming it, so the mark
  // is the only thing carrying that meaning -- and it has to carry it for
  // someone who cannot see it too.
  it("marks how the bowl picks, and names the method only to assistive tech", async () => {
    mocks.drawMethod = "rotation";

    renderTonight();

    expect(await screen.findByRole("img", { name: "Contributor rotation" })).toBeInTheDocument();
    // Naming it on screen is what the mark replaces.
    expect(screen.queryByText(/contributor rotation/i)).not.toBeInTheDocument();
  });

  it("marks a person-first bowl differently from a rotation one", async () => {
    const view = renderTonight();
    expect(
      await screen.findByRole("img", { name: "Person-first random draw" })
    ).toBeInTheDocument();

    mocks.drawMethod = "title_first";
    view.rerender(renderTonightTree());
    expect(
      await screen.findByRole("img", { name: "Title-first random draw" })
    ).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: /person-first/i })).toBeNull();
  });

  // Regions are compared as rectangles, so a region nested inside another one
  // overlaps it on both axes and is a neighbour in no direction. Making the
  // rail its own region did exactly that: the stage's rectangle contained it,
  // and every horizontal move between the draw control and the rail was
  // filtered out, leaving the rail reachable only from above or below.
  it("keeps the streaming rail in the stage's band so it can be reached sideways", async () => {
    renderTonight();

    const draw = await screen.findByRole("button", { name: /draw a movie/i });
    const off = await screen.findByRole("radio", { name: /ignore streaming services/i });

    expect(off.closest("[data-tv-nav-region]")).toBe(draw.closest("[data-tv-nav-region]"));

    setElementRect(draw, { left: 300, top: 320, width: 780, height: 290 });
    setElementRect(off, { left: 1500, top: 350, width: 80, height: 56 });
    setElementRect(draw.closest("[data-tv-nav-region]"), {
      left: 80, top: 160, width: 1760, height: 700,
    });

    draw.focus();
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(off).toHaveFocus();

    fireEvent.keyDown(window, { key: "ArrowLeft" });
    expect(draw).toHaveFocus();
  });

  // Grouping the rail's modes as a row is the obvious thing to do and it walls
  // off the only exit: a group holds a row at its ends, and this row's left end
  // is the way back to the draw button.
  it("lets the remote back out of the streaming rail the way it came in", async () => {
    renderTonight();

    const draw = await screen.findByRole("button", { name: /draw a movie/i });
    const off = await screen.findByRole("radio", { name: /ignore streaming services/i });
    const top = await screen.findByRole("radio", { name: /^favor netflix, then max$/i });

    setElementRect(draw, { left: 130, top: 700, width: 1108, height: 260 });
    setElementRect(off, { left: 1380, top: 300, width: 120, height: 56 });
    setElementRect(top, { left: 1640, top: 300, width: 120, height: 56 });

    // Right walks the row.
    off.focus();
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(top).toHaveFocus();

    // Left walks back along it, and keeps going out of it.
    fireEvent.keyDown(window, { key: "ArrowLeft" });
    expect(off).toHaveFocus();
    fireEvent.keyDown(window, { key: "ArrowLeft" });
    expect(draw).toHaveFocus();
  });

  it("will not pull a card out of the scrolled strip from outside it", async () => {
    mocks.bowlData.watched = [
      { id: "draw-1", drawEventId: "draw-1", bowlMovieId: "movie-1", tmdb_id: 101,
        title: "Arrival", drawn_at: "2026-08-31T19:00:00.000Z", added_by_name: "Alex" },
    ];
    renderTonight();

    const settings = await screen.findByRole("radio", { name: /^favor netflix, then max$/i });
    const card = await screen.findByRole("button", {
      name: /view details for arrival in watch history/i,
    });
    const strip = card.closest(".tv-recent-list");
    strip.style.overflowX = "auto";

    // The card sits scrolled off the right of its own strip. It is to the right
    // of the panel, but reaching it from there would yank a hidden card into
    // view and drop focus into a row nobody was travelling along.
    setElementRect(settings, { left: 1368, top: 780, width: 430, height: 80 });
    setElementRect(strip, { left: 130, top: 1000, width: 1670, height: 300 });
    setElementRect(card, { left: 1900, top: 1000, width: 210, height: 300 });

    settings.focus();
    fireEvent.keyDown(window, { key: "ArrowRight" });

    expect(settings).toHaveFocus();
  });

  // Regions answer what an element's own rectangle cannot: the settings column
  // is beside the stage, the watched strip is under it. Without that, a card
  // below a stage-wide button looks as "right" as the panel beside it.
  it("moves between regions by where the regions are, not where the control is", async () => {
    mocks.bowlData.watched = [
      { id: "draw-1", drawEventId: "draw-1", bowlMovieId: "movie-1", tmdb_id: 101,
        title: "Arrival", drawn_at: "2026-08-31T19:00:00.000Z", added_by_name: "Alex" },
    ];
    renderTonight();

    const draw = await screen.findByRole("button", { name: /draw a movie/i });
    const settings = await screen.findByRole("radio", { name: /^favor netflix, then max$/i });
    const card = await screen.findByRole("button", {
      name: /view details for arrival in watch history/i,
    });

    setElementRect(draw, { left: 130, top: 700, width: 1108, height: 100 });
    setElementRect(draw.closest("[data-tv-nav-region]"), { left: 85, top: 160, width: 1205, height: 700 });
    // The rail sits high, so by its own geometry the card below is the nearer
    // rightward candidate. By region it is not to the right at all.
    setElementRect(settings, { left: 1368, top: 200, width: 430, height: 80 });
    setElementRect(settings.closest("[data-tv-nav-region]"), { left: 1330, top: 160, width: 510, height: 700 });
    setElementRect(card, { left: 986, top: 900, width: 210, height: 300 });
    setElementRect(card.closest("[data-tv-nav-region]"), { left: 85, top: 880, width: 1755, height: 340 });

    draw.focus();
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(settings).toHaveFocus();

    draw.focus();
    fireEvent.keyDown(window, { key: "ArrowDown" });
    expect(card).toHaveFocus();
  });

  it("shows the final ranked pool and contributors represented, including manual exclusions", async () => {
    mocks.bowlData = {
      remaining: [
        {
          id: "movie-1",
          tmdb_id: 101,
          title: "Arrival",
          added_by: "user-1",
          profiles: { email: "alex@example.com" },
          genres: ["Drama"],
          runtime: 116,
        },
        {
          id: "movie-2",
          tmdb_id: 202,
          title: "The Menu",
          added_by: "user-2",
          profiles: { email: "sam@example.com" },
          genres: ["Drama"],
          runtime: 107,
        },
        {
          id: "movie-manual",
          tmdb_id: -9,
          title: "Family VHS",
          added_by: null,
          added_by_name: "Jo",
          genres: ["Drama"],
          runtime: 95,
        },
      ],
      watched: [],
    };
    mocks.providersByTmdbId = { 101: ["Netflix"], 202: ["Max"] };

    renderTonight();

    await waitFor(() =>
      expect(getDrawReadout()).toHaveTextContent(/Drawing from 1 on Netflix/)
    );
    const readout = getDrawReadout();
    expect(readout).toHaveAttribute("data-tone", "warning");
    expect(readout).toHaveTextContent("1/3");
    expect(readout).toHaveTextContent(
      /only 1 of 3 people have a movie in the draw/i
    );
  });

  it("does not calculate unused service matches when prioritizing is off", async () => {
    mocks.prioritizeStreaming = false;

    renderTonight();

    await waitFor(() => expect(getDrawReadout()).toHaveTextContent(/^Drawing from 1$/));
    expect(screen.queryByText(/favoring/i)).not.toBeInTheDocument();
    expect(mocks.fetchStreamingProviders).not.toHaveBeenCalled();
  });

  it("warns on TV when streaming priority matches nothing", async () => {
    mocks.providersByTmdbId = { 101: ["Paramount+"] };

    renderTonight();

    // Priority is on and matched nothing, so the draw quietly falls back to the
    // eligible pool. The tone is the only thing that says so.
    await waitFor(() =>
      expect(getDrawReadout()).toHaveAttribute("data-tone", "warning")
    );
    expect(getDrawReadout()).toHaveTextContent(/^Drawing from 1$/);
  });

  // A logo is the service name drawn, so the name stays as the alt text: a
  // television on a poor connection ends up back at the row it had before.
  it("shows a provider's logo where TMDB has one and its name where it does not", async () => {
    mocks.streamingServices = [];
    mocks.handleDraw.mockResolvedValue({
      id: "movie-1",
      tmdb_id: 101,
      title: "Arrival",
      streamingProviders: ["Netflix", "Tubi"],
      streamingProviderLogos: { Netflix: "/netflix.jpg" },
    });
    mocks.getTmdbMovieDetails.mockResolvedValue({ title: "Arrival" });

    renderTonight();
    fireEvent.click(screen.getByRole("button", { name: /draw a movie/i }));
    fireEvent.click(screen.getByRole("button", { name: /reveal a movie/i }));

    const logo = await screen.findByAltText("Netflix");
    expect(logo).toHaveAttribute("src", "https://image.tmdb.org/t/p/w92/netflix.jpg");
    expect(screen.getByText("Tubi")).toBeInTheDocument();
    expect(screen.queryByAltText("Tubi")).not.toBeInTheDocument();
  });

  it("draws once with saved preferences and offers no immediate return path", async () => {
    mocks.handleDraw.mockResolvedValue({
      id: "movie-1",
      tmdb_id: 101,
      title: "Arrival",
      release_date: "2016-11-11",
      runtime: 116,
      genres: ["Science Fiction", "Drama"],
      overview: "A linguist works with the military to communicate with alien visitors.",
      note: "  Recommended by Tim after dinner.\nHe promised no spoilers.  ",
      streamingProviders: ["Netflix"],
    });
    mocks.getTmdbMovieDetails.mockResolvedValue({
      title: "Arrival",
      release_date: "2016-11-11",
      runtime: 116,
      genres: ["Science Fiction", "Drama"],
      overview: "A linguist works with the military to communicate with alien visitors.",
      trailer: {
        embedUrl: "https://www.youtube.com/embed/arrival",
      },
    });
    const view = renderTonight();

    expect(
      screen.getByRole("heading", { level: 1, name: "Family Night" })
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /draw a movie/i }));

    expect(screen.getByRole("dialog", { name: /reveal one movie/i })).toBeInTheDocument();

    vi.useFakeTimers();
    const revealButton = screen.getByRole("button", { name: /reveal a movie/i });
    act(() => {
      revealButton.click();
      revealButton.click();
    });

    expect(screen.getByText(/drawing tonight's movie/i)).toBeInTheDocument();

    mocks.bowlLoading = true;
    view.rerender(
      <MemoryRouter initialEntries={["/tv/bowl/family"]}>
        <Routes>
          <Route
            path="/tv/bowl/:bowlId"
            element={
              <TvTonightScreen
                userId="user-1"
                userEmail="viewer@example.com"
              />
            }
          />
          <Route path="/tv/bowls" element={<div>Bowl picker route</div>} />
        </Routes>
      </MemoryRouter>
    );

    expect(
      screen.queryByText(/getting tonight's bowl ready/i)
    ).not.toBeInTheDocument();
    expect(screen.getByText(/drawing tonight's movie/i)).toBeInTheDocument();

    mocks.bowlLoading = false;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1800);
    });
    vi.useRealTimers();

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: /arrival/i })).toBeInTheDocument();
    });
    expect(mocks.handleDraw).toHaveBeenCalledWith(
      expect.objectContaining({
        prioritizeByServices: true,
        prioritizeByServiceRank: true,
        userStreamingServices: ["Netflix", "Max"],
        runtimeFilter: {
          minMinutes: 80,
          maxMinutes: 180,
          includeUnknown: true,
        },
      })
    );
    expect(mocks.handleDraw).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Why it’s in the bowl")).toBeInTheDocument();
    expect(screen.getByText(/Recommended by Tim after dinner/).closest(".tv-movie-note"))
      .toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /^open netflix$/i })
    ).toHaveAttribute(
      "href",
      "https://www.netflix.com/search?q=Arrival"
    );
    let youtubePlayerOptions;
    window.YT = {
      Player: vi.fn((_playerId, options) => {
        youtubePlayerOptions = options;
        return { destroy: vi.fn() };
      }),
      PlayerState: { ENDED: 0 },
    };

    fireEvent.click(screen.getByRole("button", { name: /watch trailer/i }));

    const trailerDialog = screen.getByRole("dialog", {
      name: /arrival trailer/i,
    });
    expect(trailerDialog).toBeInTheDocument();
    expect(screen.getByTitle(/arrival trailer/i)).toHaveAttribute(
      "src",
      expect.stringContaining("autoplay=1")
    );
    await waitFor(() => expect(window.YT.Player).toHaveBeenCalledTimes(1));

    act(() => {
      youtubePlayerOptions.events.onStateChange({ data: 0 });
    });

    expect(
      screen.queryByRole("dialog", { name: /arrival trailer/i })
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /arrival/i })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /we're not watching this/i })
    ).not.toBeInTheDocument();
    expect(mocks.handleReaddMovie).not.toHaveBeenCalled();

    fireEvent.keyDown(window, { key: "Escape" });

    expect(
      screen.getByRole("heading", { level: 1, name: "Family Night" })
    ).toBeInTheDocument();
    expect(screen.queryByText("Bowl picker route")).not.toBeInTheDocument();
    expect(mocks.handleReaddMovie).not.toHaveBeenCalled();

    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.getByText("Bowl picker route")).toBeInTheDocument();
  });

  it("opens a Watch History detail page before offering the secondary return action", async () => {
    mocks.bowlData.watched[0].drawn_at = new Date(
      Date.now() - 60 * 60 * 1000
    ).toISOString();
    mocks.handleReaddMovie.mockResolvedValue({ ok: true });
    mocks.getTmdbMovieDetails.mockResolvedValue({
      title: "Arrival",
      release_date: "2016-11-11",
      runtime: 116,
      genres: ["Science Fiction", "Drama"],
      overview: "A linguist works to communicate with alien visitors.",
      trailer: { embedUrl: "https://www.youtube.com/embed/arrival" },
    });

    renderTonight();

    expect(
      screen.getByRole("heading", { name: "Watch History" })
    ).toBeInTheDocument();
    const drawButton = screen.getByRole("button", { name: /draw a movie/i });
    const historyButton = screen.getByRole("button", {
      name: /view details for arrival in watch history/i,
    });
    const changeBowlButton = screen.getByRole("button", { name: /change bowl/i });

    setElementRect(drawButton, { left: 120, top: 180, width: 620, height: 90 });
    setElementRect(historyButton, { left: 140, top: 420, width: 220, height: 90 });
    setElementRect(changeBowlButton, { left: 900, top: 20, width: 160, height: 60 });

    await waitFor(() => expect(drawButton).toHaveFocus());

    fireEvent.keyDown(window, { key: "ArrowDown" });
    expect(historyButton).toHaveFocus();

    // The draw pool warms its own provider cache, so only lookups from here on
    // could belong to the detail page.
    mocks.fetchStreamingProviders.mockClear();
    mocks.fetchProviderLinks.mockClear();

    fireEvent.keyDown(window, { key: "Enter" });
    expect(screen.getByRole("heading", { name: /arrival/i })).toBeInTheDocument();
    expect(screen.getByText("Smart science fiction for movie night.")).toBeInTheDocument();
    expect(screen.getByText(/added by alex/i)).toBeInTheDocument();
    expect(screen.getByText("Didn't watch it?")).toBeInTheDocument();
    expect(
      screen.getByText(/removes this pick from everyone.s watch history/i)
    ).toBeInTheDocument();
    expect(
      document.querySelector(".tv-history-detail-page .tv-kept-badge")
    ).toBeNull();
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /^close$/i })).toHaveFocus();
    });
    expect(mocks.getTmdbMovieDetails).toHaveBeenCalledWith(101);
    // A movie in Watch History has been watched, so the page neither shows nor
    // looks up where to stream it.
    expect(document.querySelector(".tv-history-detail-page .tv-provider-row")).toBeNull();
    expect(screen.queryByRole("link", { name: /open netflix/i })).not.toBeInTheDocument();
    expect(mocks.fetchStreamingProviders).not.toHaveBeenCalled();
    expect(mocks.fetchProviderLinks).not.toHaveBeenCalled();
    expect(mocks.handleReaddMovie).not.toHaveBeenCalled();

    fireEvent.click(
      screen.getByRole("button", { name: /^put movie back in bowl$/i })
    );
    expect(
      screen.getByRole("dialog", { name: /put “arrival” back in the bowl/i })
    ).toBeInTheDocument();
    expect(
      screen.getByText(/removes the watch history entries this pick created/i)
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /^close$/i })).toHaveFocus();
    });
    expect(mocks.handleReaddMovie).not.toHaveBeenCalled();

    fireEvent.click(
      screen.getByRole("button", { name: /^put movie back in bowl$/i })
    );

    await waitFor(() => {
      expect(mocks.handleReaddMovie).toHaveBeenCalledWith("draw-1");
    });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });



  it("withholds the return once the undo window has closed", async () => {
    mocks.bowlData.watched[0].drawn_at = new Date(
      Date.now() - 3 * 60 * 60 * 1000
    ).toISOString();

    renderTonight();
    fireEvent.click(
      screen.getByRole("button", {
        name: /view details for arrival in watch history/i,
      })
    );

    // The database refuses a late return, so the screen explains rather than
    // offering an action that would fail.
    expect(
      screen.getByText(/available for two hours after the draw/i)
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /^put movie back in bowl$/i })
    ).not.toBeInTheDocument();
    expect(mocks.handleReaddMovie).not.toHaveBeenCalled();
  });

  it("uses remote Back to close Watch History details and restore strip focus", async () => {
    renderTonight();

    const historyButton = screen.getByRole("button", {
      name: /view details for arrival in watch history/i,
    });
    fireEvent.click(historyButton);

    const closeButton = screen.getByRole("button", { name: /^close$/i });
    await waitFor(() => expect(closeButton).toHaveFocus());
    fireEvent.keyDown(window, { key: "Escape" });

    await waitFor(() => {
      expect(
        screen.getByRole("button", {
          name: /view details for arrival in watch history/i,
        })
      ).toHaveFocus();
    });
    expect(mocks.handleReaddMovie).not.toHaveBeenCalled();
  });

  it("treats the draw as tonight's pick without asking for acceptance", async () => {
    mocks.handleDraw.mockResolvedValue({
      id: "movie-1",
      tmdb_id: 101,
      title: "Arrival",
      release_date: "2016-11-11",
      runtime: 116,
      genres: ["Science Fiction", "Drama"],
      streamingProviders: ["Netflix"],
    });
    mocks.getTmdbMovieDetails.mockResolvedValue({
      title: "Arrival",
      release_date: "2016-11-11",
      runtime: 116,
      genres: ["Science Fiction", "Drama"],
    });

    renderTonight();
    fireEvent.click(screen.getByRole("button", { name: /draw a movie/i }));

    vi.useFakeTimers();
    fireEvent.click(screen.getByRole("button", { name: /reveal a movie/i }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1800);
    });
    vi.useRealTimers();

    expect(await screen.findByText(/tonight's pick/i)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /that's the one/i })
    ).not.toBeInTheDocument();
    expect(screen.getByText(/tonight's pick/i)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /choose another bowl/i })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /we're not watching this/i })
    ).not.toBeInTheDocument();
  });

  it("upgrades a focused launch link without changing services", async () => {
    let finishLookup;
    mocks.fetchProviderLinks.mockReturnValue(new Promise((resolve) => { finishLookup = resolve; }));
    mocks.handleDraw.mockResolvedValue({ id: "movie-1", tmdb_id: 101, title: "Arrival", streamingProviders: ["Netflix"] });
    mocks.getTmdbMovieDetails.mockResolvedValue({ title: "Arrival" });
    renderTonight();
    fireEvent.click(screen.getByRole("button", { name: /draw a movie/i }));
    vi.useFakeTimers();
    fireEvent.click(screen.getByRole("button", { name: /reveal a movie/i }));
    await act(async () => { await vi.advanceTimersByTimeAsync(1800); });
    vi.useRealTimers();
    const link = await screen.findByRole("link", { name: /^open netflix$/i });
    expect(link).toHaveAttribute("href", "https://www.netflix.com/search?q=Arrival");
    link.focus();
    await act(async () => { finishLookup({ links: [{ service: "Netflix", type: "sub", webUrl: "https://www.netflix.com/title/123" }] }); });
    expect(screen.getByRole("link", { name: /^open netflix$/i })).toBe(link);
    expect(link).toHaveAttribute("href", "https://www.netflix.com/title/123");
    expect(link).toHaveFocus();
    expect(screen.getByRole("link", { name: "Watchmode" })).toBeInTheDocument();
  });

  // The logo goes where a button's icon goes, so the label -- and the name the
  // remote's screen reader announces -- is the same as before.
  it("marks the launch control with its service without renaming it", async () => {
    mocks.streamingServices = ["Netflix"];
    mocks.providersByTmdbId = { 101: ["Netflix"] };
    mocks.providerLogosByTmdbId = { 101: { Netflix: "/pbpMk2JmcoNnQwx5JGpXngfoWtp.jpg" } };
    mocks.handleDraw.mockResolvedValue({
      id: "movie-1",
      tmdb_id: 101,
      title: "Arrival",
      streamingProviders: ["Netflix"],
    });
    mocks.getTmdbMovieDetails.mockResolvedValue({ title: "Arrival" });

    renderTonight();
    fireEvent.click(screen.getByRole("button", { name: /draw a movie/i }));
    fireEvent.click(screen.getByRole("button", { name: /reveal a movie/i }));

    const launch = await screen.findByRole("link", { name: /^open netflix$/i });
    expect(launch.querySelector("img")).toHaveAttribute(
      "src",
      "https://image.tmdb.org/t/p/w92/pbpMk2JmcoNnQwx5JGpXngfoWtp.jpg"
    );
  });

  it("restores the drawn result after an external provider handoff reload", async () => {
    window.sessionStorage.setItem(
      "movie-bowl:tv:external-return",
      JSON.stringify({
        bowlId: "family",
        movie: {
          id: "movie-1",
          title: "Arrival",
          release_date: "2016-11-11",
          streamingProviders: ["Netflix"],
        },
        savedAt: Date.now(),
      })
    );

    renderTonight();

    expect(
      await screen.findByRole("heading", { name: /arrival/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /^open netflix$/i })
    ).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "Escape" });
    expect(window.sessionStorage.getItem("movie-bowl:tv:external-return")).toBeNull();
  });

  it("shows a native provider-launch failure without leaving the result", async () => {
    window.sessionStorage.setItem(
      "movie-bowl:tv:external-return",
      JSON.stringify({
        bowlId: "family",
        movie: {
          id: "movie-1",
          title: "Arrival",
          streamingProviders: ["Netflix"],
        },
        savedAt: Date.now(),
      })
    );

    renderTonight();
    await screen.findByRole("heading", { name: /arrival/i });

    act(() => {
      window.dispatchEvent(
        new CustomEvent("moviebowl:provider-launch-error", {
          detail: { message: "Netflix isn't installed on this TV." },
        })
      );
    });

    expect(screen.getByText(/netflix isn't installed/i)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /arrival/i })).toBeInTheDocument();
  });
});
