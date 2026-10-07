import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildTrailerQueue,
  readRecentTrailers,
  rememberTrailers,
  selectTrailerCandidates,
} from "../theaterQueue";

// Fisher-Yates leaves the list untouched when every draw picks the last slot.
const inOrder = () => 0.999999;

function movie(id, tmdbId, title) {
  return { id, tmdb_id: tmdbId, title };
}

function trailerFetcherFor(trailerKeyByTmdbId) {
  return vi.fn(async (candidate) => {
    const key = trailerKeyByTmdbId[candidate.tmdb_id];
    return key ? { key, embedUrl: `https://www.youtube.com/embed/${key}` } : null;
  });
}

describe("theater queue", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("excludes the drawn movie and custom entries without a TMDB id", () => {
    const candidates = selectTrailerCandidates(
      [
        movie("a", 101, "Arrival"),
        movie("b", 202, "Dune"),
        movie("c", -5, "Uncle Rob's Home Video"),
      ],
      { excludeMovieId: "a", random: inOrder }
    );

    expect(candidates.map((item) => item.movie.id)).toEqual(["b"]);
  });

  it("orders the eligible draw pool ahead of the rest of the bowl", () => {
    const candidates = selectTrailerCandidates(
      [movie("b", 202, "Dune"), movie("c", 303, "Tenet"), movie("d", 404, "Her")],
      { excludeMovieId: "a", eligibleMovieIds: ["d", "c"], random: inOrder }
    );

    expect(candidates.map((item) => item.movie.id)).toEqual(["c", "d", "b"]);
  });

  it("fills the queue up to the requested count", async () => {
    const fetchTrailer = trailerFetcherFor({ 202: "dune", 303: "tenet", 404: "her" });

    const queue = await buildTrailerQueue({
      movies: [
        movie("a", 101, "Arrival"),
        movie("b", 202, "Dune"),
        movie("c", 303, "Tenet"),
        movie("d", 404, "Her"),
      ],
      excludeMovieId: "a",
      count: 2,
      fetchTrailer,
      random: inOrder,
    });

    expect(queue).toHaveLength(2);
    expect(queue.map((item) => item.trailer.key)).toEqual(["dune", "tenet"]);
    // Stops looking up details as soon as the queue is full.
    expect(fetchTrailer).toHaveBeenCalledTimes(2);
  });

  it("skips movies that have no official trailer", async () => {
    const fetchTrailer = trailerFetcherFor({ 303: "tenet" });

    const queue = await buildTrailerQueue({
      movies: [movie("b", 202, "Dune"), movie("c", 303, "Tenet")],
      excludeMovieId: "a",
      count: 2,
      fetchTrailer,
      random: inOrder,
    });

    expect(queue.map((item) => item.title)).toEqual(["Tenet"]);
  });

  it("prefers trailers the device has not played recently", async () => {
    const fetchTrailer = trailerFetcherFor({ 202: "dune", 303: "tenet" });

    const queue = await buildTrailerQueue({
      movies: [movie("b", 202, "Dune"), movie("c", 303, "Tenet")],
      excludeMovieId: "a",
      count: 1,
      recentTrailers: [{ key: "dune", tmdbId: 202 }],
      fetchTrailer,
      random: inOrder,
    });

    expect(queue.map((item) => item.trailer.key)).toEqual(["tenet"]);
  });

  it("falls back to a recent trailer when every candidate has played", async () => {
    const fetchTrailer = trailerFetcherFor({ 202: "dune" });

    const queue = await buildTrailerQueue({
      movies: [movie("b", 202, "Dune")],
      excludeMovieId: "a",
      count: 2,
      recentTrailers: [{ key: "dune", tmdbId: 202 }],
      fetchTrailer,
      random: inOrder,
    });

    expect(queue.map((item) => item.trailer.key)).toEqual(["dune"]);
  });

  it("returns an empty queue when the bowl holds only the drawn movie", async () => {
    const fetchTrailer = trailerFetcherFor({ 101: "arrival" });

    const queue = await buildTrailerQueue({
      movies: [movie("a", 101, "Arrival")],
      excludeMovieId: "a",
      count: 3,
      fetchTrailer,
      random: inOrder,
    });

    expect(queue).toEqual([]);
    expect(fetchTrailer).not.toHaveBeenCalled();
  });

  it("previews a title the draw can still reach over one it cannot", async () => {
    const fetchTrailer = trailerFetcherFor({ 202: "dune", 303: "tenet", 404: "her" });

    const queue = await buildTrailerQueue({
      movies: [movie("b", 202, "Dune"), movie("c", 303, "Tenet"), movie("d", 404, "Her")],
      eligibleMovieIds: ["d"],
      excludeMovieId: "a",
      count: 1,
      fetchTrailer,
      random: inOrder,
    });

    expect(queue.map((item) => item.trailer.key)).toEqual(["her"]);
    expect(fetchTrailer).toHaveBeenCalledTimes(1);
  });

  it("backfills from the rest of the bowl when the eligible pool is too small", async () => {
    const fetchTrailer = trailerFetcherFor({ 202: "dune", 303: "tenet", 404: "her" });

    const queue = await buildTrailerQueue({
      movies: [movie("b", 202, "Dune"), movie("c", 303, "Tenet"), movie("d", 404, "Her")],
      eligibleMovieIds: ["d"],
      excludeMovieId: "a",
      count: 3,
      fetchTrailer,
      random: inOrder,
    });

    expect(queue.map((item) => item.trailer.key)).toEqual(["her", "dune", "tenet"]);
  });

  it("keeps an eligible repeat ahead of a fresh title the draw cannot reach", async () => {
    const fetchTrailer = trailerFetcherFor({ 202: "dune", 404: "her" });

    const queue = await buildTrailerQueue({
      movies: [movie("b", 202, "Dune"), movie("d", 404, "Her")],
      eligibleMovieIds: ["d"],
      excludeMovieId: "a",
      count: 1,
      recentTrailers: [{ key: "her", tmdbId: 404 }],
      fetchTrailer,
      random: inOrder,
    });

    expect(queue.map((item) => item.trailer.key)).toEqual(["her"]);
  });

  it("previews the whole bowl when a filter leaves no eligible title", async () => {
    const fetchTrailer = trailerFetcherFor({ 202: "dune", 303: "tenet" });

    const queue = await buildTrailerQueue({
      movies: [movie("b", 202, "Dune"), movie("c", 303, "Tenet")],
      eligibleMovieIds: [],
      excludeMovieId: "a",
      count: 2,
      fetchTrailer,
      random: inOrder,
    });

    expect(queue.map((item) => item.trailer.key)).toEqual(["dune", "tenet"]);
  });

  it("puts unplayed movies first, then the ones played longest ago", () => {
    const candidates = selectTrailerCandidates(
      [
        movie("b", 202, "Dune"),
        movie("c", 303, "Tenet"),
        movie("d", 404, "Her"),
        movie("e", 505, "Heat"),
      ],
      {
        recentTrailers: [
          { key: "tenet", tmdbId: 303 },
          { key: "dune", tmdbId: 202 },
        ],
        random: inOrder,
      }
    );

    expect(candidates.map((item) => item.movie.id)).toEqual(["d", "e", "b", "c"]);
  });

  it("keeps the draw's pool ahead of unplayed titles it cannot reach", () => {
    const candidates = selectTrailerCandidates(
      [movie("b", 202, "Dune"), movie("c", 303, "Tenet")],
      {
        eligibleMovieIds: ["c"],
        recentTrailers: [{ key: "tenet", tmdbId: 303 }],
        random: inOrder,
      }
    );

    expect(candidates.map((item) => item.movie.id)).toEqual(["c", "b"]);
  });

  it("looks up only as many movies as it needs when unplayed ones lead", async () => {
    const fetchTrailer = trailerFetcherFor({ 202: "dune", 303: "tenet", 404: "her", 505: "heat" });

    const queue = await buildTrailerQueue({
      movies: [
        movie("b", 202, "Dune"),
        movie("c", 303, "Tenet"),
        movie("d", 404, "Her"),
        movie("e", 505, "Heat"),
      ],
      count: 2,
      recentTrailers: [
        { key: "dune", tmdbId: 202 },
        { key: "tenet", tmdbId: 303 },
      ],
      fetchTrailer,
      random: inOrder,
    });

    expect(queue.map((item) => item.trailer.key)).toEqual(["her", "heat"]);
    expect(fetchTrailer).toHaveBeenCalledTimes(2);
  });

  it("keeps looking down the list until it has enough trailers", async () => {
    const movies = Array.from({ length: 12 }, (_, index) =>
      movie(`m${index}`, 100 + index, `Movie ${index}`)
    );
    const fetchTrailer = trailerFetcherFor({ 111: "last" });

    const queue = await buildTrailerQueue({
      movies,
      count: 3,
      fetchTrailer,
      random: inOrder,
    });

    expect(queue.map((item) => item.trailer.key)).toEqual(["last"]);
    expect(fetchTrailer).toHaveBeenCalledTimes(12);
  });

  it("still treats a trailer recorded before movies were remembered as a repeat", async () => {
    window.localStorage.setItem("movie-bowl:tv:recent-trailers", JSON.stringify(["dune"]));
    const fetchTrailer = trailerFetcherFor({ 202: "dune", 303: "tenet" });

    const queue = await buildTrailerQueue({
      movies: [movie("b", 202, "Dune"), movie("c", 303, "Tenet")],
      count: 1,
      recentTrailers: readRecentTrailers(),
      fetchTrailer,
      random: inOrder,
    });

    expect(queue.map((item) => item.trailer.key)).toEqual(["tenet"]);
  });

  it("records played trailers with their movie, most recent first, without duplicates", () => {
    const entry = (key, tmdbId) => ({ movieId: key, tmdbId, title: key, trailer: { key } });
    rememberTrailers([entry("dune", 202), entry("tenet", 303)]);
    // A queue plays in order, so its last preview is the most recent.
    rememberTrailers([entry("her", 404), entry("dune", 202)]);

    expect(readRecentTrailers()).toEqual([
      { key: "dune", tmdbId: 202 },
      { key: "her", tmdbId: 404 },
      { key: "tenet", tmdbId: 303 },
    ]);
  });
});
