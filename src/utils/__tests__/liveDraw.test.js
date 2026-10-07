import { describe, expect, it } from "vitest";
import {
  LIVE_DRAW_VERSION,
  buildLiveDraw,
  findAnnouncedDraw,
  getBowlLiveTopic,
  parseLiveDraw,
  verifyAnnouncedReveal,
} from "../liveDraw";

const preview = { methodId: "person_first", stage: "people", mode: "random", people: [{ key: "user:a", label: "Ann", count: 2 }], sharedCount: 0, total: 2 };
const reveal = {
  methodId: "person_first",
  person: { mode: "random", people: [], chosenKey: "user:a", chosenLabel: "Ann" },
  title: { mode: "random", scope: "person", personLabel: "Ann", count: 2 },
};

describe("liveDraw", () => {
  it("names one channel per bowl, and none without a bowl", () => {
    expect(getBowlLiveTopic("b1")).toBe("bowl-live:b1");
    expect(getBowlLiveTopic(null)).toBeNull();
  });

  it("round-trips an announcement through what a listener accepts", () => {
    const sent = buildLiveDraw({ bowlMovieId: 42, title: "Heat", methodId: "person_first", preview, reveal, drawnBy: "  Robin  " });
    expect(sent).toMatchObject({ v: LIVE_DRAW_VERSION, bowlMovieId: "42", drawnBy: "Robin" });
    expect(parseLiveDraw(JSON.parse(JSON.stringify(sent)))).toEqual({
      bowlMovieId: "42",
      title: "Heat",
      methodId: "person_first",
      preview,
      reveal,
      drawnBy: "Robin",
    });
    expect(buildLiveDraw({ title: "No id" })).toBeNull();
  });

  it("drops what it does not understand and trims what is too long", () => {
    expect(parseLiveDraw(null)).toBeNull();
    expect(parseLiveDraw([])).toBeNull();
    expect(parseLiveDraw({ v: LIVE_DRAW_VERSION + 1, bowlMovieId: "1" })).toBeNull();
    expect(parseLiveDraw({ v: LIVE_DRAW_VERSION, bowlMovieId: 1 })).toBeNull();

    const odd = parseLiveDraw({
      v: LIVE_DRAW_VERSION,
      bowlMovieId: "1",
      title: "x".repeat(500),
      preview: { people: "nope" },
      reveal: { title: "nope" },
      drawnBy: "y".repeat(200),
    });
    expect(odd.title).toHaveLength(300);
    expect(odd.drawnBy).toHaveLength(80);
    expect(odd.preview).toBeNull();
    expect(odd.reveal).toBeNull();
  });

  it("finds only a draw the reloaded bowl shows", () => {
    const watched = [{ bowlMovieId: "7", title: "Alien" }];
    expect(findAnnouncedDraw(watched, "7")).toBe(watched[0]);
    expect(findAnnouncedDraw(watched, "8")).toBeNull();
    expect(findAnnouncedDraw(null, "7")).toBeNull();
  });

  it("keeps a reveal only when it lands on the slip's own contributor", () => {
    expect(verifyAnnouncedReveal(reveal, { added_by: "a" })).toBe(reveal);
    expect(verifyAnnouncedReveal(reveal, { added_by: "b" })).toBeNull();
    // A pack slip spends a turn only the drawing screen knew.
    expect(verifyAnnouncedReveal(reveal, { starter_pack: "classics" })).toBe(reveal);
    const flat = { methodId: "title_first", person: null, title: { mode: "random", scope: "bowl", count: 3 } };
    expect(verifyAnnouncedReveal(flat, { added_by: "b" })).toBe(flat);
    expect(verifyAnnouncedReveal(null, { added_by: "a" })).toBeNull();
  });
});
