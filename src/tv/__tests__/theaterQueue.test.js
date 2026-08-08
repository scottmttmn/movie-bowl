import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildTrailerQueue,
  readRecentTrailerKeys,
  rememberTrailerKeys,
  selectTrailerCandidates,
} from "../utils/theaterQueue";

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

    expect(candidates.map((item) => item.id)).toEqual(["b"]);
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
      recentKeys: ["dune"],
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
      recentKeys: ["dune"],
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

  it("records played trailers most recent first without duplicates", () => {
    rememberTrailerKeys(["dune", "tenet"]);
    rememberTrailerKeys(["her", "dune"]);

    expect(readRecentTrailerKeys()).toEqual(["her", "dune", "tenet"]);
  });
});
