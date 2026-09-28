import { describe, expect, it } from "vitest";
import {
  DRAW_REVEAL_FALLBACK_OPEN_MS,
  getDrawReveal,
  getDrawRevealCopy,
  getDrawRevealPhaseAt,
  getDrawRevealPreview,
  getDrawRevealTimeline,
} from "../drawReveal";
import { getSoloDrawReveal, getSoloDrawRevealPreview, getSoloDrawRevealMethod } from "../soloDrawReveal";

const sam = (id, extra = {}) => ({ id, added_by: "sam", profiles: { display_name: "Sam" }, ...extra });
const alex = (id, extra = {}) => ({ id, added_by: "alex", profiles: { display_name: "Alex" }, ...extra });
const pack = (id) => ({ id, starter_pack: true, added_by_name: "Classics" });

describe("solo reveal", () => {
  it("shows one crowd of distinct titles across bowls, keeping custom rows separate", () => {
    const pool = [
      { id: "a", tmdb_id: 101, bowl_id: "one" },
      { id: "b", tmdb_id: 101, bowl_id: "two" },
      { id: "c", tmdb_id: -1, title: "Home Movies" },
      { id: "d", tmdb_id: -1, title: "Home Movies" },
    ];
    expect(getSoloDrawRevealPreview(pool)).toMatchObject({ stage: "bowl", people: [], total: 3, pinnedPool: false });
    const reveal = getSoloDrawReveal(pool);
    expect(reveal.person).toBeNull();
    expect(getDrawRevealCopy(reveal).announcement).toBe("1 of your 3 titles");
  });

  it("limits the crowd to pins even when the representative copy is not pinned", () => {
    const pool = [
      { id: "a", tmdb_id: 101 },
      { id: "b", tmdb_id: 101, is_pinned: true },
      { id: "c", tmdb_id: 202 },
    ];
    const preview = getSoloDrawRevealPreview(pool);
    expect(preview).toMatchObject({ total: 1, pinnedPool: true });
    expect(getSoloDrawRevealMethod(preview).revealPending).toContain("pinned titles");
    expect(getDrawRevealCopy(getSoloDrawReveal(pool)).announcement).toBe("Your only eligible pinned title");
  });

  it("does not invent a preview for an empty pool", () => {
    expect(getSoloDrawRevealPreview([])).toBeNull();
    expect(getSoloDrawReveal([])).toBeNull();
  });
});

