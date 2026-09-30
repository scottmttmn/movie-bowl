import { describe, expect, it } from "vitest";
import { buildBowlServiceChart } from "../bowlServiceChart";

function title(subscription = [], { ads = [], providers } = {}) {
  return {
    providers: providers || [...subscription, ...ads],
    availability: {
      subscription: subscription.map((name) => ({ name })),
      ads: ads.map((name) => ({ name })),
    },
  };
}

function metadata(titles) {
  return new Map(titles.map((entry, index) => [index + 1, entry]));
}

function rowsOf(chart) {
  return chart.rows.map(({ service, count, isMine }) => [service, count, isMine]);
}

describe("buildBowlServiceChart", () => {
  it("counts titles per paid service and leaves free services out", () => {
    const chart = buildBowlServiceChart({
      metadataByTmdbId: metadata([
        title(["Netflix", "Tubi"]),
        title(["Netflix"], { ads: ["Peacock"] }),
        title(["Kanopy", "Pluto TV"]),
      ]),
      userServices: [],
    });

    expect(rowsOf(chart)).toEqual([
      ["Netflix", 2, false],
      ["Peacock", 1, false],
    ]);
    expect(chart.titleCount).toBe(3);
    expect(chart.streamingCount).toBe(2);
    expect(chart.maxCount).toBe(2);
    expect(chart.hasServices).toBe(false);
  });

  it("always shows the viewer's services, even at zero", () => {
    const chart = buildBowlServiceChart({
      metadataByTmdbId: metadata([title(["Netflix"]), title(["Max"])]),
      userServices: ["Hulu", "Netflix"],
    });

    expect(rowsOf(chart)).toEqual([
      ["Max", 1, false],
      ["Netflix", 1, true],
      ["Hulu", 0, true],
    ]);
  });

  it("fills to eight rows with the best services the viewer lacks", () => {
    const others = ["Max", "Peacock", "Paramount+", "Disney+", "Starz", "AMC+", "MUBI", "Showtime"];
    const chart = buildBowlServiceChart({
      // Max on eight titles, Peacock on seven, and so on down to Showtime on one.
      metadataByTmdbId: metadata(
        others.flatMap((service, index) => Array.from({ length: 8 - index }, () => title([service])))
      ),
      userServices: ["Netflix"],
    });

    expect(chart.rows.map((row) => row.service)).toEqual([
      "Max", "Peacock", "Paramount+", "Disney+", "Starz", "AMC+", "MUBI", "Netflix",
    ]);
  });

  it("keeps three services the viewer lacks however many they have", () => {
    const mine = ["Netflix", "Hulu", "Disney+", "Prime Video", "Max", "Apple TV+", "Paramount+"];
    const chart = buildBowlServiceChart({
      metadataByTmdbId: metadata([
        title(["Peacock"]), title(["Peacock"]), title(["Starz"]), title(["AMC+"]), title(["MUBI"]),
      ]),
      userServices: mine,
    });

    expect(chart.rows).toHaveLength(10);
    expect(chart.rows.filter((row) => !row.isMine).map((row) => row.service)).toEqual([
      "Peacock", "AMC+", "MUBI",
    ]);
  });

  it("names the service that would add the most titles the viewer can't stream", () => {
    const chart = buildBowlServiceChart({
      metadataByTmdbId: metadata([
        // Peacock carries more here, but both of its titles are already on Netflix.
        title(["Netflix", "Peacock"]),
        title(["Netflix", "Peacock"]),
        title(["Peacock"]),
        title(["Max"]),
        title(["Max"]),
      ]),
      userServices: ["Netflix"],
    });

    expect(chart.rows[0]).toEqual({ service: "Peacock", count: 3, isMine: false });
    expect(chart.bestAddition).toEqual({ service: "Max", count: 2 });
  });

  it("returns no best addition when the viewer's services carry everything", () => {
    const chart = buildBowlServiceChart({
      metadataByTmdbId: metadata([title(["Netflix", "Max"]), title(["Netflix"])]),
      userServices: ["Netflix", "Max"],
    });

    expect(chart.bestAddition).toBeNull();
  });

  it("counts a free service the viewer has as already covering a title", () => {
    const chart = buildBowlServiceChart({
      metadataByTmdbId: metadata([
        { providers: ["Max", "Tubi"], availability: { subscription: [{ name: "Max" }], free: [{ name: "Tubi" }] } },
        title(["Max"]),
        title(["Netflix"], { ads: ["Tubi"] }),
      ]),
      userServices: ["Netflix", "Tubi"],
    });

    // Max carries two, but one of them is already free on Tubi.
    expect(chart.bestAddition).toEqual({ service: "Max", count: 1 });
    // The first title is free on Tubi and the third is on Netflix.
    expect(chart.coveredCount).toBe(2);
    // Netflix's only title is on Tubi too, and Tubi itself never gets a bar.
    expect(chart.idleServices).toEqual(["Netflix"]);
    expect(chart.rows.map((row) => row.service)).toEqual(["Max", "Netflix"]);
  });

  it("treats a viewer with only free services as having services", () => {
    const chart = buildBowlServiceChart({
      metadataByTmdbId: metadata([title(["Max"], { ads: ["Tubi"] }), title(["Max"])]),
      userServices: ["Tubi"],
    });

    expect(chart.hasServices).toBe(true);
    expect(chart.bestAddition).toEqual({ service: "Max", count: 1 });
  });

  it("lists the viewer's services that add nothing beyond their others", () => {
    const chart = buildBowlServiceChart({
      metadataByTmdbId: metadata([title(["Netflix", "Hulu"]), title(["Netflix"])]),
      userServices: ["Netflix", "Hulu", "Max"],
    });

    // Hulu's one title is on Netflix too; Max carries nothing, which its zero bar already says.
    expect(chart.idleServices).toEqual(["Hulu"]);
  });

  it("normalizes provider names and falls back to the flat list on older cache rows", () => {
    const chart = buildBowlServiceChart({
      metadataByTmdbId: metadata([
        { providers: ["HBO Max", "Amazon Prime Video"], availability: {} },
      ]),
      userServices: ["Prime Video"],
    });

    expect(rowsOf(chart)).toEqual([
      ["Max", 1, false],
      ["Prime Video", 1, true],
    ]);
  });

  it("describes an empty bowl without rows", () => {
    const chart = buildBowlServiceChart({ metadataByTmdbId: new Map(), userServices: ["Netflix"] });

    expect(chart.titleCount).toBe(0);
    expect(chart.maxCount).toBe(0);
    expect(rowsOf(chart)).toEqual([["Netflix", 0, true]]);
    expect(chart.bestAddition).toBeNull();
  });
});
