import { describe, expect, it } from "vitest";
import {
  ANY_TIME,
  describeOpenChoice,
  getClosedPlaceIds,
  getDefaultPick,
  getPickDays,
  getPlannedDayEnd,
  isOpenAt,
  normalizeOpenChoice,
  resolveOpenMoment,
  sortSlipsByOpen,
} from "../restaurantHours";
import { filterRestaurantSlips } from "../restaurants";

// Wednesday, November 11, 2026, half past five in the afternoon, local time.
const NOW = new Date(2026, 10, 11, 17, 30).getTime();
const period = (openDay, openHour, closeDay, closeHour) => ({
  open: { day: openDay, hour: openHour, minute: 0 },
  close: { day: closeDay, hour: closeHour, minute: 0 },
});
const hours = (...periods) => ({ closedForGood: false, periods, timeZone: null, utcOffsetMinutes: null });
const at = (weekday, hour, minute = 0) => ({ wall: { weekday, minutes: hour * 60 + minute } });

describe("isOpenAt", () => {
  it("reads a wall-clock time against the week's periods", () => {
    const dinner = hours(period(6, 17, 6, 21));
    expect(isOpenAt(dinner, at(6, 19))).toBe(true);
    expect(isOpenAt(dinner, at(6, 17))).toBe(true);
    expect(isOpenAt(dinner, at(6, 21))).toBe(false);
    expect(isOpenAt(dinner, at(5, 19))).toBe(false);
  });

  it("follows a period past midnight and around the end of the week", () => {
    const late = hours(period(5, 18, 6, 2), period(6, 20, 0, 1));
    expect(isOpenAt(late, at(6, 1))).toBe(true);
    expect(isOpenAt(late, at(6, 3))).toBe(false);
    expect(isOpenAt(late, at(0, 0, 30))).toBe(true);
    expect(isOpenAt(late, at(0, 1))).toBe(false);
  });

  it("treats an opening with no closing as never closed", () => {
    expect(isOpenAt(hours({ open: { day: 0, hour: 0, minute: 0 }, close: null }), at(3, 4))).toBe(true);
  });

  it("answers null without hours and false for a place closed for good", () => {
    expect(isOpenAt(null, at(6, 19))).toBeNull();
    expect(isOpenAt({ periods: null }, at(6, 19))).toBeNull();
    expect(isOpenAt(hours(), at(6, 19))).toBe(false);
    expect(isOpenAt({ closedForGood: true, periods: [period(6, 17, 6, 21)] }, at(6, 19))).toBe(false);
    expect(isOpenAt({ closedForNow: true, periods: null }, at(6, 19))).toBe(false);
  });

  it("reads an instant on the restaurant's own clock", () => {
    const lunch = { ...hours(period(3, 11, 3, 14)), timeZone: "America/Chicago" };
    // 18:00 UTC on Wednesday, November 11 is noon in Chicago.
    expect(isOpenAt(lunch, { instant: Date.UTC(2026, 10, 11, 18) })).toBe(true);
    expect(isOpenAt(lunch, { instant: Date.UTC(2026, 10, 11, 21) })).toBe(false);
    expect(isOpenAt({ ...lunch, timeZone: null, utcOffsetMinutes: -360 }, { instant: Date.UTC(2026, 10, 11, 18) })).toBe(true);
  });

  it("reads the phone's clock when Google gave the place no zone", () => {
    const dinner = hours(period(3, 17, 3, 21));
    expect(isOpenAt(dinner, { instant: new Date(2026, 10, 11, 18).getTime() })).toBe(true);
    expect(isOpenAt(dinner, { instant: new Date(2026, 10, 11, 22).getTime() })).toBe(false);
  });

  it("decides tonight on the restaurant's clock, not the phone's", () => {
    const chicago = { ...hours(period(3, 17, 3, 20)), timeZone: "America/Chicago" };
    // 6:30 PM in Chicago: dinner is still ahead, and the kitchen is open at 7.
    expect(isOpenAt(chicago, { tonight: Date.UTC(2026, 10, 12, 0, 30) })).toBe(true);
    // 8:30 PM in Chicago, whatever the phone says: tonight is now, and it shut at 8.
    expect(isOpenAt(chicago, { tonight: Date.UTC(2026, 10, 12, 2, 30) })).toBe(false);
    // Lunch only: open now at noon, closed by dinner.
    const lunch = { ...hours(period(3, 11, 3, 14)), timeZone: "America/Chicago" };
    expect(isOpenAt(lunch, { tonight: Date.UTC(2026, 10, 11, 18) })).toBe(false);
  });
});