describe("getDrawReveal", () => {
  it("returns nothing without a drawn movie or a pool", () => {
    expect(getDrawReveal({ drawMethod: "person_first", pool: [sam("a")], drawn: null })).toBeNull();
    expect(getDrawReveal({ drawMethod: "person_first", pool: [], drawn: sam("a") })).toBeNull();
  });

  it("lands person-first on the turn it actually spent, and counts only that pile", () => {
    const pool = [sam("a"), sam("b"), sam("c"), alex("d")];
    const reveal = getDrawReveal({ drawMethod: "person_first", pool, drawn: alex("d"), turnBucketKey: "user:alex" });

    expect(reveal.person).toEqual({
      mode: "random",
      people: [
        { key: "user:sam", label: "Sam", count: 3 },
        { key: "user:alex", label: "Alex", count: 1 },
      ],
      chosenKey: "user:alex",
      chosenLabel: "Alex",
    });
    expect(reveal.title).toEqual({ mode: "random", scope: "person", personLabel: "Alex", count: 1 });
    expect(getDrawRevealCopy(reveal)).toEqual({
      person: "Alex, at random",
      title: "Alex's only movie",
      announcement: "Alex, at random. Alex's only movie",
    });
  });

  it("lists each person once however many titles they added", () => {
    const pool = [sam("a"), sam("b"), sam("c"), sam("d"), alex("e")];
    const reveal = getDrawReveal({ drawMethod: "person_first", pool, drawn: sam("b"), turnBucketKey: "user:sam" });
    expect(reveal.person.people).toHaveLength(2);
    expect(reveal.title.count).toBe(4);
  });

  it("counts starter pack slips in the chosen person's pile", () => {
    const pool = [sam("a"), alex("b"), pack("p1"), pack("p2")];
    const reveal = getDrawReveal({ drawMethod: "person_first", pool, drawn: pack("p1"), turnBucketKey: "user:sam" });
    expect(reveal.person.chosenKey).toBe("user:sam");
    expect(reveal.title).toMatchObject({ scope: "person", count: 3 });
  });

  it("skips the person stage when only one person is in the pool", () => {
    const reveal = getDrawReveal({
      drawMethod: "person_first",
      pool: [sam("a"), sam("b")],
      drawn: sam("a"),
      turnBucketKey: "user:sam",
    });
    expect(reveal.person).toBeNull();
    expect(getDrawRevealCopy(reveal).title).toBe("1 of Sam's 2 movies");
  });

  it("shows a pinned pick as the pin, not a shuffle", () => {
    const pool = [sam("a", { is_pinned: true }), sam("b"), alex("c")];
    const reveal = getDrawReveal({
      drawMethod: "person_first",
      pool,
      drawn: sam("a", { is_pinned: true }),
      turnBucketKey: "user:sam",
    });
    expect(reveal.title.mode).toBe("pinned");
    expect(getDrawRevealCopy(reveal).title).toBe("Sam's pinned movie");
  });

  it("draws title-first from the whole bowl with no person stage, and ignores pins", () => {
    const pool = [sam("a", { is_pinned: true }), sam("b"), alex("c")];
    const reveal = getDrawReveal({ drawMethod: "title_first", pool, drawn: sam("a", { is_pinned: true }) });
    expect(reveal).toEqual({
      methodId: "title_first",
      person: null,
      title: { mode: "random", scope: "bowl", count: 3 },
    });
    expect(getDrawRevealCopy(reveal).title).toBe("1 of 3 movies in the bowl");
  });

  it("shows rotation as a turn, taken from the drawn slip's contributor", () => {
    const pool = [sam("a"), alex("b"), alex("c")];
    const reveal = getDrawReveal({ drawMethod: "rotation", pool, drawn: alex("c") });
    expect(reveal.person).toMatchObject({ mode: "turn", chosenKey: "user:alex" });
    expect(getDrawRevealCopy(reveal).person).toBe("Alex's turn");
    expect(reveal.title.count).toBe(2);
  });

  it("does not guess whose turn a rotation pack slip spent when the database does not say", () => {
    const pool = [sam("a"), alex("b"), pack("p1")];
    const reveal = getDrawReveal({ drawMethod: "rotation", pool, drawn: pack("p1") });
    expect(reveal.person).toBeNull();
    expect(reveal.title).toEqual({ mode: "random", scope: "pack", count: null });
    expect(getDrawRevealCopy(reveal).title).toBe("From the starter pack");
  });

  it("does not trust a person-first turn key that is not in the pool", () => {
    const reveal = getDrawReveal({ drawMethod: "person_first", pool: [sam("a"), alex("b")], drawn: sam("a"), turnBucketKey: "user:nobody" });
    expect(reveal.person).toBeNull();
  });

  it("draws from the pack alone when nobody owns an eligible title", () => {
    const pool = [pack("p1"), pack("p2")];
    const reveal = getDrawReveal({ drawMethod: "person_first", pool, drawn: pack("p2"), turnBucketKey: null });
    expect(reveal).toMatchObject({ person: null, title: { scope: "pack", count: 2 } });
    expect(getDrawRevealCopy(reveal).title).toBe("1 of 2 movies from the starter pack");
  });

  it("unwraps { movie, providers } candidates and names link guests", () => {
    const guest = { id: "g", added_by: null, added_by_name: "" };
    const pool = [{ movie: sam("a"), providers: [] }, { movie: guest, providers: [] }];
    const reveal = getDrawReveal({ drawMethod: "person_first", pool, drawn: guest, turnBucketKey: "guest:Link Guest" });
    expect(reveal.person.chosenLabel).toBe("Link Guest");
  });

  it("reads an unknown method as the default", () => {
    const reveal = getDrawReveal({ drawMethod: "future_method", pool: [sam("a"), alex("b")], drawn: sam("a"), turnBucketKey: "user:sam" });
    expect(reveal.methodId).toBe("person_first");
  });

  it("lands a rotation pack slip on the turn the database says it spent", () => {
    const pool = [sam("a"), alex("b"), pack("p1")];
    const reveal = getDrawReveal({ drawMethod: "rotation", pool, drawn: pack("p1"), turnBucketKey: "user:sam" });
    expect(reveal.person).toMatchObject({ mode: "turn", chosenKey: "user:sam" });
    expect(reveal.title).toMatchObject({ scope: "person", count: 2 });
  });

  it("lines rotation up in the order the draw ranked it", () => {
    const pool = [sam("a"), alex("b"), alex("c")];
    const reveal = getDrawReveal({
      drawMethod: "rotation",
      pool,
      drawn: alex("c"),
      turnBucketKey: "user:alex",
      rotationQueue: [
        { bucket_key: "user:alex", never_drawn: true },
        { bucket_key: "user:sam", never_drawn: false },
      ],
    });
    expect(reveal.person.queue).toEqual([
      { key: "user:alex", neverDrawn: true },
      { key: "user:sam", neverDrawn: false },
    ]);
  });

  it("drops a queue that does not put the drawn person first or does not match the pool", () => {
    const pool = [sam("a"), alex("b")];
    const base = { drawMethod: "rotation", pool, drawn: alex("b"), turnBucketKey: "user:alex" };
    expect(getDrawReveal({
      ...base,
      rotationQueue: [{ bucket_key: "user:sam" }, { bucket_key: "user:alex" }],
    }).person.queue).toBeUndefined();
    expect(getDrawReveal({
      ...base,
      rotationQueue: [{ bucket_key: "user:alex" }],
    }).person.queue).toBeUndefined();
    expect(getDrawReveal({ ...base, rotationQueue: null }).person.queue).toBeUndefined();
  });

  it("never lines up person-first, even when handed a queue", () => {
    const reveal = getDrawReveal({
      drawMethod: "person_first",
      pool: [sam("a"), alex("b")],
      drawn: sam("a"),
      turnBucketKey: "user:sam",
      rotationQueue: [{ bucket_key: "user:sam" }, { bucket_key: "user:alex" }],
    });
    expect(reveal.person.queue).toBeUndefined();
  });
});

