import { describe, expect, it } from "vitest";
import {
  LIVE_DRAW_VERSION,
  MAX_ANNOUNCED_DRAW_AGE_MS,
  buildLiveDraw,
  findAnnouncedDraw,
  getBowlLiveTopic,
  parseLiveDraw,
  verifyAnnouncedReveal,
} from "../liveDraw";

const people = [{ key: "user:a", label: "Ann", count: 2 }, { key: "user:b", label: "Bo", count: 1 }];
const preview = { methodId: "person_first", stage: "people", mode: "random", people, sharedCount: 0, total: 3 };
const reveal = {
  methodId: "person_first",
  person: { mode: "random", people, chosenKey: "user:a", chosenLabel: "Ann" },
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

  it("drops a preview or reveal the stage could not draw, and keeps the draw", () => {
    const announce = (extra) => parseLiveDraw({ v: LIVE_DRAW_VERSION, bowlMovieId: "1", ...extra });
    const malformedPreviews = [
      { ...preview, people: [null] },
      { ...preview, people: [{ key: "user:a", label: "Ann" }] },
      { ...preview, people: [{ key: 7, label: "Ann", count: 1 }] },
      { ...preview, people: [] },
      { ...preview, stage: "pile" },
      { ...preview, total: "3" },
    ];
    malformedPreviews.forEach((shape) => expect(announce({ preview: shape }).preview).toBeNull());

    const malformedReveals = [
      { ...reveal, person: {}, title: {} },
      { ...reveal, person: {} },
      { ...reveal, person: { ...reveal.person, people: null } },
      { ...reveal, person: { ...reveal.person, people: [null] } },
      { ...reveal, person: { ...reveal.person, chosenKey: "user:z" } },
      { ...reveal, person: { ...reveal.person, queue: [null] } },
      { ...reveal, title: { ...reveal.title, scope: "elsewhere" } },
      { ...reveal, title: { ...reveal.title, count: -1 } },
    ];
    malformedReveals.forEach((shape) => {
      const parsed = announce({ reveal: shape });
      expect(parsed.reveal).toBeNull();
      expect(parsed.bowlMovieId).toBe("1");
    });

    const rotation = { ...reveal, person: { ...reveal.person, mode: "turn", queue: [{ key: "user:a", neverDrawn: true, extra: 1 }] } };
    expect(announce({ reveal: rotation }).reveal.person.queue).toEqual([{ key: "user:a", neverDrawn: true }]);
    const flat = { methodId: "title_first", person: null, title: { mode: "random", scope: "bowl", count: 3 } };
    expect(announce({ reveal: flat }).reveal).toEqual(flat);
  });

  it("finds only the bowl's newest draw, while it is recent, and once per screen", () => {
    const now = Date.parse("2026-10-08T01:00:00Z");
    const fresh = { drawEventId: "e2", bowlMovieId: "7", title: "Alien", drawn_at: "2026-10-08T00:59:00Z" };
    const older = { drawEventId: "e1", bowlMovieId: "8", title: "Heat", drawn_at: "2026-10-07T20:00:00Z" };
    expect(findAnnouncedDraw([older, fresh], "7", { now })).toBe(fresh);
    // An earlier draw still in the watched list is history, not news.
    expect(findAnnouncedDraw([older, fresh], "8", { now })).toBeNull();
    expect(findAnnouncedDraw([fresh], "7", { now: now + MAX_ANNOUNCED_DRAW_AGE_MS + 60000 })).toBeNull();
    expect(findAnnouncedDraw([fresh], "9", { now })).toBeNull();
    expect(findAnnouncedDraw([{ ...fresh, drawn_at: null }], "7", { now })).toBeNull();
    expect(findAnnouncedDraw(null, "7", { now })).toBeNull();

    const played = new Set();
    expect(findAnnouncedDraw([fresh], "7", { now, played })).toBe(fresh);
    expect(findAnnouncedDraw([fresh], "7", { now, played })).toBeNull();
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