describe("the open choice", () => {
  it("offers today and the six days after it", () => {
    expect(getPickDays(NOW).map((day) => day.label)).toEqual(["Today", "Tomorrow", "Fri", "Sat", "Sun", "Mon", "Tue"]);
    expect(getDefaultPick(NOW)).toEqual({ mode: "pick", day: "2026-11-12", minutes: 19 * 60 });
  });

  it("drops a picked day that has passed or cannot be read", () => {
    expect(normalizeOpenChoice({ mode: "pick", day: "2026-11-10", minutes: 1140 }, NOW)).toBe(ANY_TIME);
    expect(normalizeOpenChoice({ mode: "pick", day: "2026-11-14", minutes: "soon" }, NOW)).toBe(ANY_TIME);
    expect(normalizeOpenChoice({ mode: "later" }, NOW)).toBe(ANY_TIME);
    expect(normalizeOpenChoice(null, NOW)).toBe(ANY_TIME);
  });

  it("resolves each choice to the moment it asks about", () => {
    expect(resolveOpenMoment(ANY_TIME, NOW)).toBeNull();
    expect(resolveOpenMoment({ mode: "now" }, NOW)).toEqual({ instant: NOW });
    expect(resolveOpenMoment({ mode: "tonight" }, NOW)).toEqual({ tonight: NOW });
    expect(resolveOpenMoment({ mode: "pick", day: "2026-11-14", minutes: 750 }, NOW)).toEqual({ wall: { weekday: 6, minutes: 750 } });
  });

  it("names the choice for the readouts", () => {
    expect(describeOpenChoice(ANY_TIME, NOW)).toBe("");
    expect(describeOpenChoice({ mode: "now" }, NOW)).toBe("now");
    expect(describeOpenChoice({ mode: "tonight" }, NOW)).toBe("tonight");
    expect(describeOpenChoice({ mode: "pick", day: "2026-11-14", minutes: 1140 }, NOW)).toBe("Sat at 7 PM");
    expect(describeOpenChoice({ mode: "pick", day: "2026-11-12", minutes: 750 }, NOW)).toBe("tomorrow at 12:30 PM");
  });

  it("ends a planned draw at the midnight that closes its day", () => {
    expect(getPlannedDayEnd(ANY_TIME, NOW)).toBeNull();
    expect(getPlannedDayEnd({ mode: "now" }, NOW)).toBeNull();
    expect(getPlannedDayEnd({ mode: "tonight" }, NOW)).toBe(new Date(2026, 10, 12).getTime());
    expect(getPlannedDayEnd({ mode: "pick", day: "2026-11-14", minutes: 1140 }, NOW)).toBe(new Date(2026, 10, 15).getTime());
    // A day that has passed is no plan at all.
    expect(getPlannedDayEnd({ mode: "pick", day: "2026-11-10", minutes: 1140 }, NOW)).toBeNull();
  });
});

describe("sorting a bowl by its hours", () => {
  const slips = [
    { id: 1, place_id: "open" },
    { id: 2, place_id: "closed" },
    { id: 3, place_id: "silent" },
    { id: 4, place_id: null },
    { id: 5, place_id: "unasked" },
  ];
  const hoursByPlaceId = {
    open: hours(period(6, 17, 6, 21)),
    closed: hours(period(6, 7, 6, 14)),
    silent: null,
  };

  it("leaves out only the places known to be closed", () => {
    const sorted = sortSlipsByOpen(slips, hoursByPlaceId, at(6, 19));
    expect(sorted.open.map((slip) => slip.id)).toEqual([1]);
    expect(sorted.closed.map((slip) => slip.id)).toEqual([2]);
    expect(sorted.unknown.map((slip) => slip.id)).toEqual([3, 4, 5]);

    const closedPlaceIds = getClosedPlaceIds(slips, hoursByPlaceId, at(6, 19));
    expect(closedPlaceIds).toEqual(["closed"]);
    expect(filterRestaurantSlips(slips, { excluded: [], closedPlaceIds }).map((slip) => slip.id)).toEqual([1, 3, 4, 5]);
  });

  it("leaves nothing out when no time is asked about", () => {
    expect(getClosedPlaceIds(slips, hoursByPlaceId, null)).toEqual([]);
  });
});