describe("getDrawRevealPreview", () => {
  it("sorts a person-first pool into one pile per person without naming anyone", () => {
    const preview = getDrawRevealPreview({
      drawMethod: "person_first",
      pool: [sam("a"), sam("b"), alex("c"), pack("p1")],
    });
    expect(preview).toEqual({
      methodId: "person_first",
      stage: "people",
      mode: "random",
      people: [
        { key: "user:sam", label: "Sam", count: 2 },
        { key: "user:alex", label: "Alex", count: 1 },
      ],
      sharedCount: 1,
      total: 4,
    });
  });

  it("marks rotation's piles as a turn to be taken", () => {
    expect(getDrawRevealPreview({ drawMethod: "rotation", pool: [sam("a"), alex("b")] }).mode).toBe("turn");
  });

  it("raises title-first, and a pool with one person, as a single crowd", () => {
    expect(getDrawRevealPreview({ drawMethod: "title_first", pool: [sam("a"), alex("b")] })).toMatchObject({
      stage: "bowl",
      people: [],
      total: 2,
    });
    expect(getDrawRevealPreview({ drawMethod: "person_first", pool: [sam("a"), sam("b")] }).stage).toBe("bowl");
  });

  it("returns nothing for an empty pool", () => {
    expect(getDrawRevealPreview({ drawMethod: "person_first", pool: [] })).toBeNull();
  });
});

