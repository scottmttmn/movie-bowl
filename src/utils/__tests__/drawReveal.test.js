import { describe, expect, it } from "vitest";
import { getDrawReveal, getDrawRevealCopy } from "../drawReveal";

const sam = (id, extra = {}) => ({ id, added_by: "sam", profiles: { display_name: "Sam" }, ...extra });
const alex = (id, extra = {}) => ({ id, added_by: "alex", profiles: { display_name: "Alex" }, ...extra });
const pack = (id) => ({ id, starter_pack: true, added_by_name: "Classics" });

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
        { key: "user:sam", label: "Sam" },
        { key: "user:alex", label: "Alex" },
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

  it("does not guess whose turn a rotation pack slip spent", () => {
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
});