describe("getDrawRevealTimeline", () => {
  const pool = [sam("a"), sam("b"), sam("c"), alex("d")];
  const preview = getDrawRevealPreview({ drawMethod: "person_first", pool });
  const personReveal = getDrawReveal({ drawMethod: "person_first", pool, drawn: sam("b"), turnBucketKey: "user:sam" });
  const names = (timeline) => timeline.phases.map((phase) => phase.name);

  it("plays only the stages that claim nothing until the result is in", () => {
    const timeline = getDrawRevealTimeline({ preview, previewAt: 100 });
    expect(names(timeline)).toEqual(["gather", "rise", "arrange", "loop"]);
    expect(timeline.openAt).toBeNull();
  });

  it("waits for the pool before arranging it", () => {
    expect(names(getDrawRevealTimeline({}))).toEqual(["gather", "rise"]);
    const late = getDrawRevealTimeline({ preview, previewAt: 1400 });
    expect(late.phases.find((phase) => phase.name === "arrange").at).toBe(1400);
  });

  it("plays person-first whole, and opens just under five seconds after a quick result", () => {
    const timeline = getDrawRevealTimeline({ preview, previewAt: 50, reveal: personReveal, resultAt: 300 });
    expect(timeline.phases).toEqual([
      { name: "gather", at: 0 },
      { name: "rise", at: 450 },
      { name: "arrange", at: 1000 },
      { name: "loop", at: 1600 },
      { name: "sweep", at: 1600 },
      { name: "land", at: 2900 },
      { name: "fan", at: 3350 },
      { name: "pick", at: 3850 },
      { name: "unfold", at: 4250 },
    ]);
    expect(timeline.openAt).toBe(4950);
  });

  it("never lands before the result, however slow it is", () => {
    const timeline = getDrawRevealTimeline({ preview, previewAt: 50, reveal: personReveal, resultAt: 3200 });
    expect(timeline.phases.find((phase) => phase.name === "sweep").at).toBe(3200);
    expect(timeline.openAt).toBe(3200 + 1300 + 450 + 500 + 400 + 700);
  });

  it("lifts a pinned pick straight off the pile, and a lone movie without a fan", () => {
    const pinnedPool = [sam("a", { is_pinned: true }), sam("b"), alex("c")];
    const pinned = getDrawReveal({
      drawMethod: "person_first",
      pool: pinnedPool,
      drawn: sam("a", { is_pinned: true }),
      turnBucketKey: "user:sam",
    });
    expect(names(getDrawRevealTimeline({ reveal: pinned, resultAt: 0 }))).toEqual(
      ["gather", "rise", "arrange", "loop", "sweep", "land", "pinlift", "unfold"]
    );

    const lone = getDrawReveal({ drawMethod: "person_first", pool, drawn: alex("d"), turnBucketKey: "user:alex" });
    expect(names(getDrawRevealTimeline({ reveal: lone, resultAt: 0 }))).toEqual(
      ["gather", "rise", "arrange", "loop", "sweep", "land", "pick", "unfold"]
    );
  });

  it("lines rotation up before the turn, and steps straight forward without a queue", () => {
    const rotationPool = [sam("a"), alex("b")];
    const withQueue = getDrawReveal({
      drawMethod: "rotation",
      pool: rotationPool,
      drawn: alex("b"),
      turnBucketKey: "user:alex",
      rotationQueue: [{ bucket_key: "user:alex" }, { bucket_key: "user:sam" }],
    });
    expect(names(getDrawRevealTimeline({ reveal: withQueue, resultAt: 0 }))).toEqual(
      ["gather", "rise", "arrange", "loop", "lineup", "turn", "land", "pick", "unfold"]
    );
    const without = getDrawReveal({ drawMethod: "rotation", pool: rotationPool, drawn: alex("b") });
    expect(names(getDrawRevealTimeline({ reveal: without, resultAt: 0 }))).toContain("turn");
    expect(names(getDrawRevealTimeline({ reveal: without, resultAt: 0 }))).not.toContain("lineup");
  });

  it("plucks title-first out of the crowd", () => {
    const titleFirst = getDrawReveal({ drawMethod: "title_first", pool, drawn: sam("a") });
    const timeline = getDrawRevealTimeline({
      preview: getDrawRevealPreview({ drawMethod: "title_first", pool }),
      previewAt: 0,
      reveal: titleFirst,
      resultAt: 200,
    });
    expect(timeline.stage).toBe("bowl");
    expect(names(timeline)).toEqual(["gather", "rise", "arrange", "loop", "flicker", "pluck", "unfold"]);
    expect(timeline.openAt).toBe(1600 + 1300 + 500 + 700);
  });

  it("opens as it always did when the result has nothing to replay", () => {
    expect(getDrawRevealTimeline({ preview, previewAt: 0, reveal: null, resultAt: 300 }).openAt)
      .toBe(DRAW_REVEAL_FALLBACK_OPEN_MS);
    expect(getDrawRevealTimeline({ reveal: null, resultAt: 2000 }).openAt).toBe(2000);
  });

  it("keeps every stage but drops the flight with reduced motion", () => {
    const timeline = getDrawRevealTimeline({ preview, previewAt: 0, reveal: personReveal, resultAt: 0, reducedMotion: true });
    expect(names(timeline)).toEqual(["gather", "arrange", "loop", "sweep", "land", "pick", "unfold"]);
    expect(timeline.openAt).toBeLessThan(2600);
  });

  it("reports the phase showing at a moment", () => {
    const timeline = getDrawRevealTimeline({ preview, previewAt: 0, reveal: personReveal, resultAt: 0 });
    expect(getDrawRevealPhaseAt(timeline, -1)).toBe("idle");
    expect(getDrawRevealPhaseAt(timeline, 0)).toBe("gather");
    expect(getDrawRevealPhaseAt(timeline, 2899)).toBe("sweep");
    expect(getDrawRevealPhaseAt(timeline, 2900)).toBe("land");
  });
});
